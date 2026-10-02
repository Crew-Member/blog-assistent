import { simpleParser } from "mailparser";
import mammoth from "mammoth";

export type DocumentKind = "pdf" | "image" | "text";

export interface ExtractedDocument {
  kind: DocumentKind;
  mimeType: string;
  /** Nur bei kind === "text" gesetzt. */
  text?: string;
}

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/** Erkennt den Dokumenttyp (Endung hat Vorrang, weil Browser fuer .eml/.msg oft keinen MIME-Typ liefern). */
export function detectKind(filename: string, mimeType: string): { kind: DocumentKind | "email" | "docx" | "unsupported"; mimeType: string } {
  const ext = extensionOf(filename);
  if (ext === "pdf" || mimeType === "application/pdf") return { kind: "pdf", mimeType: "application/pdf" };
  if (ext === "eml" || mimeType === "message/rfc822") return { kind: "email", mimeType: "message/rfc822" };
  if (ext === "docx" || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return { kind: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  }
  if (["txt", "md", "markdown", "html", "htm"].includes(ext) || mimeType.startsWith("text/")) {
    return { kind: "text", mimeType: mimeType.startsWith("text/") ? mimeType : "text/plain" };
  }
  if (IMAGE_TYPES.has(mimeType)) return { kind: "image", mimeType };
  const imageByExt: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
  const byExt = imageByExt[ext];
  if (byExt) return { kind: "image", mimeType: byExt };
  return { kind: "unsupported", mimeType };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Liest Mails/Word/Text zu Klartext aus. PDFs und Bilder bleiben unveraendert (Claude liest sie nativ). */
export async function extractDocument(filename: string, mimeType: string, data: Buffer): Promise<ExtractedDocument> {
  const detected = detectKind(filename, mimeType);
  switch (detected.kind) {
    case "pdf":
      return { kind: "pdf", mimeType: detected.mimeType };
    case "image":
      return { kind: "image", mimeType: detected.mimeType };
    case "email": {
      const mail = await simpleParser(data);
      const header = [
        mail.subject ? `Betreff: ${mail.subject}` : "",
        mail.from?.text ? `Von: ${mail.from.text}` : "",
        mail.date ? `Datum: ${mail.date.toISOString().slice(0, 10)}` : "",
      ].filter(Boolean);
      const body = mail.text?.trim() || (typeof mail.html === "string" ? stripHtml(mail.html) : "");
      const attachments = (mail.attachments ?? []).map((a) => a.filename).filter(Boolean);
      const parts = [header.join("\n"), body];
      if (attachments.length) parts.push(`(Anhaenge in der Mail, hier nicht enthalten: ${attachments.join(", ")})`);
      return { kind: "text", mimeType: detected.mimeType, text: parts.filter(Boolean).join("\n\n") };
    }
    case "docx": {
      const { value } = await mammoth.extractRawText({ buffer: data });
      return { kind: "text", mimeType: detected.mimeType, text: value.trim() };
    }
    case "text": {
      const raw = data.toString("utf8");
      const text = /^\s*<(!doctype|html)/i.test(raw) ? stripHtml(raw) : raw;
      return { kind: "text", mimeType: detected.mimeType, text: text.trim() };
    }
    default:
      throw new Error(`Dateityp wird nicht unterstuetzt: ${filename}`);
  }
}
