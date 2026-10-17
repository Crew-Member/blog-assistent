import { makePlaceholderPng } from "../lib/png.js";
import type { GeneratedImage, ImageProvider } from "./provider.js";

/** Liefert ein Platzhalter-Bild ohne Netzwerk - fuer Tests und zum Ausprobieren der Oberflaeche. */
export class FakeImageProvider implements ImageProvider {
  readonly name = "fake";
  readonly prompts: string[] = [];
  readonly edits: { bytes: number; prompt: string }[] = [];

  async generate({ prompt }: { prompt: string }): Promise<GeneratedImage> {
    this.prompts.push(prompt);
    return { data: makePlaceholderPng(), mimeType: "image/png" };
  }

  async edit({ image, prompt }: { image: Buffer; mimeType: string; prompt: string }): Promise<GeneratedImage> {
    this.edits.push({ bytes: image.length, prompt });
    return { data: makePlaceholderPng(800, 533), mimeType: "image/png" };
  }
}
