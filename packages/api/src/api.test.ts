import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeAiService } from "./ai/fake.js";
import { FakeImageProvider } from "./image/fake.js";
import type { ImageProvider } from "./image/provider.js";
import { isPng, makePlaceholderPng, readChunks } from "./lib/png.js";
import type { AiService, DraftInput } from "./ai/types.js";
import { loadConfig } from "./config.js";
import { buildMsg } from "./lib/msgfixture.testutil.js";
import { FileStorage } from "./lib/storage.js";
import { buildServer } from "./server.js";
import { Worker } from "./worker.js";
import { recordUsage, setUsageSink } from "./lib/usage.js";
import { createUsageSink } from "./lib/usage-db.js";

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

  async function setup(service: AiService, imageProvider?: ImageProvider) {
    ai = service;
    const storage = new FileStorage(dir);
    app = buildServer({ config, prisma, storage, ai, images: imageProvider, fetcher: wpFetcher });
    worker = new Worker({ prisma, ai, storage, images: imageProvider, fetcher: wpFetcher });
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
    await prisma.aiUsage.deleteMany();
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
    const up = multipart([{ name: "programm.exe", type: "application/octet-stream", content: "x" }]);
    const res = await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("programm.exe");
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

  it("ueberarbeitet einen bestehenden Beitrag als neuen Entwurf und setzt nur bekannte interne Links", async () => {
    const original = '<!-- wp:paragraph --><p>Alter Text mit Fakt.</p><!-- /wp:paragraph --><script>x()</script>';
    wpFetcher = (async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/wp-json/wp/v2/posts/7") return new Response(JSON.stringify({ id: 7, title: { rendered: "Alter Beitrag" }, link: "https://93.184.216.34/alt/", date: "2024-01-01T00:00:00", excerpt: { rendered: "" }, content: { rendered: original } }));
      if (u.pathname === "/wp-json/wp/v2/posts")
        return new Response(JSON.stringify([
          { id: 7, title: { rendered: "Alter Beitrag" }, link: "https://93.184.216.34/alt/", date: "", excerpt: { rendered: "" } },
          { id: 8, title: { rendered: "Anderer Beitrag" }, link: "https://93.184.216.34/anderer/", date: "", excerpt: { rendered: "<p>Auszug</p>" } },
        ]));
      return new Response("[]");
    }) as typeof fetch;
    let seen: DraftInput | undefined;
    let checkedLinks: string[] = [];
    const fake = new FakeAiService();
    await setup(fakeWith({
      research: fake.research.bind(fake),
      factCheck: async (input) => {
        checkedLinks = (input.internalLinks ?? []).map((l) => l.url);
        return fake.factCheck(input);
      },
      draft: async (input) => {
        seen = input;
        return { ...(await fake.draft(input)), contentHtml: '<p>Neu <a href="https://93.184.216.34/anderer/">gut</a> und <a href="https://93.184.216.34/erfunden/">schlecht</a> und <a href="https://extern.example/x">extern</a> und <a href="https://www.gesetze-im-internet.de/dsgvo/">DSGVO</a></p>', changeSummary: "- Fakt aktualisiert" };
      },
    }));
    const siteId = (await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: "S", baseUrl: "https://93.184.216.34" } })).json().id as string;

    const list = await app.inject({ method: "GET", url: `/api/sites/${siteId}/wp-posts?search=alt`, headers: { cookie } });
    expect(list.json().map((p: { id: number }) => p.id)).toEqual([7, 8]);

    const created = await app.inject({ method: "POST", url: `/api/sites/${siteId}/revisions`, headers: { cookie }, payload: { wpPostId: 7, instructions: "Neues Urteil ergaenzen" } });
    expect(created.statusCode).toBe(201);
    await worker.tick();

    expect(seen?.revision?.title).toBe("Alter Beitrag");
    expect(seen?.revision?.html).not.toContain("script");
    expect(seen?.revision?.html).not.toContain("wp:paragraph");
    expect(seen?.revision?.instructions).toBe("Neues Urteil ergaenzen");
    expect(seen?.relatedPosts?.map((p) => p.url)).toEqual(["https://93.184.216.34/anderer/"]);
    expect(checkedLinks).toContain("https://93.184.216.34/anderer/");

    const post = (await app.inject({ method: "GET", url: `/api/posts/${created.json().id}`, headers: { cookie } })).json();
    expect(post.status).toBe("DRAFT_READY");
    expect(post.wpPostId).toBeNull();
    expect(post.revisionOf).toMatchObject({ wpPostId: 7, title: "Alter Beitrag" });
    expect(post.revisionSource).toBeUndefined();
    expect(post.contentHtml).toContain('href="https://93.184.216.34/anderer/"');
    expect(post.contentHtml).not.toContain("erfunden");
    expect(post.contentHtml).not.toContain("extern.example");
    expect(post.contentHtml).toContain("gesetze-im-internet.de");
    expect(post.researchNotes).toContain("Fakt aktualisiert");
  });

  it("schaerft den Text nach Anweisung nach, haelt Footer und Linkregeln ein und macht es rueckgaengig", async () => {
    const seen: { instruction: string; html: string }[] = [];
    await setup(fakeWith({
      refine: async (input) => {
        seen.push({ instruction: input.instruction, html: input.contentHtml });
        return { contentHtml: `<p>Kurz. ${"Text ".repeat(40)}<a href="https://www.haufe.de/x">Wettbewerber</a> <a href="https://www.gesetze-im-internet.de/dsgvo/">DSGVO</a> <a href="https://www.gesetze-im-internet.de/">GII</a></p>`, note: "Gekürzt." };
      },
    }));
    const postId = await makePost(await createSite());
    const before = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(before.canUndoRefine).toBe(false);

    const short = await app.inject({ method: "POST", url: `/api/posts/${postId}/refine`, headers: { cookie }, payload: { instruction: "x" } });
    expect(short.statusCode).toBe(400);

    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/refine`, headers: { cookie }, payload: { instruction: "Kürzer fassen" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().note).toBe("Gekürzt.");
    expect(seen[0]?.html).not.toContain("Stand:"); // Footer geht nicht an die KI

    const after = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(after.contentHtml).toContain("Kurz.");
    expect(after.contentHtml).toContain("Kein Ersatz fuer Rechtsberatung."); // Disclaimer-Footer bleibt
    expect(after.contentHtml).not.toContain("haufe.de"); // neuer Fremdlink wird entfernt
    expect(after.contentHtml).not.toContain("gesetze-im-internet.de"); // nur bereits vorhandene Links bleiben
    expect(after.canUndoRefine).toBe(true);
    expect(after.previousContentHtml).toBeUndefined();

    const undo = await app.inject({ method: "POST", url: `/api/posts/${postId}/refine/undo`, headers: { cookie } });
    expect(undo.statusCode).toBe(200);
    const restored = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(restored.contentHtml).toBe(before.contentHtml);
    expect((await app.inject({ method: "POST", url: `/api/posts/${postId}/refine/undo`, headers: { cookie } })).statusCode).toBe(409);
  });

  it("haengt den festen Schlussabsatz vor den Disclaimer, gibt Wunschlinks an die KI und laesst den Schlussabsatz beim Nachschaerfen unberuehrt", async () => {
    let drafted: DraftInput | undefined;
    let refined = "";
    const fake = new FakeAiService();
    await setup(fakeWith({
      draft: async (input) => {
        drafted = input;
        return fake.draft(input);
      },
      refine: async (input) => {
        refined = input.contentHtml;
        return { contentHtml: `<p>${"Neu ".repeat(60)}</p>`, note: "ok" };
      },
    }));
    const closing = '<p>Fragen? <a href="https://kirmse.eu/kontakt/">Kontakt aufnehmen</a><script>x()</script></p>';
    const created = await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: "S", baseUrl: "https://93.184.216.34", disclaimer: "Disclaimer.", closingHtml: closing, preferredLinks: "Leistung Datenschutz | https://93.184.216.34/leistungen/datenschutz/\nkaputt\nhttps://93.184.216.34/kontakt/" } });
    expect(created.statusCode).toBe(201);
    const postId = await makePost(created.json().id);

    expect(drafted?.relatedPosts?.slice(0, 2).map((p) => p.url)).toEqual(["https://93.184.216.34/leistungen/datenschutz/", "https://93.184.216.34/kontakt/"]);
    expect(drafted?.relatedPosts?.[0]?.title).toContain("bevorzugt");

    const post = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    const html: string = post.contentHtml;
    expect(html).toContain("Kontakt aufnehmen");
    expect(html).not.toContain("script");
    expect(html.indexOf("Kontakt aufnehmen")).toBeLessThan(html.indexOf("Disclaimer."));

    await app.inject({ method: "POST", url: `/api/posts/${postId}/refine`, headers: { cookie }, payload: { instruction: "Neu schreiben" } });
    expect(refined).not.toContain("Kontakt aufnehmen");
    const after = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json().contentHtml as string;
    expect(after).toContain("Neu Neu");
    expect(after).toContain("Kontakt aufnehmen");
    expect(after.indexOf("Kontakt aufnehmen")).toBeLessThan(after.indexOf("Disclaimer."));
  });

  it("ruft Primaerquellen fuer den Faktencheck ab und weist sie im Ergebnis aus", async () => {
    const page = "<html><body><p>" + "Gesetzestext mit Aktenzeichen 9 U 39/18 und Datum 07.11.2019. ".repeat(6) + "</p></body></html>";
    wpFetcher = (async (url: string) => (url.includes("gesetze-im-internet.de") ? new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } }) : new Response("[]"))) as typeof fetch;
    let docs: string[] = [];
    const fake = new FakeAiService();
    await setup(fakeWith({
      factCheck: async (input) => {
        docs = input.documents.map((d) => d.filename);
        return fake.factCheck(input);
      },
    }));
    const postId = await makePost(await createSite());
    expect(docs).toContain("Quelle: https://www.gesetze-im-internet.de/");
    const post = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(post.factCheck.sourcesChecked).toEqual([{ url: "https://www.gesetze-im-internet.de/", ok: true }]);
  });

  it("liefert Titelvorschlaege und markiert, ob das Fokus-Keyword vorkommt", async () => {
    await setup(fakeWith({
      suggestTitles: async () => ({ titles: [{ title: "Beispiel Keyword: Was jetzt gilt", note: "These" }, { title: "Ganz anderer Titel", note: "Frage" }] }),
    }));
    const postId = await makePost(await createSite());
    await app.inject({ method: "PUT", url: `/api/posts/${postId}`, headers: { cookie }, payload: { focusKeyword: "Beispiel Keyword" } });
    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/titles`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json().titles).toEqual([
      { title: "Beispiel Keyword: Was jetzt gilt", note: "These", length: 32, hasKeyword: true },
      { title: "Ganz anderer Titel", note: "Frage", length: 18, hasKeyword: false },
    ]);
  });

  it("Aktualisierungsradar: standardmaessig aus, nur bei Aktivierung, prueft aeltere Beitraege und startet Ueberarbeitungen", async () => {
    const old = "2023-01-10T10:00:00";
    const young = new Date(Date.now() - 5 * 86_400_000).toISOString().slice(0, 19);
    const full = (id: number) => ({ id, title: { rendered: `Beitrag ${id}` }, link: `https://93.184.216.34/b${id}/`, date: id === 3 ? young : old, excerpt: { rendered: "" }, content: { rendered: `<p>Inhalt ${id}</p>` } });
    wpFetcher = (async (url: string) => {
      const u = new URL(url);
      const m = /\/posts\/(\d+)$/.exec(u.pathname);
      if (m) return new Response(JSON.stringify(full(Number(m[1]))));
      if (u.pathname === "/wp-json/wp/v2/posts") return new Response(JSON.stringify([full(1), full(2), full(3)].map(({ content, ...rest }) => rest)));
      return new Response("[]");
    }) as typeof fetch;
    const checked: string[] = [];
    await setup(fakeWith({
      checkFreshness: async (input) => {
        checked.push(input.post.title);
        return input.post.title === "Beitrag 1"
          ? { verdict: "update_recommended", summary: "Neues Urteil.", reasons: ["BGH 2025: neue Linie"], sources: [{ title: "BGH", url: "https://www.bundesgerichtshof.de/x" }] }
          : { verdict: "current", summary: "Aktuell.", reasons: [], sources: [] };
      },
    }));
    const siteId = (await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: "S", baseUrl: "https://93.184.216.34" } })).json().id as string;

    // Standard: aus -> nichts geprueft, manuelle Pruefung abgelehnt
    await worker.tick();
    expect(checked).toEqual([]);
    expect((await app.inject({ method: "POST", url: `/api/sites/${siteId}/radar/run`, headers: { cookie } })).statusCode).toBe(409);
    expect((await app.inject({ method: "GET", url: `/api/sites/${siteId}/radar`, headers: { cookie } })).json().enabled).toBe(false);

    // Einschalten -> naechster Worker-Lauf prueft die zwei aelteren Beitraege (der junge Beitrag 3 nicht)
    expect((await app.inject({ method: "PUT", url: `/api/sites/${siteId}/radar`, headers: { cookie }, payload: { enabled: true } })).statusCode).toBe(200);
    await worker.tick();
    expect(checked.sort()).toEqual(["Beitrag 1", "Beitrag 2"]);
    const state = (await app.inject({ method: "GET", url: `/api/sites/${siteId}/radar`, headers: { cookie } })).json();
    expect(state.stats).toMatchObject({ checked: 2, current: 1 });
    expect(state.findings).toHaveLength(1);
    expect(state.findings[0]).toMatchObject({ title: "Beitrag 1", verdict: "update_recommended" });

    // Kein erneuter Lauf innerhalb des Intervalls
    await worker.tick();
    expect(checked).toHaveLength(2);

    // Ueberarbeitung aus dem Befund starten: Gruende werden zur Anweisung
    const revised = await app.inject({ method: "POST", url: `/api/radar/findings/${state.findings[0].id}/revise`, headers: { cookie } });
    expect(revised.statusCode).toBe(201);
    const post = (await app.inject({ method: "GET", url: `/api/posts/${revised.json().id}`, headers: { cookie } })).json();
    expect(post.revisionOf.instructions).toContain("BGH 2025: neue Linie");

    // Ausblenden
    await app.inject({ method: "POST", url: `/api/radar/findings/${state.findings[0].id}/dismiss`, headers: { cookie } });
    const after = (await app.inject({ method: "GET", url: `/api/sites/${siteId}/radar`, headers: { cookie } })).json();
    expect(after.findings).toHaveLength(0);
    expect(after.stats.dismissed).toBe(1);

    // Manuelle Pruefung nur bei eingeschaltetem Radar
    expect((await app.inject({ method: "POST", url: `/api/sites/${siteId}/radar/run`, headers: { cookie } })).statusCode).toBe(202);
    await app.inject({ method: "PUT", url: `/api/sites/${siteId}/radar`, headers: { cookie }, payload: { enabled: false } });
    await worker.tick();
    expect(checked).toHaveLength(2);
  });

  it("gibt dem Bildvorschlag Sprache und zuletzt verwendete Bildideen mit", async () => {
    const seen: { language?: string; recent?: string[] }[] = [];
    const fake = new FakeAiService();
    await setup(fakeWith({
      planImage: async (input) => {
        seen.push({ language: input.promptLanguage, recent: input.recentPrompts });
        return fake.planImage(input);
      },
    }));
    const siteId = await createSite();
    const first = await makePost(siteId);
    const second = await makePost(siteId);
    await app.inject({ method: "POST", url: `/api/posts/${first}/image/plan`, headers: { cookie }, payload: { style: "photo" } });
    await app.inject({ method: "POST", url: `/api/posts/${second}/image/plan`, headers: { cookie }, payload: { style: "photo" } });
    expect(seen[0]).toEqual({ language: "de", recent: [] });
    expect(seen[1]?.recent).toHaveLength(1);
    expect(seen[1]?.recent?.[0]).toContain("Besprechungstisch");
  });

  it("vergleicht mit den Top-Ergebnissen, gibt den Zielumfang an den Entwurf und speichert die Auswertung", async () => {
    const article = (n: number) => `<html><head><title>Treffer ${n}</title></head><body><article><h2>Abschnitt ${n}</h2><p>${"Wort ".repeat(n * 300)}</p></article></body></html>`;
    wpFetcher = (async (url: string) => {
      const m = /competitor(\d)/.exec(url);
      return m ? new Response(article(Number(m[1])), { headers: { "content-type": "text/html" } }) : new Response("[]");
    }) as typeof fetch;
    let draftInput: DraftInput | undefined;
    let analyzed: { words: number }[] = [];
    const fake = new FakeAiService();
    await setup(fakeWith({
      findCompetitors: async () => ({ notes: "Ratgeber-Intention", results: [{ title: "a", url: "https://93.184.216.34/competitor2/a" }, { title: "b", url: "https://93.184.216.35/competitor3/b" }, { title: "c", url: "https://93.184.216.36/kanzlei/c" }] }),
      analyzeCompetition: async (input) => {
        analyzed = input.pages;
        return { intent: "Ratgeber", recommendedMinWords: 900, recommendedMaxWords: 1200, rationale: "Median 750", missingTopics: ["Bußgeldrahmen"], structureHints: ["Checkliste"] };
      },
      draft: async (input) => {
        draftInput = input;
        return fake.draft(input);
      },
    }));
    const postId = await makePost(await createSite());
    expect(analyzed.map((p) => p.words > 500)).toEqual([true, true]);
    expect(draftInput?.competition).toMatchObject({ recommendedMinWords: 900, recommendedMaxWords: 1200, missingTopics: ["Bußgeldrahmen"] });
    const post = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(post.competition.pages).toHaveLength(2);
    expect(post.competition.recommended).toEqual({ min: 900, max: 1200 });
    expect(post.competition.failed.map((f: { url: string }) => f.url)).toEqual(["https://93.184.216.36/kanzlei/c"]);
    expect(post.competition.medianWords).toBeGreaterThan(500);
  });

  it("ueberspringt den Wettbewerbsvergleich, wenn er fuer die Website ausgeschaltet ist", async () => {
    let called = false;
    await setup(fakeWith({ findCompetitors: async () => { called = true; return { notes: "", results: [] }; } }));
    const created = await app.inject({ method: "POST", url: "/api/sites", headers: { cookie }, payload: { name: "S", competitionCheck: false } });
    await makePost(created.json().id);
    expect(called).toBe(false);
  });

  it("erfasst den KI-Verbrauch je Beitrag und fasst ihn in der Kostenuebersicht zusammen", async () => {
    setUsageSink(createUsageSink(prisma, { inputPerMTok: 5, outputPerMTok: 25, searchPer1000: 10 }));
    try {
      const fake = new FakeAiService();
      const entry = { model: "m", cacheReadTokens: 0, cacheWriteTokens: 0 };
      await setup(fakeWith({
        analyze: async (input) => {
          recordUsage({ ...entry, step: "analyze", inputTokens: 10_000, outputTokens: 1_000, webSearches: 0 });
          return fake.analyze(input);
        },
        research: async (input) => {
          recordUsage({ ...entry, step: "research", inputTokens: 100_000, outputTokens: 4_000, webSearches: 6 });
          return fake.research(input);
        },
        draft: async (input) => {
          recordUsage({ ...entry, step: "draft", inputTokens: 20_000, outputTokens: 8_000, webSearches: 0 });
          return fake.draft(input);
        },
      }));
      const siteId = await createSite();
      const postId = await makePost(siteId);
      await new Promise((r) => setTimeout(r, 300)); // Speichern der Eintraege laeuft im Hintergrund

      // research: 100000*5/1e6 + 4000*25/1e6 + 6*10/1000 = 0.5 + 0.1 + 0.06 = 0.66
      // draft: 20000*5/1e6 + 8000*25/1e6 = 0.1 + 0.2 = 0.3 ; analyze: 0.05 + 0.025 = 0.075
      const perPost = (await app.inject({ method: "GET", url: `/api/posts/${postId}/usage`, headers: { cookie } })).json();
      expect(perPost.costUsd).toBeCloseTo(0.96, 4);
      expect(perPost.steps.map((x: { step: string }) => x.step)).toEqual(["research", "draft"]);

      const overview = (await app.inject({ method: "GET", url: "/api/usage?days=30", headers: { cookie } })).json();
      expect(overview.totals).toMatchObject({ calls: 3, webSearches: 6, posts: 1 });
      expect(overview.totals.costUsd).toBeCloseTo(1.035, 4);
      expect(overview.steps[0]).toMatchObject({ step: "research", label: "Recherche", calls: 1 });
      expect(overview.bySite[0]).toMatchObject({ name: "Kanzlei Test" });
      expect(overview.recentPosts[0]).toMatchObject({ postId });
      expect(overview.prices.inputPerMTok).toBe(5);
    } finally {
      setUsageSink(undefined);
    }
  });

  it("setzt mehrere ausgehende Links: Primaerquellen zuerst, fehlende mit allgemeinen Quellen aus der Recherche aufgefuellt, nie Wettbewerber", async () => {
    const article = `<html><body><article><p>${"Wort ".repeat(400)}</p></article></body></html>`;
    wpFetcher = (async (url: string) => (url.includes("/competitor") ? new Response(article, { headers: { "content-type": "text/html" } }) : new Response("[]"))) as typeof fetch;
    const fake = new FakeAiService();
    await setup(fakeWith({
      findCompetitors: async () => ({ notes: "n", results: [{ title: "a", url: "https://93.184.216.34/competitor1/a" }, { title: "b", url: "https://93.184.216.35/competitor2/b" }] }),
      research: async () => ({ notes: "Notizen", sources: [{ title: "Gesetz", url: "https://www.gesetze-im-internet.de/dsgvo/" }, { title: "Portal", url: "https://portal.example/info" }, { title: "Presse", url: "https://presse.example/meldung" }, { title: "Rivale", url: "https://93.184.216.34/competitor1/a" }] }),
      draft: async (input) => ({
        ...(await fake.draft(input)),
        contentHtml: '<p><a href="https://www.gesetze-im-internet.de/dsgvo/">Gesetz</a> <a href="https://portal.example/info">Portal</a> <a href="https://presse.example/meldung">Presse</a> <a href="https://93.184.216.34/competitor1/a">Rivale</a> <a href="https://erfunden.example/x">Erfunden</a></p>',
      }),
    }));
    const postId = await makePost(await createSite());
    const html: string = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json().contentHtml;
    expect(html).toContain("gesetze-im-internet.de");
    expect(html).toContain("portal.example");
    expect(html).toContain("presse.example");
    expect(html).not.toContain("competitor1");
    expect(html).not.toContain("erfunden.example");
  });

  it("verlinkt in einer Ueberarbeitung nicht auf den Originalbeitrag selbst, auch nicht beim Senden an WordPress", async () => {
    const original = { id: 7, status: "publish", title: { rendered: "Alter Beitrag" }, link: `${WP_BASE}/alt/`, date: "2023-05-01T10:00:00", excerpt: { rendered: "" }, content: { rendered: `<p>${"Alter Text. ".repeat(30)} <a href="${WP_BASE}/alt/">selbst</a></p>` } };
    const calls = fakeWordPress({ ...standardRoutes(), "GET /wp-json/wp/v2/posts/7": { body: original }, "POST /wp-json/wp/v2/posts": { body: { id: 50, link: `${WP_BASE}/neu/`, status: "draft" } } });
    const fake = new FakeAiService();
    let related: string[] = [];
    await setup(fakeWith({
      // die Websuche findet auch den Originalbeitrag selbst (in anderer Schreibweise: http, www)
      research: async () => ({ notes: "n", sources: [{ title: "Original", url: "http://www.93.184.216.34/alt" }, { title: "Original2", url: `${WP_BASE}/alt/` }] }),
      draft: async (input) => {
        related = (input.relatedPosts ?? []).map((p) => p.url);
        return { ...(await fake.draft(input)), contentHtml: `<p>Text <a href="${WP_BASE}/alt/">alt</a> <a href="${WP_BASE}/?p=7">kurz</a></p>` };
      },
    }));
    const site = await createWpSite();
    const rev = await app.inject({ method: "POST", url: `/api/sites/${site.id}/revisions`, headers: { cookie }, payload: { wpPostId: 7 } });
    await worker.tick();
    const postId = rev.json().id as string;
    const html: string = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json().contentHtml;
    expect(html).not.toContain("/alt");
    expect(html).not.toContain("?p=7");
    expect(related).not.toContain(`${WP_BASE}/alt/`);

    // Aelterer Entwurf mit Selbstverweis: wird beim Senden bereinigt (neuer Entwurf)
    await app.inject({ method: "PUT", url: `/api/posts/${postId}`, headers: { cookie }, payload: { contentHtml: `<p>Text <a href="${WP_BASE}/alt/">alt</a></p>` } });
    await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    const sent = String(calls.filter((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts").at(-1)?.body?.content);
    expect(sent).not.toContain("/alt/");
    expect(sent).toContain("alt");
  });

  it("verlinkt zitierte Urteile automatisch auf die Gerichtswebsite, wenn die Recherche sie gefunden hat", async () => {
    const fake = new FakeAiService();
    await setup(fakeWith({
      research: async () => ({
        notes: "n",
        sources: [
          { title: "Urteil des II. Zivilsenats II ZR 123/21", url: "https://www.bundesgerichtshof.de/entscheidung/II-ZR-123-21" },
          { title: "Entscheidung", url: "https://www.haufe.de/ii-zr-123-21" },
        ],
      }),
      draft: async (input) => ({ ...(await fake.draft(input)), contentHtml: "<p>Der BGH hat im Urteil II ZR 123/21 entschieden. Siehe auch 1 BvR 77/19.</p>", sources: [] }),
    }));
    const postId = await makePost(await createSite());
    const html: string = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json().contentHtml;
    expect(html).toMatch(/<a href="https:\/\/www\.bundesgerichtshof\.de\/entscheidung\/II-ZR-123-21"[^>]*>II ZR 123\/21<\/a>/);
    expect(html).toContain("1 BvR 77/19");
    expect(html).not.toContain("haufe.de");
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

  it("nimmt eine Outlook-.msg samt PDF-Anhang als zwei Unterlagen an und reicht das PDF nativ an die KI", async () => {
    const seen: { filename: string; kind: string; hasBase64: boolean; text?: string }[] = [];
    await setup(
      fakeWith({
        analyze: async (input) => {
          for (const d of input.documents) seen.push({ filename: d.filename, kind: d.kind, hasBase64: Boolean(d.base64), text: d.text });
          return new FakeAiService().analyze(input);
        },
      }),
    );
    const siteId = await createSite();
    const msg = buildMsg({ subject: "BGH: Intransparenz von AGB", body: "Newsletter-Text", attachments: [{ name: "Urteil.pdf", data: Buffer.from("%PDF-1.4 urteil") }] });
    const up = multipart([{ name: "Newsletter.msg", type: "application/octet-stream", content: msg }]);
    const res = await app.inject({ method: "POST", url: `/api/sites/${siteId}/submissions`, payload: up.payload, headers: up.headers });
    expect(res.statusCode).toBe(201);
    expect(res.json().documents.map((d: { filename: string }) => d.filename)).toEqual(["Newsletter.msg", "Newsletter.msg › Urteil.pdf"]);
    await worker.tick();
    expect(seen.find((d) => d.filename === "Newsletter.msg")?.text).toContain("Betreff: BGH: Intransparenz von AGB");
    expect(seen.find((d) => d.filename.endsWith("Urteil.pdf"))).toMatchObject({ kind: "pdf", hasBase64: true });
  });

  // --- WordPress-Anbindung ---------------------------------------------------
  type WpReply = { status?: number; body?: unknown };
  interface WpCall {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: Record<string, unknown>;
  }
  /** Simuliert WordPress; Antworten je "METHODE /pfad", Listen werden der Reihe nach verbraucht. */
  function fakeWordPress(routes: Record<string, WpReply | WpReply[]>) {
    const calls: WpCall[] = [];
    wpFetcher = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const method = init?.method ?? "GET";
      calls.push({ method, path: u.pathname, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const entry = routes[`${method} ${u.pathname}`];
      const reply = Array.isArray(entry) ? entry.shift() : entry;
      if (!reply) return new Response(JSON.stringify({ message: "kein Stub" }), { status: 404 });
      return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as typeof fetch;
    return calls;
  }
  const WP_BASE = "https://93.184.216.34";
  const standardRoutes = (): Record<string, WpReply | WpReply[]> => ({
    "GET /wp-json/wp/v2/users/me": { body: { name: "Dr. Kirmse", capabilities: { edit_posts: true } } },
    "GET /wp-json/": { body: { namespaces: ["wp/v2", "rankmath/v1"] } },
    "GET /wp-json/wp/v2/categories": { body: [{ id: 1, name: "Allgemein", slug: "allgemein", parent: 0, count: 2 }, { id: 3, name: "Datenschutzrecht", slug: "datenschutzrecht", parent: 0, count: 40 }] },
    "POST /wp-json/wp/v2/categories": { body: { id: 11 } },
    "GET /wp-json/wp/v2/tags": { body: [] },
    "POST /wp-json/wp/v2/tags": { body: { id: 21 } },
    "POST /wp-json/wp/v2/posts": { body: { id: 42, link: `${WP_BASE}/?p=42`, status: "draft" } },
    "POST /wp-json/rankmath/v1/updateMeta": { body: { success: true } },
  });

  /** Ersetzt den WordPress-Stub durch neue Routen, schreibt aber weiter in dasselbe calls-Array. */
  function fakeWordPressAppend(calls: { method: string; path: string; headers: Record<string, string>; body?: Record<string, unknown> }[], routes: Record<string, { status?: number; body?: unknown } | { status?: number; body?: unknown }[]>) {
    const merged = { ...standardRoutes(), ...routes };
    wpFetcher = (async (url: string, init?: RequestInit) => {
      const u = new URL(url);
      const method = init?.method ?? "GET";
      calls.push({ method, path: u.pathname, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      const entry = merged[`${method} ${u.pathname}`];
      const reply = Array.isArray(entry) ? entry.shift() : entry;
      if (!reply) return new Response(JSON.stringify({ message: "kein Stub" }), { status: 404 });
      return new Response(reply.body === undefined ? "" : JSON.stringify(reply.body), { status: reply.status ?? 200 });
    }) as typeof fetch;
  }
  async function createWpSite(extra: Record<string, unknown> = {}) {
    const res = await app.inject({
      method: "POST",
      url: "/api/sites",
      headers: { cookie },
      payload: { name: "Kanzlei WP", baseUrl: WP_BASE, wpUsername: "daniel", wpAppPassword: "abcd efgh ijkl mnop", disclaimer: "Kein Rat.", ...extra },
    });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it("speichert das WordPress-Passwort verschluesselt und gibt es nie heraus", async () => {
    const site = await createWpSite();
    expect(site.hasWpPassword).toBe(true);
    expect(JSON.stringify(site)).not.toContain("abcd");
    expect(site).not.toHaveProperty("wpAppPassword");

    const stored = await prisma.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(stored.wpAppPassword.startsWith("v1:")).toBe(true);
    expect(stored.wpAppPassword).not.toContain("abcd");

    const list = (await app.inject({ method: "GET", url: "/api/sites", headers: { cookie } })).json();
    expect(JSON.stringify(list)).not.toContain(stored.wpAppPassword);

    // ohne neues Passwort bleibt das alte erhalten, mit clearWpPassword wird es entfernt
    const keep = await app.inject({ method: "PUT", url: `/api/sites/${site.id}`, headers: { cookie }, payload: { name: "Neu", baseUrl: WP_BASE, wpUsername: "daniel" } });
    expect(keep.json().hasWpPassword).toBe(true);
    const cleared = await app.inject({ method: "PUT", url: `/api/sites/${site.id}`, headers: { cookie }, payload: { name: "Neu", clearWpPassword: true } });
    expect(cleared.json().hasWpPassword).toBe(false);
  });

  it("testet den WordPress-Zugang und erkennt Rank Math", async () => {
    const calls = fakeWordPress(standardRoutes());
    await setup(new FakeAiService());
    const site = await createWpSite();
    const res = await app.inject({ method: "POST", url: `/api/sites/${site.id}/wordpress/test`, headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, user: "Dr. Kirmse", canPublish: true, rankMath: true, categories: 2 });
    expect(calls[0]?.headers["authorization"]).toBe(`Basic ${Buffer.from("daniel:abcd efgh ijkl mnop").toString("base64")}`);
  });

  it("verlangt einen eingerichteten WordPress-Zugang", async () => {
    const siteId = await createSite();
    const postId = await makePost(siteId);
    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/prepare`, headers: { cookie } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("nicht eingerichtet");
  });

  it("schlaegt Kategorien vor, legt nach Bestaetigung als Entwurf an und aktualisiert spaeter denselben Entwurf", async () => {
    const calls = fakeWordPress(standardRoutes());
    await setup(fakeWith({ suggestCategories: async () => ({ categoryIds: [3], newCategories: ["Compliance"] }) }));
    const site = await createWpSite();
    const postId = await makePost(site.id);

    const prep = (await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/prepare`, headers: { cookie } })).json();
    expect(prep.categories.map((c: { id: number }) => c.id)).toEqual([1, 3]);
    expect(prep.suggested).toEqual([3]);
    expect(prep.newSuggestions).toEqual(["Compliance"]);
    expect(prep.existing).toBeNull();
    expect(calls.some((c) => c.method === "POST")).toBe(false); // Vorbereiten aendert nichts in WordPress

    const pub = await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], newCategories: ["Compliance"], tags: ["DSGVO"] } });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ wpPostId: 42, editUrl: `${WP_BASE}/wp-admin/post.php?post=42&action=edit`, updated: false, seo: { status: "set" } });

    const created = calls.find((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts")!;
    expect(created.body).toMatchObject({ status: "draft", slug: "beispielthema", categories: [3, 11], tags: [21] });
    expect(String(created.body?.content)).toContain("Kein Rat.");
    expect(calls.find((c) => c.path === "/wp-json/wp/v2/categories" && c.method === "POST")?.body).toEqual({ name: "Compliance" });
    expect(calls.find((c) => c.path === "/wp-json/rankmath/v1/updateMeta")?.body).toMatchObject({ objectID: 42, meta: { rank_math_focus_keyword: "beispiel" } });

    const saved = await getPost(postId);
    expect(saved).toMatchObject({ wpPostId: 42, wpCategoryIds: [3, 11] });
    expect(saved.wpPushedAt).toBeTruthy();

    // zweiter Versand: derselbe Entwurf wird aktualisiert (vorher Status geprueft), kein neuer Beitrag
    calls.length = 0;
    fakeWordPressAppend(calls, { "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } }, "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: `${WP_BASE}/?p=42`, status: "draft" } } });
    await setup(new FakeAiService()); // Server mit dem neuen WordPress-Stub neu aufbauen
    const again = await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], tags: [] } });
    expect(again.json()).toMatchObject({ wpPostId: 42, updated: true });
    expect(calls.some((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts")).toBe(false);
  });

  it("legt einen neuen Entwurf an, wenn der fruehere in WordPress geloescht wurde", async () => {
    fakeWordPress(standardRoutes());
    await setup(new FakeAiService());
    const site = await createWpSite();
    const postId = await makePost(site.id);
    await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], tags: [] } });

    fakeWordPress({ ...standardRoutes(), "GET /wp-json/wp/v2/posts/42": { status: 404, body: { message: "nicht gefunden" } }, "POST /wp-json/wp/v2/posts": { body: { id: 77, link: `${WP_BASE}/?p=77`, status: "draft" } } });
    await setup(new FakeAiService());
    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], tags: [] } });
    expect(res.json()).toMatchObject({ wpPostId: 77, updated: false });
    expect((await getPost(postId)).wpPostId).toBe(77);
  });

  it("ueberschreibt keinen in WordPress bereits veroeffentlichten Beitrag", async () => {
    fakeWordPress(standardRoutes());
    await setup(new FakeAiService());
    const site = await createWpSite();
    const postId = await makePost(site.id);
    await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], tags: [] } });

    fakeWordPress({ ...standardRoutes(), "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "publish" } } });
    await setup(new FakeAiService());
    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/wordpress/publish`, headers: { cookie }, payload: { categoryIds: [3], tags: [] } });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toContain("publish");
  });

  it("zeigt WordPress-Fehler verstaendlich an", async () => {
    fakeWordPress({ ...standardRoutes(), "GET /wp-json/wp/v2/users/me": { status: 401, body: { message: "Ungueltiges Passwort" } } });
    await setup(new FakeAiService());
    const site = await createWpSite();
    const res = await app.inject({ method: "POST", url: `/api/sites/${site.id}/wordpress/test`, headers: { cookie } });
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toContain("Anmeldung abgelehnt");
  });

  // --- Beitragsbild ------------------------------------------------------------
  const jsonPost = async (url: string, payload?: unknown) => app.inject({ method: "POST", url, headers: { cookie }, payload: payload ?? {} });
  const getImage = async (postId: string) => (await getPost(postId)).image;

  it("plant ein Beitragsbild (Prompt, Alt-Text, Unterschrift) und erlaubt Anpassungen", async () => {
    const postId = await makePost(await createSite());
    expect(await getImage(postId)).toBeNull();
    const plan = await jsonPost(`/api/posts/${postId}/image/plan`, { style: "photo" });
    expect(plan.statusCode).toBe(200);
    expect(plan.json()).toMatchObject({ status: "PLANNED", origin: "AI", aiGenerated: true, style: "photo", hasFile: false });
    expect(plan.json().prompt).toContain("Platzhalter");
    expect(plan.json().altText).toBeTruthy();

    const edited = await app.inject({ method: "PUT", url: `/api/posts/${postId}/image`, headers: { cookie }, payload: { prompt: "Eigener Prompt", altText: "Eigener Alt-Text", aiGenerated: false } });
    expect(edited.json()).toMatchObject({ prompt: "Eigener Prompt", altText: "Eigener Alt-Text", aiGenerated: true }); // KI-Kennzeichnung bleibt bei KI-Bildern
  });

  it("generiert das Bild im Hintergrund, kennzeichnet es in den Metadaten und liefert es nur angemeldet aus", async () => {
    const provider = new FakeImageProvider();
    await setup(new FakeAiService(), provider);
    const postId = await makePost(await createSite());
    await jsonPost(`/api/posts/${postId}/image/plan`);
    const queued = await jsonPost(`/api/posts/${postId}/image/generate`);
    expect(queued.json().status).toBe("QUEUED");
    expect((await jsonPost(`/api/posts/${postId}/image/generate`)).statusCode).toBe(409);

    await worker.tick();
    const image = await getImage(postId);
    expect(image).toMatchObject({ status: "READY", hasFile: true, aiGenerated: true });
    expect(provider.prompts).toHaveLength(1);

    const file = await app.inject({ method: "GET", url: `/api/posts/${postId}/image/file`, headers: { cookie } });
    expect(file.headers["content-type"]).toBe("image/png");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    const chunks = readChunks(file.rawPayload);
    expect(chunks.map((c) => c.type)).toContain("iTXt");
    expect(chunks.find((c) => c.type === "iTXt")!.data.toString("utf8")).toContain("trainedAlgorithmicMedia");
    expect((await app.inject({ method: "GET", url: `/api/posts/${postId}/image/file` })).statusCode).toBe(401);
  });

  it("meldet Fehler des Bildanbieters am Bild und erlaubt einen neuen Versuch", async () => {
    let fail = true;
    const flaky: ImageProvider = { name: "test", generate: async () => { if (fail) throw new Error("Sicherheitsfilter"); return new FakeImageProvider().generate({ prompt: "" }); } };
    await setup(new FakeAiService(), flaky);
    const postId = await makePost(await createSite());
    await jsonPost(`/api/posts/${postId}/image/plan`);
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();
    expect(await getImage(postId)).toMatchObject({ status: "FAILED", error: "Sicherheitsfilter" });
    fail = false;
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();
    expect(await getImage(postId)).toMatchObject({ status: "READY", error: null });
  });

  it("erklaert, wenn keine Bildgenerierung eingerichtet ist, und bietet Features-Abfrage", async () => {
    const postId = await makePost(await createSite());
    await jsonPost(`/api/posts/${postId}/image/plan`);
    const res = await jsonPost(`/api/posts/${postId}/image/generate`);
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("IMAGE_PROVIDER");
    expect((await app.inject({ method: "GET", url: "/api/features", headers: { cookie } })).json()).toEqual({ imageGeneration: null });
    await setup(new FakeAiService(), new FakeImageProvider());
    expect((await app.inject({ method: "GET", url: "/api/features", headers: { cookie } })).json()).toEqual({ imageGeneration: "fake" });
  });

  function uploadBody(file: Buffer, fields: Record<string, string>) {
    const parts: Buffer[] = [];
    for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bild.png"\r\nContent-Type: image/png\r\n\r\n`), file, Buffer.from(`\r\n--${boundary}--\r\n`));
    return { payload: Buffer.concat(parts), headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie } };
  }

  it("nimmt hochgeladene Bilder nur mit Quellenangabe und echtem Bildformat an", async () => {
    const postId = await makePost(await createSite());
    const png = makePlaceholderPng(40, 20);

    const noSource = uploadBody(png, { altText: "Alt" });
    expect((await app.inject({ method: "POST", url: `/api/posts/${postId}/image/upload`, ...noSource })).json().error).toContain("Quelle und Lizenz");

    const fake = uploadBody(Buffer.from("<script>alert(1)</script>"), { sourceNote: "Eigenes Foto" });
    const rejected = await app.inject({ method: "POST", url: `/api/posts/${postId}/image/upload`, ...fake });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toContain("PNG-, JPEG- und WebP");

    const ok = uploadBody(png, { sourceNote: "Pexels, Pexels-Lizenz", altText: "Schreibtisch mit Akten", caption: "Symbolfoto", aiGenerated: "false" });
    const res = await app.inject({ method: "POST", url: `/api/posts/${postId}/image/upload`, ...ok });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "READY", origin: "UPLOAD", aiGenerated: false, sourceNote: "Pexels, Pexels-Lizenz", hasFile: true });
    const stored = await app.inject({ method: "GET", url: `/api/posts/${postId}/image/file`, headers: { cookie } });
    expect(readChunks(stored.rawPayload).map((c) => c.type)).not.toContain("iTXt"); // nicht als KI-Bild markiert

    // als KI-generiert deklariertes Bild bekommt den Metadaten-Vermerk
    const ai = uploadBody(png, { sourceNote: "Supermachine, eigene Lizenz", aiGenerated: "true" });
    expect((await app.inject({ method: "POST", url: `/api/posts/${postId}/image/upload`, ...ai })).json().aiGenerated).toBe(true);
    const marked = await app.inject({ method: "GET", url: `/api/posts/${postId}/image/file`, headers: { cookie } });
    expect(isPng(marked.rawPayload) && readChunks(marked.rawPayload).map((c) => c.type)).toContain("iTXt");
  });

  it("uebertraegt das Beitragsbild bei WordPress als Beitragsbild (mit Alt-Text und Kennzeichnung) und uebergeht Fehler", async () => {
    const calls = fakeWordPress({ ...standardRoutes(), "POST /wp-json/wp/v2/media": { body: { id: 55 } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    const site = await createWpSite();
    const postId = await makePost(site.id);
    await jsonPost(`/api/posts/${postId}/image/plan`);
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();

    const pub = await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(pub.json().image).toMatchObject({ status: "set" });
    const upload = calls.find((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/media")!;
    expect(upload.headers["content-type"]).toBe("image/png");
    expect(upload.headers["content-disposition"]).toContain("beispielthema.png");
    const meta = calls.find((c) => c.path === "/wp-json/wp/v2/media/55")!;
    expect(meta.body).toMatchObject({ alt_text: expect.any(String), caption: expect.stringContaining("Bild: KI-generiert") });
    expect(calls.find((c) => c.path === "/wp-json/wp/v2/posts" && c.method === "POST")?.body).toMatchObject({ featured_media: 55 });
    expect((await getImage(postId)).inWordPress).toBe(true);

    // Kennzeichnung laesst sich pro Website abschalten; zweiter Versand aktualisiert nur die Medien-Felder
    await app.inject({ method: "PUT", url: `/api/sites/${site.id}`, headers: { cookie }, payload: { name: "Kanzlei WP", baseUrl: WP_BASE, wpUsername: "daniel", labelAiImages: false } });
    calls.length = 0;
    fakeWordPressAppend(calls, { "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } }, "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: "x", status: "draft" } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(calls.some((c) => c.path === "/wp-json/wp/v2/media" && c.method === "POST")).toBe(false);
    expect(calls.find((c) => c.path === "/wp-json/wp/v2/media/55")?.body?.caption).toBe("Symbolbild");
  });

  it("setzt bei KI-generiertem Beitragsbild einen sichtbaren Hinweis vorn in den WordPress-Beitrag - sonst nicht - und speichert ihn nicht im Entwurf", async () => {
    const calls = fakeWordPress({ ...standardRoutes(), "POST /wp-json/wp/v2/media": { body: { id: 55 } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    const site = await createWpSite();
    const postId = await makePost(site.id);
    const sentContent = () => String(calls.filter((c) => c.path.startsWith("/wp-json/wp/v2/posts") && c.method === "POST").at(-1)?.body?.content);

    // ohne Bild: kein Hinweis
    await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(sentContent()).not.toContain("KI-generiert");

    // KI-Bild: Hinweis steht vorn; im gespeicherten Entwurf nicht
    await jsonPost(`/api/posts/${postId}/image/plan`);
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();
    calls.length = 0;
    fakeWordPressAppend(calls, { "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } }, "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: "x", status: "draft" } }, "POST /wp-json/wp/v2/media": { body: { id: 55 } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    const pub = await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(pub.json().imageNotice).toBe(true);
    expect(sentContent().startsWith("<p><em>Beitragsbild: KI-generiert.</em></p>")).toBe(true);
    expect((await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json().contentHtml).not.toContain("Beitragsbild: KI-generiert");

    // eigener Wortlaut
    await app.inject({ method: "PUT", url: `/api/sites/${site.id}`, headers: { cookie }, payload: { name: "Kanzlei WP", baseUrl: WP_BASE, wpUsername: "daniel", aiNoticeText: "Das Beitragsbild wurde mit KI erzeugt." } });
    calls.length = 0;
    fakeWordPressAppend(calls, { "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } }, "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: "x", status: "draft" } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(sentContent().startsWith("<p><em>Das Beitragsbild wurde mit KI erzeugt.</em></p>")).toBe(true);

    // Kennzeichnung abgeschaltet -> kein Hinweis
    await app.inject({ method: "PUT", url: `/api/sites/${site.id}`, headers: { cookie }, payload: { name: "Kanzlei WP", baseUrl: WP_BASE, wpUsername: "daniel", labelAiImages: false } });
    calls.length = 0;
    fakeWordPressAppend(calls, { "GET /wp-json/wp/v2/posts/42": { body: { id: 42, status: "draft" } }, "POST /wp-json/wp/v2/posts/42": { body: { id: 42, link: "x", status: "draft" } }, "POST /wp-json/wp/v2/media/55": { body: { id: 55 } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    const off = await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(off.json().imageNotice).toBe(false);
    expect(sentContent()).not.toContain("mit KI erzeugt");
  });

  it("ersetzt auf Wunsch den veroeffentlichten Originalbeitrag (Datum/Adresse bleiben) und nennt in der Stand-Zeile das Ursprungsdatum", async () => {
    const original = { id: 7, status: "publish", title: { rendered: "Alter Beitrag" }, link: `${WP_BASE}/alt/`, date: "2023-05-01T10:00:00", excerpt: { rendered: "" }, content: { rendered: `<p>${"Alter Text. ".repeat(30)}</p>` } };
    const calls = fakeWordPress({
      ...standardRoutes(),
      "GET /wp-json/wp/v2/posts/7": { body: original },
      "POST /wp-json/wp/v2/posts/7": { body: { id: 7, link: `${WP_BASE}/alt/`, status: "publish" } },
    });
    await setup(new FakeAiService());
    const site = await createWpSite();
    const rev = await app.inject({ method: "POST", url: `/api/sites/${site.id}/revisions`, headers: { cookie }, payload: { wpPostId: 7, instructions: "Aktualisieren" } });
    expect(rev.statusCode).toBe(201);
    const postId = rev.json().id as string;
    await worker.tick();

    const stored = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(stored.contentHtml).toMatch(/Stand: \d{2}\.\d{2}\.\d{4} \(aktualisiert\)\. Ursprünglich veröffentlicht am 01\.05\.2023\./);

    // ohne Bestaetigung oder bei normalen Beitraegen: abgelehnt
    expect((await jsonPost(`/api/posts/${postId}/wordpress/publish`, { replaceOriginal: true })).statusCode).toBe(400);
    const plain = await makePost(site.id);
    expect((await jsonPost(`/api/posts/${plain}/wordpress/publish`, { replaceOriginal: true, confirmReplace: true })).statusCode).toBe(400);
    expect(calls.some((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts/7")).toBe(false);

    // mit Bestaetigung: Original wird aktualisiert, ohne Status/Datum/Adresse/Kategorien
    const pub = await jsonPost(`/api/posts/${postId}/wordpress/publish`, { replaceOriginal: true, confirmReplace: true });
    expect(pub.statusCode).toBe(200);
    expect(pub.json()).toMatchObject({ wpPostId: 7, updated: true, replaced: true });
    const update = calls.find((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts/7")!;
    expect(Object.keys(update.body ?? {}).sort()).toEqual(["content", "excerpt", "meta", "title"]);
    expect(calls.some((c) => c.method === "POST" && c.path === "/wp-json/wp/v2/posts")).toBe(false);
    const after = (await app.inject({ method: "GET", url: `/api/posts/${postId}`, headers: { cookie } })).json();
    expect(after.wpPostId).toBe(7);
    expect(after.wpReplacedAt).toBeTruthy();

    // danach ist der normale Entwurfsweg gesperrt (Hinweis), das erneute Ersetzen geht
    expect((await jsonPost(`/api/posts/${postId}/wordpress/publish`, {})).statusCode).toBe(409);
    expect((await jsonPost(`/api/posts/${postId}/wordpress/publish`, { replaceOriginal: true, confirmReplace: true })).statusCode).toBe(200);
  });

  it("legt den Entwurf auch an, wenn das Bild nicht hochgeladen werden darf", async () => {
    fakeWordPress({ ...standardRoutes(), "POST /wp-json/wp/v2/media": { status: 403, body: { message: "Sorry" } } });
    await setup(new FakeAiService(), new FakeImageProvider());
    const site = await createWpSite();
    const postId = await makePost(site.id);
    await jsonPost(`/api/posts/${postId}/image/plan`);
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();
    const pub = await jsonPost(`/api/posts/${postId}/wordpress/publish`, { categoryIds: [3], tags: [] });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().wpPostId).toBe(42);
    expect(pub.json().image).toMatchObject({ status: "failed" });
    expect(pub.json().image.message).toContain("keine Dateien hochladen");
  });

  it("loescht das Beitragsbild samt Datei", async () => {
    await setup(new FakeAiService(), new FakeImageProvider());
    const postId = await makePost(await createSite());
    await jsonPost(`/api/posts/${postId}/image/plan`);
    await jsonPost(`/api/posts/${postId}/image/generate`);
    await worker.tick();
    expect((await app.inject({ method: "DELETE", url: `/api/posts/${postId}/image`, headers: { cookie } })).statusCode).toBe(204);
    expect(await getImage(postId)).toBeNull();
    expect((await app.inject({ method: "GET", url: `/api/posts/${postId}/image/file`, headers: { cookie } })).statusCode).toBe(404);
  });
});
