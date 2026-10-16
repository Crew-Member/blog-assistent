import { urlKey } from "./html.js";
import type { GscPageQueryRow, GscPageRow } from "./gsc.js";

export type PotentialKind = "quick_win" | "low_ctr" | "declining" | "cannibalization";

export interface PotentialItem {
  wpPostId: number;
  title: string;
  url: string;
  kind: PotentialKind;
  /** Grobe Schaetzung zusaetzlicher Klicks je 28 Tage (nur zur Sortierung und Einordnung). */
  score: number;
  headline: string;
  details: string[];
  topQueries: { query: string; impressions: number; clicks: number; position: number }[];
  /** Fertige Anweisung fuer die Ueberarbeitung. */
  instructions: string;
  competing?: { title: string; url: string }[];
}

export interface SeoPost {
  id: number;
  title: string;
  url: string;
}

/** Typische Klickrate in Abhaengigkeit von der durchschnittlichen Position (grobe Richtwerte). */
export function expectedCtr(position: number): number {
  if (position <= 1.5) return 0.28;
  if (position <= 2.5) return 0.15;
  if (position <= 3.5) return 0.1;
  if (position <= 5.5) return 0.06;
  if (position <= 8.5) return 0.03;
  if (position <= 10.5) return 0.02;
  return 0.01;
}

const pct = (x: number) => `${(x * 100).toFixed(1).replace(".", ",")} %`;
const pos = (x: number) => x.toFixed(1).replace(".", ",");

/** Schwellenwerte; bei wenig Suchverkehr gelten niedrigere Mindestmengen, damit auch kleine Websites Hinweise bekommen. */
export function seoThresholds(totalImpressions: number) {
  const relaxed = totalImpressions < 3000;
  return relaxed
    ? { relaxed, quickWinMin: 15, quickWinPosMin: 6, quickWinPosMax: 25, lowCtrMin: 60, declineMin: 40, cannibalTotal: 30, cannibalEach: 8 }
    : { relaxed, quickWinMin: 50, quickWinPosMin: 7, quickWinPosMax: 20, lowCtrMin: 200, declineMin: 100, cannibalTotal: 80, cannibalEach: 20 };
}

export interface SeoOverviewRow {
  wpPostId: number;
  title: string;
  url: string;
  impressions: number;
  clicks: number;
  position: number;
}

/** Zahlen je Beitrag (nur Seiten, die einem Beitrag zugeordnet werden koennen), nach Einblendungen sortiert. */
export function seoOverview(posts: SeoPost[], now: GscPageRow[]): { rows: SeoOverviewRow[]; matchedPages: number; unmatchedPages: number; impressions: number } {
  const byUrl = new Map(posts.map((p) => [urlKey(p.url), p]));
  const merged = new Map<string, SeoOverviewRow>();
  let unmatched = 0;
  for (const r of now) {
    const post = byUrl.get(urlKey(r.page));
    if (!post) {
      unmatched++;
      continue;
    }
    const prev = merged.get(post.url);
    if (prev) {
      const total = prev.impressions + r.impressions;
      prev.position = total > 0 ? (prev.position * prev.impressions + r.position * r.impressions) / total : prev.position;
      prev.impressions = total;
      prev.clicks += r.clicks;
    } else {
      merged.set(post.url, { wpPostId: post.id, title: post.title, url: post.url, impressions: r.impressions, clicks: r.clicks, position: r.position });
    }
  }
  const rows = [...merged.values()].sort((a, b) => b.impressions - a.impressions);
  return { rows, matchedPages: rows.length, unmatchedPages: unmatched, impressions: rows.reduce((s, r) => s + r.impressions, 0) };
}

export function analyzeSeoPotential(input: { posts: SeoPost[]; now: GscPageRow[]; previous: GscPageRow[]; queries: GscPageQueryRow[] }): PotentialItem[] {
  const byUrl = new Map(input.posts.map((p) => [urlKey(p.url), p]));
  const prev = new Map(input.previous.map((r) => [urlKey(r.page), r]));
  const queriesOf = new Map<string, GscPageQueryRow[]>();
  for (const q of input.queries) {
    const key = urlKey(q.page);
    if (!byUrl.has(key)) continue;
    (queriesOf.get(key) ?? queriesOf.set(key, []).get(key)!).push(q);
  }
  const top = (key: string) =>
    (queriesOf.get(key) ?? [])
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 5)
      .map((q) => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, position: q.position }));
  const quoted = (list: { query: string }[]) => list.slice(0, 3).map((q) => `„${q.query}“`).join(", ");

  const T = seoThresholds(seoOverview(input.posts, input.now).impressions);
  const items: PotentialItem[] = [];
  const seen = new Set<string>();
  for (const row of input.now) {
    const key = urlKey(row.page);
    const post = byUrl.get(key);
    if (!post || seen.has(key)) continue;
    seen.add(key);
    const ctr = row.impressions > 0 ? row.clicks / row.impressions : 0;
    const queries = top(key);
    const base = { wpPostId: post.id, title: post.title, url: post.url, topQueries: queries };

    if (row.position >= T.quickWinPosMin && row.position <= T.quickWinPosMax && row.impressions >= T.quickWinMin) {
      const gain = Math.max(0, row.impressions * (0.08 - ctr));
      items.push({
        ...base,
        kind: "quick_win",
        score: Math.round(gain),
        headline: `Platz ${pos(row.position)}: kurz vor der ersten Seite`,
        details: [`${row.impressions} Einblendungen, ${row.clicks} Klicks (${pct(ctr)}) in 28 Tagen.`, queries.length ? `Wichtigste Suchanfragen: ${quoted(queries)}.` : ""].filter(Boolean),
        instructions: `SEO-Verbesserung: Der Beitrag steht bei Google im Schnitt auf Position ${pos(row.position)} (${row.impressions} Einblendungen in 28 Tagen).${queries.length ? ` Wichtigste Suchanfragen: ${quoted(queries)}.` : ""} Ziel ist eine bessere Platzierung: Inhalte zu diesen Suchanfragen klarer und vollständiger abdecken, Titel, Einstieg und Zwischenüberschriften schärfen, Aktualität prüfen. Den Text nicht unnötig aufblähen.`,
      });
    }
    if (row.position <= 10.5 && row.impressions >= T.lowCtrMin && ctr < expectedCtr(row.position) * 0.6) {
      const gain = row.impressions * (expectedCtr(row.position) - ctr);
      items.push({
        ...base,
        kind: "low_ctr",
        score: Math.round(gain),
        headline: `Oft angezeigt, selten geklickt (${pct(ctr)})`,
        details: [`${row.impressions} Einblendungen, Position ${pos(row.position)}, aber nur ${row.clicks} Klicks. Üblich wären bei dieser Position etwa ${pct(expectedCtr(row.position))}.`, queries.length ? `Wichtigste Suchanfragen: ${quoted(queries)}.` : ""].filter(Boolean),
        instructions: `Die Seite wird oft angezeigt (${row.impressions} Einblendungen in 28 Tagen, Position ${pos(row.position)}), aber selten angeklickt (Klickrate ${pct(ctr)}).${queries.length ? ` Wichtigste Suchanfrage: „${queries[0]!.query}“.` : ""} Titel und Meta-Beschreibung so überarbeiten, dass sie die wichtigste Suchanfrage aufgreifen und zum Klick motivieren (Nutzen und Aktualität nennen). Den Text nur ändern, wo es dafür nötig ist.`,
      });
    }
    const before = prev.get(key);
    if (before && before.impressions >= T.declineMin) {
      const impDrop = (before.impressions - row.impressions) / before.impressions;
      const clickDrop = before.clicks >= 10 ? (before.clicks - row.clicks) / before.clicks : 0;
      if (impDrop >= 0.3 || clickDrop >= 0.3) {
        items.push({
          ...base,
          kind: "declining",
          score: Math.round(Math.max(before.clicks - row.clicks, (before.impressions - row.impressions) * 0.03)),
          headline: "Sichtbarkeit gesunken",
          details: [`Einblendungen: ${before.impressions} → ${row.impressions}; Klicks: ${before.clicks} → ${row.clicks} (gegenüber den 28 Tagen davor).`],
          instructions: `Die Sichtbarkeit dieses Beitrags ist gesunken (Einblendungen ${before.impressions} → ${row.impressions}, Klicks ${before.clicks} → ${row.clicks} gegenüber den 28 Tagen davor). Auf Aktualität prüfen (neue Rechtsprechung, Gesetzesänderungen, geänderte Fristen), veraltete Aussagen aktualisieren und Titel sowie Einstieg an die gefragten Suchanfragen anpassen.`,
        });
      }
    }
  }

  // Kannibalisierung: derselbe Suchbegriff bringt mehreren eigenen Beitraegen Einblendungen, ohne dass einer vorne steht.
  const byQuery = new Map<string, GscPageQueryRow[]>();
  for (const q of input.queries) {
    if (q.impressions < T.cannibalEach || !byUrl.has(urlKey(q.page))) continue;
    const k = q.query.toLowerCase();
    (byQuery.get(k) ?? byQuery.set(k, []).get(k)!).push(q);
  }
  const claimed = new Set<number>();
  for (const [query, rows] of [...byQuery.entries()].sort((a, b) => b[1].reduce((s, r) => s + r.impressions, 0) - a[1].reduce((s, r) => s + r.impressions, 0))) {
    const distinct = new Map(rows.map((r) => [urlKey(r.page), r]));
    if (distinct.size < 2) continue;
    const list = [...distinct.values()].sort((a, b) => b.impressions - a.impressions);
    const total = list.reduce((s, r) => s + r.impressions, 0);
    if (total < T.cannibalTotal || Math.min(...list.map((r) => r.position)) <= 3) continue;
    const weaker = byUrl.get(urlKey(list[list.length - 1]!.page))!;
    if (claimed.has(weaker.id)) continue;
    claimed.add(weaker.id);
    const others = list.slice(0, -1).map((r) => byUrl.get(urlKey(r.page))!).filter(Boolean);
    items.push({
      wpPostId: weaker.id,
      title: weaker.title,
      url: weaker.url,
      kind: "cannibalization",
      score: Math.round(total * 0.05),
      headline: `Konkurriert mit eigenem Beitrag um „${query}“`,
      details: [`Für „${query}“ erscheinen ${distinct.size} eigene Beiträge (zusammen ${total} Einblendungen, beste Position ${pos(Math.min(...list.map((r) => r.position)))}).`, ...list.map((r) => `${byUrl.get(urlKey(r.page))!.title}: Position ${pos(r.position)}, ${r.impressions} Einblendungen`)],
      topQueries: top(urlKey(weaker.url)),
      competing: others.map((o) => ({ title: o.title, url: o.url })),
      instructions: `Dieser Beitrag konkurriert bei der Suchanfrage „${query}“ mit dem eigenen Beitrag „${others[0]?.title ?? ""}“. Schärfe den eigenen Schwerpunkt dieses Beitrags, damit sich beide nicht gegenseitig Platzierungen wegnehmen: andere Fragestellung, anderer Titel und andere Überschriften; wo es inhaltlich passt, auf den anderen Beitrag verweisen.`,
    });
  }

  return items.sort((a, b) => b.score - a.score).slice(0, 40);
}
