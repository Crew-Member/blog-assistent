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
import { cleanupOldEngines, restoreEngine, rotateEngine, stopProjectProcessesCommand } from "./prisma-engine.mjs";

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
const isWindows = process.platform === "win32";
const projectRoot = path.resolve(apiDir, "..", "..");

function stopProjectProcesses() {
  if (!isWindows) return;
  const command = stopProjectProcessesCommand(projectRoot, [process.pid, process.ppid]);
  spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], { stdio: "inherit" });
  sleep(1500);
}

function generate() {
  const client = findClient();
  const attempts = 5;
  if (isWindows) stopProjectProcesses();
  for (let attempt = 1; attempt <= attempts; attempt++) {
    // Windows: alte Engine umbenennen, damit sie auch bei gesperrter Datei ersetzt werden kann.
    const moved = isWindows && client ? rotateEngine(client.dir) : [];
    const result = spawnSync(`npx prisma generate --schema "${schemaPath}"`, { cwd: apiDir, stdio: "inherit", shell: true });
    if (result.status === 0) {
      if (client) cleanupOldEngines(client.dir);
      return true;
    }
    restoreEngine(moved);
    if (attempt < attempts) {
      console.warn(`prisma generate fehlgeschlagen (Versuch ${attempt} von ${attempts}) - neuer Versuch in 4 Sekunden ...`);
      sleep(4000);
    }
  }
  return false;
}

if (isUpToDate()) {
  const client = findClient();
  if (client) cleanupOldEngines(client.dir);
  console.log("Prisma-Client ist aktuell - wird nicht neu erzeugt.");
} else if (generate()) {
  console.log("Prisma-Client wurde erzeugt.");
} else {
  console.error(
    [
      "",
      "FEHLER: Der Prisma-Client konnte nicht erzeugt werden.",
      "Meist haelt ein laufender Prozess oder der Virenscanner die Engine-Datei fest. Bitte alle Blog-Assistent-Fenster beenden",
      "(stop.cmd), danach erneut versuchen. Hilft das nicht: Rechner neu starten und start.cmd sofort danach ausfuehren.",
    ].join("\n"),
  );
  process.exit(1);
}
