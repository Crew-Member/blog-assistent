import { describe, expect, it } from "vitest";
import { detectKind, extractDocument } from "./extract.js";
import { applyLinkPolicy, sanitizePostHtml } from "./html.js";
import { autoLinkNorms } from "./norms.js";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("loest Umlaute auf und bereinigt Sonderzeichen", () => {
    expect(slugify("BAG-Urteil: Überstunden & Überwachung (2026)!")).toBe("bag-urteil-ueberstunden-ueberwachung-2026");
  });
  it("kuerzt ohne Bindestrich am Ende", () => {
    const s = slugify("a".repeat(30) + " " + "b".repeat(60), 40);
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("sanitizePostHtml", () => {
  it("entfernt Skripte, Styles und Event-Handler, erlaubt Links mit rel", () => {
    const out = sanitizePostHtml('<h2 style="x">T</h2><script>alert(1)</script><p onclick="x()">A <a href="https://example.org">l</a><a href="javascript:alert(1)">b</a></p>');
    expect(out).not.toContain("script");
    expect(out).not.toContain("onclick");
    expect(out).not.toContain("style=");
    expect(out).not.toContain("javascript:");
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe("detectKind", () => {
  it("nutzt die Endung, wenn der Browser keinen MIME-Typ liefert", () => {
    expect(detectKind("urteil.PDF", "application/octet-stream").kind).toBe("pdf");
    expect(detectKind("mail.eml", "application/octet-stream").kind).toBe("email");
    expect(detectKind("foto.jpg", "application/octet-stream")).toEqual({ kind: "image", mimeType: "image/jpeg" });
    expect(detectKind("mail.msg", "application/octet-stream").kind).toBe("msg");
    expect(detectKind("programm.exe", "application/octet-stream").kind).toBe("unsupported");
  });
});

describe("extractDocument", () => {
  it("liest Betreff, Absender und Text aus einer .eml", async () => {
    const eml = [
      "From: Kanzlei <info@example.org>",
      "To: x@example.org",
      "Subject: Neues BAG-Urteil",
      "Date: Mon, 28 Sep 2026 10:00:00 +0200",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Das BAG hat entschieden.",
    ].join("\r\n");
    const doc = await extractDocument("mail.eml", "", Buffer.from(eml));
    expect(doc.kind).toBe("text");
    expect(doc.text).toContain("Betreff: Neues BAG-Urteil");
    expect(doc.text).toContain("Das BAG hat entschieden.");
  });
  it("entfernt HTML-Markup aus .html-Dateien", async () => {
    const doc = await extractDocument("a.html", "text/html", Buffer.from("<html><body><style>x{}</style><p>Hallo &amp; Welt</p></body></html>"));
    expect(doc.text).toBe("Hallo & Welt");
  });
  it("laesst PDFs unveraendert (Claude liest sie nativ)", async () => {
    const doc = await extractDocument("u.pdf", "application/pdf", Buffer.from("%PDF-1.4"));
    expect(doc).toEqual({ kind: "pdf", mimeType: "application/pdf" });
  });
});

describe("slugWithKeyword", () => {
  it("stellt das Keyword zusammenhaengend voran und haelt die Laenge", async () => {
    const { slugWithKeyword } = await import("./slug.js");
    expect(slugWithKeyword("olg-naumburg-abmahnung", "Datenschutzverstöße Konkurrenten")).toBe("datenschutzverstoesse-konkurrenten-olg-naumburg-abm".slice(0, 50).replace(/-+$/, ""));
    expect(slugWithKeyword("datenschutz-wettbewerber-urteil", "Datenschutz Wettbewerber")).toBe("datenschutz-wettbewerber-urteil");
  });
});

describe("fetchSitePost", () => {
  it("weicht auf andere REST-Wege aus und toleriert Zeichen vor dem JSON", async () => {
    const { fetchSitePost } = await import("./wordpress.js");
    const post = { id: 7, title: { rendered: "Titel" }, link: "https://93.184.216.34/a/", date: "", excerpt: { rendered: "" }, content: { rendered: "<p>Text</p>" } };
    const seen: string[] = [];
    const fetcher = (async (url: string) => {
      const u = new URL(url);
      seen.push(u.pathname + u.search);
      if (u.pathname === "/wp-json/wp/v2/posts/7") return new Response("<html>Firewall</html>", { headers: { "content-type": "text/html" } });
      if (u.searchParams.get("include")) return new Response("﻿\n" + JSON.stringify([post]));
      return new Response("{}");
    }) as never;
    const result = await fetchSitePost("https://93.184.216.34", 7, fetcher);
    expect(result.html).toBe("<p>Text</p>");
    expect(seen.length).toBe(3);
  });

  it("nennt bei Nicht-JSON den Anfang der Antwort", async () => {
    const { fetchSitePost } = await import("./wordpress.js");
    const fetcher = (async () => new Response("<html>Bitte Captcha loesen</html>", { headers: { "content-type": "text/html" } })) as never;
    await expect(fetchSitePost("https://93.184.216.34", 7, fetcher)).rejects.toThrow(/Captcha/);
  });
});

describe("parseJsonLoosely", () => {
  it("liest JSON hinter vorangestellten Style-Bloecken und vor Nachlauf", async () => {
    const { parseJsonLoosely } = await import("./wordpress.js");
    const css = '<style id="elementor-post-28899">.elementor-widget-text-editor{font-family:var(--x)}</style>';
    expect(parseJsonLoosely(`${css}\n{"id":7,"content":{"rendered":"<p>a {b}</p>"}}`)).toEqual({ id: 7, content: { rendered: "<p>a {b}</p>" } });
    expect(parseJsonLoosely(`\uFEFF[{"id":1}]<!-- cache -->`)).toEqual([{ id: 1 }]);
    expect(() => parseJsonLoosely("<html>nix</html>")).toThrow();
  });
});

describe("isTrustedSource", () => {
  it("nimmt beck-online und Wolters Kluwer auf, aber keine Wettbewerber", async () => {
    const { isTrustedSource } = await import("./links.js");
    for (const url of ["https://beck-online.beck.de/Dokument?vpath=x", "https://www.wolterskluwer-online.de/x", "https://www.wolterskluwer.com/de", "https://rsw.beck.de/x", "https://www.jurion.de/x"]) {
      expect(isTrustedSource(url)).toBe(true);
    }
    expect(isTrustedSource("https://www.haufe.de/x")).toBe(false);
    expect(isTrustedSource("https://evil-beck.de/x")).toBe(false);
  });
});

describe("applyLinkPolicy", () => {
  it("erlaubt nur amtliche Quellen und bekannte interne Seiten und begrenzt die Anzahl", async () => {
    const { applyLinkPolicy } = await import("./html.js");
    const html = [
      '<a href="https://www.gesetze-im-internet.de/dsgvo/art_83.html">Art. 83</a>',
      '<a href="https://curia.europa.eu/x">EuGH</a>',
      '<a href="https://www.haufe.de/x">Haufe</a>',
      '<a href="https://kanzlei-datenschutz.de/y">Wettbewerber</a>',
      '<a href="https://www.olg-naumburg.de/z">OLG</a>',
      '<a href="https://www.gesetze-im-internet.de/dsgvo/art_83.html">doppelt</a>',
      '<a href="https://kirmse.eu/bekannt/">intern</a>',
      '<a href="https://kirmse.eu/erfunden/">intern2</a>',
      '<a href="mailto:a@b.de">Mail</a>',
    ].join(" ");
    const out = applyLinkPolicy(html, "https://kirmse.eu", ["https://kirmse.eu/bekannt/"]);
    expect(out).toContain('href="https://www.gesetze-im-internet.de/dsgvo/art_83.html">Art. 83');
    expect(out).toContain("curia.europa.eu");
    expect(out).toContain("olg-naumburg.de");
    expect(out).toContain("kirmse.eu/bekannt");
    expect(out).toContain("mailto:a@b.de");
    for (const gone of ["haufe.de", "kanzlei-datenschutz.de", "erfunden"]) expect(out).not.toContain(gone);
    expect(out).toContain("Haufe");
    expect(out).toContain(">doppelt</a>".replace(">doppelt</a>", "doppelt")); // Text bleibt
    expect(out.match(/gesetze-im-internet\.de/g)).toHaveLength(1);
  });
});

describe("fetchPrimarySources", () => {
  it("ruft nur freie Primaerquellen ab und meldet Fehler je Quelle", async () => {
    const { fetchPrimarySources } = await import("./sources.js");
    const page = "<html><body><p>" + "Der Senat hat am 07.11.2019 unter dem Aktenzeichen 9 U 39/18 entschieden. ".repeat(5) + "</p></body></html>";
    const calls: string[] = [];
    const fetcher = (async (url: string) => {
      calls.push(url);
      if (url.includes("gesetze-im-internet.de")) return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
      if (url.includes("curia.europa.eu")) return new Response("nope", { status: 404 });
      return new Response("x");
    }) as never;
    const result = await fetchPrimarySources(
      ["https://www.gesetze-im-internet.de/dsgvo/", "https://curia.europa.eu/x", "https://www.haufe.de/x", "https://beck-online.beck.de/x", "https://www.gesetze-im-internet.de/dsgvo/#a"],
      fetcher,
    );
    expect(result.map((r) => [r.url, r.ok])).toEqual([["https://www.gesetze-im-internet.de/dsgvo/", true], ["https://curia.europa.eu/x", false]]);
    expect(result[0]?.document?.text).toContain("9 U 39/18");
    expect(result[1]?.reason).toContain("404");
    expect(calls.some((c) => c.includes("haufe") || c.includes("beck"))).toBe(false);
  });

  it("folgt Weiterleitungen nur innerhalb vertrauenswuerdiger Quellen", async () => {
    const { fetchPrimarySources } = await import("./sources.js");
    const fetcher = (async (url: string) => (url.includes("gesetze-im-internet") ? new Response(null, { status: 302, headers: { location: "https://www.haufe.de/umleitung" } }) : new Response("x"))) as never;
    const [r] = await fetchPrimarySources(["https://www.gesetze-im-internet.de/a"], fetcher);
    expect(r?.ok).toBe(false);
  });
});

describe("Wettbewerbsvergleich (Seitenanalyse)", () => {
  it("zaehlt Woerter im Hauptinhalt, liest Titel und Ueberschriften und waehlt Treffer sinnvoll aus", async () => {
    const { analyzeHtml, pickCompetitorUrls, median, clampWords } = await import("./competition.js");
    const body = "Wort ".repeat(300);
    const html = `<html><head><title>Ratgeber &amp; Co</title></head><body><nav>Menü Menü Menü</nav><header>Kopf</header><article><h1>Haupt</h1><h2>Erster Abschnitt</h2><p>${body}</p><h3>Zweiter Abschnitt</h3><p>${body}</p></article><footer>Impressum Datenschutz</footer></body></html>`;
    const page = analyzeHtml("https://x.example/a", html);
    expect(page.title).toBe("Ratgeber & Co");
    expect(page.words).toBeGreaterThanOrEqual(600);
    expect(page.words).toBeLessThan(620);
    expect(page.headings).toEqual(["Erster Abschnitt", "Zweiter Abschnitt"]);

    const urls = pickCompetitorUrls(
      [{ url: "https://www.kirmse.eu/a" }, { url: "https://www.youtube.com/watch" }, { url: "https://a.example/1" }, { url: "https://a.example/2" }, { url: "https://b.example/x.pdf" }, { url: "https://c.example/3" }],
      "https://kirmse.eu",
    );
    expect(urls).toEqual(["https://a.example/1", "https://c.example/3"]);
    expect(median([300, 900, 700])).toBe(700);
    expect(median([400, 800])).toBe(600);
    expect(clampWords(100)).toBe(400);
    expect(clampWords(5000)).toBe(1800);
  });
});

describe("costOf", () => {
  it("rechnet Tokens, Cache und Websuchen nach den Preisen und nimmt feste Kosten (Bilder) unveraendert", async () => {
    const { costOf } = await import("./usage.js");
    const prices = { inputPerMTok: 5, outputPerMTok: 25, searchPer1000: 10 };
    const base = { step: "draft", model: "m", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, webSearches: 0 };
    expect(costOf({ ...base, inputTokens: 1_000_000, outputTokens: 100_000 }, prices)).toBeCloseTo(5 + 2.5, 6);
    expect(costOf({ ...base, cacheReadTokens: 1_000_000 }, prices)).toBeCloseTo(0.5, 6);
    expect(costOf({ ...base, cacheWriteTokens: 1_000_000 }, prices)).toBeCloseTo(6.25, 6);
    expect(costOf({ ...base, webSearches: 8 }, prices)).toBeCloseTo(0.08, 6);
    expect(costOf({ ...base, step: "image_generate", fixedCostUsd: 0.04 }, prices)).toBe(0.04);
    // guenstigeres Modell: eigene Preise, ohne Angabe die Hauptpreise
    const light = { ...prices, lightInputPerMTok: 1, lightOutputPerMTok: 5 };
    expect(costOf({ ...base, light: true, inputTokens: 1_000_000, outputTokens: 100_000 }, light)).toBeCloseTo(1.5, 6);
    expect(costOf({ ...base, light: true, inputTokens: 1_000_000 }, prices)).toBeCloseTo(5, 6);
    expect(costOf({ ...base, light: false, inputTokens: 1_000_000 }, light)).toBeCloseTo(5, 6);
  });
});

describe("applyLinkPolicy: allgemeine Quellen als Auffueller", () => {
  const a = (url: string, text: string) => `<a href="${url}">${text}</a>`;
  it("erlaubt Infoportale/Presse nur aus der Recherche, nur bis mindestens 3 externe Links, nie Wettbewerber oder Netzwerke", async () => {
    const { applyLinkPolicy } = await import("./html.js");
    const general = ["https://portal.example/a", "https://presse.example/b", "https://blog.example/c", "https://rival.example/d", "https://www.linkedin.com/x"];
    const options = { generalAllowed: general, blockedHosts: ["rival.example"] };

    // Ohne Primaerquelle: drei allgemeine Quellen duerfen auffuellen; die vierte nicht, Wettbewerber und Netzwerk nie, Erfundenes nie
    const none = [a("https://portal.example/a", "P"), a("https://rival.example/d", "R"), a("https://presse.example/b", "Pr"), a("https://www.linkedin.com/x", "L"), a("https://blog.example/c", "B"), a("https://erfunden.example/z", "E"), a("https://x.example/q", "Q")].join(" ");
    const out1 = applyLinkPolicy(none, "https://kirmse.eu", [], options);
    expect(out1.match(/<a /g)).toHaveLength(3);
    for (const keep of ["portal.example", "presse.example", "blog.example"]) expect(out1).toContain(keep);
    for (const gone of ["rival.example", "linkedin", "erfunden", "x.example"]) expect(out1).not.toContain(gone);

    // Zwei Primaerquellen: nur noch ein allgemeiner Link als Auffueller
    const two = [a("https://www.gesetze-im-internet.de/dsgvo/", "G"), a("https://curia.europa.eu/x", "E"), a("https://portal.example/a", "P"), a("https://presse.example/b", "Pr")].join(" ");
    const out2 = applyLinkPolicy(two, "https://kirmse.eu", [], options);
    expect(out2.match(/<a /g)).toHaveLength(3);
    expect(out2).toContain("portal.example");
    expect(out2).not.toContain("presse.example");

    // Drei Primaerquellen: keine allgemeinen mehr
    const three = [a("https://www.gesetze-im-internet.de/a", "1"), a("https://curia.europa.eu/b", "2"), a("https://eur-lex.europa.eu/c", "3"), a("https://portal.example/a", "P")].join(" ");
    expect(applyLinkPolicy(three, "https://kirmse.eu", [], options)).not.toContain("portal.example");

    // Ohne generalAllowed (altes Verhalten): keine allgemeinen Links
    expect(applyLinkPolicy(none, "https://kirmse.eu", [])).not.toContain("<a ");
  });
});

describe("Selbstverweise bei Ueberarbeitungen", () => {
  it("urlKey ignoriert Protokoll, www, Schraegstrich und Anker", async () => {
    const { urlKey } = await import("./html.js");
    expect(urlKey("http://www.Kirmse.eu/alt/#x")).toBe(urlKey("https://kirmse.eu/alt"));
    expect(urlKey("https://kirmse.eu/?p=7")).not.toBe(urlKey("https://kirmse.eu/"));
  });

  it("verlinkt nie auf den Originalbeitrag - auch nicht in abweichender Schreibweise - und kennt www als eigene Website", async () => {
    const { applyLinkPolicy, unwrapBlockedLinks } = await import("./html.js");
    const html = [
      '<a href="https://kirmse.eu/alt/">Original</a>',
      '<a href="http://www.kirmse.eu/alt">Original www</a>',
      '<a href="https://kirmse.eu/?p=7">Kurzlink</a>',
      '<a href="https://www.kirmse.eu/anderer/">Anderer</a>',
      '<a href="https://www.kirmse.eu/erfunden/">Erfunden</a>',
    ].join(" ");
    const blocked = ["https://kirmse.eu/alt/", "https://kirmse.eu/?p=7"];
    const out = applyLinkPolicy(html, "https://kirmse.eu", ["https://kirmse.eu/anderer/"], { generalAllowed: ["https://kirmse.eu/alt/", "http://www.kirmse.eu/alt"], blockedUrls: blocked });
    expect(out).toContain("kirmse.eu/anderer");
    for (const gone of ["/alt", "?p=7", "erfunden"]) expect(out).not.toContain(gone);
    expect(unwrapBlockedLinks(html, blocked)).not.toContain("?p=7");
    expect(unwrapBlockedLinks(html, blocked)).toContain("Original www"); // Text bleibt
  });
});

describe("autoLinkRulings", () => {
  it("verlinkt zitierte Aktenzeichen auf die Gerichtswebsite (vor Datenbanken), nur beim ersten Vorkommen und nie in bestehenden Links", async () => {
    const { autoLinkRulings } = await import("./rulings.js");
    const html = "<p>Der BGH (Az. II ZR 123/21) entschied. Später nannte der BGH II ZR 123/21 erneut; der <a href=\"https://x.example/y\">EuGH C-807/21</a> sah es ähnlich. Nicht belegt: 1 BvR 99/20.</p>";
    const out = autoLinkRulings(html, [
      { url: "https://www.rechtsprechung-im-internet.de/jportal/?doc=II-ZR-123-21", title: "II ZR 123/21" },
      { url: "https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2022/II-ZR-123-21.html", title: "Pressemitteilung" },
      { url: "https://www.haufe.de/recht/ii-zr-123-21", title: "II ZR 123/21 Haufe" },
      { url: "https://curia.europa.eu/juris/liste.jsf?num=C-807/21", title: "EuGH C-807/21" },
    ]);
    expect(out).toContain('<a href="https://www.bundesgerichtshof.de/SharedDocs/Pressemitteilungen/DE/2022/II-ZR-123-21.html">II ZR 123/21</a>');
    expect(out.match(/II ZR 123\/21/g)).toHaveLength(2); // zweites Vorkommen bleibt Text
    expect(out.match(/<a /g)).toHaveLength(2); // BGH-Link + vorhandener EuGH-Link (nicht doppelt verlinkt)
    expect(out).not.toContain("haufe.de");
    expect(out).toContain("1 BvR 99/20.</p>"); // ohne Quelle bleibt es Text
  });
});

describe("castPeople", () => {
  it("liefert konkrete, wechselnde Personenbeschreibungen", async () => {
    const { castPeople } = await import("./casting.js");
    const a = castPeople(3);
    expect(a).toHaveLength(3);
    expect(a[0]).toMatch(/^Person 1: (Frau|Mann), /);
    // Deterministisch bei fester Zufallsquelle, verschieden bei anderer
    let n = 0;
    const seq = () => ((n = (n * 7 + 3) % 10) + 0.05) / 10;
    expect(castPeople(2, seq)).toEqual(castPeople(2, ((m) => () => ((m = (m * 7 + 3) % 10) + 0.05) / 10)(0)));
    const runs = new Set(Array.from({ length: 20 }, () => castPeople(1)[0]));
    expect(runs.size).toBeGreaterThan(10);
  });
});

describe("Search Console", () => {
  it("fasst Suchbegriffe zu wachsenden Begriffen, Luecken und Spitzenreitern zusammen", async () => {
    const { summarizeDemand, demandPeriods } = await import("./gsc.js");
    const text = summarizeDemand(
      [
        { query: "ki verordnung fristen", impressions: 300, clicks: 9, position: 14.2 },
        { query: "dsgvo bussgeld", impressions: 500, clicks: 40, position: 4.1 },
        { query: "selten", impressions: 3, clicks: 0, position: 30 },
      ],
      [{ query: "ki verordnung fristen", impressions: 100, clicks: 2, position: 20 }, { query: "dsgvo bussgeld", impressions: 480, clicks: 38, position: 4 }],
    );
    expect(text).toContain("Wachsende Suchbegriffe");
    expect(text).toContain("„ki verordnung fristen“: 300 Einblendungen (Vorperiode 100, +200 %)");
    expect(text).toContain("Lücken");
    expect(text).not.toContain("„selten“");
    expect(summarizeDemand([], [])).toBe("");
    const p = demandPeriods(new Date("2026-10-15T12:00:00Z"));
    expect(p.current).toEqual(["2026-09-15", "2026-10-12"]);
    expect(p.previous).toEqual(["2026-08-18", "2026-09-14"]);
  });

  it("meldet sich per JWT an und liest Suchbegriffe; erklaert fehlenden Zugriff", async () => {
    const { createSearchConsole, findKeyFile } = await import("./gsc.js");
    const { generateKeyPairSync } = await import("node:crypto");
    const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const nodePath = await import("node:path");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const dir = mkdtempSync(nodePath.join(tmpdir(), "gsc-"));
    mkdirSync(nodePath.join(dir, "secrets"));
    const file = nodePath.join(dir, "secrets", "key.json");
    writeFileSync(file, JSON.stringify({ type: "service_account", client_email: "dienst@projekt.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    expect(findKeyFile(undefined, dir)).toBe(file);
    expect(findKeyFile("key.json", nodePath.join(dir, "secrets"))).toBe(file);
    expect(findKeyFile(undefined, mkdtempSync(nodePath.join(tmpdir(), "leer-")))).toBeUndefined();

    const calls: { url: string; auth?: string; body?: string }[] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.authorization, body: String(init?.body) });
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }));
      if (decodeURIComponent(url).includes("geschlossen.example")) return new Response("{}", { status: 403 });
      return new Response(JSON.stringify({ rows: [{ keys: ["dsgvo"], clicks: 3, impressions: 40, position: 7.5 }] }));
    }) as typeof fetch;
    const sc = createSearchConsole(file, fetcher);
    expect(sc.configured()).toBe(true);
    expect(sc.email()).toBe("dienst@projekt.iam.gserviceaccount.com");
    expect(await sc.queries("https://kirmse.eu", "2026-09-01", "2026-09-28")).toEqual([{ query: "dsgvo", clicks: 3, impressions: 40, position: 7.5 }]);
    expect(calls[0]?.body).toContain("jwt-bearer");
    expect(calls[1]?.url).toContain("/sites/https%3A%2F%2Fkirmse.eu%2F/searchAnalytics/query");
    expect(calls[1]?.auth).toBe("Bearer tok");
    await expect(sc.queries("https://geschlossen.example/", "a", "b")).rejects.toThrow(/dienst@projekt\.iam\.gserviceaccount\.com/);
    const off = createSearchConsole(file, (async (url: string) =>
      url.includes("oauth2")
        ? new Response(JSON.stringify({ access_token: "t" }))
        : new Response(JSON.stringify({ error: { message: "Search Console API has not been used in project 1 before or it is disabled.", errors: [{ reason: "accessNotConfigured" }] } }), { status: 403 })) as typeof fetch);
    await expect(off.queries("https://kirmse.eu/", "a", "b")).rejects.toThrow(/nicht aktiviert/);
    expect(createSearchConsole(undefined, fetcher).configured()).toBe(false);
  });
});

describe("demandNoteFor", () => {
  it("belegt Ideen nur mit passenden Suchbegriffen und echten Zahlen", async () => {
    const { demandNoteFor } = await import("./gsc.js");
    const now = [
      { query: "ki verordnung fristen", impressions: 300, clicks: 9, position: 14.2 },
      { query: "ki verordnung", impressions: 900, clicks: 30, position: 8 },
      { query: "dsgvo bussgeld", impressions: 500, clicks: 40, position: 4.1 },
    ];
    const before = [{ query: "ki verordnung fristen", impressions: 100, clicks: 2, position: 20 }];
    const note = demandNoteFor({ title: "KI-Omnibus: Neue Fristen der KI-Verordnung", keyword: "ki verordnung fristen" }, now, before);
    expect(note).toContain("„ki verordnung“: 900 Einblendungen in 28 Tagen (neu gegenüber der Vorperiode), Position 8,0");
    expect(note).toContain("„ki verordnung fristen“: 300 Einblendungen in 28 Tagen (+200 % gegenüber der Vorperiode), Position 14,2");
    expect(note).not.toContain("dsgvo");
    expect(demandNoteFor({ title: "Videoüberwachung im Betrieb", keyword: "videoüberwachung" }, now, before)).toBe("");
  });
});

describe("Schlussabsatz mit Zielseiten", () => {
  const closing = '<p>Mehr dazu: <a href="{{url}}">{{bereich}}</a></p>';
  const targets = "Standard | https://kirmse.eu/blog/ | Blog\nArbeitsrecht | https://kirmse.eu/arbeitsrecht/ | Mehr zum Arbeitsrecht\nOnline- & IT-Recht | https://kirmse.eu/it-recht/ | IT-Recht\nkaputt | http://unsicher.example/ | x\nohne Adresse";

  it("liest Zeilen, ignoriert ungueltige und waehlt die Zielseite nach Kategorie", async () => {
    const { parseClosingTargets, targetFor, siteClosing } = await import("./closing.js");
    const list = parseClosingTargets(targets);
    expect(list.map((t) => t.category)).toEqual(["Standard", "Arbeitsrecht", "Online- & IT-Recht"]);
    expect(targetFor(list, "arbeitsrecht")?.url).toBe("https://kirmse.eu/arbeitsrecht/");
    expect(targetFor(list, "Online- &amp; IT-Recht")?.url).toBe("https://kirmse.eu/it-recht/");
    expect(targetFor(list, "Unbekannt")?.url).toBe("https://kirmse.eu/blog/");
    expect(targetFor(list, undefined)?.url).toBe("https://kirmse.eu/blog/");
    expect(siteClosing({ closingHtml: closing, closingTargets: targets })).toMatch(/^<p>Mehr dazu: <a href="https:\/\/kirmse\.eu\/blog\/"[^>]*>Blog<\/a><\/p>$/);
    expect(siteClosing({ closingHtml: closing, closingTargets: targets }, "Arbeitsrecht")).toMatch(/href="https:\/\/kirmse\.eu\/arbeitsrecht\/"[^>]*>Mehr zum Arbeitsrecht/);
  });

  it("laesst Absaetze ohne Platzhalter unveraendert und streicht Platzhalter-Absaetze ohne Zielseite", async () => {
    const { siteClosing } = await import("./closing.js");
    expect(siteClosing({ closingHtml: "<p>Fest <strong>so</strong></p>", closingTargets: targets })).toBe("<p>Fest <strong>so</strong></p>");
    expect(siteClosing({ closingHtml: closing, closingTargets: "" })).toBe("");
  });
});

describe("Disclaimer im Beitragsfuss", () => {
  it("erlaubt Links im Disclaimer und maskiert reinen Text weiterhin", async () => {
    const { assemblePostHtml } = await import("../pipeline.js");
    const now = new Date("2026-10-16T10:00:00Z");
    const withLink = assemblePostHtml("<p>Text</p>", 'Kein Rechtsrat. Mehr im <a href="https://kirmse.eu/blog">Blog</a>', "", now);
    expect(withLink).toMatch(/<p><em>Stand: 16\.10\.2026\. Kein Rechtsrat\. Mehr im <a href="https:\/\/kirmse\.eu\/blog"[^>]*>Blog<\/a><\/em><\/p>$/);
    const plain = assemblePostHtml("<p>Text</p>", "Gewinn <5 % & mehr", "", now);
    expect(plain).toContain("Gewinn &lt;5 % &amp; mehr");
    const script = assemblePostHtml("<p>Text</p>", 'x <script>alert(1)</script> <a href="javascript:alert(1)">y</a>', "", now);
    expect(script).not.toContain("<script");
    expect(script).not.toContain("javascript:");
  });
});

describe("analyzeSeoPotential", () => {
  it("findet Quick Wins, geringe Klickrate, Rueckgaenge und Kannibalisierung", async () => {
    const { analyzeSeoPotential } = await import("./seo-potential.js");
    const posts = [
      { id: 1, title: "Quick Win", url: "https://kirmse.eu/a/" },
      { id: 2, title: "Wenig Klicks", url: "https://kirmse.eu/b/" },
      { id: 3, title: "Rueckgang", url: "https://kirmse.eu/c/" },
      { id: 4, title: "Kannibale A", url: "https://kirmse.eu/d/" },
      { id: 5, title: "Kannibale B", url: "https://kirmse.eu/e/" },
      { id: 6, title: "Unauffaellig", url: "https://kirmse.eu/f/" },
    ];
    const now = [
      { page: "https://kirmse.eu/a/", impressions: 400, clicks: 4, position: 12 },
      { page: "https://kirmse.eu/b/", impressions: 1000, clicks: 10, position: 4 },
      { page: "https://kirmse.eu/c/", impressions: 60, clicks: 2, position: 6 },
      { page: "https://kirmse.eu/f/", impressions: 500, clicks: 50, position: 2 },
      { page: "https://kirmse.eu/kategorie/", impressions: 9000, clicks: 10, position: 15 },
    ];
    const previous = [{ page: "https://kirmse.eu/c/", impressions: 300, clicks: 30, position: 5 }];
    const queries = [
      { page: "https://kirmse.eu/a/", query: "dsgvo bussgeld", impressions: 300, clicks: 3, position: 12 },
      { page: "https://kirmse.eu/d/", query: "videoueberwachung", impressions: 100, clicks: 1, position: 9 },
      { page: "https://kirmse.eu/e/", query: "videoueberwachung", impressions: 40, clicks: 0, position: 14 },
    ];
    const items = analyzeSeoPotential({ posts, now, previous, queries });
    const kinds = items.map((i) => `${i.kind}:${i.wpPostId}`);
    expect(kinds).toContain("quick_win:1");
    expect(kinds).toContain("low_ctr:2");
    expect(kinds).toContain("declining:3");
    expect(kinds).toContain("cannibalization:5"); // der schwaechere von beiden
    expect(kinds.some((k) => k.endsWith(":6"))).toBe(false); // gute Platzierung und Klickrate
    expect(items.every((i) => i.url.startsWith("https://kirmse.eu/") && i.wpPostId !== 0)).toBe(true); // Kategorieseiten fehlen
    expect(items.find((i) => i.kind === "quick_win")?.instructions).toContain("„dsgvo bussgeld“");
    expect(items.find((i) => i.kind === "cannibalization")?.competing?.[0]?.title).toBe("Kannibale A");
    const scores = items.map((i) => i.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("Search-Console-Property-Namen", () => {
  it("versteht Domain-Properties und probiert Alternativen", async () => {
    const { normalizeProperty, propertyAlternatives, createSearchConsole } = await import("./gsc.js");
    expect(normalizeProperty("kdsb.gmbh")).toBe("sc-domain:kdsb.gmbh");
    expect(normalizeProperty(" KDSB.gmbh ")).toBe("sc-domain:kdsb.gmbh");
    expect(normalizeProperty("sc-domain:kdsb.gmbh")).toBe("sc-domain:kdsb.gmbh");
    expect(normalizeProperty("https://kdsb.gmbh")).toBe("https://kdsb.gmbh/");
    expect(normalizeProperty("https://kirmse.eu/blog/")).toBe("https://kirmse.eu/blog/");
    expect(propertyAlternatives("https://www.kdsb.gmbh/")).toEqual(["https://www.kdsb.gmbh/", "sc-domain:kdsb.gmbh"]);
    expect(propertyAlternatives("kdsb.gmbh")).toEqual(["sc-domain:kdsb.gmbh"]);

    const { generateKeyPairSync } = await import("node:crypto");
    const { mkdtempSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const nodePath = await import("node:path");
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const file = nodePath.join(mkdtempSync(nodePath.join(tmpdir(), "gsc2-")), "key.json");
    writeFileSync(file, JSON.stringify({ type: "service_account", client_email: "d@p.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString() }));
    const tried: string[] = [];
    const fetcher = (async (url: string) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "t" }));
      tried.push(decodeURIComponent(url.split("/sites/")[1]!.split("/searchAnalytics")[0]!));
      return url.includes(encodeURIComponent("sc-domain:kdsb.gmbh")) ? new Response(JSON.stringify({ rows: [{ keys: ["x"], clicks: 1, impressions: 5, position: 3 }] })) : new Response(JSON.stringify({ error: { message: "User does not have sufficient permission" } }), { status: 403 });
    }) as typeof fetch;
    const rows = await createSearchConsole(file, fetcher).queries("https://kdsb.gmbh/", "a", "b");
    expect(rows).toHaveLength(1);
    expect(tried).toEqual(["https://kdsb.gmbh/", "sc-domain:kdsb.gmbh"]);
  });
});

describe("SEO-Potenziale bei wenig Daten", () => {
  it("nutzt niedrigere Schwellen bei kleinen Websites und liefert eine Uebersicht", async () => {
    const { analyzeSeoPotential, seoOverview, seoThresholds } = await import("./seo-potential.js");
    expect(seoThresholds(500).relaxed).toBe(true);
    expect(seoThresholds(9000).relaxed).toBe(false);
    const posts = [{ id: 1, title: "A", url: "https://kdsb.gmbh/a/" }, { id: 2, title: "B", url: "https://kdsb.gmbh/b/" }];
    const now = [
      { page: "https://kdsb.gmbh/a/", impressions: 25, clicks: 0, position: 11 },
      { page: "https://kdsb.gmbh/b/", impressions: 90, clicks: 1, position: 4 },
      { page: "https://kdsb.gmbh/", impressions: 300, clicks: 20, position: 2 },
    ];
    const overview = seoOverview(posts, now);
    expect(overview).toMatchObject({ matchedPages: 2, unmatchedPages: 1, impressions: 115 });
    expect(overview.rows.map((r) => r.wpPostId)).toEqual([2, 1]);
    const kinds = analyzeSeoPotential({ posts, now, previous: [], queries: [] }).map((i) => `${i.kind}:${i.wpPostId}`);
    expect(kinds).toEqual(expect.arrayContaining(["quick_win:1", "low_ctr:2"]));
  });
});

describe("optimizeForWeb", () => {
  it("verkleinert zu breite Bilder auf 1600 px als JPEG und behaelt den KI-Vermerk", async () => {
    const { optimizeForWeb } = await import("./webimage.js");
    const { makePlaceholderPng } = await import("./png.js");
    const sharp = (await import("sharp")).default;
    const big = makePlaceholderPng(2400, 1200);
    const out = await optimizeForWeb(big, "image/png", true);
    expect(out).toMatchObject({ mimeType: "image/jpeg", ext: "jpg", optimized: true });
    expect((await sharp(out.data).metadata()).width).toBe(1600);
    expect(out.data.toString("latin1")).toContain("trainedAlgorithmicMedia");
    const plain = await optimizeForWeb(big, "image/png", false);
    expect(plain.data.toString("latin1")).not.toContain("trainedAlgorithmicMedia");
  });

  it("laesst Unlesbares und bereits schlanke Bilder unveraendert", async () => {
    const { optimizeForWeb } = await import("./webimage.js");
    const { makePlaceholderPng } = await import("./png.js");
    const junk = Buffer.from("kein bild");
    expect((await optimizeForWeb(junk, "image/png", false)).optimized).toBe(false);
    const small = makePlaceholderPng(300, 200);
    const res = await optimizeForWeb(small, "image/png", false);
    if (!res.optimized) expect(res.data).toBe(small);
    else expect(res.data.length).toBeLessThan(small.length);
  });
});

describe("structureBlock", () => {
  it("beschreibt Kurzfassung und Fragenabschnitt nur, wenn eingeschaltet", async () => {
    const { structureBlock } = await import("../ai/prompts.js");
    expect(structureBlock(undefined)).toBe("");
    expect(structureBlock({ summary: false, faq: false })).toBe("");
    const both = structureBlock({ summary: true, faq: true });
    expect(both).toContain("Das Wichtigste in Kürze");
    expect(both).toContain("Häufige Fragen");
    expect(structureBlock({ summary: true, faq: false })).not.toContain("Fragenabschnitt");
  });
});

describe("Keyword-Dichte", () => {
  const site = { name: "S", language: "de", audience: "", tone: "", styleGuide: "" };
  const filler = "Das ist ein ganz normaler Satz ohne das besondere Thema darin. ".repeat(60);
  const base = `<p>Einstieg zum Thema Haushaltsausnahme der DSGVO.</p><h2>Überblick</h2><p>${filler}</p><p><a href="https://www.bag.example/x">Link</a></p>`;

  it("misst Anzahl und Dichte des woertlichen Keywords", async () => {
    const { keywordStats, seoChecks } = await import("./seo.js");
    const stats = keywordStats("Die Haushaltsausnahme der DSGVO gilt. Die Haushaltsausnahme der DSGVO ist eng. Sonst nichts hier.", "Haushaltsausnahme der DSGVO");
    expect(stats).toMatchObject({ count: 2, words: 14 });
    expect(stats.density).toBeCloseTo(14.3, 0);
    const thin = seoChecks({ title: "Haushaltsausnahme der DSGVO: Urteil", slug: "haushaltsausnahme-dsgvo", metaDescription: "x".repeat(100), focusKeyword: "Haushaltsausnahme der DSGVO", contentHtml: base });
    const check = thin.find((c) => c.id === "kw-count")!;
    expect(check.ok).toBe(false);
    expect(check.detail).toContain("%");
  });

  it("bessert zu duenne Keyword-Dichte per KI nach, aber nur bei unveraenderten Links und Ueberschriften", async () => {
    const { ensureKeywordDensity } = await import("../pipeline.js");
    const { keywordStats } = await import("./seo.js");
    const { stripHtml } = await import("./extract.js");
    const kw = "Haushaltsausnahme der DSGVO";
    const calls: string[] = [];
    let n = 0;
    const better = base.replace(filler, filler.replace(/besondere Thema/g, (m) => (n++ < 8 ? `${m} der Haushaltsausnahme der DSGVO` : m)));
    const ai = { refine: async (i: { instruction: string }) => { calls.push(i.instruction); return { contentHtml: better, note: "" }; } };
    const done = await ensureKeywordDensity(ai as never, { site, title: "T", focusKeyword: kw, contentHtml: base });
    expect(done.changed).toBe(true);
    expect(calls[0]).toContain(`„${kw}“`);
    expect(keywordStats(stripHtml(done.contentHtml), kw).density).toBeGreaterThan(keywordStats(stripHtml(base), kw).density);

    // Link veraendert -> verworfen
    const evil = better.replace("https://www.bag.example/x", "https://anders.example/");
    const rejected = await ensureKeywordDensity({ refine: async () => ({ contentHtml: evil, note: "" }) } as never, { site, title: "T", focusKeyword: kw, contentHtml: base });
    expect(rejected).toEqual({ contentHtml: base, changed: false });
    // Fehler der KI -> Original
    const failed = await ensureKeywordDensity({ refine: async () => { throw new Error("down"); } } as never, { site, title: "T", focusKeyword: kw, contentHtml: base });
    expect(failed.changed).toBe(false);
    // bereits ausreichend oder zu kurz -> keine KI-Anfrage
    const never = { refine: async () => { throw new Error("darf nicht aufgerufen werden"); } };
    const dense = `<p>${("Haushaltsausnahme der DSGVO ist wichtig und klar. " + "Wort ".repeat(50)).repeat(8)}</p>`;
    expect((await ensureKeywordDensity(never as never, { site, title: "T", focusKeyword: kw, contentHtml: dense })).changed).toBe(false);
    expect((await ensureKeywordDensity(never as never, { site, title: "T", focusKeyword: kw, contentHtml: "<p>kurz</p>" })).changed).toBe(false);
  });
});

describe("autoLinkNorms", () => {
  const link = (n: string, path: string) => `<a href="https://dsgvo-online.net/${path}/">${n}</a>`;

  it("verlinkt DSGVO- und BDSG-Normen auf dsgvo-online.net, je Norm nur die erste Fundstelle", () => {
    const html = "<p>Nach Art. 6 Abs. 1 lit. f DSGVO ist das zulässig; vgl. nochmals Art. 6 DSGVO. Für Beschäftigte gilt § 26 Abs. 1 BDSG, außerdem Artikel 88 DS-GVO.</p>";
    const out = autoLinkNorms(html);
    expect(out).toContain(link("Art. 6 Abs. 1 lit. f DSGVO", "dsgvo/art-6-dsgvo"));
    expect(out).toContain("nochmals Art. 6 DSGVO.");
    expect(out).toContain(link("§ 26 Abs. 1 BDSG", "bdsg/26-bdsg"));
    expect(out).toContain(link("Artikel 88 DS-GVO", "dsgvo/art-88-dsgvo"));
    expect(out.match(/<a /g)).toHaveLength(3);
  });

  it("lässt Überschriften, bestehende Links und andere Gesetze unberührt", () => {
    const html = '<h2>Art. 6 DSGVO im Überblick</h2><p>Siehe <a href="https://example.org/x">Art. 15 DSGVO bei uns</a> und Art. 5 GG sowie § 823 BGB.</p>';
    expect(autoLinkNorms(html)).toBe(html);
  });

  it("stellt einen vorhandenen Link, der nur aus der Norm besteht, auf dsgvo-online.net um", () => {
    const html = '<p>Maßgeblich ist <a href="https://eur-lex.europa.eu/eli/reg/2016/679/oj">Art. 17 DSGVO</a> und <a href="https://www.gesetze-im-internet.de/bdsg_2018/__38.html">§ 38 BDSG</a>.</p>';
    const out = autoLinkNorms(html);
    expect(out).toContain('<a href="https://dsgvo-online.net/dsgvo/art-17-dsgvo/">Art. 17 DSGVO</a>');
    expect(out).toContain('<a href="https://dsgvo-online.net/bdsg/38-bdsg/">§ 38 BDSG</a>');
    expect(out).not.toContain("eur-lex");
  });

  it("ist idempotent, und die Linkregeln lassen Normlinks stehen", () => {
    const once = autoLinkNorms("<p>Art. 6 DSGVO und § 26 BDSG.</p>");
    expect(autoLinkNorms(once)).toBe(once);
    const kept = applyLinkPolicy(once, "https://kirmse.eu", []);
    expect(kept.match(/<a /g)).toHaveLength(2);
  });
});
