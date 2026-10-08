import type { Config } from "../config.js";
import { ClaudeAiService } from "./claude.js";
import { FakeAiService } from "./fake.js";
import type { AiService } from "./types.js";

export function createAiService(config: Config): AiService {
  if (config.AI_PROVIDER === "fake") return new FakeAiService();
  return new ClaudeAiService({
    apiKey: config.ANTHROPIC_API_KEY ?? "",
    workspaceId: config.ANTHROPIC_WORKSPACE_ID || undefined,
    baseUrl: config.AI_BASE_URL,
    model: config.AI_MODEL,
    effort: config.AI_EFFORT,
    maxSearches: config.RESEARCH_MAX_SEARCHES,
    lightModel: config.AI_MODEL_LIGHT,
    researchModel: config.AI_MODEL_RESEARCH,
    lightEffort: config.AI_EFFORT_LIGHT,
  });
}
