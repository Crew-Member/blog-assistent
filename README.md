# KDSB Blog-Assistent

KI-gestützte Erstellung von Blogbeiträgen für mehrere WordPress-Websites (Kanzlei, Datenschutzberatung).
Mails, PDFs und Urteile per Drag & Drop hochladen → die KI schlägt Themen vor, recherchiert zu den
ausgewählten Themen im Web und schreibt einen Entwurf mit Quellen, Keywords und Meta-Daten.

## Stand: Meilenstein 2 (Qualität)

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
| Bild-Prompts, Bildgenerierung, KI-Kennzeichnung | Meilenstein 3 |
| WordPress-Anbindung (Entwurf ins CMS, Kategorien), Freigabe-Workflow | Meilenstein 4 |
| Bestehende Beiträge überarbeiten (aktualisieren) | geplant |

Aus Mails werden Betreff, Absender, Datum und Text gelesen; PDF-, Word- und Textanhänge (höchstens fünf, je 25 MB) kommen als eigene Unterlagen dazu. Logos, Bilder und HTML-Anhänge werden bewusst nicht übernommen. Die `.msg`-Unterstützung ist bisher nur mit selbst erzeugten Testdateien geprüft, nicht mit echten Outlook-Mails.

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

Ohne API-Key ausprobieren: `AI_PROVIDER=fake` setzen – dann liefert die KI Platzhalter-Texte, der gesamte Ablauf ist trotzdem nutzbar.

Tests (brauchen eine erreichbare Postgres-DB):

```bash
DATABASE_URL=postgresql://blog:blog@localhost:5433/blog_assistent npm test
```

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
