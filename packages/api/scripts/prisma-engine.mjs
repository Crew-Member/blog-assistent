// Hilfsfunktionen, um die Prisma-Engine unter Windows auch dann zu ersetzen, wenn ein Prozess sie geladen hat.
//
// Windows erlaubt es, eine geladene DLL UMZUBENENNEN, aber nicht, sie zu UEBERSCHREIBEN oder zu loeschen.
// Prisma ersetzt die Engine per rename(tmp -> ziel) und scheitert dann mit EPERM. Benennen wir die alte Datei
// vorher um, kann die neue daneben abgelegt werden; die alte wird spaeter (oder beim naechsten Mal) geloescht.
import { readdirSync, renameSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const ENGINE = /^(lib)?query_engine.*\.node$/;
const OLD = /\.old-\d+$/;

/** Benennt vorhandene Engine-Dateien um und liefert die Paare [alt, neu] fuer ein eventuelles Zurueckrollen. */
export function rotateEngine(clientDir, now = Date.now()) {
  const moved = [];
  if (!existsSync(clientDir)) return moved;
  for (const name of readdirSync(clientDir)) {
    if (!ENGINE.test(name)) continue;
    const from = path.join(clientDir, name);
    const to = `${from}.old-${now}`;
    try {
      renameSync(from, to);
      moved.push([from, to]);
    } catch {
      // gesperrt auch fuer Umbenennen: ignorieren, der Aufrufer versucht es mit Wartezeit erneut
    }
  }
  return moved;
}

/** Macht rotateEngine rueckgaengig (nur wenn am Originalort nichts Neues liegt). */
export function restoreEngine(moved) {
  for (const [from, to] of moved) {
    try {
      if (!existsSync(from) && existsSync(to)) renameSync(to, from);
    } catch {
      // nichts weiter tun
    }
  }
}

/** Loescht uebrig gebliebene umbenannte Engine-Dateien (soweit nicht mehr gesperrt). */
export function cleanupOldEngines(clientDir) {
  if (!existsSync(clientDir)) return;
  for (const name of readdirSync(clientDir)) {
    if (!OLD.test(name)) continue;
    try {
      rmSync(path.join(clientDir, name), { force: true });
    } catch {
      // noch in Benutzung - beim naechsten Mal
    }
  }
}

/** PowerShell-Befehl: beendet node.exe-Prozesse, deren Befehlszeile den Projektordner enthaelt (ausser den angegebenen PIDs). */
export function stopProjectProcessesCommand(projectRoot, keepPids) {
  const root = projectRoot.replace(/'/g, "''");
  const keep = keepPids.filter((p) => Number.isInteger(p) && p > 0).join(",") || "0";
  return [
    "Get-CimInstance Win32_Process",
    `| Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -like '*${root}*' -and @(${keep}) -notcontains $_.ProcessId }`,
    "| ForEach-Object { Write-Output ('Beende laufenden Blog-Assistent-Prozess ' + $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
  ].join(" ");
}
