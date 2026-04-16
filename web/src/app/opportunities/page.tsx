/**
 * Page Opportunités — /opportunities
 *
 * Le scanner analyse ~50 actions sur plusieurs secteurs et remonte
 * automatiquement les meilleures opportunités du moment.
 */
"use client";
import { useState, useEffect } from "react";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import Link from "next/link";
import { getScanOpportunities, getMacroScan } from "@/lib/api";
import type { ScanOpportunity, MacroScan } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";

export default function OpportunitiesPage() {
  useDocumentTitle("Opportunités");
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
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Opportunités détectées
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Scanner automatique · ~50 actions analysées en temps réel
          </p>
        </div>
        <div className="flex items-center gap-3">
          {scannedAt && (
            <span className="text-xs text-muted">
              {scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={runScan}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-navy hover:bg-navy-hover rounded text-white transition-colors disabled:opacity-40 font-medium"
          >
            {loading ? "Scan en cours…" : "↻ Rescanner"}
          </button>
        </div>
      </div>

      {/* Contexte macro */}
      {macro && <MacroWidget macro={macro} />}

      {/* Avertissement */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Opportunités détectées par les scores automatiques. Ce n&apos;est pas un conseil en investissement — toujours vérifier avant d&apos;agir.
      </div>

      {/* Chargement */}
      {loading && (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Analyse en cours…</p>
          <p className="text-muted text-xs mt-1">Le premier scan peut prendre 30-60 secondes</p>
        </div>
      )}

      {/* Erreur */}
      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Vide */}
      {!loading && !error && data.length === 0 && (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Aucune opportunité au-dessus du seuil (score ≥ 6).</p>
          <p className="text-muted text-xs mt-1">Conditions défavorables ou données incomplètes.</p>
        </div>
      )}

      {/* Résultats */}
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
  "risk-on":   { label: "Risk-On",   color: "text-green-700 border-green-200 bg-green-50",   desc: "Appétit pour le risque élevé — actions de croissance favorisées" },
  "risk-off":  { label: "Risk-Off",  color: "text-red-700 border-red-200 bg-red-50",         desc: "Fuite vers les actifs sûrs — prudence recommandée" },
  "calme":     { label: "Calme",     color: "text-blue-700 border-blue-200 bg-blue-50",      desc: "Faible volatilité — bonnes conditions pour initier des positions" },
  "vigilance": { label: "Vigilance", color: "text-amber-700 border-amber-200 bg-amber-50",   desc: "Volatilité modérée — surveiller les développements" },
  "neutral":   { label: "Neutre",    color: "text-secondary border-edge bg-bg", desc: "Conditions normales" },
};

function MacroWidget({ macro }: { macro: MacroScan }) {
  const regime = RISK_REGIME_LABELS[macro.risk_regime] || RISK_REGIME_LABELS.neutral;

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Contexte macro</h2>
        <span className={`text-xs px-2 py-0.5 rounded border font-medium ${regime.color}`}>
          {regime.label}
        </span>
      </div>
      <p className="text-xs text-secondary">{regime.desc}</p>

      {/* Indices clés */}
      <div className="flex gap-x-5 gap-y-3 flex-wrap">
        {Object.entries(macro.macro).map(([name, data]) => {
          const chg = data.change_1d;
          return (
            <div key={name}>
              <p className="text-[10px] text-muted uppercase tracking-wide">{name}</p>
              <p className="text-sm font-mono text-primary font-medium">
                {data.price != null ? data.price.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) : "—"}
                {chg != null && (
                  <span className={`ml-1 text-xs ${chg > 0 ? "text-green-700" : "text-red-700"}`}>
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
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-8 text-xs pt-2 border-t border-edge">
          {macro.outperformers.length > 0 && (
            <div>
              <p className="text-muted mb-1 text-[10px] uppercase tracking-wide">Surperformants YTD</p>
              {macro.outperformers.slice(0, 2).map((s) => (
                <p key={s.sector} className="text-green-700">
                  ▲ {s.sector.split("(")[0].trim()} (+{s.outperformance}%)
                </p>
              ))}
            </div>
          )}
          {macro.underperformers.length > 0 && (
            <div>
              <p className="text-muted mb-1 text-[10px] uppercase tracking-wide">Sous-performants YTD</p>
              {macro.underperformers.slice(0, 2).map((s) => (
                <p key={s.sector} className="text-red-700">
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
    opp.action === "read"      ? "text-amber-600"
    : opp.action === "buy_small" ? "text-green-700"
    : "text-blue-700";

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 hover:border-navy/30 hover:shadow-sm transition-all duration-150">
      <div className="flex items-start justify-between gap-4">
        {/* Rank + ticker */}
        <div className="flex items-start gap-3">
          <span className="text-muted text-sm font-mono mt-0.5 w-4 flex-shrink-0">
            {rank}.
          </span>
          <div>
            <div className="flex items-center gap-2">
              <Link
                href={`/company/${opp.ticker}`}
                className="text-base font-bold text-navy hover:text-navy-hover font-mono"
              >
                {opp.ticker}
              </Link>
              {opp.sector_group && (
                <span className="text-[10px] text-muted border border-edge rounded px-1.5 py-0.5 bg-bg">
                  {opp.sector_group}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {opp.current_price && (
                <span className="text-sm text-primary font-mono font-medium">
                  {opp.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                </span>
              )}
              <ChangeCell value={opp.change_1d} />
              {opp.change_1m !== undefined && (
                <span className="text-xs text-muted">
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
            <li key={i} className="text-xs text-secondary flex gap-1.5">
              <span className="text-accent flex-shrink-0">▸</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      )}

      {/* News headline */}
      {opp.has_catalyst && opp.key_headlines && opp.key_headlines.length > 0 && (
        <div className="mt-2 px-2.5 py-1.5 rounded bg-surface-alt border border-edge text-xs text-secondary">
          📰 {opp.key_headlines[0].length > 90 ? opp.key_headlines[0].slice(0, 90) + "…" : opp.key_headlines[0]}
        </div>
      )}

      {/* Upside analystes */}
      {opp.upside_vs_target != null && (
        <div className="mt-2 text-xs text-muted">
          Cible analystes :{" "}
          <span className={opp.upside_vs_target > 0 ? "text-green-700" : "text-red-700"}>
            {opp.upside_vs_target > 0 ? "+" : ""}{opp.upside_vs_target.toFixed(1)}%
          </span>
          {opp.analyst_count && (
            <span className="text-edge ml-1">({opp.analyst_count} analystes)</span>
          )}
        </div>
      )}

      {/* Scores détail */}
      <div className="mt-3 grid grid-cols-5 gap-2 sm:gap-5 text-xs text-muted border-t border-edge pt-2">
        {[
          ["Qualité", opp.scores.quality],
          ["Valeur",  opp.scores.valuation],
          ["Croiss.", opp.scores.growth],
          ["Momentum", opp.scores.momentum],
          ["Risque",  opp.scores.risk],
        ].map(([label, score]) => (
          <div key={label as string} className="text-center">
            <div className={`text-xs font-mono font-medium ${(score as number) >= 6.5 ? "text-navy" : "text-muted"}`}>
              {(score as number).toFixed(1)}
            </div>
            <div className="text-muted text-[10px]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
