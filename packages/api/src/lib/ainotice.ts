import { stripHtml } from "./extract.js";
import { escapeHtml } from "./html.js";

export const DEFAULT_AI_NOTICE = "Dieser Beitrag wurde mit Unterstützung von KI erstellt und redaktionell geprüft.";
const LABEL = "KI-Hinweis:";

export interface AiNoticeSettings {
  aiNoticeEnabled: boolean;
  aiNoticeText: string;
}

/** Sichtbarer Hinweis am Anfang des Beitrags; leer, wenn die Website ihn abgeschaltet hat. */
export function aiNoticeHtml(site: AiNoticeSettings): string {
  if (!site.aiNoticeEnabled) return "";
  const text = site.aiNoticeText.trim() || DEFAULT_AI_NOTICE;
  return `<p><strong>${LABEL}</strong> <em>${escapeHtml(text)}</em></p>`;
}

/** Steht der KI-Hinweis (in der Standardform oder mit dem eingestellten Wortlaut) schon im Text? */
export function hasAiNotice(html: string, site: AiNoticeSettings): boolean {
  const plain = stripHtml(html).replace(/\s+/g, " ");
  const text = (site.aiNoticeText.trim() || DEFAULT_AI_NOTICE).replace(/\s+/g, " ");
  return plain.includes(text) || html.includes(`<strong>${LABEL}</strong>`);
}

/** Stellt sicher, dass der Hinweis im Text steht (vorn); gibt den Text und ob etwas ergaenzt wurde zurueck. */
export function ensureAiNotice(html: string, site: AiNoticeSettings): { html: string; added: boolean } {
  if (!site.aiNoticeEnabled || hasAiNotice(html, site)) return { html, added: false };
  return { html: `${aiNoticeHtml(site)}\n${html}`, added: true };
}
