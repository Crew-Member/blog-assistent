import { describe, expect, it } from "vitest";
import { detectKind, extractDocument } from "./extract.js";
import { buildMsg } from "./msgfixture.testutil.js";

describe(".msg-Dateien", () => {
  it("wird anhand der Endung erkannt", () => {
    expect(detectKind("Newsletter.msg", "application/octet-stream").kind).toBe("msg");
  });

  it("liest Betreff, Absender und Text", async () => {
    const msg = buildMsg({ subject: "BGH: Intransparenz von AGB", body: "Der BGH hat entschieden.", sender: "infolaw" });
    const doc = await extractDocument("mail.msg", "application/octet-stream", msg);
    expect(doc.kind).toBe("text");
    expect(doc.text).toContain("Betreff: BGH: Intransparenz von AGB");
    expect(doc.text).toContain("Von: infolaw");
    expect(doc.text).toContain("Der BGH hat entschieden.");
  });

  it("uebernimmt PDF-Anhaenge als eigene Unterlagen und verwirft Logos", async () => {
    const pdf = Buffer.from("%PDF-1.4 urteil");
    const msg = buildMsg({
      subject: "Urteil",
      body: "siehe Anhang",
      attachments: [
        { name: "Urteil.pdf", data: pdf },
        { name: "logo.png", data: Buffer.from("PNG") },
      ],
    });
    const doc = await extractDocument("mail.msg", "", msg);
    expect(doc.attachments?.map((a) => a.filename)).toEqual(["Urteil.pdf"]);
    expect(doc.attachments?.[0]?.mimeType).toBe("application/pdf");
    expect(doc.attachments?.[0]?.data.equals(pdf)).toBe(true);
    expect(doc.text).toContain("Urteil.pdf (als eigene Unterlage beigefuegt)");
    expect(doc.text).toContain("logo.png (nicht uebernommen)");
  });

  it("meldet beschaedigte Dateien verstaendlich", async () => {
    await expect(extractDocument("kaputt.msg", "", Buffer.from("das ist keine msg-datei"))).rejects.toThrow(/\.msg-Datei/);
  });
});

describe(".eml mit Anhaengen", () => {
  it("uebernimmt PDF-Anhaenge", async () => {
    const eml = [
      "From: a@b.de",
      "Subject: Mit Anhang",
      "MIME-Version: 1.0",
      'Content-Type: multipart/mixed; boundary="X"',
      "",
      "--X",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Text der Mail",
      "--X",
      'Content-Type: application/pdf; name="urteil.pdf"',
      'Content-Disposition: attachment; filename="urteil.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from("%PDF-1.4 x").toString("base64"),
      "--X--",
      "",
    ].join("\r\n");
    const doc = await extractDocument("m.eml", "message/rfc822", Buffer.from(eml));
    expect(doc.text).toContain("Text der Mail");
    expect(doc.attachments?.map((a) => a.filename)).toEqual(["urteil.pdf"]);
  });
});
