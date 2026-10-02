import { describe, expect, it } from "vitest";
import { diagnose } from "./check-ai.js";
import { loadConfig } from "./config.js";

const KEY = "sk-ant-usr" + "b".repeat(90);
const config = (extra: Record<string, string> = {}) =>
  loadConfig({ DATABASE_URL: "x", ADMIN_PASSWORD: "geheim-passwort", SESSION_SECRET: "x".repeat(40), ANTHROPIC_API_KEY: KEY, ...extra } as NodeJS.ProcessEnv);

type Reply = { status: number; body: unknown; requestId?: string };
/** Stub: beantwortet Aufrufe der Reihe nach; haelt Header/URLs fest. */
function stub(replies: Reply[]) {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    seen.push({ url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()) });
    const r = replies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.requestId ? { "request-id": r.requestId } : {} });
  }) as typeof fetch;
  return { fetchFn, seen };
}
const err = (message: string) => ({ error: { type: "x", message } });

describe("diagnose", () => {
  it("meldet Erfolg, wenn Schluessel und Testanfrage klappen", async () => {
    const { fetchFn, seen } = stub([{ status: 200, body: { data: [] }, requestId: "req_1" }, { status: 200, body: { content: [] }, requestId: "req_2" }]);
    const r = await diagnose(config(), fetchFn);
    expect(r.ok).toBe(true);
    expect(r.lines.join("\n")).toContain("Alles in Ordnung");
    expect(seen[0]?.headers["x-api-key"]).toBe(KEY);
    expect(seen[1]?.url).toContain("/v1/messages");
  });

  it("erklaert den Workspace-Fehler", async () => {
    const { fetchFn } = stub([{ status: 400, body: err("This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header") }]);
    const r = await diagnose(config(), fetchFn);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("ANTHROPIC_WORKSPACE_ID=wrkspc_");
  });

  it("sendet die Workspace-ID mit und erkennt eine abgelehnte ID", async () => {
    const { fetchFn, seen } = stub([{ status: 400, body: err("must include the anthropic-workspace-id header") }]);
    const r = await diagnose(config({ ANTHROPIC_WORKSPACE_ID: "wrkspc_x" }), fetchFn);
    expect(seen[0]?.headers["anthropic-workspace-id"]).toBe("wrkspc_x");
    expect(r.lines.join("\n")).toContain("wird aber nicht akzeptiert");
  });

  it("probiert bei 401 die Bearer-Variante und erkennt Anmelde-Token", async () => {
    const { fetchFn, seen } = stub([{ status: 401, body: err("API key is invalid.") }, { status: 200, body: { data: [] }, requestId: "req_b" }]);
    const r = await diagnose(config(), fetchFn);
    expect(seen[1]?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(seen[1]?.headers["anthropic-beta"]).toBe("oauth-2025-04-20");
    expect(r.lines.join("\n")).toContain("nur als Anmelde-Token");
    expect(r.ok).toBe(false);
  });

  it("meldet einen in beiden Formen abgelehnten Schluessel", async () => {
    const { fetchFn } = stub([{ status: 401, body: err("API key is invalid.") }, { status: 401, body: err("invalid bearer token") }]);
    const r = await diagnose(config(), fetchFn);
    expect(r.lines.join("\n")).toContain("in beiden Formen ab");
  });

  it("weist auf fehlende Anfrage-ID und Netzwerkprobleme hin", async () => {
    const { fetchFn } = stub([{ status: 401, body: err("x") }, { status: 401, body: err("y") }]);
    expect((await diagnose(config(), fetchFn)).lines.join("\n")).toContain("keine Anfrage-ID");
    const down = (async () => { throw new Error("getaddrinfo ENOTFOUND"); }) as unknown as typeof fetch;
    expect((await diagnose(config(), down)).lines.join("\n")).toContain("Keine Verbindung");
  });

  it("erkennt aufgebrauchtes Guthaben bei der Testanfrage", async () => {
    const { fetchFn } = stub([{ status: 200, body: {} }, { status: 400, body: err("Your credit balance is too low to access the Anthropic API") }]);
    const r = await diagnose(config(), fetchFn);
    expect(r.ok).toBe(false);
    expect(r.lines.join("\n")).toContain("Guthaben");
  });
});
