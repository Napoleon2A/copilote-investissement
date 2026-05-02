"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { fetchJSON, API } from "./shared";
import { Users } from "lucide-react";

interface Props {
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
}

interface RecoRow {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

interface RecoData {
  ticker: string;
  recommendations: RecoRow[];
  price_target: {
    targetHigh?: number;
    targetLow?: number;
    targetMean?: number;
    targetMedian?: number;
    numberOfAnalysts?: number;
    lastUpdated?: string;
  } | null;
}

export function AnalystRecosPanel({ portfolioTickers, ideasTickers }: Props) {
  const [data, setData] = useState<Record<string, RecoData> | null>(null);

  const allTickers = useMemo(
    () => Array.from(new Set([...portfolioTickers, ...ideasTickers])),
    [portfolioTickers, ideasTickers]
  );

  useEffect(() => {
    if (allTickers.length === 0) {
      setData({});
      return;
    }
    Promise.all(
      allTickers.map(async (t) => {
        const r = await fetchJSON<RecoData>(`${API}/finnhub/recommendations/${t}`);
        return [t, r] as const;
      })
    ).then((results) => {
      const map: Record<string, RecoData> = {};
      for (const [t, r] of results) {
        if (r) map[t] = r;
      }
      setData(map);
    });
  }, [allTickers.join(",")]);

  if (data === null) return <div className="card-premium p-4 h-32 animate-pulse" />;

  const withRecos = Object.values(data).filter(d => d.recommendations.length > 0);

  if (withRecos.length === 0) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Vue analystes
          </h4>
        </div>
        <p className="text-xs text-muted italic text-center py-3">
          Aucune recommandation disponible pour tes tickers.
        </p>
      </div>
    );
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Vue analystes
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">{withRecos.length} sociétés</span>
      </div>

      <p className="text-[0.7rem] text-muted leading-relaxed mb-2">
        Distribution des recommandations Buy/Hold/Sell des analystes (mois le plus récent).
      </p>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {withRecos.map((d) => <AnalystRow key={d.ticker} data={d} />)}
      </div>
    </div>
  );
}

function AnalystRow({ data }: { data: RecoData }) {
  const meta = getTickerMeta(data.ticker);
  const r = data.recommendations[0];
  const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
  if (total === 0) return null;

  const buyShare = (r.strongBuy + r.buy) / total;
  const holdShare = r.hold / total;
  const sellShare = (r.sell + r.strongSell) / total;

  // Sentiment dominant
  let sentiment: "buy" | "hold" | "sell" = "hold";
  if (buyShare > 0.6) sentiment = "buy";
  else if (sellShare > 0.4) sentiment = "sell";
  else if (buyShare > sellShare) sentiment = "buy";

  const sentColor = sentiment === "buy"
    ? "border-l-emerald-500 bg-emerald-500/5"
    : sentiment === "sell"
      ? "border-l-red-500 bg-red-500/5"
      : "border-l-amber-500 bg-amber-500/5";

  const target = data.price_target;
  const hasTarget = target?.targetMean != null && target.targetMean > 0;

  return (
    <Link href={`/company/${data.ticker}`} className="block group">
      <div className={`rounded-lg border-l-4 border border-edge/30 ${sentColor} p-2.5 transition-colors hover:bg-bg/40`}>
        <div className="flex items-center gap-2 mb-1.5">
          <TickerBadge ticker={data.ticker} size="xs" showName={false} />
          <span className="font-mono font-bold text-xs text-navy dark:text-accent">{data.ticker}</span>
          <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
          <span className="text-[0.625rem] font-bold uppercase text-muted">{total} analystes</span>
        </div>

        {/* Barre de répartition */}
        <div className="flex h-2 rounded overflow-hidden mb-1.5">
          {buyShare > 0 && <div className="bg-emerald-500" style={{ width: `${buyShare * 100}%` }} title={`${r.strongBuy + r.buy} Buy`} />}
          {holdShare > 0 && <div className="bg-amber-500" style={{ width: `${holdShare * 100}%` }} title={`${r.hold} Hold`} />}
          {sellShare > 0 && <div className="bg-red-500" style={{ width: `${sellShare * 100}%` }} title={`${r.sell + r.strongSell} Sell`} />}
        </div>

        <div className="flex items-center gap-3 text-[0.625rem]">
          <span className="text-emerald-700 dark:text-emerald-400">
            {r.strongBuy + r.buy} Buy ({Math.round(buyShare * 100)}%)
          </span>
          <span className="text-amber-700 dark:text-amber-400">
            {r.hold} Hold ({Math.round(holdShare * 100)}%)
          </span>
          <span className="text-red-700 dark:text-red-400">
            {r.sell + r.strongSell} Sell ({Math.round(sellShare * 100)}%)
          </span>
          {hasTarget && (
            <span className="ml-auto text-secondary">
              Cible : {target!.targetMean!.toFixed(0)}$
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
