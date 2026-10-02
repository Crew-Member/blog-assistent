import { stripHtml } from "./extract.js";
import { slugify } from "./slug.js";

export interface SeoCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface SeoInput {
  title: string;
  slug: string;
  metaDescription: string;
  focusKeyword: string;
  contentHtml: string;
}

const norm = (s: string) => slugify(s, 200).replace(/-/g, " ");

function contains(haystack: string, keyword: string): boolean {
  const h = ` ${norm(haystack)} `;
  const k = norm(keyword);
  return k.length > 0 && h.includes(` ${k}`);
}

/** Einfache, nachvollziehbare SEO-Pruefungen (keine Ranking-Garantie, nur Hygiene). */
export function seoChecks(post: SeoInput): SeoCheck[] {
  const text = stripHtml(post.contentHtml);
  const words = text.split(/\s+/).filter(Boolean);
  const firstWords = words.slice(0, 150).join(" ");
  const kw = post.focusKeyword.trim();
  const checks: SeoCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });

  add("title-length", "Titellänge", post.title.length >= 20 && post.title.length <= 65, `${post.title.length} Zeichen (Ziel: 20–65)`);
  add("meta-length", "Meta-Description-Länge", post.metaDescription.length >= 70 && post.metaDescription.length <= 155, `${post.metaDescription.length} Zeichen (Ziel: 70–155)`);
  if (kw) {
    add("kw-title", "Fokus-Keyword im Titel", contains(post.title, kw), kw);
    add("kw-meta", "Fokus-Keyword in der Meta-Description", contains(post.metaDescription, kw), kw);
    add("kw-intro", "Fokus-Keyword im Einstieg (erste 150 Wörter)", contains(firstWords, kw), kw);
    const tokens = norm(kw).split(" ").filter((t) => t.length > 2);
    add("kw-slug", "Fokus-Keyword im Slug", tokens.length > 0 && tokens.every((t) => post.slug.split("-").includes(t)), post.slug || "(leer)");
  } else {
    add("kw", "Fokus-Keyword gesetzt", false, "kein Keyword hinterlegt");
  }
  add("length", "Textlänge", words.length >= 500, `${words.length} Wörter (Ziel: mindestens 500)`);
  add("headings", "Zwischenüberschriften", (post.contentHtml.match(/<h2[\s>]/g) ?? []).length >= 2, `${(post.contentHtml.match(/<h2[\s>]/g) ?? []).length} × h2 (Ziel: mindestens 2)`);
  return checks;
}
