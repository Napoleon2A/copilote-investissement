/**
 * Page Earnings Play — /earnings
 *
 * Affiche les publications de résultats imminentes dans l'univers scanné,
 * avec analyse pré-earnings et recommandation buy/avoid/neutre.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getUpcomingEarnings } from "@/lib/api";
import type { EarningsPlay } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

const REC_COLORS: Record<string, string> = {
  buy_before: "bg-green-50 text-green-700 border-green-200",
  hold_watch: "bg-blue-50 text-blue-700 border-blue-200",
  neutral:    "bg-bg text-secondary border-edge",
  avoid:      "bg-red-50 text-red-700 border-red-200",
};

export default function EarningsPage() {
  useDocumentTitle("Earnings");
  const [data, setData] = useState<EarningsPlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    getUpcomingEarnings(21)
      .then((res) => setData(res.earnings))
      .catch(() => setError("Impossible de charger les données earnings"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Earnings Play
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Publications de résultats imminentes — analyse pré-earnings pour anticiper les mouvements
        </p>
      </div>

      {/* Avertissement */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Investir avant les résultats est risqué. La volatilité peut être extrême.
        Ces analyses sont des heuristiques, pas des prédictions.
      </div>

      {loading && (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Scan des earnings en cours…</p>
          <p className="text-muted text-xs mt-1">Analyse de ~60 entreprises, peut prendre 30-60 secondes</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Aucune publication de résultats dans les 21 prochains jours.</p>
        </div>
      )}

      {!loading && data.length > 0 && (
        <div className="space-y-3">
          {data.map((ep) => (
            <EarningsCard key={ep.ticker} ep={ep} />
          ))}
        </div>
      )}
    </div>
  );
}

function EarningsCard({ ep }: { ep: EarningsPlay }) {
  const recColor = REC_COLORS[ep.recommendation] ?? REC_COLORS.neutral;
  const daysLabel = ep.days_until === 0 ? "Aujourd'hui"
    : ep.days_until === 1 ? "Demain"
    : `${ep.days_until}j`;

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 hover:border-navy/30 hover:shadow-sm transition-all duration-150">
      <div className="flex items-start justify-between gap-4">
        {/* Gauche : ticker + infos */}
        <div className="flex items-start gap-3">
          {/* Countdown */}
          <div className={`flex flex-col items-center justify-center rounded-lg px-2.5 py-1.5 min-w-[52px]
                          ${ep.days_until <= 3 ? "bg-red-50 border border-red-200" :
                            ep.days_until <= 7 ? "bg-amber-50 border border-amber-200" :
                            "bg-bg border border-edge"}`}>
            <span className={`text-lg font-bold font-mono ${
              ep.days_until <= 3 ? "text-red-700" : ep.days_until <= 7 ? "text-amber-700" : "text-secondary"
            }`}>
              {daysLabel}
            </span>
            <span className="text-[9px] text-muted uppercase">
              {new Date(ep.earnings_date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <Link href={`/company/${ep.ticker}`}
                className="text-base font-bold text-navy hover:text-navy-hover font-mono">
                {ep.ticker}
              </Link>
              {ep.sector && (
                <span className="text-[10px] text-muted border border-edge rounded px-1.5 py-0.5 bg-bg">
                  {ep.sector}
                </span>
              )}
            </div>
            <p className="text-xs text-secondary mt-0.5">{ep.name}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {ep.current_price != null && (
                <span className="text-sm text-primary font-mono font-medium">
                  {ep.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}
                </span>
              )}
              <ChangeCell value={ep.change_1d} />
              <ChangeCell value={ep.change_1m} className="text-xs" />
              <span className="text-[10px] text-muted">
                Vol. {ep.volatility_estimate}
              </span>
            </div>
          </div>
        </div>

        {/* Droite : score + recommandation */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <ScoreBadge score={ep.scores.composite} size="sm" />
          <span className={`text-xs font-medium px-2 py-0.5 rounded border ${recColor}`}>
            {ep.recommendation_label}
          </span>
        </div>
      </div>

      {/* Raison de la recommandation */}
      <p className="text-xs text-secondary mt-3 leading-relaxed">
        {ep.recommendation_reason}
      </p>

      {/* Estimations analystes */}
      {(ep.revenue_estimate || ep.eps_estimate) && (
        <div className="flex gap-4 mt-2 text-xs text-muted">
          {ep.revenue_estimate && (
            <span>CA estimé : <span className="text-primary font-mono">
              {(ep.revenue_estimate / 1e9).toFixed(1)}B
            </span></span>
          )}
          {ep.eps_estimate && (
            <span>BPA estimé : <span className="text-primary font-mono">
              {ep.eps_estimate.toFixed(2)}
            </span></span>
          )}
        </div>
      )}

      {/* Sous-scores */}
      <div className="mt-3 grid grid-cols-5 gap-2 text-xs text-muted border-t border-edge pt-2">
        {[
          ["Qualité", ep.scores.quality],
          ["Valeur",  ep.scores.valuation],
          ["Croiss.", ep.scores.growth],
          ["Momentum", ep.scores.momentum],
          ["Risque",  ep.scores.risk],
        ].map(([label, score]) => (
          <div key={label as string} className="text-center">
            <div className={`text-xs font-mono font-medium ${(score as number) >= 6.5 ? "text-navy" : "text-muted"}`}>
              {(score as number).toFixed(1)}
            </div>
            <div className="text-[10px]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
