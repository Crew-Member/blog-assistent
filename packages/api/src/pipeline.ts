import type { PrismaClient } from "@prisma/client";
import type { AiDocument, AiService, SiteProfile, TopicProposal } from "./ai/types.js";
import { escapeHtml, sanitizePostHtml } from "./lib/html.js";
import { slugify } from "./lib/slug.js";
import type { FileStorage } from "./lib/storage.js";

export interface PipelineDeps {
  prisma: PrismaClient;
  ai: AiService;
  storage: FileStorage;
}

function profileOf(site: { name: string; language: string; audience: string; tone: string; styleGuide: string }): SiteProfile {
  return { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide };
}

function errorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Schritt 1: Unterlagen lesen und Themen vorschlagen. */
export async function analyzeSubmission({ prisma, ai, storage }: PipelineDeps, submissionId: string): Promise<void> {
  try {
    const submission = await prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: { site: true, documents: { orderBy: { createdAt: "asc" } } },
    });

    const documents: AiDocument[] = [];
    for (const doc of submission.documents) {
      if (doc.extractedText !== null) {
        documents.push({ filename: doc.filename, kind: "text", mimeType: doc.mimeType, text: doc.extractedText });
      } else {
        const data = await storage.load(doc.storageKey);
        const kind = doc.mimeType === "application/pdf" ? "pdf" : "image";
        documents.push({ filename: doc.filename, kind, mimeType: doc.mimeType, base64: data.toString("base64") });
      }
    }

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

/** Schritt 2+3: Recherche und Entwurf fuer ein ausgewaehltes Thema. */
export async function generatePost({ prisma, ai }: PipelineDeps, postId: string): Promise<void> {
  try {
    const post = await prisma.post.findUniqueOrThrow({ where: { id: postId }, include: { site: true, topic: true } });
    const site = profileOf(post.site);
    const topic: TopicProposal = {
      title: post.topic.title,
      angle: post.topic.angle,
      summary: post.topic.summary,
      keyFacts: asStringArray(post.topic.keyFacts),
      keywords: asStringArray(post.topic.keywords),
    };

    const research = await ai.research({ site, topic });
    await prisma.post.update({ where: { id: postId }, data: { status: "DRAFTING", researchNotes: research.notes } });

    const draft = await ai.draft({ site, topic, research });
    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "DRAFT_READY",
        error: null,
        title: clip(draft.title, 120),
        slug: slugify(draft.slug || draft.title),
        metaDescription: clip(draft.metaDescription, 160),
        focusKeyword: draft.focusKeyword.trim(),
        secondaryKeywords: draft.secondaryKeywords,
        excerpt: draft.excerpt.trim(),
        contentHtml: assemblePostHtml(draft.contentHtml, post.site.disclaimer),
        sources: draft.sources,
        unverifiedClaims: draft.unverifiedClaims,
      },
    });
  } catch (error) {
    await prisma.post.update({ where: { id: postId }, data: { status: "FAILED", error: errorMessage(error) } });
  }
}
