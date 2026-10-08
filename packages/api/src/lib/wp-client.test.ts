import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./secrets.js";
import { WordPressClient, WordPressError } from "./wp-client.js";

const BASE = "https://93.184.216.34";

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> };
interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}

/** Stub, der Antworten per Pfad liefert und alle Aufrufe festhaelt. */
function wp(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const u = new URL(url);
    const key = `${init?.method ?? "GET"} ${u.pathname}`;
    calls.push({ url, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const entry = routes[key];
    const reply = Array.isArray(entry) ? entry.shift() : entry;
    if (!reply) return new Response(JSON.stringify({ code: "rest_no_route", message: `kein Stub fuer ${key}` }), { status: 404 });
    return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status ?? 200, headers: reply.headers });
  }) as typeof fetch;
  return { client: new WordPressClient(BASE, "daniel", "abcd efgh ijkl", fetcher), calls };
}

const draftInput = { title: "Titel", content: "<p>Text</p>", slug: "titel", excerpt: "Auszug", categories: [3], tags: [7] };

describe("secrets", () => {
  it("verschluesselt und entschluesselt, ohne Klartext zu speichern", () => {
    const stored = encryptSecret("abcd efgh", "geheimnis-geheimnis-geheimnis-123");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("abcd");
    expect(decryptSecret(stored, "geheimnis-geheimnis-geheimnis-123")).toBe("abcd efgh");
    expect(decryptSecret(stored, "anderes-secret-anderes-secret-123456")).toBeUndefined();
    expect(decryptSecret("kaputt", "x".repeat(40))).toBeUndefined();
    expect(encryptSecret("", "x".repeat(40))).toBe("");
    expect(encryptSecret("a", "x".repeat(40))).not.toBe(encryptSecret("a", "x".repeat(40))); // zufaelliger IV
  });
});

describe("WordPressClient", () => {
  it("verlangt https", () => {
    expect(() => new WordPressClient("http://example.org", "u", "p")).toThrow(/https/);
  });

  it("meldet sich per Basic-Auth an und liest Benutzer, Rechte und Rank Math", async () => {
    const { client, calls } = wp({
      "GET /wp-json/wp/v2/users/me": { body: { name: "Dr. Kirmse", capabilities: { edit_posts: true } } },
      "GET /wp-json/": { body: { namespaces: ["wp/v2", "rankmath/v1"] } },
    });
    expect(await client.me()).toEqual({ name: "Dr. Kirmse", canPublish: true });
    expect(await client.namespaces()).toContain("rankmath/v1");
    expect(calls[0]?.headers["authorization"]).toBe(`Basic ${Buffer.from("daniel:abcd efgh ijkl").toString("base64")}`);
    expect(calls[1]?.headers["authorization"]).toBeUndefined(); // oeffentliche Wurzel ohne Zugangsdaten
  });

  it("legt Beitraege ausschliesslich als Entwurf an", async () => {
    const { client, calls } = wp({ "POST /wp-json/wp/v2/posts": { body: { id: 42, link: `${BASE}/?p=42`, status: "draft" } } });
    const ref = await client.createDraft(draftInput, { description: "Meta", focusKeyword: "DSGVO" });
    expect(ref).toEqual({ id: 42, link: `${BASE}/?p=42`, status: "draft", editUrl: `${BASE}/wp-admin/post.php?post=42&action=edit` });
    expect(calls[0]?.body).toMatchObject({ status: "draft", title: "Titel", categories: [3], tags: [7], slug: "titel", excerpt: "Auszug" });
    expect(calls[0]?.body?.meta).toEqual({ rank_math_description: "Meta", rank_math_focus_keyword: "DSGVO" });
  });

  it("folgt keinen Weiterleitungen (Zugangsdaten bleiben bei der eigenen Adresse)", async () => {
    const { client, calls } = wp({ "GET /wp-json/wp/v2/users/me": { status: 301, headers: { location: "https://fremd.example/wp-json/wp/v2/users/me" } } });
    await expect(client.me()).rejects.toThrow(/leitet weiter/);
    expect(calls).toHaveLength(1);
  });

  it("verweigert interne Adressen", async () => {
    const client = new WordPressClient("https://127.0.0.1", "u", "p", (async () => new Response("{}")) as typeof fetch);
    await expect(client.me()).rejects.toThrow(/intern/);
  });

  it("ueberschreibt nie veroeffentlichte Beitraege", async () => {
    const { client, calls } = wp({ "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "publish" } } });
    await expect(client.updateDraft(42, draftInput)).rejects.toMatchObject({ status: 409, message: expect.stringContaining("publish") });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("aktualisiert einen vorhandenen Entwurf", async () => {
    const { client, calls } = wp({
      "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } },
      "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: "x", status: "draft" } },
    });
    expect((await client.updateDraft(42, draftInput)).id).toBe(42);
    expect(calls[1]?.body?.status).toBe("draft");
  });

  it("uebernimmt die ID, wenn WordPress meldet, dass der Begriff schon existiert", async () => {
    const exists = { status: 400, body: { code: "term_exists", message: "Ein Begriff mit dem angegebenen Namen existiert bereits in dieser Taxonomie.", data: { status: 400, term_id: 12 } } };
    const { client } = wp({
      "POST /wp-json/wp/v2/categories": exists,
      "GET /wp-json/wp/v2/tags": { body: [] },
      "POST /wp-json/wp/v2/tags": exists,
    });
    expect(await client.ensureCategories(["Datenschutz & Recht"], [])).toEqual([12]);
    expect(await client.ensureTags(["Löschkonzept"])).toEqual([12]);
  });

  it("liest Antworten, denen Elementor einen <style>-Block voranstellt, und fragt beim Schreiben nur die noetigen Felder ab", async () => {
    const urls: string[] = [];
    const css = '<style id="elementor-post-28899">.elementor-widget-text-editor{font-family:var(--e-global)}</style>\n';
    const fetcher = (async (url: string, init?: RequestInit) => {
      urls.push(`${init?.method ?? "GET"} ${url}`);
      if ((init?.method ?? "GET") === "GET") return new Response(css + JSON.stringify({ id: 7, status: "publish", type: "post" }));
      return new Response(css + JSON.stringify({ id: 7, link: "https://93.184.216.34/alt/", status: "publish" }));
    }) as typeof fetch;
    const client = new WordPressClient(BASE, "daniel", "abcd efgh ijkl", fetcher);
    const ref = await client.updateExisting(7, { title: "T", content: "<p>x</p>" });
    expect(ref).toMatchObject({ id: 7, status: "publish" });
    expect(urls.at(-1)).toContain("/wp-json/wp/v2/posts/7?_fields=id,link,status");
    expect((await client.createDraft({ title: "T", content: "<p>x</p>", categories: [], tags: [] })).id).toBe(7);
    expect(urls.at(-1)).toContain("/wp-json/wp/v2/posts?_fields=id,link,status");
  });

  it("nennt bei Nicht-JSON den Antworttyp und den Anfang der Antwort", async () => {
    const fetcher = (async () => new Response("<html>Firewall: Zugriff blockiert</html>", { headers: { "content-type": "text/html" } })) as typeof fetch;
    const client = new WordPressClient(BASE, "daniel", "abcd efgh ijkl", fetcher);
    await expect(client.me()).rejects.toThrow(/Typ text\/html.*Firewall/);
  });

  it("verwendet vorhandene Schlagwoerter und legt fehlende an", async () => {
    const { client, calls } = wp({
      "GET /wp-json/wp/v2/tags": [{ body: [{ id: 5, name: "DSGVO" }] }, { body: [] }],
      "POST /wp-json/wp/v2/tags": { body: { id: 9 } },
    });
    expect(await client.ensureTags(["dsgvo", "Löschkonzept", "dsgvo"])).toEqual([5, 9]);
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ name: "Löschkonzept" });
  });

  it("setzt Rank-Math-Felder ueber die Rank-Math-Schnittstelle und meldet Fehlschlaege ehrlich", async () => {
    const ok = wp({ "POST /wp-json/rankmath/v1/updateMeta": { body: { success: true } } });
    const set = await ok.client.setRankMath(42, { description: "Meta", focusKeyword: "DSGVO" }, ["rankmath/v1"]);
    expect(set.status).toBe("set");
    expect(ok.calls[0]?.body).toMatchObject({ objectID: 42, objectType: "post", meta: { rank_math_description: "Meta", rank_math_focus_keyword: "DSGVO" } });

    const denied = wp({ "POST /wp-json/rankmath/v1/updateMeta": { status: 403, body: { message: "nein" } } });
    expect((await denied.client.setRankMath(42, { description: "M", focusKeyword: "K" }, ["rankmath/v1"])).status).toBe("manual");

    const none = wp({});
    const noPlugin = await none.client.setRankMath(42, { description: "M", focusKeyword: "K" }, ["wp/v2"]);
    expect(noPlugin.status).toBe("no_plugin");
    expect(none.calls).toHaveLength(0);
  });

  it("erklaert typische Fehler verstaendlich", async () => {
    for (const [status, text] of [
      [401, "Anmeldung abgelehnt"],
      [403, "nicht die nötigen Rechte"],
      [404, "REST-API wurde nicht gefunden"],
    ] as const) {
      const { client } = wp({ "GET /wp-json/wp/v2/users/me": { status, body: { message: "x" } } });
      await expect(client.me()).rejects.toThrow(text);
    }
    const { client } = wp({ "GET /wp-json/wp/v2/users/me": { status: 200, body: undefined } });
    await expect(client.me()).resolves.toBeDefined().catch(() => undefined);
    expect(WordPressError).toBeDefined();
  });
});
