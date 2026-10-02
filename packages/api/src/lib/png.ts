import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = (CRC_TABLE[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

export function isPng(buf: Buffer): boolean {
  return buf.length > 8 && buf.subarray(0, 8).equals(SIGNATURE);
}

export interface PngChunk {
  type: string;
  data: Buffer;
  crcOk: boolean;
}

/** Zerlegt eine PNG-Datei in ihre Chunks (inkl. CRC-Pruefung) - fuer Tests und Diagnose. */
export function readChunks(png: Buffer): PngChunk[] {
  if (!isPng(png)) throw new Error("Keine PNG-Datei");
  const chunks: PngChunk[] = [];
  let pos = 8;
  while (pos + 12 <= png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString("ascii", pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    const crc = png.readUInt32BE(pos + 8 + length);
    chunks.push({ type, data, crcOk: crc === crc32(Buffer.concat([Buffer.from(type, "ascii"), data])) });
    pos += 12 + length;
  }
  return chunks;
}

const AI_SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

/**
 * Traegt den IPTC-Vermerk "KI-generiert" (DigitalSourceType = trainedAlgorithmicMedia) als XMP in eine PNG-Datei ein.
 * Das ist ein einfacher Metadaten-Vermerk, KEINE kryptografisch signierte Herkunftsangabe (C2PA).
 * Gibt die Datei unveraendert zurueck, wenn sie kein PNG ist.
 */
export function embedAiGeneratedXmp(png: Buffer, creditLine = "KI-generiert"): Buffer {
  if (!isPng(png)) return png;
  const esc = creditLine.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const xmp =
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" ' +
    `Iptc4xmpExt:DigitalSourceType="${AI_SOURCE_TYPE}" photoshop:Credit="${esc}"/>` +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>';
  // iTXt: Schluesselwort \0, Kompression 0, Methode 0, Sprache \0, uebersetztes Schluesselwort \0, Text
  const data = Buffer.concat([Buffer.from("XML:com.adobe.xmp\0\0\0\0\0", "latin1"), Buffer.from(xmp, "utf8")]);
  // direkt hinter IHDR einfuegen (Chunk-Reihenfolge laut PNG-Spezifikation zulaessig)
  const ihdrEnd = 8 + 12 + png.readUInt32BE(8);
  return Buffer.concat([png.subarray(0, ihdrEnd), chunk("iTXt", data), png.subarray(ihdrEnd)]);
}

export function sniffImageType(buf: Buffer): "image/png" | "image/jpeg" | "image/webp" | undefined {
  if (isPng(buf) && buf.length > 12) return "image/png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return undefined;
}

function xmpPacket(creditLine: string): string {
  const esc = creditLine.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return (
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about="" xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/" xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/" ' +
    `Iptc4xmpExt:DigitalSourceType="${AI_SOURCE_TYPE}" photoshop:Credit="${esc}"/>` +
    '</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
  );
}

/** Wie embedAiGeneratedXmp, auch fuer JPEG (APP1-Segment hinter SOI). Andere Formate bleiben unveraendert. */
export function markAsAiGenerated(image: Buffer, creditLine = "KI-generiert"): Buffer {
  const type = sniffImageType(image);
  if (type === "image/png") return embedAiGeneratedXmp(image, creditLine);
  if (type === "image/jpeg") {
    const payload = Buffer.concat([Buffer.from("http://ns.adobe.com/xap/1.0/\0", "latin1"), Buffer.from(xmpPacket(creditLine), "utf8")]);
    if (payload.length + 2 > 0xffff) return image;
    const header = Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 0xff]);
    return Buffer.concat([image.subarray(0, 2), header, payload, image.subarray(2)]);
  }
  return image;
}

/** Erzeugt ein einfaches Farbverlauf-PNG (Platzhalter fuer Tests und den Fake-Bildanbieter). */
export function makePlaceholderPng(width = 600, height = 400): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bittiefe
  ihdr[9] = 2; // RGB
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      row[1 + x * 3] = Math.round((x / width) * 90) + 40;
      row[2 + x * 3] = Math.round((y / height) * 90) + 70;
      row[3 + x * 3] = 170;
    }
    rows.push(row);
  }
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/** Entpackt die Bilddaten (zur Pruefung, dass eine veraenderte Datei noch gueltig ist). */
export function decodedLength(png: Buffer): number {
  const idat = Buffer.concat(readChunks(png).filter((c) => c.type === "IDAT").map((c) => c.data));
  return inflateSync(idat).length;
}
