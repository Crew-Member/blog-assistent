export interface GeneratedImage {
  data: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
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

export interface SupermachineOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  width: number;
  height: number;
  fetch?: typeof fetch;
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

function extractMessage(body: unknown, fallback: string): string {
  const b = body as { error?: unknown; message?: unknown } | undefined;
  if (typeof b?.error === "string") return b.error;
  if (typeof (b?.error as { message?: unknown } | undefined)?.message === "string") return (b!.error as { message: string }).message;
  if (typeof b?.message === "string") return b.message;
  return fallback;
}

export function explainSupermachineError(status: number | undefined, raw: string): string {
  const details = raw.length > 300 ? `${raw.slice(0, 300)} …` : raw;
  const hint = (() => {
    if (status === 401 || status === 403) return "Der Supermachine-Schlüssel wird nicht akzeptiert (IMAGE_API_KEY prüfen; er beginnt mit sk-).";
    if (status === 402 || /credit|gem|insufficient|balance/i.test(raw)) return "Die Credits bei Supermachine sind aufgebraucht oder reichen für dieses Modell nicht.";
    if (status === 429) return "Das Anfragelimit bei Supermachine ist erreicht. Später erneut versuchen.";
    if (/model/i.test(raw) && (status === 400 || status === 404)) return "Das eingestellte Modell (IMAGE_MODEL) kennt Supermachine nicht - Schreibweise wie in der Supermachine-Modellliste verwenden.";
    return undefined;
  })();
  return hint ? `${hint} (Details: ${details})` : details;
}

/**
 * Bildgenerierung ueber die Supermachine-API (https://dev.supermachine.art/v1): Auftrag per POST /generate,
 * danach per GET /images?batchId=... nachfragen, bis das Bild fertig ist, und es von der gelieferten Adresse laden.
 * Ohne Negativ-Prompt, weil die Dokumentation keinen nennt - die Motivregeln stehen im vom Sprachmodell geschriebenen Prompt.
 */
export class SupermachineImageProvider implements ImageProvider {
  readonly name = "supermachine";

  constructor(private readonly options: SupermachineOptions) {}

  private async call(path: string, init: { method: string; body?: unknown }): Promise<{ status: number; body: unknown; text: string }> {
    const fetchFn = this.options.fetch ?? fetch;
    let res: Response;
    try {
      res = await fetchFn(`${this.options.baseUrl.replace(/\/+$/, "")}${path}`, {
        method: init.method,
        signal: AbortSignal.timeout(60_000),
        headers: { authorization: `Bearer ${this.options.apiKey}`, ...(init.body !== undefined ? { "content-type": "application/json" } : {}) },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      throw new Error(`Keine Verbindung zu Supermachine: ${error instanceof Error ? error.message : String(error)}`);
    }
    const text = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }
    if (!res.ok) throw new Error(explainSupermachineError(res.status, extractMessage(body, text || `HTTP ${res.status}`)));
    return { status: res.status, body, text };
  }

  async generate({ prompt }: { prompt: string }): Promise<GeneratedImage> {
    const started = (await this.call("/generate", {
      method: "POST",
      body: { model: this.options.model, prompt: prompt.trim(), width: this.options.width, height: this.options.height },
    })).body as { batchId?: number | string } | undefined;
    if (started?.batchId === undefined || started.batchId === null) throw new Error("Supermachine hat keinen Auftrag angenommen (keine batchId in der Antwort).");

    const interval = this.options.pollIntervalMs ?? 2500;
    const deadline = Date.now() + (this.options.maxWaitMs ?? 240_000);
    for (;;) {
      const result = (await this.call(`/images?batchId=${encodeURIComponent(String(started.batchId))}`, { method: "GET" })).body as
        | { items?: { url?: string; status?: string; error?: string }[] }
        | undefined;
      const item = result?.items?.[0];
      const status = (item?.status ?? "").toLowerCase();
      if (status === "completed") {
        if (!item?.url) throw new Error("Supermachine meldet das Bild als fertig, liefert aber keine Adresse.");
        return this.download(item.url);
      }
      if (/fail|error|cancel|reject|block|nsfw/.test(status)) {
        throw new Error(`Supermachine konnte das Bild nicht erzeugen (Status „${item?.status}“${item?.error ? `: ${item.error}` : ""}). Prompt ändern und erneut versuchen.`);
      }
      if (Date.now() >= deadline) throw new Error("Supermachine hat das Bild nicht rechtzeitig fertiggestellt. Bitte später erneut versuchen.");
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  private async download(url: string): Promise<GeneratedImage> {
    const { assertPublicHttpUrl } = await import("../lib/netguard.js");
    const { sniffImageType } = await import("../lib/png.js");
    const parsed = await assertPublicHttpUrl(url).catch((e: Error) => {
      throw new Error(`Die Bildadresse von Supermachine wird nicht abgerufen: ${e.message}`);
    });
    if (parsed.protocol !== "https:") throw new Error("Die Bildadresse von Supermachine ist nicht https.");
    const fetchFn = this.options.fetch ?? fetch;
    let res: Response;
    try {
      res = await fetchFn(parsed.toString(), { signal: AbortSignal.timeout(60_000), redirect: "follow" });
    } catch (error) {
      throw new Error(`Das fertige Bild konnte nicht geladen werden: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) throw new Error(`Das fertige Bild konnte nicht geladen werden (HTTP ${res.status}).`);
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > 20 * 1024 * 1024) throw new Error("Das gelieferte Bild ist zu groß.");
    const mimeType = sniffImageType(data);
    if (!mimeType) throw new Error("Supermachine hat keine gültige Bilddatei geliefert (PNG, JPEG oder WebP erwartet).");
    return { data, mimeType };
  }
}
