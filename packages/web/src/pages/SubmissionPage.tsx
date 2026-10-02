import { POST_LABEL, SUBMISSION_LABEL, api, isBusy, type SubmissionDetail } from "../api";
import { useLoad } from "../hooks";

export function SubmissionPage({ id }: { id: string }) {
  const { data, error, reload } = useLoad(
    () => api.get<SubmissionDetail>(`/api/submissions/${id}`),
    (s) => isBusy(s.status) || s.topics.some((t) => t.posts.some((p) => isBusy(p.status))),
  );

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p className="muted">Lade …</p>;

  return (
    <>
      <p><a href="#/">← Zurück</a></p>
      <div className="row spread">
        <h1>{data.site.name}</h1>
        <span className={`badge ${data.status.toLowerCase()}`}>{SUBMISSION_LABEL[data.status]}</span>
      </div>
      <div className="card">
        <strong>Unterlagen</strong>
        <ul>{data.documents.map((d) => <li key={d.id}>{d.filename} <span className="muted">({Math.ceil(d.sizeBytes / 1024)} KB)</span></li>)}</ul>
        {data.note && <p className="muted">Hinweis: {data.note}</p>}
      </div>

      {data.status === "FAILED" && (
        <div className="card">
          <p className="error">Analyse fehlgeschlagen: {data.error}</p>
          <button onClick={async () => { await api.post(`/api/submissions/${id}/reanalyze`); void reload(); }}>Erneut versuchen</button>
        </div>
      )}
      {isBusy(data.status) && <p className="muted">Die KI liest die Unterlagen und schlägt Themen vor – das dauert meist ein bis zwei Minuten.</p>}

      {data.topics.length > 0 && <h2>Vorgeschlagene Themen</h2>}
      {data.topics.map((t) => (
        <div key={t.id} className="card stack">
          <strong>{t.title}</strong>
          <div>{t.summary}</div>
          <div className="muted">Blickwinkel: {t.angle}</div>
          {t.keyFacts.length > 0 && <ul>{t.keyFacts.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          {t.keywords.length > 0 && <div>{t.keywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>}
          <div className="row">
            <button onClick={async () => { await api.post(`/api/topics/${t.id}/posts`); void reload(); }}>Beitrag erstellen</button>
            {t.posts.map((p) => (
              <a key={p.id} href={`#/posts/${p.id}`} className={`badge ${p.status.toLowerCase()}`}>{p.title ?? POST_LABEL[p.status]}</a>
            ))}
          </div>
        </div>
      ))}
      {data.status === "ANALYZED" && (
        <button className="secondary" onClick={async () => { await api.post(`/api/submissions/${id}/reanalyze`); void reload(); }}>Themen neu vorschlagen lassen</button>
      )}
      <hr />
      <button
        className="secondary danger"
        onClick={async () => {
          if (confirm("Upload samt Themen und Beiträgen löschen?")) {
            await api.del(`/api/submissions/${id}`);
            window.location.hash = "#/";
          }
        }}
      >
        Upload löschen
      </button>
    </>
  );
}
