import msgreaderModule from "@kenjiuno/msgreader";
import type { FieldsData } from "@kenjiuno/msgreader";
import { simpleParser } from "mailparser";
import mammoth from "mammoth";

export type DocumentKind = "pdf" | "image" | "text";

export interface MailAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface ExtractedDocument {
  kind: DocumentKind;
  mimeType: string;
  /** Nur bei kind === "text" gesetzt. */
  text?: string;
  /** Verwertbare Anhaenge einer Mail (PDF, Word, Text) - werden als eigene Unterlagen behandelt. */
  attachments?: MailAttachment[];
}

// Das Paket ist CommonJS: In Node-ESM haengt die Klasse an `.default` des Modulobjekts, mit Bundlern/tsx kann sie direkt der Default sein.
interface MsgReaderInstance {
  getFileData(): FieldsData;
  getAttachment(attach: number | FieldsData): { fileName: string; content: Uint8Array };
}
type MsgReaderCtor = new (data: ArrayBuffer) => MsgReaderInstance;
const MsgReaderClass = ((msgreaderModule as unknown as { default?: MsgReaderCtor }).default ?? msgreaderModule) as unknown as MsgReaderCtor;

const MAX_MAIL_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

/** Erkennt den Dokumenttyp (Endung hat Vorrang, weil Browser fuer .eml/.msg oft keinen MIME-Typ liefern). */
export function detectKind(filename: string, mimeType: string): { kind: DocumentKind | "email" | "msg" | "docx" | "unsupported"; mimeType: string } {
  const ext = extensionOf(filename);
  if (ext === "pdf" || mimeType === "application/pdf") return { kind: "pdf", mimeType: "application/pdf" };
  if (ext === "eml" || mimeType === "message/rfc822") return { kind: "email", mimeType: "message/rfc822" };
  if (ext === "msg" || mimeType === "application/vnd.ms-outlook") return { kind: "msg", mimeType: "application/vnd.ms-outlook" };
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

/** Nur Dokumente uebernehmen, die inhaltlich relevant sind (Urteile, Schreiben) - keine Logos, Signaturbilder oder verschachtelte Mails. */
function pickAttachments(candidates: MailAttachment[]): MailAttachment[] {
  return candidates
    .filter((a) => a.data.length > 0 && a.data.length <= MAX_ATTACHMENT_BYTES)
    .map((a) => ({ ...a, mimeType: detectKind(a.filename, a.mimeType) }))
    .filter((a) => ["pdf", "docx", "text"].includes(a.mimeType.kind) && !/\.(html?|ics)$/i.test(a.filename))
    .slice(0, MAX_MAIL_ATTACHMENTS)
    .map((a) => ({ filename: a.filename, mimeType: a.mimeType.mimeType, data: a.data }));
}

function mailText(header: string[], body: string, attachmentNames: string[], taken: MailAttachment[]): string {
  const parts = [header.join("\n"), body];
  if (attachmentNames.length) {
    const takenNames = new Set(taken.map((a) => a.filename));
    const note = attachmentNames.map((n) => (takenNames.has(n) ? `${n} (als eigene Unterlage beigefuegt)` : `${n} (nicht uebernommen)`));
    parts.push(`Anhaenge der Mail: ${note.join("; ")}`);
  }
  return parts.filter(Boolean).join("\n\n");
}

function isoDate(value: string | undefined): string | undefined {
  const d = value ? new Date(value) : undefined;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : undefined;
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
      const all = (mail.attachments ?? []).filter((a) => a.filename && a.contentDisposition !== "inline");
      const attachments = pickAttachments(all.map((a) => ({ filename: a.filename!, mimeType: a.contentType, data: a.content })));
      return { kind: "text", mimeType: detected.mimeType, text: mailText(header, body, all.map((a) => a.filename!), attachments), attachments };
    }
    case "msg": {
      let info: FieldsData;
      let reader: MsgReaderInstance;
      try {
        reader = new MsgReaderClass(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
        info = reader.getFileData();
      } catch {
        throw new Error("Die .msg-Datei konnte nicht gelesen werden (beschädigt oder kein Outlook-Element)");
      }
      if (info.error) throw new Error(`Die .msg-Datei konnte nicht gelesen werden: ${info.error}`);
      const sender = [info.senderName, info.senderEmail && `<${info.senderEmail}>`].filter(Boolean).join(" ");
      const date = isoDate(info.messageDeliveryTime ?? info.clientSubmitTime ?? info.creationTime);
      const header = [info.subject ? `Betreff: ${info.subject}` : "", sender ? `Von: ${sender}` : "", date ? `Datum: ${date}` : ""].filter(Boolean);
      const html = info.bodyHtml ?? (info.html ? Buffer.from(info.html).toString("utf8") : "");
      const body = info.body?.trim() || (html ? stripHtml(html) : "");
      const visible = (info.attachments ?? []).filter((a) => !a.attachmentHidden && !a.innerMsgContent && a.fileName);
      const candidates: MailAttachment[] = [];
      for (const att of visible) {
        try {
          const content = reader.getAttachment(att).content;
          candidates.push({ filename: att.fileName!, mimeType: "", data: Buffer.from(content) });
        } catch {
          // einzelner defekter Anhang: ueberspringen, der Rest der Mail bleibt nutzbar
        }
      }
      const attachments = pickAttachments(candidates);
      return { kind: "text", mimeType: detected.mimeType, text: mailText(header, body, visible.map((a) => a.fileName!), attachments), attachments };
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
