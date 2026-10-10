import { AsyncLocalStorage } from "node:async_hooks";

/** Bezug eines KI-Aufrufs (wird ueber AsyncLocalStorage mitgefuehrt, damit die KI-Schicht keine IDs kennen muss). */
export interface UsageContext {
  postId?: string;
  submissionId?: string;
  siteId?: string;
}

export interface UsageEntry {
  step: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  webSearches: number;
  /** Lief mit dem guenstigeren Modell (AI_MODEL_LIGHT/AI_MODEL_RESEARCH): dann gelten die Light-Preise. */
  light?: boolean;
  /** Nur bei Bildern (feste Kosten je Bild laut Konfiguration); sonst wird aus den Tokens gerechnet. */
  fixedCostUsd?: number;
}

export interface Prices {
  /** USD je 1 Mio. Eingabe-Tokens */
  inputPerMTok: number;
  /** USD je 1 Mio. Ausgabe-Tokens */
  outputPerMTok: number;
  /** USD je 1000 Websuchen */
  searchPer1000: number;
  /** Preise des guenstigeren Modells (USD je 1 Mio. Tokens); ohne Angabe gelten die Hauptpreise. */
  lightInputPerMTok?: number;
  lightOutputPerMTok?: number;
}

export const STEP_LABELS: Record<string, string> = {
  analyze: "Unterlagen analysieren",
  research: "Recherche",
  competition_search: "Wettbewerb: Suche",
  competition: "Wettbewerb: Auswertung",
  draft: "Entwurf schreiben",
  factcheck: "Faktencheck",
  refine: "Text nachschärfen",
  titles: "Titelvorschläge",
  image_plan: "Bildvorschlag",
  image_generate: "Bild erzeugen",
  categories: "Kategorie-Vorschläge",
  style: "Stil ableiten",
  radar_search: "Radar: Suche",
  radar: "Radar: Bewertung",
  scout_search: "Themen-Scout: Suche",
  scout: "Themen-Scout: Auswahl",
};

export function costOf(entry: UsageEntry, prices: Prices): number {
  if (entry.fixedCostUsd !== undefined) return entry.fixedCostUsd;
  const inPrice = entry.light && prices.lightInputPerMTok !== undefined ? prices.lightInputPerMTok : prices.inputPerMTok;
  const outPrice = entry.light && prices.lightOutputPerMTok !== undefined ? prices.lightOutputPerMTok : prices.outputPerMTok;
  const input = (entry.inputTokens + entry.cacheReadTokens * 0.1 + entry.cacheWriteTokens * 1.25) * inPrice;
  const output = entry.outputTokens * outPrice;
  return (input + output) / 1_000_000 + (entry.webSearches * prices.searchPer1000) / 1000;
}

type Sink = (entry: UsageEntry, context: UsageContext) => void | Promise<void>;

const storage = new AsyncLocalStorage<UsageContext>();
let sink: Sink | undefined;

/** Legt fest, wohin Verbrauchsdaten geschrieben werden (in index.ts die Datenbank). Ohne Senke wird nichts erfasst. */
export function setUsageSink(next: Sink | undefined): void {
  sink = next;
}

/** Fuehrt fn aus; alle KI-Aufrufe darin werden diesem Beitrag/Upload/dieser Website zugerechnet. */
export function withUsageContext<T>(context: UsageContext, fn: () => Promise<T>): Promise<T> {
  const parent = storage.getStore() ?? {};
  return storage.run({ ...parent, ...context }, fn);
}

/** Ordnet alle folgenden KI-Aufrufe im aktuellen Ablauf (z. B. einer Anfrage) diesem Bezug zu. */
export function useUsageContext(context: UsageContext): void {
  storage.enterWith({ ...(storage.getStore() ?? {}), ...context });
}

/** Erfasst einen Verbrauchseintrag; Fehler beim Speichern duerfen nie den eigentlichen Ablauf stoeren. */
export function recordUsage(entry: UsageEntry): void {
  if (!sink) return;
  const context = storage.getStore() ?? {};
  try {
    void Promise.resolve(sink(entry, context)).catch(() => undefined);
  } catch {
    /* ignorieren */
  }
}
