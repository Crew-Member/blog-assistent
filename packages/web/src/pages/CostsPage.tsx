import { useState } from "react";
import { api, type UsageOverview } from "../api";
import { useLoad } from "../hooks";
import { EmptyState, PageHeader, Stat, relTime } from "../ui";

export const usd = (n: number) => `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: n < 1 ? 3 : 2 })} USD`;

const PERIODS = [
  { days: 7, label: "7 Tage" },
  { days: 30, label: "30 Tage" },
  { days: 90, label: "90 Tage" },
  { days: 0, label: "Gesamt" },
];

export function CostsPage() {
  const [days, setDays] = useState(30);
  return (
    <>
      <PageHeader title="Kosten" subtitle="Geschätzter Verbrauch der KI (Tokens, Websuchen, Bilder) – je Schritt, Website und Beitrag.">
        <div className="row">
          {PERIODS.map((p) => (
            <button key={p.days} className={days === p.days ? "" : "secondary"} onClick={() => setDays(p.days)}>{p.label}</button>
          ))}
        </div>
      </PageHeader>
      <CostsBody key={days} days={days} />
    </>
  );
}

function CostsBody({ days }: { days: number }) {
  const { data: d, error } = useLoad(() => api.get<UsageOverview>(`/api/usage?days=${days}`));
  if (error) return <p className="error">{error}</p>;
  if (!d) return <p className="muted">Wird geladen …</p>;
  if (d.totals.calls === 0)
    return <EmptyState icon="layers" title="Noch keine Daten">Erfasst wird ab dem Update, das die Kostenübersicht eingeführt hat. Nach dem nächsten Beitrag erscheinen hier die Zahlen.</EmptyState>;
  const max = Math.max(...d.steps.map((s) => s.costUsd), 0.0001);
  return (
    <>
      <div className="stats">
        <Stat icon="layers" label="Kosten gesamt (geschätzt)" value={usd(d.totals.costUsd)} />
        <Stat icon="file" label="Beiträge mit Verbrauch" value={d.totals.posts} />
        <Stat icon="sparkles" label="Ø je Beitrag" value={usd(d.totals.avgPerPostUsd)} />
        <Stat icon="search" label="Websuchen · Bilder" value={`${d.totals.webSearches} · ${d.totals.images}`} />
      </div>

      <div className="card stack">
        <div className="card-title">Nach Schritt</div>
        {d.steps.map((s) => (
          <div key={s.step} className="stack" style={{ gap: 4 }}>
            <div className="row spread">
              <span>{s.label} <span className="muted">· {s.calls}× · {(s.inputTokens / 1000).toLocaleString("de-DE", { maximumFractionDigits: 0 })} Tsd. Eingabe, {(s.outputTokens / 1000).toLocaleString("de-DE", { maximumFractionDigits: 0 })} Tsd. Ausgabe{s.webSearches ? ` · ${s.webSearches} Websuchen` : ""}</span></span>
              <strong>{usd(s.costUsd)}</strong>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "var(--line)" }}>
              <div style={{ height: 6, borderRadius: 3, background: "var(--brand)", width: `${Math.max(2, (s.costUsd / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="grid">
        <div className="card stack">
          <div className="card-title">Nach Website</div>
          {d.bySite.map((s) => (
            <div key={s.siteId} className="row spread"><span>{s.name}</span><strong>{usd(s.costUsd)}</strong></div>
          ))}
        </div>
        <div className="card stack">
          <div className="card-title">Letzte Beiträge</div>
          {d.recentPosts.length === 0 && <span className="muted">Keine Beiträge im Zeitraum.</span>}
          {d.recentPosts.map((p) => (
            <div key={p.postId} className="row spread">
              <a href={`#/posts/${p.postId}`}>{p.title}</a>
              <span><strong>{usd(p.costUsd)}</strong> <span className="muted">· {relTime(p.lastAt)}</span></span>
            </div>
          ))}
        </div>
      </div>

      <p className="muted">
        Schätzung auf Basis der Token- und Suchzahlen der KI-Antworten und der Preise {d.prices.inputPerMTok} USD je Mio. Eingabe-Tokens, {d.prices.outputPerMTok} USD je Mio. Ausgabe-Tokens, {d.prices.searchPer1000} USD je 1.000 Websuchen
        {d.prices.imageUsd > 0 ? `, ${d.prices.imageUsd} USD je Bild` : " (Bildkosten nicht eingerechnet – IMAGE_COST_USD in der .env setzen)"}. Die Preise lassen sich in der .env anpassen (AI_PRICE_…); maßgeblich ist immer die Rechnung des Anbieters.
      </p>
    </>
  );
}
