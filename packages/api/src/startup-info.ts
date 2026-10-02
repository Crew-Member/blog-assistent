import type { Config } from "./config.js";
import type { EnvOrigin } from "./env.js";

/** Kurzform eines Keys, die zum Abgleich mit der Anthropic Console reicht, ohne ihn offenzulegen. */
export function fingerprint(key: string): string {
  return `${key.slice(0, 10)}…${key.slice(-4)} (${key.length} Zeichen)`;
}

/** Zeilen fuer die Startausgabe: welcher Key/Endpoint wirklich verwendet wird und woher er stammt. */
function describeImages(config: Config): string {
  if (config.IMAGE_PROVIDER === "none") return "Bilder: keine Bildgenerierung eingerichtet (nur Prompts, Stockfoto-Suche und Upload).";
  if (config.IMAGE_PROVIDER === "fake") return "Bilder: Platzhalter-Modus (IMAGE_PROVIDER=fake).";
  return `Bilder: ${config.IMAGE_PROVIDER}, Modell ${config.IMAGE_MODEL}, Qualitaet ${config.IMAGE_QUALITY}, Schluessel ${fingerprint(config.IMAGE_API_KEY ?? "")}`;
}

export function describeAiSetup(config: Config, origin: EnvOrigin): string[] {
  if (config.AI_PROVIDER === "fake") return ["KI: Platzhalter-Modus (AI_PROVIDER=fake), es werden keine echten KI-Aufrufe gemacht.", describeImages(config)];

  const lines: string[] = [];
  const key = config.ANTHROPIC_API_KEY ?? "";
  const presetKey = origin.preset["ANTHROPIC_API_KEY"];
  const fileKey = origin.fromFile["ANTHROPIC_API_KEY"];
  const source = presetKey && fileKey && presetKey !== fileKey ? "Windows-/Systemvariable (ueberstimmt die .env!)" : presetKey ? "Umgebungsvariable" : ".env";

  lines.push(`KI: ${config.AI_MODEL} ueber ${config.AI_BASE_URL}`);
  lines.push(`Anthropic-Key: ${fingerprint(key)}, Quelle: ${source}${config.ANTHROPIC_WORKSPACE_ID ? `, Workspace: ${config.ANTHROPIC_WORKSPACE_ID}` : ""}`);

  if (presetKey && fileKey && presetKey !== fileKey) {
    lines.push("WARNUNG: Der Key in der .env weicht von der gesetzten Umgebungsvariable ANTHROPIC_API_KEY ab. Verwendet wird die Umgebungsvariable.");
    lines.push("         Loesung: die Umgebungsvariable entfernen (Windows: Einstellungen > Umgebungsvariablen) oder PowerShell/Terminal neu starten.");
  }
  if (!key.startsWith("sk-ant-")) lines.push('WARNUNG: Der Key beginnt nicht mit "sk-ant-". Vermutlich ist er falsch oder unvollstaendig kopiert.');
  else if (!key.startsWith("sk-ant-api")) {
    lines.push(`HINWEIS: Normale API-Keys beginnen mit "sk-ant-api". Dieser beginnt mit "${key.slice(0, 10)}" - moeglicherweise ein anderer Schluesseltyp.`);
    lines.push("         Lehnt die API den Key ab, in der Anthropic Console unter API Keys einen neuen Key erstellen und diesen eintragen.");
  }
  if (/\s/.test(key) || key.length < 40) lines.push("WARNUNG: Der Key enthaelt Leerzeichen oder ist auffallend kurz.");

  for (const name of ["ANTHROPIC_BASE_URL", "ANTHROPIC_AUTH_TOKEN"]) {
    if (origin.preset[name] || origin.fromFile[name]) {
      lines.push(`HINWEIS: ${name} ist gesetzt, wird aber ignoriert (Endpoint: AI_BASE_URL, Anmeldung: nur ANTHROPIC_API_KEY).`);
    }
  }
  lines.push(describeImages(config));
  return lines;
}
