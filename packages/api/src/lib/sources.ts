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

async function fetchOne(start: string, fetcher: Fetcher): Promise<PrimarySource> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    if (!isFreeSource(url)) return { url: start, ok: false, reason: "keine frei zugängliche Primärquelle" };
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
    if (buffer.byteLength > MAX_BYTES) return { url: start, ok: false, reason: "zu groß" };
    if (type.includes("application/pdf")) {
      if (buffer.byteLength > MAX_PDF_BYTES) return { url: start, ok: false, reason: "PDF zu groß" };
      return { url: start, ok: true, document: { filename: `Quelle: ${start}`, kind: "pdf", mimeType: "application/pdf", base64: Buffer.from(buffer).toString("base64") } };
    }
    if (type.includes("text/html") || type.includes("text/plain") || type === "") {
      const text = stripHtml(decode(buffer, type)).slice(0, MAX_TEXT_CHARS);
      if (text.length < 200) return { url: start, ok: false, reason: "kein auswertbarer Text" };
      return { url: start, ok: true, document: { filename: `Quelle: ${start}`, kind: "text", mimeType: "text/plain", text } };
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
