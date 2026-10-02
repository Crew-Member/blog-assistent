import type { AiDocument, CategoryOption, CategorySuggestion, AiService, DraftResult, FactCheckResult, ResearchResult, SiteProfile, StyleDerivation, StyleSampleInput, TopicProposal } from "./types.js";

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

  async draft(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult; styleSamples?: StyleSampleInput[] }): Promise<DraftResult> {
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

  async factCheck(input: { draft: DraftResult }): Promise<FactCheckResult> {
    return { summary: "Platzhalter-Faktencheck (AI_PROVIDER=fake): keine Beanstandungen.", issues: [], revisedHtml: input.draft.contentHtml };
  }

  async deriveStyle(input: { samples: StyleSampleInput[] }): Promise<StyleDerivation> {
    return { tone: "Platzhalter-Tonalität (AI_PROVIDER=fake)", styleGuide: `- Platzhalter-Leitfaden aus ${input.samples.length} Beispiel(en)` };
  }

  async suggestCategories(input: { categories: CategoryOption[] }): Promise<CategorySuggestion> {
    return { categoryIds: input.categories.slice(0, 1).map((c) => c.id), newCategories: [] };
  }
}
