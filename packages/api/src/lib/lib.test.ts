import { describe, expect, it } from "vitest";
import { detectKind, extractDocument } from "./extract.js";
import { sanitizePostHtml } from "./html.js";
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
