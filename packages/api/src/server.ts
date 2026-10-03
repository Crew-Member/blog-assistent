import { explainAiError } from "./ai/errors.js";
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
import { detectKind, extractDocument, stripHtml } from "./lib/extract.js";
import { applyLinkPolicy, sanitizePostHtml, unwrapLinksNotIn } from "./lib/html.js";
import { seoChecks } from "./lib/seo.js";
import { slugify } from "./lib/slug.js";
import { decryptSecret, encryptSecret } from "./lib/secrets.js";
import { fetchSitePost, fetchSitePosts, fetchWordPressPosts } from "./lib/wordpress.js";
import { WordPressClient, WordPressError, type WpDraftInput } from "./lib/wp-client.js";
import { markAsAiGenerated, sniffImageType } from "./lib/png.js";
import type { ImageProvider } from "./image/provider.js";
import { finalCaption } from "./pipeline.js";

export interface ServerDeps {
  config: Config;
  prisma: PrismaClient;
  storage: FileStorage;
  ai: AiService;
  /** Optional: Bildgenerierung; ohne gibt es nur Prompts, Stockfoto-Suche und Upload. */
  images?: ImageProvider;
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
  labelAiImages: z.boolean().default(true),
  wpUsername: z.string().trim().max(120).default(""),
  // Leer/fehlend = vorhandenes Passwort behalten
  wpAppPassword: z.string().max(200).optional(),
  clearWpPassword: z.boolean().optional(),
});

const wpPublishSchema = z.object({
  categoryIds: z.array(z.number().int().positive()).max(10).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  // Vom Nutzer bestaetigte NEUE Kategorien (Namen) - werden in WordPress angelegt
  newCategories: z.array(z.string().trim().min(1).max(60)).max(3).default([]),
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

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function buildServer({ config, prisma, storage, ai, images, fetcher, webDir }: ServerDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", trustProxy: true, bodyLimit: 2 * 1024 * 1024 });

  /** Gibt nie das (verschluesselte) WordPress-Passwort heraus, nur ob eines gespeichert ist. */
  const publicSite = <T extends { wpAppPassword: string }>(site: T) => {
    const { wpAppPassword, ...rest } = site;
    return { ...rest, hasWpPassword: wpAppPassword !== "" };
  };

  const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
  const sniffImage = sniffImageType;
  const publicImage = (i: { id: string; status: string; origin: string; aiGenerated: boolean; error: string | null; style: string; prompt: string; altText: string; caption: string; searchQuery: string; sourceNote: string; storageKey: string | null; wpMediaId: number | null; updatedAt: Date }) => ({
    id: i.id,
    status: i.status,
    origin: i.origin,
    aiGenerated: i.aiGenerated,
    error: i.error,
    style: i.style,
    prompt: i.prompt,
    altText: i.altText,
    caption: i.caption,
    searchQuery: i.searchQuery,
    sourceNote: i.sourceNote,
    hasFile: i.storageKey !== null,
    inWordPress: i.wpMediaId !== null,
    updatedAt: i.updatedAt,
  });

  const wpClientFor = async (siteId: string) => {
    const site = await prisma.site.findUnique({ where: { id: siteId } });
    if (!site) throw new HttpError(404, "Website nicht gefunden");
    if (!site.baseUrl || !site.wpUsername || !site.wpAppPassword) {
      throw new HttpError(400, "Der WordPress-Zugang ist für diese Website nicht eingerichtet (Websites → Bearbeiten: Adresse, Benutzername und Anwendungspasswort).");
    }
    const password = decryptSecret(site.wpAppPassword, config.SESSION_SECRET);
    if (!password) throw new HttpError(400, "Das gespeicherte Anwendungspasswort ist nicht lesbar (SESSION_SECRET geändert?). Bitte unter Websites → Bearbeiten neu eingeben.");
    try {
      return { site, client: new WordPressClient(site.baseUrl, site.wpUsername, password, fetcher) };
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error));
    }
  };

  app.register(fastifyCookie, { secret: config.SESSION_SECRET });
  app.register(fastifyMultipart, { limits: { fileSize: MAX_FILE_BYTES, files: 15, fields: 10 } });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.message });
    if (error instanceof WordPressError) return reply.code(error.status === 409 ? 409 : 502).send({ error: error.message });
    reply.send(error);
  });

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
  app.get("/api/sites", async () => (await prisma.site.findMany({ orderBy: { name: "asc" } })).map(publicSite));

  app.post("/api/sites", async (request, reply) => {
    const body = siteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungültige Eingabe", details: body.error.flatten() });
    const { wpAppPassword, clearWpPassword: _clear, ...data } = body.data;
    const created = await prisma.site.create({ data: { ...data, wpAppPassword: encryptSecret(wpAppPassword?.trim() ?? "", config.SESSION_SECRET) } });
    return reply.code(201).send(publicSite(created));
  });

  app.put<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const body = siteSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungültige Eingabe", details: body.error.flatten() });
    const exists = await prisma.site.findUnique({ where: { id: request.params.id }, select: { id: true } });
    if (!exists) return reply.code(404).send({ error: "Website nicht gefunden" });
    const { wpAppPassword, clearWpPassword, ...data } = body.data;
    const newPassword = wpAppPassword?.trim();
    return publicSite(
      await prisma.site.update({
        where: { id: request.params.id },
        data: { ...data, ...(clearWpPassword ? { wpAppPassword: "" } : newPassword ? { wpAppPassword: encryptSecret(newPassword, config.SESSION_SECRET) } : {}) },
      }),
    );
  });

  app.delete<{ Params: { id: string } }>("/api/sites/:id", async (request, reply) => {
    const { count } = await prisma.site.deleteMany({ where: { id: request.params.id } });
    return count ? reply.code(204).send() : reply.code(404).send({ error: "Website nicht gefunden" });
  });

  // --- WordPress-Anbindung ---------------------------------------------------
  app.post<{ Params: { id: string } }>("/api/sites/:id/wordpress/test", async (request) => {
    const { client } = await wpClientFor(request.params.id);
    const me = await client.me();
    const [namespaces, categories] = await Promise.all([client.namespaces().catch(() => [] as string[]), client.categories()]);
    return { ok: true, user: me.name, canPublish: me.canPublish, rankMath: namespaces.includes("rankmath/v1"), categories: categories.length };
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/wordpress/prepare", async (request) => {
    const post = await prisma.post.findUnique({ where: { id: request.params.id }, include: { site: true } });
    if (!post) throw new HttpError(404, "Beitrag nicht gefunden");
    if (post.status !== "DRAFT_READY") throw new HttpError(409, "Nur fertige Entwürfe können an WordPress gesendet werden.");
    const { client } = await wpClientFor(post.siteId);
    const categories = await client.categories();

    let suggested: number[] = [];
    let newSuggestions: string[] = [];
    let suggestionError: string | undefined;
    try {
      const suggestion = await ai.suggestCategories({
        site: { name: post.site.name, language: post.site.language, audience: post.site.audience, tone: post.site.tone, styleGuide: post.site.styleGuide },
        post: { title: post.title ?? "", excerpt: post.excerpt ?? "", focusKeyword: post.focusKeyword ?? "", text: stripHtml(post.contentHtml ?? "") },
        categories: categories.map((c) => ({ id: c.id, name: c.name })),
      });
      suggested = suggestion.categoryIds;
      newSuggestions = suggestion.newCategories;
    } catch (error) {
      suggestionError = `Kategorie-Vorschlag nicht möglich: ${error instanceof Error ? error.message : String(error)}`;
    }
    const previous = Array.isArray(post.wpCategoryIds) ? (post.wpCategoryIds as number[]) : [];
    const secondary = Array.isArray(post.secondaryKeywords) ? (post.secondaryKeywords as string[]) : [];
    return {
      categories: categories.map((c) => ({ id: c.id, name: c.name, parent: c.parent, count: c.count })),
      suggested: post.wpPostId && previous.length ? previous : suggested,
      newSuggestions,
      suggestionError,
      tags: secondary.slice(0, 5),
      existing: post.wpPostId ? { wpPostId: post.wpPostId, editUrl: post.wpEditUrl, link: post.wpLink } : null,
    };
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/wordpress/publish", async (request) => {
    const body = wpPublishSchema.safeParse(request.body ?? {});
    if (!body.success) throw new HttpError(400, "Ungültige Auswahl von Kategorien oder Schlagwörtern");
    const post = await prisma.post.findUnique({ where: { id: request.params.id } });
    if (!post) throw new HttpError(404, "Beitrag nicht gefunden");
    if (post.status !== "DRAFT_READY" || !post.title || !post.contentHtml) throw new HttpError(409, "Nur fertige Entwürfe können an WordPress gesendet werden.");
    const { client, site } = await wpClientFor(post.siteId);

    const existingCategories = body.data.newCategories.length ? await client.categories() : [];
    const createdCategoryIds = await client.ensureCategories(body.data.newCategories, existingCategories);
    const categoryIds = [...new Set([...body.data.categoryIds, ...createdCategoryIds])];

    const draft: WpDraftInput = {
      title: post.title,
      content: post.contentHtml,
      slug: post.slug ?? undefined,
      excerpt: post.excerpt ?? undefined,
      categories: categoryIds,
      tags: await client.ensureTags(body.data.tags),
    };
    const meta = { description: post.metaDescription ?? "", focusKeyword: post.focusKeyword ?? "" };

    // Beitragsbild: Fehler hier verhindern den Entwurf nicht, werden aber gemeldet.
    let imageResult: { status: "set" | "none" | "failed"; message: string } = { status: "none", message: "Kein Beitragsbild vorhanden." };
    const image = await prisma.postImage.findUnique({ where: { postId: post.id } });
    if (image && image.status === "READY" && image.storageKey) {
      try {
        const ext = image.mimeType === "image/jpeg" ? "jpg" : image.mimeType === "image/webp" ? "webp" : "png";
        const mediaId = await client.syncMedia({
          existingId: image.wpMediaId,
          data: await storage.load(image.storageKey),
          mimeType: image.mimeType ?? "image/png",
          filename: `${post.slug || "beitragsbild"}.${ext}`,
          alt: image.altText,
          caption: finalCaption(image.caption, image.aiGenerated, site.labelAiImages),
          title: post.title,
          description: image.sourceNote || (image.aiGenerated ? "KI-generiertes Bild" : ""),
        });
        draft.featuredMedia = mediaId;
        await prisma.postImage.update({ where: { postId: post.id }, data: { wpMediaId: mediaId } });
        imageResult = { status: "set", message: image.altText.trim() ? "Beitragsbild übertragen." : "Beitragsbild übertragen – der Alt-Text fehlt noch (Barrierefreiheit)." };
      } catch (error) {
        imageResult = { status: "failed", message: `Das Beitragsbild konnte nicht übertragen werden: ${error instanceof Error ? error.message : String(error)}` };
      }
    }

    let result;
    let updated = false;
    if (post.wpPostId) {
      try {
        result = await client.updateDraft(post.wpPostId, draft, meta);
        updated = true;
      } catch (error) {
        // Wurde der Entwurf in WordPress geloescht, einen neuen anlegen; sonst (z. B. schon veroeffentlicht) abbrechen.
        if (!(error instanceof WordPressError && error.status === 404)) throw error;
      }
    }
    result ??= await client.createDraft(draft, meta);

    const namespaces = await client.namespaces().catch(() => [] as string[]);
    const seo = await client.setRankMath(result.id, meta, namespaces);
    await prisma.post.update({
      where: { id: post.id },
      data: { wpPostId: result.id, wpEditUrl: result.editUrl, wpLink: result.link, wpCategoryIds: categoryIds, wpSeo: seo, wpPushedAt: new Date() },
    });
    return { wpPostId: result.id, editUrl: result.editUrl, link: result.link, seo, updated, image: imageResult };
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

  // --- Bestehende Beitraege ueberarbeiten --------------------------------
  // Liste der veroeffentlichten Beitraege einer Website (oeffentliche REST-API), optional mit Suche.
  app.get<{ Params: { id: string }; Querystring: { search?: string } }>("/api/sites/:id/wp-posts", async (request, reply) => {
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { baseUrl: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (!site.baseUrl) return reply.code(400).send({ error: "Für die Website ist keine Adresse hinterlegt" });
    try {
      return await fetchSitePosts(site.baseUrl, { search: request.query.search, count: 20 }, fetcher);
    } catch (error) {
      return reply.code(502).send({ error: `Beiträge konnten nicht geladen werden: ${error instanceof Error ? error.message : String(error)}` });
    }
  });

  // Legt eine Ueberarbeitung als NEUEN Beitragsentwurf an; der bestehende Beitrag in WordPress bleibt unveraendert.
  app.post<{ Params: { id: string } }>("/api/sites/:id/revisions", async (request, reply) => {
    const body = z.object({ wpPostId: z.number().int().positive(), instructions: z.string().max(3000).default("") }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungültige Eingabe" });
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { id: true, baseUrl: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (!site.baseUrl) return reply.code(400).send({ error: "Für die Website ist keine Adresse hinterlegt" });
    let original;
    try {
      original = await fetchSitePost(site.baseUrl, body.data.wpPostId, fetcher);
    } catch (error) {
      return reply.code(502).send({ error: `Beitrag konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)}` });
    }
    const html = sanitizePostHtml(original.html);
    const text = stripHtml(original.html);
    const post = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.create({ data: { siteId: site.id, note: `Überarbeitung: ${original.title}`.slice(0, 300), status: "ANALYZED" } });
      const topic = await tx.topic.create({
        data: {
          submissionId: submission.id,
          title: original.title,
          angle: body.data.instructions.trim() || "Bestehenden Beitrag auf Aktualität, Verständlichkeit und SEO prüfen und überarbeiten",
          summary: `Überarbeitung des bestehenden Beitrags „${original.title}“ (${original.url}).\n\n${text.slice(0, 4000)}`,
          keyFacts: [],
          keywords: [],
        },
      });
      return tx.post.create({
        data: {
          siteId: site.id,
          topicId: topic.id,
          revisionSource: { wpPostId: original.id, title: original.title, url: original.url, html, instructions: body.data.instructions.trim() },
        },
      });
    });
    return reply.code(201).send(post);
  });

  // --- Text nachschaerfen (KI nach Anweisung) ---------------------------------
  const FOOTER_RE = /\n?<p><em>Stand:[\s\S]*?<\/em><\/p>\s*$/;

  app.post<{ Params: { id: string } }>("/api/posts/:id/refine", async (request, reply) => {
    const body = z.object({ instruction: z.string().trim().min(3).max(1500) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Bitte kurz beschreiben, was geändert werden soll (mindestens 3 Zeichen)." });
    const post = await prisma.post.findUnique({ where: { id: request.params.id }, include: { site: true } });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    if (post.status !== "DRAFT_READY" || !post.contentHtml) return reply.code(409).send({ error: "Der Entwurf ist noch nicht fertig." });
    const footer = post.contentHtml.match(FOOTER_RE)?.[0] ?? "";
    const current = post.contentHtml.replace(FOOTER_RE, "");
    let result;
    try {
      result = await ai.refine({
        site: { name: post.site.name, language: post.site.language, audience: post.site.audience, tone: post.site.tone, styleGuide: post.site.styleGuide },
        title: post.title ?? "",
        focusKeyword: post.focusKeyword ?? "",
        contentHtml: current,
        instruction: body.data.instruction,
      });
    } catch (error) {
      return reply.code(502).send({ error: `Überarbeitung nicht möglich: ${explainAiError(error)}` });
    }
    // Es duerfen nur Links bleiben, die schon im Text standen (und die Linkregeln erfuellen).
    const existing = [...current.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
    const html = applyLinkPolicy(unwrapLinksNotIn(sanitizePostHtml(result.contentHtml), existing), post.site.baseUrl, existing);
    if (html.length < current.length * 0.3) return reply.code(422).send({ error: "Die KI hat den Text stark gekürzt – die Änderung wurde nicht übernommen. Bitte die Anweisung genauer fassen." });
    await prisma.post.update({ where: { id: post.id }, data: { previousContentHtml: post.contentHtml, contentHtml: `${html}${footer}` } });
    return { note: result.note };
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/refine/undo", async (request, reply) => {
    const post = await prisma.post.findUnique({ where: { id: request.params.id }, select: { id: true, previousContentHtml: true } });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    if (!post.previousContentHtml) return reply.code(409).send({ error: "Es gibt nichts rückgängig zu machen." });
    await prisma.post.update({ where: { id: post.id }, data: { contentHtml: post.previousContentHtml, previousContentHtml: null } });
    return { ok: true };
  });

  app.get("/api/posts", async () =>
    prisma.post.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, status: true, title: true, error: true, createdAt: true, wpPostId: true, site: { select: { id: true, name: true } }, topic: { select: { submissionId: true } } },
    }),
  );

  app.get<{ Params: { id: string } }>("/api/posts/:id", async (request, reply) => {
    const post = await prisma.post.findUnique({
      where: { id: request.params.id },
      include: { site: { select: { id: true, name: true, baseUrl: true, labelAiImages: true } }, topic: { select: { id: true, title: true, submissionId: true } }, image: true },
    });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    const seo = post.status === "DRAFT_READY"
      ? seoChecks({ title: post.title ?? "", slug: post.slug ?? "", metaDescription: post.metaDescription ?? "", focusKeyword: post.focusKeyword ?? "", contentHtml: post.contentHtml ?? "" })
      : [];
    const { image, revisionSource, previousContentHtml, ...rest } = post;
    const rev = revisionSource as { wpPostId?: number; title?: string; url?: string; instructions?: string } | null;
    const revisionOf = rev ? { wpPostId: rev.wpPostId ?? 0, title: rev.title ?? "", url: rev.url ?? "", instructions: rev.instructions ?? "" } : null;
    return { ...rest, revisionOf, canUndoRefine: Boolean(previousContentHtml), image: image ? publicImage(image) : null, seoChecks: seo };
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

  // --- Beitragsbild ------------------------------------------------------------
  app.get("/api/features", async () => ({ imageGeneration: images?.name ?? null }));

  const loadReadyPost = async (id: string) => {
    const post = await prisma.post.findUnique({ where: { id }, include: { site: true, image: true } });
    if (!post) throw new HttpError(404, "Beitrag nicht gefunden");
    if (post.status !== "DRAFT_READY" || !post.title || !post.contentHtml) throw new HttpError(409, "Das Beitragsbild kann erst für einen fertigen Entwurf geplant werden.");
    return post;
  };

  // Schlaegt Bild-Prompt, Alt-Text und Bildunterschrift vor (ersetzt ein vorhandenes Bild nach Rueckfrage in der Oberflaeche).
  app.post<{ Params: { id: string } }>("/api/posts/:id/image/plan", async (request) => {
    const body = z.object({ style: z.enum(["illustration", "photo"]).optional() }).safeParse(request.body ?? {});
    if (!body.success) throw new HttpError(400, "Ungültiger Stil");
    const post = await loadReadyPost(request.params.id);
    let plan;
    try {
      plan = await ai.planImage({
        site: { name: post.site.name, language: post.site.language, audience: post.site.audience, tone: post.site.tone, styleGuide: post.site.styleGuide },
        post: { title: post.title ?? "", excerpt: post.excerpt ?? "", focusKeyword: post.focusKeyword ?? "", text: stripHtml(post.contentHtml ?? "") },
        style: body.data.style,
      });
    } catch (error) {
      throw new HttpError(502, `Bildvorschlag nicht möglich: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (post.image?.storageKey) await storage.remove(post.image.storageKey);
    const data = { status: "PLANNED" as const, origin: "AI" as const, aiGenerated: true, error: null, style: plan.style, prompt: plan.prompt, altText: plan.altText, caption: plan.caption, searchQuery: plan.searchQuery, sourceNote: "", storageKey: null, mimeType: null, wpMediaId: null };
    return publicImage(await prisma.postImage.upsert({ where: { postId: post.id }, create: { postId: post.id, ...data }, update: data }));
  });

  app.put<{ Params: { id: string } }>("/api/posts/:id/image", async (request) => {
    const body = z
      .object({
        prompt: z.string().max(2000).optional(),
        altText: z.string().max(300).optional(),
        caption: z.string().max(300).optional(),
        style: z.enum(["illustration", "photo"]).optional(),
        sourceNote: z.string().max(500).optional(),
        aiGenerated: z.boolean().optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) throw new HttpError(400, "Ungültige Eingabe");
    const image = await prisma.postImage.findUnique({ where: { postId: request.params.id } });
    if (!image) throw new HttpError(404, "Es gibt noch kein Beitragsbild.");
    // Die KI-Kennzeichnung eines selbst erzeugten Bildes laesst sich nicht abschalten.
    const { aiGenerated, ...rest } = body.data;
    return publicImage(await prisma.postImage.update({ where: { postId: request.params.id }, data: { ...rest, ...(image.origin === "UPLOAD" && aiGenerated !== undefined ? { aiGenerated } : {}) } }));
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/image/generate", async (request) => {
    if (!images) throw new HttpError(400, "Die Bildgenerierung ist nicht eingerichtet (IMAGE_PROVIDER in der .env). Der Prompt lässt sich trotzdem in einem anderen Bilddienst verwenden; das Ergebnis kann hochgeladen werden.");
    const image = await prisma.postImage.findUnique({ where: { postId: request.params.id } });
    if (!image || !image.prompt.trim()) throw new HttpError(409, "Bitte zuerst einen Bildvorschlag erstellen.");
    if (image.status === "QUEUED" || image.status === "GENERATING") throw new HttpError(409, "Das Bild wird bereits erzeugt.");
    return publicImage(await prisma.postImage.update({ where: { postId: request.params.id }, data: { status: "QUEUED", error: null } }));
  });

  app.post<{ Params: { id: string } }>("/api/posts/:id/image/upload", async (request) => {
    const post = await loadReadyPost(request.params.id);
    const fields: Record<string, string> = {};
    let file: Buffer | undefined;
    try {
      for await (const part of request.parts()) {
        if (part.type === "field") {
          if (typeof part.value === "string") fields[part.fieldname] = part.value;
        } else {
          file = await part.toBuffer();
        }
      }
    } catch (error) {
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") throw new HttpError(413, "Das Bild ist zu groß (höchstens 10 MB).");
      throw error;
    }
    if (!file) throw new HttpError(400, "Keine Bilddatei hochgeladen.");
    if (file.length > IMAGE_MAX_BYTES) throw new HttpError(413, "Das Bild ist zu groß (höchstens 10 MB).");
    const mime = sniffImage(file);
    if (!mime) throw new HttpError(400, "Nur PNG-, JPEG- und WebP-Bilder sind erlaubt.");
    const sourceNote = (fields["sourceNote"] ?? "").trim();
    if (sourceNote.length < 3) throw new HttpError(400, "Bitte Quelle und Lizenz des Bildes angeben (z. B. „Pexels, Pexels-Lizenz, Foto: Name“ oder „Eigenes Foto“).");
    const aiGenerated = fields["aiGenerated"] === "true";
    const data = aiGenerated ? markAsAiGenerated(file, "KI-generiert") : file;
    const key = await storage.save(data);
    if (post.image?.storageKey) await storage.remove(post.image.storageKey);
    const values = {
      status: "READY" as const,
      origin: "UPLOAD" as const,
      aiGenerated,
      error: null,
      storageKey: key,
      mimeType: mime,
      wpMediaId: null,
      sourceNote,
      altText: (fields["altText"] ?? post.image?.altText ?? "").slice(0, 300),
      caption: (fields["caption"] ?? post.image?.caption ?? "").slice(0, 300),
    };
    return publicImage(await prisma.postImage.upsert({ where: { postId: post.id }, create: { postId: post.id, prompt: "", ...values }, update: values }));
  });

  app.get<{ Params: { id: string } }>("/api/posts/:id/image/file", async (request, reply) => {
    const image = await prisma.postImage.findUnique({ where: { postId: request.params.id } });
    if (!image?.storageKey || !image.mimeType) return reply.code(404).send({ error: "Kein Bild vorhanden" });
    const data = await storage.load(image.storageKey);
    return reply.header("content-type", image.mimeType).header("cache-control", "private, no-store").header("x-content-type-options", "nosniff").send(data);
  });

  app.delete<{ Params: { id: string } }>("/api/posts/:id/image", async (request, reply) => {
    const image = await prisma.postImage.findUnique({ where: { postId: request.params.id } });
    if (!image) return reply.code(404).send({ error: "Kein Beitragsbild vorhanden" });
    if (image.storageKey) await storage.remove(image.storageKey);
    await prisma.postImage.delete({ where: { postId: request.params.id } });
    return reply.code(204).send();
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
