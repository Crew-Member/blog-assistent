import { escapeHtml } from "./html.js";
import { sanitizePostHtml } from "./html.js";

/** Eine Zeile der Zielseiten-Liste: "Kategorie | https://… | Linktext". */
export interface ClosingTarget {
  category: string;
  url: string;
  label: string;
}

const norm = (s: string) => s.replace(/&amp;/g, "&").trim().toLowerCase();

/** Liest die Liste; ungueltige Zeilen (ohne https-Adresse) werden uebersprungen. */
export function parseClosingTargets(text: string): ClosingTarget[] {
  const targets: ClosingTarget[] = [];
  for (const line of text.split(/\r?\n/)) {
    const [category, url, ...rest] = line.split("|").map((p) => p.trim());
    if (!category || !url || !/^https:\/\/\S+$/i.test(url)) continue;
    targets.push({ category, url, label: rest.join("|").trim() || category });
  }
  return targets;
}

/** Standard = Zeile "Standard" (oder "*"), sonst die erste Zeile. */
export function defaultTarget(targets: ClosingTarget[]): ClosingTarget | undefined {
  return targets.find((t) => ["standard", "*"].includes(norm(t.category))) ?? targets[0];
}

/** Zielseite zu einem Kategorienamen; ohne Treffer die Standard-Zeile. */
export function targetFor(targets: ClosingTarget[], categoryName?: string): ClosingTarget | undefined {
  const hit = categoryName ? targets.find((t) => norm(t.category) === norm(categoryName)) : undefined;
  return hit ?? defaultTarget(targets);
}

/**
 * Fester Schlussabsatz (bereinigt). Enthaelt er die Platzhalter {{url}} und {{bereich}}, werden sie mit der Zielseite gefuellt;
 * ohne Zielseite faellt der Absatz weg, statt unfertige Platzhalter zu zeigen.
 */
export function resolveClosing(closingHtml: string, target?: ClosingTarget): string {
  if (!closingHtml.trim()) return "";
  const hasPlaceholders = /\{\{\s*(url|bereich)\s*\}\}/i.test(closingHtml);
  if (!hasPlaceholders) return sanitizePostHtml(closingHtml);
  if (!target) return "";
  const filled = closingHtml
    .replace(/\{\{\s*url\s*\}\}/gi, escapeHtml(target.url))
    .replace(/\{\{\s*bereich\s*\}\}/gi, escapeHtml(target.label));
  return sanitizePostHtml(filled);
}

/** Schlussabsatz einer Website fuer eine bestimmte Hauptkategorie (ohne Kategorie: Standard). */
export function siteClosing(site: { closingHtml: string; closingTargets?: string }, categoryName?: string): string {
  return resolveClosing(site.closingHtml, targetFor(parseClosingTargets(site.closingTargets ?? ""), categoryName));
}
