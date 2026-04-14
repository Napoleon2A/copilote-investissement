/**
 * Page fiche entreprise - /company/AAPL
 *
 * Utilise getCompanyBrief (scores + pro/con + action) et getCompanyScores (détail par critère).
 */
import { getCompanyBrief, getCompanyScores } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import Link from "next/link";

interface Props {
  params: Promise<{ ticker: string }>;
}

const ACTION_COLORS: Record<string, string> = {
  read: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  watch: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  buy_small: "bg-green-500/20 text-green-300 border-green-500/30",
  add: "bg-green-500/20 text-green-300 border-green-500/30",
  avoid: "bg-red-500/20 text-red-300 border-red-500/30",
  hold: "bg-slate-500/20 text-slate-300 border-slate-500/30",
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
        <p className="text-red-400 text-sm">
          Données indisponibles pour{" "}
          <span className="font-mono font-bold">{upperTicker}</span>.
          Vérifie que le ticker est correct et que le backend est actif.
        </p>
      </div>
    );
  }

  const actionColor = ACTION_COLORS[brief.action] ?? ACTION_COLORS.hold;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* En-tête */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:text-slate-300">
            ← Brief
          </Link>
          <h1 className="mt-1 text-2xl font-bold font-mono text-slate-100">
            {upperTicker}
          </h1>
          {brief.name && (
            <p className="text-sm text-slate-400">{brief.name}</p>
          )}
          {brief.sector && (
            <p className="text-xs text-slate-600 mt-0.5">{brief.sector}</p>
          )}
        </div>

        <div
          className={`rounded-full border px-3 py-1 text-sm font-medium flex-shrink-0 ${actionColor}`}
        >
          → {brief.action_label}
        </div>
      </div>

      {/* Prix + variations */}
      <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Prix">
            <span className="text-xl font-mono font-semibold text-slate-100">
              {brief.current_price != null
                ? brief.current_price.toLocaleString("fr-FR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                : "—"}
            </span>
          </Metric>
          <Metric label="Aujourd'hui">
            <ChangeCell value={brief.change_1d} />
          </Metric>
          <Metric label="1 mois">
            <ChangeCell value={brief.change_1m} />
          </Metric>
          <Metric label="YTD">
            <ChangeCell value={brief.change_ytd} />
          </Metric>
        </div>
      </div>

      {/* Score composite + conviction */}
      <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4 flex items-center gap-6">
        <div className="flex flex-col items-center">
          <ScoreBadge score={brief.scores.composite} size="md" />
          <span className="text-xs text-slate-500 mt-1">{brief.scores.composite_label}</span>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Qualité", score: brief.scores.quality },
            { label: "Valeur", score: brief.scores.valuation },
            { label: "Croiss.", score: brief.scores.growth },
            { label: "Momentum", score: brief.scores.momentum },
            { label: "Risque", score: brief.scores.risk },
          ].map((s) => (
            <div key={s.label}>
              <ScoreBadge score={s.score} size="sm" />
              <p className="text-xs text-slate-600 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Arguments pour / contre */}
      {(brief.pro_args.length > 0 || brief.con_args.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brief.pro_args.length > 0 && (
            <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-4">
              <h3 className="text-xs font-medium text-green-400 uppercase tracking-wide mb-2">
                Points favorables
              </h3>
              <ul className="space-y-1">
                {brief.pro_args.map((arg, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-green-500 flex-shrink-0">+</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.con_args.length > 0 && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <h3 className="text-xs font-medium text-red-400 uppercase tracking-wide mb-2">
                Points défavorables
              </h3>
              <ul className="space-y-1">
                {brief.con_args.map((arg, i) => (
                  <li key={i} className="text-sm text-slate-300 flex gap-2">
                    <span className="text-red-500 flex-shrink-0">−</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Métriques clés */}
      <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4">
        <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
          Métriques clés
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="P/E">
            <MetricValue v={brief.key_metrics.pe_ratio} decimals={1} suffix="x" />
          </Metric>
          <Metric label="EV/EBITDA">
            <MetricValue v={brief.key_metrics.ev_ebitda} decimals={1} suffix="x" />
          </Metric>
          <Metric label="Marge opé.">
            <MetricValue v={brief.key_metrics.operating_margin} pct />
          </Metric>
          <Metric label="ROE">
            <MetricValue v={brief.key_metrics.roe} pct />
          </Metric>
          <Metric label="Croiss. CA">
            <MetricValue v={brief.key_metrics.revenue_growth} pct />
          </Metric>
          <Metric label="D/E">
            <MetricValue v={brief.key_metrics.debt_to_equity} decimals={0} suffix="%" />
          </Metric>
          <Metric label="FCF">
            <MetricValue v={brief.key_metrics.free_cashflow} big />
          </Metric>
        </div>
      </div>

      {/* Détail des raisons par score */}
      {scores && (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Détail des scores
          </h3>
          <div className="space-y-4">
            {(
              [
                ["Qualité", scores.scores.quality],
                ["Valorisation", scores.scores.valuation],
                ["Croissance", scores.scores.growth],
                ["Momentum", scores.scores.momentum],
                ["Risque", scores.scores.risk],
              ] as [string, { score: number; reasons: string[] }][]
            ).map(([label, detail]) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-1">
                  <ScoreBadge score={detail.score} size="sm" />
                  <span className="text-sm text-slate-400">{label}</span>
                </div>
                <ul className="ml-2 space-y-0.5">
                  {detail.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-slate-600 flex gap-1">
                      <span>·</span>
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
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4">
          <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
            Actualités récentes
          </h3>
          <ul className="space-y-2">
            {brief.recent_news.map((item, i) => (
              <li key={i}>
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-slate-300 hover:text-indigo-300 leading-snug"
                >
                  {item.title}
                </a>
                <p className="text-xs text-slate-600 mt-0.5">
                  {item.publisher}
                  {item.published && ` · ${new Date(item.published).toLocaleDateString("fr-FR")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conviction / horizon */}
      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span>Conviction : <span className="text-slate-300">{brief.conviction}</span></span>
        <span>·</span>
        <span>Horizon : <span className="text-slate-300">{brief.horizon}</span></span>
      </div>

      <p className="text-xs text-slate-700">{brief.disclaimer}</p>
    </div>
  );
}

// ── Petits composants locaux ─────────────────────────────────────────────────

function Metric({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-slate-600 mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function MetricValue({
  v,
  decimals = 2,
  suffix = "",
  pct = false,
  big = false,
}: {
  v: number | null | undefined;
  decimals?: number;
  suffix?: string;
  pct?: boolean;
  big?: boolean;
}) {
  if (v == null) return <span className="text-slate-600 text-sm">—</span>;

  let display: string;
  if (pct) {
    display = `${(v * 100).toFixed(1)}%`;
  } else if (big) {
    // Formate en M ou B
    const abs = Math.abs(v);
    if (abs >= 1e9) display = `${(v / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) display = `${(v / 1e6).toFixed(0)}M`;
    else display = v.toFixed(0);
  } else {
    display = `${v.toFixed(decimals)}${suffix}`;
  }

  return <span className="text-sm font-mono text-slate-200">{display}</span>;
}
