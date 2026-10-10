import { explainAiError } from "./ai/errors.js";
import { fetchAllSitePosts, fetchSiteCategories } from "./lib/wordpress.js";
import type { PipelineDeps } from "./pipeline.js";
import { withUsageContext } from "./lib/usage.js";

/** Automatischer Lauf je Website hoechstens in diesem Abstand. */
export const SCOUT_INTERVAL_DAYS = 7;

/** Portfolio fuer die Suche: Freitext des Nutzers plus die Kategorien der Website (mit Anzahl Beitraege). */
export function portfolioText(freeText: string, categories: { name: string; count: number }[]): string {
  const parts: string[] = [];
  if (freeText.trim()) parts.push(freeText.trim());
  if (categories.length) parts.push(`Kategorien der Website (Anzahl Beitraege): ${categories.map((c) => `${c.name} (${c.count})`).join(", ")}`);
  return parts.join("\n\n");
}

const httpUrl = (u: string) => /^https?:\/\//i.test(u.trim());

/** Sucht aktuell gefragte Themen aus dem Portfolio einer Website und speichert die Vorschlaege. Wirft nie. */
export function runScout(deps: PipelineDeps, siteId: string, now = new Date()): Promise<void> {
  return withUsageContext({ siteId }, () => runScoutRun(deps, siteId, now));
}

async function runScoutRun(deps: PipelineDeps, siteId: string, now: Date): Promise<void> {
  const { prisma, ai } = deps;
  try {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const profile = { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide };

    // Oeffentliche Daten der Website; ohne Adresse (oder bei Fehlern) arbeitet der Scout nur mit dem Freitext.
    const categories = site.baseUrl ? await fetchSiteCategories(site.baseUrl, deps.fetcher as never).catch(() => []) : [];
    const posts = site.baseUrl ? await fetchAllSitePosts(site.baseUrl, 3, deps.fetcher as never).catch(() => []) : [];
    const portfolio = portfolioText(site.portfolio, categories);
    if (!portfolio) throw new Error("Das Portfolio ist leer. Trage bei der Website Schwerpunkte ein oder gib die Adresse an, damit die Kategorien gelesen werden können.");

    const previous = await prisma.topicIdea.findMany({ where: { siteId } });
    const rejected = previous.filter((i) => i.dismissed).map((i) => i.title);
    const result = await ai.scoutTopics({
      site: profile,
      portfolio,
      existingTitles: posts.map((p) => p.title),
      rejectedTitles: rejected,
      today: now.toISOString().slice(0, 10),
    });

    const rejectedKeys = new Set(rejected.map((t) => t.toLowerCase()));
    const ideas = result.ideas
      .map((i) => ({ ...i, title: i.title.trim().slice(0, 200), sources: i.sources.filter((s) => httpUrl(s.url)).slice(0, 5) }))
      .filter((i) => i.title && !rejectedKeys.has(i.title.toLowerCase()));
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    ideas.sort((a, b) => (rank[a.urgency] ?? 1) - (rank[b.urgency] ?? 1));

    // Neue Vorschlaege ersetzen die alten, soweit diese weder abgelehnt noch in einen Beitrag uebernommen wurden.
    await prisma.$transaction([
      prisma.topicIdea.deleteMany({ where: { siteId, dismissed: false, postId: null } }),
      prisma.topicIdea.createMany({
        data: ideas.map((i) => ({ siteId, title: i.title, keyword: i.keyword.trim().slice(0, 120), area: i.area.trim().slice(0, 80), urgency: i.urgency, whyNow: i.whyNow, angle: i.angle, sources: i.sources })),
      }),
      prisma.site.update({ where: { id: siteId }, data: { scoutLastError: "" } }),
    ]);
  } catch (error) {
    await prisma.site.updateMany({ where: { id: siteId }, data: { scoutLastError: explainAiError(error).slice(0, 600) } });
  }
}
