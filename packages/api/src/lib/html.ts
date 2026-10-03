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

import { isTrustedSource } from "./links.js";

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

export const MAX_EXTERNAL_LINKS = 5;
export const MAX_INTERNAL_LINKS = 2;

/**
 * Linkregeln: extern nur amtliche Stellen, Gerichte sowie Gesetzes-/Rechtsprechungsdatenbanken und Datenschutzbehoerden;
 * intern nur bekannte Seiten der Website. Alles andere (z. B. Wettbewerber, Fachportale) verliert den Link, der Text bleibt.
 * Je Zieladresse zaehlt nur der erste Link; insgesamt hoechstens MAX_EXTERNAL_LINKS externe und MAX_INTERNAL_LINKS interne.
 */
export function applyLinkPolicy(html: string, siteOrigin: string, internalAllowed: Iterable<string>): string {
  let origin = "";
  try {
    origin = siteOrigin ? new URL(siteOrigin).origin.toLowerCase() : "";
  } catch {
    origin = "";
  }
  const known = new Set([...internalAllowed].map(normUrl));
  const seen = new Set<string>();
  let external = 0;
  let internal = 0;
  return html.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, inner: string) => {
    if (/^mailto:/i.test(href)) return whole;
    let url: URL;
    try {
      url = new URL(href.replace(/&amp;/g, "&"), origin || undefined);
    } catch {
      return inner;
    }
    const key = normUrl(url.toString());
    if (seen.has(key)) return inner;
    const isInternal = Boolean(origin) && url.origin.toLowerCase() === origin;
    if (isInternal) {
      if (!known.has(key) || internal >= MAX_INTERNAL_LINKS) return inner;
      internal++;
    } else {
      if (!/^https?:$/.test(url.protocol) || !isTrustedSource(url.toString()) || external >= MAX_EXTERNAL_LINKS) return inner;
      external++;
    }
    seen.add(key);
    return whole;
  });
}

/** Entfernt alle Links, deren Adresse nicht in der Liste steht (Linktext bleibt). */
export function unwrapLinksNotIn(html: string, allowed: Iterable<string>): string {
  const known = new Set([...allowed].map(normUrl));
  return html.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, inner: string) => (known.has(normUrl(href.replace(/&amp;/g, "&"))) ? whole : inner));
}
