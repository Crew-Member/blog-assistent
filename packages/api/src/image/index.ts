import type { Config } from "../config.js";
import { FakeImageProvider } from "./fake.js";
import { OPENAI_DEFAULT_MODELS, OPENAI_RETIRED_MODELS, OpenAiImageProvider, SupermachineImageProvider, type ImageProvider } from "./provider.js";

/** Standardwerte je Anbieter; Einstellungen aus der .env haben Vorrang. */
export function resolveImageSettings(config: Config) {
  const supermachine = config.IMAGE_PROVIDER === "supermachine";
  // OpenAI: Eine eigene Angabe gilt; abgeschaltete Modelle (gpt-image-1 ...) werden durch die Nachfolger ersetzt.
  const explicit = config.IMAGE_MODEL && !(!supermachine && OPENAI_RETIRED_MODELS.includes(config.IMAGE_MODEL.toLowerCase())) ? config.IMAGE_MODEL : undefined;
  const openaiModels = explicit ? [explicit] : OPENAI_DEFAULT_MODELS;
  return {
    model: supermachine ? (config.IMAGE_MODEL ?? "Supermachine NextGen") : openaiModels[0]!,
    fallbackModels: supermachine ? [] : openaiModels.slice(1),
    baseUrl: config.IMAGE_BASE_URL ?? (supermachine ? "https://dev.supermachine.art/v1" : "https://api.openai.com"),
    width: config.IMAGE_WIDTH ?? 1024,
    height: config.IMAGE_HEIGHT ?? 768,
  };
}

export function createImageProvider(config: Config): ImageProvider | undefined {
  if (config.IMAGE_PROVIDER === "none") return undefined;
  if (config.IMAGE_PROVIDER === "fake") return new FakeImageProvider();
  const settings = resolveImageSettings(config);
  if (config.IMAGE_PROVIDER === "supermachine") {
    return new SupermachineImageProvider({ apiKey: config.IMAGE_API_KEY ?? "", model: settings.model, baseUrl: settings.baseUrl, width: settings.width, height: settings.height });
  }
  return new OpenAiImageProvider({ apiKey: config.IMAGE_API_KEY ?? "", model: settings.model, fallbackModels: settings.fallbackModels, quality: config.IMAGE_QUALITY, baseUrl: settings.baseUrl });
}
