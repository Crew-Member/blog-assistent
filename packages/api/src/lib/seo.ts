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

const norm = (s: string, max = 200) => slugify(s, max).replace(/-/g, " ");

function contains(haystack: string, keyword: string): boolean {
  const h = ` ${norm(haystack)} `;
  const k = norm(keyword);
  return k.length > 0 && h.includes(` ${k} `);
}

function countOccurrences(text: string, keyword: string): number {
  const k = norm(keyword);
  if (!k) return 0;
  return ` ${norm(text, text.length + 10)} `.split(` ${k} `).length - 1;
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
    const h2s = [...post.contentHtml.matchAll(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/g)].map((m) => stripHtml(m[1] ?? ""));
    add("kw-h2", "Fokus-Keyword in einer Zwischenüberschrift", h2s.some((h) => contains(h, kw)), kw);
    const count = countOccurrences(text, kw);
    add("kw-count", "Fokus-Keyword im Text (mindestens 3×)", count >= 3, `${count}× wörtlich im Text`);
    const kwSlug = slugify(kw, 200);
    add("kw-slug", "Fokus-Keyword im Slug", kwSlug.length > 0 && post.slug.includes(kwSlug), post.slug || "(leer)");
  } else {
    add("kw", "Fokus-Keyword gesetzt", false, "kein Keyword hinterlegt");
  }
  add("slug-length", "Slug-Länge", post.slug.length > 0 && post.slug.length <= 50, `${post.slug.length} Zeichen (Ziel: höchstens 50)`);
  add("length", "Textlänge", words.length >= 500, `${words.length} Wörter (Ziel: mindestens 500)`);
  add("headings", "Zwischenüberschriften", (post.contentHtml.match(/<h2[\s>]/g) ?? []).length >= 2, `${(post.contentHtml.match(/<h2[\s>]/g) ?? []).length} × h2 (Ziel: mindestens 2)`);
  return checks;
}
