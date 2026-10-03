import { useRef, useState } from "react";
import { POST_LABEL, SUBMISSION_LABEL, api, isBusy, type PostListItem, type Site, type SubmissionListItem } from "../api";
import { useLoad } from "../hooks";
import { EmptyState, Icon, PageHeader, POST_TONE, Stat, StatusChip, SUBMISSION_TONE, relTime } from "../ui";

function Upload({ sites, onDone }: { sites: Site[]; onDone: () => void }) {
  const [siteId, setSiteId] = useState(sites[0]?.id ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [note, setNote] = useState("");
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => list && setFiles((prev) => [...prev, ...Array.from(list)]);

  async function submit() {
    setBusy(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append("note", note);
      files.forEach((f) => form.append("files", f, f.name));
      const created = await api.post<{ id: string }>(`/api/sites/${siteId}/submissions`, form);
      setFiles([]);
      setNote("");
      onDone();
      window.location.hash = `#/submissions/${created.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card stack">
      <div className="card-title"><Icon name="upload" /> Unterlagen hochladen</div>
      <label>
        Für welche Website?
        <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div
        className={`dropzone ${over ? "over" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}
        onClick={() => input.current?.click()}
      >
        <Icon name="upload" size={30} />
        <strong>PDFs, Mails (.eml, .msg), Word, Text oder Bilder hierher ziehen – oder klicken</strong>
        <span className="muted">Urteile, Mitteilungen, Newsletter – die KI schlägt daraus Beitragsthemen vor.</span>
        <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              <span className="doc-chip"><Icon name="file" size={15} /><span className="name">{f.name}</span><span className="muted">{Math.ceil(f.size / 1024)} KB</span></span>
              <button className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>entfernen</button>
            </li>
          ))}
        </ul>
      )}
      <label>
        Hinweis zur Aufgabe (optional)
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="z. B. Schwerpunkt auf Folgen für Arbeitgeber legen" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="lg" disabled={busy || files.length === 0 || !siteId} onClick={submit}>{busy ? "Lade hoch …" : "Hochladen & Themen vorschlagen lassen"}</button>
    </div>
  );
}

export function HomePage() {
  const sites = useLoad(() => api.get<Site[]>("/api/sites"));
  const submissions = useLoad(() => api.get<SubmissionListItem[]>("/api/submissions"), (list) => list.some((s) => isBusy(s.status)));
  const posts = useLoad(() => api.get<PostListItem[]>("/api/posts"), (list) => list.some((p) => isBusy(p.status)));

  if (sites.data && sites.data.length === 0) {
    return (
      <>
        <PageHeader title="Willkommen" subtitle="In drei Schritten vom Urteil zum WordPress-Entwurf." />
        <EmptyState icon="globe" title="Noch keine Website angelegt">
          Lege zuerst unter <a href="#/sites">Websites</a> mindestens eine Website mit Zielgruppe und Tonalität an.
        </EmptyState>
      </>
    );
  }

  const postList = posts.data ?? [];
  const submissionList = submissions.data ?? [];
  const working = submissionList.filter((s) => isBusy(s.status)).length + postList.filter((p) => isBusy(p.status)).length;

  return (
    <>
      <PageHeader title="Beiträge erstellen" subtitle="Unterlagen hochladen, Themen wählen, recherchieren und prüfen lassen – am Ende liegt ein Entwurf in WordPress." />

      <div className="stats">
        <Stat icon="file" label="Uploads" value={submissionList.length} />
        <Stat icon="sparkles" label="In Arbeit" value={working} tone="info" />
        <Stat icon="pen" label="Entwürfe fertig" value={postList.filter((p) => p.status === "DRAFT_READY").length} tone="success" />
        <Stat icon="send" label="In WordPress" value={postList.filter((p) => p.wpPostId !== null).length} tone="warn" />
      </div>

      {sites.data && <Upload sites={sites.data} onDone={() => { void submissions.reload(); }} />}

      <h2>Beiträge</h2>
      {postList.length === 0 ? (
        <EmptyState icon="pen" title="Noch keine Beiträge">Sobald du bei einem Themenvorschlag „Beitrag erstellen“ wählst, erscheint er hier.</EmptyState>
      ) : (
        <div className="list">
          {postList.map((p) => (
            <a key={p.id} className="list-item" href={`#/posts/${p.id}`}>
              <div className="list-main">
                <div className="list-title">{p.title ?? "(wird erstellt)"}</div>
                <div className="list-meta">
                  <span className="chip">{p.site.name}</span>
                  <span><Icon name="clock" size={13} /> {relTime(p.createdAt)}</span>
                  {p.wpPostId !== null && <span className="chip chip-warn"><Icon name="send" size={12} /> in WordPress</span>}
                </div>
                {p.error && <div className="error list-meta">{p.error}</div>}
              </div>
              <div className="list-end">
                <StatusChip status={p.status} label={POST_LABEL[p.status]} tones={POST_TONE} />
                <Icon name="chevron" />
              </div>
            </a>
          ))}
        </div>
      )}

      <h2>Letzte Uploads</h2>
      {submissionList.length === 0 ? (
        <EmptyState icon="upload" title="Noch nichts hochgeladen">Ziehe oben eine Datei in das Feld, um zu beginnen.</EmptyState>
      ) : (
        <div className="list">
          {submissionList.map((s) => (
            <a key={s.id} className="list-item" href={`#/submissions/${s.id}`}>
              <div className="list-main">
                <div className="list-title">{s.site.name}</div>
                <div className="list-meta">
                  <span><Icon name="file" size={13} /> {s._count.documents} Datei(en)</span>
                  <span><Icon name="clock" size={13} /> {relTime(s.createdAt)}</span>
                  {s.note && <span>{s.note}</span>}
                </div>
              </div>
              <div className="list-end">
                <StatusChip status={s.status} label={SUBMISSION_LABEL[s.status]} tones={SUBMISSION_TONE} />
                <Icon name="chevron" />
              </div>
            </a>
          ))}
        </div>
      )}
    </>
  );
}
