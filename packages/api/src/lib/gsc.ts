import { createSign } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Zeile aus der Search Console: ein Suchbegriff mit Kennzahlen eines Zeitraums. */
export interface GscRow {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface SearchConsole {
  /** Ist ein Schluessel des Dienstkontos vorhanden? */
  configured(): boolean;
  /** E-Mail-Adresse des Dienstkontos (zum Freigeben in der Search Console). */
  email(): string | undefined;
  /** page: nur Suchanfragen, die auf genau diese Seitenadresse gefuehrt haben. */
  queries(property: string, startDate: string, endDate: string, opts?: { page?: string }): Promise<GscRow[]>;
}

export class GscError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function readKey(file: string): ServiceAccountKey | undefined {
  try {
    const data = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceAccountKey> & { type?: string };
    return data.type === "service_account" && data.client_email && data.private_key ? (data as ServiceAccountKey) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Sucht den Schluessel: GSC_KEY_FILE (absolut oder relativ zum aktuellen Ordner bzw. dessen Elternordnern),
 * sonst die erste Dienstkonto-JSON im Ordner `secrets` (aktueller Ordner oder bis zu drei Elternordner).
 */
export function findKeyFile(configured: string | undefined, startDir: string = process.cwd()): string | undefined {
  let dir = path.resolve(startDir);
  const roots: string[] = [];
  for (let i = 0; i < 4; i++) {
    roots.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (configured) {
    const candidates = path.isAbsolute(configured) ? [configured] : roots.map((r) => path.join(r, configured));
    return candidates.find((c) => existsSync(c) && readKey(c));
  }
  for (const root of roots) {
    const secrets = path.join(root, "secrets");
    if (!existsSync(secrets)) continue;
    try {
      const hit = readdirSync(secrets)
        .filter((f) => f.toLowerCase().endsWith(".json"))
        .map((f) => path.join(secrets, f))
        .find((f) => readKey(f));
      if (hit) return hit;
    } catch {
      /* Ordner nicht lesbar: weiter suchen */
    }
  }
  return undefined;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

/** Search Console ueber ein Dienstkonto (JWT-Anmeldung per node:crypto, keine zusaetzliche Bibliothek). */
export function createSearchConsole(keyFile: string | undefined, fetcher: typeof fetch = fetch): SearchConsole {
  const key = keyFile ? readKey(keyFile) : undefined;
  let token: { value: string; expires: number } | undefined;

  async function accessToken(): Promise<string> {
    if (!key) throw new GscError("Es wurde kein Schlüssel für die Search Console gefunden.");
    const now = Math.floor(Date.now() / 1000);
    if (token && token.expires - 60 > now) return token.value;
    const aud = key.token_uri ?? "https://oauth2.googleapis.com/token";
    const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({ iss: key.client_email, scope: SCOPE, aud, iat: now, exp: now + 3600 }))}`;
    const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key);
    const res = await fetcher(aud, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }),
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !body.access_token) throw new GscError(`Anmeldung bei Google fehlgeschlagen${body.error_description ? `: ${body.error_description}` : ` (HTTP ${res.status})`}`, res.status);
    token = { value: body.access_token, expires: now + (body.expires_in ?? 3600) };
    return token.value;
  }

  return {
    configured: () => Boolean(key),
    email: () => key?.client_email,
    async queries(rawProperty, startDate, endDate, opts) {
      const property = normalizeProperty(rawProperty);
      const bearer = await accessToken();
      const res = await fetcher(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
        method: "POST",
        headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["query"],
          rowLimit: 1000,
          dataState: "final",
          ...(opts?.page ? { dimensionFilterGroups: [{ filters: [{ dimension: "page", operator: "equals", expression: opts.page }] }] } : {}),
        }),
      });
      if (res.status === 403 || res.status === 404) {
        const detail = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] } };
        const google = detail.error?.message ?? "";
        const reasons = [...(detail.error?.errors ?? []), ...(detail.error?.details ?? [])].map((e) => e.reason ?? "").join(" ");
        const apiOff = /accessNotConfigured|SERVICE_DISABLED|has not been used in project|is disabled/i.test(`${google} ${reasons}`);
        const who = key?.client_email ?? "das Dienstkonto";
        const hint = apiOff
          ? `Die Search Console API ist im Google-Cloud-Projekt nicht aktiviert (APIs und Dienste → Bibliothek → „Google Search Console API“ → Aktivieren).`
          : `${who} ist in der Property „${property}“ nicht als Nutzer eingetragen (Search Console → Einstellungen → Nutzer und Berechtigungen) oder die Property heißt anders (z. B. mit www. oder als sc-domain:…).`;
        throw new GscError(`Kein Zugriff auf die Search-Console-Property „${property}“. ${hint}${google ? ` Antwort von Google: ${google}` : ""}`, res.status);
      }
      const body = (await res.json().catch(() => ({}))) as { rows?: { keys?: string[]; clicks?: number; impressions?: number; position?: number }[]; error?: { message?: string } };
      if (!res.ok) throw new GscError(`Search Console: ${body.error?.message ?? `HTTP ${res.status}`}`, res.status);
      return (body.rows ?? [])
        .filter((r) => r.keys?.[0])
        .map((r) => ({ query: r.keys![0]!, clicks: r.clicks ?? 0, impressions: r.impressions ?? 0, position: r.position ?? 0 }));
    },
  };
}

/** URL-Praefix-Properties heissen immer mit Schraegstrich am Ende (https://kirmse.eu/); Leerraum und fehlender Schraegstrich werden ergaenzt. */
export function normalizeProperty(property: string): string {
  const p = property.trim();
  return /^https?:\/\/[^/]+$/i.test(p) ? `${p}/` : p;
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** Zeitraeume: je 28 Tage; die Search Console liefert Daten mit etwa drei Tagen Verzug. */
export function demandPeriods(now = new Date()): { current: [string, string]; previous: [string, string] } {
  const day = 86_400_000;
  const end = new Date(now.getTime() - 3 * day);
  return {
    current: [fmtDate(new Date(end.getTime() - 27 * day)), fmtDate(end)],
    previous: [fmtDate(new Date(end.getTime() - 55 * day)), fmtDate(new Date(end.getTime() - 28 * day))],
  };
}

/** Verdichtet die Suchbegriffe zu einem kurzen Text fuer die KI: wachsende Begriffe, Luecken (Einblendungen ohne gute Platzierung), staerkste Begriffe. */
export function summarizeDemand(current: GscRow[], previous: GscRow[]): string {
  const prev = new Map(previous.map((r) => [r.query.toLowerCase(), r]));
  const pos = (r: GscRow) => r.position.toFixed(1).replace(".", ",");
  const line = (r: GscRow) => {
    const p = prev.get(r.query.toLowerCase());
    const trend = !p ? "neu im Vergleich zur Vorperiode" : `Vorperiode ${p.impressions}, ${p.impressions > 0 ? `${r.impressions >= p.impressions ? "+" : ""}${Math.round(((r.impressions - p.impressions) / p.impressions) * 100)} %` : "neu"}`;
    return `- „${r.query}“: ${r.impressions} Einblendungen (${trend}), ${r.clicks} Klicks, Position ${pos(r)}`;
  };
  const growing = current
    .filter((r) => r.impressions >= 20 && (!prev.has(r.query.toLowerCase()) || r.impressions >= prev.get(r.query.toLowerCase())!.impressions * 1.3))
    .sort((a, b) => b.impressions - (prev.get(b.query.toLowerCase())?.impressions ?? 0) - (a.impressions - (prev.get(a.query.toLowerCase())?.impressions ?? 0)))
    .slice(0, 25);
  const gaps = current.filter((r) => r.impressions >= 30 && r.position > 10).sort((a, b) => b.impressions - a.impressions).slice(0, 20);
  const top = current.filter((r) => r.impressions >= 10).sort((a, b) => b.impressions - a.impressions).slice(0, 15);
  const parts: string[] = [];
  if (growing.length) parts.push(`Wachsende Suchbegriffe (letzte 28 Tage gegen die 28 Tage davor):\n${growing.map(line).join("\n")}`);
  if (gaps.length) parts.push(`Lücken - viele Einblendungen, aber nur Platz 11 oder schlechter (kein oder schwacher Beitrag):\n${gaps.map(line).join("\n")}`);
  if (top.length) parts.push(`Meistgesuchte Begriffe der Website:\n${top.map(line).join("\n")}`);
  return parts.join("\n\n").slice(0, 7000);
}

const STOP = new Set(["der", "die", "das", "und", "für", "fuer", "von", "mit", "zum", "zur", "den", "dem", "des", "ein", "eine", "einer", "im", "in", "am", "an", "auf", "bei", "nach", "neue", "neuen", "neuer", "oder", "wie", "was", "ist", "sind"]);

/** Zerlegt Text in vergleichbare Wortstaemme (klein, ohne Satzzeichen, erste fuenf Buchstaben). */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map((w) => w.slice(0, 5));
}

/**
 * Belegt eine Themenidee mit echten Suchdaten: sucht Suchbegriffe, deren Woerter (Staemme) weitgehend im Titel oder Suchbegriff der Idee vorkommen,
 * und beschreibt die staerksten mit den gelieferten Zahlen. Leer, wenn nichts passt.
 */
export function demandNoteFor(idea: { title: string; keyword: string }, current: GscRow[], previous: GscRow[]): string {
  const ideaStems = new Set(stems(`${idea.title} ${idea.keyword}`));
  if (ideaStems.size === 0) return "";
  const prev = new Map(previous.map((r) => [r.query.toLowerCase(), r]));
  const hits = current
    .filter((r) => {
      const q = stems(r.query);
      if (q.length === 0) return false;
      const overlap = q.filter((w) => ideaStems.has(w)).length;
      return overlap >= Math.ceil(q.length * 0.6) && (overlap >= 2 || q.length === 1);
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 2);
  return hits
    .map((r) => {
      const p = prev.get(r.query.toLowerCase());
      const trend = !p ? "neu gegenüber der Vorperiode" : p.impressions > 0 ? `${r.impressions >= p.impressions ? "+" : ""}${Math.round(((r.impressions - p.impressions) / p.impressions) * 100)} % gegenüber der Vorperiode` : "neu gegenüber der Vorperiode";
      return `„${r.query}“: ${r.impressions} Einblendungen in 28 Tagen (${trend}), Position ${r.position.toFixed(1).replace(".", ",")}`;
    })
    .join(" · ");
}

/**
 * Suchdaten fuer die Ueberarbeitung eines Beitrags: Suchanfragen, ueber die genau diese Seite gefunden wird (mit Trend und Chancen),
 * plus verwandte Suchbegriffe der Website, bei denen die Seite nicht auftaucht. Leer, wenn keine Daten vorliegen.
 */
export function summarizePageDemand(page: GscRow[], pagePrevious: GscRow[], site: GscRow[], title: string): { text: string; count: number } {
  const prev = new Map(pagePrevious.map((r) => [r.query.toLowerCase(), r]));
  const pos = (r: GscRow) => r.position.toFixed(1).replace(".", ",");
  const top = [...page].sort((a, b) => b.impressions - a.impressions).slice(0, 25);
  const lines = top.map((r) => {
    const p = prev.get(r.query.toLowerCase());
    const trend = !p ? "neu" : p.impressions > 0 ? `${r.impressions >= p.impressions ? "+" : ""}${Math.round(((r.impressions - p.impressions) / p.impressions) * 100)} %` : "neu";
    const chance = r.position > 5 && r.impressions >= 20 ? " [Chance: viele Einblendungen, aber nicht in den Top 5]" : "";
    return `- „${r.query}“: ${r.impressions} Einblendungen (${trend}), ${r.clicks} Klicks, Position ${pos(r)}${chance}`;
  });
  const own = new Set(page.map((r) => r.query.toLowerCase()));
  const titleStems = new Set(stems(title));
  const related = site
    .filter((r) => !own.has(r.query.toLowerCase()) && r.impressions >= 20)
    .filter((r) => {
      const q = stems(r.query);
      const overlap = q.filter((w) => titleStems.has(w)).length;
      return q.length > 0 && overlap >= Math.ceil(q.length * 0.6) && (overlap >= 2 || q.length === 1);
    })
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8)
    .map((r) => `- „${r.query}“: ${r.impressions} Einblendungen, Position ${pos(r)} (auf einer anderen Seite)`);
  const parts: string[] = [];
  if (lines.length) parts.push(`Suchanfragen, über die dieser Beitrag in der Google-Suche gefunden wird (letzte 28 Tage):\n${lines.join("\n")}`);
  if (related.length) parts.push(`Verwandte Suchbegriffe der Website, bei denen dieser Beitrag nicht auftaucht:\n${related.join("\n")}`);
  return { text: parts.join("\n\n").slice(0, 5000), count: page.length };
}
