# KDSB Blog-Assistent

KI-gestützte Erstellung von Blogbeiträgen für mehrere WordPress-Websites (Kanzlei, Datenschutzberatung).
Mails, PDFs und Urteile per Drag & Drop hochladen → die KI schlägt Themen vor, recherchiert zu den
ausgewählten Themen im Web und schreibt einen Entwurf mit Quellen, Keywords und Meta-Daten.

## Stand: Meilenstein 1 (Kern)

| Funktion | Stand |
|---|---|
| Websites mit Stilprofil (Zielgruppe, Ton, Leitfaden, Disclaimer) | ✅ |
| Upload per Drag & Drop: PDF, E-Mail (`.eml`), Word (`.docx`), Text/Markdown/HTML, Bilder | ✅ |
| Analyse der Unterlagen → Themenvorschläge (Claude liest PDFs nativ) | ✅ |
| Web-Recherche mit Quellen (Claude-Websuche) | ✅ |
| Entwurf inkl. Fokus-Keyword, Nebenbegriffen, Slug, Meta-Description, Auszug, Quellenliste | ✅ |
| Kennzeichnung nicht belegter Aussagen (`unverifiedClaims`) | ✅ (einfache Form) |
| Vorschau und manuelle Bearbeitung im Browser | ✅ |
| Disclaimer + „Stand“-Datum werden vom System angehängt, nicht von der KI | ✅ |
| Eigener Faktencheck-Durchlauf gegen die Quellen | Meilenstein 2 |
| Bild-Prompts, Bildgenerierung, KI-Kennzeichnung | Meilenstein 3 |
| WordPress-Anbindung (Entwurf ins CMS), Freigabe-Workflow | Meilenstein 4 |

Outlook-`.msg`-Dateien werden nicht unterstützt – bitte als `.eml` oder PDF speichern.

**Hinweis zum Teststand:** Der gesamte Ablauf ist automatisiert und im Browser mit der Platzhalter-KI
(`AI_PROVIDER=fake`) getestet. Die echten Claude-Aufrufe (`src/ai/claude.ts`) sind gegen die SDK-Typen
geprüft, aber noch nicht mit einem echten API-Key gelaufen – das ist der erste Schritt nach dem Einrichten.

## Architektur

- `packages/api` – Node.js/TypeScript/Fastify, Prisma/PostgreSQL, Hintergrund-Worker (Warteschlange über Statusfelder in der DB)
- `packages/web` – React/Vite
- Ablauf: `Submission` (Upload) → `analyze` → `Topic`s → Klick „Beitrag erstellen“ → `Post` `QUEUED` → `research` (Websuche) → `draft` → `DRAFT_READY`
- KI-Zugriff nur über das Interface `AiService` (`src/ai/types.ts`): `ClaudeAiService` (echt) und `FakeAiService` (Platzhalter für Tests/Ausprobieren)
- Prompts liegen gesammelt in `packages/api/src/ai/prompts.ts`

## Schnellstart (Entwicklung)

```bash
cp .env.example .env        # ADMIN_PASSWORD, SESSION_SECRET, ANTHROPIC_API_KEY ausfüllen
docker compose up -d        # nur Postgres (Port 5433)
npm install
npm run prisma:migrate      # Schema anwenden
npm run dev:api             # http://localhost:3100
npm run dev:web             # http://localhost:5174 (Proxy auf die API)
```

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
- Inhalte immer vor Veröffentlichung fachlich prüfen – die KI kann sich bei Rechtsfragen irren.
