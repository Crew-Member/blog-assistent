import sanitizeHtml from "sanitize-html";

const ALLOWED_TAGS = ["h2", "h3", "h4", "p", "ul", "ol", "li", "strong", "em", "blockquote", "a", "br", "table", "thead", "tbody", "tr", "th", "td"];

/** Beitrags-HTML auf eine kleine, WordPress-taugliche Tag-Menge reduzieren (keine Skripte, keine Inline-Styles). */
export function sanitizePostHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "noopener noreferrer" },
      }),
    },
  }).trim();
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const normUrl = (u: string) => u.trim().replace(/#.*$/, "").replace(/\/+$/, "").toLowerCase();

/** Entfernt Links auf die eigene Website, die nicht in der Liste bekannter Seiten stehen (der Linktext bleibt) - Schutz vor erfundenen internen URLs. */
export function unwrapUnknownInternalLinks(html: string, siteOrigin: string, allowed: Iterable<string>): string {
  let origin: string;
  try {
    origin = new URL(siteOrigin).origin.toLowerCase();
  } catch {
    return html;
  }
  const known = new Set([...allowed].map(normUrl));
  return html.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, inner: string) => {
    let url: URL;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), origin);
    } catch {
      return whole;
    }
    if (url.origin.toLowerCase() !== origin) return whole;
    return known.has(normUrl(url.toString())) ? whole : inner;
  });
}
