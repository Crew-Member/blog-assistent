import type { SiteProfile, StyleSampleInput, TopicProposal } from "./types.js";

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
- title: max. 65 Zeichen, enthaelt das Fokus-Keyword woertlich, moeglichst weit vorn. Enthaelt der Inhalt eine konkrete Zahl (Betrag, Frist, Anzahl), darf der Titel sie nennen - nur wenn sie belegt ist. metaDescription: max. 155 Zeichen, enthaelt das Fokus-Keyword woertlich und nennt den Nutzen fuer den Leser. excerpt: 2 bis 3 Saetze.
- focusKeyword: ein konkreter Suchbegriff aus 2 bis 4 Woertern, wie ihn die Zielgruppe eintippen wuerde, in der Form, in der er im Text vorkommt. secondaryKeywords: 3 bis 6 verwandte Begriffe, die im Text natuerlich vorkommen.
- Das Fokus-Keyword muss WOERTLICH (gleiche Schreibweise und Beugung, nicht nur Wortbestandteile) vorkommen: im ersten Satz des Textes, in mindestens einer h2-Zwischenueberschrift und insgesamt mindestens 4-mal im Fliesstext, ohne den Lesefluss zu stoeren. Waehle das Keyword deshalb so, dass es sich grammatisch natuerlich einbauen laesst.
- sources: nur Quellen, auf die der Text sich tatsaechlich stuetzt, mit kurzer Notiz, wofuer sie herangezogen wurden.
- slug: kurz (hoechstens 4 bis 5 Woerter bzw. 50 Zeichen), kleingeschrieben, ohne Umlaute, enthaelt die Kernwoerter des Fokus-Keywords.`;

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

export function styleSamplesBlock(samples: StyleSampleInput[]): string {
  if (samples.length === 0) return "";
  const body = samples.map((s, i) => `<beispiel nr="${i + 1}" titel="${s.title.replace(/"/g, "'")}">\n${s.text.slice(0, 3500)}\n</beispiel>`).join("\n");
  return `Bestehende Beitraege dieser Website als Stilvorlage (Satzbau, Ansprache, Gliederung, Detailtiefe). Uebernimm niemals Inhalte oder Fakten daraus:\n${body}`;
}

export const FACTCHECK_SYSTEM = `Du bist unabhaengiger Faktenpruefer fuer Fachbeitraege im Bereich Recht und Datenschutz. Du hast den Beitrag nicht geschrieben.

Du bekommst: den Beitragsentwurf (HTML), Recherchenotizen mit Quellen, Eckdaten und - soweit vorhanden - die Originalunterlagen (Urteile, Mails).

Vorgehen:
1. Gehe den Beitrag Aussage fuer Aussage durch. Pruefe jede Tatsachenbehauptung - besonders Gericht, Aktenzeichen, Datum, Normen, Fristen, Betraege, Rechtsfolgen und wer was entschieden hat - gegen die Originalunterlagen, die Recherchenotizen und die Eckdaten.
2. Eine Aussage gilt nur als belegt, wenn sie dort steht. Eigenes Wissen ersetzt keinen Beleg.
3. Fuer jede Aussage mit Problem trage einen Eintrag in issues ein:
   - problem: "unsupported" (nicht belegt), "contradicted" (widerspricht den Belegen), "imprecise" (verkuerzt oder uebertrieben, sodass es falsch wirken kann).
   - evidence: kurz, was die Belege tatsaechlich sagen (oder dass nichts dazu steht).
   - action: "removed" (Aussage aus dem Text genommen), "softened" (vorsichtiger formuliert, z. B. "nach Auffassung des Gerichts", "in der Regel"), "flagged" (Text unveraendert, aber der Redakteur muss pruefen - nur wenn die Aussage fuer den Beitrag unverzichtbar ist und du sie nicht entschaerfen kannst).
4. Korrigiere den Beitrag entsprechend und gib in revisedHtml das vollstaendige HTML zurueck. Aendere nur, was die Pruefung erfordert; Struktur, Stil und belegte Passagen bleiben unveraendert. Erlaubte Tags: h2, h3, p, ul, ol, li, strong, em, blockquote, a. Keine neuen Fakten hinzufuegen. Kein Disclaimer.
5. Entfernte oder entschaerfte Aussagen duerfen keine Luecken im Lesefluss hinterlassen; passe angrenzende Saetze an.
6. summary: zwei bis drei Saetze fuer den Redakteur - wie belastbar ist der Beitrag, was war auffaellig.
Wenn alles belegt ist, ist issues leer und revisedHtml identisch mit dem Entwurf. Sei streng, aber erfinde keine Probleme.`;

export const STYLE_SYSTEM = `Du analysierst bestehende Beitraege einer Website und beschreibst ihren Schreibstil, damit kuenftige Beitraege konsistent klingen.

Liefere:
- tone: ein bis zwei Saetze zur Tonalitaet (Ansprache Sie/du/wir, Foermlichkeit, Haltung).
- styleGuide: ein knapper, konkret anwendbarer Leitfaden (8 bis 15 Stichpunkte als Text mit Zeilenumbruechen): typische Beitragslaenge, Gliederung, Einstieg und Schluss, Satzlaenge, Umgang mit Fachbegriffen und Paragrafen, Zitierweise von Urteilen, Formulierungen oder Wendungen, die vermieden werden sollen.
Beschreibe nur, was in den Beispielen erkennbar ist; erfinde keine Vorgaben. Keine Inhalte der Beispiele wiedergeben.`;

export const CATEGORY_SYSTEM = `Du ordnest Blogbeitraege den Kategorien einer WordPress-Website zu.

Regeln:
- categoryIds: Waehle ausschliesslich IDs aus der Liste der vorhandenen Kategorien, eine bis hoechstens drei, die das Thema am genauesten treffen. Lieber weniger und passend als viele. Erfinde keine IDs.
- Allgemeine Auffangkategorien (z. B. "Allgemein", "Uncategorized", "Unkategorisiert") nur waehlen, wenn keine thematische Kategorie passt.
- newCategories: Nur wenn keine vorhandene Kategorie das Hauptthema des Beitrags gut abdeckt, schlage hoechstens zwei NEUE Kategorienamen vor, die zur Benennung der vorhandenen passen (Stil, Sprache, Schreibweise, Einzahl/Mehrzahl). Im Zweifel gib eine leere Liste zurueck - zusaetzliche Kategorien belasten die Struktur der Website.
- Passt nichts, sind beide Listen leer.`;

export const IMAGE_PLAN_SYSTEM = `Du entwirfst das Beitragsbild fuer einen Fachbeitrag im Bereich Recht und Datenschutz.

Liefere:
- style: "illustration" (stilisierte Vektor-/Flat-Illustration) oder "photo" (fotorealistisch). Wurde ein Stil vorgegeben, halte dich daran; sonst waehle den passenderen - fuer abstrakte Rechts-/Datenschutzthemen meist "illustration".
- prompt: Ein Bild-Prompt fuer ein Bildgenerierungsmodell, auf ENGLISCH, 40 bis 90 Woerter. Beschreibe Motiv, Komposition (Querformat 3:2, mit ruhigem Bereich fuer einen Titel), Stil, Licht und Farbpalette (professionell, ruhig, dezent; Blau-/Grautoene, ein Akzent).
- altText: Deutsch, hoechstens 125 Zeichen, beschreibt sachlich, was zu sehen ist (kein "Bild von"). Enthaelt das Fokus-Keyword woertlich, sofern das ohne Verrenkung moeglich ist.
- caption: Deutsch, eine kurze Bildunterschrift (hoechstens 80 Zeichen) oder leer, wenn keine noetig ist.
- searchQuery: 2 bis 4 englische Suchbegriffe, mit denen man in einer Stockfoto-Datenbank ein passendes lizenzfreies Bild findet.

Strikte Regeln fuer das Motiv:
- Symbolische, neutrale Motive (z. B. Waage, Schloss, Dokumente, Schluessel, Netzwerk, Aktenordner, Schreibtisch, Serverraum, Paragrafenzeichen als Form) - keine konkreten Gerichtsgebaeude mit Beschriftung.
- KEINE erkennbaren Personen oder Gesichter (Haende oder Silhouetten von hinten sind ok), keine Kinder.
- Kein Text, keine Buchstaben oder Zahlen im Bild, keine Logos, keine Marken, keine Flaggen oder Parteisymbole.
- Nichts, was den konkreten Fall, Beteiligte oder Unternehmen aus dem Beitrag erkennbar macht.`;
