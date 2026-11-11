"""Inhalt des Nutzungsleitfadens, Teil 2: Kapitel 7 bis 14 und Anhänge."""
from leitfaden_lib import *  # noqa: F401,F403
from leitfaden_lib import mono, story

# ---------------------------------------------------------------- 7
h1("7. Bestehende Beiträge überarbeiten")
para("Unter <b>Überarbeiten</b> aktualisierst du bereits veröffentlichte Beiträge. Das Original bleibt unverändert, bis du ausdrücklich ersetzt.")
h2("7.1 Beitrag auswählen und überarbeiten")
steps([
    "Website wählen, „Beiträge laden“, optional nach einem Begriff suchen, Beitrag anklicken.",
    "Optional eine Anweisung eingeben (z. B. „Neues BAG-Urteil ergänzen, Einstieg kürzen“). Ohne Anweisung prüft die KI Aktualität, Verständlichkeit und SEO.",
    "<b>„Überarbeitung starten“</b>. Die KI recherchiert (bei Überarbeitungen mit höchstens vier Suchen), schreibt die neue Fassung, prüft Fakten und setzt passende interne Links.",
    "Am fertigen Beitrag steht unter „Prüfung“ die <b>Änderungsliste</b> mit den Änderungen und Gründen.",
])
para("Ist bei der Website eine Search-Console-Property hinterlegt, bekommt die KI die Suchanfragen, über die der Beitrag gefunden wird (mit Einblendungen, Position und Trend). Sie wählt das Fokus-Keyword bevorzugt daraus und deckt wichtige Anfragen im Text ab. Am Beitrag steht, wie viele Suchanfragen berücksichtigt wurden.")
h2("7.2 Übernahme in WordPress")
table(["Situation", "Vorgehen"], [
    ["Normaler Beitrag", "Hauptknopf „Beitrag in WordPress aktualisieren“. Nach Rückfrage wird der veröffentlichte Beitrag überschrieben (Titel, Text, Auszug, SEO-Felder, Beitragsbild). Datum, Adresse, Kategorien, Schlagwörter und Status bleiben. WordPress behält den alten Stand in den Versionen."],
    ["Beitrag mit Seitenbaukasten (Elementor, Divi, WPBakery, Beaver Builder)", "Dort zeigt die Website den Inhalt des Baukastens, nicht den Beitragstext. Das Tool erkennt das und zeigt die Schritte: Text kopieren, Beitrag im Baukasten öffnen, im Textblock einfügen und speichern."],
    ["Original unberührt lassen", "Unter „Weitere Möglichkeiten“ als neuen Entwurf senden (optional mit dem Datum des Originals)."],
], [4.6, 11.8])
box("Elementor", "Bei kirmse.eu sind viele Beiträge mit Elementor gebaut. Hier zählt der kopierte Text im Elementor-Editor. Ein Ersetzen des Beitragstextes über die Schnittstelle ändert die sichtbare Seite meist nicht.")
h2("7.3 SEO-Potenziale")
para("Die Karte <b>SEO-Potenziale</b> (nur mit Search-Console-Property) zeigt, welche Beiträge sich am meisten lohnen. Ein Klick auf „Analyse starten“ wertet die letzten 28 Tage aus. Die Analyse kostet nichts.")
table(["Hinweis", "Bedeutung", "Typische Maßnahme"], [
    ["Kurz vor Seite 1", "Position 7 bis 20 (bei kleinen Websites ab 6) mit relevanten Einblendungen.", "Überarbeiten: Suchanfragen besser abdecken, Titel und Einstieg schärfen."],
    ["Wenig Klicks", "Viele Einblendungen auf den Plätzen 1 bis 10, aber deutlich weniger Klicks als üblich.", "Titel und Meta-Description überarbeiten."],
    ["Rückgang", "Einblendungen oder Klicks sind gegenüber den 28 Tagen davor um mindestens 30 % gefallen.", "Aktualität prüfen und aktualisieren."],
    ["Konkurrenz im eigenen Haus", "Zwei eigene Beiträge erscheinen für dieselbe Suchanfrage, keiner steht vorn.", "Schwerpunkte abgrenzen oder Beiträge zusammenführen."],
], [3.6, 7.0, 5.8])
para("Die Klickzahlen sind grobe Schätzungen. Bei wenig Suchverkehr gelten niedrigere Mindestwerte, und eine Übersicht zeigt die Zahlen je Beitrag. „Überarbeitung starten“ übernimmt eine vorgefüllte Anweisung.")
h2("7.4 Rückwärts-Verlinkung")
para("Wähle einen Beitrag (meist den neuesten) und klappe „Rückwärts-Verlinkung“ auf. Das Tool sucht verwandte ältere Beiträge ohne Link auf diesen Beitrag und liefert je Beitrag einen fertigen Satz mit Link, die Stelle im Text und eine Begründung. Du kopierst den Satz („Satz kopieren“) und fügst ihn im WordPress- oder Elementor-Editor ein. Das Tool ändert dabei nichts selbst. Interne Links von älteren Beiträgen auf neue stärken deren Auffindbarkeit.")
h2("7.5 Aktualisierungsradar")
para("Der Radar (Standard: aus) prüft wöchentlich einige ältere Beiträge (älter als 90 Tage, höchstens fünf je Lauf) auf neue Rechtsprechung und Gesetzesänderungen. Befunde: „aktuell“, „Aktualisierung empfohlen“, „überholt“. Mit „Überarbeitung starten“ übernimmst du die Gründe als Anweisung. Jeder geprüfte Beitrag ist eine Websuche, also Kosten; ein geprüfter Beitrag kommt frühestens nach 180 Tagen wieder dran.")
page_break()

# ---------------------------------------------------------------- 8
h1("8. Themenideen (Themen-Scout)")
para("Der Scout hilft bei der Frage: Worüber soll ich als Nächstes schreiben? Er ist je Website einstellbar und standardmäßig aus.")
h2("8.1 Einrichtung")
steps([
    "Unter Websites das <b>Themenportfolio</b> eintragen (eine Zeile je Rechtsgebiet bzw. Schwerpunkt).",
    "Optional die <b>Search-Console-Property</b> eintragen (Abschnitt 9).",
    "Menü <b>Themenideen</b>, Website wählen, Scout einschalten. „Jetzt nach Themen suchen“ startet sofort einen Lauf (Dauer etwa 1 bis 3 Minuten); sonst läuft er wöchentlich.",
])
h2("8.2 Die Vorschläge")
bullets([
    "Jede Idee zeigt Dringlichkeit, Rechtsgebiet, Suchbegriff, „Warum jetzt“, Nutzen für die Leser und Quellen.",
    "<b>Suchdaten:</b> Passt ein Suchbegriff deiner Website zur Idee, steht eine Zeile mit echten Zahlen („X: 300 Einblendungen in 28 Tagen, +60 %, Position 14“).",
    "<b>Beitrag dazu erstellen</b> startet den Beitrag mit Anlass und Quellen als Ausgangsmaterial.",
    "<b>Als umgesetzt markieren</b> verschiebt die Idee in den Bereich „Umgesetzt“ (auch für Themen, die du außerhalb des Tools geschrieben hast). <b>Ablehnen</b> blendet sie aus; die KI schlägt sie nicht wieder vor.",
    "Bereits behandelte Themen (vorhandene Beiträge, umgesetzte Ideen) lässt der Scout weg.",
])
box("Was der Scout nicht kann", "Er kennt keine allgemeinen Suchvolumina bei Google (Keyword-Planer-Daten hinken ohnehin etwa einen Monat hinterher). „Gefragt“ bedeutet: aktuell, viel besprochen und, mit Search Console, auf deiner eigenen Website nachgefragt. Brandneue Themen tauchen in den Suchdaten oft noch nicht auf; der Scout nimmt sie trotzdem auf.")
h2("8.3 Eigene Themen und gezielte Suche")
para("Du musst nicht auf den Scout warten: Im Feld <b>Eigenes Thema oder Stichworte</b> (oberhalb der Ideenliste) gibst du selbst etwas vor, z. B. „Kündigung im Homeoffice“ oder „Datenschutz bei Bewerbungsfotos“. Danach hast du zwei Möglichkeiten:")
table(["Schaltfläche", "Was passiert", "Kosten"], [
    ["Dazu nach Themen suchen", "Das Tool recherchiert im Netz zu deinen Stichworten und fügt passende, belegte Vorschläge der Liste hinzu (Kennzeichnung „Gezielt gesucht“). Funktioniert auch bei ausgeschaltetem Scout; Dauer etwa 1 bis 3 Minuten. Bestehende Ideen bleiben unverändert.", "wie ein Scout-Lauf (wenige Cent)"],
    ["Nur als Idee merken", "Dein Text wird ohne Suche sofort als Idee gespeichert (Kennzeichnung „Eigener Vorschlag“). Praktisch als Merkliste, z. B. nach einem Mandantengespräch.", "keine"],
], [3.8, 9.6, 3.0])
bullets([
    "Beide Arten von Ideen verhalten sich wie alle anderen: <b>Beitrag dazu erstellen</b>, <b>Als umgesetzt markieren</b> oder <b>Ablehnen</b>.",
    "Der wöchentliche Lauf ersetzt nur seine eigenen alten Vorschläge. <b>Eigene und gezielt gesuchte Ideen bleiben erhalten</b>, bis du sie bearbeitest oder ablehnst.",
    "Passt ein Thema nicht zu einer Rechts- oder Datenschutz-Website oder gibt es keinen belegbaren Anlass, liefert die gezielte Suche lieber wenige oder keine Vorschläge. Bei zeitlosen Themen steht in der Begründung ehrlich, dass es keinen aktuellen Anlass gibt.",
    "Je konkreter die Stichworte, desto treffender die Ergebnisse („Probezeit Kündigung Schriftform“ statt nur „Arbeitsrecht“).",
])
page_break()

# ---------------------------------------------------------------- 9
h1("9. Google Search Console anbinden")
para("Die Search Console liefert die echten Suchanfragen deiner Websites. Das Tool nutzt sie für Themenideen, Überarbeitungen und SEO-Potenziale. Die Einrichtung dauert etwa 15 Minuten.")
h2("9.1 Einmalige Einrichtung bei Google: Schlüsseldatei (JSON) erstellen")
para("Das Tool greift nicht mit deinem persönlichen Google-Login auf die Search Console zu, sondern mit einem eigenen <b>Dienstkonto</b> (eine Art Roboter-Benutzer). Dessen <b>JSON-Schlüsseldatei</b> erzeugst du einmalig in der Google Cloud Console. Du brauchst dafür ein normales Google-Konto; die Nutzung ist für diesen Zweck kostenlos. Die Google-Oberfläche ändert sich gelegentlich; Bezeichnungen können daher leicht abweichen.")
h3("Schritt A: Projekt anlegen")
steps([
    "<b>console.cloud.google.com</b> öffnen und mit deinem Google-Konto anmelden (Nutzungsbedingungen bestätigen, falls gefragt).",
    "Oben links neben dem Google-Cloud-Logo auf die <b>Projektauswahl</b> klicken, dann <b>Neues Projekt</b>. Name z. B. „Blog-Assistent“, „Erstellen“ und anschließend das neue Projekt oben auswählen.",
])
h3("Schritt B: Search Console API aktivieren")
steps([
    "Navigationsmenü (oben links) → <b>APIs und Dienste → Bibliothek</b>.",
    "Im Suchfeld „Google Search Console API“ eingeben, das Ergebnis öffnen und auf <b>Aktivieren</b> klicken. Dieser Schritt wird am häufigsten vergessen; ohne ihn meldet das Tool später „Zugriff verweigert“ oder „API nicht aktiviert“.",
])
h3("Schritt C: Dienstkonto anlegen")
steps([
    "Navigationsmenü (oben links) → <b>IAM und Verwaltung → Dienstkonten</b> → oben <b>Dienstkonto erstellen</b>.",
    "Name z. B. „blog-assistent“ eintragen, <b>Erstellen und fortfahren</b>. Die Felder zu Rollen und Zugriff kannst du leer lassen (<b>Fortfahren</b> bzw. <b>Fertig</b>): Das Konto braucht keine Cloud-Rolle, seine Rechte erhält es später in der Search Console.",
    f"In der Liste steht jetzt das Dienstkonto mit einer <b>E-Mail-Adresse</b>, die auf {mono('.iam.gserviceaccount.com')} endet. Diese Adresse brauchst du in 9.2; am besten kopierst du sie jetzt.",
])
h3("Schritt D: JSON-Schlüssel herunterladen")
steps([
    "In der Liste auf das Dienstkonto klicken, oben auf den Reiter <b>Schlüssel</b>.",
    "<b>Schlüssel hinzufügen → Neuen Schlüssel erstellen</b>, Schlüsseltyp <b>JSON</b> wählen, <b>Erstellen</b>.",
    f"Die Datei wird automatisch heruntergeladen (Name etwa {mono('blog-assistent-123456-abcdef012345.json')}). Google zeigt sie nur dieses eine Mal; geht sie verloren, erstellst du einfach einen neuen Schlüssel.",
    f"Die Datei in den Ordner {mono('secrets')} im Programmordner des Blog-Assistenten legen (Ordner anlegen, falls er fehlt). Der Dateiname ist egal; das Tool findet die Datei selbst, und der Ordner kommt nicht ins Git.",
    "<b>start.cmd</b> neu starten. Im Startfenster steht „Search Console: Schlüssel gefunden (…)“.",
])
box("Sicherheit", "Die JSON-Datei ist wie ein Passwort für das Dienstkonto. Nicht per Mail oder Chat weitergeben und nicht in einen Cloud-Ordner legen, der geteilt ist. Das Dienstkonto kann nur lesen, und nur in Properties, in denen du es ausdrücklich als Nutzer eingetragen hast (9.2). Bei Verdacht auf Missbrauch den Schlüssel in der Cloud Console unter „Schlüssel“ löschen.", "warn")
box("Wenn „Schlüssel erstellen“ gesperrt ist", "Manche Google-Workspace-Organisationen sperren das Erstellen von Dienstkonto-Schlüsseln (Meldung zur Organisationsrichtlinie „iam.disableServiceAccountKeyCreation“). Dann den Schlüssel mit einem privaten Google-Konto erstellen oder den Administrator der Organisation bitten, die Richtlinie für dieses Projekt zu lockern.")
h2("9.2 Pro Website")
steps([
    f"In der <b>Search Console</b> die Property wählen, Einstellungen → Nutzer und Berechtigungen → Nutzer hinzufügen: die E-Mail-Adresse des Dienstkontos (endet auf {mono('.iam.gserviceaccount.com')}) mit der Berechtigung „Eingeschränkt“. Gehört die Property einem anderen Google-Konto, muss dessen Inhaber das tun.",
    f"Im Tool unter Websites die <b>Property</b> eintragen (z. B. {mono('https://kirmse.eu/')}; bei einer Domain-Property {mono('kdsb.gmbh')}).",
    "Unter Themenideen auf <b>„Verbindung prüfen“</b> klicken.",
])
table(["Meldung", "Ursache und Abhilfe"], [
    ["Search Console API nicht aktiviert", "Im Google-Cloud-Projekt die API aktivieren (siehe 9.1, Schritt B)."],
    ["Dienstkonto nicht als Nutzer eingetragen / Property heißt anders", f"Dienstkonto in der richtigen Property eintragen. URL-Property heißt mit Schrägstrich ({mono('https://kirmse.eu/')}), Domain-Property wird als {mono('kdsb.gmbh')} angezeigt und als {mono('sc-domain:kdsb.gmbh')} angesprochen."],
    ["Kein Schlüssel gefunden", f"JSON-Datei in den Ordner {mono('secrets')} legen und neu starten."],
    ["0 Suchbegriffe", "Die Property hat in den letzten 28 Tagen keine Daten oder zu wenig Suchverkehr."],
], [5.4, 11.0])
para("Die Search Console liefert Daten mit etwa drei Tagen Verzug. Zu jedem Lauf steht am Scout die Zeile „Search Console: N Suchbegriffe gelesen … M von K Ideen belegt“.")
page_break()

# ---------------------------------------------------------------- 10
h1("10. Kosten")
para("Jeder KI-Aufruf wird mit Tokens und Websuchen protokolliert. Die Seite <b>Kosten</b> zeigt die Summen je Schritt, Website und Beitrag; am Beitrag steht „Kosten dieses Beitrags“. Die Beträge sind Schätzungen aus den Preisen in der <b>.env</b>. Maßgeblich ist die Rechnung des Anbieters.")
h2("10.1 Was kostet am meisten")
table(["Posten", "Anmerkung"], [
    ["Recherche (Websuchen)", f"Jede Suche kostet; {mono('RESEARCH_MAX_SEARCHES')} begrenzt sie."],
    ["Entwurf und Faktencheck", "Lange Texte mit dem Hauptmodell. Größter Einzelposten. Liegen Originalunterlagen (z. B. ein Urteil) bei, liest der Entwurf sie mit; je nach Länge kostet das einige Cent mehr."],
    ["Wettbewerbsvergleich", "Eine zusätzliche Websuche und Auswertung je Beitrag; je Website abschaltbar."],
    ["Überarbeitungen", "Wie neue Beiträge, aber mit engerer Recherche (höchstens 4 Suchen) und ohne Wettbewerbsvergleich."],
    ["Bilder", "Je Bild nach Anbieter und Qualität; Bildstudio wie ein erzeugtes Bild."],
    ["Themen-Scout, Radar", "Je Lauf eine Websuche mit dem leichten Modell."],
    ["Keyword-Nachbesserung", "Nur bei zu dünnem Text ein zusätzlicher Aufruf."],
], [5.2, 11.2])
h2("10.2 Kosten senken")
bullets([
    f"{mono('AI_MODEL_LIGHT')} setzen: einfache Schritte laufen mit dem günstigeren Modell.",
    f"{mono('RESEARCH_MAX_SEARCHES')} auf 5 setzen (Standard 8).",
    "Wettbewerbsvergleich nur bei Websites einschalten, bei denen er sich lohnt.",
    "Radar und Scout nur einschalten, wenn du die Ergebnisse auch nutzt.",
    "Auf der Seite „Kosten“ nach Schritten sortieren und die größten Posten gezielt prüfen.",
    "Bei beiden Anbietern (Anthropic, OpenAI) ein monatliches Ausgabenlimit setzen (Anhang B).",
])
page_break()

# ---------------------------------------------------------------- 11
h1("11. Qualität, Links und Recht")
h2("11.1 Regeln, die das Tool selbst beachtet")
bullets([
    "<b>Fakten:</b> Nur belegte Aussagen. Aktenzeichen, Normen, Daten und Beträge exakt wie in der Quelle. Unbelegtes wird entfernt, entschärft oder zur Prüfung markiert.",
    "<b>Originalunterlagen haben Vorrang:</b> Liegt ein Urteil vor (Datei oder Link), orientiert sich der Entwurf hauptsächlich an dessen Wortlaut; die Recherche ergänzt nur. Meta-Sätze wie „Das Original-Urteil stand nicht zur Verfügung“ gehören nicht in den Beitragstext.",
    "<b>Zitierte Urteile werden verlinkt</b>, bevorzugt auf die Website des Gerichts. Die Fundstelle steht immer auch im Text.",
    "<b>Normen der DSGVO und des BDSG werden automatisch verlinkt</b> auf dsgvo-online.net, z. B. „Art. 6 Abs. 1 lit. f DSGVO“ auf die Seite zu Art. 6 und „§ 26 BDSG“ auf die Seite zu § 26. Verlinkt wird je Norm nur die erste Fundstelle im Fließtext (nicht in Überschriften). Diese Links zählen nicht gegen die Obergrenze externer Links. Hat die KI eine solche Norm schon anders verlinkt, wird der Link auf dsgvo-online.net umgestellt. Aufzählungen wie „Art. 6, 7 und 9 DSGVO“ werden nicht verlinkt; bereits gespeicherte Beiträge bleiben unverändert, bis du sie nachschärfst. Die Links erscheinen beim Erstellen und nach jeder KI-Nachschärfung; setzt du sie von Hand im Reiter Text, bleiben sie erhalten.",
    "<b>Links:</b> Bevorzugt Primärquellen (Gerichte, Gesetze, Aufsichtsbehörden). Allgemeine Infoportale, Presse und Blogs nur ergänzend. Keine Links auf Wettbewerber. Links auf kostenpflichtige Portale (beck-online, Wolters Kluwer, juris) nur sparsam.",
    "<b>Keine Selbstverlinkung</b> bei Überarbeitungen (kein Link auf den Beitrag, der ersetzt wird).",
    "<b>Disclaimer und Stand-Datum</b> fügt das System an, nicht die KI.",
])
h2("11.2 Was bei dir bleibt")
bullets([
    "Die fachliche Prüfung des Textes vor der Veröffentlichung, besonders bei Aktenzeichen, Beträgen, Fristen und Haftungsaussagen.",
    "Die Entscheidung, ob ein Thema zu deiner Kanzlei bzw. Beratung passt.",
    "Die rechtliche Beurteilung der KI-Kennzeichnung und der Bildrechte im Einzelfall.",
    "Das Veröffentlichen in WordPress.",
])
box("Hinweis zum Teststand", "Das Tool ist automatisiert getestet, viele Teile aber nur mit simulierten Antworten (Bildanbieter, Rank Math, Search Console). Prüfe neue Funktionen deshalb beim ersten Einsatz bewusst und melde Auffälligkeiten.")
page_break()

# ---------------------------------------------------------------- 12
h1("12. Fehlerbehebung")
table(["Beobachtung", "Mögliche Ursache", "Abhilfe"], [
    ["Seite lädt nicht, Anmeldung nicht möglich", "Docker Desktop oder Tool nicht gestartet.", "Docker Desktop starten, start.cmd ausführen."],
    ["start.cmd hängt bei „[4/6] Installiere Abhängigkeiten“", "Netzabfrage oder Virenscanner bremst „npm install“.", "5 Minuten warten; sonst im Programmordner „npm install --loglevel=http“ ausführen und die letzte Zeile ansehen. Neuere Versionen von start.cmd überspringen die Sicherheitsabfrage."],
    ["Passwort vergessen", "–", "In der .env bei ADMIN_PASSWORD ein neues eintragen, neu starten."],
    ["KI antwortet nicht / Fehlermeldung zur KI", "API-Schlüssel falsch, Guthaben leer oder Anfragelimit.", "Schlüssel in der .env prüfen (key-test.cmd), Guthaben beim Anbieter prüfen (Anhang B.1)."],
    ["„WordPress liefert keine gültige REST-Antwort“", "Elementor setzt CSS vor die Antwort.", "Elementor → Einstellungen → Erweitert → CSS-Druckmethode auf „Externe Datei“."],
    ["WordPress lehnt Anfrage ab (HTTP 400) bei Kategorie", "Kategorie existiert bereits.", "Vorhandene Kategorie ankreuzen statt „neu“."],
    ["Beitragsbild wird nicht übertragen", "Benutzer darf keine Dateien hochladen.", "Rolle Autor oder höher, Verbindung testen."],
    ["Links im Disclaimer erscheinen als Text", "Alter Stand oder HTML in einem anderen Feld.", "Tool aktualisieren; Satz mit Link in den Schlussabsatz verschieben."],
    ["Schlussabsatz führt immer auf den Blog", "Hauptkategorie hat keine eigene Zeile oder wurde nicht gewählt.", "Zeile in „Zielseiten je Hauptkategorie“ ergänzen; beim Senden „Haupt“ wählen."],
    ["Alter Text auf der Website nach „Ersetzen“", "Beitrag ist mit Elementor gebaut.", "Text kopieren und im Elementor-Editor einfügen."],
    ["Search Console: kein Zugriff", "Dienstkonto nicht in der Property, API nicht aktiv, Property-Name falsch.", "Abschnitt 9 durchgehen; Meldung nennt die wahrscheinliche Ursache."],
    ["Keyword-Dichte zu niedrig trotz Nachbesserung", "Nachbesserung wurde verworfen (Links oder Überschriften hätten sich geändert).", "Im Reiter Text von Hand ergänzen oder „Mit KI nachschärfen“ nutzen."],
    ["Bildstudio: „kann Fotos nicht umgestalten“", "Bildanbieter ist nicht OpenAI.", "IMAGE_PROVIDER=openai und Schlüssel eintragen."],
    ["Bild wird nicht erzeugt: „Bildmodell nicht (mehr) verfügbar“ oder „model ‚gpt-image-1‘ does not exist“", "OpenAI hat das Bildmodell abgeschaltet (gpt-image-1 ist seit 23.10.2026 abgeschaltet) oder es ist für den Schlüssel nicht freigeschaltet; auf dem Rechner läuft noch der alte Programmstand.", "Tool aktualisieren (start.cmd; mit „git log -1“ im Programmordner den Stand prüfen), ggf. stop.cmd und alte Node-Prozesse beenden. Alternativ in der .env bei IMAGE_MODEL ein aktuelles Modell eintragen, z. B. gpt-image-2, und neu starten."],
    ["Bild passt nicht zum Thema", "Prompt zu allgemein, Bildstil zu eng.", "Neuen Vorschlag erzeugen, Prompt anpassen, Bildstil prüfen."],
    ["Quellen werden nicht abgerufen", "Netzwerk oder Firewall blockiert Gerichtsseiten.", "Faktencheck zeigt „0 von n abgerufen“; Quellen von Hand prüfen."],
    ["Link zum Urteil „nicht abrufbar“", "Seite sperrt automatische Abrufe, verlangt Anmeldung oder lädt den Text per JavaScript.", "Das Urteil als PDF hochladen und die Analyse erneut starten."],
], [4.6, 5.4, 6.4])
page_break()

# ---------------------------------------------------------------- 13
h1("13. Umzug auf einen anderen Rechner")
para("Alle Daten des Blog-Assistenten (Beiträge, Websites, Einstellungen, Bilder) liegen auf deinem PC. Für einen Umzug brauchst du vier Dinge vom alten Rechner: die <b>Sicherung</b> (Datenbank und Bilder), die Datei <b>.env</b>, den Ordner <b>secrets</b> und das Programm selbst.")
h2("13.1 Auf dem alten Rechner")
steps([
    f"<b>start.cmd</b> ausführen (die Datenbank muss laufen) und danach <b>backup.cmd</b> doppelklicken. Es entsteht eine Datei {mono('db-JJJJMMTT-HHMM.dump')} samt Unterordner {mono('uploads')} im Sicherungsordner ({mono('backups')} im Programmordner oder dein {mono('BACKUP_DIR')}).",
    f"Folgendes auf einen USB-Stick oder in einen geschützten Cloud-Ordner kopieren: den <b>Sicherungsordner</b> (Dump und {mono('uploads')}), die Datei <b>.env</b> und den Ordner <b>secrets</b> (Schlüssel der Search Console).",
    "<b>stop.cmd</b> ausführen. Der alte Rechner sollte den Blog-Assistenten danach nicht mehr starten, sonst laufen auf zwei Rechnern Scout und Radar parallel und verursachen doppelte Kosten.",
])
box("Wichtig", f"Die <b>.env</b> ist nicht Teil der Sicherung. Sie enthält den {mono('SESSION_SECRET')}; ohne den alten Wert sind die gespeicherten WordPress-Passwörter nicht mehr lesbar und müssten bei jeder Website neu eingegeben werden. Die .env und die Schlüsseldatei enthalten geheime Zugangsdaten: nicht per Mail verschicken, den Stick danach sicher aufbewahren oder löschen.", "warn")
h2("13.2 Auf dem neuen Rechner")
steps([
    "<b>Voraussetzungen installieren:</b> Docker Desktop (starten und warten, bis es läuft) und Node.js ab Version 20. Git ist empfehlenswert, weil <b>start.cmd</b> damit Updates holt.",
    f"<b>Programm bereitstellen:</b> den Programmordner per Git aus dem Repository klonen ({mono('git clone &lt;Adresse des Repositorys&gt;')}) oder den Ordner vom alten Rechner kopieren (ohne den Unterordner {mono('node_modules')}).",
    f"In den Programmordner legen: die gesicherte <b>.env</b> (unverändert, insbesondere {mono('SESSION_SECRET')}) und den Ordner <b>secrets</b>. Den Sicherungsordner in den Programmordner kopieren (oder an einen beliebigen Ort).",
    "<b>start.cmd</b> einmal ausführen. Es installiert die Abhängigkeiten und legt die leere Datenbank an. Danach <b>stop.cmd</b>.",
    f"Eingabeaufforderung im Programmordner öffnen (im Explorer in die Adresszeile {mono('cmd')} tippen) und die Sicherung einspielen: {mono('restore.cmd &quot;backups\\db-JJJJMMTT-HHMM.dump&quot;')} (Pfad zur Datei anpassen) und mit <b>JA</b> bestätigen. Liegt der Ordner {mono('uploads')} neben der Dump-Datei, werden die Bilder automatisch mit zurückkopiert.",
    "<b>start.cmd</b> ausführen. Das Tool öffnet sich mit allen bisherigen Beiträgen, Websites und Einstellungen.",
])
h2("13.3 Danach prüfen")
bullets([
    "Anmeldung mit dem bisherigen Passwort aus der .env.",
    "Beiträge und Bilder sind vorhanden (einen älteren Beitrag öffnen, das Beitragsbild muss erscheinen).",
    "Unter <b>Websites</b>: Beim nächsten Senden eines Entwurfs an WordPress zeigt sich, ob der Zugang funktioniert. Meldet das Tool einen Zugangsfehler, das WordPress-Passwort der Website neu eintragen.",
    "Unter <b>Themenideen</b> auf „Verbindung prüfen“ klicken (Search Console); im Startfenster muss „Schlüssel gefunden“ stehen.",
    f"Steht in der .env ein {mono('BACKUP_DIR')}, prüfen, dass dieser Ordner auf dem neuen Rechner existiert (z. B. ein OneDrive-Pfad enthält den Benutzernamen und muss angepasst werden).",
])
box("Ehrlicher Hinweis", "Diese Anleitung beruht auf den Skripten backup.cmd, restore.cmd und start.cmd. Ein kompletter Umzug auf einen zweiten Windows-Rechner wurde bisher nicht durchgespielt. Teste die Wiederherstellung am besten einmal, bevor der alte Rechner abgegeben wird, und behalte die Sicherung, bis alles geprüft ist.")
page_break()

# ---------------------------------------------------------------- 14
h1("14. Checkliste vor jeder Veröffentlichung")
para("Gehe diese Liste im Entwurf und in WordPress durch:")
table(["Prüfpunkt", "Was zu prüfen ist"], [
    ["Faktencheck", "Status bestanden oder korrigiert; Punkte unter „bitte prüfen“ erledigt; Aktenzeichen, Daten und Beträge gegen die Quelle geprüft."],
    ["Inhalt", "Aussagen sind richtig und aktuell; Einschätzungen sind als solche gekennzeichnet; Ton passt zum Stilleitfaden."],
    ["Überschriften", "Jede Überschrift nennt das Thema; Kurzfassung und Fragenabschnitt passen zum Text."],
    ["SEO", "Titel 20 bis 65 Zeichen, Meta-Description 70 bis 155 Zeichen, Fokus-Keyword in Titel, Meta, Einstieg, Überschrift und Slug; Dichte etwa 1 bis 1,5 %."],
    ["Links", "Fundstellen stehen auch im Text; Links führen auf die richtige Seite (auch die Normlinks auf dsgvo-online.net); keine Wettbewerber."],
    ["Bild", "Motiv passt zum Thema; Alt-Text gesetzt; Quelle bzw. KI-Kennzeichnung korrekt; Datei verkleinert."],
    ["WordPress", "Kategorien gewählt, <b>Hauptkategorie</b> gesetzt; Schlagwörter geprüft; Entwurf im Editor angesehen; Tabellen und Elementor-Darstellung geprüft."],
    ["Schlussabsatz und Disclaimer", "Link im Schlussabsatz führt auf die Seite der Hauptkategorie; Rechtshinweis und „Stand“ stehen am Ende; nichts doppelt."],
    ["Danach", "Veröffentlichen oder planen. Nach einigen Wochen Position und Klicks in der Search Console prüfen und ggf. überarbeiten."],
], [4.2, 12.2])
page_break()

# ---------------------------------------------------------------- Anhang A
h1("Anhang A: Begriffe")
table(["Begriff", "Erklärung"], [
    ["Fokus-Keyword", "Der Suchbegriff, für den der Beitrag gefunden werden soll. Muss wörtlich im Text stehen."],
    ["Meta-Description", "Beschreibungstext in den Google-Ergebnissen (höchstens etwa 155 Zeichen)."],
    ["Slug", "Der Teil der Adresse, der den Beitrag benennt (z. B. /ki-omnibus-fristen/)."],
    ["Hauptkategorie / primäre Kategorie", "Die Kategorie, die Rank Math und das Theme bevorzugt anzeigen; hier auch Auslöser für die Zielseite im Schlussabsatz."],
    ["Faktencheck", "Zweiter KI-Durchlauf, der jede Tatsache gegen Recherche und Originalunterlagen prüft."],
    ["Primärquelle", "Originalquelle: Gericht, Gesetz, Behörde (im Gegensatz zu Blogs und Presse)."],
    ["Einblendungen / Klicks / Position", "Zahlen der Search Console: wie oft eine Seite in Google angezeigt, angeklickt und auf welchem durchschnittlichen Rang sie gezeigt wurde."],
    ["Dienstkonto", "Technischer Zugang bei Google, der dem Tool Lesezugriff auf die Search Console gibt."],
    ["Anwendungspasswort", "Besonderes WordPress-Passwort nur für das Tool; jederzeit widerrufbar."],
    ["API-Schlüssel", "Langer Text, der dein Konto bei einem Dienst (Anthropic, OpenAI, Supermachine) ausweist; steht in der .env."],
    ["Seitenbaukasten", "Elementor, Divi u. ä.: Der Inhalt liegt im Baukasten, nicht im normalen Beitragstext."],
    ["REST-API", "Technische Schnittstelle von WordPress, über die das Tool Beiträge liest und schreibt."],
], [4.6, 11.8])
page_break()

# ---------------------------------------------------------------- Anhang B
h1("Anhang B: API-Schlüssel erzeugen und hinterlegen")
para("Der Blog-Assistent nutzt drei externe Dienste, die jeweils einen eigenen <b>API-Schlüssel</b> brauchen: <b>Anthropic</b> (Claude: Recherche, Entwürfe, Faktencheck), <b>OpenAI</b> (KI-Bilder und Bildstudio) und optional <b>Supermachine</b> (Bilder zu Beiträgen). Ein API-Schlüssel ist ein langer Text, der dein Konto beim Dienst ausweist. Er wird in der Datei <b>.env</b> im Programmordner eingetragen (siehe Abschnitt 2.3). Die Oberflächen der Anbieter ändern sich gelegentlich; Menünamen können daher leicht abweichen.")
box("Wichtig: API ist nicht Abo", "Ein Abonnement für den Chatbot (Claude Pro/Max oder ChatGPT Plus) enthält <b>keinen</b> API-Zugang. Die API wird getrennt abgerechnet, nach Verbrauch, mit eigenem Guthaben bzw. eigener Zahlungsmethode. Die Kosten je Beitrag zeigt dir die Seite „Kosten“ im Tool.", "warn")
table(["Dienst", "wofür", ".env-Eintrag", "Pflicht?"], [
    ["Anthropic (Claude)", "Themen, Recherche, Entwurf, Faktencheck, Nachschärfen", mono("ANTHROPIC_API_KEY"), "ja"],
    ["OpenAI", "KI-Bilder zu Beiträgen, Bildstudio", mono("IMAGE_PROVIDER=openai") + "<br/>" + mono("IMAGE_API_KEY"), "nur für KI-Bilder"],
    ["Supermachine", "KI-Bilder zu Beiträgen (kein Bildstudio)", mono("IMAGE_PROVIDER=supermachine") + "<br/>" + mono("IMAGE_API_KEY"), "Alternative zu OpenAI"],
], [3.4, 5.6, 5.4, 2.0])
h2("B.1 Anthropic: Schlüssel für Claude (Pflicht)")
steps([
    "<b>console.anthropic.com</b> öffnen und mit dem Konto anmelden bzw. ein Konto anlegen (die Anthropic <b>Console</b>, nicht claude.ai).",
    "<b>Guthaben bzw. Zahlungsmethode hinterlegen:</b> in der Console unter „Billing“ (Plans &amp; Billing) eine Zahlungsmethode eintragen und Guthaben kaufen. Ohne Guthaben antwortet die API mit einer Fehlermeldung. Optional dort ein <b>monatliches Ausgabenlimit</b> setzen.",
    "<b>Schlüssel erstellen:</b> in der Console „API keys“ (Settings) öffnen, <b>Create Key</b> wählen, einen Namen vergeben (z. B. „Blog-Assistent“) und, falls gefragt, den Workspace wählen (meist „Default“).",
    f"Den angezeigten Schlüssel <b>sofort kopieren</b>: Er beginnt mit {mono('sk-ant-')} und wird nur dieses eine Mal vollständig angezeigt. Geht er verloren, erstellst du einfach einen neuen.",
    f"In der <b>.env</b> im Programmordner eintragen (Zeile ohne Leerzeichen und ohne Anführungszeichen): {mono('ANTHROPIC_API_KEY=sk-ant-…')} und {mono('AI_PROVIDER=claude')} prüfen. Datei speichern.",
    "<b>start.cmd</b> neu ausführen. Beim Start prüft das Tool, ob ein Schlüssel eingetragen ist; im API-Fenster steht, welcher Schlüssel (nur Anfang und Ende) verwendet wird.",
    "<b>Prüfen:</b> Doppelklick auf <b>key-test.cmd</b> im Programmordner. Es testet Schlüssel, Workspace, Modell und Guthaben, kostet praktisch nichts und zeigt den Schlüssel nie an.",
])
box("Typische Meldungen", f"„API key is not scoped to a workspace“: in der .env zusätzlich {mono('ANTHROPIC_WORKSPACE_ID=wrkspc_…')} eintragen (ID des Workspaces aus der Console) oder in der Console einen Schlüssel innerhalb eines Workspaces erstellen. · 401: Schlüssel falsch kopiert oder gelöscht. · Fehler zu Guthaben/Billing: Guthaben in der Console aufladen. · Ist auf dem Rechner die Systemvariable {mono('ANTHROPIC_API_KEY')} gesetzt, überstimmt sie die .env; dann diese Variable entfernen.")
h2("B.2 OpenAI: Schlüssel für KI-Bilder und Bildstudio")
steps([
    "<b>platform.openai.com</b> öffnen und anmelden (die API-Plattform, nicht chatgpt.com). Ein ChatGPT-Abo genügt nicht.",
    "<b>Abrechnung einrichten:</b> unter Settings → Billing eine Zahlungsmethode hinterlegen und Guthaben aufladen. Optional ein Ausgabenlimit festlegen.",
    "<b>Organisation verifizieren, falls verlangt:</b> Für Bildmodelle verlangt OpenAI häufig eine verifizierte Organisation (Settings → Organization → Verification, mit Ausweisprüfung). Fehlt sie, meldet das Tool das ausdrücklich („Organisation muss verifiziert sein“).",
    "<b>Schlüssel erstellen:</b> unter „API keys“ <b>Create new secret key</b>, Namen vergeben (z. B. „Blog-Assistent“). Bei eingeschränkten Rechten muss der Zugriff auf die <b>Images</b>-API erlaubt sein; am einfachsten „All“.",
    f"Den Schlüssel (beginnt mit {mono('sk-')}) <b>sofort kopieren</b>; er wird nur einmal angezeigt.",
    f"In der <b>.env</b> eintragen: {mono('IMAGE_PROVIDER=openai')} und {mono('IMAGE_API_KEY=sk-…')}. Das Bildmodell wählt das Tool selbst (Standard gpt-image-2); bei Bedarf {mono('IMAGE_MODEL')} setzen. Optional {mono('IMAGE_QUALITY=medium')} (low/medium/high; höher kostet mehr) und {mono('IMAGE_COST_USD')} (Kosten je Bild in US-Dollar für die Kostenübersicht).",
    "Datei speichern, <b>start.cmd</b> neu ausführen, im Beitrag unter Reiter „Bild“ ein Bild erzeugen oder im Bildstudio ein Foto umgestalten.",
])
h2("B.3 Supermachine: Schlüssel (optional)")
steps([
    f"Auf <b>supermachine.art</b> anmelden und im <b>Profil</b> den API-Schlüssel erzeugen bzw. kopieren (er beginnt mit {mono('sk-')}).",
    f"In der <b>.env</b>: {mono('IMAGE_PROVIDER=supermachine')} und {mono('IMAGE_API_KEY=sk-…')}. Optional {mono('IMAGE_MODEL')}, {mono('IMAGE_WIDTH')} und {mono('IMAGE_HEIGHT')} (Standard 1024x768). Liefert das Modell mit deutschen Prompts schwache Ergebnisse, {mono('IMAGE_PROMPT_LANGUAGE=en')} setzen.",
    "Speichern und <b>start.cmd</b> neu ausführen. Das <b>Bildstudio</b> funktioniert mit Supermachine nicht; dafür braucht es OpenAI.",
])
h2("B.4 So bearbeitest du die .env")
steps([
    f"Im <b>Programmordner</b> (dort, wo {mono('start.cmd')} liegt) die Datei <b>.env</b> mit dem Editor (Notepad) öffnen: Rechtsklick → „Öffnen mit“ → Editor. Ist sie nicht sichtbar, im Explorer unter Ansicht → Anzeigen die „Ausgeblendeten Elemente“ einschalten.",
    f"Pro Zeile ein Eintrag in der Form {mono('NAME=Wert')}: kein Leerzeichen um das Gleichheitszeichen, keine Anführungszeichen. Zeilen mit {mono('#')} am Anfang sind Kommentare.",
    "Speichern, <b>start.cmd</b> (neu) ausführen. Änderungen an der .env wirken erst nach dem Neustart.",
])
box("Sicherheit", "Schlüssel sind wie Passwörter: nicht per Mail oder Chat weitergeben, nicht in Screenshots zeigen und nicht in einen geteilten Cloud-Ordner legen. Die .env bleibt auf deinem PC (sie ist nicht Teil der Sicherung und nicht im Git); bewahre eine Kopie getrennt auf (siehe Umzug, Kapitel 13). Bei Verdacht auf Missbrauch den Schlüssel beim Anbieter löschen und einen neuen erstellen. Setze bei beiden Anbietern ein <b>Ausgabenlimit</b>, damit ein Fehler nie unbemerkt hohe Kosten verursacht.", "warn")
box("Wenn etwas nicht klappt", "Anthropic: key-test.cmd ausführen und die Meldung lesen. OpenAI/Supermachine: Bild erzeugen; das Tool nennt Ursache und Abhilfe (Schlüssel, Guthaben, Verifizierung, Modell). Weitere Hinweise: Kapitel 12 „Fehlerbehebung“.")
