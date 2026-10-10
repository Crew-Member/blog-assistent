import type { CompetitionInsights, CompetitorPage, FreshnessResult, ScoutResult, TitleSuggestions, RefineResult, DraftInput, AiDocument, CategoryOption, CategorySuggestion, ImagePlan, AiService, DraftResult, FactCheckResult, ResearchResult, SiteProfile, StyleDerivation, StyleSampleInput, TopicProposal } from "./types.js";

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

  async draft(input: DraftInput): Promise<DraftResult> {
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
      changeSummary: input.revision ? `Platzhalter-Überarbeitung von „${input.revision.title}“ (AI_PROVIDER=fake)` : "",
    };
  }

  async factCheck(input: { draft: DraftResult }): Promise<FactCheckResult> {
    return { summary: "Platzhalter-Faktencheck (AI_PROVIDER=fake): keine Beanstandungen.", issues: [], revisedHtml: input.draft.contentHtml };
  }

  async refine(input: { contentHtml: string; instruction: string }): Promise<RefineResult> {
    return { contentHtml: `${input.contentHtml}<p>Platzhalter-Überarbeitung: ${input.instruction.slice(0, 80)}</p>`, note: "Platzhalter-Überarbeitung (AI_PROVIDER=fake)." };
  }

  async findCompetitors(): Promise<{ notes: string; results: { title: string; url: string }[] }> {
    return { notes: "Platzhalter (AI_PROVIDER=fake): keine Suche.", results: [] };
  }

  async analyzeCompetition(input: { pages: CompetitorPage[] }): Promise<CompetitionInsights> {
    return { intent: "Platzhalter", recommendedMinWords: 600, recommendedMaxWords: 1000, rationale: `Platzhalter aus ${input.pages.length} Seite(n).`, missingTopics: [], structureHints: [] };
  }

  async scoutTopics(input: { portfolio: string }): Promise<ScoutResult> {
    return {
      ideas: [
        {
          title: "Platzhalter-Themenidee",
          keyword: "platzhalter thema",
          area: input.portfolio.split("\n")[0]?.slice(0, 60) || "Datenschutzrecht",
          urgency: "medium",
          whyNow: "Platzhalter (AI_PROVIDER=fake).",
          angle: "Platzhalter-Nutzen für die Leser.",
          sources: [],
        },
      ],
    };
  }

  async checkFreshness(input: { post: { title: string } }): Promise<FreshnessResult> {
    return { verdict: "update_recommended", summary: `Platzhalter-Prüfung für „${input.post.title}“ (AI_PROVIDER=fake).`, reasons: ["Platzhalter: neue Entscheidung ergänzen"], sources: [] };
  }

  async suggestTitles(input: { title: string; focusKeyword: string }): Promise<TitleSuggestions> {
    return { titles: [1, 2, 3].map((n) => ({ title: `${input.focusKeyword}: Variante ${n}`.slice(0, 65), note: `Platzhalter-Variante ${n}` })) };
  }

  async deriveStyle(input: { samples: StyleSampleInput[] }): Promise<StyleDerivation> {
    return { tone: "Platzhalter-Tonalität (AI_PROVIDER=fake)", styleGuide: `- Platzhalter-Leitfaden aus ${input.samples.length} Beispiel(en)` };
  }

  async suggestCategories(input: { categories: CategoryOption[] }): Promise<CategorySuggestion> {
    return { categoryIds: input.categories.slice(0, 1).map((c) => c.id), newCategories: [] };
  }

  async planImage(input: { post: { title: string }; style?: "illustration" | "photo" }): Promise<ImagePlan> {
    return {
      style: input.style ?? "illustration",
      prompt: `Flache Vektorillustration: Zwei Kolleginnen besprechen am Besprechungstisch ein Dokument, Blick über die Schulter, ruhige Blau- und Grautöne (Platzhalter zu: ${input.post.title})`,
      altText: "Platzhalter: stilisierte Waage und Dokumente",
      caption: "Symbolbild",
      searchQuery: "legal documents scales",
    };
  }
}
