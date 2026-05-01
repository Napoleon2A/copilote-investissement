"use client";

import { useEffect, useMemo, useState } from "react";
import { MoonHeader } from "@/components/dashboard/MoonHeader";
import { PicksHero } from "@/components/dashboard/PicksHero";
import { MarketContextPanel } from "@/components/dashboard/MarketContextPanel";
import { MacroNewsPanel } from "@/components/dashboard/MacroNewsPanel";
import { LinkedNewsPanel } from "@/components/dashboard/LinkedNewsPanel";
import {
  RichEarningsCard, RichPortfolioCard, RichWatchlistCard, RichAlertsCard,
} from "@/components/dashboard/StatCards";
import { fetchJSON, API } from "@/components/dashboard/shared";

export default function HomePage() {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const [brief, setBrief]               = useState<any>(undefined);
  const [opps, setOpps]                 = useState<any>(undefined);
  const [earnings, setEarnings]         = useState<any>(undefined);
  const [alerts, setAlerts]             = useState<any>(undefined);
  const [watchlists, setWatchlists]     = useState<any>(undefined);
  const [portfolio, setPortfolio]       = useState<any>(undefined);
  const [ideas, setIdeas]               = useState<any>(undefined);
  const [macroNewsRSS, setMacroNewsRSS] = useState<any>(undefined);
  const [linkedNewsRSS, setLinkedNewsRSS] = useState<any>(undefined);
  const [perTickerNews, setPerTickerNews] = useState<any>(undefined);

  // Fetch initial — 8 endpoints en parallèle
  useEffect(() => {
    fetchJSON<any>(`${API}/brief`).then(setBrief);
    fetchJSON<any>(`${API}/scanner/opportunities?max_results=5`).then(setOpps);
    fetchJSON<any>(`${API}/earnings/upcoming`).then(setEarnings);
    fetchJSON<any>(`${API}/alerts`).then(setAlerts);
    fetchJSON<any[]>(`${API}/watchlists`).then(setWatchlists);
    fetchJSON<any>(`${API}/portfolio/positions`).then(setPortfolio);
    fetchJSON<any[]>(`${API}/ideas`).then(setIdeas);
    fetchJSON<any>(`${API}/news/macro?limit=20`).then(setMacroNewsRSS);
  }, []);

  // Fetch news liées une fois qu'on connaît les tickers d'intérêt
  useEffect(() => {
    if (portfolio === undefined || ideas === undefined || opps === undefined) return;
    const tickers = new Set<string>();
    portfolio?.positions?.forEach((p: any) => tickers.add(p.ticker?.toUpperCase()));
    ideas?.forEach((i: any) => tickers.add(i.ticker?.toUpperCase()));
    opps?.opportunities?.slice(0, 3).forEach((p: any) => tickers.add(p.ticker?.toUpperCase()));
    const list = Array.from(tickers).filter(Boolean).join(",");
    if (list) {
      fetchJSON<any>(`${API}/news/linked?tickers=${list}&limit=20`).then(setLinkedNewsRSS);
      fetchJSON<any>(`${API}/news/per-ticker?tickers=${list}&max_per_ticker=5`).then(setPerTickerNews);
    } else {
      setLinkedNewsRSS({ count: 0, articles: [] });
      setPerTickerNews({ count: 0, articles: [] });
    }
  }, [portfolio, ideas, opps]);

  const topPicks = opps?.opportunities?.slice(0, 3) ?? [];

  const portfolioTickers = useMemo(
    () => new Set<string>(portfolio?.positions?.map((p: any) => p.ticker?.toUpperCase()) ?? []),
    [portfolio]
  );
  const ideasTickers = useMemo(
    () => new Set<string>(ideas?.map((i: any) => i.ticker?.toUpperCase()) ?? []),
    [ideas]
  );
  const picksTickers = useMemo(
    () => new Set<string>(topPicks.map((p: any) => p.ticker?.toUpperCase())),
    [topPicks]
  );

  return (
    <div className="space-y-6 pb-6">
      <MoonHeader today={today} />

      <PicksHero picks={topPicks} loading={opps === undefined} scanning={opps?.scanning} />

      {/* Row 1 : Comprendre marché ↔ Actualité des cibles */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[480px]">
        <div className="lg:col-span-3 min-h-0">
          <MarketContextPanel
            ctx={brief?.market_context}
            marketSummary={brief?.market_summary}
            loading={brief === undefined}
          />
        </div>
        <div className="lg:col-span-2 min-h-0">
          <LinkedNewsPanel
            data={linkedNewsRSS}
            perTickerData={perTickerNews}
            portfolioTickers={portfolioTickers}
            ideasTickers={ideasTickers}
            picksTickers={picksTickers}
          />
        </div>
      </div>

      {/* Row 2 : Actualité macro ↔ Grille 2x2 stats */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:h-[460px]">
        <div className="lg:col-span-3 min-h-0">
          <MacroNewsPanel data={macroNewsRSS} />
        </div>
        <div className="lg:col-span-2 min-h-0">
          <div className="grid grid-cols-2 gap-3 h-full" style={{ gridAutoRows: "1fr" }}>
            <RichEarningsCard earnings={earnings} />
            <RichPortfolioCard portfolio={portfolio} />
            <RichWatchlistCard watchlists={watchlists} />
            <RichAlertsCard alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
