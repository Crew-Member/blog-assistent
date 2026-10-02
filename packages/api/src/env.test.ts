import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { formatConfigError, loadConfig } from "./config.js";
import { loadDotEnv, loadDotEnvWithOrigin } from "./env.js";
import { describeAiSetup, fingerprint } from "./startup-info.js";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(path.join(tmpdir(), "env-test-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  delete process.env.BLOG_TEST_A;
  delete process.env.BLOG_TEST_B;
});

describe("loadDotEnv", () => {
  it("findet die .env in einem Elternordner (Start in packages/api)", () => {
    const root = tmp();
    const nested = path.join(root, "packages", "api");
    mkdirSync(nested, { recursive: true });
    writeFileSync(path.join(root, ".env"), "BLOG_TEST_A=aus-datei\n");
    expect(loadDotEnv(nested)).toBe(path.join(root, ".env"));
    expect(process.env.BLOG_TEST_A).toBe("aus-datei");
  });

  it("ueberschreibt bereits gesetzte Variablen nicht", () => {
    const root = tmp();
    writeFileSync(path.join(root, ".env"), "BLOG_TEST_B=aus-datei\n");
    process.env.BLOG_TEST_B = "aus-shell";
    loadDotEnv(root);
    expect(process.env.BLOG_TEST_B).toBe("aus-shell");
  });

  it("liefert undefined, wenn keine .env existiert", () => {
    expect(loadDotEnv(tmp(), () => { throw new Error("darf nicht aufgerufen werden"); })).toBeUndefined();
  });
});

describe("formatConfigError", () => {
  it("nennt fehlende Werte und den Fundort der .env", () => {
    let error: unknown;
    try {
      loadConfig({} as NodeJS.ProcessEnv);
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ZodError);
    const msg = formatConfigError(error, "/x/.env");
    expect(msg).toContain("ADMIN_PASSWORD");
    expect(msg).toContain("Gelesen aus: /x/.env");
    expect(formatConfigError(error)).toContain("keine .env-Datei");
  });

  it("verlangt den API-Key nur bei AI_PROVIDER=claude", () => {
    const base = { DATABASE_URL: "x", ADMIN_PASSWORD: "geheim-passwort", SESSION_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv;
    expect(() => loadConfig({ ...base, AI_PROVIDER: "claude" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => loadConfig({ ...base, AI_PROVIDER: "fake" })).not.toThrow();
  });
});

const baseEnv = { DATABASE_URL: "x", ADMIN_PASSWORD: "geheim-passwort", SESSION_SECRET: "x".repeat(40) };
const KEY = "sk-ant-api03-" + "a".repeat(80) + "WXYZ";

describe("Konfiguration: Key bereinigen", () => {
  it("entfernt Leerzeichen und Anfuehrungszeichen um Key und Workspace-ID", () => {
    const c = loadConfig({ ...baseEnv, ANTHROPIC_API_KEY: `  "${KEY}" `, ANTHROPIC_WORKSPACE_ID: " 'wrkspc_1' " } as NodeJS.ProcessEnv);
    expect(c.ANTHROPIC_API_KEY).toBe(KEY);
    expect(c.ANTHROPIC_WORKSPACE_ID).toBe("wrkspc_1");
    expect(c.AI_BASE_URL).toBe("https://api.anthropic.com");
  });
});

describe("describeAiSetup", () => {
  const config = (extra: Record<string, string> = {}) => loadConfig({ ...baseEnv, ANTHROPIC_API_KEY: KEY, ...extra } as NodeJS.ProcessEnv);

  it("zeigt Fingerabdruck statt Key und nennt die Quelle", () => {
    const lines = describeAiSetup(config(), { preset: {}, fromFile: { ANTHROPIC_API_KEY: KEY } }).join("\n");
    expect(lines).toContain(fingerprint(KEY));
    expect(lines).toContain("Quelle: .env");
    expect(lines).not.toContain(KEY);
    expect(lines).not.toContain("WARNUNG");
  });

  it("warnt, wenn eine Systemvariable den Key aus der .env ueberstimmt", () => {
    const origin = { preset: { ANTHROPIC_API_KEY: KEY }, fromFile: { ANTHROPIC_API_KEY: "sk-ant-anderer" } };
    const lines = describeAiSetup(config(), origin).join("\n");
    expect(lines).toContain("ueberstimmt die .env");
    expect(lines).toContain("WARNUNG");
  });

  it("warnt bei unpassendem Key und weist auf ignorierte Fremdvariablen hin", () => {
    const lines = describeAiSetup(config({ ANTHROPIC_API_KEY: "kaputt" }), { preset: { ANTHROPIC_BASE_URL: "https://proxy" }, fromFile: {} }).join("\n");
    expect(lines).toContain('beginnt nicht mit "sk-ant-"');
    expect(lines).toContain("ANTHROPIC_BASE_URL ist gesetzt, wird aber ignoriert");
  });

  it("weist auf ungewoehnliche Key-Typen hin, ohne sie als falsch zu bezeichnen", () => {
    const lines = describeAiSetup(config({ ANTHROPIC_API_KEY: "sk-ant-usr" + "b".repeat(90) }), { preset: {}, fromFile: {} }).join("\n");
    expect(lines).toContain('Normale API-Keys beginnen mit "sk-ant-api"');
    expect(lines).toContain("sk-ant-usr");
    expect(lines).not.toContain('beginnt nicht mit "sk-ant-"');
  });

  it("meldet den Platzhalter-Modus", () => {
    expect(describeAiSetup(config({ AI_PROVIDER: "fake" }), { preset: {}, fromFile: {} })[0]).toContain("Platzhalter");
  });
});

describe("loadDotEnvWithOrigin", () => {
  it("merkt sich vorgesetzte Variablen und die Werte aus der Datei", () => {
    const root = tmp();
    writeFileSync(path.join(root, ".env"), "BLOG_TEST_A=aus-datei\n");
    const env: NodeJS.ProcessEnv = { ...process.env, BLOG_TEST_A: "aus-system" };
    const origin = loadDotEnvWithOrigin(root, env);
    expect(origin.preset.BLOG_TEST_A).toBe("aus-system");
    expect(origin.fromFile.BLOG_TEST_A).toBe("aus-datei");
  });
});
