import type { ReactNode } from "react";
import { isBusy, type PostStatus, type SubmissionStatus } from "./api";

const PATHS: Record<string, string[]> = {
  home: ["M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z", "M9 22V12h6v10"],
  globe: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M2 12h20", "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"],
  upload: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", "M17 8l-5-5-5 5", "M12 3v12"],
  file: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  check: ["M22 11.08V12a10 10 0 1 1-5.93-9.14", "M22 4L12 14.01l-3-3"],
  alert: ["M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  image: ["M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z", "M8.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z", "M21 15l-5-5L5 21"],
  send: ["M22 2L11 13", "M22 2l-7 20-4-9-9-4 20-7z"],
  search: ["M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M21 21l-4.35-4.35"],
  external: ["M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6", "M15 3h6v6", "M10 14L21 3"],
  refresh: ["M23 4v6h-6", "M1 20v-6h6", "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"],
  trash: ["M3 6h18", "M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6", "M10 11v6", "M14 11v6", "M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"],
  copy: ["M11 9h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2z", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  pen: ["M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z", "M16 8L2 22", "M17.5 15H9"],
  logout: ["M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4", "M16 17l5-5-5-5", "M21 12H9"],
  clock: ["M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z", "M12 6v6l4 2"],
  chevron: ["M9 18l6-6-6-6"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"],
  plus: ["M12 5v14", "M5 12h14"],
  layers: ["M12 2L2 7l10 5 10-5-10-5z", "M2 17l10 5 10-5", "M2 12l10 5 10-5"],
  sparkles: ["M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z", "M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8-1.8-.7 1.8-.7z"],
  lock: ["M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z", "M7 11V7a5 5 0 0 1 10 0v4"],
  arrowLeft: ["M19 12H5", "M12 19l-7-7 7-7"],
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]!.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Läuft" />;
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="logo" style={{ width: size, height: size }} aria-hidden="true">
      <Icon name="pen" size={Math.round(size * 0.58)} />
    </span>
  );
}

export type Tone = "neutral" | "info" | "success" | "warn" | "danger";

export function Chip({ tone = "neutral", busy, icon, children, title }: { tone?: Tone; busy?: boolean; icon?: IconName; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {busy ? <Spinner /> : icon ? <Icon name={icon} size={13} /> : <span className="dot" />}
      {children}
    </span>
  );
}

export const SUBMISSION_TONE: Record<SubmissionStatus, Tone> = { UPLOADED: "info", ANALYZING: "info", ANALYZED: "success", FAILED: "danger" };
export const POST_TONE: Record<PostStatus, Tone> = { QUEUED: "info", RESEARCHING: "info", DRAFTING: "info", FACTCHECKING: "info", DRAFT_READY: "success", FAILED: "danger" };

export function StatusChip({ status, label, tones }: { status: string; label: string; tones: Record<string, Tone> }) {
  return <Chip tone={tones[status] ?? "neutral"} busy={isBusy(status)}>{label}</Chip>;
}

export function PageHeader({ title, subtitle, children }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{title}</strong>
      {children && <p className="muted">{children}</p>}
    </div>
  );
}

export function Stat({ icon, label, value, tone = "neutral" }: { icon: IconName; label: string; value: number | string; tone?: Tone }) {
  return (
    <div className="stat">
      <span className={`stat-icon tone-${tone}`}><Icon name={icon} size={20} /></span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export function Stepper({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="stepper" aria-label="Fortschritt">
      {steps.map((label, i) => {
        const state = failed && i === Math.max(current, 0) ? "failed" : i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={label} className={`step step-${state}`}>
            <span className="step-dot">{state === "done" ? <Icon name="check" size={12} /> : state === "active" ? <Spinner /> : state === "failed" ? "!" : i + 1}</span>
            <span className="step-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SkeletonPage() {
  return (
    <div className="stack" aria-busy="true">
      <div className="skeleton" style={{ height: 34, width: "40%" }} />
      <div className="skeleton" style={{ height: 120 }} />
      <div className="skeleton" style={{ height: 220 }} />
    </div>
  );
}

const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });

/** "vor 5 Minuten", "gestern" … */
export function relTime(iso: string): string {
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "gerade eben";
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString("de-DE");
}
