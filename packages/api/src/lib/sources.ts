import type { AiDocument } from "../ai/types.js";
import { stripHtml } from "./extract.js";
import { isTrustedSource } from "./links.js";
import { assertPublicHttpUrl } from "./netguard.js";

/** Bezahlportale liefern ohne Anmeldung nur eine Login-Seite - sie werden nicht abgerufen. */
const PAYWALLED = ["beck.de", "wolterskluwer.de", "wolterskluwer.com", "wolterskluwer-online.de", "jurion.de", "juris.de"];

export interface PrimarySource {
  url: string;
  ok: boolean;
  /** Warum die Quelle nicht verwendet wurde (nur bei ok=false). */
  reason?: string;
  document?: AiDocument;
}

type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 30_000;
const MAX_HOPS = 3;

function isFreeSource(url: string): boolean {
  if (!isTrustedSource(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return !PAYWALLED.some((p) => host === p || host.endsWith(`.${p}`));
  } catch {
    return false;
  }
}

function decode(buffer: ArrayBuffer, contentType: string): string {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

interface FetchOptions {
  /** Vom Nutzer genannte Links: jede oeffentliche Adresse (ausser Bezahlportale), groessere Grenzen. */
  anyHost?: boolean;
}

const LINKED_MAX_BYTES = 12 * 1024 * 1024;
const LINKED_MAX_TEXT_CHARS = 150_000;

const isPaywalled = (url: string) => {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return PAYWALLED.some((p) => host === p || host.endsWith(`.${p}`));
  } catch {
    return true;
  }
};

async function fetchOne(start: string, fetcher: Fetcher, options: FetchOptions = {}): Promise<PrimarySource> {
  let url = start;
  const maxBytes = options.anyHost ? LINKED_MAX_BYTES : MAX_BYTES;
  const maxPdf = options.anyHost ? LINKED_MAX_BYTES : MAX_PDF_BYTES;
  const maxText = options.anyHost ? LINKED_MAX_TEXT_CHARS : MAX_TEXT_CHARS;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (options.anyHost ? isPaywalled(url) : !isFreeSource(url)) return { url: start, ok: false, reason: options.anyHost ? "Bezahlportal (ohne Anmeldung nicht abrufbar)" : "keine frei zugängliche Primärquelle" };
    try {
      await assertPublicHttpUrl(url);
    } catch (error) {
      return { url: start, ok: false, reason: error instanceof Error ? error.message : String(error) };
    }
    let res: Response;
    try {
      res = await fetcher(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(12_000),
        headers: { accept: "text/html,application/pdf;q=0.9,*/*;q=0.1", "user-agent": "kdsb-blog-assistent" },
      });
    } catch (error) {
      return { url: start, ok: false, reason: `nicht erreichbar (${error instanceof Error ? error.message : String(error)})` };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url).toString();
      continue;
    }
    if (!res.ok) return { url: start, ok: false, reason: `Status ${res.status}` };
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > maxBytes) return { url: start, ok: false, reason: "zu groß" };
    if (type.includes("application/pdf")) {
      if (buffer.byteLength > maxPdf) return { url: start, ok: false, reason: "PDF zu groß" };
      return { url: start, ok: true, document: { filename: `${options.anyHost ? "Link" : "Quelle"}: ${start}`, kind: "pdf", mimeType: "application/pdf", base64: Buffer.from(buffer).toString("base64") } };
    }
    if (type.includes("text/html") || type.includes("text/plain") || type === "") {
      const text = stripHtml(decode(buffer, type)).slice(0, maxText);
      if (text.length < 200) return { url: start, ok: false, reason: "kein auswertbarer Text" };
      return { url: start, ok: true, document: { filename: `${options.anyHost ? "Link" : "Quelle"}: ${start}`, kind: "text", mimeType: "text/plain", text } };
    }
    return { url: start, ok: false, reason: `Typ ${type} nicht auswertbar` };
  }
  return { url: start, ok: false, reason: "zu viele Weiterleitungen" };
}

/**
 * Ruft frei zugängliche Primärquellen (Gerichte, Gesetze/Rechtsprechung im Internet, EUR-Lex, Datenschutzbehörden)
 * ab, damit der Faktencheck Aktenzeichen, Daten und Wortlaut direkt gegen die Quelle prüfen kann.
 * Nie fatal: Fehler werden je Quelle gemeldet.
 */
export async function fetchPrimarySources(urls: string[], fetcher: Fetcher = fetch as unknown as Fetcher, max = 4): Promise<PrimarySource[]> {
  const unique = [...new Set(urls.map((u) => u.trim().replace(/#.*$/, "")).filter(Boolean))];
  const candidates = unique.filter(isFreeSource).slice(0, max);
  return Promise.all(candidates.map((u) => fetchOne(u, fetcher)));
}

/** Adressen (http/https) aus einem Freitext, in der Reihenfolge des Auftretens, ohne Satzzeichen am Ende. */
export function urlsIn(text: string, max = 3): string[] {
  const found = [...text.matchAll(/https?:\/\/[^\s<>"')\]]+/gi)].map((m) => (m[1] ?? m[0]).replace(/[.,;:!?)]+$/, ""));
  return [...new Set(found)].slice(0, max);
}

/**
 * Ruft vom Nutzer genannte Links (z. B. zum Original-Urteil) ab - von jeder oeffentlichen Adresse, nur nicht von Bezahlportalen.
 * Nie fatal: Fehler werden je Link gemeldet.
 */
export async function fetchLinkedSources(urls: string[], fetcher: Fetcher = fetch as unknown as Fetcher): Promise<PrimarySource[]> {
  return Promise.all(urls.map((u) => fetchOne(u.trim().replace(/#.*$/, ""), fetcher, { anyHost: true })));
}
