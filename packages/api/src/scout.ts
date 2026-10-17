import { explainAiError } from "./ai/errors.js";
import { demandNoteFor, demandPeriods, summarizeDemand, type GscRow } from "./lib/gsc.js";
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
export function runScout(deps: PipelineDeps, siteId: string, now = new Date(), focus = ""): Promise<void> {
  return withUsageContext({ siteId }, () => runScoutRun(deps, siteId, now, focus.trim()));
}

async function runScoutRun(deps: PipelineDeps, siteId: string, now: Date, focus: string): Promise<void> {
  const { prisma, ai } = deps;
  try {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    const profile = { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide };

    // Oeffentliche Daten der Website; ohne Adresse (oder bei Fehlern) arbeitet der Scout nur mit dem Freitext.
    const categories = site.baseUrl ? await fetchSiteCategories(site.baseUrl, deps.fetcher as never).catch(() => []) : [];
    const posts = site.baseUrl ? await fetchAllSitePosts(site.baseUrl, 3, deps.fetcher as never).catch(() => []) : [];
    const portfolio = portfolioText(site.portfolio, categories);
    if (!portfolio && !focus) throw new Error("Das Portfolio ist leer. Trage bei der Website Schwerpunkte ein oder gib die Adresse an, damit die Kategorien gelesen werden können.");

    // Nachfragedaten aus der Search Console (optional). Fehler stoppen den Lauf nicht, werden aber als Hinweis gemeldet.
    let demand = "";
    let notice = "";
    let info = "";
    let currentRows: GscRow[] = [];
    let previousRows: GscRow[] = [];
    const sc = deps.searchConsole;
    if (site.gscProperty && sc?.configured()) {
      try {
        const periods = demandPeriods(now);
        const [current, before] = await Promise.all([sc.queries(site.gscProperty, ...periods.current), sc.queries(site.gscProperty, ...periods.previous)]);
        currentRows = current;
        previousRows = before;
        demand = summarizeDemand(current, before);
        info = `Search Console: ${current.length} Suchbegriffe der letzten 28 Tage gelesen (${periods.current[0]} bis ${periods.current[1]}).`;
        if (!demand) notice = "Hinweis: Die Search Console lieferte für die letzten Wochen keine Suchbegriffe.";
      } catch (error) {
        notice = `Hinweis: Die Search Console konnte nicht gelesen werden, der Lauf erfolgte ohne Suchdaten. ${error instanceof Error ? error.message : String(error)}`;
      }
    } else if (site.gscProperty) {
      info = "Search Console: nicht genutzt (kein Schlüssel).";
      notice = "Hinweis: Für die Search Console wurde kein Schlüssel gefunden (Ordner secrets).";
    }

    const previous = await prisma.topicIdea.findMany({ where: { siteId } });
    const rejected = previous.filter((i) => i.dismissed).map((i) => i.title);
    const result = await ai.scoutTopics({
      site: profile,
      portfolio,
      existingTitles: [...previous.filter((i) => i.doneAt || i.postId).map((i) => i.title), ...posts.map((p) => p.title)],
      rejectedTitles: rejected,
      today: now.toISOString().slice(0, 10),
      ...(demand ? { demand } : {}),
      ...(focus ? { focus } : {}),
    });

    const rejectedKeys = new Set(rejected.map((t) => t.toLowerCase()));
    const ideas = result.ideas
      .map((i) => ({ ...i, title: i.title.trim().slice(0, 200), sources: i.sources.filter((s) => httpUrl(s.url)).slice(0, 5) }))
      .filter((i) => i.title && !rejectedKeys.has(i.title.toLowerCase()));
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    ideas.sort((a, b) => (rank[a.urgency] ?? 1) - (rank[b.urgency] ?? 1));

    if (currentRows.length) info += ` ${ideas.filter((i) => demandNoteFor(i, currentRows, previousRows)).length} von ${ideas.length} Ideen konnten mit Suchdaten belegt werden.`;

    // Ein automatischer Lauf ersetzt die alten automatischen Vorschlaege (nicht abgelehnte, umgesetzte oder eigene). Eine gezielte Suche fuegt nur hinzu.
    const origin = focus ? "focus" : "scout";
    if (focus) info = `Gezielte Suche zu „${focus.slice(0, 80)}“: ${ideas.length} Vorschläge. ${info}`.trim();
    await prisma.$transaction([
      ...(focus ? [] : [prisma.topicIdea.deleteMany({ where: { siteId, origin: "scout", dismissed: false, postId: null, doneAt: null } })]),
      prisma.topicIdea.createMany({
        data: ideas.map((i) => ({ siteId, origin, title: i.title, keyword: i.keyword.trim().slice(0, 120), area: i.area.trim().slice(0, 80), urgency: i.urgency, whyNow: i.whyNow, angle: i.angle, demandNote: demandNoteFor(i, currentRows, previousRows).slice(0, 400), sources: i.sources })),
      }),
      prisma.site.update({ where: { id: siteId }, data: { scoutLastError: notice.slice(0, 600), scoutLastInfo: info.slice(0, 400) } }),
    ]);
  } catch (error) {
    await prisma.site.updateMany({ where: { id: siteId }, data: { scoutLastError: explainAiError(error).slice(0, 600) } });
  } finally {
    await prisma.site.updateMany({ where: { id: siteId }, data: { scoutRunning: false } }).catch(() => undefined);
  }
}
