import { describe, expect, it } from "vitest";
import { ClaudeAiService } from "./claude.js";
import { explainAiError } from "./errors.js";

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** Liefert einen Service, dessen HTTP-Aufrufe abgefangen werden; die Antwort ist ein API-Fehler (kein Netzwerk noetig). */
function service(workspaceId?: string) {
  const captured: Captured[] = [];
  const fetchStub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    captured.push({
      url: String(input),
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: JSON.parse(String(init?.body ?? "{}")),
    });
    return new Response(JSON.stringify({ type: "error", error: { type: "invalid_request_error", message: "stop" } }), { status: 400, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const ai = new ClaudeAiService({ apiKey: "sk-ant-test", workspaceId, model: "claude-opus-5-5", effort: "medium", maxSearches: 4, fetch: fetchStub });
  return { ai, captured };
}

const site = { name: "Kanzlei", language: "de", audience: "Unternehmen", tone: "", styleGuide: "" };

describe("ClaudeAiService: Aufbau der Anfrage", () => {
  it("sendet Workspace-Header nur, wenn eine ID konfiguriert ist", async () => {
    const withId = service("wrkspc_123");
    await withId.ai.analyze({ site, note: "", documents: [{ filename: "a.txt", kind: "text", mimeType: "text/plain", text: "x" }] }).catch(() => undefined);
    expect(withId.captured[0]?.headers["anthropic-workspace-id"]).toBe("wrkspc_123");

    const without = service();
    await without.ai.analyze({ site, note: "", documents: [{ filename: "a.txt", kind: "text", mimeType: "text/plain", text: "x" }] }).catch(() => undefined);
    expect(without.captured[0]?.headers["anthropic-workspace-id"]).toBeUndefined();
  });

  it("analyze: Modell, adaptives Denken, Effort, JSON-Schema und PDF als Dokumentblock", async () => {
    const { ai, captured } = service();
    await ai
      .analyze({ site, note: "Hinweis", documents: [{ filename: "urteil.pdf", kind: "pdf", mimeType: "application/pdf", base64: "JVBERi0=" }] })
      .catch(() => undefined);
    const req = captured[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.headers["x-api-key"]).toBe("sk-ant-test");
    expect(req.body).toMatchObject({
      model: "claude-opus-5-5",
      stream: true,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema" } },
    });
    const content = (req.body.messages as { content: { type: string; source?: { media_type: string } }[] }[])[0]!.content;
    expect(content[0]).toMatchObject({ type: "document", source: { type: "base64", media_type: "application/pdf" } });
  });

  it("research: Websuche als Server-Tool mit max_uses", async () => {
    const { ai, captured } = service();
    await ai.research({ site, topic: { title: "T", angle: "A", summary: "S", keyFacts: [], keywords: [] } }).catch(() => undefined);
    expect(captured[0]?.body.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 4 }]);
  });
});

describe("explainAiError", () => {
  it("erklaert den Workspace-Fehler und nennt die Loesung", () => {
    const msg = explainAiError(new Error('400 {"error":{"message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}'));
    expect(msg).toContain("ANTHROPIC_WORKSPACE_ID");
    expect(msg).toContain("Details:");
  });
  it("erklaert Authentifizierung, Guthaben und Limits", () => {
    expect(explainAiError(Object.assign(new Error("401 invalid x-api-key"), { status: 401 }))).toContain("API-Key wird nicht akzeptiert");
    expect(explainAiError(new Error("Your credit balance is too low to access the Anthropic API"))).toContain("Guthaben");
    expect(explainAiError(Object.assign(new Error("rate"), { status: 429 }))).toContain("Anfragelimit");
  });
  it("laesst unbekannte Fehler unveraendert", () => {
    expect(explainAiError(new Error("irgendwas"))).toBe("irgendwas");
  });
});
