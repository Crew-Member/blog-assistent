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
