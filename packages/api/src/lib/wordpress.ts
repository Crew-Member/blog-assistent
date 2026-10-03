import { stripHtml } from "./extract.js";
import { assertPublicHttpUrl } from "./netguard.js";

export interface WordPressPost {
  title: string;
  url: string;
  text: string;
}

type Fetcher = (url: string, init: { redirect: "manual"; signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>;

const MAX_BYTES = 2 * 1024 * 1024;

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
    return JSON.parse(body);
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
export async function fetchSitePosts(baseUrl: string, opts: { search?: string; count?: number } = {}, fetcher: Fetcher = fetch): Promise<SitePostSummary[]> {
  const api = await restUrl(baseUrl, "/wp-json/wp/v2/posts");
  api.searchParams.set("per_page", String(Math.min(Math.max(opts.count ?? 20, 1), 50)));
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

/** Ein veroeffentlichter Beitrag samt HTML-Inhalt. */
export async function fetchSitePost(baseUrl: string, id: number, fetcher: Fetcher = fetch): Promise<SitePostFull> {
  const api = await restUrl(baseUrl, `/wp-json/wp/v2/posts/${Math.trunc(id)}`);
  api.searchParams.set("_fields", "id,title,link,date,excerpt,content");
  let data: unknown;
  try {
    data = await getJson(api, fetcher);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Die Website liefert keine WordPress-REST-Antwort");
    throw error;
  }
  const post = data as RestPost;
  const summary = toSummary(post);
  const html = post.content?.rendered ?? "";
  if (!summary || !html.trim()) throw new Error("Der Beitrag wurde nicht gefunden oder ist nicht veröffentlicht.");
  return { ...summary, html };
}
