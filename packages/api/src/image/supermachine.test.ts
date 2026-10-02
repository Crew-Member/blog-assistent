import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { markAsAiGenerated, makePlaceholderPng, readChunks, sniffImageType } from "../lib/png.js";
import { describeAiSetup } from "../startup-info.js";
import { createImageProvider, resolveImageSettings } from "./index.js";
import { SupermachineImageProvider, explainSupermachineError } from "./provider.js";

const BASE = "https://dev.supermachine.art/v1";
const IMG_URL = "https://93.184.216.34/generations/xxx.png"; // oeffentliche IP: besteht den Schutz vor internen Adressen

interface Call {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Record<string, unknown>;
}
type Reply = { status?: number; json?: unknown; binary?: Buffer };

/** Spielt die Antworten der Reihe nach ab (wie in der Supermachine-Dokumentation beschrieben). */
function stub(replies: Reply[]) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? "GET", url: String(url), headers: Object.fromEntries(new Headers(init?.headers).entries()), body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const r = replies.shift() ?? { status: 500, json: { error: "keine Antwort vorbereitet" } };
    if (r.binary) return new Response(new Uint8Array(r.binary), { status: r.status ?? 200 });
    return new Response(JSON.stringify(r.json ?? {}), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const provider = (fetchFn: typeof fetch, extra: Partial<ConstructorParameters<typeof SupermachineImageProvider>[0]> = {}) =>
  new SupermachineImageProvider({ apiKey: "sk-test", model: "Supermachine NextGen", baseUrl: BASE, width: 1024, height: 768, pollIntervalMs: 0, maxWaitMs: 2000, fetch: fetchFn, ...extra });

const completed = (url = IMG_URL) => ({ json: { items: [{ id: 789, batchId: 12345, url, status: "completed", width: 1024, height: 768 }], pagination: { page: 1, perPage: 20, totalItems: 1 } } });

describe("SupermachineImageProvider", () => {
  it("startet den Auftrag, fragt nach und laedt das fertige Bild", async () => {
    const png = makePlaceholderPng(16, 16);
    const { fetchFn, calls } = stub([
      { json: { batchId: 12345, method: "Vanilla/text2img", type: "GENERATE", creditsRemaining: 241.5 } },
      { json: { items: [] } }, // noch nicht fertig
      { json: { items: [{ id: 789, batchId: 12345, status: "processing" }] } },
      completed(),
      { binary: png },
    ]);
    const result = await provider(fetchFn).generate({ prompt: "  Flat illustration of scales  " });

    expect(result.mimeType).toBe("image/png");
    expect(result.data.equals(png)).toBe(true);
    expect(calls[0]).toMatchObject({ method: "POST", url: `${BASE}/generate` });
    expect(calls[0]?.headers["authorization"]).toBe("Bearer sk-test");
    expect(calls[0]?.body).toEqual({ model: "Supermachine NextGen", prompt: "Flat illustration of scales", width: 1024, height: 768 });
    expect(calls.slice(1, 4).every((c) => c.method === "GET" && c.url === `${BASE}/images?batchId=12345`)).toBe(true);
    expect(calls[4]?.url).toBe(IMG_URL);
    expect(calls[4]?.headers["authorization"]).toBeUndefined(); // der Schluessel geht nie an die Bildadresse
  });

  it("meldet fehlgeschlagene Auftraege mit Hinweis", async () => {
    const { fetchFn } = stub([{ json: { batchId: 1 } }, { json: { items: [{ status: "failed", error: "NSFW content detected" }] } }]);
    await expect(provider(fetchFn).generate({ prompt: "x" })).rejects.toThrow(/nicht erzeugen.*NSFW/s);
  });

  it("gibt nach der Hoechstdauer auf", async () => {
    const replies = [{ json: { batchId: 1 } }, ...Array.from({ length: 200 }, () => ({ json: { items: [{ status: "pending" }] } }))];
    const s2 = stub(replies);
    await expect(provider(s2.fetchFn, { maxWaitMs: 30, pollIntervalMs: 5 }).generate({ prompt: "x" })).rejects.toThrow(/nicht rechtzeitig/);
  });

  it("erkennt fehlende batchId, fehlende Bildadresse und ungueltige Bilddateien", async () => {
    await expect(provider(stub([{ json: {} }]).fetchFn).generate({ prompt: "x" })).rejects.toThrow(/batchId/);
    await expect(provider(stub([{ json: { batchId: 1 } }, { json: { items: [{ status: "completed" }] } }]).fetchFn).generate({ prompt: "x" })).rejects.toThrow(/keine Adresse/);
    await expect(provider(stub([{ json: { batchId: 1 } }, completed(), { binary: Buffer.from("<html>kein bild</html>") }]).fetchFn).generate({ prompt: "x" })).rejects.toThrow(/keine gültige Bilddatei/);
  });

  it("laedt Bilder nur von oeffentlichen https-Adressen", async () => {
    for (const url of ["http://93.184.216.34/a.png", "https://127.0.0.1/a.png", "https://192.168.1.5/a.png"]) {
      const { fetchFn, calls } = stub([{ json: { batchId: 1 } }, completed(url)]);
      await expect(provider(fetchFn).generate({ prompt: "x" })).rejects.toThrow(/Bildadresse/);
      expect(calls).toHaveLength(2); // das Bild selbst wurde nie abgerufen
    }
  });

  it("erklaert Fehler verstaendlich", async () => {
    const failing = (status: number, json: unknown) => provider(stub([{ status, json }]).fetchFn).generate({ prompt: "x" });
    await expect(failing(401, { error: "Invalid API key" })).rejects.toThrow(/Schlüssel wird nicht akzeptiert/);
    await expect(failing(402, { message: "Insufficient credits" })).rejects.toThrow(/Credits/);
    await expect(failing(429, { error: { message: "slow down" } })).rejects.toThrow(/Anfragelimit/);
    await expect(failing(400, { error: "Unknown model 'xyz'" })).rejects.toThrow(/IMAGE_MODEL/);
    expect(explainSupermachineError(500, "kaputt")).toBe("kaputt");
  });
});

describe("Voreinstellungen und Startanzeige", () => {
  const base = { DATABASE_URL: "x", ADMIN_PASSWORD: "geheim-passwort", SESSION_SECRET: "x".repeat(40), AI_PROVIDER: "fake" };
  const cfg = (extra: Record<string, string>) => loadConfig({ ...base, ...extra } as NodeJS.ProcessEnv);

  it("setzt je Anbieter passende Standardwerte, die sich ueberschreiben lassen", () => {
    expect(resolveImageSettings(cfg({ IMAGE_PROVIDER: "supermachine", IMAGE_API_KEY: "sk-x" }))).toEqual({ model: "Supermachine NextGen", baseUrl: "https://dev.supermachine.art/v1", width: 1024, height: 768 });
    expect(resolveImageSettings(cfg({ IMAGE_PROVIDER: "openai", IMAGE_API_KEY: "sk-x" }))).toMatchObject({ model: "gpt-image-1", baseUrl: "https://api.openai.com" });
    expect(resolveImageSettings(cfg({ IMAGE_PROVIDER: "supermachine", IMAGE_API_KEY: "sk-x", IMAGE_MODEL: "Anderes Modell", IMAGE_WIDTH: "1152", IMAGE_HEIGHT: "768" }))).toMatchObject({ model: "Anderes Modell", width: 1152, height: 768 });
  });

  it("verlangt den Schluessel und erzeugt den passenden Anbieter", () => {
    expect(() => cfg({ IMAGE_PROVIDER: "supermachine" })).toThrow(/IMAGE_API_KEY/);
    expect(createImageProvider(cfg({ IMAGE_PROVIDER: "supermachine", IMAGE_API_KEY: "sk-x" }))?.name).toBe("supermachine");
    expect(createImageProvider(cfg({ IMAGE_PROVIDER: "openai", IMAGE_API_KEY: "sk-x" }))?.name).toBe("openai");
    expect(createImageProvider(cfg({}))).toBeUndefined();
  });

  it("zeigt Anbieter, Modell und Format - nie den Schluessel", () => {
    const lines = describeAiSetup(cfg({ IMAGE_PROVIDER: "supermachine", IMAGE_API_KEY: "sk-" + "a".repeat(40) + "WXYZ" }), { preset: {}, fromFile: {} }).join("\n");
    expect(lines).toContain("Bilder: supermachine, Modell Supermachine NextGen, 1024x768");
    expect(lines).not.toContain("a".repeat(40));
  });
});

describe("KI-Vermerk in JPEG-Dateien", () => {
  it("fuegt ein APP1-XMP-Segment ein und laesst den Rest unveraendert", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x01, 0x02, 0xff, 0xd9]);
    const marked = markAsAiGenerated(jpeg, "KI-generiert (supermachine)");
    expect(sniffImageType(marked)).toBe("image/jpeg");
    expect(marked.subarray(0, 2)).toEqual(jpeg.subarray(0, 2)); // SOI
    expect(marked[2]).toBe(0xff);
    expect(marked[3]).toBe(0xe1); // APP1
    const len = (marked[4]! << 8) | marked[5]!;
    const segment = marked.subarray(6, 4 + len).toString("utf8");
    expect(segment.startsWith("http://ns.adobe.com/xap/1.0/")).toBe(true);
    expect(segment).toContain("trainedAlgorithmicMedia");
    expect(marked.subarray(4 + len).equals(jpeg.subarray(2))).toBe(true); // Originalbild dahinter unveraendert
  });

  it("markiert PNG weiter und laesst WebP/andere Formate unveraendert", () => {
    expect(readChunks(markAsAiGenerated(makePlaceholderPng(8, 8))).map((c) => c.type)).toContain("iTXt");
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([1, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(8)]);
    expect(markAsAiGenerated(webp)).toBe(webp);
    const other = Buffer.from("nichts");
    expect(markAsAiGenerated(other)).toBe(other);
  });
});
