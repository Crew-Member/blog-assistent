import { useState } from "react";
import { api, type Site, type StyleSample, type WpTestResult } from "../api";
import { useLoad } from "../hooks";
import { Chip, EmptyState, Icon, PageHeader } from "../ui";

const EMPTY = { name: "", baseUrl: "", language: "de", audience: "", tone: "", styleGuide: "", disclaimer: "", closingHtml: "", preferredLinks: "", competitionCheck: true, aiNoticeText: "", labelAiImages: true, wpUsername: "", wpAppPassword: "", clearWpPassword: false };

function StyleSamples({ site, onApply }: { site: Site; onApply: (tone: string, styleGuide: string) => void }) {
  const { data: samples, reload } = useLoad(() => api.get<StyleSample[]>(`/api/sites/${site.id}/style-samples`));
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [count, setCount] = useState(3);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <strong>Beispielbeiträge (Stilvorlage)</strong>
      <span className="muted">Die KI orientiert sich beim Schreiben an Satzbau, Ansprache und Gliederung dieser Beiträge – Inhalte übernimmt sie nicht. Die jeweils drei neuesten werden verwendet.</span>
      {samples?.map((s) => (
        <div key={s.id} className="row spread">
          <span>{s.title} <span className="muted">({s.text.length.toLocaleString("de-DE")} Zeichen)</span></span>
          <button type="button" className="link" onClick={() => run(async () => { await api.del(`/api/style-samples/${s.id}`); await reload(); })}>entfernen</button>
        </div>
      ))}
      <div className="row">
        <label className="narrow">Anzahl<input type="number" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
        <button type="button" className="secondary" disabled={busy || !site.baseUrl} title={site.baseUrl ? "" : "Adresse der Website fehlt"} onClick={() => run(async () => {
          const r = await api.post<{ imported: number; skipped: number }>(`/api/sites/${site.id}/style-samples/import-wordpress`, { count });
          setMessage(`${r.imported} Beitrag/Beiträge importiert, ${r.skipped} übersprungen.`);
          await reload();
        })}>Neueste Beiträge von der Website importieren</button>
        <button type="button" className="secondary" disabled={busy || !samples?.length} onClick={() => run(async () => {
          const r = await api.post<{ tone: string; styleGuide: string }>(`/api/sites/${site.id}/derive-style`);
          onApply(r.tone, r.styleGuide);
          setMessage("Vorschlag in Tonalität und Leitfaden eingetragen – bitte prüfen und speichern.");
        })}>Stil aus Beispielen ableiten</button>
      </div>
      <details>
        <summary>Beitrag selbst einfügen</summary>
        <div className="stack">
          <label>Titel<input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <label>Text<textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Beitragstext hier einfügen (mindestens 200 Zeichen)" /></label>
          <div><button type="button" className="secondary" disabled={busy || !title.trim() || !text.trim()} onClick={() => run(async () => {
            await api.post(`/api/sites/${site.id}/style-samples`, { title, text });
            setTitle("");
            setText("");
            await reload();
          })}>Als Beispiel speichern</button></div>
        </div>
      </details>
      {message && <span className="muted">{message}</span>}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

function WordPressAccess({
  site,
  form,
  set,
  setForm,
}: {
  site?: Site;
  form: typeof EMPTY;
  set: (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => void;
  setForm: (f: typeof EMPTY) => void;
}) {
  const [result, setResult] = useState<WpTestResult>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <div className="stack">
      <strong>WordPress-Anbindung (Entwürfe direkt anlegen)</strong>
      <span className="muted">
        Benutzername und ein <em>Anwendungspasswort</em> aus WordPress (Benutzer → Profil → Anwendungspasswörter). Beiträge werden nur als Entwurf angelegt, nie veröffentlicht. Die Adresse muss mit https:// beginnen.
        Das Passwort wird verschlüsselt gespeichert und nie wieder angezeigt.
      </span>
      <div className="row">
        <label>WordPress-Benutzername<input value={form.wpUsername} onChange={set("wpUsername")} autoComplete="off" /></label>
        <label>
          Anwendungspasswort
          <input
            type="password"
            value={form.wpAppPassword}
            onChange={set("wpAppPassword")}
            autoComplete="new-password"
            placeholder={site?.hasWpPassword && !form.clearWpPassword ? "gespeichert – leer lassen, um es zu behalten" : "xxxx xxxx xxxx xxxx xxxx xxxx"}
          />
        </label>
      </div>
      <div className="row">
        {site && (
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError(undefined);
              setResult(undefined);
              try {
                setResult(await api.post<WpTestResult>(`/api/sites/${site.id}/wordpress/test`));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Verbindung testen (mit gespeicherten Daten)
          </button>
        )}
        {site?.hasWpPassword && (
          <label className="row" style={{ flexDirection: "row", gap: 6, flex: "0 0 auto" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={form.clearWpPassword} onChange={(e) => setForm({ ...form, clearWpPassword: e.target.checked })} />
            Passwort beim Speichern entfernen
          </label>
        )}
      </div>
      {!site && <span className="muted">Speichere die Website zuerst, danach kannst du die Verbindung testen.</span>}
      {site && <span className="muted">Geänderte Zugangsdaten zuerst speichern, dann testen.</span>}
      {result && (
        <span className={result.canPublish ? "ok" : "error"}>
          ✓ Angemeldet als {result.user}. {result.canPublish ? "Beiträge anlegen: erlaubt." : "Dieser Benutzer darf keine Beiträge anlegen."}{" "}
          {result.rankMath ? "Rank Math erkannt." : "Rank Math nicht erkannt."} {result.categories} Kategorien gefunden.
        </span>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

function SiteForm({ initial, onSaved, onCancel }: { initial?: Site; onSaved: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial, wpAppPassword: "", clearWpPassword: false });
  const [error, setError] = useState<string>();
  const set = (key: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  return (
    <form
      className="card stack"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          if (initial) await api.put(`/api/sites/${initial.id}`, form);
          else await api.post("/api/sites", form);
          if (!initial) setForm(EMPTY);
          setError(undefined);
          onSaved();
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
    >
      <div className="row">
        <label>Name<input value={form.name} onChange={set("name")} required /></label>
        <label>Adresse (URL)<input value={form.baseUrl} onChange={set("baseUrl")} placeholder="https://" /></label>
        <label className="narrow">Sprache<input value={form.language} onChange={set("language")} /></label>
      </div>
      <label>Zielgruppe<textarea rows={2} value={form.audience} onChange={set("audience")} placeholder="z. B. Geschäftsführer und Rechtsabteilungen mittelständischer Unternehmen" /></label>
      <label>Tonalität<textarea rows={2} value={form.tone} onChange={set("tone")} placeholder="z. B. sachlich, präzise, Sie-Ansprache, keine Werbesprache" /></label>
      <label>Stilleitfaden / Beispiele<textarea rows={5} value={form.styleGuide} onChange={set("styleGuide")} placeholder="Gewünschte Länge, Gliederung, Besonderheiten – oder Auszüge aus bestehenden Beiträgen als Stilvorlage" /></label>
      <label>Fester Schlussabsatz <span className="muted">(optional, HTML erlaubt: &lt;a&gt;, &lt;strong&gt;, &lt;em&gt;)</span>
        <textarea rows={3} value={form.closingHtml} onChange={set("closingHtml")} placeholder='z. B. <p>Haben Sie Fragen zum Datenschutz in Ihrem Unternehmen? <a href="https://…/kontakt/">Sprechen Sie uns an.</a></p>' />
      </label>
      <label>Bevorzugte interne Links <span className="muted">(optional, eine Zeile je Seite: „Titel | Adresse“ – die KI verlinkt sie, wo es passt)</span>
        <textarea rows={3} value={form.preferredLinks} onChange={set("preferredLinks")} placeholder={"Datenschutzberatung | https://…/leistungen/datenschutz/\nKontakt | https://…/kontakt/"} />
      </label>
      <label>Disclaimer (wird unter jeden Beitrag gesetzt)<textarea rows={3} value={form.disclaimer} onChange={set("disclaimer")} /></label>
      <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={form.labelAiImages} onChange={(e) => setForm({ ...form, labelAiImages: e.target.checked })} />
        KI-generierte Beitragsbilder kennzeichnen: Bildunterschrift („Bild: KI-generiert“), Vermerk in der Bilddatei und sichtbarer Hinweis im Beitrag
      </label>
      {form.labelAiImages && (
        <label>Wortlaut des sichtbaren Hinweises im Beitrag <span className="muted">(erscheint nur bei KI-generiertem Beitragsbild; leer = Standard)</span>
          <input value={form.aiNoticeText} onChange={set("aiNoticeText")} placeholder="Beitragsbild: KI-generiert." />
        </label>
      )}
      <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={form.competitionCheck} onChange={(e) => setForm({ ...form, competitionCheck: e.target.checked })} />
        <span>Vor dem Schreiben die Top-Ergebnisse zum Suchbegriff auswerten (Zielumfang, Gliederung) <span className="muted">– kostet eine zusätzliche Websuche je Beitrag</span></span>
      </label>
      <WordPressAccess site={initial} form={form} set={set} setForm={setForm} />
      {initial && <StyleSamples site={initial} onApply={(tone, styleGuide) => setForm({ ...form, tone, styleGuide })} />}
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit">{initial ? "Speichern" : "Website anlegen"}</button>
        {onCancel && <button type="button" className="secondary" onClick={onCancel}>Abbrechen</button>}
      </div>
    </form>
  );
}

export function SitesPage() {
  const { data: sites, error, reload } = useLoad(() => api.get<Site[]>("/api/sites"));
  const [editing, setEditing] = useState<string>();

  return (
    <>
      <PageHeader title="Websites" subtitle="Für jede Website hinterlegst du Zielgruppe, Ton, Stilvorlagen und den WordPress-Zugang." />
      {error && <p className="error">{error}</p>}
      {sites?.length === 0 && <EmptyState icon="globe" title="Noch keine Website">Lege unten deine erste Website an.</EmptyState>}
      <div className="stack-lg">
        {sites?.map((site) =>
          editing === site.id ? (
            <SiteForm key={site.id} initial={site} onCancel={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }} />
          ) : (
            <div key={site.id} className="card">
              <div className="row spread" style={{ alignItems: "flex-start" }}>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="card-title"><Icon name="globe" /> {site.name}</div>
                  {site.baseUrl && <a className="muted" href={site.baseUrl} target="_blank" rel="noreferrer noopener">{site.baseUrl}</a>}
                  <div className="muted">{site.audience || "Keine Zielgruppe hinterlegt"}</div>
                  <div className="chips">
                    {site.hasWpPassword && site.wpUsername ? <Chip tone="success" icon="check">WordPress verbunden ({site.wpUsername})</Chip> : <Chip tone="neutral" icon="alert">WordPress nicht eingerichtet</Chip>}
                    <Chip tone={site.disclaimer ? "success" : "warn"} icon={site.disclaimer ? "check" : "alert"}>{site.disclaimer ? "Disclaimer hinterlegt" : "Kein Disclaimer"}</Chip>
                    {site.closingHtml && <Chip tone="info" icon="check">Schlussabsatz</Chip>}
                    {site.preferredLinks.trim() && <Chip tone="info" icon="check">Wunschlinks</Chip>}
                    {site.labelAiImages && <Chip tone="info" icon="image">KI-Bilder werden gekennzeichnet</Chip>}
                  </div>
                </div>
                <div className="row">
                  <button className="secondary" onClick={() => setEditing(site.id)}><Icon name="pen" size={16} /> Bearbeiten</button>
                  <button
                    className="secondary danger"
                    onClick={async () => {
                      if (confirm(`„${site.name}“ samt allen Uploads und Beiträgen löschen?`)) {
                        await api.del(`/api/sites/${site.id}`);
                        void reload();
                      }
                    }}
                  >
                    <Icon name="trash" size={16} /> Löschen
                  </button>
                </div>
              </div>
            </div>
          ),
        )}
      </div>
      <h2>Neue Website</h2>
      <SiteForm onSaved={() => void reload()} />
    </>
  );
}
