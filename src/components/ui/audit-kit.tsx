import type { ReactNode } from "react";

export function SectionHeader({
  action,
  count,
  description,
  eyebrow,
  title
}: {
  action?: ReactNode;
  count?: number;
  description?: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-line pb-3 md:flex-row md:items-end md:justify-between">
      <div>
        {eyebrow ? <p className="text-xs font-semibold uppercase text-muted">{eyebrow}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {typeof count === "number" ? (
            <span className="rounded-full border border-line bg-white px-2 py-0.5 text-xs font-medium text-muted">{count}</span>
          ) : null}
        </div>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  hint,
  icon,
  label,
  tone = "neutral",
  value
}: {
  hint?: string;
  icon?: ReactNode;
  label: string;
  tone?: "neutral" | "good" | "warning" | "danger" | "accent";
  value: number | string;
}) {
  return (
    <div className={`rounded-md border bg-white p-4 ${metricToneClass(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        {icon ? <span className="text-current">{icon}</span> : null}
      </div>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-muted">{hint}</p> : null}
    </div>
  );
}

export function ScoreTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className={`rounded-md border px-3 py-3 ${scoreClass(value)}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">{label}</p>
        <p className="text-lg font-semibold">{typeof value === "number" ? Math.round(value) : "-"}</p>
      </div>
      <div className="mt-3 h-1.5 rounded-full bg-white/70">
        <div className="h-full rounded-full bg-current" style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
      </div>
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warning" | "danger" | "info" | "accent" }) {
  return <span className={`inline-flex w-fit items-center rounded-full border px-2 py-1 text-xs font-medium ${badgeToneClass(tone)}`}>{children}</span>;
}

export function Notice({
  children,
  title,
  tone = "info"
}: {
  children: ReactNode;
  title: string;
  tone?: "info" | "warning" | "danger" | "good";
}) {
  return (
    <div className={`rounded-md border px-4 py-4 ${noticeToneClass(tone)}`}>
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-1 text-sm leading-6">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-md border border-line bg-white px-4 py-8 text-center text-sm text-muted">{children}</div>;
}

export function TextList({ items, label, limit = 6 }: { items: string[]; label?: string; limit?: number }) {
  return (
    <div className="min-w-0">
      {label ? <p className="text-xs font-semibold uppercase text-muted">{label}</p> : null}
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 break-words text-sm leading-6 text-ink">
          {items.slice(0, limit).map((item, index) => (
            <li key={`${item}-${index}`} className="[overflow-wrap:anywhere]">
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted">-</p>
      )}
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2">
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

export function scoreClass(value: number | null) {
  if (value === null) return "border-slate-200 bg-slate-50 text-slate-700";
  if (value >= 85) return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (value >= 60) return "border-sky-200 bg-sky-50 text-sky-900";
  if (value >= 40) return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-red-200 bg-red-50 text-red-900";
}

export function priorityTone(priority: string): "danger" | "warning" | "info" {
  if (priority === "critical" || priority === "high") return "danger";
  if (priority === "medium") return "warning";
  return "info";
}

function metricToneClass(tone: "neutral" | "good" | "warning" | "danger" | "accent") {
  const classes = {
    neutral: "border-line text-muted",
    good: "border-emerald-200 text-emerald-800",
    warning: "border-amber-200 text-amber-800",
    danger: "border-red-200 text-red-800",
    accent: "border-teal-200 text-accent"
  };

  return classes[tone];
}

function badgeToneClass(tone: "neutral" | "good" | "warning" | "danger" | "info" | "accent") {
  const classes = {
    neutral: "border-slate-200 bg-slate-50 text-slate-700",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    accent: "border-teal-200 bg-teal-50 text-teal-900"
  };

  return classes[tone];
}

function noticeToneClass(tone: "info" | "warning" | "danger" | "good") {
  const classes = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-900",
    good: "border-emerald-200 bg-emerald-50 text-emerald-900"
  };

  return classes[tone];
}
