import Anthropic from "@anthropic-ai/sdk";
import { COMPETITOR_SEARCH_SYSTEM, COMPETITION_SYSTEM, competitionBlock, RADAR_JUDGE_SYSTEM, RADAR_SEARCH_SYSTEM, TITLES_SYSTEM, REFINE_SYSTEM, internalLinksBlock, REVISE_SYSTEM, relatedPostsBlock, revisionBlock, ANALYZE_SYSTEM, CATEGORY_SYSTEM, DRAFT_SYSTEM, IMAGE_PLAN_SYSTEM, FACTCHECK_SYSTEM, RESEARCH_SYSTEM, STYLE_SYSTEM, siteBlock, styleSamplesBlock, topicBlock } from "./prompts.js";
import {
  analyzeResultSchema,
  categorySuggestionSchema,
  draftResultSchema,
  factCheckResultSchema,
  imagePlanSchema,
  freshnessResultSchema,
  competitionInsightsSchema,
  titleSuggestionsSchema,
  refineResultSchema,
  styleDerivationSchema,
  type AiDocument,
  type AiService,
  type CategoryOption,
  type CategorySuggestion,
  type DraftInput,
  type DraftResult,
  type FactCheckResult,
  type ImagePlan,
  type FreshnessResult,
  type CompetitionInsights,
  type CompetitorPage,
  type TitleSuggestions,
  type RefineResult,
  type StyleDerivation,
  type StyleSampleInput,
  type ResearchResult,
  type ResearchSource,
  type SiteProfile,
  type TopicProposal,
} from "./types.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeOptions {
  apiKey: string;
  /** Optional: ID des Workspaces, wenn der Key keinem Workspace zugeordnet ist. */
  workspaceId?: string;
  /** Standard: https://api.anthropic.com */
  baseUrl?: string;
  /** Nur fuer Tests: eigene fetch-Implementierung. */
  fetch?: typeof fetch;
  model: string;
  effort: Effort;
  maxSearches: number;
}

const MAX_CONTINUATIONS = 5;

const stringArray = { type: "array", items: { type: "string" } } as const;

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          angle: { type: "string" },
          summary: { type: "string" },
          keyFacts: stringArray,
          keywords: stringArray,
        },
        required: ["title", "angle", "summary", "keyFacts", "keywords"],
        additionalProperties: false,
      },
    },
  },
  required: ["topics"],
  additionalProperties: false,
} as const;

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    slug: { type: "string" },
    metaDescription: { type: "string" },
    focusKeyword: { type: "string" },
    secondaryKeywords: stringArray,
    excerpt: { type: "string" },
    contentHtml: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, url: { type: "string" }, note: { type: "string" } },
        required: ["title", "url", "note"],
        additionalProperties: false,
      },
    },
    unverifiedClaims: stringArray,
    changeSummary: { type: "string" },
  },
  required: ["title", "slug", "metaDescription", "focusKeyword", "secondaryKeywords", "excerpt", "contentHtml", "sources", "unverifiedClaims", "changeSummary"],
  additionalProperties: false,
} as const;

const REFINE_SCHEMA = {
  type: "object",
  properties: { contentHtml: { type: "string" }, note: { type: "string" } },
  required: ["contentHtml", "note"],
  additionalProperties: false,
} as const;

const FRESHNESS_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["current", "update_recommended", "outdated"] },
    summary: { type: "string" },
    reasons: stringArray,
    sources: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, url: { type: "string" } }, required: ["title", "url"], additionalProperties: false },
    },
  },
  required: ["verdict", "summary", "reasons", "sources"],
  additionalProperties: false,
} as const;

const TITLES_SCHEMA = {
  type: "object",
  properties: {
    titles: {
      type: "array",
      items: { type: "object", properties: { title: { type: "string" }, note: { type: "string" } }, required: ["title", "note"], additionalProperties: false },
    },
  },
  required: ["titles"],
  additionalProperties: false,
} as const;

const COMPETITION_SCHEMA = {
  type: "object",
  properties: {
    intent: { type: "string" },
    recommendedMinWords: { type: "integer" },
    recommendedMaxWords: { type: "integer" },
    rationale: { type: "string" },
    missingTopics: stringArray,
    structureHints: stringArray,
  },
  required: ["intent", "recommendedMinWords", "recommendedMaxWords", "rationale", "missingTopics", "structureHints"],
  additionalProperties: false,
} as const;

const FACTCHECK_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          problem: { type: "string", enum: ["unsupported", "contradicted", "imprecise"] },
          evidence: { type: "string" },
          action: { type: "string", enum: ["removed", "softened", "flagged"] },
        },
        required: ["claim", "problem", "evidence", "action"],
        additionalProperties: false,
      },
    },
    revisedHtml: { type: "string" },
  },
  required: ["summary", "issues", "revisedHtml"],
  additionalProperties: false,
} as const;

const CATEGORY_SCHEMA = {
  type: "object",
  properties: { categoryIds: { type: "array", items: { type: "integer" } }, newCategories: { type: "array", items: { type: "string" } } },
  required: ["categoryIds", "newCategories"],
  additionalProperties: false,
} as const;

const IMAGE_PLAN_SCHEMA = {
  type: "object",
  properties: {
    style: { type: "string", enum: ["illustration", "photo"] },
    prompt: { type: "string" },
    altText: { type: "string" },
    caption: { type: "string" },
    searchQuery: { type: "string" },
  },
  required: ["style", "prompt", "altText", "caption", "searchQuery"],
  additionalProperties: false,
} as const;

const STYLE_SCHEMA = {
  type: "object",
  properties: { tone: { type: "string" }, styleGuide: { type: "string" } },
  required: ["tone", "styleGuide"],
  additionalProperties: false,
} as const;

function documentBlock(doc: AiDocument): Anthropic.ContentBlockParam {
  if (doc.kind === "pdf" && doc.base64) {
    return { type: "document", title: doc.filename, source: { type: "base64", media_type: "application/pdf", data: doc.base64 } };
  }
  if (doc.kind === "image" && doc.base64) {
    return {
      type: "image",
      source: { type: "base64", media_type: doc.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: doc.base64 },
    };
  }
  return { type: "text", text: `<dokument name="${doc.filename}">\n${doc.text ?? ""}\n</dokument>` };
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

function assertUsable(message: Anthropic.Message): void {
  if (message.stop_reason === "refusal") {
    throw new Error("Die KI hat die Anfrage abgelehnt (Sicherheitsfilter). Bitte Unterlagen pruefen.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Die KI-Antwort wurde abgeschnitten (max_tokens erreicht).");
  }
}

export class ClaudeAiService implements AiService {
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeOptions) {
    this.client = new Anthropic({
      apiKey: options.apiKey,
      // Explizit setzen: Das SDK wuerde sonst ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN aus der Umgebung uebernehmen.
      baseURL: options.baseUrl ?? "https://api.anthropic.com",
      authToken: null,
      defaultHeaders: options.workspaceId ? { "anthropic-workspace-id": options.workspaceId } : undefined,
      fetch: options.fetch,
      maxRetries: options.fetch ? 0 : undefined,
    });
  }

  private async structured<T>(
    system: string,
    content: Anthropic.ContentBlockParam[],
    schema: Record<string, unknown>,
    parse: (value: unknown) => T,
  ): Promise<T> {
    const message = await this.client.messages
      .stream({
        model: this.options.model,
        max_tokens: 32000,
        system,
        thinking: { type: "adaptive" },
        output_config: { effort: this.options.effort, format: { type: "json_schema", schema } },
        messages: [{ role: "user", content }],
      })
      .finalMessage();
    assertUsable(message);
    const text = textOf(message);
    try {
      return parse(JSON.parse(text));
    } catch (error) {
      throw new Error(`Unerwartetes Antwortformat der KI: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async analyze(input: { site: SiteProfile; note: string; documents: AiDocument[] }): Promise<TopicProposal[]> {
    const content: Anthropic.ContentBlockParam[] = [
      ...input.documents.map(documentBlock),
      {
        type: "text",
        text: [
          siteBlock(input.site),
          input.note ? `Hinweis des Auftraggebers: ${input.note}` : "",
          "Analysiere die Unterlagen oben und schlage Blogbeitraege vor.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    const result = await this.structured(ANALYZE_SYSTEM, content, ANALYZE_SCHEMA, (v) => analyzeResultSchema.parse(v));
    return result.topics;
  }

  /** Websuche-Schleife (inkl. pause_turn); liefert die Notizen der KI und alle gefundenen Quellen. */
  private async searchNotes(system: string, userText: string): Promise<ResearchResult> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: userText }];
    const sources = new Map<string, ResearchSource>();
    let notes = "";

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const message = await this.client.messages
        .stream({
          model: this.options.model,
          max_tokens: 32000,
          system,
          thinking: { type: "adaptive" },
          output_config: { effort: this.options.effort },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: this.options.maxSearches }],
          messages,
        })
        .finalMessage();
      assertUsable(message);

      for (const block of message.content) {
        if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
          for (const hit of block.content) {
            if (hit.type === "web_search_result" && !sources.has(hit.url)) {
              sources.set(hit.url, { title: hit.title ?? hit.url, url: hit.url });
            }
          }
        }
      }
      notes = textOf(message);
      if (message.stop_reason !== "pause_turn") break;
      // Server-seitige Schleife war lang: Antwort zuruecksenden, die Recherche setzt automatisch fort.
      messages.push({ role: "assistant", content: message.content });
    }

    if (!notes) throw new Error("Die Recherche hat keine Notizen geliefert.");
    return { notes, sources: [...sources.values()] };
  }

  async research(input: { site: SiteProfile; topic: TopicProposal }): Promise<ResearchResult> {
    return this.searchNotes(RESEARCH_SYSTEM, `${siteBlock(input.site)}\n\n${topicBlock(input.topic)}\n\nRecherchiere zu diesem Thema und liefere die Recherchenotizen.`);
  }

  async findCompetitors(input: { site: SiteProfile; keyword: string }): Promise<{ notes: string; results: { title: string; url: string }[] }> {
    const found = await this.searchNotes(COMPETITOR_SEARCH_SYSTEM, `${siteBlock(input.site)}\n\nSuchbegriff: ${input.keyword}\n\nBestimme die staerksten deutschsprachigen Treffer.`);
    return { notes: found.notes, results: found.sources };
  }

  async analyzeCompetition(input: { site: SiteProfile; keyword: string; topic: TopicProposal; notes: string; pages: CompetitorPage[] }): Promise<CompetitionInsights> {
    const pages = input.pages.map((p) => `- ${p.title} | ${p.url} | ${p.words} Woerter | Ueberschriften: ${p.headings.slice(0, 12).join(" / ") || "(keine)"}`).join("\n");
    const content: Anthropic.ContentBlockParam[] = [
      { type: "text", text: [siteBlock(input.site), `Suchbegriff: ${input.keyword}`, topicBlock(input.topic), `Notizen zur Suche:\n${input.notes}`, `Abgerufene Top-Seiten:\n${pages}`, "Werte die Seiten jetzt aus."].join("\n\n") },
    ];
    return this.structured(COMPETITION_SYSTEM, content, COMPETITION_SCHEMA, (v) => competitionInsightsSchema.parse(v));
  }

  async checkFreshness(input: { site: SiteProfile; post: { title: string; url: string; publishedAt: string; text: string } }): Promise<FreshnessResult> {
    const { post } = input;
    const material = `Veroeffentlichter Beitrag "${post.title}" (${post.url}), veroeffentlicht am ${post.publishedAt}:\n${post.text.slice(0, 12000)}`;
    const found = await this.searchNotes(RADAR_SEARCH_SYSTEM, `${siteBlock(input.site)}\n\n${material}\n\nPruefe, ob sich seit dem ${post.publishedAt} etwas Relevantes geaendert hat.`);
    const sourceList = found.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n") || "(keine)";
    const content: Anthropic.ContentBlockParam[] = [
      { type: "text", text: `${material}\n\nRecherchenotizen:\n${found.notes}\n\nGefundene Quellen (nur diese duerfen in sources erscheinen):\n${sourceList}\n\nBewerte jetzt die Aktualitaet.` },
    ];
    return this.structured(RADAR_JUDGE_SYSTEM, content, FRESHNESS_SCHEMA, (v) => freshnessResultSchema.parse(v));
  }

  async suggestTitles(input: { site: SiteProfile; title: string; focusKeyword: string; excerpt: string; text: string }): Promise<TitleSuggestions> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [siteBlock(input.site), `Aktueller Titel: ${input.title}\nFokus-Keyword: ${input.focusKeyword}\nAuszug: ${input.excerpt}`, `Text des Beitrags:\n${input.text.slice(0, 12000)}`, "Schlage jetzt die Titel vor."].join("\n\n"),
      },
    ];
    return this.structured(TITLES_SYSTEM, content, TITLES_SCHEMA, (v) => titleSuggestionsSchema.parse(v));
  }

  async draft(input: DraftInput): Promise<DraftResult> {
    const sourceList = input.research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n") || "(keine)";
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          siteBlock(input.site),
          styleSamplesBlock(input.styleSamples),
          topicBlock(input.topic),
          input.revision ? revisionBlock(input.revision) : "",
          `Recherchenotizen:\n${input.research.notes}`,
          `Gefundene Quellen (nur diese duerfen in sources erscheinen):\n${sourceList}`,
          relatedPostsBlock(input.relatedPosts ?? []),
          input.competition ? competitionBlock(input.competition) : "",
          input.revision ? "Ueberarbeite den bestehenden Beitrag jetzt." : "Schreibe jetzt den Beitrag.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    return this.structured(input.revision ? REVISE_SYSTEM : DRAFT_SYSTEM, content, DRAFT_SCHEMA, (v) => draftResultSchema.parse(v));
  }

  async factCheck(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult; draft: DraftResult; documents: AiDocument[]; internalLinks?: { title: string; url: string }[] }): Promise<FactCheckResult> {
    const sourceList = input.research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n") || "(keine)";
    const content: Anthropic.ContentBlockParam[] = [
      ...input.documents.map(documentBlock),
      {
        type: "text",
        text: [
          siteBlock(input.site),
          topicBlock(input.topic),
          `Recherchenotizen:\n${input.research.notes}`,
          `Gefundene Quellen:\n${sourceList}`,
          internalLinksBlock(input.internalLinks ?? []),
          `Beitragsentwurf (HTML), Titel: ${input.draft.title}\n${input.draft.contentHtml}`,
          "Pruefe den Beitragsentwurf jetzt gegen die Belege oben.",
        ].join("\n\n"),
      },
    ];
    return this.structured(FACTCHECK_SYSTEM, content, FACTCHECK_SCHEMA, (v) => factCheckResultSchema.parse(v));
  }

  async refine(input: { site: SiteProfile; title: string; focusKeyword: string; contentHtml: string; instruction: string }): Promise<RefineResult> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          siteBlock(input.site),
          `Titel: ${input.title}\nFokus-Keyword: ${input.focusKeyword}`,
          `Aktueller Text (HTML):\n${input.contentHtml}`,
          `Anweisung des Redakteurs:\n${input.instruction}`,
        ].join("\n\n"),
      },
    ];
    return this.structured(REFINE_SYSTEM, content, REFINE_SCHEMA, (v) => refineResultSchema.parse(v));
  }

  async deriveStyle(input: { site: SiteProfile; samples: StyleSampleInput[] }): Promise<StyleDerivation> {
    const content: Anthropic.ContentBlockParam[] = [
      { type: "text", text: `${siteBlock(input.site)}\n\n${styleSamplesBlock(input.samples)}\n\nBeschreibe den Stil dieser Website.` },
    ];
    return this.structured(STYLE_SYSTEM, content, STYLE_SCHEMA, (v) => styleDerivationSchema.parse(v));
  }

  async suggestCategories(input: { site: SiteProfile; post: { title: string; excerpt: string; focusKeyword: string; text: string }; categories: CategoryOption[] }): Promise<CategorySuggestion> {
    const list = input.categories.map((c) => `- ${c.id}: ${c.name}`).join("\n") || "(noch keine vorhanden)";
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          `Website: ${input.site.name}`,
          `Vorhandene Kategorien (ID: Name):\n${list}`,
          `Beitrag:\nTitel: ${input.post.title}\nFokus-Keyword: ${input.post.focusKeyword}\nAuszug: ${input.post.excerpt}\nAnfang des Textes: ${input.post.text.slice(0, 1500)}`,
          "Waehle die passenden Kategorien.",
        ].join("\n\n"),
      },
    ];
    const result = await this.structured(CATEGORY_SYSTEM, content, CATEGORY_SCHEMA, (v) => categorySuggestionSchema.parse(v));
    const valid = new Set(input.categories.map((c) => c.id));
    const existingNames = new Set(input.categories.map((c) => c.name.trim().toLowerCase()));
    return {
      categoryIds: [...new Set(result.categoryIds)].filter((id) => valid.has(id)).slice(0, 3),
      newCategories: [...new Set(result.newCategories.map((n) => n.trim()).filter((n) => n && n.length <= 60 && !existingNames.has(n.toLowerCase())))].slice(0, 2),
    };
  }

  async planImage(input: { site: SiteProfile; post: { title: string; excerpt: string; focusKeyword: string; text: string }; style?: "illustration" | "photo"; promptLanguage?: "de" | "en"; recentPrompts?: string[] }): Promise<ImagePlan> {
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          `Website: ${input.site.name}`,
          input.site.audience && `Zielgruppe: ${input.site.audience}`,
          `Beitrag:\nTitel: ${input.post.title}\nFokus-Keyword: ${input.post.focusKeyword}\nAuszug: ${input.post.excerpt}\nAnfang des Textes: ${input.post.text.slice(0, 1800)}`,
          input.style ? `Vorgegebener Stil: ${input.style}` : "Stil: frei waehlen",
          `Sprache des Bild-Prompts (Feld prompt): ${input.promptLanguage === "en" ? "Englisch" : "Deutsch"}`,
          input.recentPrompts?.length ? `Zuletzt verwendete Bildideen dieser Website (nicht wiederholen):\n${input.recentPrompts.map((p) => `- ${p.slice(0, 220)}`).join("\n")}` : "",
          "Entwirf das Beitragsbild.",
        ]
          .filter(Boolean)
          .join("\n\n"),
      },
    ];
    const plan = await this.structured(IMAGE_PLAN_SYSTEM, content, IMAGE_PLAN_SCHEMA, (v) => imagePlanSchema.parse(v));
    return { ...plan, style: input.style ?? plan.style, altText: plan.altText.slice(0, 125), caption: plan.caption.slice(0, 120) };
  }
}
