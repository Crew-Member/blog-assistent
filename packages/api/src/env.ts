import { existsSync } from "node:fs";
import path from "node:path";

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

// Muss vor allen Imports laufen, die Umgebungsvariablen lesen (z. B. der Prisma-Client).
export const loadedEnvFile = loadDotEnv();
