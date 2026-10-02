import { makePlaceholderPng } from "../lib/png.js";
import type { GeneratedImage, ImageProvider } from "./provider.js";

/** Liefert ein Platzhalter-Bild ohne Netzwerk - fuer Tests und zum Ausprobieren der Oberflaeche. */
export class FakeImageProvider implements ImageProvider {
  readonly name = "fake";
  readonly prompts: string[] = [];

  async generate({ prompt }: { prompt: string }): Promise<GeneratedImage> {
    this.prompts.push(prompt);
    return { data: makePlaceholderPng(), mimeType: "image/png" };
  }
}
