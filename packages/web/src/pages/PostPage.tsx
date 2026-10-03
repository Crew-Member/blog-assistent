import { useEffect, useState } from "react";
import { POST_LABEL, api, isBusy, type FactCheck, type PostDetail, type PostImage, type WpPrepare, type WpPublishResult } from "../api";
import { useLoad } from "../hooks";
import { Chip, Icon, PageHeader, POST_TONE, SkeletonPage, Spinner, Stepper, StatusChip, type Tone } from "../ui";

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
      <div className="card-title"><Icon name={check.status === "passed" || check.status === "revised" ? "shield" : "alert"} /> {FACT_LABEL[check.status]}</div>
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


const stockLinks = (q: string) => [
  { name: "Pexels", url: `https://www.pexels.com/search/${encodeURIComponent(q)}/` },
  { name: "Unsplash", url: `https://unsplash.com/s/photos/${encodeURIComponent(q.trim().replace(/\s+/g, "-"))}` },
  { name: "Pixabay", url: `https://pixabay.com/images/search/${encodeURIComponent(q)}/` },
];

function ImagePanel({ post, onChanged }: { post: PostDetail; onChanged: () => void }) {
  const image = post.image;
  const features = useLoad(() => api.get<{ imageGeneration: string | null }>("/api/features"));
  const canGenerate = Boolean(features.data?.imageGeneration);
  const [form, setForm] = useState({ prompt: "", altText: "", caption: "", style: "illustration" as PostImage["style"] });
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [upload, setUpload] = useState<{ file?: File; source: string; ai: boolean; alt: string; caption: string }>({ source: "", ai: false, alt: "", caption: "" });

  useEffect(() => {
    if (image) setForm({ prompt: image.prompt, altText: image.altText, caption: image.caption, style: image.style });
    setDirty(false);
  }, [image?.id, image?.updatedAt]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const edit = (key: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [key]: e.target.value });
    setDirty(true);
  };
  const working = image?.status === "QUEUED" || image?.status === "GENERATING";
  const label = post.site.labelAiImages && image?.aiGenerated;
  const uploadOnly = Boolean(image && image.origin === "UPLOAD" && !image.prompt);
  const altValue = image ? form.altText : upload.alt;
  const captionValue = image ? form.caption : upload.caption;

  return (
    <div className="card stack">
      <div className="card-title"><Icon name="image" /> Beitragsbild</div>
      {!image && (
        <div className="row">
          <button disabled={busy} onClick={() => run(() => api.post(`/api/posts/${post.id}/image/plan`, { style: "illustration" }))}>{busy ? "Bitte warten …" : "Bildvorschlag: Illustration"}</button>
          <button className="secondary" disabled={busy} onClick={() => run(() => api.post(`/api/posts/${post.id}/image/plan`, { style: "photo" }))}>Bildvorschlag: Foto</button>
          <span className="muted">Die KI schreibt Prompt, Alt-Text und Bildunterschrift – ohne erkennbare Personen, Text oder Logos.</span>
        </div>
      )}

      {image && (
        <div className="grid">
          <div className="stack">
            {!uploadOnly && <label>Stil
              <select value={form.style} onChange={edit("style")} disabled>
                <option value="illustration">Illustration</option>
                <option value="photo">Foto</option>
              </select>
            </label>}
            {!uploadOnly && <label>Bild-Prompt (Englisch) <span className="muted">– auch für andere Bilddienste nutzbar</span>
              <textarea rows={5} value={form.prompt} onChange={edit("prompt")} />
            </label>}
            <label>Alt-Text (Barrierefreiheit, höchstens 125 Zeichen) <span className="muted">({form.altText.length})</span>
              <input value={form.altText} onChange={edit("altText")} />
            </label>
            <label>Bildunterschrift<input value={form.caption} onChange={edit("caption")} /></label>
            {label && <span className="muted">Beim Senden an WordPress wird „Bild: KI-generiert“ an die Unterschrift angehängt und im Bild vermerkt.</span>}
            <div className="row">
              <button disabled={busy || !dirty} onClick={() => run(() => api.put(`/api/posts/${post.id}/image`, { prompt: form.prompt, altText: form.altText, caption: form.caption }))}>Änderungen speichern</button>
              {!uploadOnly && <button
                className="secondary"
                disabled={busy || dirty}
                onClick={async () => {
                  await navigator.clipboard.writeText(form.prompt).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Kopiert" : "Prompt kopieren"}
              </button>}
            </div>
            <div className="row">
              {!uploadOnly && <button disabled={busy || dirty || working || !canGenerate} title={canGenerate ? "" : "Keine Bildgenerierung eingerichtet (IMAGE_PROVIDER)"} onClick={() => run(() => api.post(`/api/posts/${post.id}/image/generate`))}>
                {working ? "Bild wird erzeugt …" : image.hasFile && image.origin === "AI" ? "Neu generieren" : "Bild generieren"}
              </button>}
              <button className="secondary" disabled={busy || working} onClick={() => { if (!image.hasFile || confirm("Neuen Vorschlag erstellen? Das vorhandene Bild wird ersetzt.")) void run(() => api.post(`/api/posts/${post.id}/image/plan`, { style: form.style })); }}>Neuer Vorschlag</button>
              <button className="secondary danger" disabled={busy || working} onClick={() => run(() => api.del(`/api/posts/${post.id}/image`))}>Bild entfernen</button>
            </div>
            {!canGenerate && !uploadOnly && <span className="muted">Die automatische Bildgenerierung ist nicht eingerichtet. Du kannst den Prompt in einem anderen Bilddienst verwenden und das Ergebnis unten hochladen.</span>}
            {image.status === "FAILED" && image.error && <span className="error">{image.error}</span>}
          </div>

          <div className="stack">
            {image.hasFile ? (
              <>
                <img src={`/api/posts/${post.id}/image/file?v=${encodeURIComponent(image.updatedAt)}`} alt={form.altText} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--line)" }} />
                <span className="muted">
                  {image.origin === "AI" ? "KI-generiert" : image.aiGenerated ? "Hochgeladen (KI-generiert)" : "Hochgeladen"}
                  {image.sourceNote ? ` · ${image.sourceNote}` : ""}
                  {image.inWordPress ? " · in WordPress" : ""}
                </span>
              </>
            ) : (
              <div className="dropzone" style={{ cursor: "default" }}>{working ? "Bild wird erzeugt …" : "Noch kein Bild"}</div>
            )}
          </div>
        </div>
      )}

      {(
        <details open={!image}>
          <summary>Eigenes oder lizenzfreies Bild hochladen{image ? "" : " (ohne KI-Vorschlag)"}</summary>
          <div className="stack" style={{ marginTop: 8 }}>
            <span className="muted">
              Lizenzfreie Fotos suchen („{image?.searchQuery || post.focusKeyword || post.title || "legal documents"}“):{" "}
              {stockLinks(image?.searchQuery || post.focusKeyword || post.title || "legal documents").map((l, i) => (
                <span key={l.name}>{i > 0 && " · "}<a href={l.url} target="_blank" rel="noreferrer noopener">{l.name}</a></span>
              ))}
              . Lizenzbedingungen bitte selbst prüfen; Quelle und Lizenz werden mit dem Bild gespeichert.
            </span>
            <label>Bilddatei (PNG, JPEG oder WebP, höchstens 10 MB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setUpload({ ...upload, file: e.target.files?.[0] })} /></label>
            <label>Quelle und Lizenz (Pflicht)<input value={upload.source} onChange={(e) => setUpload({ ...upload, source: e.target.value })} placeholder="z. B. Pexels, Pexels-Lizenz, Foto: Name – oder: Eigenes Foto" /></label>
            {!image && (
              <>
                <label>Alt-Text (Barrierefreiheit, höchstens 125 Zeichen) <span className="muted">({upload.alt.length})</span><input value={upload.alt} onChange={(e) => setUpload({ ...upload, alt: e.target.value })} /></label>
                <label>Bildunterschrift (optional)<input value={upload.caption} onChange={(e) => setUpload({ ...upload, caption: e.target.value })} /></label>
              </>
            )}
            <label className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
              <input type="checkbox" style={{ width: "auto" }} checked={upload.ai} onChange={(e) => setUpload({ ...upload, ai: e.target.checked })} />
              Das Bild ist KI-generiert (z. B. aus einem anderen KI-Dienst) – wird entsprechend gekennzeichnet
            </label>
            <div>
              <button
                disabled={busy || !upload.file || upload.source.trim().length < 3}
                onClick={() =>
                  run(async () => {
                    const body = new FormData();
                    body.append("sourceNote", upload.source);
                    body.append("aiGenerated", String(upload.ai));
                    body.append("altText", altValue);
                    body.append("caption", captionValue);
                    body.append("file", upload.file!, upload.file!.name);
                    await api.post(`/api/posts/${post.id}/image/upload`, body);
                    setUpload({ source: "", ai: false, alt: "", caption: "" });
                  })
                }
              >
                Bild hochladen
              </button>
            </div>
          </div>
        </details>
      )}
      {error && <span className="error">{error}</span>}
    </div>
  );
}

function WordPressPanel({ post, dirty, onDone }: { post: PostDetail; dirty: boolean; onDone: () => void }) {
  const [prep, setPrep] = useState<WpPrepare>();
  const [selected, setSelected] = useState<number[]>([]);
  const [newSelected, setNewSelected] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<WpPublishResult>();

  async function load() {
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    try {
      const p = await api.post<WpPrepare>(`/api/posts/${post.id}/wordpress/prepare`);
      setPrep(p);
      setSelected(p.suggested);
      setNewSelected([]);
      setTags(p.tags.join(", "));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    setBusy(true);
    setError(undefined);
    try {
      const r = await api.post<WpPublishResult>(`/api/posts/${post.id}/wordpress/publish`, {
        categoryIds: selected,
        newCategories: newSelected,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      setResult(r);
      setPrep(undefined);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const editUrl = result?.editUrl ?? post.wpEditUrl;
  const seo = result?.seo ?? post.wpSeo;

  return (
    <div className="card stack">
      <div className="card-title"><Icon name="send" /> WordPress</div>
      {editUrl && (
        <div>
          Entwurf in WordPress: <a href={editUrl} target="_blank" rel="noreferrer noopener">im Editor öffnen</a>
          {post.wpPushedAt && <span className="muted"> · zuletzt gesendet {new Date(post.wpPushedAt).toLocaleString("de-DE")}</span>}
        </div>
      )}
      {seo && <div className={seo.status === "set" ? "ok" : "error"}>{seo.message}</div>}
      {dirty && <div className="error">Es gibt ungespeicherte Änderungen. Gesendet wird der gespeicherte Stand – bitte erst speichern.</div>}

      {!prep && (
        <div className="row">
          <button disabled={busy || dirty} onClick={load}>{busy ? "Bitte warten …" : editUrl ? "Entwurf in WordPress aktualisieren" : "An WordPress senden (als Entwurf)"}</button>
          {editUrl && <span className="muted">Änderungen, die du in WordPress am Entwurf gemacht hast, werden dabei überschrieben. Bereits veröffentlichte Beiträge werden nie angefasst.</span>}
        </div>
      )}

      {prep && (
        <>
          {prep.suggestionError && <div className="error">{prep.suggestionError}</div>}
          <div>
            <strong>Kategorien</strong> <span className="muted">– Vorschlag der KI vorausgewählt, bitte prüfen</span>
            <div className="stack" style={{ gap: 4, marginTop: 6, maxHeight: 220, overflow: "auto" }}>
              {prep.categories.map((c) => (
                <label key={c.id} className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={selected.includes(c.id)} onChange={() => setSelected(toggle(selected, c.id))} />
                  {c.parent ? "– " : ""}{c.name} <span className="muted">({c.count})</span>
                  {prep.suggested.includes(c.id) && <span className="tag">KI-Vorschlag</span>}
                </label>
              ))}
            </div>
          </div>
          {prep.newSuggestions.length > 0 && (
            <div>
              <strong>Neue Kategorie vorgeschlagen</strong> <span className="muted">– wird nur angelegt, wenn du sie ankreuzt</span>
              {prep.newSuggestions.map((name) => (
                <label key={name} className="row" style={{ flexDirection: "row", gap: 8, flex: "0 0 auto", color: "inherit" }}>
                  <input type="checkbox" style={{ width: "auto" }} checked={newSelected.includes(name)} onChange={() => setNewSelected(toggle(newSelected, name))} />
                  {name} <span className="tag">neu</span>
                </label>
              ))}
            </div>
          )}
          <label>Schlagwörter (durch Komma getrennt)<input value={tags} onChange={(e) => setTags(e.target.value)} /></label>
          <div className="row">
            <button disabled={busy} onClick={publish}>{busy ? "Sende …" : prep.existing ? "Entwurf aktualisieren" : "Als Entwurf in WordPress anlegen"}</button>
            <button className="secondary" disabled={busy} onClick={() => setPrep(undefined)}>Abbrechen</button>
          </div>
        </>
      )}
      {result?.image && result.image.status !== "none" && <div className={result.image.status === "set" ? "ok" : "error"}>{result.image.message}</div>}
      {result && <div className="ok">{result.updated ? "Entwurf in WordPress aktualisiert." : "Entwurf in WordPress angelegt."} Er ist noch nicht veröffentlicht.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  );
}

export function PostPage({ id }: { id: string }) {
  const { data, error, reload } = useLoad(() => api.get<PostDetail>(`/api/posts/${id}`), (p) => isBusy(p.status) || p.image?.status === "QUEUED" || p.image?.status === "GENERATING");
  const [form, setForm] = useState({ title: "", slug: "", metaDescription: "", focusKeyword: "", excerpt: "", contentHtml: "" });
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
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
  if (!data) return <SkeletonPage />;
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => { setForm({ ...form, [key]: e.target.value }); setSaved(false); setDirty(true); };
  const jump = (sectionId: string) => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const steps = ["Warteschlange", "Recherche", "Entwurf", "Faktencheck", "Fertig"];
  const stepIndex = { QUEUED: 0, RESEARCHING: 1, DRAFTING: 2, FACTCHECKING: 3, DRAFT_READY: 4, FAILED: 1 }[data.status];
  const seoOk = data.seoChecks.filter((c) => c.ok).length;
  const factTone: Tone = !data.factCheck ? "neutral" : data.factCheck.status === "passed" || data.factCheck.status === "revised" ? "success" : "warn";
  const factText = !data.factCheck ? "Faktencheck offen" : { passed: "Faktencheck bestanden", revised: "Faktencheck: korrigiert", needs_review: "Faktencheck: prüfen", skipped: "Faktencheck fehlt" }[data.factCheck.status];

  return (
    <>
      <a className="back" href={`#/submissions/${data.topic.submissionId}`}><Icon name="arrowLeft" size={16} /> Zum Upload</a>
      <PageHeader title={data.title ?? data.topic.title} subtitle={data.site.name}>
        <StatusChip status={data.status} label={POST_LABEL[data.status]} tones={POST_TONE} />
      </PageHeader>

      {data.revisionOf && (
        <div className="notice">
          <Icon name="pen" size={16} /> Überarbeitung von{" "}
          <a href={data.revisionOf.url} target="_blank" rel="noreferrer noopener">„{data.revisionOf.title}“</a>. Beim Senden an WordPress entsteht ein <strong>neuer Entwurf</strong>; der veröffentlichte Beitrag bleibt unverändert. Übernimm danach die Änderungen in WordPress (oder ersetze den alten Beitrag) – die Änderungsliste steht unten bei den Recherchenotizen.
        </div>
      )}
      {data.status !== "DRAFT_READY" && (
        <div className="card stack">
          <Stepper steps={steps} current={stepIndex} failed={data.status === "FAILED"} />
          {isBusy(data.status) && <span className="muted">Die KI recherchiert und schreibt – das kann einige Minuten dauern. Die Seite aktualisiert sich selbst.</span>}
        </div>
      )}
      {data.status === "FAILED" && (
        <div className="card stack" style={{ marginTop: 16 }}>
          <p className="error"><Icon name="alert" /> {data.error}</p>
          <div><button onClick={async () => { await api.post(`/api/posts/${id}/regenerate`); void reload(); }}><Icon name="refresh" size={16} /> Erneut versuchen</button></div>
        </div>
      )}

      {data.status === "DRAFT_READY" && (
        <div className="summary" style={{ marginBottom: 16 }} aria-label="Kurzübersicht">
          <button className={`chip chip-${factTone}`} onClick={() => jump("sec-check")}><Icon name={factTone === "success" ? "shield" : "alert"} size={13} /> {factText}</button>
          {data.unverifiedClaims.length > 0 && <button className="chip chip-warn" onClick={() => jump("sec-check")}><Icon name="alert" size={13} /> {data.unverifiedClaims.length} Punkt(e) prüfen</button>}
          {data.seoChecks.length > 0 && <button className={`chip chip-${seoOk === data.seoChecks.length ? "success" : "warn"}`} onClick={() => jump("sec-seo")}><Icon name="search" size={13} /> SEO {seoOk}/{data.seoChecks.length}</button>}
          <button className={`chip chip-${data.image?.hasFile ? "success" : "neutral"}`} onClick={() => jump("sec-image")}><Icon name="image" size={13} /> {data.image?.hasFile ? "Beitragsbild" : "Kein Bild"}</button>
          <button className={`chip chip-${data.wpPostId ? "success" : "neutral"}`} onClick={() => jump("sec-wp")}><Icon name="send" size={13} /> {data.wpPostId ? "Entwurf in WordPress" : "Nicht in WordPress"}</button>
        </div>
      )}

      {data.status === "DRAFT_READY" && (
        <div className="stack-lg">
          <div id="sec-check" className="card-section">
            {data.factCheck ? (
              <FactCheckPanel check={data.factCheck} claims={data.unverifiedClaims} />
            ) : (
              data.unverifiedClaims.length > 0 && (
                <div className="card warn">
                  <div className="card-title"><Icon name="alert" /> Bitte vor Veröffentlichung prüfen – nicht belegt</div>
                  <ul>{data.unverifiedClaims.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )
            )}
          </div>

          <div className="grid">
            <div className="stack">
              <div className="card stack">
                <div className="card-title"><Icon name="pen" /> Text bearbeiten</div>
                <label>Titel<input value={form.title} onChange={set("title")} /></label>
                <div className="row">
                  <label>Slug<input value={form.slug} onChange={set("slug")} /></label>
                  <label>Fokus-Keyword<input value={form.focusKeyword} onChange={set("focusKeyword")} /></label>
                </div>
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
                        setDirty(false);
                        setSaveError(undefined);
                        void reload();
                      } catch (e) {
                        setSaveError(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    <Icon name="check" size={16} /> Änderungen speichern
                  </button>
                  {saved && <Chip tone="success" icon="check">Gespeichert</Chip>}
                  {dirty && !saved && <Chip tone="warn">Ungespeicherte Änderungen</Chip>}
                  <button className="secondary" onClick={async () => { if (confirm("Neu recherchieren und schreiben? Manuelle Änderungen gehen verloren.")) { await api.post(`/api/posts/${id}/regenerate`); void reload(); } }}><Icon name="refresh" size={16} /> Neu erstellen</button>
                </div>
              </div>
            </div>
            <div className="stack">
              <div className="card preview">
                <h1>{form.title}</h1>
                <div dangerouslySetInnerHTML={{ __html: form.contentHtml }} />
              </div>
              {data.sources.length > 0 && (
                <div className="card">
                  <div className="card-title"><Icon name="external" /> Quellen</div>
                  <ul>{data.sources.map((s, i) => <li key={i}><a href={s.url} target="_blank" rel="noreferrer noopener">{s.title || s.url}</a><div className="muted">{s.note}</div></li>)}</ul>
                </div>
              )}
              {data.seoChecks.length > 0 && (
                <div id="sec-seo" className="card card-section">
                  <div className="card-title"><Icon name="search" /> SEO-Prüfung <span className="muted" style={{ fontWeight: 500 }}>({seoOk}/{data.seoChecks.length})</span></div>
                  <ul className="seo-list">
                    {data.seoChecks.map((c) => (
                      <li key={c.id}>
                        <span className={c.ok ? "ok" : "error"}>{c.ok ? "✓" : "✗"}</span> <span>{c.label} <span className="muted">– {c.detail}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.secondaryKeywords.length > 0 && <div>{data.secondaryKeywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>}
            </div>
          </div>

          <div id="sec-image" className="card-section"><ImagePanel post={data} onChanged={() => void reload()} /></div>
          <div id="sec-wp" className="card-section"><WordPressPanel post={data} dirty={dirty} onDone={() => void reload()} /></div>
          {data.researchNotes && <details className="card"><summary>Recherchenotizen der KI</summary><pre>{data.researchNotes}</pre></details>}
        </div>
      )}
      <hr />
      <button className="secondary danger" onClick={async () => { if (confirm("Beitrag löschen?")) { await api.del(`/api/posts/${id}`); window.location.hash = `#/submissions/${data.topic.submissionId}`; } }}><Icon name="trash" size={16} /> Beitrag löschen</button>
    </>
  );
}
