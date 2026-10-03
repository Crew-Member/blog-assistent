import { POST_LABEL, SUBMISSION_LABEL, api, isBusy, type SubmissionDetail } from "../api";
import { useLoad } from "../hooks";
import { Chip, EmptyState, Icon, PageHeader, POST_TONE, SkeletonPage, StatusChip, SUBMISSION_TONE, Spinner } from "../ui";

export function SubmissionPage({ id }: { id: string }) {
  const { data, error, reload } = useLoad(
    () => api.get<SubmissionDetail>(`/api/submissions/${id}`),
    (s) => isBusy(s.status) || s.topics.some((t) => t.posts.some((p) => isBusy(p.status))),
  );

  if (error) return <p className="error">{error}</p>;
  if (!data) return <SkeletonPage />;

  return (
    <>
      <a className="back" href="#/"><Icon name="arrowLeft" size={16} /> Zurück zur Übersicht</a>
      <PageHeader title={data.site.name} subtitle={data.note ? `Hinweis: ${data.note}` : undefined}>
        <StatusChip status={data.status} label={SUBMISSION_LABEL[data.status]} tones={SUBMISSION_TONE} />
      </PageHeader>

      <div className="card stack">
        <div className="card-title"><Icon name="file" /> Unterlagen</div>
        <div className="chips">
          {data.documents.map((d) => (
            <span key={d.id} className="doc-chip">
              <Icon name="file" size={15} />
              <span className="name">{d.filename}</span>
              <span className="muted">{Math.ceil(d.sizeBytes / 1024)} KB</span>
            </span>
          ))}
        </div>
      </div>

      {data.status === "FAILED" && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <p className="error"><Icon name="alert" /> Analyse fehlgeschlagen: {data.error}</p>
          <div>
            <button onClick={async () => { await api.post(`/api/submissions/${id}/reanalyze`); void reload(); }}><Icon name="refresh" size={16} /> Erneut versuchen</button>
          </div>
        </div>
      )}
      {isBusy(data.status) && (
        <div className="card row" style={{ marginTop: 16 }}>
          <Spinner />
          <span className="muted">Die KI liest die Unterlagen und schlägt Themen vor – das dauert meist ein bis zwei Minuten. Die Seite aktualisiert sich selbst.</span>
        </div>
      )}

      {data.topics.length > 0 && <h2>Vorgeschlagene Themen</h2>}
      {data.status === "ANALYZED" && data.topics.length === 0 && (
        <EmptyState icon="layers" title="Keine Themen gefunden">Die KI hat in den Unterlagen kein Beitragsthema erkannt. Lade andere Unterlagen hoch oder versuche es erneut.</EmptyState>
      )}
      <div className="stack-lg">
        {data.topics.map((t, i) => (
          <div key={t.id} className="card stack">
            <div className="row spread" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="muted" style={{ fontSize: "0.8rem", fontWeight: 600 }}>THEMA {i + 1}</div>
                <strong style={{ fontSize: "1.05rem" }}>{t.title}</strong>
              </div>
              {t.posts.length > 0 && <Chip tone="success" icon="check">{t.posts.length} Beitrag/Beiträge</Chip>}
            </div>
            <div>{t.summary}</div>
            <div className="muted"><strong>Blickwinkel:</strong> {t.angle}</div>
            {t.keyFacts.length > 0 && (
              <details>
                <summary>Eckdaten aus den Unterlagen ({t.keyFacts.length})</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>{t.keyFacts.map((f, n) => <li key={n}>{f}</li>)}</ul>
              </details>
            )}
            {t.keywords.length > 0 && <div>{t.keywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>}
            <div className="row">
              <button onClick={async () => { await api.post(`/api/topics/${t.id}/posts`); void reload(); }}><Icon name="pen" size={16} /> Beitrag erstellen</button>
              {t.posts.map((p) => (
                <a key={p.id} href={`#/posts/${p.id}`} className={`chip chip-${POST_TONE[p.status]}`}>
                  {isBusy(p.status) ? <Spinner /> : <Icon name="file" size={13} />} {p.title ?? POST_LABEL[p.status]}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {data.status === "ANALYZED" && (
        <div style={{ marginTop: 16 }}>
          <button className="secondary" onClick={async () => { await api.post(`/api/submissions/${id}/reanalyze`); void reload(); }}><Icon name="refresh" size={16} /> Themen neu vorschlagen lassen</button>
        </div>
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
        <Icon name="trash" size={16} /> Upload löschen
      </button>
    </>
  );
}
