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
}

export type SubmissionStatus = "UPLOADED" | "ANALYZING" | "ANALYZED" | "FAILED";
export type PostStatus = "QUEUED" | "RESEARCHING" | "DRAFTING" | "DRAFT_READY" | "FAILED";

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

export interface PostDetail {
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
  researchNotes: string | null;
  site: { id: string; name: string; baseUrl: string };
  topic: { id: string; title: string; submissionId: string };
}

export interface PostListItem {
  id: string;
  status: PostStatus;
  title: string | null;
  error: string | null;
  createdAt: string;
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
  DRAFT_READY: "Entwurf fertig",
  FAILED: "Fehlgeschlagen",
};

export const isBusy = (status: string) => ["UPLOADED", "ANALYZING", "QUEUED", "RESEARCHING", "DRAFTING"].includes(status);
