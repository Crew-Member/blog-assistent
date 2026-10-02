import type { Config } from "../config.js";
import { FakeImageProvider } from "./fake.js";
import { OpenAiImageProvider, type ImageProvider } from "./provider.js";

export function createImageProvider(config: Config): ImageProvider | undefined {
  if (config.IMAGE_PROVIDER === "none") return undefined;
  if (config.IMAGE_PROVIDER === "fake") return new FakeImageProvider();
  return new OpenAiImageProvider({
    apiKey: config.IMAGE_API_KEY ?? "",
    model: config.IMAGE_MODEL,
    quality: config.IMAGE_QUALITY,
    baseUrl: config.IMAGE_BASE_URL,
  });
}
