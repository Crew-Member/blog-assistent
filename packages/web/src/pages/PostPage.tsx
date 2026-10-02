import { useEffect, useState } from "react";
import { POST_LABEL, api, isBusy, type FactCheck, type PostDetail } from "../api";
import { useLoad } from "../hooks";

const FACT_LABEL: Record<FactCheck["status"], string> = {
  passed: "Faktencheck bestanden – keine Beanstandungen",
  revised: "Faktencheck: Text wurde korrigiert",
  needs_review: "Faktencheck: bitte vor Veröffentlichung prüfen",
  skipped: "Faktencheck nicht durchgeführt – Entwurf ungeprüft",
};
const PROBLEM_LABEL = { unsupported: "nicht belegt", contradicted: "widerspricht den Belegen", imprecise: "ungenau" } as const;
const ACTION_LABEL = { removed: "entfernt", softened: "entschärft", flagged: "unverändert – bitte prüfen" } as const;
const REF_LABEL = { aktenzeichen: "Aktenzeichen", norm: "Norm", datum: "Datum" } as const;

function FactCheckPanel({ check, claims }: { check: FactCheck; claims: string[] }) {
  const missing = check.references.filter((r) => !r.found);
  return (
    <div className={`card ${check.status === "passed" || check.status === "revised" ? "" : "warn"}`}>
      <strong>{FACT_LABEL[check.status]}</strong>
      <p>{check.summary}</p>
      {check.error && <p className="error">{check.error}</p>}
      {check.issues.length > 0 && (
        <ul>
          {check.issues.map((i, n) => (
            <li key={n}>
              „{i.claim}“ – {PROBLEM_LABEL[i.problem]}, {ACTION_LABEL[i.action]}
              <div className="muted">{i.evidence}</div>
            </li>
          ))}
        </ul>
      )}
      {check.references.length > 0 && (
        <p className="muted">
          Fundstellen im Text: {check.references.length}, davon in Recherche/Unterlagen wiederzufinden: {check.references.length - missing.length}.
          {missing.length > 0 && <> Nicht wiederzufinden: {missing.map((r) => `${REF_LABEL[r.kind]} ${r.text}`).join("; ")}</>}
        </p>
      )}
      {claims.length > 0 && (
        <>
          <strong>Offen – bitte prüfen:</strong>
          <ul>{claims.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </>
      )}
    </div>
  );
}

export function PostPage({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api.get<PostDetail>(`/api/posts/${id}`), (p) => isBusy(p.status));
  const [form, setForm] = useState({ title: "", slug: "", metaDescription: "", focusKeyword: "", excerpt: "", contentHtml: "" });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    if (data?.status === "DRAFT_READY") {
      setForm({
        title: data.title ?? "",
        slug: data.slug ?? "",
        metaDescription: data.metaDescription ?? "",
        focusKeyword: data.focusKeyword ?? "",
        excerpt: data.excerpt ?? "",
        contentHtml: data.contentHtml ?? "",
      });
    }
  }, [data?.status, data?.title]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Lade …</p>;
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [key]: e.target.value }); setSaved(false); };

  return (
    <>
      <p><a href={`#/submissions/${data.topic.submissionId}`}>← Zum Upload</a></p>
      <div className="row spread">
        <h1>{data.title ?? data.topic.title}</h1>
        <span className={`badge ${data.status.toLowerCase()}`}>{POST_LABEL[data.status]}</span>
      </div>
      <p className="muted">{data.site.name}</p>

      {isBusy(data.status) && <p className="muted">Die KI recherchiert und schreibt – das kann einige Minuten dauern. Die Seite aktualisiert sich selbst.</p>}
      {data.status === "FAILED" && (
        <div className="card">
          <p className="error">{data.error}</p>
          <button onClick={async () => { await api.post(`/api/posts/${id}/regenerate`); void reload(); }}>Erneut versuchen</button>
        </div>
      )}

      {data.status === "DRAFT_READY" && (
        <>
          {data.factCheck ? (
            <FactCheckPanel check={data.factCheck} claims={data.unverifiedClaims} />
          ) : (
            data.unverifiedClaims.length > 0 && (
              <div className="card warn">
                <strong>Bitte vor Veröffentlichung prüfen – nicht belegt:</strong>
                <ul>{data.unverifiedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )
          )}
          <div className="grid">
            <div className="stack">
              <label>Titel<input value={form.title} onChange={set("title")} /></label>
              <label>Slug<input value={form.slug} onChange={set("slug")} /></label>
              <label>Fokus-Keyword<input value={form.focusKeyword} onChange={set("focusKeyword")} /></label>
              <label>Meta-Description <span className="muted">({form.metaDescription.length}/155)</span><textarea rows={2} value={form.metaDescription} onChange={set("metaDescription")} /></label>
              <label>Auszug<textarea rows={3} value={form.excerpt} onChange={set("excerpt")} /></label>
              <label>Inhalt (HTML)<textarea rows={18} value={form.contentHtml} onChange={set("contentHtml")} className="mono" /></label>
              {saveError && <p className="error">{saveError}</p>}
              <div className="row">
                <button
                  onClick={async () => {
                    try {
                      await api.put(`/api/posts/${id}`, form);
                      setSaved(true);
                      setSaveError(undefined);
                      void reload();
                    } catch (e) {
                      setSaveError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                >
                  Änderungen speichern
                </button>
                {saved && <span className="muted">Gespeichert</span>}
                <button className="secondary" onClick={async () => { if (confirm("Neu recherchieren und schreiben? Manuelle Änderungen gehen verloren.")) { await api.post(`/api/posts/${id}/regenerate`); void reload(); } }}>Neu erstellen</button>
              </div>
            </div>
            <div>
              <div className="card preview">
                <h1>{form.title}</h1>
                <div dangerouslySetInnerHTML={{ __html: form.contentHtml }} />
              </div>
              {data.sources.length > 0 && (
                <div className="card">
                  <strong>Quellen</strong>
                  <ul>{data.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a><div className="muted">{s.note}</div></li>)}</ul>
                </div>
              )}
              {data.seoChecks.length > 0 && (
                <div className="card">
                  <strong>SEO-Prüfung</strong>
                  <ul className="files">
                    {data.seoChecks.map((c) => (
                      <li key={c.id}>
                        <span className={c.ok ? "ok" : "error"}>{c.ok ? "✓" : "✗"}</span> {c.label} <span className="muted">– {c.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.secondaryKeywords.length > 0 && <div>{data.secondaryKeywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>}
            </div>
          </div>
          {data.researchNotes && <details className="card"><summary>Recherchenotizen der KI</summary><pre>{data.researchNotes}</pre></details>}
        </>
      )}
      <hr />
      <button className="secondary danger" onClick={async () => { if (confirm("Beitrag löschen?")) { await api.del(`/api/posts/${id}`); window.location.hash = `#/submissions/${data.topic.submissionId}`; } }}>Beitrag löschen</button>
    </>
  );
}
