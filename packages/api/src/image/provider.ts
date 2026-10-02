export interface GeneratedImage {
  data: Buffer;
  mimeType: "image/png";
}

export interface ImageProvider {
  readonly name: string;
  generate(input: { prompt: string }): Promise<GeneratedImage>;
}

/** Wird an jeden Bild-Prompt angehaengt - unabhaengig davon, was das Sprachmodell geschrieben hat. */
export const PROMPT_GUARDRAILS =
  "No text, no letters, no numbers, no logos, no brand names, no watermarks, no signatures. No recognizable real people or faces.";

export function withGuardrails(prompt: string): string {
  return `${prompt.trim()}\n\n${PROMPT_GUARDRAILS}`;
}

/** Uebersetzt Fehler der Bild-API in verstaendliche Hinweise. */
export function explainImageError(status: number | undefined, raw: string): string {
  const details = raw.length > 300 ? `${raw.slice(0, 300)} …` : raw;
  const hint = (() => {
    if (/must be verified|organization.*verif/i.test(raw)) return "Für dieses Bildmodell muss die Organisation bei OpenAI verifiziert sein (Einstellungen → Organization → Verification).";
    if (/billing|insufficient_quota|credit/i.test(raw)) return "Das Guthaben beim Bildanbieter ist aufgebraucht oder es ist keine Zahlungsmethode hinterlegt.";
    if (status === 401) return "Der Schlüssel des Bildanbieters wird nicht akzeptiert (IMAGE_API_KEY bzw. OPENAI_API_KEY prüfen).";
    if (/content_policy|safety|moderation/i.test(raw)) return "Die Sicherheitsfilter des Bildanbieters haben den Prompt abgelehnt. Prompt umformulieren (ohne Personen, Gewalt oder Marken).";
    if (status === 404 && /model/i.test(raw)) return "Das eingestellte Bildmodell (IMAGE_MODEL) ist für diesen Schlüssel nicht verfügbar.";
    if (status === 429) return "Das Anfragelimit des Bildanbieters ist erreicht. Später erneut versuchen.";
    return undefined;
  })();
  return hint ? `${hint} (Details: ${details})` : details;
}

export interface OpenAiImageOptions {
  apiKey: string;
  model: string;
  quality: "low" | "medium" | "high";
  baseUrl: string;
  fetch?: typeof fetch;
}

/** Bildgenerierung ueber die OpenAI-Images-API (Antwort als Base64-PNG). */
export class OpenAiImageProvider implements ImageProvider {
  readonly name = "openai";

  constructor(private readonly options: OpenAiImageOptions) {}

  async generate({ prompt }: { prompt: string }): Promise<GeneratedImage> {
    const fetchFn = this.options.fetch ?? fetch;
    let res: Response;
    try {
      res = await fetchFn(`${this.options.baseUrl.replace(/\/+$/, "")}/v1/images/generations`, {
        method: "POST",
        signal: AbortSignal.timeout(240_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({
          model: this.options.model,
          prompt: withGuardrails(prompt),
          size: "1536x1024",
          quality: this.options.quality,
          n: 1,
          output_format: "png",
        }),
      });
    } catch (error) {
      throw new Error(`Keine Verbindung zum Bildanbieter: ${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await res.text();
    let body: { data?: { b64_json?: string }[]; error?: { message?: string; code?: string } } = {};
    try {
      body = JSON.parse(text);
    } catch {
      // Antwort ohne JSON: unten behandelt
    }
    if (!res.ok) throw new Error(explainImageError(res.status, body.error?.message ?? body.error?.code ?? text));
    const b64 = body.data?.[0]?.b64_json;
    if (!b64) throw new Error("Der Bildanbieter hat kein Bild geliefert.");
    return { data: Buffer.from(b64, "base64"), mimeType: "image/png" };
  }
}
