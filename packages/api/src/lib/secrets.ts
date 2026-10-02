import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const keyCache = new Map<string, Buffer>();

/** Schluessel aus dem SESSION_SECRET ableiten. Wird das Secret geaendert, muessen gespeicherte Passwoerter neu eingegeben werden. */
function keyFor(secret: string): Buffer {
  let key = keyCache.get(secret);
  if (!key) {
    key = scryptSync(secret, "kdsb-blog-assistent/secrets/v1", 32);
    keyCache.set(secret, key);
  }
  return key;
}

/** AES-256-GCM; Format: "v1:" + base64(iv | tag | ciphertext). Leerer Text bleibt leer. */
export function encryptSecret(plain: string, secret: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

/** Liefert den Klartext oder undefined, wenn der Wert fehlt, beschaedigt ist oder mit einem anderen Secret verschluesselt wurde. */
export function decryptSecret(stored: string, secret: string): string | undefined {
  if (!stored.startsWith("v1:")) return undefined;
  try {
    const raw = Buffer.from(stored.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return undefined;
  }
}
