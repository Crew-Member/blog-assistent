import { stripHtml } from "./extract.js";

export type ReferenceKind = "aktenzeichen" | "norm" | "datum";

export interface Reference {
  kind: ReferenceKind;
  /** Wie der Text im Beitrag steht. */
  text: string;
  /** Normalisierter Vergleichsschluessel. */
  key: string;
}

const MONTHS: Record<string, number> = {
  januar: 1, februar: 2, "märz": 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12,
};

const compact = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

// "II ZR 123/21", "8 AZR 123/23", "1 BvR 2835/17" - Zahl/roemische Zahl, Spruchkoerper-Kuerzel, laufende Nummer/Jahr
const AKTENZEICHEN = /\b(?:[IVX]{1,5}|\d{1,2})\s[A-ZÄÖÜ][A-Za-zÄÖÜ]{0,4}\s\d{1,5}\/\d{2}\b/g;
const EUGH = /\b[CT]-\d{1,4}\/\d{2}\b/g;
// "§ 26 BDSG", "§§ 26 Abs. 1 S. 1 BDSG", "Art. 6 Abs. 1 lit. f DSGVO"
const NORM = /(§§?|Art(?:ikel|\.)?)\s?(\d+[a-z]?)\.?(?:\s?(?:Abs\.|Absatz)\s?\d+)?(?:\s?(?:S\.|Satz)\s?\d+)?(?:\s?(?:Nr\.|lit\.)\s?\w+\)?|\s[a-z]\))?\s+([A-ZÄÖÜ][A-Za-zÄÖÜ]{1,10})\b/g;
const DATE_NUMERIC = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})\b/g;
const DATE_WORDS = /\b(\d{1,2})\.\s?(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s(\d{4})\b/gi;

const dateKey = (d: number | string, m: number | string, y: number | string) => `${Number(d)}.${Number(m)}.${y}`;

/** Zieht pruefbare Fundstellen (Aktenzeichen, Normen, Daten) aus einem Text. */
export function extractReferences(text: string): Reference[] {
  const found = new Map<string, Reference>();
  const add = (kind: ReferenceKind, raw: string, key: string) => {
    const k = `${kind}:${key}`;
    if (!found.has(k)) found.set(k, { kind, text: raw.trim(), key });
  };

  for (const m of text.matchAll(AKTENZEICHEN)) add("aktenzeichen", m[0], compact(m[0]));
  for (const m of text.matchAll(EUGH)) add("aktenzeichen", m[0], compact(m[0]));
  for (const m of text.matchAll(NORM)) {
    const sign = m[1]!.startsWith("§") ? "§" : "art";
    add("norm", m[0], `${sign}${m[2]!.toLowerCase()} ${m[3]!.toLowerCase()}`);
  }
  for (const m of text.matchAll(DATE_NUMERIC)) add("datum", m[0], dateKey(m[1]!, m[2]!, m[3]!));
  for (const m of text.matchAll(DATE_WORDS)) add("datum", m[0], dateKey(m[1]!, MONTHS[m[2]!.toLowerCase()] ?? 0, m[3]!));
  return [...found.values()];
}

export interface ReferenceCheck extends Reference {
  found: boolean;
}

/**
 * Prueft, ob jede Fundstelle des Beitrags auch in den Belegen (Recherchenotizen, Eckdaten, Unterlagen) vorkommt.
 * Nicht auffindbare Fundstellen sind kein Beweis fuer einen Fehler, aber ein klarer Hinweis zum Nachpruefen.
 */
export function checkReferences(articleHtml: string, evidence: string[]): ReferenceCheck[] {
  const corpusKeys = new Set(extractReferences(evidence.join("\n")).map((r) => `${r.kind}:${r.key}`));
  const corpusText = compact(evidence.join("\n"));
  return extractReferences(stripHtml(articleHtml)).map((ref) => ({
    ...ref,
    found: corpusKeys.has(`${ref.kind}:${ref.key}`) || (ref.kind !== "datum" && corpusText.includes(compact(ref.text))),
  }));
}
