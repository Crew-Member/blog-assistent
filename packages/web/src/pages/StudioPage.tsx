import { useRef, useState } from "react";
import { api, type PostListItem, type Site } from "../api";
import { useLoad } from "../hooks";
import { EmptyState, Icon, PageHeader, Spinner } from "../ui";

interface RestyleResult {
  mimeType: string;
  dataBase64: string;
  provider: string;
}

function toBlob(result: RestyleResult): Blob {
  const bytes = Uint8Array.from(atob(result.dataBase64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: result.mimeType });
}

export function StudioPage() {
  const sites = useLoad(() => api.get<Site[]>("/api/sites"));
  const posts = useLoad(() => api.get<PostListItem[]>("/api/posts"));
  const [siteId, setSiteId] = useState("");
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [rights, setRights] = useState(false);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ url: string; blob: Blob; name: string }>();
  const [postId, setPostId] = useState("");
  const [note, setNote] = useState<string>();
  const input = useRef<HTMLInputElement>(null);

  const list = sites.data ?? [];
  const active = list.find((s) => s.id === siteId) ?? list[0];
  const ready = (posts.data ?? []).filter((p) => p.status === "DRAFT_READY" && p.site.id === active?.id);

  function pick(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    if (preview) URL.revokeObjectURL(preview);
    if (result) URL.revokeObjectURL(result.url);
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(undefined);
    setError(undefined);
    setNote(undefined);
  }

  async function run() {
    if (!file || !active) return;
    setBusy(true);
    setError(undefined);
    setNote(undefined);
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("instruction", instruction);
      form.append("confirmRights", rights ? "true" : "false");
      const r = await api.post<RestyleResult>(`/api/sites/${active.id}/image-restyle`, form);
      const blob = toBlob(r);
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), blob, name: `${file.name.replace(/\.[^.]+$/, "") || "bild"}-bildstil.png` });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function useAsFeatured() {
    if (!result || !postId) return;
    setBusy(true);
    setError(undefined);
    try {
      const form = new FormData();
      form.append("file", result.blob, result.name);
      form.append("sourceNote", "KI-bearbeitet (eigenes Foto, Bildstudio)");
      form.append("aiGenerated", "true");
      await api.post(`/api/posts/${postId}/image/upload`, form);
      setNote("Das Bild wurde als Beitragsbild übernommen. Alt-Text und Bildunterschrift kannst du im Beitrag ergänzen.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Bildstudio" subtitle="Ein beliebiges Foto im Bildstil einer Website umgestalten lassen." />
      {sites.data && list.length === 0 && <EmptyState icon="globe" title="Keine Website angelegt">Lege unter „Websites“ eine Website an und trage dort den Bildstil ein.</EmptyState>}
      {active && (
        <div className="card stack">
          {list.length > 1 && (
            <label>Website
              <select value={active.id} onChange={(e) => { setSiteId(e.target.value); setPostId(""); }}>
                {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          {active.imageStyleGuide?.trim() ? (
            <details>
              <summary>Bildstil von „{active.name}“ (aus den Website-Einstellungen)</summary>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{active.imageStyleGuide}</p>
            </details>
          ) : (
            <span className="error">Für „{active.name}“ ist noch kein Bildstil hinterlegt. Trage ihn unter <a href="#/sites">Websites</a> → Bearbeiten → „Bildstil für Beitragsbilder“ ein.</span>
          )}
          <div
            className={`dropzone ${over ? "over" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
            onClick={() => input.current?.click()}
          >
            <Icon name="upload" size={30} />
            <strong>Foto hierher ziehen – oder klicken</strong>
            <span className="muted">PNG, JPEG oder WebP, höchstens 10 MB</span>
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </div>
          <label>Zusätzlicher Wunsch <span className="muted">(optional)</span>
            <textarea rows={2} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="z. B. Himmel heller, mehr Wärme im Licht, Hintergrund ruhiger" />
          </label>
          <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={rights} onChange={(e) => setRights(e.target.checked)} />
            <span>Auf dem Foto sind keine erkennbaren Personen zu sehen, oder ich habe die Rechte (Recht am eigenen Bild) und die Einwilligung für die Bearbeitung.</span>
          </label>
          <div className="row">
            <button disabled={busy || !file || !rights || !active.imageStyleGuide?.trim()} onClick={() => void run()}>
              {busy && !result ? <><Spinner /> Wird umgestaltet … (bis zu 2 Minuten)</> : "Im Bildstil umgestalten"}
            </button>
            <span className="muted">Kostet je Bearbeitung etwa wie ein neu erzeugtes Bild. Das Ergebnis gilt als KI-bearbeitet und wird in der Datei entsprechend vermerkt.</span>
          </div>
          {error && <span className="error">{error}</span>}
        </div>
      )}
      {(preview || result) && (
        <div className="card stack">
          <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
            {preview && (
              <div className="stack" style={{ flex: 1, minWidth: 220 }}>
                <strong>Original</strong>
                <img src={preview} alt="Original" style={{ maxWidth: "100%", borderRadius: 8 }} />
              </div>
            )}
            {result && (
              <div className="stack" style={{ flex: 1, minWidth: 220 }}>
                <strong>Im Bildstil</strong>
                <img src={result.url} alt="Umgestaltetes Bild" style={{ maxWidth: "100%", borderRadius: 8 }} />
                <div className="row">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = result.url;
                      a.download = result.name;
                      a.click();
                    }}
                  >
                    Herunterladen
                  </button>
                </div>
              </div>
            )}
          </div>
          {result && (
            <div className="stack">
              <strong>Als Beitragsbild verwenden</strong>
              <div className="row">
                <select value={postId} onChange={(e) => setPostId(e.target.value)}>
                  <option value="">Beitrag wählen …</option>
                  {ready.map((p) => <option key={p.id} value={p.id}>{p.title ?? "(ohne Titel)"}</option>)}
                </select>
                <button className="secondary" disabled={busy || !postId} onClick={() => void useAsFeatured()}>Übernehmen</button>
              </div>
              {ready.length === 0 && <span className="muted">Es gibt keinen fertigen Beitrag dieser Website, dem das Bild zugeordnet werden könnte.</span>}
              {note && <span className="ok">{note}</span>}
            </div>
          )}
        </div>
      )}
    </>
  );
}
