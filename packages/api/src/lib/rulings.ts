import { isTrustedSource, rulingSourceRank } from "./links.js";
import { findAktenzeichen } from "./references.js";

export interface RulingCandidate {
  url: string;
  title?: string;
  note?: string;
}

/** Aktenzeichen in vergleichbare Form: nur Buchstaben und Ziffern, klein ("II ZR 123/21" und "II-ZR-123-21" werden gleich). */
const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöü]+/g, "");

/**
 * Verlinkt zitierte Entscheidungen: Steht ein Aktenzeichen im Text (ausserhalb von Links) und gibt es eine vertrauenswuerdige Quelle,
 * in deren Adresse, Titel oder Notiz dasselbe Aktenzeichen vorkommt, wird die erste Fundstelle verlinkt - bevorzugt auf die Website des Gerichts.
 */
export function autoLinkRulings(html: string, candidates: RulingCandidate[]): string {
  const usable = candidates.filter((c) => c.url && isTrustedSource(c.url));
  if (usable.length === 0) return html;
  const linked = new Set<string>();
  let insideAnchor = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a\b/i.test(part)) insideAnchor++;
        else if (/^<\/a\s*>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
        return part;
      }
      if (insideAnchor > 0 || !part.trim()) return part;
      let out = "";
      let last = 0;
      for (const az of findAktenzeichen(part)) {
        const key = flat(az.text);
        if (linked.has(key) || az.index < last) continue;
        const best = usable
          .filter((c) => flat(`${c.url} ${c.title ?? ""} ${c.note ?? ""}`).includes(key))
          .sort((a, b) => rulingSourceRank(a.url) - rulingSourceRank(b.url))[0];
        if (!best) continue;
        linked.add(key);
        const href = best.url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
        out += `${part.slice(last, az.index)}<a href="${href}">${az.text}</a>`;
        last = az.index + az.text.length;
      }
      return out ? out + part.slice(last) : part;
    })
    .join("");
}
