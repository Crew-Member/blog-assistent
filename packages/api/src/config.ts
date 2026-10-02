import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  ADMIN_PASSWORD: z.string().min(8, "ADMIN_PASSWORD muss mindestens 8 Zeichen haben"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET muss mindestens 32 Zeichen haben"),
  AI_PROVIDER: z.enum(["claude", "fake"]).default("claude"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("medium"),
  RESEARCH_MAX_SEARCHES: z.coerce.number().int().min(1).max(30).default(8),
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
  return config;
}
