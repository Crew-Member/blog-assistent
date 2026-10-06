import { escapeHtml } from "./html.js";

export const DEFAULT_IMAGE_NOTICE = "Beitragsbild: KI-generiert.";

/** Sichtbarer Hinweis im Beitrag, wenn das Beitragsbild KI-generiert ist (Standardwortlaut oder der eingestellte Text). */
export function imageNoticeHtml(site: { aiNoticeText: string }): string {
  return `<p><em>${escapeHtml(site.aiNoticeText.trim() || DEFAULT_IMAGE_NOTICE)}</em></p>`;
}

/** Entfernt einen frueher gespeicherten allgemeinen "KI-Hinweis" am Textanfang (nur kurz in einer Zwischenversion im Einsatz). */
export function stripLegacyNotice(html: string): string {
  return html.replace(/^\s*<p><strong>KI-Hinweis:<\/strong>[\s\S]*?<\/p>\s*/, "");
}

/** Setzt den Bildhinweis vorn in den Beitrag (nur fuer den Versand an WordPress; gespeichert wird der Text ohne Hinweis). */
export function withImageNotice(html: string, notice: string): string {
  const clean = stripLegacyNotice(html);
  return notice ? `${notice}\n${clean}` : clean;
}
