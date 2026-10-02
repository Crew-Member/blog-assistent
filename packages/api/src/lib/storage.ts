import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";

/** Einfache lokale Dateiablage; der Schluessel ist zufaellig, der Originalname steht nur in der DB. */
export class FileStorage {
  constructor(private readonly dir: string) {}

  async save(data: Buffer): Promise<string> {
    await mkdir(this.dir, { recursive: true });
    const key = randomUUID();
    await writeFile(path.join(this.dir, key), data);
    return key;
  }

  /** Loescht eine Datei; fehlende Dateien sind kein Fehler. */
  async remove(key: string): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(key)) return;
    await rm(path.join(this.dir, key), { force: true });
  }

  async load(key: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new Error("Ungueltiger Storage-Key");
    return readFile(path.join(this.dir, key));
  }
}
