/** Uebersetzt technische API-Fehler in verstaendliche Hinweise (mit den Originaldetails am Ende). */
export function explainAiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number } | null)?.status;
  const details = raw.length > 400 ? `${raw.slice(0, 400)} …` : raw;
  const hint = (() => {
    if (/not scoped to a workspace/i.test(raw)) {
      return "Der API-Key gehört keinem Workspace. In der .env ANTHROPIC_WORKSPACE_ID eintragen (ID des Workspaces aus der Anthropic Console) oder in der Console einen Key innerhalb eines Workspaces erstellen.";
    }
    if (status === 401 || /invalid x-api-key|authentication/i.test(raw)) {
      return "Der API-Key wird nicht akzeptiert. ANTHROPIC_API_KEY in der .env prüfen (vollständig kopiert, keine Leerzeichen) und die Anwendung neu starten.";
    }
    if (/credit balance is too low/i.test(raw)) {
      return "Das Guthaben bei Anthropic ist aufgebraucht. In der Anthropic Console unter Billing Guthaben aufladen.";
    }
    if (status === 403 || /permission/i.test(raw)) {
      return "Der API-Key hat für diese Anfrage keine Berechtigung (z. B. Modell oder Websuche nicht freigeschaltet). In der Anthropic Console Einstellungen und Limits prüfen.";
    }
    if (status === 404 && /model/i.test(raw)) {
      return "Das eingestellte Modell (AI_MODEL) ist für diesen Key nicht verfügbar.";
    }
    if (status === 429) return "Das Anfragelimit bei Anthropic ist erreicht. Später erneut versuchen.";
    if (status === 529 || /overloaded/i.test(raw)) return "Die KI ist gerade überlastet. Bitte in ein paar Minuten erneut versuchen.";
    return undefined;
  })();
  return hint ? `${hint} (Details: ${details})` : details;
}
