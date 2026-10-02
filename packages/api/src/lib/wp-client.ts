import { assertPublicHttpUrl } from "./netguard.js";

export class WordPressError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface WpCategory {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
}

export interface WpDraftInput {
  title: string;
  content: string;
  slug?: string;
  excerpt?: string;
  categories: number[];
  tags: number[];
  featuredMedia?: number;
}

export interface WpPostRef {
  id: number;
  link: string;
  status: string;
  editUrl: string;
}

export interface RankMathMeta {
  description: string;
  focusKeyword: string;
}

export type SeoOutcome = { status: "set" | "manual" | "no_plugin"; message: string };

type Fetcher = typeof fetch;

const TIMEOUT_MS = 25_000;
const MAX_BODY = 5 * 1024 * 1024;

/**
 * Minimaler WordPress-REST-Client (Anwendungspasswort per Basic-Auth).
 * Sicherheitsregeln: nur https, keine internen Adressen, KEINE Weiterleitungen (sonst gingen Zugangsdaten an fremde Hosts),
 * und es wird ausschliesslich mit Status "draft" geschrieben.
 */
export class WordPressClient {
  private readonly origin: string;
  private readonly auth: string;

  constructor(
    baseUrl: string,
    username: string,
    appPassword: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      throw new WordPressError("Die Adresse der Website ist ungültig.");
    }
    if (url.protocol !== "https:") throw new WordPressError("Für die Verbindung zu WordPress ist https:// nötig (Zugangsdaten dürfen nicht unverschlüsselt übertragen werden).");
    this.origin = url.origin;
    this.auth = `Basic ${Buffer.from(`${username}:${appPassword.replace(/\s+/g, " ").trim()}`).toString("base64")}`;
  }

  private async request<T>(path: string, init: { method?: string; body?: unknown; auth?: boolean; raw?: { data: Buffer; contentType: string; filename: string } } = {}): Promise<T> {
    const url = `${this.origin}${path}`;
    await assertPublicHttpUrl(url).catch((e: Error) => {
      throw new WordPressError(e.message);
    });
    let res: Response;
    try {
      res = await this.fetcher(url, {
        method: init.method ?? "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: "application/json",
          "user-agent": "kdsb-blog-assistent",
          ...(init.auth === false ? {} : { authorization: this.auth }),
          ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
          ...(init.raw ? { "content-type": init.raw.contentType, "content-disposition": `attachment; filename="${init.raw.filename.replace(/[^A-Za-z0-9._-]/g, "_")}"` } : {}),
        },
        body: init.raw ? new Uint8Array(init.raw.data) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      throw new WordPressError(`Keine Verbindung zu ${this.origin}: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (res.status >= 300 && res.status < 400) {
      const target = res.headers.get("location") ?? "unbekannt";
      throw new WordPressError(`Die Website leitet weiter (nach ${target}). Bitte die endgültige Adresse (z. B. mit https:// und/oder www.) in den Website-Einstellungen eintragen.`, res.status);
    }
    const text = await res.text();
    if (text.length > MAX_BODY) throw new WordPressError("Antwort von WordPress ist zu groß.");
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      if (res.ok) throw new WordPressError("WordPress liefert keine gültige REST-Antwort (Permalinks, Sicherheits-Plugin oder Firewall?).", res.status);
    }
    if (!res.ok) throw new WordPressError(explainStatus(res.status, data), res.status);
    return data as T;
  }

  /** Prueft die Anmeldung und ermittelt, ob der Benutzer Beitraege anlegen darf. */
  async me(): Promise<{ name: string; canPublish: boolean }> {
    const user = await this.request<{ name?: string; capabilities?: Record<string, boolean> }>("/wp-json/wp/v2/users/me?context=edit");
    return { name: user.name ?? "", canPublish: Boolean(user.capabilities?.edit_posts) };
  }

  /** Namensraeume der REST-API, z. B. "rankmath/v1" - zeigt, ob Rank Math aktiv ist. */
  async namespaces(): Promise<string[]> {
    const root = await this.request<{ namespaces?: string[] }>("/wp-json/", { auth: false });
    return root.namespaces ?? [];
  }

  async categories(): Promise<WpCategory[]> {
    const all: WpCategory[] = [];
    for (let page = 1; page <= 5; page++) {
      const batch = await this.request<WpCategory[]>(`/wp-json/wp/v2/categories?per_page=100&page=${page}&hide_empty=false&_fields=id,name,slug,parent,count`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  /** Legt neue Kategorien an (oder verwendet gleichnamige vorhandene). Braucht das Recht "Kategorien verwalten". */
  async ensureCategories(names: string[], existing: WpCategory[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 3)) {
      const same = existing.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (same) {
        ids.push(same.id);
        continue;
      }
      try {
        ids.push((await this.request<{ id: number }>("/wp-json/wp/v2/categories", { method: "POST", body: { name } })).id);
      } catch (error) {
        if (error instanceof WordPressError && error.status === 403) {
          throw new WordPressError(`Die neue Kategorie „${name}“ konnte nicht angelegt werden: Der WordPress-Benutzer darf keine Kategorien verwalten. Bitte die Kategorie in WordPress selbst anlegen oder einen Benutzer mit der Rolle Redakteur verwenden.`, 403);
        }
        throw error;
      }
    }
    return ids;
  }

  /** Liefert die IDs der Schlagwoerter; fehlende werden angelegt. */
  async ensureTags(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    for (const name of [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 10)) {
      const found = await this.request<{ id: number; name: string }[]>(`/wp-json/wp/v2/tags?per_page=20&_fields=id,name&search=${encodeURIComponent(name)}`);
      const exact = found.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exact) {
        ids.push(exact.id);
        continue;
      }
      const created = await this.request<{ id: number }>("/wp-json/wp/v2/tags", { method: "POST", body: { name } });
      ids.push(created.id);
    }
    return ids;
  }

  private ref(p: { id: number; link?: string; status?: string }): WpPostRef {
    return { id: p.id, link: p.link ?? "", status: p.status ?? "draft", editUrl: `${this.origin}/wp-admin/post.php?post=${p.id}&action=edit` };
  }

  private payload(input: WpDraftInput, meta?: RankMathMeta) {
    return {
      title: input.title,
      content: input.content,
      status: "draft",
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.excerpt ? { excerpt: input.excerpt } : {}),
      categories: input.categories,
      tags: input.tags,
      ...(input.featuredMedia ? { featured_media: input.featuredMedia } : {}),
      // Rank-Math-Felder: nur wirksam, falls die Installation sie fuer die REST-API freigibt; sonst wird das stillschweigend ignoriert.
      ...(meta ? { meta: { rank_math_description: meta.description, rank_math_focus_keyword: meta.focusKeyword } } : {}),
    };
  }

  async createDraft(input: WpDraftInput, meta?: RankMathMeta): Promise<WpPostRef> {
    return this.ref(await this.request("/wp-json/wp/v2/posts", { method: "POST", body: this.payload(input, meta) }));
  }

  /** Aktualisiert einen vorhandenen Entwurf - veroeffentlichte oder geplante Beitraege werden nie ueberschrieben. */
  async updateDraft(id: number, input: WpDraftInput, meta?: RankMathMeta): Promise<WpPostRef> {
    const current = await this.request<{ id: number; status: string }>(`/wp-json/wp/v2/posts/${id}?context=edit&_fields=id,status`);
    if (current.status !== "draft" && current.status !== "auto-draft") {
      throw new WordPressError(`Der Beitrag in WordPress hat den Status „${current.status}“ und wird nicht überschrieben. Änderungen bitte direkt in WordPress vornehmen.`, 409);
    }
    return this.ref(await this.request(`/wp-json/wp/v2/posts/${id}`, { method: "POST", body: this.payload(input, meta) }));
  }

  /**
   * Bringt ein Bild in die WordPress-Mediathek: laedt es hoch (oder aktualisiert nur die Beschreibungsfelder, wenn es schon
   * dort liegt) und setzt Alt-Text, Bildunterschrift und Beschreibung. Liefert die Medien-ID.
   */
  async syncMedia(input: { existingId?: number | null; data: Buffer; mimeType: string; filename: string; alt: string; caption: string; title: string; description: string }): Promise<number> {
    const fields = { alt_text: input.alt, caption: input.caption, title: input.title, description: input.description };
    if (input.existingId) {
      try {
        await this.request(`/wp-json/wp/v2/media/${input.existingId}`, { method: "POST", body: fields });
        return input.existingId;
      } catch (error) {
        if (!(error instanceof WordPressError && error.status === 404)) throw error;
        // Datei wurde in WordPress geloescht: neu hochladen
      }
    }
    let created: { id: number };
    try {
      created = await this.request<{ id: number }>("/wp-json/wp/v2/media", { method: "POST", raw: { data: input.data, contentType: input.mimeType, filename: input.filename } });
    } catch (error) {
      if (error instanceof WordPressError && error.status === 403) {
        throw new WordPressError("Der WordPress-Benutzer darf keine Dateien hochladen (Rolle Autor oder höher nötig).", 403);
      }
      throw error;
    }
    await this.request(`/wp-json/wp/v2/media/${created.id}`, { method: "POST", body: fields });
    return created.id;
  }

  /** Setzt Rank-Math-Felder ueber die Rank-Math-eigene Schnittstelle (die der WordPress-Editor selbst benutzt). */
  async setRankMath(postId: number, meta: RankMathMeta, namespaces: string[]): Promise<SeoOutcome> {
    if (!namespaces.includes("rankmath/v1")) {
      return { status: "no_plugin", message: "Rank Math wurde auf der Website nicht erkannt. SEO-Titel, Beschreibung und Fokus-Keyword bitte im Editor eintragen." };
    }
    try {
      const res = await this.request<{ success?: boolean } | undefined>("/wp-json/rankmath/v1/updateMeta", {
        method: "POST",
        body: { objectID: postId, objectType: "post", meta: { rank_math_description: meta.description, rank_math_focus_keyword: meta.focusKeyword } },
      });
      if (res && res.success === false) throw new WordPressError("Rank Math hat die Änderung abgelehnt.");
      return { status: "set", message: "Meta-Description und Fokus-Keyword wurden an Rank Math übergeben. Bitte im Editor kurz prüfen." };
    } catch (error) {
      return {
        status: "manual",
        message: `Rank-Math-Felder konnten nicht automatisch gesetzt werden (${error instanceof Error ? error.message : String(error)}). Bitte im Editor eintragen.`,
      };
    }
  }
}

function explainStatus(status: number, data: unknown): string {
  const wp = data as { message?: string; code?: string } | undefined;
  const detail = wp?.message ? ` (${wp.message.replace(/<[^>]+>/g, "").slice(0, 200)})` : "";
  if (status === 401) return `Anmeldung abgelehnt: Benutzername oder Anwendungspasswort stimmen nicht, oder der Server leitet den Authorization-Header nicht weiter${detail}`;
  if (status === 403) return `Der Benutzer hat nicht die nötigen Rechte (Beiträge anlegen)${detail}`;
  if (status === 404) return `Die WordPress-REST-API wurde nicht gefunden. Permalinks oder ein Sicherheits-Plugin könnten sie blockieren${detail}`;
  if (status === 429 || status >= 500) return `WordPress meldet einen Serverfehler (HTTP ${status})${detail}`;
  return `WordPress hat die Anfrage abgelehnt (HTTP ${status})${detail}`;
}
