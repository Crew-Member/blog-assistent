import { useState } from "react";
import { api, type Site, type StyleSample } from "../api";
import { useLoad } from "../hooks";

const EMPTY = { name: "", baseUrl: "", language: "de", audience: "", tone: "", styleGuide: "", disclaimer: "" };

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

function SiteForm({ initial, onSaved, onCancel }: { initial?: Site; onSaved: () => void; onCancel?: () => void }) {
  const [form, setForm] = useState(initial ?? EMPTY);
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
      <label>Disclaimer (wird unter jeden Beitrag gesetzt)<textarea rows={3} value={form.disclaimer} onChange={set("disclaimer")} /></label>
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
      <h1>Websites</h1>
      {error && <p className="error">{error}</p>}
      {sites?.map((site) =>
        editing === site.id ? (
          <SiteForm key={site.id} initial={site} onCancel={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void reload(); }} />
        ) : (
          <div key={site.id} className="card">
            <div className="row spread">
              <div>
                <strong>{site.name}</strong> <span className="muted">{site.baseUrl}</span>
                <div className="muted">{site.audience || "Keine Zielgruppe hinterlegt"}</div>
              </div>
              <div className="row">
                <button className="secondary" onClick={() => setEditing(site.id)}>Bearbeiten</button>
                <button
                  className="secondary danger"
                  onClick={async () => {
                    if (confirm(`„${site.name}“ samt allen Uploads und Beiträgen löschen?`)) {
                      await api.del(`/api/sites/${site.id}`);
                      void reload();
                    }
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          </div>
        ),
      )}
      <h2>Neue Website</h2>
      <SiteForm onSaved={() => void reload()} />
    </>
  );
}
