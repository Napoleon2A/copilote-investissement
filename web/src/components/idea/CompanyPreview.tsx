"use client";
/**
 * Aperçu d'une entreprise — composant réutilisable.
 * Rend un CompanyBrief (scores, métriques, arguments, news)
 * sans naviguer vers /company/[ticker].
 * Utilisé par : page Idée (mode aperçu), future page Earnings.
 */
import Link from "next/link";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import type { CompanyBrief } from "@/lib/api";

const ACTION_COLORS: Record<string, string> = {
  read:      "bg-amber-50 text-amber-700 border-amber-200",
  watch:     "bg-blue-50 text-blue-700 border-blue-200",
  buy_small: "bg-green-50 text-green-700 border-green-200",
  add:       "bg-green-50 text-green-700 border-green-200",
  avoid:     "bg-red-50 text-red-700 border-red-200",
  hold:      "bg-bg text-secondary border-edge",
};

export function CompanyPreview({ brief }: { brief: CompanyBrief }) {
  const actionColor = ACTION_COLORS[brief.action] ?? ACTION_COLORS.hold;

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/company/${brief.ticker}`}
            className="text-xl font-bold font-mono text-navy hover:text-navy-hover">
            {brief.ticker}
          </Link>
          {brief.name && <p className="text-sm text-secondary">{brief.name}</p>}
          {brief.sector && <p className="text-[10px] text-muted mt-0.5 uppercase tracking-wide">{brief.sector}</p>}
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold flex-shrink-0 ${actionColor}`}>
          → {brief.action_label}
        </div>
      </div>

      {/* Prix + variations */}
      <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Prix</p>
            <span className="text-lg font-mono font-semibold text-primary">
              {brief.current_price != null
                ? brief.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
            </span>
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Aujourd&apos;hui</p>
            <ChangeCell value={brief.change_1d} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">1 mois</p>
            <ChangeCell value={brief.change_1m} />
          </div>
          <div>
            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">YTD</p>
            <ChangeCell value={brief.change_ytd} />
          </div>
        </div>
      </div>

      {/* Scores */}
      <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
        <div className="flex flex-col items-center">
          <ScoreBadge score={brief.scores.composite} size="md" />
          <span className="text-[10px] text-muted mt-1 uppercase tracking-wider">{brief.scores.composite_label}</span>
        </div>
        <div className="flex-1 grid grid-cols-5 gap-2 text-center">
          {[
            { label: "Qualité",  score: brief.scores.quality },
            { label: "Valeur",   score: brief.scores.valuation },
            { label: "Croiss.",  score: brief.scores.growth },
            { label: "Momentum", score: brief.scores.momentum },
            { label: "Risque",   score: brief.scores.risk },
          ].map((s) => (
            <div key={s.label}>
              <ScoreBadge score={s.score} size="sm" />
              <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Arguments pour / contre */}
      {(brief.pro_args.length > 0 || brief.con_args.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {brief.pro_args.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <h3 className="text-[10px] font-semibold text-green-700 uppercase tracking-widest mb-1.5">
                Points favorables
              </h3>
              <ul className="space-y-1">
                {brief.pro_args.map((arg, i) => (
                  <li key={i} className="text-xs text-green-900 flex gap-1.5">
                    <span className="text-green-500 flex-shrink-0 font-bold">+</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.con_args.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <h3 className="text-[10px] font-semibold text-red-700 uppercase tracking-widest mb-1.5">
                Points défavorables
              </h3>
              <ul className="space-y-1">
                {brief.con_args.map((arg, i) => (
                  <li key={i} className="text-xs text-red-900 flex gap-1.5">
                    <span className="text-red-500 flex-shrink-0 font-bold">−</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Métriques clés */}
      <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
        <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-2">Métriques clés</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MiniMetric label="P/E" v={brief.key_metrics.pe_ratio} decimals={1} suffix="x" />
          <MiniMetric label="EV/EBITDA" v={brief.key_metrics.ev_ebitda} decimals={1} suffix="x" />
          <MiniMetric label="Marge opé." v={brief.key_metrics.operating_margin} pct />
          <MiniMetric label="ROE" v={brief.key_metrics.roe} pct />
          <MiniMetric label="Croiss. CA" v={brief.key_metrics.revenue_growth} pct />
          <MiniMetric label="D/E" v={brief.key_metrics.debt_to_equity} decimals={0} suffix="%" />
          <MiniMetric label="FCF" v={brief.key_metrics.free_cashflow} big />
        </div>
      </div>

      {/* News récentes */}
      {brief.recent_news && brief.recent_news.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-2">Actualités</h3>
          <ul className="space-y-2">
            {brief.recent_news.slice(0, 3).map((item, i) => (
              <li key={i} className="border-b border-edge pb-2 last:border-0 last:pb-0">
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-primary hover:text-navy leading-snug transition-colors">
                  {item.title}
                </a>
                <p className="text-[10px] text-muted mt-0.5">
                  {item.publisher}
                  {item.published && ` · ${new Date(item.published).toLocaleDateString("fr-FR")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conviction / horizon */}
      <div className="flex items-center gap-3 text-xs text-secondary">
        <span>Conviction : <span className="text-primary font-medium">{brief.conviction}</span></span>
        <span className="text-edge">·</span>
        <span>Horizon : <span className="text-primary font-medium">{brief.horizon}</span></span>
      </div>
    </div>
  );
}

function MiniMetric({ label, v, decimals = 2, suffix = "", pct = false, big = false }: {
  label: string; v: number | null | undefined;
  decimals?: number; suffix?: string; pct?: boolean; big?: boolean;
}) {
  let display = "—";
  if (v != null) {
    if (pct) display = `${(v * 100).toFixed(1)}%`;
    else if (big) {
      const abs = Math.abs(v);
      if (abs >= 1e9) display = `${(v / 1e9).toFixed(1)}B`;
      else if (abs >= 1e6) display = `${(v / 1e6).toFixed(0)}M`;
      else display = v.toFixed(0);
    } else display = `${v.toFixed(decimals)}${suffix}`;
  }
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      <span className={`text-sm font-mono ${v != null ? "text-primary font-medium" : "text-muted"}`}>{display}</span>
    </div>
  );
}
