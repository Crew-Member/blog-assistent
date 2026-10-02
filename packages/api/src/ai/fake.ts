import type { AiDocument, AiService, DraftResult, ResearchResult, SiteProfile, TopicProposal } from "./types.js";

/** Platzhalter-Implementierung ohne API-Aufrufe - fuer Tests und zum Ausprobieren der Oberflaeche. */
export class FakeAiService implements AiService {
  async analyze(input: { site: SiteProfile; note: string; documents: AiDocument[] }): Promise<TopicProposal[]> {
    const names = input.documents.map((d) => d.filename).join(", ");
    return [
      {
        title: `Beispielthema aus ${names || "den Unterlagen"}`,
        angle: `Was bedeutet das fuer ${input.site.audience || "die Leser"}?`,
        summary: "Platzhalter-Zusammenfassung (AI_PROVIDER=fake).",
        keyFacts: input.documents.map((d) => `Unterlage: ${d.filename}`),
        keywords: ["beispiel", "platzhalter"],
      },
    ];
  }

  async research(input: { site: SiteProfile; topic: TopicProposal }): Promise<ResearchResult> {
    return {
      notes: `Platzhalter-Recherche zu "${input.topic.title}" (AI_PROVIDER=fake).`,
      sources: [{ title: "Gesetze im Internet", url: "https://www.gesetze-im-internet.de/" }],
    };
  }

  async draft(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult }): Promise<DraftResult> {
    return {
      title: input.topic.title.slice(0, 65),
      slug: "beispielthema",
      metaDescription: "Platzhalter-Beschreibung fuer den Beispielbeitrag.",
      focusKeyword: input.topic.keywords[0] ?? "beispiel",
      secondaryKeywords: input.topic.keywords.slice(1),
      excerpt: "Platzhalter-Auszug.",
      contentHtml: `<p>${input.topic.summary}</p><h2>Was Unternehmen jetzt tun sollten</h2><ul><li>Platzhalter</li></ul>`,
      sources: input.research.sources.map((s) => ({ ...s, note: "Platzhalter" })),
      unverifiedClaims: [],
    };
  }
}
