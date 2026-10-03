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
