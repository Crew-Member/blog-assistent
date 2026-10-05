import { explainAiError } from "./ai/errors.js";
import { stripHtml } from "./lib/extract.js";
import { fetchAllSitePosts, fetchSitePost } from "./lib/wordpress.js";
import type { PipelineDeps } from "./pipeline.js";

/** Beitraege juenger als das werden nicht geprueft. */
export const RADAR_MIN_AGE_DAYS = 90;
/** Ein bereits gepruefter Beitrag kommt fruehestens nach so vielen Tagen erneut dran. */
export const RADAR_RECHECK_DAYS = 180;
/** Automatischer Lauf je Website hoechstens in diesem Abstand. */
export const RADAR_INTERVAL_DAYS = 7;
/** Beitraege je Lauf (jeder Beitrag = eine Recherche, also Kosten). */
export const RADAR_BATCH = 5;

const DAY_MS = 86_400_000;

/** Prueft einige aeltere Beitraege einer Website auf Aktualitaet und speichert die Befunde. Wirft nie. */
export async function runRadar(deps: PipelineDeps, siteId: string, now = new Date(), batch = RADAR_BATCH): Promise<void> {
  const { prisma, ai } = deps;
  try {
    const site = await prisma.site.findUniqueOrThrow({ where: { id: siteId } });
    if (!site.baseUrl) throw new Error("Für die Website ist keine Adresse hinterlegt.");
    const profile = { name: site.name, language: site.language, audience: site.audience, tone: site.tone, styleGuide: site.styleGuide };

    const posts = await fetchAllSitePosts(site.baseUrl, 10, deps.fetcher as never);
    const known = new Map((await prisma.radarFinding.findMany({ where: { siteId } })).map((f) => [f.wpPostId, f]));
    const candidates = posts
      .filter((p) => {
        const published = Date.parse(p.date);
        if (!Number.isFinite(published) || now.getTime() - published < RADAR_MIN_AGE_DAYS * DAY_MS) return false;
        const f = known.get(p.id);
        return !f || now.getTime() - f.checkedAt.getTime() >= RADAR_RECHECK_DAYS * DAY_MS;
      })
      // Noch nie gepruefte zuerst, innerhalb davon die aeltesten.
      .sort((a, b) => Number(known.has(a.id)) - Number(known.has(b.id)) || Date.parse(a.date) - Date.parse(b.date))
      .slice(0, batch);

    for (const p of candidates) {
      let html: string;
      try {
        html = (await fetchSitePost(site.baseUrl, p.id, deps.fetcher as never)).html;
      } catch {
        continue; // einzelner Beitrag nicht ladbar: ueberspringen
      }
      const result = await ai.checkFreshness({ site: profile, post: { title: p.title, url: p.url, publishedAt: p.date.slice(0, 10), text: stripHtml(html) } });
      const previous = known.get(p.id);
      const data = {
        title: p.title,
        url: p.url,
        publishedAt: new Date(p.date),
        checkedAt: now,
        verdict: result.verdict,
        summary: result.summary,
        reasons: result.reasons,
        sources: result.sources,
        // Ein neuer Befund taucht wieder auf, auch wenn der alte ausgeblendet war.
        dismissed: result.verdict === "current" ? (previous?.dismissed ?? false) : false,
      };
      await prisma.radarFinding.upsert({ where: { siteId_wpPostId: { siteId, wpPostId: p.id } }, create: { siteId, wpPostId: p.id, ...data }, update: data });
    }
    await prisma.site.update({ where: { id: siteId }, data: { radarLastError: "" } });
  } catch (error) {
    await prisma.site.updateMany({ where: { id: siteId }, data: { radarLastError: explainAiError(error).slice(0, 600) } });
  }
}
