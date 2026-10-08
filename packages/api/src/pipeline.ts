import { Prisma, type PrismaClient } from "@prisma/client";
import { explainAiError } from "./ai/errors.js";
import type { AiDocument, AiService, CompetitionGuidance, DraftResult, FactCheckResult, ResearchResult, SiteProfile, TopicProposal } from "./ai/types.js";
import { escapeHtml, sanitizePostHtml, applyLinkPolicy, urlKey } from "./lib/html.js";
import { fetchSitePosts } from "./lib/wordpress.js";
import { parsePreferredLinks } from "./lib/links.js";
import { fetchPrimarySources } from "./lib/sources.js";
import { autoLinkRulings } from "./lib/rulings.js";
import { recordUsage, withUsageContext } from "./lib/usage.js";
import { clampWords, fetchCompetitorPages, median, pickCompetitorUrls } from "./lib/competition.js";
import { checkReferences, type ReferenceCheck } from "./lib/references.js";
import { slugWithKeyword } from "./lib/slug.js";
import type { ImageProvider } from "./image/provider.js";
import { markAsAiGenerated } from "./lib/png.js";
import type { FileStorage } from "./lib/storage.js";

export interface PipelineDeps {
  prisma: PrismaClient;
  ai: AiService;
  storage: FileStorage;
  /** Optional: ohne Anbieter gibt es nur Prompts, Stockfoto-Suche und Upload. */
  images?: ImageProvider;
  /** Fuer Tests austauschbar (Abruf vorhandener Beitraege fuer interne Links). */
  fetcher?: typeof fetch;
  /** Kosten je erzeugtem Bild (USD) fuer die Kostenuebersicht. */
  imageCostUsd?: number;
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
export function analyzeSubmission(deps: PipelineDeps, submissionId: string): Promise<void> {
  return withUsageContext({ submissionId }, () => analyzeSubmissionRun(deps, submissionId));
}

async function analyzeSubmissionRun(deps: PipelineDeps, submissionId: string): Promise<void> {
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

export function assemblePostHtml(contentHtml: string, disclaimer: string, closingHtml = "", now = new Date(), originalDate?: string): string {
  const closing = sanitizePostHtml(closingHtml);
  const main = sanitizePostHtml(contentHtml);
  const body = closing ? `${main}\n${closing}` : main;
  const stand = now.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  // Bei Ueberarbeitungen: Datum der Erstveroeffentlichung mit nennen ("Stand:" bleibt der Anfang der Zeile).
  const original = originalDate && /^\d{4}-\d{2}-\d{2}/.test(originalDate) ? `${originalDate.slice(8, 10)}.${originalDate.slice(5, 7)}.${originalDate.slice(0, 4)}` : "";
  const notes = [original ? `Stand: ${stand} (aktualisiert). Ursprünglich veröffentlicht am ${original}.` : `Stand: ${stand}.`, disclaimer.trim()].filter(Boolean).join(" ");
  const footer = `<p><em>${escapeHtml(notes)}</em></p>`;
  return `${body}\n${footer}`;
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
  /** Frei zugaengliche Primaerquellen (Gerichte, Gesetze, Behoerden), die fuer die Pruefung abgerufen wurden. */
  sourcesChecked?: { url: string; ok: boolean; reason?: string }[];
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

/** Adressen des Originalbeitrags einer Ueberarbeitung (Permalink und ?p=ID), auf die nicht verlinkt werden darf. */
export function selfUrls(baseUrl: string, rev: { url?: string; wpPostId?: number } | null | undefined): string[] {
  if (!rev) return [];
  const urls = rev.url ? [rev.url] : [];
  try {
    if (rev.wpPostId) urls.push(`${new URL(baseUrl).origin}/?p=${rev.wpPostId}`);
  } catch {
    /* keine gueltige Basisadresse */
  }
  return urls;
}

function hostOfUrl(url: string): string[] {
  try {
    return [new URL(url).hostname.toLowerCase().replace(/^www\./, "")];
  } catch {
    return [];
  }
}

export interface StoredCompetition {
  keyword: string;
  intent: string;
  pages: { url: string; title: string; words: number }[];
  failed: { url: string; reason: string }[];
  medianWords: number;
  recommended: { min: number; max: number };
  rationale: string;
  missingTopics: string[];
  structureHints: string[];
  ranAt: string;
}

/** Vergleich mit den Top-Ergebnissen zum Suchbegriff. Liefert nichts, wenn zu wenige vergleichbare Seiten gefunden werden. */
async function runCompetition(deps: PipelineDeps, site: SiteProfile, topic: TopicProposal, baseUrl: string): Promise<{ guidance: CompetitionGuidance; stored: StoredCompetition } | undefined> {
  const keyword = (topic.keywords[0] ?? "").trim() || topic.title;
  const found = await deps.ai.findCompetitors({ site, keyword });
  const urls = pickCompetitorUrls(found.results, baseUrl);
  if (urls.length < 2) return undefined;
  const fetched = await fetchCompetitorPages(urls, deps.fetcher as never);
  const pages = fetched.flatMap((p) => (p.ok ? [p] : []));
  if (pages.length < 2) return undefined;
  const insights = await deps.ai.analyzeCompetition({ site, keyword, topic, notes: found.notes, pages });
  const min = clampWords(insights.recommendedMinWords);
  const max = Math.max(clampWords(insights.recommendedMaxWords), min + 100);
  const missingTopics = insights.missingTopics.slice(0, 8);
  const structureHints = insights.structureHints.slice(0, 5);
  return {
    guidance: { keyword, intent: insights.intent, recommendedMinWords: min, recommendedMaxWords: max, missingTopics, structureHints },
    stored: {
      keyword,
      intent: insights.intent,
      pages: pages.map((p) => ({ url: p.url, title: p.title, words: p.words })),
      failed: fetched.flatMap((p) => (p.ok ? [] : [{ url: p.url, reason: p.reason }])),
      medianWords: median(pages.map((p) => p.words)),
      recommended: { min, max },
      rationale: insights.rationale,
      missingTopics,
      structureHints,
      ranAt: new Date().toISOString(),
    },
  };
}

/** Schritt 2-4: Recherche, Entwurf und Faktencheck fuer ein ausgewaehltes Thema. */
export function generatePost(deps: PipelineDeps, postId: string): Promise<void> {
  return withUsageContext({ postId }, () => generatePostRun(deps, postId));
}

async function generatePostRun(deps: PipelineDeps, postId: string): Promise<void> {
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
    await prisma.post.update({ where: { id: postId }, data: { status: "DRAFTING", researchNotes: research.notes, factCheck: Prisma.DbNull, competition: Prisma.DbNull } });

    const styleSamples = post.site.styleSamples.map((s) => ({ title: s.title, text: s.text }));
    const rev = post.revisionSource as { wpPostId?: number; title?: string; url?: string; html?: string; instructions?: string; publishedAt?: string } | null;
    const revision = rev ? { title: rev.title ?? "", url: rev.url ?? "", html: sanitizePostHtml(rev.html ?? ""), instructions: rev.instructions ?? "" } : undefined;
    // Interne Links: vorhandene Beitraege der Website (best effort - ohne Liste gibt es einfach keine internen Links).
    let relatedPosts: { title: string; url: string; excerpt: string }[] = [];
    if (post.site.baseUrl) {
      try {
        relatedPosts = (await fetchSitePosts(post.site.baseUrl, { count: 30 }, deps.fetcher as never))
          .filter((p) => p.url && !(revision?.url && urlKey(p.url) === urlKey(revision.url)))
          .map((p) => ({ title: p.title, url: p.url, excerpt: p.excerpt }));
      } catch {
        relatedPosts = [];
      }
    }
    // Vom Nutzer hinterlegte Wunschziele (z. B. Leistungsseiten) stehen vorn und gelten ebenfalls als bekannte Seiten.
    const preferred = parsePreferredLinks(post.site.preferredLinks).map((l) => ({ title: `${l.title} (bevorzugt)`, url: l.url, excerpt: "" }));
    relatedPosts = [...preferred, ...relatedPosts.filter((p) => !preferred.some((x) => x.url === p.url))];
    // Optional: Vergleich mit den Top-Ergebnissen (Umfang, Gliederung). Fehler hier stoppen den Beitrag nie.
    let competition: CompetitionGuidance | undefined;
    let competitorHosts: string[] = [];
    if (post.site.competitionCheck) {
      const result = await runCompetition(deps, site, topic, post.site.baseUrl).catch(() => undefined);
      if (result) {
        competition = result.guidance;
        competitorHosts = result.stored.pages.flatMap((p) => hostOfUrl(p.url));
        await prisma.post.update({ where: { id: postId }, data: { competition: result.stored as unknown as Prisma.InputJsonValue } });
      }
    }
    const draft = await ai.draft({ site, topic, research, styleSamples, relatedPosts, ...(competition ? { competition } : {}), ...(revision ? { revision } : {}) });
    // Bekannte interne Ziele: Liste der Website plus Links, die schon im Originalbeitrag standen.
    const originalLinks = [...(revision?.html ?? "").matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
    const internalLinks = [...relatedPosts.map((p) => ({ title: p.title, url: p.url })), ...originalLinks.map((url) => ({ title: "", url }))];
    const knownInternal = internalLinks.map((l) => l.url);
    // Allgemeine Quellen (Infoportale, Presse, Blogs) nur aus der Recherche bzw. dem Originalbeitrag und nie von verglichenen Wettbewerbern.
    const linkOptions = {
      generalAllowed: [...research.sources.map((s) => s.url), ...draft.sources.map((s) => s.url), ...originalLinks],
      blockedHosts: competitorHosts,
      // Der Originalbeitrag wird durch die Ueberarbeitung ersetzt bzw. ergaenzt: nie auf ihn selbst verlinken.
      blockedUrls: selfUrls(post.site.baseUrl, rev),
    };
    // Zitierte Entscheidungen verlinken (bevorzugt auf die Gerichtswebsite), soweit die Recherche eine Quelle dazu gefunden hat.
    const rulingSources = [...research.sources, ...draft.sources.map((s) => ({ url: s.url, title: s.title, note: s.note }))];
    draft.contentHtml = applyLinkPolicy(autoLinkRulings(draft.contentHtml, rulingSources), post.site.baseUrl, knownInternal, linkOptions);
    if (draft.changeSummary.trim()) {
      await prisma.post.update({ where: { id: postId }, data: { researchNotes: `Änderungen gegenüber dem Original:\n${draft.changeSummary.trim()}\n\n${research.notes}` } });
    }
    const draftFields = {
      title: clip(draft.title, 120),
      slug: slugWithKeyword(draft.slug || draft.title, draft.focusKeyword, 50),
      metaDescription: clip(draft.metaDescription, 160),
      focusKeyword: draft.focusKeyword.trim(),
      secondaryKeywords: draft.secondaryKeywords,
      excerpt: draft.excerpt.trim(),
      sources: draft.sources,
    };
    // Entwurf sofort sichern: schlaegt der Faktencheck fehl, geht die Arbeit nicht verloren.
    await prisma.post.update({
      where: { id: postId },
      data: { ...draftFields, status: "FACTCHECKING", contentHtml: assemblePostHtml(draft.contentHtml, post.site.disclaimer, post.site.closingHtml, new Date(), rev?.publishedAt), unverifiedClaims: draft.unverifiedClaims },
    });

    const uploaded = await loadAiDocuments(deps, post.topic.submissionId);
    // Primaerquellen direkt abrufen: Quellen aus der Recherche und im Entwurf verlinkte amtliche Seiten.
    const hrefs = [...draft.contentHtml.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] ?? "").replace(/&amp;/g, "&"));
    const primary = await fetchPrimarySources([...research.sources.map((s) => s.url), ...draft.sources.map((s) => s.url), ...hrefs], deps.fetcher as never).catch(() => []);
    const primaryDocs = primary.flatMap((p) => (p.document ? [p.document] : []));
    const documents = [...uploaded, ...primaryDocs];
    const sourcesChecked = primary.map((p) => ({ url: p.url, ok: p.ok, ...(p.reason ? { reason: p.reason } : {}) }));
    const evidence = [
      research.notes,
      topic.summary,
      ...topic.keyFacts,
      ...research.sources.map((s) => s.title),
      ...documents.flatMap((d) => (d.text ? [d.text] : [])),
    ];

    try {
      const check = await ai.factCheck({ site, topic, research, draft, documents, internalLinks });
      const { html: checked, stored: base, unverified } = evaluateFactCheck(draft, check, evidence);
      const stored: StoredFactCheck = { ...base, ...(sourcesChecked.length ? { sourcesChecked } : {}) };
      const html = applyLinkPolicy(autoLinkRulings(checked, rulingSources), post.site.baseUrl, knownInternal, linkOptions);
      await prisma.post.update({
        where: { id: postId },
        data: { status: "DRAFT_READY", error: null, contentHtml: assemblePostHtml(html, post.site.disclaimer, post.site.closingHtml, new Date(), rev?.publishedAt), unverifiedClaims: unverified, factCheck: stored as unknown as Prisma.InputJsonValue },
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
export function generateImage(deps: PipelineDeps, postId: string): Promise<void> {
  return withUsageContext({ postId }, () => generateImageRun(deps, postId));
}

async function generateImageRun({ prisma, storage, images, imageCostUsd }: PipelineDeps, postId: string): Promise<void> {
  try {
    if (!images) throw new Error("Bildgenerierung ist nicht eingerichtet (IMAGE_PROVIDER).");
    const image = await prisma.postImage.findUniqueOrThrow({ where: { postId } });
    if (!image.prompt.trim()) throw new Error("Es gibt keinen Bild-Prompt.");
    const generated = await images.generate({ prompt: image.prompt });
    recordUsage({ step: "image_generate", model: images.name, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0, fixedCostUsd: imageCostUsd ?? 0 });
    const data = markAsAiGenerated(generated.data, `KI-generiert (${images.name})`);
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
