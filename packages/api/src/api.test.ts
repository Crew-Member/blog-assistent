import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeAiService } from "./ai/fake.js";
import type { AiService } from "./ai/types.js";
import { loadConfig } from "./config.js";
import { FileStorage } from "./lib/storage.js";
import { buildServer } from "./server.js";
import { Worker } from "./worker.js";

const hasDb = Boolean(process.env.DATABASE_URL);

/** FakeAiService mit einzelnen ueberschriebenen Schritten (Spread wuerde die Prototyp-Methoden verlieren). */
const fakeWith = (overrides: Partial<AiService>): AiService => Object.assign(new FakeAiService(), overrides);

describe.skipIf(!hasDb)("API + Pipeline (mit Postgres)", () => {
  const prisma = new PrismaClient();
  const config = loadConfig({ DATABASE_URL: process.env.DATABASE_URL, ADMIN_PASSWORD: "geheim-passwort", SESSION_SECRET: "x".repeat(40), AI_PROVIDER: "fake" } as NodeJS.ProcessEnv);
  let dir: string;
  let app: FastifyInstance;
  let ai: AiService;
  let worker: Worker;
  let cookie: string;
  let wpFetcher: typeof fetch = (async () => new Response("[]")) as typeof fetch;

  const boundary = "----testboundary";
  function multipart(files: { name: string; type: string; content: string | Buffer }[], note = "") {
    const parts: Buffer[] = [];
    if (note) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="note"\r\n\r\n${note}\r\n`));
    for (const f of files) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`));
      parts.push(Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content));
      parts.push(Buffer.from("\r\n"));
    }
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie } };
  }

  async function createSite() {
    const res = await app.inject({
      method: "POST",
      url: "/api/sites",
      headers: { cookie },
      payload: { name: "Kanzlei Test", audience: "Unternehmen", disclaimer: "Kein Ersatz fuer Rechtsberatung." },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function setup(service: AiService) {
    ai = service;
    const storage = new FileStorage(dir);
    app = buildServer({ config, prisma, storage, ai, fetcher: wpFetcher });
    worker = new Worker({ prisma, ai, storage });
    await app.ready();
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "geheim-passwort" } });
    expect(login.statusCode).toBe(200);
    cookie = (login.headers["set-cookie"] as string).split(";")[0] ?? "";
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "blog-test-"));
  });
  beforeEach(async () => {
    await prisma.site.deleteMany();
    await setup(new FakeAiService());
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("verlangt Login fuer die API", async () => {
    expect((await app.inject({ method: "GET", url: "/api/sites" })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/sites", headers: { cookie: "session=gefaelscht" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "falsch" } })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
  });

  it("fuehrt Upload -> Analyse -> Beitrag durch und haengt Disclaimer an", async () => {
    const siteId = await createSite();
    const eml = "From: a@b.de\r\nSubject: BAG Urteil\r\nContent-Type: text/plain\r\n\r\nInhalt der Mail.";
    const up = multipart(
      [
        { name: "urteil.pdf", type: "application/pdf", content: "%PDF-1.4 test" },
        { name: "mail.eml", type: "message/rfc822", content: eml },
      ],
      "Schwerpunkt Arbeitgeberpflichten",
    );
    const created = await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers });
    expect(created.statusCode).toBe(201);
    const submissionId = created.json().id as string;
    expect(created.json().documents).toHaveLength(2);

    await worker.tick();
    const detail = (await app.inject({ method: "GET", url: `/api/submissions/${submissionId}`, headers: { cookie } })).json();
    expect(detail.status).toBe("ANALYZED");
    expect(detail.topics.length).toBeGreaterThan(0);

    const post = (await app.inject({ method: "POST", url: `/api/topics/${detail.topics[0].id}/posts`, headers: { cookie } })).json();
    expect(post.status).toBe("QUEUED");
    await worker.tick();

    const done = (await app.inject({ method: "GET", url: `/api/posts/${post.id}`, headers: { cookie } })).json();
    expect(done.status).toBe("DRAFT_READY");
    expect(done.slug).toBe("beispielthema");
    expect(done.contentHtml).toContain("Kein Ersatz fuer Rechtsberatung.");
    expect(done.contentHtml).toContain("Stand:");
    expect(done.sources).toHaveLength(1);
  });

  it("uebergibt PDF als Base64 und Mails als Text an die KI", async () => {
    const seen: { kind: string; hasBase64: boolean; text?: string }[] = [];
    await setup(
      fakeWith({
        analyze: async (input) => {
          for (const d of input.documents) seen.push({ kind: d.kind, hasBase64: Boolean(d.base64), text: d.text });
          return new FakeAiService().analyze(input);
        },
      }),
    );
    const siteId = await createSite();
    const up = multipart([
      { name: "u.pdf", type: "application/pdf", content: "%PDF-1.4 test" },
      { name: "m.eml", type: "message/rfc822", content: "Subject: X\r\n\r\nKörper" },
    ]);
    await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers });
    await worker.tick();
    expect(seen.find((s) => s.kind === "pdf")?.hasBase64).toBe(true);
    expect(seen.find((s) => s.kind === "text")?.text).toContain("Körper");
  });

  it("lehnt nicht unterstuetzte Dateitypen ab", async () => {
    const siteId = await createSite();
    const up = multipart([{ name: "mail.msg", type: "application/octet-stream", content: "x" }]);
    const res = await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("mail.msg");
  });

  it("markiert Fehler der KI am Beitrag und erlaubt einen neuen Versuch", async () => {
    let fail = true;
    await setup(
      fakeWith({
        research: async (i) => {
          if (fail) throw new Error("Rate limit");
          return new FakeAiService().research(i);
        },
      }),
    );
    const siteId = await createSite();
    const up = multipart([{ name: "a.txt", type: "text/plain", content: "Text" }]);
    const s = (await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers })).json();
    await worker.tick();
    const topics = (await app.inject({ method: "GET", url: `/api/submissions/${s.id}`, headers: { cookie } })).json().topics;
    const post = (await app.inject({ method: "POST", url: `/api/topics/${topics[0].id}/posts`, headers: { cookie } })).json();
    await worker.tick();
    let current = (await app.inject({ method: "GET", url: `/api/posts/${post.id}`, headers: { cookie } })).json();
    expect(current.status).toBe("FAILED");
    expect(current.error).toContain("Rate limit");

    fail = false;
    expect((await app.inject({ method: "POST", url: `/api/posts/${post.id}/regenerate`, headers: { cookie } })).statusCode).toBe(200);
    await worker.tick();
    current = (await app.inject({ method: "GET", url: `/api/posts/${post.id}`, headers: { cookie } })).json();
    expect(current.status).toBe("DRAFT_READY");
  });

  it("bereinigt manuell bearbeitetes HTML", async () => {
    const siteId = await createSite();
    const up = multipart([{ name: "a.txt", type: "text/plain", content: "Text" }]);
    const s = (await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers })).json();
    await worker.tick();
    const topics = (await app.inject({ method: "GET", url: `/api/submissions/${s.id}`, headers: { cookie } })).json().topics;
    const post = (await app.inject({ method: "POST", url: `/api/topics/${topics[0].id}/posts`, headers: { cookie } })).json();
    await worker.tick();
    const res = await app.inject({ method: "PUT", url: `/api/posts/${post.id}`, headers: { cookie }, payload: { contentHtml: "<p>ok</p><script>x</script>", slug: "Neuer Slug äö" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().contentHtml).toBe("<p>ok</p>");
    expect(res.json().slug).toBe("neuer-slug-aeoe");
  });

  /** Upload + Analyse + Beitrag anlegen + Worker laufen lassen; liefert die Beitrags-ID. */
  async function makePost(siteId: string): Promise<string> {
    const up = multipart([{ name: "a.txt", type: "text/plain", content: "Das OLG Naumburg entschied am 07.11.2019 (Az. 9 U 39/18)." }]);
    const s = (await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers })).json();
    await worker.tick();
    const topics = (await app.inject({ method: "GET", url: `/api/submissions/${s.id}`, headers: { cookie } })).json().topics;
    const post = (await app.inject({ method: "POST", url: `/api/topics/${topics[0].id}/posts`, headers: { cookie } })).json();
    await worker.tick();
    return post.id as string;
  }
  const getPost = async (id: string) => (await app.inject({ method: "GET", url: `/api/posts/${id}`, headers: { cookie } })).json();

  it("fuehrt den Faktencheck aus und liefert SEO-Pruefungen", async () => {
    const post = await getPost(await makePost(await createSite()));
    expect(post.status).toBe("DRAFT_READY");
    expect(post.factCheck.status).toBe("passed");
    expect(Array.isArray(post.seoChecks)).toBe(true);
    expect(post.seoChecks.find((c: { id: string }) => c.id === "title-length")).toBeTruthy();
  });

  it("uebernimmt Korrekturen des Faktenchecks und markiert unbelegte Fundstellen", async () => {
    await setup(
      fakeWith({
        draft: async (i) => ({
          ...(await new FakeAiService().draft(i)),
          contentHtml: "<p>Das OLG Köln (Az. 6 U 99/19) hat entschieden. Das OLG Naumburg (Az. 9 U 39/18) auch. Außerdem gilt immer Regel X.</p><p>" + "Text ".repeat(40) + "</p>",
        }),
        factCheck: async (i) => ({
          summary: "Eine Aussage war nicht belegt.",
          issues: [{ claim: "Außerdem gilt immer Regel X.", problem: "unsupported", evidence: "Nicht in den Unterlagen", action: "removed" }],
          revisedHtml: i.draft.contentHtml.replace(" Außerdem gilt immer Regel X.", ""),
        }),
      }),
    );
    const post = await getPost(await makePost(await createSite()));
    expect(post.status).toBe("DRAFT_READY");
    expect(post.contentHtml).not.toContain("Regel X");
    expect(post.factCheck.status).toBe("needs_review"); // 6 U 99/19 ist nirgends belegt
    expect(post.factCheck.issues).toHaveLength(1);
    expect(post.unverifiedClaims.join(" ")).toContain("6 U 99/19");
    expect(post.unverifiedClaims.join(" ")).not.toContain("9 U 39/18");
  });

  it("behaelt den Entwurf, wenn der Faktencheck fehlschlaegt, und kennzeichnet ihn als ungeprueft", async () => {
    await setup(fakeWith({ factCheck: async () => { throw new Error("API down"); } }));
    const post = await getPost(await makePost(await createSite()));
    expect(post.status).toBe("DRAFT_READY");
    expect(post.contentHtml).toContain("Platzhalter");
    expect(post.factCheck.status).toBe("skipped");
    expect(post.factCheck.error).toContain("API down");
  });

  it("verwaltet Stilvorlagen und gibt sie an den Entwurf weiter", async () => {
    let received: { title: string; text: string }[] = [];
    await setup(fakeWith({ draft: async (i) => { received = i.styleSamples; return new FakeAiService().draft(i); } }));
    const siteId = await createSite();
    const text = "Dies ist ein Beispielbeitrag. ".repeat(20);

    const tooShort = await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples`, headers: { cookie }, payload: { title: "x", text: "kurz" } });
    expect(tooShort.statusCode).toBe(400);

    const created = await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples`, headers: { cookie }, payload: { title: "OLG Naumburg", text } });
    expect(created.statusCode).toBe(201);
    await makePost(siteId);
    expect(received).toEqual([{ title: "OLG Naumburg", text: text.trim() }]);

    const derived = await app.inject({ method: "POST", url: `/api/sites/${siteId}/derive-style`, headers: { cookie } });
    expect(derived.statusCode).toBe(200);
    expect(derived.json().styleGuide).toContain("1 Beispiel");

    expect((await app.inject({ method: "DELETE", url: `/api/style-samples/${created.json().id}`, headers: { cookie } })).statusCode).toBe(204);
    const emptyDerive = await app.inject({ method: "POST", url: `/api/sites/${siteId}/derive-style`, headers: { cookie } });
    expect(emptyDerive.statusCode).toBe(400);
  });

  it("importiert Beispielbeitraege aus WordPress ohne Duplikate und blockiert interne Adressen", async () => {
    const content = "<p>" + "Beitragstext mit genug Inhalt. ".repeat(15) + "</p>";
    wpFetcher = (async () => new Response(JSON.stringify([{ title: { rendered: "Beitrag A" }, link: "https://93.184.216.34/a", content: { rendered: content } }]))) as typeof fetch;
    const create = async (baseUrl: string) =>
      (await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: `S ${baseUrl}`, baseUrl } })).json().id as string;
    await setup(new FakeAiService()); // baut den Server mit dem aktuellen wpFetcher neu auf
    const siteId = await create("https://93.184.216.34");

    const first = await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples/import-wordpress`, headers: { cookie } });
    expect(first.json()).toEqual({ imported: 1, skipped: 0 });
    const second = await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples/import-wordpress`, headers: { cookie } });
    expect(second.json()).toEqual({ imported: 0, skipped: 1 });

    const internal = await create("http://127.0.0.1:8080");
    const blocked = await app.inject({ method: "POST", url: `/api/sites/${internal}/style-samples/import-wordpress`, headers: { cookie } });
    expect(blocked.statusCode).toBe(502);
    expect(blocked.json().error).toContain("intern");
  });

  it("gibt die gewuenschte Anzahl an den WordPress-Import weiter", async () => {
    const urls: string[] = [];
    wpFetcher = (async (url: string) => {
      urls.push(url);
      return new Response("[]");
    }) as typeof fetch;
    await setup(new FakeAiService());
    const siteId = (await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: "S", baseUrl: "https://93.184.216.34" } })).json().id as string;
    await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples/import-wordpress`, headers: { cookie }, payload: { count: 8 } });
    expect(urls[0]).toContain("per_page=8");
    const invalid = await app.inject({ method: "POST", url: `/api/sites/${siteId}/style-samples/import-wordpress`, headers: { cookie }, payload: { count: 99 } });
    expect(invalid.statusCode).toBe(400);
  });
});
