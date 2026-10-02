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
