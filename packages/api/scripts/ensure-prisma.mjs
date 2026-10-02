// Erzeugt den Prisma-Client nur, wenn er fehlt oder nicht mehr zum Schema bzw. zur Prisma-Version passt.
//
// Hintergrund: Unter Windows laesst sich die Engine-Datei (query_engine-windows.dll.node) nicht ersetzen,
// solange irgendein Prozess sie geladen hat (laufende API, Virenscanner, Indexdienst) - `prisma generate`
// scheitert dann mit EPERM. Meist ist die Neuerzeugung aber gar nicht noetig, weil sich nichts geaendert hat.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(apiDir, "src", "db", "prisma", "schema.prisma");
const require = createRequire(path.join(apiDir, "package.json"));
// Prisma richtet die Spalten beim Kopieren neu aus -> Leerraum beim Vergleich ignorieren.
const normalize = (text) => text.replace(/\s+/g, " ").trim();

function findClient() {
  try {
    const pkgPath = require.resolve("@prisma/client/package.json");
    const version = JSON.parse(readFileSync(pkgPath, "utf8")).version;
    return { dir: path.join(path.dirname(pkgPath), "..", "..", ".prisma", "client"), version };
  } catch {
    return undefined;
  }
}

function isUpToDate() {
  const client = findClient();
  if (!client) return false;
  const generatedSchema = path.join(client.dir, "schema.prisma");
  const indexJs = path.join(client.dir, "index.js");
  if (!existsSync(generatedSchema) || !existsSync(indexJs)) return false;
  const hasEngine = readdirSync(client.dir).some((f) => /query_engine.*\.node$/.test(f));
  if (!hasEngine) return false;
  if (normalize(readFileSync(generatedSchema, "utf8")) !== normalize(readFileSync(schemaPath, "utf8"))) return false;
  return readFileSync(indexJs, "utf8").includes(`"clientVersion": "${client.version}"`);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function generate() {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = spawnSync(`npx prisma generate --schema "${schemaPath}"`, { cwd: apiDir, stdio: "inherit", shell: true });
    if (result.status === 0) return true;
    if (attempt < 3) {
      console.warn(`prisma generate fehlgeschlagen (Versuch ${attempt} von 3) - neuer Versuch in 3 Sekunden ...`);
      sleep(3000);
    }
  }
  return false;
}

if (isUpToDate()) {
  console.log("Prisma-Client ist aktuell - wird nicht neu erzeugt.");
} else if (generate()) {
  console.log("Prisma-Client wurde erzeugt.");
} else {
  console.error(
    [
      "",
      "FEHLER: Der Prisma-Client konnte nicht erzeugt werden.",
      "Meist haelt ein laufender Prozess die Engine-Datei fest. Bitte alle Blog-Assistent-Fenster beenden",
      "(stop.cmd), danach erneut versuchen. Hilft das nicht: Virenscanner kurz pruefen oder den Rechner neu starten.",
    ].join("\n"),
  );
  process.exit(1);
}
