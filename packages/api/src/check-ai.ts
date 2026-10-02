import type { Config } from "./config.js";
import { fingerprint } from "./startup-info.js";

type Fetch = typeof fetch;

interface Attempt {
  ok: boolean;
  status: number | "netzwerk";
  requestId?: string;
  message: string;
}

const API_VERSION = "2023-06-01";

async function call(fetchFn: Fetch, url: string, init: { method: string; headers: Record<string, string>; body?: string }): Promise<Attempt> {
  try {
    const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const requestId = res.headers.get("request-id") ?? undefined;
    const text = await res.text();
    let message = "";
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      message = text.slice(0, 200);
    }
    return { ok: res.ok, status: res.status, requestId, message };
  } catch (error) {
    return { ok: false, status: "netzwerk", message: error instanceof Error ? error.message : String(error) };
  }
}

const describe = (a: Attempt) =>
  `HTTP ${a.status}${a.requestId ? `, Anfrage-ID ${a.requestId}` : ", keine Anfrage-ID (Antwort stammt evtl. nicht direkt von Anthropic)"}${a.message ? ` - ${a.message}` : ""}`;

/** Prueft den Zugang schrittweise und erklaert das Ergebnis. Verbraucht praktisch keine Token. */
export async function diagnose(config: Config, fetchFn: Fetch = fetch): Promise<{ lines: string[]; ok: boolean }> {
  const lines: string[] = [];
  const key = config.ANTHROPIC_API_KEY ?? "";
  const base = config.AI_BASE_URL.replace(/\/+$/, "");
  const workspace = config.ANTHROPIC_WORKSPACE_ID;
  const say = (s: string) => lines.push(s);

  say(`Pruefe Zugang: ${fingerprint(key)} bei ${base}${workspace ? `, Workspace ${workspace}` : ", ohne Workspace-Angabe"}`);
  if (!key) return { lines: [...lines, "ERGEBNIS: Kein ANTHROPIC_API_KEY gesetzt."], ok: false };

  const common = { "anthropic-version": API_VERSION, ...(workspace ? { "anthropic-workspace-id": workspace } : {}) };
  const apiKeyHeaders = { ...common, "x-api-key": key };

  say("1) Schluessel pruefen (Modellliste, kostenlos) ...");
  const first = await call(fetchFn, `${base}/v1/models?limit=1`, { method: "GET", headers: apiKeyHeaders });
  say(`   ${first.ok ? "OK" : "FEHLER"}: ${describe(first)}`);

  if (!first.ok) {
    if (first.status === "netzwerk") return { lines: [...lines, "ERGEBNIS: Keine Verbindung zu Anthropic. Internetverbindung, Firewall oder Proxy pruefen."], ok: false };
    if (/workspace/i.test(first.message)) {
      return {
        lines: [
          ...lines,
          workspace
            ? "ERGEBNIS: Anthropic verlangt eine Workspace-Angabe, die gesetzte ANTHROPIC_WORKSPACE_ID wird aber nicht akzeptiert. ID in der Anthropic Console pruefen (beginnt mit wrkspc_)."
            : "ERGEBNIS: Der Key gehoert keinem Workspace. In der .env ANTHROPIC_WORKSPACE_ID=wrkspc_... setzen (ID aus der Anthropic Console) oder dort einen Key innerhalb eines Workspaces erstellen.",
        ],
        ok: false,
      };
    }
    if (first.status === 401) {
      say("2) Gegenprobe: Schluessel als Anmelde-Token (Bearer) senden ...");
      const bearer = await call(fetchFn, `${base}/v1/models?limit=1`, {
        method: "GET",
        headers: { ...common, authorization: `Bearer ${key}`, "anthropic-beta": "oauth-2025-04-20" },
      });
      say(`   ${bearer.ok ? "OK" : "FEHLER"}: ${describe(bearer)}`);
      return {
        lines: [
          ...lines,
          bearer.ok
            ? "ERGEBNIS: Der Schluessel funktioniert nur als Anmelde-Token (Bearer), nicht als normaler API-Key. Das unterstuetzt die Anwendung bisher nicht - bitte melden, dann wird es ergaenzt. Alternativ in der Console einen klassischen API-Key (sk-ant-api...) erstellen."
            : "ERGEBNIS: Anthropic lehnt den Schluessel in beiden Formen ab. Er ist ungueltig, widerrufen oder unvollstaendig kopiert. In der Anthropic Console einen neuen Key erstellen und in die .env eintragen.",
        ],
        ok: false,
      };
    }
    return { lines: [...lines, "ERGEBNIS: Anthropic hat die Anfrage abgelehnt (siehe oben)."], ok: false };
  }

  say(`2) Testanfrage an Modell ${config.AI_MODEL} (wenige Token) ...`);
  const second = await call(fetchFn, `${base}/v1/messages`, {
    method: "POST",
    headers: { ...apiKeyHeaders, "content-type": "application/json" },
    body: JSON.stringify({ model: config.AI_MODEL, max_tokens: 64, messages: [{ role: "user", content: "Antworte nur mit: ok" }] }),
  });
  say(`   ${second.ok ? "OK" : "FEHLER"}: ${describe(second)}`);
  if (!second.ok) {
    const hint = /credit balance/i.test(second.message)
      ? "Das Guthaben ist aufgebraucht - in der Anthropic Console unter Billing aufladen."
      : second.status === 404
        ? "Das Modell ist fuer diesen Key nicht verfuegbar - AI_MODEL in der .env pruefen."
        : "Siehe Meldung oben.";
    return { lines: [...lines, `ERGEBNIS: Der Schluessel ist gueltig, aber die Testanfrage scheitert. ${hint}`], ok: false };
  }
  return { lines: [...lines, "ERGEBNIS: Alles in Ordnung. Schluessel, Workspace und Modell funktionieren."], ok: true };
}

// Aufruf per `npm run check:ai` (nicht beim Import in Tests)
if (process.argv[1] && /check-ai\.(ts|js)$/.test(process.argv[1])) {
  const { loadedEnvFile } = await import("./env.js");
  const { formatConfigError, loadConfig } = await import("./config.js");
  let config: Config;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(formatConfigError(error, loadedEnvFile));
    process.exit(1);
  }
  const { lines, ok } = await diagnose(config);
  console.log(lines.join("\n"));
  process.exit(ok ? 0 : 1);
}
