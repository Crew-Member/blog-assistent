import { Prisma, type PrismaClient } from "@prisma/client";
import { explainAiError } from "./ai/errors.js";
import type { AiDocument, AiService, DraftResult, FactCheckResult, ResearchResult, SiteProfile, TopicProposal } from "./ai/types.js";
import { escapeHtml, sanitizePostHtml } from "./lib/html.js";
import { checkReferences, type ReferenceCheck } from "./lib/references.js";
import { slugify } from "./lib/slug.js";
import type { ImageProvider } from "./image/provider.js";
import { embedAiGeneratedXmp } from "./lib/png.js";
import type { FileStorage } from "./lib/storage.js";

export interface PipelineDeps {
  prisma: PrismaClient;
  ai: AiService;
  storage: FileStorage;
  /** Optional: ohne Anbieter gibt es nur Prompts, Stockfoto-Suche und Upload. */
  images?: ImageProvider;
}

function profileOf(site: { name: string; language: string; audience: string; tone: string; styleGuide: string }): SiteProfile {
  return { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide };
}

function errorMessage(error: unknown): string {
  return explainAiError(error).slice(0, 1200);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

async function loadAiDocuments({ prisma, storage }: PipelineDeps, submissionId: string): Promise<AiDocument[]> {
  const docs = await prisma.document.findMany({ where: { submissionId }, orderBy: { createdAt: "asc" } });
  const result: AiDocument[] = [];
  for (const doc of docs) {
    if (doc.extractedText !== null) {
      result.push({ filename: doc.filename, kind: "text", mimeType: doc.mimeType, text: doc.extractedText });
    } else {
      const data = await storage.load(doc.storageKey);
      const kind = doc.mimeType === "application/pdf" ? "pdf" : "image";
      result.push({ filename: doc.filename, kind, mimeType: doc.mimeType, base64: data.toString("base64") });
    }
  }
  return result;
}

/** Schritt 1: Unterlagen lesen und Themen vorschlagen. */
export async function analyzeSubmission(deps: PipelineDeps, submissionId: string): Promise<void> {
  const { prisma, ai } = deps;
  try {
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { site: true } });
    const documents = await loadAiDocuments(deps, submissionId);

    const topics = await ai.analyze({ site: profileOf(submission.site), note: submission.note, documents });

    await prisma.$transaction([
      prisma.topic.deleteMany({ where: { submissionId } }),
      prisma.topic.createMany({
        data: topics.map((t) => ({
          submissionId,
          title: t.title,
          angle: t.angle,
          summary: t.summary,
          keyFacts: t.keyFacts,
          keywords: t.keywords,
        })),
      }),
      prisma.submission.update({ where: { id: submissionId }, data: { status: "ANALYZED", error: null } }),
    ]);
  } catch (error) {
    await prisma.submission.update({ where: { id: submissionId }, data: { status: "FAILED", error: errorMessage(error) } });
  }
}

export function assemblePostHtml(contentHtml: string, disclaimer: string, now = new Date()): string {
  const body = sanitizePostHtml(contentHtml);
  const stand = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const notes = [`Stand: ${stand}.`, disclaimer.trim()].filter(Boolean).join(" ");
  return `${body}\n<p><em>${escapeHtml(notes)}</em></p>`;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export type FactCheckStatus = "passed" | "revised" | "needs_review" | "skipped";

export interface StoredFactCheck {
  status: FactCheckStatus;
  summary: string;
  issues: FactCheckResult["issues"];
  references: Pick<ReferenceCheck, "kind" | "text" | "found">[];
  ranAt: string;
  error?: string;
}

/** Wertet das Ergebnis des Faktenchecks aus und ergaenzt die deterministische Fundstellen-Pruefung. */
export function evaluateFactCheck(
  draft: DraftResult,
  check: FactCheckResult,
  evidence: string[],
  now = new Date(),
): { html: string; stored: StoredFactCheck; unverified: string[] } {
  const html = sanitizePostHtml(check.revisedHtml);
  const references = checkReferences(html, evidence);
  const missing = references.filter((r) => !r.found);
  const flagged = check.issues.filter((i) => i.action === "flagged");
  const shrunk = html.length < sanitizePostHtml(draft.contentHtml).length * 0.4;

  let status: FactCheckStatus = "passed";
  if (check.issues.length > 0) status = "revised";
  if (flagged.length > 0 || missing.length > 0 || shrunk) status = "needs_review";

  const unverified = [
    ...flagged.map((i) => i.claim),
    ...missing.map((r) => `${r.text} – in Recherche und Unterlagen nicht wiederzufinden, bitte prüfen`),
    ...(shrunk ? ["Der Faktencheck hat den Text stark gekürzt – bitte Inhalt auf Vollständigkeit prüfen"] : []),
  ];
  return {
    html,
    unverified,
    stored: {
      status,
      summary: check.summary,
      issues: check.issues,
      references: references.map(({ kind, text, found }) => ({ kind, text, found })),
      ranAt: now.toISOString(),
    },
  };
}

/** Schritt 2-4: Recherche, Entwurf und Faktencheck fuer ein ausgewaehltes Thema. */
export async function generatePost(deps: PipelineDeps, postId: string): Promise<void> {
  const { prisma, ai } = deps;
  try {
    const post = await prisma.post.findUniqueOrThrow({
      where: { id: postId },
      include: { site: { include: { styleSamples: { orderBy: { createdAt: "desc" }, take: 3 } } }, topic: true },
    });
    const site = profileOf(post.site);
    const topic: TopicProposal = {
      title: post.topic.title,
      angle: post.topic.angle,
      summary: post.topic.summary,
      keyFacts: asStringArray(post.topic.keyFacts),
      keywords: asStringArray(post.topic.keywords),
    };

    const research: ResearchResult = await ai.research({ site, topic });
    await prisma.post.update({ where: { id: postId }, data: { status: "DRAFTING", researchNotes: research.notes, factCheck: Prisma.DbNull } });

    const styleSamples = post.site.styleSamples.map((s) => ({ title: s.title, text: s.text }));
    const draft = await ai.draft({ site, topic, research, styleSamples });
    const draftFields = {
      title: clip(draft.title, 120),
      slug: slugify(draft.slug || draft.title),
      metaDescription: clip(draft.metaDescription, 160),
      focusKeyword: draft.focusKeyword.trim(),
      secondaryKeywords: draft.secondaryKeywords,
      excerpt: draft.excerpt.trim(),
      sources: draft.sources,
    };
    // Entwurf sofort sichern: schlaegt der Faktencheck fehl, geht die Arbeit nicht verloren.
    await prisma.post.update({
      where: { id: postId },
      data: { ...draftFields, status: "FACTCHECKING", contentHtml: assemblePostHtml(draft.contentHtml, post.site.disclaimer), unverifiedClaims: draft.unverifiedClaims },
    });

    const documents = await loadAiDocuments(deps, post.topic.submissionId);
    const evidence = [
      research.notes,
      topic.summary,
      ...topic.keyFacts,
      ...research.sources.map((s) => s.title),
      ...documents.flatMap((d) => (d.text ? [d.text] : [])),
    ];

    try {
      const check = await ai.factCheck({ site, topic, research, draft, documents });
      const { html, stored, unverified } = evaluateFactCheck(draft, check, evidence);
      await prisma.post.update({
        where: { id: postId },
        data: { status: "DRAFT_READY", error: null, contentHtml: assemblePostHtml(html, post.site.disclaimer), unverifiedClaims: unverified, factCheck: stored as unknown as Prisma.InputJsonValue },
      });
    } catch (error) {
      const stored: StoredFactCheck = { status: "skipped", summary: "Der Faktencheck konnte nicht durchgeführt werden – der Entwurf ist ungeprüft.", issues: [], references: [], ranAt: new Date().toISOString(), error: errorMessage(error) };
      await prisma.post.update({ where: { id: postId }, data: { status: "DRAFT_READY", error: null, factCheck: stored as unknown as Prisma.InputJsonValue } });
    }
  } catch (error) {
    await prisma.post.update({ where: { id: postId }, data: { status: "FAILED", error: errorMessage(error) } });
  }
}

export const AI_LABEL = "Bild: KI-generiert";

/** Bildunterschrift inkl. KI-Kennzeichnung (wenn das Bild KI-generiert ist und die Website es verlangt). */
export function finalCaption(caption: string, aiGenerated: boolean, labelAiImages: boolean): string {
  const base = caption.trim();
  if (!aiGenerated || !labelAiImages || /KI-generiert/i.test(base)) return base;
  return base ? `${base} (${AI_LABEL})` : AI_LABEL;
}

/** Erzeugt das Bild zu einem geplanten Prompt ueber den konfigurierten Anbieter und legt es ab. */
export async function generateImage({ prisma, storage, images }: PipelineDeps, postId: string): Promise<void> {
  try {
    if (!images) throw new Error("Bildgenerierung ist nicht eingerichtet (IMAGE_PROVIDER).");
    const image = await prisma.postImage.findUniqueOrThrow({ where: { postId } });
    if (!image.prompt.trim()) throw new Error("Es gibt keinen Bild-Prompt.");
    const generated = await images.generate({ prompt: image.prompt });
    const data = embedAiGeneratedXmp(generated.data, `KI-generiert (${images.name})`);
    const key = await storage.save(data);
    if (image.storageKey) await storage.remove(image.storageKey);
    await prisma.postImage.update({
      where: { postId },
      data: { status: "READY", error: null, origin: "AI", aiGenerated: true, storageKey: key, mimeType: generated.mimeType, wpMediaId: null },
    });
  } catch (error) {
    await prisma.postImage.updateMany({ where: { postId }, data: { status: "FAILED", error: errorMessage(error) } });
  }
}
