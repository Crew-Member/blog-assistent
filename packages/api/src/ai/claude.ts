import Anthropic from "@anthropic-ai/sdk";
import { ANALYZE_SYSTEM, DRAFT_SYSTEM, RESEARCH_SYSTEM, siteBlock, topicBlock } from "./prompts.js";
import {
  analyzeResultSchema,
  draftResultSchema,
  type AiDocument,
  type AiService,
  type DraftResult,
  type ResearchResult,
  type ResearchSource,
  type SiteProfile,
  type TopicProposal,
} from "./types.js";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ClaudeOptions {
  apiKey: string;
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
  },
  required: ["title", "slug", "metaDescription", "focusKeyword", "secondaryKeywords", "excerpt", "contentHtml", "sources", "unverifiedClaims"],
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
    this.client = new Anthropic({ apiKey: options.apiKey });
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

  async research(input: { site: SiteProfile; topic: TopicProposal }): Promise<ResearchResult> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `${siteBlock(input.site)}\n\n${topicBlock(input.topic)}\n\nRecherchiere zu diesem Thema und liefere die Recherchenotizen.`,
      },
    ];
    const sources = new Map<string, ResearchSource>();
    let notes = "";

    for (let round = 0; round <= MAX_CONTINUATIONS; round++) {
      const message = await this.client.messages
        .stream({
          model: this.options.model,
          max_tokens: 32000,
          system: RESEARCH_SYSTEM,
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

  async draft(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult }): Promise<DraftResult> {
    const sourceList = input.research.sources.map((s) => `- ${s.title}: ${s.url}`).join("\n") || "(keine)";
    const content: Anthropic.ContentBlockParam[] = [
      {
        type: "text",
        text: [
          siteBlock(input.site),
          topicBlock(input.topic),
          `Recherchenotizen:\n${input.research.notes}`,
          `Gefundene Quellen (nur diese duerfen in sources erscheinen):\n${sourceList}`,
          "Schreibe jetzt den Beitrag.",
        ].join("\n\n"),
      },
    ];
    return this.structured(DRAFT_SYSTEM, content, DRAFT_SCHEMA, (v) => draftResultSchema.parse(v));
  }
}
