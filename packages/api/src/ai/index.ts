import type { Config } from "../config.js";
import { ClaudeAiService } from "./claude.js";
import { FakeAiService } from "./fake.js";
import type { AiService } from "./types.js";

export function createAiService(config: Config): AiService {
  if (config.AI_PROVIDER === "fake") return new FakeAiService();
  return new ClaudeAiService({
    apiKey: config.ANTHROPIC_API_KEY ?? "",
    model: config.AI_MODEL,
    effort: config.AI_EFFORT,
    maxSearches: config.RESEARCH_MAX_SEARCHES,
  });
}
