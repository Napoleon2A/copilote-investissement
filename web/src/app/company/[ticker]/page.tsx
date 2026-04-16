/**
 * Page fiche entreprise — /company/[ticker]
 */
import type { Metadata } from "next";
import { getCompanyBrief, getCompanyScores } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import Link from "next/link";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · Austerlitz` };
}

const ACTION_COLORS: Record<string, string> = {
  read:      "bg-amber-50 text-amber-700 border-amber-200",
  watch:     "bg-blue-50 text-blue-700 border-blue-200",
  buy_small: "bg-green-50 text-green-700 border-green-200",
  add:       "bg-green-50 text-green-700 border-green-200",
  avoid:     "bg-red-50 text-red-700 border-red-200",
  hold:      "bg-[#EEF2F6] text-[#2D4A5C] border-[#BFD0DC]",
};

export default async function CompanyPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  let brief = null;
  let scores = null;

  try {
    [brief, scores] = await Promise.all([
      getCompanyBrief(upperTicker),
      getCompanyScores(upperTicker),
    ]);
  } catch {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-700 text-sm">
          Données indisponibles pour{" "}
          <span className="font-mono font-bold">{upperTicker}</span>.
          Vérifie que le ticker est correct et que le backend est actif.
        </p>
      </div>
    );
  }

  const actionColor = ACTION_COLORS[brief.action] ?? ACTION_COLORS.hold;

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs text-[#7898AC] hover:text-[#1E3A5F] transition-colors">
            ← Brief
          </Link>
          <h1 className="mt-1 text-2xl font-bold font-mono text-[#1E3A5F]">
            {upperTicker}
          </h1>
          {brief.name && <p className="text-sm text-[#2D4A5C]">{brief.name}</p>}
          {brief.sector && <p className="text-[10px] text-[#7898AC] mt-0.5 uppercase tracking-wide">{brief.sector}</p>}
        </div>
        <div className={`rounded-full border px-4 py-1.5 text-xs font-semibold flex-shrink-0 ${actionColor}`}>
          → {brief.action_label}
        </div>
      </div>

      {/* Prix + variations */}
      <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Prix">
            <span className="text-xl font-mono font-semibold text-[#0B1929]">
              {brief.current_price != null
                ? brief.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
            </span>
          </Metric>
          <Metric label="Aujourd'hui"><ChangeCell value={brief.change_1d} /></Metric>
          <Metric label="1 mois"><ChangeCell value={brief.change_1m} /></Metric>
          <Metric label="YTD"><ChangeCell value={brief.change_ytd} /></Metric>
        </div>
      </div>

      {/* Score composite + sous-scores */}
      <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center">
          <ScoreBadge score={brief.scores.composite} size="md" />
          <span className="text-[10px] text-[#7898AC] mt-1 uppercase tracking-wider">{brief.scores.composite_label}</span>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Qualité",   score: brief.scores.quality },
            { label: "Valeur",    score: brief.scores.valuation },
            { label: "Croiss.",   score: brief.scores.growth },
            { label: "Momentum",  score: brief.scores.momentum },
            { label: "Risque",    score: brief.scores.risk },
          ].map((s) => (
            <div key={s.label}>
              <ScoreBadge score={s.score} size="sm" />
              <p className="text-[10px] text-[#7898AC] mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Arguments pour / contre */}
      {(brief.pro_args.length > 0 || brief.con_args.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brief.pro_args.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="text-[10px] font-semibold text-green-700 uppercase tracking-widest mb-2">
                Points favorables
              </h3>
              <ul className="space-y-1.5">
                {brief.pro_args.map((arg, i) => (
                  <li key={i} className="text-sm text-green-900 flex gap-2">
                    <span className="text-green-500 flex-shrink-0 font-bold">+</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.con_args.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="text-[10px] font-semibold text-red-700 uppercase tracking-widest mb-2">
                Points défavorables
              </h3>
              <ul className="space-y-1.5">
                {brief.con_args.map((arg, i) => (
                  <li key={i} className="text-sm text-red-900 flex gap-2">
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
      <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm">
        <h3 className="text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest mb-3">Métriques clés</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="P/E"><MetricValue v={brief.key_metrics.pe_ratio} decimals={1} suffix="x" /></Metric>
          <Metric label="EV/EBITDA"><MetricValue v={brief.key_metrics.ev_ebitda} decimals={1} suffix="x" /></Metric>
          <Metric label="Marge opé."><MetricValue v={brief.key_metrics.operating_margin} pct /></Metric>
          <Metric label="ROE"><MetricValue v={brief.key_metrics.roe} pct /></Metric>
          <Metric label="Croiss. CA"><MetricValue v={brief.key_metrics.revenue_growth} pct /></Metric>
          <Metric label="D/E"><MetricValue v={brief.key_metrics.debt_to_equity} decimals={0} suffix="%" /></Metric>
          <Metric label="FCF"><MetricValue v={brief.key_metrics.free_cashflow} big /></Metric>
        </div>
      </div>

      {/* Détail des scores */}
      {scores && (
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest mb-4">Détail des scores</h3>
          <div className="space-y-4">
            {([
              ["Qualité",      scores.scores.quality],
              ["Valorisation", scores.scores.valuation],
              ["Croissance",   scores.scores.growth],
              ["Momentum",     scores.scores.momentum],
              ["Risque",       scores.scores.risk],
            ] as [string, { score: number; reasons: string[] }][]).map(([label, detail]) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-1.5">
                  <ScoreBadge score={detail.score} size="sm" />
                  <span className="text-sm font-medium text-[#0B1929]">{label}</span>
                </div>
                <ul className="ml-1 space-y-0.5">
                  {detail.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-[#2D4A5C] flex gap-1.5">
                      <span className="text-[#5E96B0] flex-shrink-0">·</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* News récentes */}
      {brief.recent_news.length > 0 && (
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest mb-3">Actualités récentes</h3>
          <ul className="space-y-3">
            {brief.recent_news.map((item, i) => (
              <li key={i} className="border-b border-[#BFD0DC] pb-3 last:border-0 last:pb-0">
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-[#0B1929] hover:text-[#1E3A5F] leading-snug transition-colors">
                  {item.title}
                </a>
                <p className="text-[10px] text-[#7898AC] mt-0.5">
                  {item.publisher}
                  {item.published && ` · ${new Date(item.published).toLocaleDateString("fr-FR")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conviction / horizon */}
      <div className="flex items-center gap-4 text-xs text-[#2D4A5C]">
        <span>Conviction : <span className="text-[#0B1929] font-medium">{brief.conviction}</span></span>
        <span className="text-[#BFD0DC]">·</span>
        <span>Horizon : <span className="text-[#0B1929] font-medium">{brief.horizon}</span></span>
      </div>

      <p className="text-[10px] text-[#7898AC] tracking-wide">{brief.disclaimer}</p>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-[#7898AC] uppercase tracking-wider mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function MetricValue({ v, decimals = 2, suffix = "", pct = false, big = false }: {
  v: number | null | undefined;
  decimals?: number; suffix?: string; pct?: boolean; big?: boolean;
}) {
  if (v == null) return <span className="text-[#7898AC] text-sm">—</span>;

  let display: string;
  if (pct) {
    display = `${(v * 100).toFixed(1)}%`;
  } else if (big) {
    const abs = Math.abs(v);
    if (abs >= 1e9) display = `${(v / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) display = `${(v / 1e6).toFixed(0)}M`;
    else display = v.toFixed(0);
  } else {
    display = `${v.toFixed(decimals)}${suffix}`;
  }

  return <span className="text-sm font-mono text-[#0B1929] font-medium">{display}</span>;
}
