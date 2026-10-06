import { imageNoticeHtml, withImageNotice } from "./lib/ainotice.js";
import { STEP_LABELS, useUsageContext } from "./lib/usage.js";
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
import { keywordInText, seoChecks } from "./lib/seo.js";
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
  closingHtml: z.string().max(4000).default(""),
  preferredLinks: z.string().max(4000).default(""),
  competitionCheck: z.boolean().default(true),
  aiNoticeText: z.string().trim().max(500).default(""),
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
    useUsageContext({ postId: post.id, siteId: post.siteId });
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

    // Kennzeichnung: Ist das Beitragsbild KI-generiert, steht ein sichtbarer Hinweis vorn im Beitrag (zusaetzlich zur Bildunterschrift).
    // Er wird nur beim Versand eingefuegt und nicht im Entwurf gespeichert - so verschwindet er, wenn das Bild getauscht wird.
    const imageForNotice = await prisma.postImage.findUnique({ where: { postId: post.id } });
    const needsImageNotice = Boolean(site.labelAiImages && imageForNotice && imageForNotice.status === "READY" && imageForNotice.storageKey && imageForNotice.aiGenerated);
    const contentForWp = withImageNotice(post.contentHtml, needsImageNotice ? imageNoticeHtml(site) : "");

    const existingCategories = body.data.newCategories.length ? await client.categories() : [];
    const createdCategoryIds = await client.ensureCategories(body.data.newCategories, existingCategories);
    const categoryIds = [...new Set([...body.data.categoryIds, ...createdCategoryIds])];

    const draft: WpDraftInput = {
      title: post.title,
      content: contentForWp,
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
    return { wpPostId: result.id, editUrl: result.editUrl, link: result.link, seo, updated, image: imageResult, imageNotice: needsImageNotice };
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
    useUsageContext({ siteId: site.id });
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
  async function createRevision(siteId: string, wpPostId: number, instructions: string) {
    const site = await prisma.site.findUnique({ where: { id: siteId }, select: { id: true, baseUrl: true } });
    if (!site) throw new HttpError(404, "Website nicht gefunden");
    if (!site.baseUrl) throw new HttpError(400, "Für die Website ist keine Adresse hinterlegt");
    let original;
    try {
      original = await fetchSitePost(site.baseUrl, wpPostId, fetcher);
    } catch (error) {
      throw new HttpError(502, `Beitrag konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    }
    const html = sanitizePostHtml(original.html);
    const text = stripHtml(original.html);
    return prisma.$transaction(async (tx) => {
      const submission = await tx.submission.create({ data: { siteId: site.id, note: `Überarbeitung: ${original.title}`.slice(0, 300), status: "ANALYZED" } });
      const topic = await tx.topic.create({
        data: {
          submissionId: submission.id,
          title: original.title,
          angle: instructions.trim() || "Bestehenden Beitrag auf Aktualität, Verständlichkeit und SEO prüfen und überarbeiten",
          summary: `Überarbeitung des bestehenden Beitrags „${original.title}“ (${original.url}).\n\n${text.slice(0, 4000)}`,
          keyFacts: [],
          keywords: [],
        },
      });
      return tx.post.create({
        data: {
          siteId: site.id,
          topicId: topic.id,
          revisionSource: { wpPostId: original.id, title: original.title, url: original.url, html, instructions: instructions.trim() },
        },
      });
    });
  }

  app.post<{ Params: { id: string } }>("/api/sites/:id/revisions", async (request, reply) => {
    const body = z.object({ wpPostId: z.number().int().positive(), instructions: z.string().max(3000).default("") }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungültige Eingabe" });
    return reply.code(201).send(await createRevision(request.params.id, body.data.wpPostId, body.data.instructions));
  });

  // --- Aktualisierungsradar ---------------------------------------------------
  app.get<{ Params: { id: string } }>("/api/sites/:id/radar", async (request, reply) => {
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { radarEnabled: true, radarLastRunAt: true, radarRunRequested: true, radarLastError: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    const all = await prisma.radarFinding.findMany({ where: { siteId: request.params.id } });
    const rank: Record<string, number> = { outdated: 0, update_recommended: 1, current: 2 };
    const findings = all
      .filter((f) => f.verdict !== "current" && !f.dismissed)
      .sort((a, b) => (rank[a.verdict] ?? 3) - (rank[b.verdict] ?? 3) || (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0));
    return {
      enabled: site.radarEnabled,
      lastRunAt: site.radarLastRunAt,
      runRequested: site.radarRunRequested,
      lastError: site.radarLastError,
      stats: { checked: all.length, current: all.filter((f) => f.verdict === "current").length, dismissed: all.filter((f) => f.dismissed && f.verdict !== "current").length },
      findings,
    };
  });

  app.put<{ Params: { id: string } }>("/api/sites/:id/radar", async (request, reply) => {
    const body = z.object({ enabled: z.boolean() }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Ungültige Eingabe" });
    const { count } = await prisma.site.updateMany({ where: { id: request.params.id }, data: { radarEnabled: body.data.enabled, ...(body.data.enabled ? {} : { radarRunRequested: false }) } });
    return count ? { enabled: body.data.enabled } : reply.code(404).send({ error: "Website nicht gefunden" });
  });

  app.post<{ Params: { id: string } }>("/api/sites/:id/radar/run", async (request, reply) => {
    const site = await prisma.site.findUnique({ where: { id: request.params.id }, select: { radarEnabled: true, baseUrl: true } });
    if (!site) return reply.code(404).send({ error: "Website nicht gefunden" });
    if (!site.radarEnabled) return reply.code(409).send({ error: "Der Aktualisierungsradar ist für diese Website ausgeschaltet." });
    if (!site.baseUrl) return reply.code(400).send({ error: "Für die Website ist keine Adresse hinterlegt" });
    await prisma.site.update({ where: { id: request.params.id }, data: { radarRunRequested: true } });
    return reply.code(202).send({ ok: true });
  });

  app.post<{ Params: { id: string } }>("/api/radar/findings/:id/dismiss", async (request, reply) => {
    const { count } = await prisma.radarFinding.updateMany({ where: { id: request.params.id }, data: { dismissed: true } });
    return count ? { ok: true } : reply.code(404).send({ error: "Befund nicht gefunden" });
  });

  // Startet aus einem Befund die Ueberarbeitung; die Gruende des Radars werden zur Anweisung.
  app.post<{ Params: { id: string } }>("/api/radar/findings/:id/revise", async (request, reply) => {
    const finding = await prisma.radarFinding.findUnique({ where: { id: request.params.id } });
    if (!finding) return reply.code(404).send({ error: "Befund nicht gefunden" });
    const reasons = Array.isArray(finding.reasons) ? finding.reasons.filter((r): r is string => typeof r === "string") : [];
    const instructions = [`Aktualisiere den Beitrag. ${finding.summary}`.trim(), ...reasons.map((r) => `- ${r}`)].join("\n").slice(0, 3000);
    const post = await createRevision(finding.siteId, finding.wpPostId, instructions);
    await prisma.radarFinding.update({ where: { id: finding.id }, data: { revisionPostId: post.id } });
    return reply.code(201).send(post);
  });

  // --- Titelvorschlaege -------------------------------------------------------
  app.post<{ Params: { id: string } }>("/api/posts/:id/titles", async (request, reply) => {
    const post = await prisma.post.findUnique({ where: { id: request.params.id }, include: { site: true } });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    if (post.status !== "DRAFT_READY" || !post.contentHtml) return reply.code(409).send({ error: "Der Entwurf ist noch nicht fertig." });
    useUsageContext({ postId: post.id, siteId: post.siteId });
    let result;
    try {
      result = await ai.suggestTitles({
        site: { name: post.site.name, language: post.site.language, audience: post.site.audience, tone: post.site.tone, styleGuide: post.site.styleGuide },
        title: post.title ?? "",
        focusKeyword: post.focusKeyword ?? "",
        excerpt: post.excerpt ?? "",
        text: stripHtml(post.contentHtml),
      });
    } catch (error) {
      return reply.code(502).send({ error: `Titelvorschläge nicht möglich: ${explainAiError(error)}` });
    }
    const keyword = post.focusKeyword ?? "";
    return {
      titles: result.titles.map((t) => ({ title: t.title.trim().slice(0, 120), note: t.note, length: t.title.trim().length, hasKeyword: keywordInText(t.title, keyword) })),
    };
  });

  // --- Text nachschaerfen (KI nach Anweisung) ---------------------------------
  const FOOTER_RE = /\n?<p><em>Stand:[\s\S]*?<\/em><\/p>\s*$/;

  app.post<{ Params: { id: string } }>("/api/posts/:id/refine", async (request, reply) => {
    const body = z.object({ instruction: z.string().trim().min(3).max(1500) }).safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: "Bitte kurz beschreiben, was geändert werden soll (mindestens 3 Zeichen)." });
    const post = await prisma.post.findUnique({ where: { id: request.params.id }, include: { site: true } });
    if (!post) return reply.code(404).send({ error: "Beitrag nicht gefunden" });
    if (post.status !== "DRAFT_READY" || !post.contentHtml) return reply.code(409).send({ error: "Der Entwurf ist noch nicht fertig." });
    useUsageContext({ postId: post.id, siteId: post.siteId });
    const footerStamp = post.contentHtml.match(FOOTER_RE)?.[0] ?? "";
    let current = post.contentHtml.replace(FOOTER_RE, "");
    // Der feste Schlussabsatz der Website gehoert nicht zum Text, den die KI sieht.
    const closing = sanitizePostHtml(post.site.closingHtml);
    let footer = footerStamp;
    if (closing && current.trimEnd().endsWith(closing)) {
      current = current.trimEnd().slice(0, -closing.length).trimEnd();
      footer = `\n${closing}${footerStamp}`;
    }
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

  // --- Kostenuebersicht ---------------------------------------------------------
  const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

  function summarize(rows: { step: string; inputTokens: number; outputTokens: number; webSearches: number; costUsd: number }[]) {
    const byStep = new Map<string, { step: string; label: string; calls: number; inputTokens: number; outputTokens: number; webSearches: number; costUsd: number }>();
    for (const r of rows) {
      const e = byStep.get(r.step) ?? { step: r.step, label: STEP_LABELS[r.step] ?? r.step, calls: 0, inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 };
      e.calls++;
      e.inputTokens += r.inputTokens;
      e.outputTokens += r.outputTokens;
      e.webSearches += r.webSearches;
      e.costUsd += r.costUsd;
      byStep.set(r.step, e);
    }
    const steps = [...byStep.values()].sort((a, b) => b.costUsd - a.costUsd).map((e) => ({ ...e, costUsd: round(e.costUsd) }));
    return { steps, costUsd: round(rows.reduce((sum, r) => sum + r.costUsd, 0)) };
  }

  const prices = { inputPerMTok: config.AI_PRICE_INPUT_PER_MTOK, outputPerMTok: config.AI_PRICE_OUTPUT_PER_MTOK, searchPer1000: config.AI_PRICE_SEARCH_PER_1000, imageUsd: config.IMAGE_COST_USD };

  app.get<{ Querystring: { days?: string } }>("/api/usage", async (request) => {
    const days = Math.min(Math.max(Number.parseInt(request.query.days ?? "30", 10) || 0, 0), 3650);
    const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
    const rows = await prisma.aiUsage.findMany({ where: since ? { createdAt: { gte: since } } : {}, orderBy: { createdAt: "desc" } });
    const all = summarize(rows);

    const siteNames = new Map((await prisma.site.findMany({ select: { id: true, name: true } })).map((s) => [s.id, s.name]));
    const bySiteMap = new Map<string, number>();
    for (const r of rows) bySiteMap.set(r.siteId ?? "", (bySiteMap.get(r.siteId ?? "") ?? 0) + r.costUsd);
    const bySite = [...bySiteMap.entries()].map(([id, cost]) => ({ siteId: id, name: siteNames.get(id) ?? "(gelöschte oder keine Website)", costUsd: round(cost) })).sort((a, b) => b.costUsd - a.costUsd);

    const perPost = new Map<string, { cost: number; last: Date }>();
    for (const r of rows) {
      if (!r.postId) continue;
      const e = perPost.get(r.postId) ?? { cost: 0, last: r.createdAt };
      e.cost += r.costUsd;
      if (r.createdAt > e.last) e.last = r.createdAt;
      perPost.set(r.postId, e);
    }
    const recentIds = [...perPost.entries()].sort((a, b) => b[1].last.getTime() - a[1].last.getTime()).slice(0, 20);
    const titles = new Map((await prisma.post.findMany({ where: { id: { in: recentIds.map(([id]) => id) } }, select: { id: true, title: true, topic: { select: { title: true } } } })).map((p) => [p.id, p.title ?? p.topic.title]));
    const postCosts = [...perPost.values()].map((p) => p.cost);

    return {
      days,
      prices,
      totals: {
        costUsd: all.costUsd,
        calls: rows.length,
        webSearches: rows.reduce((n, r) => n + r.webSearches, 0),
        images: rows.filter((r) => r.step === "image_generate").length,
        posts: perPost.size,
        avgPerPostUsd: postCosts.length ? round(postCosts.reduce((a, b) => a + b, 0) / postCosts.length) : 0,
      },
      steps: all.steps,
      bySite,
      recentPosts: recentIds.map(([id, v]) => ({ postId: id, title: titles.get(id) ?? "(gelöschter Beitrag)", costUsd: round(v.cost), lastAt: v.last })),
    };
  });

  app.get<{ Params: { id: string } }>("/api/posts/:id/usage", async (request) => {
    const rows = await prisma.aiUsage.findMany({ where: { postId: request.params.id } });
    return { ...summarize(rows), calls: rows.length };
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
    useUsageContext({ postId: post.id, siteId: post.siteId });
    let plan;
    try {
      plan = await ai.planImage({
        site: { name: post.site.name, language: post.site.language, audience: post.site.audience, tone: post.site.tone, styleGuide: post.site.styleGuide },
        post: { title: post.title ?? "", excerpt: post.excerpt ?? "", focusKeyword: post.focusKeyword ?? "", text: stripHtml(post.contentHtml ?? "") },
        style: body.data.style,
        promptLanguage: config.IMAGE_PROMPT_LANGUAGE,
        recentPrompts: (await prisma.postImage.findMany({ where: { post: { siteId: post.siteId }, postId: { not: post.id }, prompt: { not: "" } }, orderBy: { updatedAt: "desc" }, take: 8, select: { prompt: true } })).map((i) => i.prompt),
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
