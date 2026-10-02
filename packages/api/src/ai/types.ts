import { z } from "zod";

export interface SiteProfile {
  name: string;
  language: string;
  audience: string;
  tone: string;
  styleGuide: string;
}

export interface AiDocument {
  filename: string;
  kind: "pdf" | "image" | "text";
  mimeType: string;
  /** kind === "text" */
  text?: string;
  /** kind === "pdf" | "image" (Base64 ohne Zeilenumbrueche) */
  base64?: string;
}

export const topicProposalSchema = z.object({
  title: z.string().min(1),
  angle: z.string().min(1),
  summary: z.string().min(1),
  keyFacts: z.array(z.string()),
  keywords: z.array(z.string()),
});
export type TopicProposal = z.infer<typeof topicProposalSchema>;

export const analyzeResultSchema = z.object({ topics: z.array(topicProposalSchema).min(1).max(6) });

export interface ResearchSource {
  title: string;
  url: string;
}

export interface ResearchResult {
  notes: string;
  sources: ResearchSource[];
}

export const draftResultSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  metaDescription: z.string().min(1),
  focusKeyword: z.string().min(1),
  secondaryKeywords: z.array(z.string()),
  excerpt: z.string().min(1),
  contentHtml: z.string().min(1),
  sources: z.array(z.object({ title: z.string(), url: z.string(), note: z.string() })),
  unverifiedClaims: z.array(z.string()),
});
export type DraftResult = z.infer<typeof draftResultSchema>;

export interface StyleSampleInput {
  title: string;
  text: string;
}

export const factCheckResultSchema = z.object({
  summary: z.string(),
  issues: z.array(
    z.object({
      claim: z.string(),
      problem: z.enum(["unsupported", "contradicted", "imprecise"]),
      evidence: z.string(),
      action: z.enum(["removed", "softened", "flagged"]),
    }),
  ),
  /** Vollstaendiges, korrigiertes Beitrags-HTML (unveraendert, wenn nichts zu korrigieren war). */
  revisedHtml: z.string().min(1),
});
export type FactCheckResult = z.infer<typeof factCheckResultSchema>;

export const styleDerivationSchema = z.object({ tone: z.string(), styleGuide: z.string() });
export type StyleDerivation = z.infer<typeof styleDerivationSchema>;

export interface CategoryOption {
  id: number;
  name: string;
}

export const categorySuggestionSchema = z.object({ categoryIds: z.array(z.number().int()), newCategories: z.array(z.string()) });
export interface CategorySuggestion {
  /** IDs vorhandener Kategorien (hoechstens drei). */
  categoryIds: number[];
  /** Namen neuer Kategorien, die nur vorgeschlagen werden (hoechstens zwei) - angelegt wird erst nach Bestaetigung. */
  newCategories: string[];
}

/** Abstraktion ueber die KI-Schritte, damit Pipeline und Tests ohne echte API laufen koennen. */
export interface AiService {
  analyze(input: { site: SiteProfile; note: string; documents: AiDocument[] }): Promise<TopicProposal[]>;
  research(input: { site: SiteProfile; topic: TopicProposal }): Promise<ResearchResult>;
  draft(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult; styleSamples: StyleSampleInput[] }): Promise<DraftResult>;
  /** Unabhaengige Pruefung des Entwurfs gegen Recherche und Originalunterlagen; liefert korrigiertes HTML. */
  factCheck(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult; draft: DraftResult; documents: AiDocument[] }): Promise<FactCheckResult>;
  /** Waehlt aus den vorhandenen WordPress-Kategorien die passenden (hoechstens drei) fuer einen fertigen Beitrag. */
  suggestCategories(input: { site: SiteProfile; post: { title: string; excerpt: string; focusKeyword: string; text: string }; categories: CategoryOption[] }): Promise<CategorySuggestion>;
  /** Leitet aus Beispielbeitraegen Tonalitaet und Stilleitfaden ab. */
  deriveStyle(input: { site: SiteProfile; samples: StyleSampleInput[] }): Promise<StyleDerivation>;
}
