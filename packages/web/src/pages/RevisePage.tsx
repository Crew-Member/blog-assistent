import { useState } from "react";
import { api, type Site, type SitePostSummary } from "../api";
import { useLoad } from "../hooks";
import { EmptyState, Icon, PageHeader, Spinner } from "../ui";

const dateFormat = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

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
          <div className="card-title"><Icon name="search" /> Beitrag auswählen</div>
          <div className="row">
            <label>Website
              <select value={activeId} onChange={(e) => { setSiteId(e.target.value); setPosts(undefined); setSelected(undefined); }}>
                {usable.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
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
