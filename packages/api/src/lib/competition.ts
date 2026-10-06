import type { CompetitorPage } from "../ai/types.js";
import { stripHtml } from "./extract.js";
import { assertPublicHttpUrl } from "./netguard.js";

type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_HOPS = 3;
/** Treffer von Plattformen ohne Fachinhalt werden nicht verglichen. */
const SKIP_HOSTS = ["google.", "youtube.", "facebook.", "instagram.", "linkedin.", "twitter.", "x.com", "reddit.", "pinterest.", "tiktok.", "wikipedia.", "amazon."];

export interface AnalyzedPage extends CompetitorPage {
  ok: true;
}

export interface FailedPage {
  url: string;
  ok: false;
  reason: string;
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

/** Waehlt aus den Suchtreffern die vergleichbaren Seiten: ohne eigene Website, Plattformen und PDFs, je Domain nur eine. */
export function pickCompetitorUrls(results: { url: string }[], ownBaseUrl: string, max = 6): string[] {
  const own = hostOf(ownBaseUrl);
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const { url } of results) {
    const host = hostOf(url);
    if (!host || host === own || SKIP_HOSTS.some((s) => host.includes(s)) || /\.pdf(\?|$)/i.test(url) || seen.has(host)) continue;
    seen.add(host);
    urls.push(url);
    if (urls.length >= max) break;
  }
  return urls;
}

function mainHtml(html: string): string {
  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe)\b[\s\S]*?<\/\1>/gi, "");
  return /<article\b[\s\S]*?<\/article>/i.exec(cleaned)?.[0] ?? /<main\b[\s\S]*?<\/main>/i.exec(cleaned)?.[0] ?? cleaned;
}

/** Wortzahl, Titel und Zwischenueberschriften einer HTML-Seite (Hauptinhalt, ohne Navigation/Fuss). */
export function analyzeHtml(url: string, html: string): AnalyzedPage {
  const title = stripHtml(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").slice(0, 160) || url;
  const main = mainHtml(html);
  const words = (stripHtml(main).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;
  const headings = [...main.matchAll(/<h[23]\b[^>]*>([\s\S]*?)<\/h[23]>/gi)]
    .map((m) => stripHtml(m[1] ?? "").replace(/\s+/g, " ").trim())
    .filter((h) => h.length >= 4 && h.length <= 140);
  return { ok: true, url, title, words, headings: [...new Set(headings)].slice(0, 15) };
}

function decode(buffer: ArrayBuffer, contentType: string): string {
  const charset = /charset=([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder("utf-8").decode(buffer);
  }
}

async function fetchPage(start: string, fetcher: Fetcher): Promise<AnalyzedPage | FailedPage> {
  let url = start;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
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
        headers: { accept: "text/html", "user-agent": "kdsb-blog-assistent" },
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
    if (type && !type.includes("html")) return { url: start, ok: false, reason: `Typ ${type} nicht auswertbar` };
    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) return { url: start, ok: false, reason: "zu groß" };
    const page = analyzeHtml(start, decode(buffer, type));
    return page.words < 150 ? { url: start, ok: false, reason: "kaum Text (evtl. per Skript nachgeladen)" } : page;
  }
  return { url: start, ok: false, reason: "zu viele Weiterleitungen" };
}

/** Ruft die Seiten ab (parallel) und wertet sie aus. Nie fatal: Fehler werden je Seite gemeldet. */
export async function fetchCompetitorPages(urls: string[], fetcher: Fetcher = fetch as unknown as Fetcher): Promise<(AnalyzedPage | FailedPage)[]> {
  return Promise.all(urls.map((u) => fetchPage(u, fetcher)));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

export const clampWords = (n: number) => Math.min(1800, Math.max(400, Math.round(n)));
