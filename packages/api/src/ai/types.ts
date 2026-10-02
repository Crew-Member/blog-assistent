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

/** Abstraktion ueber die KI-Schritte, damit Pipeline und Tests ohne echte API laufen koennen. */
export interface AiService {
  analyze(input: { site: SiteProfile; note: string; documents: AiDocument[] }): Promise<TopicProposal[]>;
  research(input: { site: SiteProfile; topic: TopicProposal }): Promise<ResearchResult>;
  draft(input: { site: SiteProfile; topic: TopicProposal; research: ResearchResult }): Promise<DraftResult>;
}
