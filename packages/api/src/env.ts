import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/**
 * Laedt die erste gefundene `.env` (im aktuellen Ordner, sonst in bis zu drei Elternordnern).
 * Wichtig, weil `npm run dev:api` im Ordner packages/api laeuft, die `.env` aber im Projektstamm liegt.
 * Bereits gesetzte Umgebungsvariablen (z. B. aus Docker oder der Shell) werden NICHT ueberschrieben.
 */
export function loadDotEnv(startDir: string = process.cwd(), load: (file: string) => void = (f) => process.loadEnvFile(f)): string | undefined {
  let dir = path.resolve(startDir);
  for (let i = 0; i < 4; i++) {
    const file = path.join(dir, ".env");
    if (existsSync(file)) {
      load(file);
      return file;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

export interface EnvOrigin {
  /** Pfad der geladenen .env (falls vorhanden). */
  file?: string;
  /** Variablen, die schon VOR dem Laden der .env gesetzt waren (z. B. systemweit in Windows) und deshalb Vorrang haben. */
  preset: Record<string, string | undefined>;
  /** Werte aus der .env-Datei (auch die ueberstimmten). */
  fromFile: Record<string, string | undefined>;
}

/** Wie loadDotEnv, merkt sich aber, woher die Werte stammen - fuer verstaendliche Diagnose beim Start. */
export function loadDotEnvWithOrigin(startDir: string = process.cwd(), env: NodeJS.ProcessEnv = process.env): EnvOrigin {
  const preset = { ...env };
  const file = loadDotEnv(startDir);
  let fromFile: Record<string, string | undefined> = {};
  if (file) {
    try {
      fromFile = parseEnv(readFileSync(file, "utf8")) as Record<string, string | undefined>;
    } catch {
      // Diagnose ist optional
    }
  }
  return { file, preset, fromFile };
}

// Muss vor allen Imports laufen, die Umgebungsvariablen lesen (z. B. der Prisma-Client).
export const envOrigin: EnvOrigin = loadDotEnvWithOrigin();
export const loadedEnvFile = envOrigin.file;
