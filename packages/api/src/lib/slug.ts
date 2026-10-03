const UMLAUTS: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss", Ä: "ae", Ö: "oe", Ü: "ue" };

/** URL-Slug im WordPress-Stil: Kleinbuchstaben, Umlaute aufgeloest, Bindestriche. */
export function slugify(input: string, maxLength = 70): string {
  const slug = input
    .replace(/[äöüßÄÖÜ]/g, (c) => UMLAUTS[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.slice(0, maxLength).replace(/-+$/, "");
}

/** Slug, der das Fokus-Keyword vollstaendig und zusammenhaengend enthaelt (Rank Math prueft das so); weitere Woerter des Vorschlags folgen. */
export function slugWithKeyword(slug: string, keyword: string, maxLength = 50): string {
  const kw = slugify(keyword, maxLength);
  const base = slugify(slug, 200);
  if (!kw || base.includes(kw)) return slugify(base || kw, maxLength);
  const kwWords = new Set(kw.split("-"));
  const rest = base.split("-").filter((w) => w && !kwWords.has(w));
  return slugify([kw, ...rest].join("-"), maxLength);
}
