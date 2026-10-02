import { useState } from "react";
import { api, type Site } from "../api";
import { useLoad } from "../hooks";

const EMPTY = { name: "", baseUrl: "", language: "de", audience: "", tone: "", styleGuide: "", disclaimer: "" };

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
