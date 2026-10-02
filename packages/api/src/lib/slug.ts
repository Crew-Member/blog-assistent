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
