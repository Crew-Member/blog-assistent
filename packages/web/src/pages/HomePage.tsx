import { useRef, useState } from "react";
import { POST_LABEL, SUBMISSION_LABEL, api, isBusy, type PostListItem, type Site, type SubmissionListItem } from "../api";
import { useLoad } from "../hooks";

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
        PDFs, Mails (.eml), Word, Text oder Bilder hierher ziehen – oder klicken
        <input ref={input} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      </div>
      {files.length > 0 && (
        <ul className="files">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`}>
              {f.name} <span className="muted">({Math.ceil(f.size / 1024)} KB)</span>
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
      <button disabled={busy || files.length === 0 || !siteId} onClick={submit}>{busy ? "Lade hoch …" : "Hochladen & Themen vorschlagen lassen"}</button>
    </div>
  );
}

export function HomePage() {
  const sites = useLoad(() => api.get<Site[]>("/api/sites"));
  const submissions = useLoad(() => api.get<SubmissionListItem[]>("/api/submissions"), (list) => list.some((s) => isBusy(s.status)));
  const posts = useLoad(() => api.get<PostListItem[]>("/api/posts"), (list) => list.some((p) => isBusy(p.status)));

  if (sites.data && sites.data.length === 0) {
    return (
      <div className="card">
        <h1>Willkommen</h1>
        <p>Lege zuerst unter <a href="#/sites">Websites</a> mindestens eine Website mit Zielgruppe und Tonalität an.</p>
      </div>
    );
  }

  return (
    <>
      <h1>Neuer Upload</h1>
      {sites.data && <Upload sites={sites.data} onDone={() => { void submissions.reload(); }} />}

      <h2>Letzte Uploads</h2>
      {submissions.data?.length === 0 && <p className="muted">Noch nichts hochgeladen.</p>}
      {submissions.data?.map((s) => (
        <a key={s.id} className="card item" href={`#/submissions/${s.id}`}>
          <div>
            <strong>{s.site.name}</strong> <span className="muted">· {s._count.documents} Datei(en) · {new Date(s.createdAt).toLocaleString("de-DE")}</span>
            {s.note && <div className="muted">{s.note}</div>}
          </div>
          <span className={`badge ${s.status.toLowerCase()}`}>{SUBMISSION_LABEL[s.status]}</span>
        </a>
      ))}

      <h2>Beiträge</h2>
      {posts.data?.length === 0 && <p className="muted">Noch keine Beiträge erstellt.</p>}
      {posts.data?.map((p) => (
        <a key={p.id} className="card item" href={`#/posts/${p.id}`}>
          <div>
            <strong>{p.title ?? "(wird erstellt)"}</strong> <span className="muted">· {p.site.name}</span>
            {p.error && <div className="error">{p.error}</div>}
          </div>
          <span className={`badge ${p.status.toLowerCase()}`}>{POST_LABEL[p.status]}</span>
        </a>
      ))}
    </>
  );
}
