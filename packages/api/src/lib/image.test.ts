import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { FakeImageProvider } from "../image/fake.js";
import { OpenAiImageProvider, PROMPT_GUARDRAILS, explainImageError } from "../image/provider.js";
import { finalCaption } from "../pipeline.js";
import { decodedLength, embedAiGeneratedXmp, isPng, makePlaceholderPng, readChunks } from "./png.js";

describe("PNG-Kennzeichnung (XMP)", () => {
  const png = makePlaceholderPng(64, 32);

  it("erzeugt ein gueltiges Platzhalter-PNG", () => {
    expect(isPng(png)).toBe(true);
    const chunks = readChunks(png);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    expect(decodedLength(png)).toBe(32 * (1 + 64 * 3));
  });

  it("traegt den IPTC-Vermerk 'KI-generiert' ein, ohne das Bild zu veraendern", () => {
    const marked = embedAiGeneratedXmp(png, "KI-generiert (openai)");
    const chunks = readChunks(marked);
    expect(chunks.map((c) => c.type)).toEqual(["IHDR", "iTXt", "IDAT", "IEND"]);
    expect(chunks.every((c) => c.crcOk)).toBe(true);
    const itxt = chunks.find((c) => c.type === "iTXt")!.data.toString("utf8");
    expect(itxt.startsWith("XML:com.adobe.xmp")).toBe(true);
    expect(itxt).toContain("http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia");
    expect(itxt).toContain("KI-generiert (openai)");
    // Bilddaten bleiben identisch
    expect(inflateSync(chunks.find((c) => c.type === "IDAT")!.data).equals(inflateSync(readChunks(png).find((c) => c.type === "IDAT")!.data))).toBe(true);
  });

  it("laesst Nicht-PNG-Dateien unveraendert", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    expect(embedAiGeneratedXmp(jpeg)).toBe(jpeg);
  });
});

describe("OpenAiImageProvider", () => {
  const options = { apiKey: "sk-test", model: "gpt-image-1", quality: "medium" as const, baseUrl: "https://api.openai.com" };

  it("sendet Modell, Qualitaet, Querformat und Schutzregeln und liefert das PNG", async () => {
    let captured: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
    const png = makePlaceholderPng(8, 8);
    const fetchStub = (async (url: string, init?: RequestInit) => {
      captured = { url, headers: Object.fromEntries(new Headers(init?.headers).entries()), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200 });
    }) as typeof fetch;
    const result = await new OpenAiImageProvider({ ...options, fetch: fetchStub }).generate({ prompt: "Flat illustration of scales" });
    expect(result.data.equals(png)).toBe(true);
    expect(captured?.url).toBe("https://api.openai.com/v1/images/generations");
    expect(captured?.headers["authorization"]).toBe("Bearer sk-test");
    expect(captured?.body).toMatchObject({ model: "gpt-image-1", size: "1536x1024", quality: "medium", n: 1, output_format: "png" });
    expect(String(captured?.body.prompt)).toContain("Flat illustration of scales");
    expect(String(captured?.body.prompt)).toContain(PROMPT_GUARDRAILS);
  });

  it("erklaert Fehler verstaendlich", async () => {
    const failing = (status: number, message: string) =>
      new OpenAiImageProvider({ ...options, fetch: (async () => new Response(JSON.stringify({ error: { message } }), { status })) as typeof fetch }).generate({ prompt: "x" });
    await expect(failing(403, "Your organization must be verified to use the model gpt-image-1")).rejects.toThrow(/verifiziert/);
    await expect(failing(400, "Your request was rejected by the safety system (content_policy_violation)")).rejects.toThrow(/Sicherheitsfilter/);
    await expect(failing(401, "Incorrect API key")).rejects.toThrow(/Schlüssel/);
    await expect(failing(429, "Rate limit")).rejects.toThrow(/Anfragelimit/);
    const empty = new OpenAiImageProvider({ ...options, fetch: (async () => new Response(JSON.stringify({ data: [] }), { status: 200 })) as typeof fetch });
    await expect(empty.generate({ prompt: "x" })).rejects.toThrow(/kein Bild/);
    expect(explainImageError(undefined, "irgendwas")).toBe("irgendwas");
  });

  it("FakeImageProvider merkt sich Prompts und liefert ein PNG", async () => {
    const fake = new FakeImageProvider();
    expect(isPng((await fake.generate({ prompt: "abc" })).data)).toBe(true);
    expect(fake.prompts).toEqual(["abc"]);
  });
});

describe("finalCaption (KI-Kennzeichnung)", () => {
  it("haengt den Hinweis nur an KI-Bilder an, wenn die Website es verlangt", () => {
    expect(finalCaption("Symbolbild", true, true)).toBe("Symbolbild (Bild: KI-generiert)");
    expect(finalCaption("", true, true)).toBe("Bild: KI-generiert");
    expect(finalCaption("Symbolbild", true, false)).toBe("Symbolbild");
    expect(finalCaption("Foto: Pexels", false, true)).toBe("Foto: Pexels");
    expect(finalCaption("Bild: KI-generiert", true, true)).toBe("Bild: KI-generiert"); // nicht doppelt
  });
});
