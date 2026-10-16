import sharp from "sharp";
import { markAsAiGenerated, sniffImageType } from "./png.js";

/** Maximale Breite fuer Beitragsbilder im Web (Retina-tauglich fuer typische Inhaltsbreiten). */
export const WEB_IMAGE_MAX_WIDTH = 1600;

export interface WebImage {
  data: Buffer;
  mimeType: string;
  ext: string;
  /** true, wenn das Bild verkleinert oder neu kodiert wurde */
  optimized: boolean;
}

const extOf = (mime: string) => (mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png");

/**
 * Bereitet ein Beitragsbild fuer WordPress auf: auf hoechstens 1600 Pixel Breite verkleinern und als JPEG (Qualitaet 82, progressiv) speichern.
 * Das spart meist 80 bis 95 % der Dateigroesse und verbessert die Ladezeit. Der KI-Vermerk (XMP) wird neu eingetragen.
 * Faellt die Umwandlung aus oder wird die Datei dadurch nicht kleiner (und war nicht zu breit), bleibt das Original.
 */
export async function optimizeForWeb(data: Buffer, mimeType: string, aiGenerated: boolean): Promise<WebImage> {
  const original: WebImage = { data, mimeType, ext: extOf(mimeType), optimized: false };
  try {
    if (!sniffImageType(data)) return original;
    const image = sharp(data, { failOn: "none" }).rotate();
    const meta = await image.metadata();
    const tooWide = (meta.width ?? 0) > WEB_IMAGE_MAX_WIDTH;
    const jpeg = await image
      .resize({ width: WEB_IMAGE_MAX_WIDTH, withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82, progressive: true, mozjpeg: true })
      .toBuffer();
    if (!tooWide && jpeg.length >= data.length) return original;
    return { data: aiGenerated ? markAsAiGenerated(jpeg, "KI-generiert") : jpeg, mimeType: "image/jpeg", ext: "jpg", optimized: true };
  } catch {
    return original;
  }
}
