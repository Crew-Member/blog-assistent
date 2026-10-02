import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";
import fastifyCookie from "@fastify/cookie";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { AiService } from "./ai/types.js";
import type { Config } from "./config.js";
import type { FileStorage } from "./lib/storage.js";
import { extractDocument, detectKind } from "./lib/extract.js";
import { sanitizePostHtml } from "./lib/html.js";
import { seoChecks } from "./lib/seo.js";
import { slugify } from "./lib/slug.js";
import { fetchWordPressPosts } from "./lib/wordpress.js";

export interface ServerDeps {
  config: Config;
  prisma: PrismaClient;
  storage: FileStorage;
  ai: AiService;
  /** Fuer Tests austauschbar (WordPress-Import). */
  fetcher?: typeof fetch;
  /** Verzeichnis mit dem gebauten Frontend (optional). */
  webDir?: string;
}

const MAX_FILE_BYTES = 25 * 1024 * 1024;
// Claude akzeptiert max. 32 MB pro Request (Base64 blaeht um ~33 % auf) -> PDFs/Bilder insgesamt begrenzen.
const MAX_BINARY_TOTAL_BYTES = 20 * 1024 * 1024;
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 14;

const siteSchema = z.object({
  name: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().max(300).default(""),
  language: z.string().trim().min(2).max(10).default("de"),
  audience: z.string().trim().max(2000).default(""),
  tone: z.string().trim().max(2000).default(""),
  styleGuide: z.string().max(20000).default(""),
  disclaimer: z.string().max(4000).default(""),
});

const styleSampleSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().max(500).default(""),
  text: z.string().trim().min(200, "Beispieltext ist zu kurz (mindestens 200 Zeichen)").max(60000),
});
const MAX_STYLE_SAMPLES = 20;

const postUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  slug: z.string().trim().max(120).optional(),
  metaDescription: z.string().trim().max(300).optional(),
  focusKeyword: z.string().trim().max(120).optional(),
  excerpt: z.string().trim().max(2000).optional(),
  contentHtml: z.string().max(200000).optional(),
});

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function buildServer({ config, prisma, storage, ai, fetcher, webDir }: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy: true, bodyLimit: 2 * 1024 * 1024 });

  app.register(fastifyCookie, { secret: config.SESSION_SECRET });
  app.register(fastifyMultipart, { limits: { fileSize: MAX_FILE_BYTES, files: 15, fields: 10 } });

  // --- Auth ---------------------------------------------------------------
  const attempts = new Map<string, { count: number; resetAt: number }>();

  const isAuthenticated = (request: { cookies: Record<string, string | undefined>; unsignCookie: (v: string) => { valid: boolean; value: string | null } }) => {
    const raw = request.cookies["session"];
    if (!raw) return false;
    const result = request.unsignCookie(raw);
    return result.valid && result.value === "ok";
  };

  app.addHook("onRequest", async (request, reply) => {
    const url = request.url.split("?")[0] ?? "";
    if (!url.startsWith("/api/") || url === "/api/health" || url === "/api/auth/login") return;
    if (!isAuthenticated(request)) return reply.code(401).send({ error: "Nicht angemeldet" });
  });

  app.get("/api/health", async () => ({ ok: true }));

  app.post("/api/auth/login", async (request, reply) => {
    const now = Date.now();
    const entry = attempts.get(request.ip);
    if (entry && entry.resetAt > now && entry.count >= 10) {
      return reply.code(429).send({ error: "Zu viele Versuche. Bitte spaeter erneut versuchen." });
    }
    const body = z.object({ password: z.string() }).safeParse(request.body);
    if (!body.success || !safeEqual(body.data.password, config.ADMIN_PASSWORD)) {
      attempts.set(request.ip, { count: (entry && entry.resetAt > now ? entry.count : 0) + 1, resetAt: entry && entry.resetAt > now ? entry.resetAt : now + 15 * 60_000 });
      return reply.code(401).send({ error: "Falsches Passwort" });
    }
    attempts.delete(request.ip);
    reply.setCookie("session", "ok", { signed: true, httpOnly: true, sameSite: "strict", secure: "auto", path: "/", maxAge: SESSION_MAX_AGE_S });
    return { ok: true };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async () => ({ ok: true }));

  // --- Websites -----------------------------------------------------------
  app.get("/api/sites", async () => prisma.site.findMany({ orderBy: { name: "asc" } }));

  app.post("/api/sites", async (request, reply) => {
    const body = siteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungueltige Eingabe", details: body.error.flatten() });
    return reply.code(201).send(await prisma.site.create({ data: body.data }));
  });

  app.put<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const body = siteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungueltige Eingabe", details: body.error.flatten() });
    const exists = await prisma.site.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: "Website nicht gefunden" });
    return prisma.site.update({ where: { id: request.params.id }, data: body.data });
  });

  app.delete<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const { count } = await prisma.site.deleteMany({ where: { id: request.params.id } });
    return count ? reply.code(204).send() : reply.code(404).send({ error: "Website nicht gefunden" });
  });

  // --- Stilvorlagen ---------------------------------------------------------
  app.get<{ Params: { id: string } }>("/api/sites/:id/style-samples", async (request) =>
    prisma.styleSample.findMany({ where: { siteId: request.params.id }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, url: true, createdAt: true, text: true } }),
  );

  app.post<{ Params: { id: string } }>("/api/sites/:id/style-samples", async (request, reply) => {
    const body = styleSampleSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0]?.message ?? "Ungültige Eingabe" });
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { id: true, _count: { select: { styleSamples: true } } } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (site._count.styleSamples >= MAX_STYLE_SAMPLES) return reply.code(409).send({ error: `Höchstens ${MAX_STYLE_SAMPLES} Beispielbeiträge pro Website` });
    return reply.code(201).send(await prisma.styleSample.create({ data: { ...body.data, siteId: site.id } }));
  });

  app.post<{ Params: { id: string } }>("/api/sites/:id/style-samples/import-wordpress", async (request, reply) => {
    const parsed = z.object({ count: z.number().int().min(1).max(10).default(3) }).safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "Anzahl muss zwischen 1 und 10 liegen" });
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { id: true, baseUrl: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (!site.baseUrl) return reply.code(400).send({ error: "Für die Website ist keine Adresse hinterlegt" });
    let posts;
    try {
      posts = await fetchWordPressPosts(site.baseUrl, parsed.data.count, fetcher);
    } catch (error) {
      return reply.code(502).send({ error: `Import nicht möglich: ${error instanceof Error ? error.message : String(error)}` });
    }
    const existing = new Set((await prisma.styleSample.findMany({ where: { siteId: site.id }, select: { url: true } })).map((s) => s.url));
    const fresh = posts.filter((p) => p.text.length >= 200 && !(p.url && existing.has(p.url)));
    await prisma.styleSample.createMany({ data: fresh.map((p) => ({ siteId: site.id, title: p.title, url: p.url, text: p.text.slice(0, 60000) })) });
    return { imported: fresh.length, skipped: posts.length - fresh.length };
  });

  app.delete<{ Params: { id: string } }>("/api/style-samples/:id", async (request, reply) => {
    const { count } = await prisma.styleSample.deleteMany({ where: { id: request.params.id } });
    return count ? reply.code(204).send() : reply.code(404).send({ error: "Beispielbeitrag nicht gefunden" });
  });

  // Schlaegt Tonalitaet und Leitfaden aus den Beispielbeitraegen vor - wird nicht gespeichert, der Nutzer uebernimmt es im Formular.
  app.post<{ Params: { id: string } }>("/api/sites/:id/derive-style", async (request, reply) => {
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, include: { styleSamples: { orderBy: { createdAt: "desc" }, take: 5 } } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (site.styleSamples.length === 0) return reply.code(400).send({ error: "Bitte zuerst Beispielbeiträge hinzufügen" });
    try {
      return await ai.deriveStyle({
        site: { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide },
        samples: site.styleSamples.map((s) => ({ title: s.title, text: s.text })),
      });
    } catch (error) {
      return reply.code(502).send({ error: `Stilableitung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // --- Uploads / Submissions ---------------------------------------------
  app.get("/api/submissions", async () =>
    prisma.submission.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { site: { select: { id: true, name: true } }, _count: { select: { documents: true, topics: true } } },
    }),
  );

  app.post<{ Params: { siteId: string } }>("/api/sites/:siteId/submissions", async (request, reply) => {
    const site = await prisma.site.findUnique({ where: { id: request.params.siteId }, select: { id: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });

    let note = "";
    const files: { filename: string; mimeType: string; data: Buffer }[] = [];
    try {
      for await (const part of request.parts()) {
        if (part.type === "field") {
          if (part.fieldname === "note" && typeof part.value === "string") note = part.value.slice(0, 4000);
        } else {
          files.push({ filename: part.filename, mimeType: part.mimetype, data: await part.toBuffer() });
        }
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "FST_REQ_FILE_TOO_LARGE") return reply.code(413).send({ error: "Datei ist groesser als 25 MB" });
      throw error;
    }
    if (files.length === 0) return reply.code(400).send({ error: "Keine Datei hochgeladen" });

    const unsupported = files.filter((f) => detectKind(f.filename, f.mimeType).kind === "unsupported").map((f) => f.filename);
    if (unsupported.length) {
      return reply.code(400).send({
        error: `Dateityp nicht unterstuetzt: ${unsupported.join(", ")}. Erlaubt: PDF, E-Mail (.eml, .msg), Word (.docx), Text/Markdown/HTML, Bilder (PNG/JPG/GIF/WebP).`,
      });
    }

    const extracted: { file: { filename: string; data: Buffer }; doc: Awaited<ReturnType<typeof extractDocument>> }[] = [];
    let binaryBytes = 0;
    const add = (file: { filename: string; data: Buffer }, doc: Awaited<ReturnType<typeof extractDocument>>) => {
      if (doc.kind !== "text") binaryBytes += file.data.length;
      extracted.push({ file, doc });
    };
    for (const file of files) {
      let doc;
      try {
        doc = await extractDocument(file.filename, file.mimeType, file.data);
      } catch (error) {
        return reply.code(400).send({ error: `${file.filename} konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}` });
      }
      add(file, doc);
      // PDF-/Word-Anhaenge von Mails (z. B. das Urteil im Newsletter) als eigene Unterlagen aufnehmen.
      for (const att of doc.attachments ?? []) {
        try {
          add({ filename: `${file.filename} › ${att.filename}`, data: att.data }, await extractDocument(att.filename, att.mimeType, att.data));
        } catch {
          // nicht lesbarer Anhang: ignorieren, die Mail selbst bleibt erhalten
        }
      }
    }
    if (extracted.length > 25) return reply.code(400).send({ error: "Zu viele Dateien (inklusive Mail-Anhängen höchstens 25)" });
    if (binaryBytes > MAX_BINARY_TOTAL_BYTES) {
      return reply.code(413).send({ error: "PDFs und Bilder zusammen duerfen 20 MB nicht uebersteigen" });
    }

    const stored = [];
    for (const { file, doc } of extracted) {
      stored.push({
        filename: file.filename.slice(0, 255),
        mimeType: doc.mimeType,
        sizeBytes: file.data.length,
        storageKey: await storage.save(file.data),
        extractedText: doc.kind === "text" ? (doc.text ?? "") : null,
      });
    }

    const submission = await prisma.submission.create({
      data: { siteId: site.id, note, documents: { create: stored } },
      include: { documents: { select: { id: true, filename: true, mimeType: true, sizeBytes: true } } },
    });
    return reply.code(201).send(submission);
  });

  app.get<{ Params: { id: string } }>("/api/submissions/:id", async (request, reply) => {
    const submission = await prisma.submission.findUnique({
      where: { id: request.params.id },
      include: {
        site: { select: { id: true, name: true } },
        documents: { select: { id: true, filename: true, mimeType: true, sizeBytes: true }, orderBy: { createdAt: "asc" } },
        topics: { orderBy: { createdAt: "asc" }, include: { posts: { select: { id: true, status: true, title: true }, orderBy: { createdAt: "desc" } } } },
      },
    });
    return submission ?? reply.code(404).send({ error: "Upload nicht gefunden" });
  });

  app.post<{ Params: { id: string } }>("/api/submissions/:id/reanalyze", async (request, reply) => {
    const { count } = await prisma.submission.updateMany({
      where: { id: request.params.id, status: { in: ["ANALYZED", "FAILED"] } },
      data: { status: "UPLOADED", error: null },
    });
    return count ? { ok: true } : reply.code(409).send({ error: "Analyse laeuft bereits oder Upload nicht gefunden" });
  });

  app.delete<{ Params: { id: string } }>("/api/submissions/:id", async (request, reply) => {
    const { count } = await prisma.submission.deleteMany({ where: { id: request.params.id } });
    return count ? reply.code(204).send() : reply.code(404).send({ error: "Upload nicht gefunden" });
  });

  // --- Themen -> Beitraege ----------------------------------------------
  app.post<{ Params: { id: string } }>("/api/topics/:id/posts", async (request, reply) => {
    const topic = await prisma.topic.findUnique({ where: { id: request.params.id }, include: { submission: { select: { siteId: true } } } });
    if (!topic) return reply.code(404).send({ error: "Thema nicht gefunden" });
    const post = await prisma.post.create({ data: { siteId: topic.submission.siteId, topicId: topic.id } });
    return reply.code(201).send(post);
  });

  app.get("/api/posts", async () =>
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, status: true, title: true, error: true, createdAt: true, site: { select: { id: true, name: true } }, topic: { select: { submissionId: true } } },
    }),
  );

  app.get<{ Params: { id: string } }>("/api/posts/:id", async (request, reply) => {
    const post = await prisma.post.findUnique({
      where: { id: request.params.id },
      include: { site: { select: { id: true, name: true, baseUrl: true } }, topic: { select: { id: true, title: true, submissionId: true } } },
    });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    const seo = post.status === "DRAFT_READY"
      ? seoChecks({ title: post.title ?? "", slug: post.slug ?? "", metaDescription: post.metaDescription ?? "", focusKeyword: post.focusKeyword ?? "", contentHtml: post.contentHtml ?? "" })
      : [];
    return { ...post, seoChecks: seo };
  });

  app.put<{ Params: { id: string } }>("/api/posts/:id", async (request, reply) => {
    const body = postUpdateSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungueltige Eingabe", details: body.error.flatten() });
    const { slug, contentHtml, ...rest } = body.data;
    const existing = await prisma.post.findUnique({ where: { id: request.params.id }, select: { status: true } });
    if (!existing) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    if (existing.status !== "DRAFT_READY") return reply.code(409).send({ error: "Beitrag kann nur im Status Entwurf bearbeitet werden" });
    return prisma.post.update({
      where: { id: request.params.id },
      data: { ...rest, ...(slug !== undefined && { slug: slugify(slug) }), ...(contentHtml !== undefined && { contentHtml: sanitizePostHtml(contentHtml) }) },
    });
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/regenerate", async (request, reply) => {
    const { count } = await prisma.post.updateMany({
      where: { id: request.params.id, status: { in: ["DRAFT_READY", "FAILED"] } },
      data: { status: "QUEUED", error: null },
    });
    return count ? { ok: true } : reply.code(409).send({ error: "Beitrag wird gerade erstellt oder wurde nicht gefunden" });
  });

  app.delete<{ Params: { id: string } }>("/api/posts/:id", async (request, reply) => {
    const { count } = await prisma.post.deleteMany({ where: { id: request.params.id } });
    return count ? reply.code(204).send() : reply.code(404).send({ error: "Beitrag nicht gefunden" });
  });

  // --- Frontend -----------------------------------------------------------
  if (webDir && existsSync(webDir)) {
    app.register(fastifyStatic, { root: path.resolve(webDir) });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Nicht gefunden" });
      return reply.sendFile("index.html");
    });
  }

  return app;
}
