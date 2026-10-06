# KDSB Blog-Assistent

KI-gestützte Erstellung von Blogbeiträgen für mehrere WordPress-Websites (Kanzlei, Datenschutzberatung).
Mails, PDFs und Urteile per Drag & Drop hochladen → die KI schlägt Themen vor, recherchiert zu den
ausgewählten Themen im Web und schreibt einen Entwurf mit Quellen, Keywords und Meta-Daten.

## Stand: Meilenstein 3 + 4 (Bilder, WordPress-Entwürfe)

| Funktion | Stand |
|---|---|
| Websites mit Stilprofil (Zielgruppe, Ton, Leitfaden, Disclaimer) | ✅ |
| Beispielbeiträge als Stilvorlage: aus WordPress importieren (REST-API) oder einfügen; „Stil ableiten“ schlägt Tonalität und Leitfaden vor | ✅ |
| Upload per Drag & Drop: PDF, E-Mail (`.eml` und Outlook-`.msg`), Word (`.docx`), Text/Markdown/HTML, Bilder; PDF-/Word-Anhänge von Mails werden automatisch als eigene Unterlagen übernommen | ✅ |
| Analyse der Unterlagen → Themenvorschläge (Claude liest PDFs nativ) | ✅ |
| Web-Recherche mit Quellen (Claude-Websuche) | ✅ |
| Entwurf inkl. Fokus-Keyword, Nebenbegriffen, Slug, Meta-Description, Auszug, Quellenliste | ✅ |
| **Faktencheck** als eigener, unabhängiger KI-Durchlauf gegen Recherche **und Originalunterlagen**; korrigiert den Text (entfernen/entschärfen) und protokolliert jede Beanstandung | ✅ |
| **Belegprüfung im Code**: Aktenzeichen, Normen und Daten im Beitrag müssen in Recherche/Eckdaten/Unterlagen vorkommen, sonst Hinweis „bitte prüfen“ | ✅ |
| **SEO-Checkliste** (Titel-/Meta-Länge, Keyword in Titel/Meta/Einstieg/Slug, Textlänge, Zwischenüberschriften) | ✅ |
| Vorschau und manuelle Bearbeitung im Browser | ✅ |
| Disclaimer + „Stand“-Datum werden vom System angehängt, nicht von der KI | ✅ |
| **Beitragsbild**: Die KI schreibt Bild-Prompt (Illustration oder Foto), Alt-Text und Bildunterschrift – ohne erkennbare Personen, Text oder Logos | ✅ |
| Bild automatisch erzeugen über **Supermachine** (`IMAGE_PROVIDER=supermachine`) oder **OpenAI**; weitere Anbieter über die Schnittstelle `ImageProvider` anschließbar | ✅ (nur mit eigenem Key) |
| Alternativ: lizenzfreie Fotos suchen (Links zu Pexels/Unsplash/Pixabay) oder eigenes Bild hochladen – Quelle und Lizenz sind Pflichtangabe | ✅ |
| **KI-Kennzeichnung**: Bildunterschrift „Bild: KI-generiert“ (pro Website abschaltbar) und IPTC-Vermerk im PNG | ✅ |
| Beitragsbild wird mit Alt-Text und Unterschrift in die WordPress-Mediathek geladen und als Beitragsbild gesetzt | ✅ |
| **WordPress-Anbindung**: Beitrag per Knopfdruck als **Entwurf** anlegen (Titel, Inhalt, Slug, Auszug, Kategorien, Schlagwörter, Rank-Math-Felder); erneutes Senden aktualisiert denselben Entwurf, veröffentlichte Beiträge werden nie angefasst | ✅ |
| **Kategorien**: Die KI schlägt aus den vorhandenen Kategorien der Website passende vor (vorausgewählt) und kann bis zu zwei neue vorschlagen, die nur nach ausdrücklicher Bestätigung angelegt werden | ✅ |
| Veröffentlichen/Planen aus dem Tool heraus | bewusst nicht vorgesehen – das erfolgt in WordPress |
| Bestehende Beiträge überarbeiten (aktualisieren) | geplant |

### Bilder

- Claude erzeugt keine Bilder, sondern schreibt den **Prompt**. Erzeugt wird das Bild von einem Bildanbieter (`IMAGE_PROVIDER`, `IMAGE_API_KEY`, `IMAGE_MODEL`, `IMAGE_QUALITY` in der `.env`). Ohne Anbieter lässt sich der Prompt in jedem anderen Bilddienst verwenden; das Ergebnis lädt man am Beitrag hoch.
- **Supermachine** (`IMAGE_PROVIDER=supermachine`, `IMAGE_API_KEY` = Key aus dem Supermachine-Profil): Das Tool startet den Auftrag (`POST /v1/generate`), fragt alle 2,5 Sekunden nach (`GET /v1/images?batchId=…`, höchstens 4 Minuten) und lädt das fertige Bild; die Bildadresse wird nur abgerufen, wenn sie öffentlich und https ist. Standardmodell „Supermachine NextGen“, Standardgröße 1024×768 (`IMAGE_MODEL`, `IMAGE_WIDTH`, `IMAGE_HEIGHT`). Jedes Bild verbraucht Credits. Ein Negativ-Prompt wird nicht mitgesendet (nicht dokumentiert), die Motivregeln stecken im Prompt – Bilder bitte vor der Veröffentlichung ansehen. Ob Bilder kommerziell genutzt werden dürfen, hängt vom Tarif ab und steht in den Supermachine-Nutzungsbedingungen.
- Das OpenAI-Bildmodell `gpt-image-1` verlangt bei OpenAI eine **verifizierte Organisation**; Kosten fallen pro Bild an (je nach Qualität). Die Anzeige beim Start nennt Anbieter und Modell.
- **Lizenz:** Bei Uploads ist die Angabe von Quelle und Lizenz Pflicht und wird gespeichert (auch in der WordPress-Mediathek). Ob ein Bild kommerziell nutzbar ist, richtet sich nach den Bedingungen des jeweiligen Anbieters bzw. der Stockfoto-Seite und muss selbst geprüft werden.
- **Kennzeichnung:** KI-generierte Bilder erhalten in der Bildunterschrift „Bild: KI-generiert“ (pro Website abschaltbar) und – bei PNG – einen IPTC-Vermerk (`DigitalSourceType = trainedAlgorithmicMedia`) in der Datei. Das ist ein einfacher Metadaten-Vermerk, **keine** kryptografisch signierte Herkunftsangabe (C2PA). Ob und wie die Kennzeichnung rechtlich nötig ist (u. a. KI-Verordnung), ist im Einzelfall zu klären.
- Prompts enthalten fest die Vorgabe „kein Text, keine Logos, keine erkennbaren Personen“; der Bildupload wird an den Dateikopfzeichen geprüft (nur PNG/JPEG/WebP, höchstens 10 MB).
- Die Bildgenerierung (Supermachine und OpenAI) ist bisher **nur mit simulierten Antworten getestet**, nicht mit einem echten Bildanbieter; die Supermachine-Anbindung folgt der veröffentlichten API-Dokumentation. Den IPTC-Vermerk schreibt das Tool in PNG- und JPEG-Dateien.

### WordPress einrichten

1. In WordPress: Benutzer → Profil → **Anwendungspasswörter** → neues Passwort erzeugen (wird nur einmal angezeigt).
2. Im Tool: Websites → Bearbeiten → Adresse (**https://…**), WordPress-Benutzername und Anwendungspasswort eintragen, speichern, **„Verbindung testen“**.
3. Am fertigen Beitrag: **„An WordPress senden (als Entwurf)“**, Kategorien prüfen, bestätigen. Danach führt ein Link in den WordPress-Editor.

Das Passwort wird mit einem aus `SESSION_SECRET` abgeleiteten Schlüssel verschlüsselt gespeichert (AES-256-GCM) und nie in API-Antworten ausgegeben; wird das `SESSION_SECRET` geändert, muss es neu eingegeben werden. Zugangsdaten gehen nur an die eingetragene https-Adresse, Weiterleitungen werden bewusst nicht befolgt. Für neue Kategorien braucht der WordPress-Benutzer das Recht „Kategorien verwalten“ (Rolle Redakteur oder höher).

**Rank Math:** Meta-Description und Fokus-Keyword werden über die Rank-Math-Schnittstelle (`/wp-json/rankmath/v1/updateMeta`) gesetzt. Das ist bisher **nur gegen simulierte Antworten getestet, nicht gegen eine echte Rank-Math-Installation**. Schlägt es fehl oder wird Rank Math nicht erkannt, meldet das Tool das offen und die Felder werden im WordPress-Editor von Hand eingetragen.

Aus Mails werden Betreff, Absender, Datum und Text gelesen; PDF-, Word- und Textanhänge (höchstens fünf, je 25 MB) kommen als eigene Unterlagen dazu. Logos, Bilder und HTML-Anhänge werden bewusst nicht übernommen. Die `.msg`-Unterstützung ist bisher nur mit selbst erzeugten Testdateien geprüft, nicht mit echten Outlook-Mails.

### Vergleich mit den Top-Ergebnissen

Vor dem Schreiben sucht die KI per Websuche die stärksten deutschsprachigen Treffer zum Suchbegriff (das erste Keyword des Themas). Das Tool ruft bis zu sechs dieser Seiten selbst ab (nur öffentliche Adressen, Zeitlimit, ohne Plattformen und die eigene Website) und misst Wortzahl und Zwischenüberschriften. Die KI leitet daraus Suchintention, einen Zielumfang und häufig behandelte Aspekte ab; der Schreib-Prompt bekommt sie als Orientierung (der Stilleitfaden hat Vorrang). Die Auswertung steht am Beitrag („Vergleich mit den Top-Ergebnissen“). Pro Website abschaltbar (kostet eine zusätzliche Websuche je Beitrag). Die Treffer stammen aus einer KI-Websuche, nicht aus Googles Ergebnisliste.

### Kosten

Jeder KI-Aufruf wird mit Tokens und Websuchen protokolliert; die Seite **Kosten** zeigt die Summen je Schritt, Website und Beitrag, am Beitrag steht „Kosten dieses Beitrags“. Die Euro-/Dollarbeträge sind Schätzungen aus den Preisen in der `.env` (`AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICE_SEARCH_PER_1000`, optional `IMAGE_COST_USD`). Bitte mit der aktuellen Preisliste des Anbieters abgleichen; maßgeblich ist die Rechnung. Erfasst wird ab Einführung der Übersicht.

### Wie der Faktencheck arbeitet

1. Ein zweiter Claude-Durchlauf bekommt den Entwurf, die Recherchenotizen, die Eckdaten und die Originalunterlagen (PDFs/Mails) und prüft jede Tatsachenbehauptung. Als belegt gilt nur, was dort steht.
2. Beanstandete Aussagen werden entfernt, entschärft oder (nur wenn unverzichtbar) markiert; der korrigierte Text ersetzt den Entwurf.
3. Unabhängig davon prüft der Code, ob jedes Aktenzeichen, jede Norm und jedes Datum im Text auch in den Belegen vorkommt. Nicht Auffindbares erscheint unter „Offen – bitte prüfen“.
4. Status am Beitrag: *bestanden*, *korrigiert*, *bitte prüfen* oder *nicht durchgeführt* (z. B. API-Fehler – der Entwurf bleibt dann erhalten, ist aber als ungeprüft gekennzeichnet).

Der Faktencheck verringert das Risiko falscher Angaben, ersetzt aber nicht die fachliche Prüfung vor der Veröffentlichung.
Er kennt nur das, was in den Belegen steht; PDFs liest Claude, die Belegprüfung im Code sieht aber nur Text (Recherche, Eckdaten, Mails/Word).

**Hinweis zum Teststand:** Der gesamte Ablauf ist automatisiert und im Browser mit der Platzhalter-KI
(`AI_PROVIDER=fake`) getestet. Die echten Claude-Aufrufe (`src/ai/claude.ts`) sind gegen die SDK-Typen
geprüft, aber noch nicht mit einem echten API-Key gelaufen – das ist der erste Schritt nach dem Einrichten.
Ebenso ist der WordPress-Import nur gegen simulierte Antworten getestet.

## Architektur

- `packages/api` – Node.js/TypeScript/Fastify, Prisma/PostgreSQL, Hintergrund-Worker (Warteschlange über Statusfelder in der DB)
- `packages/web` – React/Vite
- Ablauf: `Submission` (Upload) → `analyze` → `Topic`s → Klick „Beitrag erstellen“ → `Post` `QUEUED` → `research` (Websuche) → `draft` → `DRAFT_READY`
- KI-Zugriff nur über das Interface `AiService` (`src/ai/types.ts`): `ClaudeAiService` (echt) und `FakeAiService` (Platzhalter für Tests/Ausprobieren)
- Prompts liegen gesammelt in `packages/api/src/ai/prompts.ts`
- Testdaten: `packages/api/src/fixtures/` enthält zwei echte Beiträge (OLG Naumburg, Deutsche Wohnen) für die Belegprüfung

## Windows: Doppelklick-Start

`start.cmd` doppelklicken. Die Datei erledigt der Reihe nach: Update holen (`git pull`), `.env` prüfen
(beim ersten Mal wird sie angelegt und im Editor geöffnet), Docker Desktop und Datenbank starten,
`npm install`, Datenbank-Änderungen anwenden, API und Oberfläche in zwei Fenstern starten und den Browser öffnen.
Bei jedem Problem bleibt das Fenster mit einer verständlichen Meldung offen. Beenden mit `stop.cmd`
(die Daten bleiben erhalten). Voraussetzungen: Node.js ab Version 20 und Docker Desktop.

`key-test.cmd` (Doppelklick) prüft den Anthropic-Zugang mit den Einstellungen aus der `.env`: gültiger Key? Workspace nötig? Modell und Guthaben in Ordnung? Es kostet praktisch nichts und zeigt den Key nie an. Auf der Kommandozeile: `npm run check:ai -w @blog/api`.

Die Skripte sind bisher nicht auf einem echten Windows-Rechner getestet.

## Schnellstart (Entwicklung)

```bash
cp .env.example .env        # im Projektstamm; dann ADMIN_PASSWORD, SESSION_SECRET, ANTHROPIC_API_KEY ausfüllen
docker compose up -d        # nur Postgres (Port 5433)
npm install
npm run prisma:migrate      # Schema anwenden (liest die .env im Projektstamm)
npm run dev:api             # http://localhost:3100
npm run dev:web             # http://localhost:5174 (Proxy auf die API)
```

Die `.env` wird automatisch geladen – von der API (`dev:api`, `start`) und von den Prisma-Skripten
(`prisma:migrate`, `prisma:deploy`). Dabei gilt:

- Gesucht wird im aktuellen Ordner und in bis zu drei Elternordnern, die `.env` im Projektstamm genügt also.
- Bereits gesetzte Umgebungsvariablen (Shell, Docker) haben Vorrang vor der Datei.
- Fehlen Pflichtwerte, nennt die API beim Start genau, welche, und ob/wo sie eine `.env` gefunden hat.
- Docker (`docker compose --profile app ...`) liest die `.env` selbst; dafür ist nichts weiter nötig.
- Meldet die API „This API key is not scoped to a workspace“, in der `.env` zusätzlich `ANTHROPIC_WORKSPACE_ID=wrkspc_…` setzen (ID des Workspaces aus der Anthropic Console) oder in der Console einen Key innerhalb eines Workspaces erstellen. Häufige API-Fehler (Key, Guthaben, Limit, Workspace) werden in der Oberfläche als verständlicher Hinweis angezeigt.
- Beim Start zeigt die API, welcher Key (nur Anfang/Ende und Länge) und welcher Endpunkt tatsächlich verwendet werden und woher der Key stammt. Eine gesetzte Systemvariable `ANTHROPIC_API_KEY` überstimmt die `.env` – dann erscheint eine Warnung. `ANTHROPIC_BASE_URL` und `ANTHROPIC_AUTH_TOKEN` aus der Umgebung werden bewusst ignoriert (Endpunkt: `AI_BASE_URL`).

Ohne API-Key ausprobieren: `AI_PROVIDER=fake` setzen – dann liefert die KI Platzhalter-Texte, der gesamte Ablauf ist trotzdem nutzbar.

Tests (brauchen eine erreichbare Postgres-DB):

```bash
DATABASE_URL=postgresql://blog:blog@localhost:5433/blog_assistent npm test
```

## Sicherung und Wiederherstellung (Windows)

- `start.cmd` sichert automatisch **einmal pro Tag** die Datenbank (Beiträge, Websites, Einstellungen) und die Bilder/Uploads, bevor Datenbank-Änderungen eingespielt werden. Es bleiben die letzten 14 Datenbank-Sicherungen.
- `backup.cmd` (Doppelklick) sichert sofort.
- Ziel ist standardmäßig der Ordner `backups` im Projektordner. Besser ein Ordner, der ohnehin gesichert wird: in der `.env` z. B. `BACKUP_DIR=C:\Users\NAME\OneDrive\Blog-Assistent-Backup`. Der Schlüssel `SESSION_SECRET` und die API-Schlüssel stehen in der `.env`, nicht in der Sicherung – die `.env` bitte getrennt aufbewahren (ohne `SESSION_SECRET` ist das gespeicherte WordPress-Passwort nicht mehr lesbar).
- Wiederherstellen: `restore.cmd backups\db-JJJJMMTT-HHMM.dump` (überschreibt die aktuelle Datenbank nach Rückfrage; Bilder neben der Sicherung werden zurückkopiert).

## Betrieb

```bash
docker compose --profile app up -d --build
```

Der Container hört nur auf `127.0.0.1:3100`. Für HTTPS und Domain (z. B. `blog.kdsb.gmbh`) im vorhandenen Caddy einen Block ergänzen:

```
blog.kdsb.gmbh {
	reverse_proxy 127.0.0.1:3100
}
```

(Läuft Caddy selbst in Docker, statt `127.0.0.1` den Host-Alias bzw. das gemeinsame Compose-Netzwerk verwenden.)

## Sicherheit und Datenschutz

- Nur ein Benutzer: Login per Passwort (`ADMIN_PASSWORD`), signiertes httpOnly-/SameSite-Strict-Cookie, Login-Drosselung. Das Passwort nur über HTTPS eingeben.
- Hochgeladene Unterlagen und Texte gehen zur Verarbeitung an die Anthropic-API. Die Unterlagen sollen keine vertraulichen Mandantendaten enthalten.
- Vom Modell erzeugtes HTML wird serverseitig auf eine kleine Tag-Menge bereinigt.
- Der WordPress-Import ruft nur öffentliche Adressen ab (interne/private IP-Bereiche und Weiterleitungen dorthin werden blockiert).
- Inhalte immer vor Veröffentlichung fachlich prüfen – die KI kann sich bei Rechtsfragen irren.
