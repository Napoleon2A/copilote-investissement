/**
 * Page Opportunités — /opportunities
 *
 * Le scanner analyse ~50 actions sur plusieurs secteurs et remonte
 * automatiquement les meilleures opportunités du moment.
 *
 * Ce n'est pas une liste de recommandations : c'est un point de départ
 * pour creuser. Chaque opportunité a un score explicable.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getScanOpportunities, getMacroScan } from "@/lib/api";
import type { ScanOpportunity, MacroScan } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";

export default function OpportunitiesPage() {
  const [data, setData] = useState<ScanOpportunity[]>([]);
  const [macro, setMacro] = useState<MacroScan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scannedAt, setScannedAt] = useState<Date | null>(null);

  const runScan = () => {
    setLoading(true);
    setError("");
    Promise.all([
      getScanOpportunities(10),
      getMacroScan().catch(() => null),
    ])
      .then(([res, macroRes]) => {
        setData(res.opportunities);
        setMacro(macroRes);
        setScannedAt(new Date());
      })
      .catch(() => setError("Impossible de contacter le backend"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { runScan(); }, []);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* En-tête */}
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Opportunités détectées</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Scanner automatique — ~50 actions analysées en temps réel
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scannedAt && (
            <span className="text-xs text-slate-600">
              Scanné à {scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={runScan}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors disabled:opacity-40"
          >
            {loading ? "Scan en cours…" : "↻ Rescanner"}
          </button>
        </div>
      </div>

      {/* Contexte macro */}
      {macro && <MacroWidget macro={macro} />}

      {/* Avertissement */}
      <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-400">
        Ces opportunités sont détectées par les scores automatiques du système. Ce n&apos;est pas un conseil en investissement — toujours vérifier avant d&apos;agir.
      </div>

      {/* État chargement */}
      {loading && (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-8 text-center">
          <p className="text-slate-400 text-sm">Analyse en cours…</p>
          <p className="text-slate-600 text-xs mt-1">Le premier scan peut prendre 30-60 secondes (données yfinance)</p>
        </div>
      )}

      {/* Erreur */}
      {error && !loading && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Résultats */}
      {!loading && !error && data.length === 0 && (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-8 text-center">
          <p className="text-slate-400 text-sm">Aucune opportunité détectée au-dessus du seuil (score ≥ 6).</p>
          <p className="text-slate-600 text-xs mt-1">Conditions de marché défavorables ou données incomplètes.</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="space-y-3">
          {data.map((opp, i) => (
            <OpportunityCard key={opp.ticker} opp={opp} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

const RISK_REGIME_LABELS: Record<string, { label: string; color: string; desc: string }> = {
  "risk-on":   { label: "Risk-On",   color: "text-green-400 border-green-500/20 bg-green-500/5",  desc: "Appétit pour le risque élevé — actions de croissance favorisées" },
  "risk-off":  { label: "Risk-Off",  color: "text-red-400 border-red-500/20 bg-red-500/5",        desc: "Fuite vers les actifs sûrs — prudence recommandée" },
  "calme":     { label: "Calme",     color: "text-blue-400 border-blue-500/20 bg-blue-500/5",     desc: "Faible volatilité — bonnes conditions pour initier des positions" },
  "vigilance": { label: "Vigilance", color: "text-yellow-400 border-yellow-500/20 bg-yellow-500/5", desc: "Volatilité modérée — surveiller les développements" },
  "neutral":   { label: "Neutre",    color: "text-slate-400 border-slate-500/20 bg-slate-500/5",  desc: "Conditions normales" },
};

function MacroWidget({ macro }: { macro: MacroScan }) {
  const regime = RISK_REGIME_LABELS[macro.risk_regime] || RISK_REGIME_LABELS.neutral;

  return (
    <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">Contexte macro</h2>
        <span className={`text-xs px-2 py-0.5 rounded border ${regime.color}`}>
          {regime.label}
        </span>
      </div>
      <p className="text-xs text-slate-500">{regime.desc}</p>

      {/* Indices clés */}
      <div className="flex gap-5 flex-wrap">
        {Object.entries(macro.macro).map(([name, data]) => {
          const chg = data.change_1d;
          return (
            <div key={name}>
              <p className="text-xs text-slate-600">{name}</p>
              <p className="text-sm font-mono text-slate-300">
                {data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—"}
                {chg != null && (
                  <span className={`ml-1 text-xs ${chg > 0 ? "text-green-400" : "text-red-400"}`}>
                    {chg > 0 ? "+" : ""}{chg.toFixed(1)}%
                  </span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* Secteurs */}
      {(macro.outperformers.length > 0 || macro.underperformers.length > 0) && (
        <div className="flex gap-6 text-xs pt-1 border-t border-[#2a2d3a]">
          {macro.outperformers.length > 0 && (
            <div>
              <p className="text-slate-600 mb-1">Surperformants (YTD)</p>
              {macro.outperformers.slice(0, 2).map((s) => (
                <p key={s.sector} className="text-green-400">
                  ▲ {s.sector.split("(")[0].trim()} (+{s.outperformance}%)
                </p>
              ))}
            </div>
          )}
          {macro.underperformers.length > 0 && (
            <div>
              <p className="text-slate-600 mb-1">Sous-performants (YTD)</p>
              {macro.underperformers.slice(0, 2).map((s) => (
                <p key={s.sector} className="text-red-400">
                  ▼ {s.sector.split("(")[0].trim()} ({s.underperformance}%)
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp, rank }: { opp: ScanOpportunity; rank: number }) {
  const actionColor =
    opp.action === "read"
      ? "text-yellow-400"
      : opp.action === "buy_small"
      ? "text-green-400"
      : "text-blue-400";

  return (
    <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4 hover:border-indigo-500/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Rank + ticker */}
        <div className="flex items-start gap-3">
          <span className="text-slate-700 text-sm font-mono mt-0.5 w-4 flex-shrink-0">
            {rank}.
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/company/${opp.ticker}`}
                className="text-base font-bold text-indigo-300 hover:text-indigo-200 font-mono"
              >
                {opp.ticker}
              </Link>
              {opp.sector_group && (
                <span className="text-xs text-slate-600 border border-[#2a2d3a] rounded px-1.5 py-0.5">
                  {opp.sector_group}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {opp.current_price && (
                <span className="text-sm text-slate-300 font-mono">
                  {opp.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                </span>
              )}
              <ChangeCell value={opp.change_1d} />
              {opp.change_1m !== undefined && (
                <span className="text-xs text-slate-600">
                  1M: <ChangeCell value={opp.change_1m} className="text-xs" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Score + action */}
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <ScoreBadge score={opp.scores.composite} size="sm" />
          <span className={`text-xs font-medium ${actionColor}`}>
            → {opp.action_label}
          </span>
        </div>
      </div>

      {/* Points forts */}
      {opp.highlights.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {opp.highlights.map((h, i) => (
            <li key={i} className="text-xs text-slate-400 flex gap-1.5">
              <span className="text-indigo-500 flex-shrink-0">▸</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      {/* News headline si catalyseur */}
      {opp.has_catalyst && opp.key_headlines && opp.key_headlines.length > 0 && (
        <div className="mt-2 px-2 py-1.5 rounded bg-indigo-500/5 border border-indigo-500/20 text-xs text-indigo-300">
          📰 {opp.key_headlines[0].length > 90 ? opp.key_headlines[0].slice(0, 90) + "…" : opp.key_headlines[0]}
        </div>
      )}

      {/* Upside analystes */}
      {opp.upside_vs_target != null && (
        <div className="mt-2 text-xs text-slate-500">
          Cible analystes :{" "}
          <span className={opp.upside_vs_target > 0 ? "text-green-400" : "text-red-400"}>
            {opp.upside_vs_target > 0 ? "+" : ""}{opp.upside_vs_target.toFixed(1)}%
          </span>
          {opp.analyst_count && (
            <span className="text-slate-700 ml-1">({opp.analyst_count} analystes)</span>
          )}
        </div>
      )}

      {/* Scores détail */}
      <div className="mt-3 flex gap-4 text-xs text-slate-600 border-t border-[#2a2d3a] pt-2">
        {[
          ["Qualité", opp.scores.quality],
          ["Valeur", opp.scores.valuation],
          ["Croiss.", opp.scores.growth],
          ["Momentum", opp.scores.momentum],
          ["Risque", opp.scores.risk],
        ].map(([label, score]) => (
          <div key={label as string} className="text-center">
            <div className={`text-xs font-mono ${(score as number) >= 6.5 ? "text-indigo-400" : "text-slate-600"}`}>
              {(score as number).toFixed(1)}
            </div>
            <div className="text-slate-700 text-xs">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
