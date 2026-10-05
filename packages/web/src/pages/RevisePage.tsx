import { useState } from "react";
import { api, type RadarState, type Site, type SitePostSummary } from "../api";
import { useLoad } from "../hooks";
import { Chip, EmptyState, Icon, PageHeader, Spinner, relTime } from "../ui";

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

const VERDICT = {
  outdated: { label: "Überholt", tone: "danger" },
  update_recommended: { label: "Aktualisierung empfohlen", tone: "warn" },
  current: { label: "Aktuell", tone: "success" },
} as const;

function RadarCard({ siteId }: { siteId: string }) {
  const radar = useLoad(() => api.get<RadarState>(`/api/sites/${siteId}/radar`), (r) => r.enabled && r.runRequested);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const state = radar.data;

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await radar.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="card">{radar.error ? <span className="error">{radar.error}</span> : <span className="muted"><Spinner /> Radar wird geladen …</span>}</div>;

  return (
    <div className="card stack">
      <div className="card-title"><Icon name="sparkles" /> Aktualisierungsradar</div>
      <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
        <input type="checkbox" style={{ width: "auto" }} checked={state.enabled} disabled={busy} onChange={(e) => void act(() => api.put(`/api/sites/${siteId}/radar`, { enabled: e.target.checked }))} />
        <span><strong>{state.enabled ? "Eingeschaltet" : "Ausgeschaltet"}</strong> – prüft wöchentlich ältere Beiträge dieser Website auf neue Rechtsprechung und Gesetzesänderungen</span>
      </label>
      <span className="muted">
        Je Lauf werden bis zu 5 Beiträge geprüft, die älter als 90 Tage sind (jeder Beitrag = eine Websuche mit der KI, also Kosten). Ein geprüfter Beitrag kommt frühestens nach 180 Tagen wieder dran. Es wird nichts verändert – du entscheidest, ob du einen Beitrag überarbeiten lässt.
      </span>
      {state.enabled && (
        <div className="row">
          <button className="secondary" disabled={busy || state.runRequested} onClick={() => void act(() => api.post(`/api/sites/${siteId}/radar/run`))}>
            {state.runRequested ? <><Spinner /> Prüfung läuft …</> : "Jetzt prüfen"}
          </button>
          <span className="muted">
            {state.lastRunAt ? `Letzter Lauf ${relTime(state.lastRunAt)}` : "Noch kein Lauf"} · geprüft: {state.stats.checked}, davon aktuell: {state.stats.current}
            {state.stats.dismissed > 0 ? `, ausgeblendet: ${state.stats.dismissed}` : ""}
          </span>
        </div>
      )}
      {state.lastError && <span className="error">Letzter Lauf fehlgeschlagen: {state.lastError}</span>}
      {state.enabled && state.findings.length === 0 && state.stats.checked > 0 && <span className="muted">Aktuell gibt es keine Beiträge, die überarbeitet werden sollten.</span>}
      {state.findings.map((f) => (
        <div key={f.id} className="card stack" style={{ boxShadow: "none" }}>
          <div className="row spread">
            <strong>{f.title}</strong>
            <Chip tone={VERDICT[f.verdict].tone}>{VERDICT[f.verdict].label}</Chip>
          </div>
          <span>{f.summary}</span>
          {f.reasons.length > 0 && <ul>{f.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>}
          {f.sources.length > 0 && (
            <span className="muted">
              Quellen: {f.sources.map((s, i) => <span key={s.url}>{i > 0 && " · "}<a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a></span>)}
            </span>
          )}
          <div className="row">
            {f.revisionPostId ? (
              <a href={`#/posts/${f.revisionPostId}`}>Überarbeitung ansehen →</a>
            ) : (
              <button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const post = await api.post<{ id: string }>(`/api/radar/findings/${f.id}/revise`);
                    window.location.hash = `#/posts/${post.id}`;
                  })
                }
              >
                Überarbeitung starten
              </button>
            )}
            <a href={f.url} target="_blank" rel="noreferrer noopener" className="muted">Original ansehen</a>
            <button className="secondary" disabled={busy} onClick={() => void act(() => api.post(`/api/radar/findings/${f.id}/dismiss`))}>Ausblenden</button>
          </div>
        </div>
      ))}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

export function RevisePage() {
  const sites = useLoad(() => api.get<Site[]>("/api/sites"));
  const [siteId, setSiteId] = useState("");
  const [search, setSearch] = useState("");
  const [posts, setPosts] = useState<SitePostSummary[]>();
  const [selected, setSelected] = useState<SitePostSummary>();
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const usable = (sites.data ?? []).filter((s) => s.baseUrl);
  const activeId = siteId || usable[0]?.id || "";

  async function loadPosts(term = search) {
    if (!activeId) return;
    setBusy(true);
    setError(undefined);
    setSelected(undefined);
    try {
      setPosts(await api.get<SitePostSummary[]>(`/api/sites/${activeId}/wp-posts${term.trim() ? `?search=${encodeURIComponent(term.trim())}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    if (!selected) return;
    setBusy(true);
    setError(undefined);
    try {
      const post = await api.post<{ id: string }>(`/api/sites/${activeId}/revisions`, { wpPostId: selected.id, instructions });
      window.location.hash = `#/posts/${post.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Bestehende Beiträge überarbeiten" subtitle="Die KI aktualisiert einen veröffentlichten Beitrag – Original bleibt unverändert, das Ergebnis wird ein neuer Entwurf." />
      {sites.data && usable.length === 0 && <EmptyState icon="globe" title="Keine Website mit Adresse">Trage bei der Website unter „Websites“ die Adresse ein, damit die Beiträge geladen werden können.</EmptyState>}
      {usable.length > 0 && (
        <div className="card stack">
          <div className="row">
            <label>Website
              <select value={activeId} onChange={(e) => { setSiteId(e.target.value); setPosts(undefined); setSelected(undefined); }}>
                {usable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      )}
      {usable.length > 0 && activeId && <RadarCard key={activeId} siteId={activeId} />}
      {usable.length > 0 && (
        <div className="card stack">
          <div className="card-title"><Icon name="search" /> Beitrag auswählen</div>
          <div className="row">
            <label>Suche (optional)
              <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void loadPosts(); }} placeholder="z. B. Bußgeld, Videoüberwachung …" />
            </label>
            <button disabled={busy} onClick={() => void loadPosts()}>{posts ? "Neu laden" : "Beiträge laden"}</button>
          </div>
          {busy && !posts && <span className="muted"><Spinner /> Beiträge werden geladen …</span>}
          {posts && posts.length === 0 && <span className="muted">Keine veröffentlichten Beiträge gefunden.</span>}
          {posts && posts.length > 0 && (
            <div className="list">
              {posts.map((p) => (
                <button key={p.id} type="button" className={`list-item${selected?.id === p.id ? " active" : ""}`} onClick={() => setSelected(p)} style={{ textAlign: "left" }}>
                  <strong>{p.title}</strong>
                  <span className="muted" style={{ flex: "0 1 55%" }}>{p.date ? dateFormat.format(new Date(p.date)) : ""}{p.excerpt ? ` · ${p.excerpt.slice(0, 120)}` : ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      {selected && (
        <div className="card stack">
          <div className="card-title"><Icon name="pen" /> Überarbeitung von „{selected.title}“</div>
          <a href={selected.url} target="_blank" rel="noreferrer noopener" className="muted">Original ansehen <Icon name="external" size={14} /></a>
          <label>Was soll sich ändern? <span className="muted">(optional)</span>
            <textarea rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="z. B. Neues Urteil des BGH ergänzen, Bußgeldrahmen aktualisieren, Einstieg kürzer fassen. Ohne Angabe prüft die KI auf Aktualität, Verständlichkeit und SEO." />
          </label>
          <span className="muted">Die KI recherchiert aktuelle Entwicklungen, überarbeitet den Text, prüft die Fakten und setzt passende interne Links auf andere Beiträge der Website. Beim Senden an WordPress entsteht ein neuer Entwurf; der veröffentlichte Beitrag wird nie überschrieben.</span>
          <div><button disabled={busy} onClick={start}>{busy ? "Bitte warten …" : "Überarbeitung starten"}</button></div>
        </div>
      )}
      {error && <span className="error">{error}</span>}
    </>
  );
}
