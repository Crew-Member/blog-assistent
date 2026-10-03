import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DraftResult, FactCheckResult } from "../ai/types.js";
import { evaluateFactCheck } from "../pipeline.js";
import { assertPublicHttpUrl } from "./netguard.js";
import { checkReferences, extractReferences } from "./references.js";
import { seoChecks } from "./seo.js";
import { fetchWordPressPosts } from "./wordpress.js";

const naumburg = readFileSync(new URL("../fixtures/olg-naumburg.txt", import.meta.url), "utf8");
const wohnen = readFileSync(new URL("../fixtures/deutsche-wohnen.txt", import.meta.url), "utf8");

describe("extractReferences", () => {
  it("erkennt alle Aktenzeichen und Daten im OLG-Naumburg-Beitrag", () => {
    const refs = extractReferences(naumburg);
    const az = refs.filter((r) => r.kind === "aktenzeichen").map((r) => r.key);
    for (const expected of ["35 o 68/18", "36 o 48/18", "5 o 214/18", "12 o 85/18", "3 u 66/17", "11 o 1741/18", "9 u 39/18", "9 u 6/19"]) {
      expect(az).toContain(expected);
    }
    const dates = refs.filter((r) => r.kind === "datum").map((r) => r.key);
    expect(dates).toEqual(expect.arrayContaining(["20.5.2019", "7.11.2019", "25.10.2018"]));
    expect(refs.map((r) => r.key)).toContain("§3a uwg");
  });

  it("erkennt Normen in unterschiedlichen Schreibweisen", () => {
    const keys = extractReferences(wohnen).map((r) => r.key);
    expect(keys).toContain("art5 dsgvo"); // "Art. 5 Abs. 1 lit.e) DSGVO"
    const klingel = extractReferences("Art. 6 Abs. 1 lit. f DSGVO und nach deren Artikel 2 Absatz 1 DSGVO sowie Art. 2 DSGVO");
    expect(klingel.map((r) => r.key)).toEqual(expect.arrayContaining(["art6 dsgvo", "art2 dsgvo"]));
  });

  it("erkennt Normen mit Satzzeichen-Eigenheiten aus echten Beitraegen", () => {
    const keys = extractReferences("vgl. Art. 2 Abs. 2 c) DSGVO; laut Art. 26. Abs. 1 Satz 1 DSGVO und Art. 26 Abs. 1 Satz 2 DSGVO").map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(["art2 dsgvo", "art26 dsgvo"]));
    expect(keys.filter((k) => k === "art26 dsgvo")).toHaveLength(1);
  });

  it("vergleicht Daten unabhaengig von Schreibweise (08.09.2020 = 8. September 2020)", () => {
    const [ref] = checkReferences("<p>Urteil vom 08.09.2020</p>", ["Entscheidung vom 8. September 2020"]);
    expect(ref?.found).toBe(true);
  });
});

describe("checkReferences", () => {
  it("meldet erfundene Fundstellen, die in den Belegen fehlen", () => {
    const html = "<p>Das OLG Naumburg (Az. 9 U 39/18) und das OLG Köln (Az. 6 U 99/19) entschieden am 07.11.2019 anders. Siehe § 3a UWG und § 99 BGB.</p>";
    const result = checkReferences(html, [naumburg]);
    const missing = result.filter((r) => !r.found).map((r) => r.text);
    expect(missing).toEqual(expect.arrayContaining(["6 U 99/19", "§ 99 BGB"]));
    expect(result.find((r) => r.text === "9 U 39/18")?.found).toBe(true);
    expect(result.find((r) => r.key === "7.11.2019")?.found).toBe(true);
    expect(result.find((r) => r.key === "§3a uwg")?.found).toBe(true);
  });
});

describe("evaluateFactCheck", () => {
  const draft = { contentHtml: `<p>${"Text ".repeat(40)}</p><p>Az. 9 U 39/18</p>` } as DraftResult;
  const base: FactCheckResult = { summary: "ok", issues: [], revisedHtml: draft.contentHtml };

  it("passed, wenn nichts beanstandet wird und alle Fundstellen belegt sind", () => {
    expect(evaluateFactCheck(draft, base, [naumburg]).stored.status).toBe("passed");
  });
  it("revised, wenn Aussagen entfernt oder entschaerft wurden", () => {
    const r = evaluateFactCheck(draft, { ...base, issues: [{ claim: "x", problem: "unsupported", evidence: "-", action: "removed" }] }, [naumburg]);
    expect(r.stored.status).toBe("revised");
  });
  it("needs_review bei markierten Aussagen, unbelegten Fundstellen oder stark gekuerztem Text", () => {
    const flagged = evaluateFactCheck(draft, { ...base, issues: [{ claim: "Aussage A", problem: "unsupported", evidence: "-", action: "flagged" }] }, [naumburg]);
    expect(flagged.stored.status).toBe("needs_review");
    expect(flagged.unverified).toContain("Aussage A");

    const missingRef = evaluateFactCheck(draft, base, ["keine passenden Belege"]);
    expect(missingRef.stored.status).toBe("needs_review");
    expect(missingRef.unverified[0]).toContain("9 U 39/18");

    const shrunk = evaluateFactCheck(draft, { ...base, revisedHtml: "<p>kurz</p>" }, [naumburg]);
    expect(shrunk.stored.status).toBe("needs_review");
  });
  it("bereinigt das korrigierte HTML", () => {
    const r = evaluateFactCheck(draft, { ...base, revisedHtml: `${draft.contentHtml}<script>x</script>` }, [naumburg]);
    expect(r.html).not.toContain("script");
  });
});

describe("seoChecks", () => {
  const good = {
    title: "Datenschutzverstöße: Konkurrenten dürfen abmahnen",
    slug: "datenschutzverstoesse-konkurrenten-abmahnen",
    metaDescription: "Datenschutzverstöße Konkurrenten: Das OLG Naumburg lässt Abmahnungen zu. Was Unternehmen jetzt wissen und prüfen sollten.",
    focusKeyword: "Datenschutzverstöße Konkurrenten",
    contentHtml: `<p>Datenschutzverstöße Konkurrenten ${"wort ".repeat(520)} Datenschutzverstöße Konkurrenten und Datenschutzverstöße Konkurrenten</p><h2>Datenschutzverstöße Konkurrenten</h2><h2>B</h2>`,
  };
  it("besteht bei sauberem Beitrag", () => {
    expect(seoChecks(good).filter((c) => !c.ok)).toEqual([]);
  });
  it("meldet fehlendes Keyword, zu lange Meta-Description und kurzen Text", () => {
    const failed = seoChecks({ ...good, metaDescription: "x".repeat(200), focusKeyword: "Bußgeldkatalog", contentHtml: "<p>kurz</p>" })
      .filter((c) => !c.ok)
      .map((c) => c.id);
    expect(failed).toEqual(expect.arrayContaining(["meta-length", "kw-title", "kw-meta", "kw-intro", "kw-slug", "kw-h2", "kw-count", "length", "headings"]));
  });
});

describe("assertPublicHttpUrl", () => {
  it("lehnt interne und ungueltige Adressen ab", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/")).rejects.toThrow(/intern/);
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/intern/);
    await expect(assertPublicHttpUrl("http://[::1]/")).rejects.toThrow(/intern/);
    await expect(assertPublicHttpUrl("http://192.168.1.5")).rejects.toThrow(/intern/);
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toThrow(/http/);
    await expect(assertPublicHttpUrl("kein url")).rejects.toThrow();
  });
  it("akzeptiert oeffentliche IP-Adressen", async () => {
    await expect(assertPublicHttpUrl("https://93.184.216.34/")).resolves.toBeInstanceOf(URL);
  });
});

describe("fetchWordPressPosts", () => {
  const body = JSON.stringify([{ title: { rendered: "Beitrag &amp; Titel" }, link: "https://93.184.216.34/a", content: { rendered: "<p>Erster Absatz.</p><p>Zweiter Absatz.</p>" } }]);
  it("liest Titel, Link und Text aus der REST-Antwort", async () => {
    const urls: string[] = [];
    const fetcher = (async (url: string) => {
      urls.push(url);
      return new Response(body);
    }) as never;
    const posts = await fetchWordPressPosts("https://93.184.216.34/blog", 3, fetcher);
    expect(posts).toEqual([{ title: "Beitrag & Titel", url: "https://93.184.216.34/a", text: "Erster Absatz.\nZweiter Absatz." }]);
    expect(urls[0]).toContain("/wp-json/wp/v2/posts?per_page=3");
  });
  it("prueft auch Weiterleitungen gegen interne Adressen", async () => {
    const fetcher = (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret" } })) as never;
    await expect(fetchWordPressPosts("https://93.184.216.34", 3, fetcher)).rejects.toThrow(/intern/);
  });
  it("meldet Seiten ohne WordPress-REST-API verstaendlich", async () => {
    const fetcher = (async () => new Response("<html>nope</html>")) as never;
    await expect(fetchWordPressPosts("https://93.184.216.34", 3, fetcher)).rejects.toThrow(/WordPress/);
  });
});
