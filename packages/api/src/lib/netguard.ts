import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a = 0, b = 0] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
}

/** Verhindert, dass der Server auf interne Adressen (Metadaten-Dienste, localhost, LAN) zugreift. */
export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Ungültige Adresse");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Nur http(s)-Adressen sind erlaubt");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new Error(`Adresse nicht auflösbar: ${host}`);
  if (addresses.some((a) => isPrivateIp(a.address))) throw new Error("Adressen im internen Netz sind nicht erlaubt");
  return url;
}
