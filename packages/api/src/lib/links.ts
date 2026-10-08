/** Zulaessige externe Linkziele: amtliche Stellen, Gerichte, Gesetzes- und Rechtsprechungsdatenbanken, Datenschutzbehoerden. */
const TRUSTED_EXACT = new Set([
  "gesetze-im-internet.de",
  "rechtsprechung-im-internet.de",
  "bundesgerichtshof.de",
  "bundesverfassungsgericht.de",
  "bverfg.de",
  "bverwg.de",
  "bundesarbeitsgericht.de",
  "bundessozialgericht.de",
  "bundesfinanzhof.de",
  "bundespatentgericht.de",
  "bundesanzeiger.de",
  "bgbl.de",
  "recht.bund.de",
  "dejure.org",
  "openjur.de",
  "buzer.de",
  "juris.de",
  "beck.de",
  "beck-online.beck.de",
  "wolterskluwer.de",
  "wolterskluwer.com",
  "wolterskluwer-online.de",
  "jurion.de",
  "justiz.de",
  "curia.europa.eu",
  "eur-lex.europa.eu",
  "hudoc.echr.coe.int",
  "echr.coe.int",
  "bundestag.de",
  "bundesrat.de",
  "bundesregierung.de",
  "datenschutzkonferenz-online.de",
  "datenschutz-berlin.de",
  "datenschutz-hamburg.de",
  "datenschutz-mv.de",
  "datenschutz.rlp.de",
  "datenschutz.bremen.de",
  "datenschutz.saarland.de",
  "datenschutzzentrum.de",
  "datenschutz.hessen.de",
  "lda.bayern.de",
  "ldi.nrw.de",
  "lfd.niedersachsen.de",
  "tlfdi.de",
  "saechsdsb.de",
  "lfdi.brandenburg.de",
  "ldi.sachsen-anhalt.de",
  "baden-wuerttemberg.datenschutz.de",
]);

/** Domain-Endungen, die als amtlich gelten (Bundes-/EU-Behoerden, Justiz der Laender, Gerichte). */
const TRUSTED_SUFFIXES = [".bund.de", ".europa.eu", ".bundesgerichtshof.de", ".justiz.de", ".coe.int"];

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

export function isTrustedSource(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (TRUSTED_EXACT.has(host)) return true;
  if (TRUSTED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  // Landesjustiz: justiz.<land>.de, Gerichtsseiten wie olg-naumburg.de oder lg-berlin.de
  if (/^justiz\.[a-z-]+\.de$/.test(host) || /^(olg|lg|ag|vg|ovg|bag|bgh|bsg|lag|lsg|fg|kg)[-.]/.test(host)) return true;
  return [...TRUSTED_EXACT].some((t) => host.endsWith(`.${t}`));
}

/** Liest die Liste bevorzugter interner Link-Ziele: je Zeile "Titel | https://..." oder nur die Adresse. */
export function parsePreferredLinks(text: string): { title: string; url: string }[] {
  const result: { title: string; url: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split("|").map((p) => p.trim());
    const url = parts.length > 1 ? parts[parts.length - 1]! : parts[0]!;
    const title = parts.length > 1 ? parts.slice(0, -1).join(" | ") : "";
    try {
      const u = new URL(url);
      if (u.protocol === "http:" || u.protocol === "https:") result.push({ title: title || u.pathname.replace(/\/+$/, "").split("/").pop() || u.hostname, url: u.toString() });
    } catch {
      /* Zeile ignorieren */
    }
    if (result.length >= 20) break;
  }
  return result;
}

const COURT_HOSTS = [
  "bundesgerichtshof.de", "bundesarbeitsgericht.de", "bundesverfassungsgericht.de", "bverfg.de", "bverwg.de", "bundessozialgericht.de",
  "bundesfinanzhof.de", "bundespatentgericht.de", "curia.europa.eu", "hudoc.echr.coe.int", "echr.coe.int",
];

/** Website eines Gerichts (Bundesgerichte, EuGH/EGMR, Landesjustiz, Instanzgerichte). */
export function isCourtSource(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return COURT_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) || /^justiz\.[a-z-]+\.de$/.test(host) || /^(olg|lg|ag|vg|ovg|bag|bgh|bsg|lag|lsg|fg|kg)[-.]/.test(host) || host.endsWith(".justiz.de");
}

/** Rangfolge fuer Entscheidungslinks: 0 = Gericht selbst, 1 = amtliche Rechtsprechungsdatenbank, 2 = sonstige vertrauenswuerdige Quelle. */
export function rulingSourceRank(url: string): number {
  if (isCourtSource(url)) return 0;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "rechtsprechung-im-internet.de" || host === "eur-lex.europa.eu") return 1;
  } catch {
    /* ignorieren */
  }
  return 2;
}
