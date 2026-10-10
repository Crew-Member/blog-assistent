import { stripHtml } from "./extract.js";
import { assertPublicHttpUrl } from "./netguard.js";

export interface WordPressPost {
  title: string;
  url: string;
  text: string;
}

type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

const MAX_BYTES = 2 * 1024 * 1024;

/** JSON auch dann lesen, wenn davor oder danach Fremdtext (CSS, Skripte, Hinweise) steht. */
export function parseJsonLoosely(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    const cleaned = body.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/^\uFEFF/, "");
    const start = cleaned.search(/\{\s*"|\[\s*[{\]"\d]/);
    if (start < 0) throw new SyntaxError("kein JSON");
    const open = cleaned[start]!;
    const end = cleaned.lastIndexOf(open === "{" ? "}" : "]");
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

async function getJson(start: URL, fetcher: Fetcher): Promise<unknown> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublicHttpUrl(url.toString());
    const res = await fetcher(url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", "user-agent": "kdsb-blog-assistent" },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = new URL(res.headers.get("location")!, url);
      continue;
    }
    if (!res.ok) throw new Error(`Die Website antwortet mit Status ${res.status}`);
    const body = await res.text();
    if (body.length > MAX_BYTES) throw new Error("Antwort der Website ist zu groß");
    // Manche Installationen (z. B. Elementor) schreiben <style>/<script>-Bloecke, BOM oder PHP-Hinweise vor das JSON.
    try {
      return parseJsonLoosely(body);
    } catch {
      const type = res.headers.get("content-type") ?? "unbekannt";
      const head = body.replace(/\s+/g, " ").trim().slice(0, 80);
      throw new Error(`Die Website liefert keine WordPress-REST-Antwort (Typ ${type}, Anfang: „${head}“)`);
    }
  }
  throw new Error("Zu viele Weiterleitungen");
}

/** Holt die neuesten veröffentlichten Beiträge einer WordPress-Seite über die öffentliche REST-API. */
export async function fetchWordPressPosts(baseUrl: string, count = 3, fetcher: Fetcher = fetch): Promise<WordPressPost[]> {
  const base = await assertPublicHttpUrl(baseUrl);
  const api = new URL("/wp-json/wp/v2/posts", base.origin);
  api.searchParams.set("per_page", String(Math.min(Math.max(count, 1), 10)));
  api.searchParams.set("_fields", "title,link,content");
  let data: unknown;
  try {
    data = await getJson(api, fetcher);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Die Website liefert keine WordPress-REST-Antwort");
    throw error;
  }
  if (!Array.isArray(data)) throw new Error("Die Website liefert keine WordPress-REST-Antwort");
  return data
    .map((p: { title?: { rendered?: string }; link?: string; content?: { rendered?: string } }) => ({
      title: stripHtml(p.title?.rendered ?? "").slice(0, 200),
      url: String(p.link ?? ""),
      text: stripHtml(p.content?.rendered ?? ""),
    }))
    .filter((p) => p.title && p.text);
}

export interface SitePostSummary {
  id: number;
  title: string;
  url: string;
  date: string;
  excerpt: string;
}

export interface SitePostFull extends SitePostSummary {
  html: string;
}

type RestPost = { id?: number; title?: { rendered?: string }; link?: string; date?: string; excerpt?: { rendered?: string }; content?: { rendered?: string } };

function toSummary(p: RestPost): SitePostSummary | undefined {
  const title = stripHtml(p.title?.rendered ?? "").slice(0, 200);
  if (typeof p.id !== "number" || !title) return undefined;
  return { id: p.id, title, url: String(p.link ?? ""), date: String(p.date ?? ""), excerpt: stripHtml(p.excerpt?.rendered ?? "").slice(0, 300) };
}

async function restUrl(baseUrl: string, path: string): Promise<URL> {
  const base = await assertPublicHttpUrl(baseUrl);
  return new URL(path, base.origin);
}

/** Veroeffentlichte Beitraege einer Website (oeffentliche REST-API), neueste zuerst; optional per Suchbegriff. */
export async function fetchSitePosts(baseUrl: string, opts: { search?: string; count?: number; page?: number } = {}, fetcher: Fetcher = fetch): Promise<SitePostSummary[]> {
  const api = await restUrl(baseUrl, "/wp-json/wp/v2/posts");
  api.searchParams.set("per_page", String(Math.min(Math.max(opts.count ?? 20, 1), 100)));
  if (opts.page && opts.page > 1) api.searchParams.set("page", String(opts.page));
  api.searchParams.set("_fields", "id,title,link,date,excerpt");
  if (opts.search?.trim()) api.searchParams.set("search", opts.search.trim().slice(0, 100));
  let data: unknown;
  try {
    data = await getJson(api, fetcher);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Die Website liefert keine WordPress-REST-Antwort");
    throw error;
  }
  if (!Array.isArray(data)) throw new Error("Die Website liefert keine WordPress-REST-Antwort");
  return data.map(toSummary).filter((p): p is SitePostSummary => Boolean(p));
}

/** Ein veroeffentlichter Beitrag samt HTML-Inhalt. Probiert mehrere Wege, falls Permalinks/Firewall den ersten blockieren. */
export async function fetchSitePost(baseUrl: string, id: number, fetcher: Fetcher = fetch): Promise<SitePostFull> {
  const n = Math.trunc(id);
  const fields = "id,title,link,date,excerpt,content";
  const attempts: { path: string; params: Record<string, string>; list: boolean }[] = [
    { path: `/wp-json/wp/v2/posts/${n}`, params: { _fields: fields }, list: false },
    { path: `/wp-json/wp/v2/posts/${n}`, params: {}, list: false },
    { path: "/wp-json/wp/v2/posts", params: { include: String(n), _fields: fields }, list: true },
    { path: "/", params: { rest_route: `/wp/v2/posts/${n}`, _fields: fields }, list: false },
  ];
  let firstError: Error | undefined;
  for (const attempt of attempts) {
    try {
      const api = await restUrl(baseUrl, attempt.path);
      for (const [k, v] of Object.entries(attempt.params)) api.searchParams.set(k, v);
      const data = await getJson(api, fetcher);
      const post = (attempt.list ? (Array.isArray(data) ? data[0] : undefined) : data) as RestPost | undefined;
      const summary = post ? toSummary(post) : undefined;
      const html = post?.content?.rendered ?? "";
      if (summary && html.trim()) return { ...summary, html };
      firstError ??= new Error("Der Beitrag wurde nicht gefunden oder ist nicht veröffentlicht.");
    } catch (error) {
      firstError ??= error instanceof Error ? error : new Error(String(error));
    }
  }
  throw firstError ?? new Error("Der Beitrag konnte nicht geladen werden.");
}

/** Alle veroeffentlichten Beitraege (nur Kopfdaten), seitenweise, hoechstens maxPages * 100. */
export async function fetchAllSitePosts(baseUrl: string, maxPages = 10, fetcher: Fetcher = fetch): Promise<SitePostSummary[]> {
  const all: SitePostSummary[] = [];
  for (let page = 1; page <= maxPages; page++) {
    let batch: SitePostSummary[];
    try {
      batch = await fetchSitePosts(baseUrl, { count: 100, page }, fetcher);
    } catch (error) {
      // Hinter der letzten Seite antwortet WordPress mit einem Fehler (rest_post_invalid_page_number).
      if (page > 1) break;
      throw error;
    }
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

/** Kategorien einer Website mit Anzahl veroeffentlichter Beitraege (oeffentliche REST-API), haeufigste zuerst. */
export async function fetchSiteCategories(baseUrl: string, fetcher: Fetcher = fetch): Promise<{ name: string; count: number }[]> {
  const api = await restUrl(baseUrl, "/wp-json/wp/v2/categories");
  api.searchParams.set("per_page", "100");
  api.searchParams.set("hide_empty", "true");
  api.searchParams.set("_fields", "name,count");
  const data = await getJson(api, fetcher);
  if (!Array.isArray(data)) return [];
  return data
    .map((c: { name?: unknown; count?: unknown }) => ({ name: stripHtml(String(c.name ?? "")), count: Number(c.count ?? 0) }))
    .filter((c) => c.name && Number.isFinite(c.count))
    .sort((a, b) => b.count - a.count);
}

/** Erkennt Seitenbaukaesten im ausgelieferten HTML eines Beitrags. */
export function detectPageBuilder(html: string): string | undefined {
  if (/elementor/i.test(html)) return "Elementor";
  if (/\bet_pb_|et-boc/i.test(html)) return "Divi";
  if (/\bvc_row|wpb_wrapper/i.test(html)) return "WPBakery";
  if (/\bfl-builder/i.test(html)) return "Beaver Builder";
  return undefined;
}
