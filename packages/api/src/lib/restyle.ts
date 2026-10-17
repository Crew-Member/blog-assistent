import sharp from "sharp";

/** Maximale Kantenlaenge des hochgeladenen Fotos vor der Bearbeitung (spart Zeit und Kosten beim Bildanbieter). */
export const RESTYLE_MAX_EDGE = 2048;

/** Fotos fuer die Bildbearbeitung vorbereiten: drehen (EXIF), auf hoechstens 2048 Pixel verkleinern, als JPEG. */
export async function prepareForRestyle(data: Buffer): Promise<{ data: Buffer; mimeType: "image/jpeg" }> {
  const jpeg = await sharp(data, { failOn: "none" })
    .rotate()
    .resize({ width: RESTYLE_MAX_EDGE, height: RESTYLE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { data: jpeg, mimeType: "image/jpeg" };
}

/** Anweisung an die Bildbearbeitung: Motiv bleibt, der Bildstil der Website bestimmt den Look. */
export function restylePrompt(styleGuide: string, instruction: string): string {
  return [
    "Gestalte dieses Foto im folgenden Bildstil um. Behalte Motiv, Bildaufbau, Perspektive, Gegenstaende und Proportionen bei; veraendere vor allem Licht, Farben, Texturen und Gesamtanmutung. Fuege keine neuen Personen, Schrift, Logos oder Markenzeichen hinzu und veraendere keine Gesichter.",
    `Bildstil:\n${styleGuide.trim().slice(0, 3000)}`,
    instruction.trim() ? `Zusaetzlicher Wunsch fuer dieses Bild:\n${instruction.trim().slice(0, 600)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
