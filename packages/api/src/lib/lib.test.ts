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
