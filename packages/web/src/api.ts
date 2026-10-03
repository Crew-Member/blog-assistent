export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body && !isForm ? { "content-type": "application/json" } : undefined,
    body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? `Fehler ${res.status}`, res.status);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: (url: string) => request<void>("DELETE", url),
};

export interface Site {
  id: string;
  name: string;
  baseUrl: string;
  language: string;
  audience: string;
  tone: string;
  styleGuide: string;
  disclaimer: string;
  labelAiImages: boolean;
  wpUsername: string;
  hasWpPassword: boolean;
}

export type SubmissionStatus = "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
export type PostStatus = "QUEUED" | "RESEARCHING" | "DRAFTING" | "FACTCHECKING" | "DRAFT_READY" | "FAILED";

export interface SubmissionListItem {
  id: string;
  status: SubmissionStatus;
  note: string;
  createdAt: string;
  site: { id: string; name: string };
  _count: { documents: number; topics: number };
}

export interface TopicWithPosts {
  id: string;
  title: string;
  angle: string;
  summary: string;
  keyFacts: string[];
  keywords: string[];
  posts: { id: string; status: PostStatus; title: string | null }[];
}

export interface SubmissionDetail {
  id: string;
  status: SubmissionStatus;
  error: string | null;
  note: string;
  site: { id: string; name: string };
  documents: { id: string; filename: string; sizeBytes: number }[];
  topics: TopicWithPosts[];
}

export interface FactCheck {
  status: "passed" | "revised" | "needs_review" | "skipped";
  summary: string;
  issues: { claim: string; problem: "unsupported" | "contradicted" | "imprecise"; evidence: string; action: "removed" | "softened" | "flagged" }[];
  references: { kind: "aktenzeichen" | "norm" | "datum"; text: string; found: boolean }[];
  ranAt: string;
  error?: string;
}

export interface SeoCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface StyleSample {
  id: string;
  title: string;
  url: string;
  text: string;
  createdAt: string;
}

export type ImageStatus = "PLANNED" | "QUEUED" | "GENERATING" | "READY" | "FAILED";

export interface PostImage {
  id: string;
  status: ImageStatus;
  origin: "AI" | "UPLOAD";
  aiGenerated: boolean;
  error: string | null;
  style: "illustration" | "photo";
  prompt: string;
  altText: string;
  caption: string;
  searchQuery: string;
  sourceNote: string;
  hasFile: boolean;
  inWordPress: boolean;
  updatedAt: string;
}

export interface SitePostSummary {
  id: number;
  title: string;
  url: string;
  date: string;
  excerpt: string;
}

export interface PostDetail {
  /** Gesetzt, wenn der Beitrag eine Überarbeitung eines bestehenden WordPress-Beitrags ist. */
  /** True, wenn die letzte KI-Nachschärfung rückgängig gemacht werden kann. */
  canUndoRefine: boolean;
  revisionOf: { wpPostId: number; title: string; url: string; instructions: string } | null;
  id: string;
  status: PostStatus;
  error: string | null;
  title: string | null;
  slug: string | null;
  metaDescription: string | null;
  focusKeyword: string | null;
  secondaryKeywords: string[];
  excerpt: string | null;
  contentHtml: string | null;
  sources: { title: string; url: string; note: string }[];
  unverifiedClaims: string[];
  factCheck: FactCheck | null;
  seoChecks: SeoCheck[];
  researchNotes: string | null;
  wpPostId: number | null;
  wpEditUrl: string | null;
  wpLink: string | null;
  wpSeo: { status: "set" | "manual" | "no_plugin"; message: string } | null;
  wpPushedAt: string | null;
  image: PostImage | null;
  site: { id: string; name: string; baseUrl: string; labelAiImages: boolean };
  topic: { id: string; title: string; submissionId: string };
}

export interface PostListItem {
  id: string;
  status: PostStatus;
  title: string | null;
  error: string | null;
  createdAt: string;
  wpPostId: number | null;
  site: { id: string; name: string };
  topic: { submissionId: string };
}

export const SUBMISSION_LABEL: Record<SubmissionStatus, string> = {
  UPLOADED: "Wartet auf Analyse",
  ANALYZING: "Wird analysiert …",
  ANALYZED: "Themen vorgeschlagen",
  FAILED: "Fehlgeschlagen",
};

export const POST_LABEL: Record<PostStatus, string> = {
  QUEUED: "In Warteschlange",
  RESEARCHING: "Recherche läuft …",
  DRAFTING: "Entwurf wird geschrieben …",
  FACTCHECKING: "Faktencheck läuft …",
  DRAFT_READY: "Entwurf fertig",
  FAILED: "Fehlgeschlagen",
};

export const isBusy = (status: string) => ["UPLOADED", "ANALYZING", "QUEUED", "RESEARCHING", "DRAFTING", "FACTCHECKING"].includes(status);

export interface WpPrepare {
  categories: { id: number; name: string; parent: number; count: number }[];
  suggested: number[];
  newSuggestions: string[];
  suggestionError?: string;
  tags: string[];
  existing: { wpPostId: number; editUrl: string | null; link: string | null } | null;
}

export interface WpPublishResult {
  wpPostId: number;
  editUrl: string;
  link: string;
  updated: boolean;
  seo: { status: "set" | "manual" | "no_plugin"; message: string };
  image: { status: "set" | "none" | "failed"; message: string };
}

export interface WpTestResult {
  ok: boolean;
  user: string;
  canPublish: boolean;
  rankMath: boolean;
  categories: number;
}
