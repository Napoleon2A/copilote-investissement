"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { fetchJSON, API } from "./shared";
import { Briefcase } from "lucide-react";

interface InsiderTradingPanelProps {
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
}

interface InsiderData {
  ticker: string;
  summary: {
    count: number;
    net_shares: number;
    total_buy: number;
    total_sell: number;
    net_value_usd: number;
  };
  transactions: Array<{
    name: string;
    share: number;
    change: number;
    transactionDate: string;
    transactionPrice: number;
    transactionCode: string;
  }>;
}

export function InsiderTradingPanel({ portfolioTickers, ideasTickers }: InsiderTradingPanelProps) {
  const [data, setData] = useState<Record<string, InsiderData> | null>(null);

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
        const r = await fetchJSON<InsiderData>(`${API}/finnhub/insider/${t}`);
        return [t, r] as const;
      })
    ).then((results) => {
      const map: Record<string, InsiderData> = {};
      for (const [t, r] of results) {
        if (r) map[t] = r;
      }
      setData(map);
    });
  }, [allTickers.join(",")]);

  if (data === null) return <div className="card-premium p-4 h-32 animate-pulse" />;

  // Filtrer les tickers ayant des transactions
  const withActivity = Object.values(data).filter(d => d.summary.count > 0);
  if (withActivity.length === 0) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <Briefcase size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Insider trading
          </h4>
        </div>
        <p className="text-xs text-muted italic text-center py-3">
          Aucune transaction insider détectée sur tes tickers (3 derniers mois).
        </p>
      </div>
    );
  }

  // Tri : ceux avec le plus gros signal en premier (valeur absolue net_value)
  withActivity.sort((a, b) => Math.abs(b.summary.net_value_usd) - Math.abs(a.summary.net_value_usd));

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Briefcase size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Insider trading
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">3 derniers mois · {withActivity.length} sociétés</span>
      </div>

      <p className="text-[0.7rem] text-muted leading-relaxed mb-2">
        Achats / ventes des dirigeants sur tes positions et idées. Net positif = signal bullish (les insiders accumulent).
      </p>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {withActivity.map((d) => <InsiderRow key={d.ticker} data={d} />)}
      </div>
    </div>
  );
}

function InsiderRow({ data }: { data: InsiderData }) {
  const meta = getTickerMeta(data.ticker);
  const s = data.summary;
  const isBullish = s.net_value_usd > 0;
  const lastT = data.transactions[0];

  return (
    <Link href={`/company/${data.ticker}`} className="block group">
      <div className={`rounded-lg border p-2.5 transition-colors hover:bg-bg/40
        ${isBullish ? "border-l-4 border-l-emerald-500 border-emerald-500/20 bg-emerald-500/5"
                   : "border-l-4 border-l-red-500 border-red-500/20 bg-red-500/5"}`}>
        <div className="flex items-center gap-2 mb-1">
          <TickerBadge ticker={data.ticker} size="xs" showName={false} />
          <span className="font-mono font-bold text-xs text-navy dark:text-accent">{data.ticker}</span>
          <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
          <span className={`text-xs font-mono font-bold ${isBullish ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            {isBullish ? "+" : ""}{formatNumber(s.net_value_usd)}$
          </span>
        </div>
        <div className="flex items-center gap-3 text-[0.625rem] text-muted">
          <span>{s.count} transaction{s.count > 1 ? "s" : ""}</span>
          {s.total_buy > 0 && <span className="text-emerald-700 dark:text-emerald-400">↑ {formatNumber(s.total_buy)} achat</span>}
          {s.total_sell > 0 && <span className="text-red-700 dark:text-red-400">↓ {formatNumber(s.total_sell)} vente</span>}
          {lastT && <span className="ml-auto">Dernière : {lastT.transactionDate}</span>}
        </div>
      </div>
    </Link>
  );
}

function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toString();
}
