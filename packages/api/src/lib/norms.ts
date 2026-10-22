/**
 * Verlinkt Normen der DSGVO und des BDSG im Text auf dsgvo-online.net:
 *   Art. 6 DSGVO / Art. 6 Abs. 1 lit. f DSGVO  ->  https://dsgvo-online.net/dsgvo/art-6-dsgvo/
 *   § 26 BDSG / § 26 Abs. 1 BDSG               ->  https://dsgvo-online.net/bdsg/26-bdsg/
 * Es wird nur die erste Fundstelle je Norm verlinkt, nie in Ueberschriften oder bestehenden Links. Ein vorhandener Link,
 * dessen Text nur aus einer solchen Norm besteht, wird auf dsgvo-online.net umgestellt.
 */
export const NORM_HOST = "dsgvo-online.net";

const TOKEN = String.raw`(?:[0-9]{1,2}[a-z]?|[a-z])(?![A-Za-zÄÖÜäöüß0-9])`;
const QUALIFIER = String.raw`(?:\s+(?:Abs\.|Absatz|Satz|S\.|lit\.|Buchst\.|Buchstabe|Nr\.|UAbs\.|Unterabs\.)\s*${TOKEN}(?:\s*(?:,|und|oder|bis)\s*(?:lit\.\s*)?${TOKEN})*)*`;
const DSGVO = new RegExp(String.raw`(?:Art\.|Artikel)\s*(\d{1,3})${QUALIFIER}\s+(?:DSGVO|DS-GVO)(?![A-Za-zÄÖÜäöüß])`, "g");
const BDSG = new RegExp(String.raw`(?:§|Paragraf|Paragraph)\s*(\d{1,3}[a-z]?)${QUALIFIER}\s+BDSG(?![A-Za-zÄÖÜäöüß])`, "g");

export function normUrl(kind: "dsgvo" | "bdsg", number: string): string {
  return kind === "dsgvo" ? `https://${NORM_HOST}/dsgvo/art-${number}-dsgvo/` : `https://${NORM_HOST}/bdsg/${number.toLowerCase()}-bdsg/`;
}

/** Findet Normverweise in einem Textstueck (kein HTML): Fundstelle, Text, Norm-Schluessel und Adresse. */
export function findNorms(text: string): { index: number; text: string; key: string; url: string }[] {
  const out: { index: number; text: string; key: string; url: string }[] = [];
  for (const m of text.matchAll(DSGVO)) out.push({ index: m.index ?? 0, text: m[0], key: `dsgvo-${m[1]}`, url: normUrl("dsgvo", m[1] ?? "") });
  for (const m of text.matchAll(BDSG)) out.push({ index: m.index ?? 0, text: m[0], key: `bdsg-${(m[1] ?? "").toLowerCase()}`, url: normUrl("bdsg", m[1] ?? "") });
  return out.sort((a, b) => a.index - b.index);
}

export function isNormLink(href: string): boolean {
  try {
    const u = new URL(href.replace(/&amp;/g, "&"));
    return /^https?:$/.test(u.protocol) && u.hostname.toLowerCase().replace(/^www\./, "") === NORM_HOST;
  } catch {
    return false;
  }
}

const plain = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

export function autoLinkNorms(html: string): string {
  // 1. Vorhandene Links, deren Text nur aus einer Norm besteht, auf dsgvo-online.net umstellen (der Nutzer wuenscht diese Quelle).
  const linked = new Set<string>();
  let out = html.replace(/<a\s[^>]*?href="[^"]*"[^>]*>([\s\S]*?)<\/a>/gi, (whole, inner: string) => {
    const text = plain(inner);
    const found = findNorms(text);
    if (found.length !== 1 || found[0]!.text !== text) return whole;
    if (linked.has(found[0]!.key)) return inner;
    linked.add(found[0]!.key);
    return `<a href="${found[0]!.url}">${inner}</a>`;
  });

  // 2. Weitere Fundstellen im Fliesstext (nicht in Links und Ueberschriften): je Norm nur die erste.
  let insideAnchor = 0;
  let insideHeading = 0;
  out = out
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a\b/i.test(part)) insideAnchor++;
        else if (/^<\/a\s*>/i.test(part)) insideAnchor = Math.max(0, insideAnchor - 1);
        else if (/^<h[1-6]\b/i.test(part)) insideHeading++;
        else if (/^<\/h[1-6]\s*>/i.test(part)) insideHeading = Math.max(0, insideHeading - 1);
        return part;
      }
      if (insideAnchor > 0 || insideHeading > 0 || !part.trim()) return part;
      let res = "";
      let last = 0;
      for (const n of findNorms(part)) {
        if (linked.has(n.key) || n.index < last) continue;
        linked.add(n.key);
        res += `${part.slice(last, n.index)}<a href="${n.url}">${n.text}</a>`;
        last = n.index + n.text.length;
      }
      return res ? res + part.slice(last) : part;
    })
    .join("");
  return out;
}
