import { z } from "zod";

/** Entfernt Leerraum und versehentliche Anfuehrungszeichen; leer wird zu undefined. */
const cleaned = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim().replace(/^["']+|["']+$/g, "").trim() || undefined);

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD muss mindestens 8 Zeichen haben"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET muss mindestens 32 Zeichen haben"),
  AI_PROVIDER: z.enum(["claude", "fake"]).default("claude"),
  ANTHROPIC_API_KEY: cleaned,
  // Nur noetig, wenn der Key keinem Workspace zugeordnet ist (Header anthropic-workspace-id)
  ANTHROPIC_WORKSPACE_ID: cleaned,
  // Bewusst eigener Name: Eine zufaellig gesetzte Windows-Variable ANTHROPIC_BASE_URL wuerde sonst alle Anfragen umleiten.
  AI_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  RESEARCH_MAX_SEARCHES: z.coerce.number().int().min(1).max(30).default(8),
  // Bildgenerierung (optional). "none": nur Prompts, Stockfoto-Links und Upload.
  IMAGE_PROVIDER: z.enum(["none", "openai", "supermachine", "fake"]).default("none"),
  IMAGE_API_KEY: cleaned,
  // Ohne Angabe gilt der Standard des jeweiligen Anbieters (openai: gpt-image-1, supermachine: Supermachine NextGen)
  IMAGE_MODEL: cleaned,
  IMAGE_BASE_URL: cleaned,
  // Sprache der Bild-Prompts. Deutsch ist Standard; manche Bildmodelle (z. B. aeltere Stable-Diffusion-Modelle) liefern mit Englisch bessere Ergebnisse.
  IMAGE_PROMPT_LANGUAGE: z.enum(["de", "en"]).default("de"),
  // Preise fuer die Kostenuebersicht (USD). Bitte mit der aktuellen Preisliste des Anbieters abgleichen - die Vorgaben sind Schaetzwerte.
  AI_PRICE_INPUT_PER_MTOK: z.coerce.number().min(0).default(5),
  AI_PRICE_OUTPUT_PER_MTOK: z.coerce.number().min(0).default(25),
  AI_PRICE_SEARCH_PER_1000: z.coerce.number().min(0).default(10),
  // Kosten je erzeugtem Bild (USD), abhaengig vom Bildanbieter/Modell; 0 = nicht mitrechnen
  IMAGE_COST_USD: z.coerce.number().min(0).default(0),
  IMAGE_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
  IMAGE_WIDTH: z.coerce.number().int().min(256).max(2048).optional(),
  IMAGE_HEIGHT: z.coerce.number().int().min(256).max(2048).optional(),
  STORAGE_DIR: z.string().default("./data/uploads"),
  PORT: z.coerce.number().int().default(3100),
  HOST: z.string().default("0.0.0.0"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = schema.parse(env);
  if (config.AI_PROVIDER === "claude" && !config.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY fehlt (oder AI_PROVIDER=fake setzen)");
  }
  if ((config.IMAGE_PROVIDER === "openai" || config.IMAGE_PROVIDER === "supermachine") && !config.IMAGE_API_KEY) {
    throw new Error(`IMAGE_API_KEY fehlt (Schlüssel von ${config.IMAGE_PROVIDER} für die Bildgenerierung) - oder IMAGE_PROVIDER=none setzen`);
  }
  if (config.IMAGE_BASE_URL) new URL(config.IMAGE_BASE_URL); // wirft bei ungueltiger Adresse
  return config;
}

/** Verstaendliche Meldung statt eines rohen Zod-Fehlers. */
export function formatConfigError(error: unknown, envFile?: string): string {
  const where = envFile ? `Gelesen aus: ${envFile}` : "Es wurde keine .env-Datei gefunden (Vorlage: .env.example nach .env kopieren).";
  if (error instanceof z.ZodError) {
    const lines = error.issues.map((i) => `  - ${i.path.join(".") || "?"}: ${i.message}`);
    return `Konfiguration unvollständig oder ungültig:\n${lines.join("\n")}\n${where}`;
  }
  return `${error instanceof Error ? error.message : String(error)}\n${where}`;
}
