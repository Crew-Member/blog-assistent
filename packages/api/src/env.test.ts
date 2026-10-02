import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { formatConfigError, loadConfig } from "./config.js";
import { loadDotEnv } from "./env.js";

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
