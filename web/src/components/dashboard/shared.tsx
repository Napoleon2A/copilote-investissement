"use client";

/**
 * Helpers et constantes partagés par les composants du dashboard.
 */

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function formatChange(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/* ── Tones ─────────────────────────────────────────────────────────────── */
export const TONE_DOT_COLORS: Record<string, string> = {
  positive: "bg-emerald-500",
  negative: "bg-red-500",
  neutral:  "bg-blue-500",
  warning:  "bg-amber-500",
};

/* ── Badge colors ──────────────────────────────────────────────────────── */
export const BADGE_COLORS = {
  default: "bg-surface-alt text-secondary border-edge",
  green:   "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  red:     "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  amber:   "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  blue:    "bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border-navy/20 dark:border-accent/20",
  orange:  "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
} as const;

/* ── RSS news categories ───────────────────────────────────────────────── */
export const RSS_CATEGORY_LABELS: Record<string, { label: string; icon: string; bg: string; text: string; border: string }> = {
  macro:        { label: "Macro",         icon: "🏦", bg: "bg-blue-500/10",   text: "text-blue-700 dark:text-blue-400",     border: "border-blue-500/30" },
  geopolitical: { label: "Géopolitique",  icon: "🌍", bg: "bg-red-500/10",    text: "text-red-700 dark:text-red-400",       border: "border-red-500/30" },
  regulatory:   { label: "Réglementaire", icon: "⚖️", bg: "bg-violet-500/10", text: "text-violet-700 dark:text-violet-400", border: "border-violet-500/30" },
  sector:       { label: "Sectoriel",     icon: "🏭", bg: "bg-amber-500/10",  text: "text-amber-700 dark:text-amber-400",   border: "border-amber-500/30" },
  company:      { label: "Société",       icon: "🏢", bg: "bg-surface-alt",   text: "text-secondary",                       border: "border-edge" },
};

export const CATEGORY_IMPACT: Record<string, string> = {
  macro:        "Les décisions des banques centrales et indicateurs macro pilotent les valorisations de toutes les actions.",
  geopolitical: "Les tensions géopolitiques affectent les marchés via le pétrole, les chaînes d'approvisionnement et l'aversion au risque.",
  regulatory:   "Une décision réglementaire peut redessiner toute une industrie en quelques heures.",
  sector:       "Une dynamique sectorielle peut affecter tous les acteurs d'une industrie en même temps.",
  company:      "Actualité spécifique pouvant affecter la thèse d'investissement.",
};

/* ── Linked news source filter ─────────────────────────────────────────── */
export type LinkedFilter = "all" | "portfolio" | "ideas" | "picks";

export const SOURCE_BADGES: Record<LinkedFilter, { label: string; bg: string; text: string; border: string }> = {
  all:       { label: "—", bg: "", text: "", border: "" },
  portfolio: { label: "Portef.",  bg: "bg-navy/10 dark:bg-accent/10",   text: "text-navy dark:text-accent",          border: "border-navy/20 dark:border-accent/20" },
  ideas:     { label: "Idée",     bg: "bg-emerald-500/10",              text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30" },
  picks:     { label: "Pick",     bg: "bg-amber-500/10",                text: "text-amber-700 dark:text-amber-400",     border: "border-amber-500/30" },
};

/* ════════════════════════════════════════════════════════════════════════
 * UI Helpers (composants réutilisés par plusieurs panneaux)
 * ════════════════════════════════════════════════════════════════════════ */

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="w-1 h-4 bg-accent rounded-full" />
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle && <p className="section-title-hint mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export function BigNumber({ value, unit }: { value: number | null | undefined; unit: string }) {
  if (value == null) return <span className="text-xs text-muted italic">Indisponible</span>;
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-3xl font-bold text-primary"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </span>
      <span className="text-xs text-muted">{unit}</span>
    </div>
  );
}

export function ConvictionDot({ level }: { level: string }) {
  const styles: Record<string, string> = {
    "fort":   "bg-emerald-500",
    "moyen":  "bg-amber-500",
    "faible": "bg-red-400",
  };
  return (
    <span className="flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full ${styles[level] ?? "bg-muted"}`} />
      <span className="text-[0.625rem] text-muted capitalize">{level}</span>
    </span>
  );
}

export function ScoreGauge({ value, size = 60 }: { value: number; size?: number }) {
  const pct = Math.min(100, (value / 10) * 100);
  const color = value >= 7.5 ? "text-emerald-600 dark:text-emerald-400 stroke-emerald-500"
              : value >= 6.5 ? "text-amber-600 dark:text-amber-400 stroke-amber-500"
              :                "text-muted stroke-muted";
  const radius = size * 0.36;
  const stroke = size > 50 ? 3 : 2.5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;
  const fontSize = size > 50 ? "text-base" : size > 40 ? "text-xs" : "text-[0.625rem]";

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} className="fill-none stroke-edge" strokeWidth={stroke} />
        <circle cx={center} cy={center} r={radius}
          className={`fill-none ${color}`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`${fontSize} font-bold ${color}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}

export function IndicatorBlock({ name, exp, detail }: { name: string; exp: any; detail?: string }) {
  return (
    <div className="rounded-lg bg-surface/40 p-2.5 border border-edge/30">
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT_COLORS[exp.tone] ?? "bg-muted"}`} />
        <span className="text-xs font-bold text-secondary uppercase tracking-wider">{name}</span>
        <span className="text-xs font-medium text-primary ml-auto">{exp.label}</span>
      </div>
      {detail && <p className="text-[0.7rem] font-mono text-muted mb-1 pl-3">{detail}</p>}
      <p className="text-xs text-secondary leading-relaxed pl-3">{exp.detail}</p>
    </div>
  );
}

export function ExplainBlock({ dotColor, headline, detail }: { dotColor: string; headline: string; detail: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
        <h5 className="text-sm font-semibold text-primary"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {headline}
        </h5>
      </div>
      <p className="text-xs text-secondary leading-relaxed pl-4">{detail}</p>
    </div>
  );
}

export function EmptyAction({ msg, cta }: { msg: string; cta: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-secondary">{msg}</p>
      <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                       bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
        {cta}
      </span>
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2.5">
          <div className="w-6 h-6 rounded bg-surface-alt" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-20 bg-surface-alt rounded" />
            <div className="h-2 w-32 bg-surface-alt rounded" />
          </div>
          <div className="h-5 w-12 bg-surface-alt rounded" />
        </div>
      ))}
    </div>
  );
}
