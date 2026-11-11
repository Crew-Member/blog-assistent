"""Inhalt des Nutzungsleitfadens, Teil 1: Deckblatt, Inhaltsverzeichnis, Kapitel 1 bis 6."""
from leitfaden_lib import *  # noqa: F401,F403
from leitfaden_lib import NextPageTemplate, make_toc, mono, story

# ---------------------------------------------------------------- Deckblatt und Inhaltsverzeichnis
story.append(NextPageTemplate("main"))
page_break()
story.append(P("Inhalt", H1))
story.append(make_toc())
page_break()

# ---------------------------------------------------------------- 1
h1("1. Überblick")
para("<b>Wozu dient der Blog-Assistent?</b> Er erstellt Blogbeiträge weitgehend automatisch: von der Themenfindung über die KI-gestützte Recherche im Netz, das Schreiben und die Faktenprüfung bis zur <b>Übergabe an die angebundenen Websites</b> (derzeit kirmse.eu und kdsb.gmbh). Dort legt das Tool die Beiträge <b>ausschließlich als Entwurf</b> an; es veröffentlicht nie selbst. Du lieferst Anlass und Unterlagen, steuerst die Auswahl, prüfst den Entwurf und veröffentlichst ihn selbst in WordPress. Die Beiträge entstehen im Stil und mit den Vorgaben der jeweiligen Website; auch bestehende Beiträge lassen sich mit KI aktualisieren und suchmaschinenfreundlicher machen.")
para(f"Das Werkzeug läuft auf deinem Windows-PC und wird im Browser bedient. Damit alles vollständig funktioniert, braucht es in der Datei <b>.env</b> mindestens Anmeldepasswort, Sitzungsschlüssel und den Claude-Schlüssel; für KI-Bilder kommt ein Bildanbieter-Schlüssel dazu, für die Search Console eine Schlüsseldatei im Ordner {mono('secrets')} (Details in Abschnitt 2.3, die Schlüssel selbst erzeugst du nach Anhang B). Es unterstützt dich bei drei Aufgaben:")
bullets([
    "<b>Neue Beiträge:</b> Du lädst Urteile, Mails oder PDFs hoch. Die KI schlägt Themen vor, recherchiert im Netz, schreibt einen Entwurf, prüft die Fakten und legt auf Wunsch einen Entwurf in WordPress an.",
    "<b>Bestehende Beiträge überarbeiten:</b> Die KI aktualisiert veröffentlichte Beiträge, nutzt dafür Suchdaten aus der Google Search Console und findet Beiträge, bei denen sich eine Überarbeitung besonders lohnt.",
    "<b>Themen finden:</b> Der Themen-Scout sucht regelmäßig nach aktuell gefragten Themen aus deinem Portfolio und zeigt, wonach auf deinen Websites tatsächlich gesucht wird.",
])
h2("1.1 Der Weg eines Beitrags")
table(["Schritt", "Was passiert", "Wo"], [
    ["1  Upload", "Du lädst Unterlagen hoch (Urteil, Mail, PDF, Word, Bild).", "Uploads &amp; Beiträge"],
    ["2  Themen", "Die KI schlägt bis zu sechs Themen vor. Du wählst eines aus („Beitrag erstellen“).", "Upload-Seite"],
    ["3  Recherche", "Websuche mit Primärquellen, bei Bedarf Vergleich mit den Top-Ergebnissen bei Google.", "automatisch"],
    ["4  Entwurf", "Text, Titel, Meta-Description, Slug, Auszug, Fokus-Keyword, Quellen. Der Disclaimer und der feste Schlussabsatz kommen aus deinen Einstellungen.", "automatisch"],
    ["5  Faktencheck", "Ein zweiter KI-Durchlauf prüft jede Tatsache gegen Recherche und Originalunterlagen. Aktenzeichen, Normen und Daten prüft zusätzlich der Programmcode.", "automatisch"],
    ["6  Durchsicht", "Du liest, korrigierst, prüfst SEO, wählst das Bild.", "Beitragsseite (Reiter)"],
    ["7  WordPress", "Senden als Entwurf, Kategorien und Hauptkategorie wählen. Veröffentlichen machst du selbst in WordPress.", "Reiter WordPress"],
], [2.9, 10.3, 3.2])
box("Wichtig", "Das Tool veröffentlicht nie von selbst. Es legt Entwürfe an. Ein veröffentlichter Beitrag wird nur dann verändert, wenn du bei einer Überarbeitung ausdrücklich „aktualisieren“ wählst und bestätigst.", "warn")
h2("1.2 Die Menüpunkte")
shot("home.png", 14.4, "Abb. 1: Startseite – Unterlagen hochladen, Beiträge und Uploads als einklappbare Bereiche (Platzhalterdaten).")
table(["Menüpunkt", "Wofür"], [
    ["Uploads &amp; Beiträge", "Startseite: Unterlagen hochladen, Liste der Beiträge und Uploads (einklappbar)."],
    ["Überarbeiten", "Bestehende Beiträge aktualisieren, SEO-Potenziale, Rückwärts-Verlinkung, Aktualisierungsradar."],
    ["Themenideen", "Themen-Scout: aktuell gefragte Themen aus deinem Portfolio; eigene Themen oder Stichworte vorgeben (gezielte Suche) oder als Idee merken."],
    ["Bildstudio", "Beliebige Fotos im Bildstil einer Website umgestalten."],
    ["Kosten", "Übersicht der KI-Kosten je Schritt, Website und Beitrag."],
    ["Websites", "Einstellungen je Website: Stil, Schlussabsatz, Bilder, WordPress, Search Console."],
], [4.2, 12.2])
page_break()

# ---------------------------------------------------------------- 2
h1("2. Erste Schritte")
h2("2.1 Starten und Beenden")
steps([
    "Docker Desktop muss laufen (Symbol in der Taskleiste). Es stellt die Datenbank bereit.",
    "<b>start.cmd</b> doppelklicken. Die Datei holt Updates, prüft die Einstellungen, startet Datenbank, API und Oberfläche, legt eine tägliche Sicherung an und öffnet den Browser.",
    "Beim ersten Start wird die Datei <b>.env</b> angelegt und im Editor geöffnet. Dort trägst du ein, was in Abschnitt 2.3 steht.",
    "Beenden mit <b>stop.cmd</b>. Deine Daten bleiben erhalten.",
])
box("Tipp", "Nach einem Update (neue Funktionen) startest du einfach <b>start.cmd</b> erneut. Danach im Browser mit Strg+F5 neu laden, damit die neue Oberfläche erscheint.")
h2("2.2 Anmeldung")
para(f"Die Anmeldeseite fragt nur nach einem Passwort, einen Benutzernamen gibt es nicht. Das Passwort steht in der Datei <b>.env</b> im Programmordner in der Zeile {mono('ADMIN_PASSWORD=')}. Wenn du es vergessen hast, trägst du dort ein neues ein (mindestens 8 Zeichen) und startest <b>start.cmd</b> neu.")
box("Sicherheit", "Gib dein Passwort und die Schlüssel aus der <b>.env</b> niemals weiter, auch nicht in Chats. Die Datei bleibt ausschließlich auf deinem PC.", "warn")
h2("2.3 Einstellungen in der .env")
para(f"<b>Wo liegt die .env?</b> Im <b>Programmordner</b> des Blog-Assistenten, direkt neben {mono('start.cmd')}, {mono('stop.cmd')}, {mono('backup.cmd')} und {mono('package.json')}. Das ist der Hauptordner, nicht einer der Unterordner wie {mono('secrets')}, {mono('packages')} oder {mono('data')}. Die Datei heißt nur {mono('.env')} (ohne Namen davor). Im Explorer wird sie erst sichtbar, wenn du unter Ansicht → Anzeigen die „Ausgeblendeten Elemente“ einschaltest. Öffnen: Rechtsklick → „Öffnen mit“ → Editor. Beim allerersten Start legt <b>start.cmd</b> sie selbst an und öffnet sie.")
para(f"Als Vorlage dient die Datei {mono('.env.example')}; kopiere sie nach {mono('.env')} und trage die Werte ein. Pro Zeile steht ein Eintrag in der Form {mono('NAME=Wert')} (ohne Leerzeichen um das Gleichheitszeichen, ohne Anführungszeichen). Nach jeder Änderung <b>start.cmd</b> neu ausführen. Wie du die Schlüssel für die KI und die Bilder erzeugst, steht in Anhang B.")
h3("Damit das Tool grundsätzlich funktioniert (Pflicht)")
table(["Eintrag", "Bedeutung"], [
    ["ADMIN_PASSWORD", "Anmeldepasswort der Oberfläche (mindestens 8 Zeichen). Den Platzhalter „bitte-aendern“ unbedingt ersetzen."],
    ["SESSION_SECRET", "Langer Zufallswert (mindestens 32 Zeichen). Er sichert die Anmeldung und verschlüsselt die gespeicherten WordPress-Passwörter. Wird er geändert, müssen die WordPress-Passwörter neu eingegeben werden."],
    ["AI_PROVIDER", f"{mono('claude')} für den Echtbetrieb. {mono('fake')} liefert nur Platzhaltertexte zum Ausprobieren der Oberfläche."],
    ["ANTHROPIC_API_KEY", "Schlüssel der Claude-API (aus der Anthropic Console, siehe Anhang B.1). Ohne ihn entstehen keine Beiträge."],
], [5.0, 11.4])
h3("Damit alle Funktionen vollständig arbeiten")
table(["Funktion", "Eintrag bzw. Voraussetzung"], [
    ["KI-Bilder erzeugen, Bildstudio", f"{mono('IMAGE_PROVIDER=openai')} und {mono('IMAGE_API_KEY')} (Schlüssel des OpenAI-Kontos, siehe Anhang B.2). Das Bildstudio braucht zwingend openai. Alternativ {mono('supermachine')} (nur Bilder zu Beiträgen, Schlüssel beginnt mit sk-). Mit {mono('none')} gibt es nur Bildvorschläge und Uploads. Das OpenAI-Bildmodell wählt das Tool selbst (Standard {mono('gpt-image-2')}); das abgeschaltete {mono('gpt-image-1')} wird automatisch ersetzt. Ein eigenes Modell trägst du bei {mono('IMAGE_MODEL')} ein."],
    ["Search Console (Themenideen, Überarbeiten, SEO-Potenziale)", f"Kein Eintrag nötig: Die JSON-Datei des Dienstkontos liegt im Ordner {mono('secrets')} und wird automatisch gefunden. Nur bei anderem Speicherort {mono('GSC_KEY_FILE')} setzen. Die Property trägst du bei der Website ein (Abschnitt 9)."],
    ["Senden an WordPress", "Kein Eintrag in der .env: Benutzername und Anwendungspasswort trägst du bei der jeweiligen Website unter „Websites“ ein (Abschnitt 3.6)."],
    ["Korrekte Kosten in der Übersicht", f"{mono('IMAGE_COST_USD')} (Kosten je Bild in US-Dollar), bei Bedarf die Preise {mono('AI_PRICE_*')} mit der aktuellen Preisliste abgleichen. Nur Schätzung."],
], [5.0, 11.4])
h3("Optional (Kosten, Feintuning, Sicherung)")
table(["Eintrag", "Bedeutung"], [
    ["AI_MODEL_LIGHT, AI_EFFORT_LIGHT", f"Günstigeres Modell für einfache Schritte (z. B. {mono('claude-sonnet-5-5')}) und niedrige Denktiefe. Senkt die Kosten; Preise dazu in {mono('AI_PRICE_LIGHT_*')}."],
    ["AI_MODEL, AI_EFFORT", "Hauptmodell und Denktiefe für Entwurf und Faktencheck. Normalerweise nicht ändern."],
    ["RESEARCH_MAX_SEARCHES", "Wie viele Websuchen die Recherche höchstens macht (Standard 8; weniger = günstiger)."],
    ["ANTHROPIC_WORKSPACE_ID", "Nur nötig, wenn die API meldet „API key is not scoped to a workspace“."],
    ["IMAGE_MODEL, IMAGE_QUALITY, IMAGE_PROMPT_LANGUAGE", "Bildmodell, Qualität (OpenAI: low/medium/high; höher kostet mehr) und Sprache der Bild-Prompts (de oder en)."],
    ["BACKUP_DIR", "Zielordner der Sicherungen, besser ein ohnehin gesicherter Ordner (z. B. OneDrive)."],
], [6.2, 10.2])
box("Nicht ändern", "DATABASE_URL, STORAGE_DIR, PORT und HOST setzt die Docker-Umgebung des Tools selbst passend. Dort nichts anpassen, solange start.cmd funktioniert.")
h2("2.4 Sicherung und Wiederherstellung")
bullets([
    "<b>start.cmd</b> sichert einmal pro Tag Datenbank und Bilder. Die letzten 14 Datenbank-Sicherungen bleiben.",
    "<b>backup.cmd</b> (Doppelklick) sichert sofort.",
    f"Standardziel ist der Ordner {mono('backups')} im Programmordner. Besser ist ein Ordner, der ohnehin gesichert wird (Eintrag {mono('BACKUP_DIR')}).",
    "<b>restore.cmd</b> stellt eine Sicherung wieder her (nach Rückfrage; überschreibt die aktuelle Datenbank).",
    "Die <b>.env</b> ist nicht Teil der Sicherung. Bewahre sie getrennt auf, sonst ist das gespeicherte WordPress-Passwort nach einem Neuaufbau nicht mehr lesbar.",
])
page_break()

# ---------------------------------------------------------------- 3
h1("3. Websites einrichten")
para("Unter <b>Websites</b> legst du für kirmse.eu und kdsb.gmbh fest, wie die Beiträge klingen und aufgebaut sind. Die Maske ist in einklappbare Abschnitte gegliedert. Alles, was du hier einträgst, gilt für jeden künftigen Beitrag der Website.")
shot("sites-edit.png", 14.4, "Abb. 2: Website bearbeiten – die Maske ist in sechs einklappbare Abschnitte gegliedert.")
h2("3.1 Grunddaten")
bullets([
    "<b>Name, Adresse (https://…), Sprache.</b> Die Adresse braucht das Tool für Importe, interne Links, Themen-Scout und Überarbeitungen.",
    "<b>Zielgruppe:</b> Wer liest die Beiträge? Beispiel: „Geschäftsleiter und Entscheidungsträger in KMU“. Die KI richtet Themenwahl und Nutzen daran aus.",
])
h2("3.2 Schreibstil und Beitragsaufbau")
bullets([
    "<b>Tonalität:</b> kurze Beschreibung (z. B. „sachlich, präzise, Sie-Ansprache“).",
    "<b>Stilleitfaden / Beispiele:</b> Ausführliche Regeln für Ton, Ansprache, Gliederung und Länge. Er hat Vorrang vor den allgemeinen Vorgaben des Tools. Siehe auch Abschnitt 3.7.",
    "<b>Stilvorlagen:</b> Du kannst vorhandene Beiträge aus WordPress importieren oder einfügen. „Stil ableiten“ schlägt daraus Tonalität und Leitfaden vor.",
    "<b>Kurzfassung „Das Wichtigste in Kürze“:</b> 3 bis 4 knappe Punkte direkt nach dem Einstieg (Standard: an).",
    "<b>Abschnitt „Häufige Fragen“:</b> 3 bis 4 Leserfragen mit kurzen Antworten (Standard: an).",
    "<b>Wettbewerbsvergleich:</b> Vor dem Schreiben werden die Top-Ergebnisse zum Suchbegriff ausgewertet (Zielumfang, Gliederung). Kostet eine zusätzliche Websuche je Beitrag.",
])
h2("3.3 Schlussabsatz, Links und Disclaimer")
bullets([
    "<b>Disclaimer:</b> Rechtshinweis, den das System unter jeden Beitrag setzt (nicht die KI). Er darf Links und einfache Hervorhebungen enthalten. Davor steht automatisch die Zeile „Stand: …“.",
    f"<b>Fester Schlussabsatz:</b> Ein Absatz (HTML mit {mono('&lt;a&gt;, &lt;strong&gt;, &lt;em&gt;')}), der in jedem Beitrag vor dem Disclaimer steht, zum Beispiel die Aufforderung zur Kontaktaufnahme.",
    f"<b>Zielseiten je Hauptkategorie:</b> Der Schlussabsatz kann die Platzhalter {mono('{{url}}')} und {mono('{{bereich}}')} enthalten. Pro Zeile steht dann „Kategorie | Adresse | Linktext“, dazu eine Zeile „Standard“. Beim Senden an WordPress wird der Link gegen die Seite der gewählten Hauptkategorie getauscht.",
    "<b>Bevorzugte interne Links:</b> Seiten (z. B. Leistungsseiten), die die KI verlinken soll, wo es passt. Eine Zeile je Seite: „Titel | Adresse“.",
])
para("Beispiel für Schlussabsatz und Zielseiten:")
code_block('Fester Schlussabsatz:\n<p>Für die Beurteilung Ihres konkreten Falls sprechen Sie uns gern an.\nWeitere Themen finden Sie hier: <a href="{{url}}">{{bereich}}</a></p>\n\nZielseiten:\nStandard | https://kirmse.eu/blog/ | Alle Beiträge im Blog\nArbeitsrecht | https://kirmse.eu/arbeitsrecht/ | Alle Beiträge zum Arbeitsrecht\nDatenschutzrecht | https://kirmse.eu/datenschutzrecht/ | Alle Beiträge zum Datenschutzrecht')
box("Häufiger Fehler", "Gehört ein Satz mit Link in den Schlussabsatz, schreibe ihn <b>nicht</b> in das Disclaimer-Feld. Der Disclaimer erscheint kursiv in der Fußzeile; der Schlussabsatz steht davor und kann je nach Hauptkategorie wechseln.", "warn")
h2("3.4 Bilder")
bullets([
    "<b>Bildstil für Beitragsbilder:</b> Allgemeine Vorgaben für jeden KI-Bildvorschlag: Foto oder Illustration, Farbwelt, Motivwelt, Perspektive, was vermieden werden soll. Gilt verbindlich, außer bei den festen Regeln (keine Schrift, keine Logos, keine realen Personen).",
    "<b>KI-Bilder kennzeichnen:</b> Bildunterschrift „Bild: KI-generiert“, Vermerk in der Bilddatei und sichtbarer Hinweis im Beitrag. Der Wortlaut des Hinweises lässt sich ändern.",
])
h2("3.5 Themen und Suchdaten")
bullets([
    "<b>Themenportfolio:</b> Deine Rechtsgebiete und Schwerpunkte, eine Zeile je Thema. Der Themen-Scout liest zusätzlich die Kategorien der Website.",
    f"<b>Search-Console-Property:</b> Name der Property genau wie in der Search Console, z. B. {mono('https://kirmse.eu/')} (mit Schrägstrich am Ende) oder bei einer Domain-Property {mono('kdsb.gmbh')}. Das Tool ergänzt bei Domain-Properties das Präfix selbst.",
])
h2("3.6 WordPress-Zugang")
steps([
    "In WordPress: Benutzer → Profil → <b>Anwendungspasswörter</b> → neues Passwort erzeugen (wird nur einmal angezeigt).",
    "Im Tool: Adresse (https://…), WordPress-Benutzername und Anwendungspasswort eintragen, speichern, <b>„Verbindung testen“</b>.",
    "Der Benutzer braucht mindestens die Rolle Redakteur (für Kategorien und Mediathek). Das Passwort wird verschlüsselt gespeichert.",
])
box("Elementor", "Die Website kirmse.eu nutzt Elementor. Damit die REST-Antworten sauber bleiben, muss unter Elementor → Einstellungen → Erweitert die <b>CSS-Druckmethode</b> auf „Externe Datei“ stehen. Das ist bei dir bereits so eingestellt.")
h2("3.7 Der Stilleitfaden in der Praxis")
para("Ein guter Leitfaden enthält sechs Teile: Zielgruppe, Ton und Ansprache, Genauigkeitsregeln (Aktenzeichen exakt, Trennung von Urteil und Einschätzung), Aufbau (Reihenfolge der Abschnitte, Überschriften mit Thema, Länge), Regeln für Quellen und Links, und eine Liste dessen, was vermieden werden soll (Floskeln, absolute Aussagen, Rechtsberatung im Einzelfall). Die fertigen Fassungen für kirmse.eu und kdsb.gmbh hast du gesondert erhalten. Passe sie an, wenn dir ein wiederkehrender Fehler in den Entwürfen auffällt: Eine Zeile im Leitfaden wirkt bei allen künftigen Beiträgen.")
page_break()

# ---------------------------------------------------------------- 4
h1("4. Einen neuen Beitrag erstellen")
h2("4.1 Unterlagen hochladen")
steps([
    "Menü <b>Uploads &amp; Beiträge</b>, Bereich „Unterlagen hochladen“.",
    "Website wählen, Dateien hineinziehen oder anklicken. Erlaubt: PDF, Mails (.eml, .msg), Word (.docx), Text/Markdown/HTML, Bilder. Bis zu 25 MB je Datei.",
    "Optional einen Hinweis zur Aufgabe eintragen (z. B. „Schwerpunkt auf Folgen für Arbeitgeber“).",
    "<b>„Hochladen &amp; Themen vorschlagen lassen“</b>. Nach kurzer Zeit erscheinen bis zu sechs Themenvorschläge.",
])
para("Aus Mails werden Betreff, Absender, Datum und Text gelesen; PDF-, Word- und Textanhänge (höchstens fünf) kommen automatisch als eigene Unterlagen dazu. Logos und HTML-Anhänge werden nicht übernommen.")
h3("Original-Urteil per Link")
para("Statt einer Datei (oder zusätzlich) kannst du im Feld <b>Hinweis zur Aufgabe oder Link zum Original</b> die Adresse des Urteils eintragen, z. B. von der Website des Gerichts. Das Tool ruft den Link bei der Analyse <b>selbst ab</b>, speichert den Text als Unterlage („Link: …“) und leitet Thema und Eckdaten daraus ab. Ein Upload nur mit Link ist möglich. Der <b>Entwurf</b> erhält die Originalunterlagen (Urteil, Mail, PDF) und orientiert sich <b>hauptsächlich an deren Wortlaut</b>; die Recherche ergänzt nur Einordnung und Folgen. Der Faktencheck prüft den Text gegen dasselbe Original.")
box("Wenn ein Link nicht abrufbar ist", "Manche Seiten sperren automatische Abrufe, brauchen eine Anmeldung (Bezahlportale wie beck-online oder juris) oder zeigen den Text erst per JavaScript. Dann steht nach der Analyse auf der Upload-Seite ein Hinweis „Nicht abrufbar: …“ (bei reinem Link-Upload ein Fehler). Lade in diesem Fall das <b>Urteil als PDF</b> hoch und starte die Analyse erneut („Erneut versuchen“). Bis dahin stützt sich der Beitrag nur auf die übrigen Unterlagen.", "warn")
h2("4.2 Thema wählen und Beitrag erstellen")
para("Jeder Vorschlag zeigt Titel, Blickwinkel, Zusammenfassung, Eckdaten und Suchbegriffe. Mit <b>„Beitrag erstellen“</b> startest du den Beitrag. Das dauert einige Minuten (Recherche, Entwurf, Faktencheck). Die Seite aktualisiert sich selbst; du kannst solange etwas anderes tun.")
h2("4.3 Die Beitragsseite mit Reitern")
para("Sobald der Entwurf fertig ist, öffnet sich die Beitragsseite mit fünf Reitern. Die Leiste bleibt beim Scrollen oben stehen. Jeder Reiter zeigt einen Status. Deine Eingaben bleiben beim Wechsel zwischen den Reitern erhalten.")
table(["Reiter", "Inhalt", "Status in der Leiste"], [
    ["Prüfung", "Ergebnis des Faktenchecks, nicht belegte Aussagen („bitte prüfen“), Quellen, Recherchenotizen. Bei Überarbeitungen steht hier die Änderungsliste.", "ok / offen / „3 prüfen“"],
    ["Text", "„Mit KI nachschärfen“, Titel, Slug, Fokus-Keyword, Meta-Description, Auszug, Inhalt (HTML), daneben die Vorschau.", "„ungespeichert“"],
    ["SEO", "SEO-Prüfung mit Keyword-Dichte, Vergleich mit den Top-Ergebnissen, weitere Keywords.", "z. B. 9/11"],
    ["Bild", "Bildvorschlag, Prompt, Erzeugen, Upload, Alt-Text, Bildunterschrift.", "ok / fehlt"],
    ["WordPress", "Kategorien, Hauptkategorie, Schlagwörter, Senden oder Aktualisieren.", "offen / gesendet"],
], [2.6, 10.0, 3.8])
shot("t-text.png", 13.0, "Abb. 3: Reiter „Text“ – Bearbeiten links, Vorschau rechts (Platzhalterdaten).")
h3("Reiter Prüfung")
bullets([
    "<b>Faktencheck:</b> Status „bestanden“, „korrigiert“, „bitte prüfen“ oder „nicht durchgeführt“. Beanstandete Aussagen sind entfernt oder entschärft und im Protokoll aufgeführt.",
    "<b>Belegprüfung im Code:</b> Aktenzeichen, Normen und Daten im Text müssen in Recherche oder Unterlagen vorkommen. Fehlt etwas, steht es unter „Offen – bitte prüfen“. Prüfe diese Stellen selbst.",
    "<b>Primärquellen:</b> Das Tool ruft verlinkte amtliche Seiten selbst ab (Gerichte, Gesetze im Internet, EUR-Lex). Wie viele erreichbar waren, steht im Faktencheck.",
])
box("Grenzen", "Der Faktencheck verringert das Risiko falscher Angaben, ersetzt aber nicht deine fachliche Prüfung vor der Veröffentlichung. Er kennt nur, was in den Belegen steht.", "warn")
h3("Reiter Text")
bullets([
    "<b>Mit KI nachschärfen:</b> Du gibst eine Anweisung („Einstieg griffiger“, „kürzer fassen“, „Handlungsempfehlungen als Checkliste“). Die KI ändert nur den Text, ohne neue Fakten und ohne neue Links. Das Ergebnis lässt sich rückgängig machen.",
    "<b>Titelvorschläge:</b> Fünf Alternativen mit Länge und Hinweis, ob das Fokus-Keyword enthalten ist.",
    "<b>Speichern:</b> „Änderungen speichern“ nicht vergessen. Gesendet wird immer der gespeicherte Stand; ein Hinweis erinnert dich daran.",
    "<b>Neu erstellen:</b> Recherche und Text komplett neu; deine manuellen Änderungen gehen dabei verloren.",
])
h3("Reiter SEO")
para("Die Prüfung zeigt, ob Titel- und Meta-Länge stimmen, das Fokus-Keyword in Titel, Meta-Description, Einstieg, einer Zwischenüberschrift und im Slug steht, wie hoch die <b>Keyword-Dichte</b> ist (Ziel etwa 1 bis 1,5 %), ob der Text mindestens 500 Wörter und zwei Zwischenüberschriften hat. Sie ist ein Hilfsmittel, keine Ranking-Garantie.")
shot("t-seo.png", 13.0, "Abb. 4: Reiter „SEO“ – Prüfliste und Vergleich mit den Top-Ergebnissen (Platzhalterdaten).")
h2("4.4 Das Fokus-Keyword")
para("Die KI wählt ein Fokus-Keyword aus 2 bis 4 Wörtern, wie deine Zielgruppe es eintippen würde. Es muss wörtlich vorkommen: im ersten Satz, in mindestens einer Zwischenüberschrift und mit einer Dichte von 1,0 bis 1,5 %. Liegt die Dichte nach dem Schreiben unter 0,9 %, bessert das Tool den Text einmal automatisch nach. Das Ergebnis wird nur übernommen, wenn Links, Überschriften und Umfang gleich bleiben. Das Keyword kannst du im Reiter „Text“ jederzeit ändern.")
h2("4.5 Falsche Website gewählt: Website wechseln")
para("Hast du einen Upload für die falsche Website angelegt, musst du nicht neu beginnen. Oben auf der Beitragsseite (unter der Überschrift) gibt es den einklappbaren Bereich <b>„Falsche Website gewählt? Website wechseln“</b>:")
steps([
    "Bereich aufklappen, die <b>neue Website</b> wählen und auf <b>„Zu … wechseln“</b> klicken.",
    "Der Beitrag wechselt samt Upload (und allen übrigen Beiträgen aus diesem Upload) zur neuen Website. <b>Disclaimer, Schlussabsatz und Datumszeile</b> werden für die neue Website neu gesetzt; die WordPress-Kategorien und die Mediathek-Verknüpfung werden zurückgesetzt.",
    "Der <b>Text bleibt unverändert</b> und ist noch im Stil der bisherigen Website geschrieben. Passe ihn mit der <b>KI-Nachschärfung</b> (Reiter Text) an, z. B. „Passe Ansprache, Ton und Stil an die neue Website an“. Bildvorschlag und Bildstil bei Bedarf im Reiter <b>Bild</b> neu erstellen.",
])
box("Grenzen", "Der Wechsel geht nur, solange <b>kein Beitrag aus dem Upload an WordPress gesendet</b>, überarbeitet oder gerade in Arbeit ist. Überarbeitungen bestehender Beiträge gehören immer zur Website des Originals. Wurde der Schlussabsatz im Text von Hand geändert, bleibt er stehen und das Tool weist darauf hin. Ungespeicherte Änderungen im Reiter Text vorher speichern.", "warn")
page_break()

# ---------------------------------------------------------------- 5
h1("5. Bilder")
h2("5.1 Beitragsbild mit KI")
steps([
    "Reiter <b>Bild</b>. „Bildvorschlag: Illustration“ oder „Bildvorschlag: Foto“ wählen.",
    "Die KI beschreibt zuerst den zentralen Begriff des Beitrags (z. B. „Schadenersatz in Geld“) und wählt dazu ein passendes Motiv. Sie schreibt den Bild-Prompt, den Alt-Text und die Bildunterschrift. Der Bildstil der Website gilt verbindlich.",
    "Den Prompt kannst du ändern. Mit „Bild erzeugen“ erstellt der Bildanbieter das Bild (bis zu mehreren Minuten).",
    "Gefällt das Bild nicht: neuen Vorschlag erzeugen oder den Prompt anpassen.",
])
bullets([
    "Menschen kommen nur vor, wenn das Thema es verlangt. Sie sind frei erfunden und werden mit wechselnden Merkmalen beschrieben (Alter, Erscheinungsbild, Haare, Kleidung), damit sie nicht immer gleich aussehen.",
    "Bilder enthalten keine Schrift, keine Logos und keine erkennbaren realen Personen.",
    "Ohne Bildanbieter kannst du den Prompt in einem anderen Bilddienst nutzen und das Ergebnis hochladen.",
])
h2("5.2 Eigenes oder lizenzfreies Bild hochladen")
para("Unter „Eigenes oder lizenzfreies Bild hochladen“ lädst du ein Bild ohne KI-Vorschlag hoch (PNG, JPEG, WebP, bis 10 MB). Pflicht: <b>Quelle und Lizenz</b> (z. B. „Eigenes Foto“). Alt-Text (höchstens 125 Zeichen) und Bildunterschrift sind optional, der Alt-Text ist für die Barrierefreiheit aber wichtig. War das Bild KI-generiert (auch aus einem anderen Dienst), setze das Häkchen, damit es richtig gekennzeichnet wird.")
h2("5.3 Kennzeichnung KI-generierter Bilder")
para("Ist das Beitragsbild KI-generiert und die Kennzeichnung bei der Website eingeschaltet, geschieht beim Senden an WordPress dreierlei: Die Bildunterschrift bekommt „Bild: KI-generiert“, die Bilddatei einen Metadaten-Vermerk, und im Beitrag steht vorn ein sichtbarer Hinweis („Beitragsbild: KI-generiert.“). Beiträge ohne KI-Bild bekommen keinen Hinweis. Ob und wie die Kennzeichnung rechtlich nötig ist, klärst du im Einzelfall.")
para("Bei einem selbst hochgeladenen Bild setzt du die Markierung nur beim Hochladen (Kästchen „Das Bild ist KI-generiert“); ein nachträgliches Umschalten gibt es in der Oberfläche bisher nicht. Bei einem schon an WordPress gesendeten Beitrag wirkt die Kennzeichnung erst nach erneutem Senden.")
h2("5.4 Bildstudio: Fotos im Bildstil umgestalten")
steps([
    "Menü <b>Bildstudio</b>, Website wählen. Ihr Bildstil wird angezeigt (er muss unter „Websites“ eingetragen sein).",
    "Foto hineinziehen (PNG, JPEG, WebP, bis 10 MB). Optional einen zusätzlichen Wunsch eintragen (z. B. „Himmel heller“).",
    "Bestätigen, dass keine erkennbaren Personen zu sehen sind oder die Rechte vorliegen.",
    "<b>„Im Bildstil umgestalten“</b>. Das dauert bis zu zwei Minuten. Original und Ergebnis erscheinen nebeneinander.",
    "Ergebnis herunterladen oder direkt als Beitragsbild eines fertigen Beitrags übernehmen.",
])
box("Voraussetzungen und Grenzen", [
    f"Das Bildstudio braucht {mono('IMAGE_PROVIDER=openai')} mit gültigem Schlüssel (Supermachine kann vorhandene Fotos nicht umgestalten).",
    "Das Ergebnis liegt nur im Browser, bis du es herunterlädst oder übernimmst. Es gilt als KI-bearbeitet und ist in der Datei entsprechend vermerkt.",
    "Fotos erkennbarer Personen (Mandanten, Mitarbeitende) nicht umgestalten lassen: Recht am eigenen Bild und Datenschutz.",
], "warn")
h2("5.5 Verkleinerung für das Web")
para("Beim Senden an WordPress wird das Beitragsbild auf höchstens 1600 Pixel Breite verkleinert und als JPEG gespeichert. Das spart meist 80 bis 95 % der Dateigröße und verbessert die Ladezeit. Das Original im Tool bleibt unverändert.")
page_break()

# ---------------------------------------------------------------- 6
h1("6. An WordPress senden")
h2("6.1 Vorbereitung")
bullets([
    "WordPress-Zugang ist eingerichtet und getestet (Abschnitt 3.6).",
    "Der Text ist gespeichert (kein Hinweis „Ungespeicherte Änderungen“).",
    "Das Bild ist gewählt, der Alt-Text ausgefüllt.",
])
h2("6.2 Senden")
steps([
    "Reiter <b>WordPress</b>, „An WordPress senden (als Entwurf)“.",
    "<b>Kategorien:</b> Die KI schlägt passende Kategorien vor (vorausgewählt). Haken setzen oder entfernen. Sie kann bis zu zwei neue vorschlagen, die nur nach deiner Bestätigung angelegt werden.",
    "<b>Hauptkategorie:</b> Sind mehrere Kategorien gewählt, steht neben jeder ein Auswahlfeld „Haupt“. Die Hauptkategorie wird in Rank Math als primäre Kategorie gesetzt, steht an erster Stelle und bestimmt den Link im Schlussabsatz. Wähle das passende <b>Rechtsgebiet</b>, nicht eine Sammelkategorie wie „Rechtsprechung“ oder „News“.",
    "<b>Schlagwörter</b> prüfen, dann „Als Entwurf in WordPress anlegen“.",
    "Ein Link führt in den WordPress-Editor. Dort prüfst du den Entwurf und veröffentlichst selbst.",
])
h2("6.3 Was übertragen wird")
bullets([
    "Titel, Inhalt, Slug, Auszug, Kategorien, Schlagwörter, Beitragsbild mit Alt-Text und Unterschrift.",
    "Rank Math: Meta-Description, Fokus-Keyword und primäre Kategorie. Wenn Rank Math nicht erkannt wird, meldet das Tool es offen. Die Felder trägst du dann im Editor ein.",
    "Der Schlussabsatz mit der Zielseite der Hauptkategorie. Wurde der Absatz im Entwurf von Hand geändert, bleibt er unverändert.",
    "Erneutes Senden aktualisiert denselben Entwurf. Ein bereits veröffentlichter Beitrag wird nie überschrieben.",
])
h2("6.4 Nach dem Senden in WordPress prüfen")
bullets([
    "Hauptkategorie in Rank Math („Als primär festlegen“) kontrollieren.",
    "Link im Schlussabsatz und Hinweis auf das KI-Bild kontrollieren.",
    "Bei Tabellen: Darstellung im Theme prüfen.",
    "Erst dann veröffentlichen oder planen.",
])
page_break()
