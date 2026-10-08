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
  /** Nur bei Ueberarbeitungen: knappe Liste, was gegenueber dem Original geaendert wurde. */
  changeSummary: z.string().default(""),
});
export type DraftResult = z.infer<typeof draftResultSchema>;

export interface RelatedPost {
  title: string;
  url: string;
  excerpt: string;
}

export interface RevisionInput {
  title: string;
  url: string;
  /** Bereinigtes HTML des bestehenden Beitrags. */
  html: string;
  /** Wunsch des Nutzers, was geaendert werden soll (kann leer sein). */
  instructions: string;
}

export interface DraftInput {
  site: SiteProfile;
  topic: TopicProposal;
  research: ResearchResult;
  styleSamples: StyleSampleInput[];
  /** Bestehende Beitraege der Website, auf die intern verlinkt werden darf. */
  relatedPosts?: RelatedPost[];
  /** Ergebnis des Vergleichs mit den Top-Ergebnissen zum Suchbegriff (optional). */
  competition?: CompetitionGuidance;
  /** Gesetzt, wenn ein bestehender Beitrag ueberarbeitet statt neu geschrieben wird. */
  revision?: RevisionInput;
}

export const refineResultSchema = z.object({ contentHtml: z.string().min(1), note: z.string() });
export type RefineResult = z.infer<typeof refineResultSchema>;

export const freshnessResultSchema = z.object({
  verdict: z.enum(["current", "update_recommended", "outdated"]),
  summary: z.string(),
  reasons: z.array(z.string()),
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
});
export type FreshnessResult = z.infer<typeof freshnessResultSchema>;

export const titleSuggestionsSchema = z.object({ titles: z.array(z.object({ title: z.string().min(1), note: z.string() })).min(1).max(8) });
export type TitleSuggestions = z.infer<typeof titleSuggestionsSchema>;

export interface CompetitorPage {
  url: string;
  title: string;
  words: number;
  headings: string[];
}

export const competitionInsightsSchema = z.object({
  intent: z.string(),
  recommendedMinWords: z.number().int(),
  recommendedMaxWords: z.number().int(),
  rationale: z.string(),
  missingTopics: z.array(z.string()),
  structureHints: z.array(z.string()),
});
export type CompetitionInsights = z.infer<typeof competitionInsightsSchema>;

/** Hinweise aus dem Vergleich mit den Top-Ergebnissen, die in den Schreib-Prompt einfliessen. */
export interface CompetitionGuidance {
  keyword: string;
  intent: string;
  recommendedMinWords: number;
  recommendedMaxWords: number;
  missingTopics: string[];
  structureHints: string[];
}

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

export const imagePlanSchema = z.object({
  style: z.enum(["illustration", "photo"]),
  prompt: z.string().min(1),
  altText: z.string().min(1),
  caption: z.string(),
  searchQuery: z.string(),
});
export type ImagePlan = z.infer<typeof imagePlanSchema>;

/** Abstraktion ueber die KI-Schritte, damit Pipeline und Tests ohne echte API laufen koennen. */
export interface AiService {
  analyze(input: { site: SiteProfile; note: string; documents: AiDocument[] }): Promise<TopicProposal[]>;
  /** narrow: weniger Suchen (z. B. bei Ueberarbeitungen). */
  research(input: { site: SiteProfile; topic: TopicProposal; narrow?: boolean }): Promise<ResearchResult>;
  draft(input: DraftInput): Promise<DraftResult>;
  /** Ueberarbeitet den Text eines fertigen Entwurfs nach Anweisung des Nutzers, ohne neue Fakten einzufuehren. */
  refine(input: { site: SiteProfile; title: string; focusKeyword: string; contentHtml: string; instruction: string }): Promise<RefineResult>;
  /** Websuche zum Suchbegriff: liefert die relevantesten Treffer (URLs in Reihenfolge) und Notizen zur Suchintention. */
  findCompetitors(input: { site: SiteProfile; keyword: string }): Promise<{ notes: string; results: { title: string; url: string }[] }>;
  /** Wertet die abgerufenen Top-Seiten (Laenge, Gliederung) aus und leitet Zielumfang und fehlende Themen ab. */
  analyzeCompetition(input: { site: SiteProfile; keyword: string; topic: TopicProposal; notes: string; pages: CompetitorPage[] }): Promise<CompetitionInsights>;
  /** Prueft per Websuche, ob ein veroeffentlichter Beitrag noch aktuell ist (neue Rechtsprechung, Gesetzesaenderungen, ...). */
  checkFreshness(input: { site: SiteProfile; post: { title: string; url: string; publishedAt: string; text: string } }): Promise<FreshnessResult>;
  /** Alternative Titel (hoechstens 65 Zeichen) fuer einen fertigen Beitrag. */
  suggestTitles(input: { site: SiteProfile; title: string; focusKeyword: string; excerpt: string; text: string }): Promise<TitleSuggestions>;
  /** Unabhaengige Pruefung des Entwurfs gegen Recherche und Originalunterlagen; liefert korrigiertes HTML. */
  factCheck(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult; draft: DraftResult; documents: AiDocument[]; internalLinks?: { title: string; url: string }[] }): Promise<FactCheckResult>;
  /** Waehlt aus den vorhandenen WordPress-Kategorien die passenden (hoechstens drei) fuer einen fertigen Beitrag. */
  suggestCategories(input: { site: SiteProfile; post: { title: string; excerpt: string; focusKeyword: string; text: string }; categories: CategoryOption[] }): Promise<CategorySuggestion>;
  /** Entwirft Beitragsbild: Bild-Prompt (Englisch), Alt-Text, Bildunterschrift und Suchbegriff fuer Stockfotos. */
  planImage(input: { site: SiteProfile; post: { title: string; excerpt: string; focusKeyword: string; text: string }; style?: "illustration" | "photo"; promptLanguage?: "de" | "en"; recentPrompts?: string[] }): Promise<ImagePlan>;
  /** Leitet aus Beispielbeitraegen Tonalitaet und Stilleitfaden ab. */
  deriveStyle(input: { site: SiteProfile; samples: StyleSampleInput[] }): Promise<StyleDerivation>;
}
