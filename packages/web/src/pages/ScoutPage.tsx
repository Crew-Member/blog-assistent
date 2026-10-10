import { useState } from "react";
import { api, type ScoutState, type Site } from "../api";
import { useLoad } from "../hooks";
import { Chip, EmptyState, Icon, PageHeader, Spinner, relTime } from "../ui";

const URGENCY = {
  high: { label: "Dringend", tone: "danger" },
  medium: { label: "Aktuell", tone: "warn" },
  low: { label: "Zeitlos, wieder relevant", tone: "info" },
} as const;

function ScoutCard({ site }: { site: Site }) {
  const scout = useLoad(() => api.get<ScoutState>(`/api/sites/${site.id}/scout`), (s) => s.enabled && s.runRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const state = scout.data;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await scout.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card">{scout.error ? <span className="error">{scout.error}</span> : <span className="muted"><Spinner /> Themen-Scout wird geladen …</span>}</div>;

  return (
    <div className="card stack">
      <div className="card-title"><Icon name="sparkles" /> Themen-Scout</div>
      <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={state.enabled} disabled={busy} onChange={(e) => void act(() => api.put(`/api/sites/${site.id}/scout`, { enabled: e.target.checked }))} />
        <span><strong>{state.enabled ? "Eingeschaltet" : "Ausgeschaltet"}</strong> – sucht wöchentlich im Netz, welche Themen aus deinem Portfolio gerade aktuell sind</span>
      </label>
      <span className="muted">
        Ausgangspunkt sind dein Themenportfolio (unter „Websites“) und die Kategorien der Website. Die KI recherchiert neue Urteile, Gesetzesänderungen, Fristen und Berichterstattung, lässt bereits behandelte Themen weg und begründet jeden Vorschlag. Das Suchvolumen bei Google kennt sie nicht – „gefragt“ heißt hier: aktuell und viel besprochen. Pro Lauf fallen Kosten für eine Websuche mit der KI an. Es wird nichts ohne dein Zutun geschrieben.
      </span>
      {state.enabled && (
        <div className="row">
          <button className="secondary" disabled={busy || state.runRequested} onClick={() => void act(() => api.post(`/api/sites/${site.id}/scout/run`))}>
            {state.runRequested ? <><Spinner /> Suche läuft …</> : "Jetzt nach Themen suchen"}
          </button>
          <span className="muted">
            {state.lastRunAt ? `Letzter Lauf ${relTime(state.lastRunAt)}` : "Noch kein Lauf"}
            {state.dismissed > 0 ? ` · abgelehnt: ${state.dismissed}` : ""}
          </span>
        </div>
      )}
      {state.lastError && <span className="error">Letzter Lauf fehlgeschlagen: {state.lastError}</span>}
      {state.enabled && !state.runRequested && state.ideas.length === 0 && state.lastRunAt && !state.lastError && <span className="muted">Beim letzten Lauf wurden keine neuen Themen gefunden.</span>}
      {state.ideas.map((idea) => (
        <div key={idea.id} className="card stack" style={{ boxShadow: "none" }}>
          <div className="row spread">
            <strong>{idea.title}</strong>
            <Chip tone={URGENCY[idea.urgency].tone}>{URGENCY[idea.urgency].label}</Chip>
          </div>
          <span className="muted">{[idea.area, idea.keyword && `Suchbegriff: ${idea.keyword}`].filter(Boolean).join(" · ")}</span>
          <span><strong>Warum jetzt:</strong> {idea.whyNow}</span>
          {idea.angle && <span><strong>Nutzen für Leser:</strong> {idea.angle}</span>}
          {idea.sources.length > 0 && (
            <span className="muted">
              Quellen: {idea.sources.map((s, i) => <span key={s.url}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a></span>)}
            </span>
          )}
          <div className="row">
            {idea.postId ? (
              <a href={`#/posts/${idea.postId}`}>Beitrag ansehen →</a>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const post = await api.post<{ id: string }>(`/api/scout/ideas/${idea.id}/post`);
                    window.location.hash = `#/posts/${post.id}`;
                  })
                }
              >
                Beitrag dazu erstellen
              </button>
            )}
            {!idea.postId && <button className="secondary" disabled={busy} onClick={() => void act(() => api.post(`/api/scout/ideas/${idea.id}/dismiss`))}>Ablehnen</button>}
          </div>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function ScoutPage() {
  const sites = useLoad(() => api.get<Site[]>("/api/sites"));
  const [siteId, setSiteId] = useState("");
  const list = sites.data ?? [];
  const active = list.find((s) => s.id === siteId) ?? list[0];

  return (
    <>
      <PageHeader title="Themenideen" subtitle="Aktuell gefragte Themen aus deinem Portfolio – die Auswahl für den nächsten Beitrag." />
      {sites.data && list.length === 0 && <EmptyState icon="globe" title="Keine Website angelegt">Lege unter „Websites“ eine Website an.</EmptyState>}
      {list.length > 1 && (
        <div className="card stack">
          <div className="row">
            <label>Website
              <select value={active?.id ?? ""} onChange={(e) => setSiteId(e.target.value)}>
                {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {active && !active.portfolio.trim() && !active.baseUrl && <span className="error">Für diese Website sind weder ein Themenportfolio noch eine Adresse hinterlegt. Trage unter „Websites“ Schwerpunkte ein.</span>}
      {active && <ScoutCard key={active.id} site={active} />}
    </>
  );
}
