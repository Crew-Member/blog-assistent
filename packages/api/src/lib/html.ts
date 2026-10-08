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

/** Vergleichsschluessel einer Adresse: ohne Protokoll, "www." und abschliessenden Schraegstrich, Kleinschreibung (Anker entfernt, Query bleibt). */
export function urlKey(raw: string): string {
  try {
    const u = new URL(raw.trim());
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Entfernt Links auf bestimmte Adressen (z. B. den ersetzten Originalbeitrag); der Linktext bleibt. */
export function unwrapBlockedLinks(html: string, blockedUrls: Iterable<string>): string {
  const blocked = new Set([...blockedUrls].map(urlKey));
  if (blocked.size === 0) return html;
  return html.replace(/<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (whole, href: string, inner: string) => (blocked.has(urlKey(href.replace(/&amp;/g, "&"))) ? inner : whole));
}

export const MAX_EXTERNAL_LINKS = 8;
export const MAX_INTERNAL_LINKS = 2;
/** Ziel: mindestens so viele ausgehende Links; fehlen Primaerquellen, duerfen allgemeine Quellen auffuellen. */
export const MIN_EXTERNAL_LINKS = 3;
/** Plattformen, auf die nie verlinkt wird (Netzwerke, Shops). */
const NO_LINK_HOSTS = ["facebook.", "instagram.", "linkedin.", "twitter.", "x.com", "tiktok.", "pinterest.", "reddit.", "amazon.", "ebay.", "xing."];

export interface LinkPolicyOptions {
  /**
   * Allgemeine externe Quellen (Infoportale, Presse, Fachblogs), die zusaetzlich zu Behoerden/Gerichten/Rechtsdatenbanken erlaubt sind -
   * aber nur diese Adressen (z. B. aus der Recherche) und nur, solange weniger als MIN_EXTERNAL_LINKS Primaerquellen verlinkt sind.
   * Ohne Angabe sind nur Primaerquellen erlaubt.
   */
  generalAllowed?: Iterable<string>;
  /** Domains, auf die nicht verlinkt wird (z. B. verglichene Wettbewerber-Seiten). */
  blockedHosts?: Iterable<string>;
  /** Adressen, auf die nie verlinkt wird (z. B. der Originalbeitrag, den die Ueberarbeitung ersetzt). */
  blockedUrls?: Iterable<string>;
}

const hostName = (url: URL) => url.hostname.toLowerCase().replace(/^www\./, "");

/**
 * Linkregeln: extern bevorzugt amtliche Stellen, Gerichte sowie Gesetzes-/Rechtsprechungsdatenbanken und Datenschutzbehoerden;
 * fehlen solche, duerfen (bis MIN_EXTERNAL_LINKS) allgemeine Quellen aus der Recherche verlinkt werden. Intern nur bekannte Seiten der Website.
 * Alles andere verliert den Link, der Text bleibt. Je Zieladresse zaehlt nur der erste Link; hoechstens MAX_EXTERNAL_LINKS externe und MAX_INTERNAL_LINKS interne.
 */
export function applyLinkPolicy(html: string, siteOrigin: string, internalAllowed: Iterable<string>, options: LinkPolicyOptions = {}): string {
  let origin = "";
  try {
    origin = siteOrigin ? new URL(siteOrigin).origin.toLowerCase() : "";
  } catch {
    origin = "";
  }
  const known = new Set([...internalAllowed].map(urlKey));
  const general = new Set([...(options.generalAllowed ?? [])].map(normUrl));
  const blocked = new Set([...(options.blockedHosts ?? [])].map((h) => h.toLowerCase().replace(/^www\./, "")));
  const blockedUrls = new Set([...(options.blockedUrls ?? [])].map(urlKey));
  const anchor = /<a\s[^>]*?href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;

  const parse = (href: string): URL | undefined => {
    try {
      return new URL(href.replace(/&amp;/g, "&"), origin || undefined);
    } catch {
      return undefined;
    }
  };
  const ownHost = origin ? hostName(new URL(origin)) : "";
  const isInternal = (url: URL) => Boolean(ownHost) && hostName(url) === ownHost;
  const isPrimary = (url: URL) => /^https?:$/.test(url.protocol) && !blocked.has(hostName(url)) && isTrustedSource(url.toString());
  const isGeneral = (url: URL) =>
    /^https?:$/.test(url.protocol) && general.has(normUrl(url.toString())) && !blocked.has(hostName(url)) && !NO_LINK_HOSTS.some((h) => hostName(url).includes(h));

  // 1. Durchgang: wie viele Primaerquellen bleiben (bis zur Obergrenze)? Daraus ergibt sich das Budget fuer allgemeine Quellen.
  const primaries = new Set<string>();
  for (const m of html.matchAll(anchor)) {
    const url = parse(m[1] ?? "");
    if (url && !isInternal(url) && isPrimary(url) && primaries.size < MAX_EXTERNAL_LINKS) primaries.add(normUrl(url.toString()));
  }
  let generalBudget = Math.max(0, MIN_EXTERNAL_LINKS - primaries.size);

  // 2. Durchgang: anwenden.
  const seen = new Set<string>();
  let external = 0;
  let internal = 0;
  return html.replace(anchor, (whole, href: string, inner: string) => {
    if (/^mailto:/i.test(href)) return whole;
    const url = parse(href);
    if (!url) return inner;
    const key = normUrl(url.toString());
    if (seen.has(key) || blockedUrls.has(urlKey(url.toString()))) return inner;
    if (isInternal(url)) {
      if (!known.has(urlKey(url.toString())) || internal >= MAX_INTERNAL_LINKS) return inner;
      internal++;
    } else if (isPrimary(url)) {
      if (external >= MAX_EXTERNAL_LINKS) return inner;
      external++;
    } else if (isGeneral(url)) {
      if (generalBudget <= 0 || external >= MAX_EXTERNAL_LINKS) return inner;
      generalBudget--;
      external++;
    } else {
      return inner;
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
