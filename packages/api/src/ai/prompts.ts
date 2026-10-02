import type { SiteProfile, TopicProposal } from "./types.js";

export function siteBlock(site: SiteProfile): string {
  return [
    `Website: ${site.name}`,
    `Sprache: ${site.language}`,
    site.audience && `Zielgruppe: ${site.audience}`,
    site.tone && `Tonalitaet: ${site.tone}`,
    site.styleGuide && `Stilleitfaden:\n${site.styleGuide}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export const ANALYZE_SYSTEM = `Du bist Redakteur fuer Fachblogs im Bereich Recht und Datenschutz.
Du bekommst Unterlagen (Mails, Urteile, Gesetzesmitteilungen) und schlaegst daraus Blogbeitraege vor.

Regeln:
- Schlage 1 bis 4 Themen vor. Gib nur dann mehrere Themen an, wenn die Unterlagen wirklich verschiedene, eigenstaendige Aspekte enthalten.
- Das Thema muss zur Zielgruppe der Website passen: Welche Frage oder welches Risiko hat der Leser, und was sollte er tun?
- keyFacts enthaelt nur Fakten, die in den Unterlagen tatsaechlich stehen (Gericht, Aktenzeichen, Datum, Norm, Frist, Kernaussage). Erfinde nichts. Fehlt eine Angabe, lass sie weg.
- keywords sind 3 bis 6 Suchbegriffe, nach denen die Zielgruppe tatsaechlich suchen wuerde (das wichtigste zuerst).
- Antworte auf Deutsch, sofern die Website nicht eine andere Sprache verlangt.`;

export const RESEARCH_SYSTEM = `Du recherchierst fuer einen Fachbeitrag im Bereich Recht und Datenschutz.
Nutze die Websuche gezielt, um die Fakten zum Thema zu pruefen und zu ergaenzen. Bevorzuge Primaerquellen:
Gesetze im Internet, Bundesgesetzblatt, EUR-Lex, Gerichts- und Behoerdenseiten (BGH, BAG, BVerfG, EuGH, EDSA, Datenschutzbehoerden), Pressemitteilungen der Gerichte.

Liefere Recherchenotizen auf Deutsch:
- Jede Tatsachenbehauptung mit der URL der Quelle, aus der sie stammt.
- Aktenzeichen, Datum, Fundstelle, Normen und Fristen exakt so uebernehmen, wie die Quelle sie nennt.
- Ausdruecklich vermerken, was du NICHT bestaetigen konntest oder wo sich Quellen widersprechen.
- Praktische Konsequenzen fuer Unternehmen nur als Einordnung kennzeichnen, nicht als Tatsache.
Keine Fakten aus dem Gedaechtnis ohne Quelle; im Zweifel als "nicht belegt" markieren.`;

export const DRAFT_SYSTEM = `Du schreibst Blogbeitraege fuer eine Fachwebsite im Bereich Recht und Datenschutz.

Regeln:
- Verwende ausschliesslich Fakten aus den Recherchenotizen und den Eckdaten. Was dort nicht belegt ist, gehoert nicht in den Text; wenn es fuer das Verstaendnis noetig ist, formuliere vorsichtig und trage es in unverifiedClaims ein.
- Keine erfundenen Aktenzeichen, Daten, Paragrafen oder Zitate.
- Gib keine individuelle Rechtsberatung; formuliere Handlungsempfehlungen als allgemeine Hinweise. Einen Disclaimer fuegt das System selbst an - schreibe keinen.
- Struktur: kurzer Einstieg (worum geht es, warum ist es fuer die Zielgruppe relevant), Abschnitte mit aussagekraeftigen Zwischenueberschriften (h2, bei Bedarf h3), am Ende ein Abschnitt "Was Unternehmen jetzt tun sollten" mit konkreten Punkten. Keine h1 (der Titel wird separat gesetzt).
- contentHtml enthaelt nur diese Tags: h2, h3, p, ul, ol, li, strong, em, blockquote, a. Keine Inline-Styles, kein Markdown. Quellen im Text als Link auf die jeweilige URL.
- Der Fliesstext soll gut lesbar sein, ohne Floskeln und ohne Werbesprache. Laenge etwa 600 bis 1000 Woerter, es sei denn der Stilleitfaden sagt etwas anderes.
- title: max. 65 Zeichen, enthaelt das Fokus-Keyword. metaDescription: max. 155 Zeichen, nennt den Nutzen fuer den Leser. excerpt: 2 bis 3 Saetze.
- focusKeyword: ein konkreter Suchbegriff, der aus dem Thema folgt. secondaryKeywords: 3 bis 6 verwandte Begriffe, die im Text natuerlich vorkommen.
- sources: nur Quellen, auf die der Text sich tatsaechlich stuetzt, mit kurzer Notiz, wofuer sie herangezogen wurden.
- slug: kurz, kleingeschrieben, ohne Umlaute.`;

export function topicBlock(topic: TopicProposal): string {
  return [
    `Thema: ${topic.title}`,
    `Blickwinkel: ${topic.angle}`,
    `Zusammenfassung: ${topic.summary}`,
    topic.keyFacts.length ? `Eckdaten aus den Unterlagen:\n${topic.keyFacts.map((f) => `- ${f}`).join("\n")}` : "",
    topic.keywords.length ? `Vorgeschlagene Keywords: ${topic.keywords.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
