import type { Config } from "../config.js";
import { FakeImageProvider } from "./fake.js";
import { OpenAiImageProvider, SupermachineImageProvider, type ImageProvider } from "./provider.js";

/** Standardwerte je Anbieter; Einstellungen aus der .env haben Vorrang. */
export function resolveImageSettings(config: Config) {
  const supermachine = config.IMAGE_PROVIDER === "supermachine";
  return {
    model: config.IMAGE_MODEL ?? (supermachine ? "Supermachine NextGen" : "gpt-image-1"),
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
  return new OpenAiImageProvider({ apiKey: config.IMAGE_API_KEY ?? "", model: settings.model, quality: config.IMAGE_QUALITY, baseUrl: settings.baseUrl });
}
