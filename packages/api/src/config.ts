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
  IMAGE_PROVIDER: z.enum(["none", "openai", "fake"]).default("none"),
  IMAGE_API_KEY: cleaned,
  IMAGE_MODEL: z.string().default("gpt-image-1"),
  IMAGE_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
  IMAGE_BASE_URL: z.string().url().default("https://api.openai.com"),
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
  if (config.IMAGE_PROVIDER === "openai" && !config.IMAGE_API_KEY) {
    throw new Error("IMAGE_API_KEY fehlt (OpenAI-Schlüssel für die Bildgenerierung) - oder IMAGE_PROVIDER=none setzen");
  }
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
