import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - reines JS-Hilfsmodul ohne Typen
import { cleanupOldEngines, restoreEngine, rotateEngine, stopProjectProcessesCommand } from "../scripts/prisma-engine.mjs";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "engine-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("Prisma-Engine unter Windows ersetzen", () => {
  it("benennt nur Engine-Dateien um und kann es zuruecknehmen", () => {
    const dir = tmp();
    for (const f of ["query_engine-windows.dll.node", "libquery_engine-debian-openssl-3.0.x.so.node", "index.js", "schema.prisma"]) writeFileSync(path.join(dir, f), f);
    const moved = rotateEngine(dir, 111);
    expect(moved).toHaveLength(2);
    expect(readdirSync(dir).sort()).toEqual(["index.js", "libquery_engine-debian-openssl-3.0.x.so.node.old-111", "query_engine-windows.dll.node.old-111", "schema.prisma"]);

    restoreEngine(moved);
    expect(existsSync(path.join(dir, "query_engine-windows.dll.node"))).toBe(true);
    expect(readdirSync(dir).some((f) => f.includes(".old-"))).toBe(false);
  });

  it("stellt nichts zurueck, wenn schon eine neue Engine am Originalort liegt, und raeumt Altlasten auf", () => {
    const dir = tmp();
    writeFileSync(path.join(dir, "query_engine-windows.dll.node"), "alt");
    const moved = rotateEngine(dir, 222);
    writeFileSync(path.join(dir, "query_engine-windows.dll.node"), "neu"); // neu erzeugt
    restoreEngine(moved);
    expect(readdirSync(dir).sort()).toEqual(["query_engine-windows.dll.node", "query_engine-windows.dll.node.old-222"]);
    cleanupOldEngines(dir);
    expect(readdirSync(dir)).toEqual(["query_engine-windows.dll.node"]);
  });

  it("toleriert ein fehlendes Verzeichnis", () => {
    expect(rotateEngine("/gibt/es/nicht")).toEqual([]);
    expect(() => cleanupOldEngines("/gibt/es/nicht")).not.toThrow();
  });

  it("baut einen PowerShell-Befehl nur fuer node.exe im Projektordner und schont die eigenen Prozesse", () => {
    const cmd: string = stopProjectProcessesCommand("C:\\Users\\danie\\blog-assistent", [100, 200, NaN]);
    expect(cmd).toContain("$_.Name -eq 'node.exe'");
    expect(cmd).toContain("-like '*C:\\Users\\danie\\blog-assistent*'");
    expect(cmd).toContain("@(100,200) -notcontains $_.ProcessId");
    expect(cmd).not.toContain('"'); // keine doppelten Anfuehrungszeichen -> unproblematisch beim Weiterreichen
    expect(stopProjectProcessesCommand("C:\\Users\\o'brien\\app", [1])).toContain("o''brien");
  });
});
