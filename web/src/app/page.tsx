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
import { EarningsCalendarPanel } from "@/components/dashboard/EarningsCalendarPanel";
import { EconomicCalendarPanel } from "@/components/dashboard/EconomicCalendarPanel";
import { InsiderTradingPanel } from "@/components/dashboard/InsiderTradingPanel";
import { AnalystRecosPanel } from "@/components/dashboard/AnalystRecosPanel";
import { fetchJSON, API } from "@/components/dashboard/shared";
import type { MarketSnapshot } from "@/lib/macroExplainer";

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
  const [tickerScores, setTickerScores] = useState<Record<string, any>>({});

  // Fetch initial — 8 endpoints en parallèle
  useEffect(() => {
    fetchJSON<any>(`${API}/brief`).then(setBrief);
    fetchJSON<any>(`${API}/scanner/opportunities?max_results=5`).then(setOpps);
    // Earnings : 10 jours, tickers additionnels passés dans le 2e useEffect
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
    // Earnings : fenêtre 10 jours + inclusion systématique de tes tickers (mes positions + idées)
    const myList = Array.from(tickers).filter(Boolean).join(",");
    fetchJSON<any>(`${API}/earnings/upcoming?max_days=15&extra_tickers=${encodeURIComponent(myList)}`).then(setEarnings);

    if (list) {
      fetchJSON<any>(`${API}/news/linked?tickers=${list}&limit=20`).then(setLinkedNewsRSS);
      fetchJSON<any>(`${API}/news/per-ticker?tickers=${list}&max_per_ticker=5`).then(setPerTickerNews);

      // Fetch les scores pour chaque ticker (alimente les insights enrichis)
      const tickersList = Array.from(tickers).filter(Boolean);
      Promise.all(
        tickersList.map(async (t) => {
          const data = await fetchJSON<any>(`${API}/companies/${t}/scores`);
          return [t, data] as const;
        })
      ).then((results) => {
        const map: Record<string, any> = {};
        for (const [t, data] of results) {
          if (data) map[t] = data;
        }
        setTickerScores(map);
      });
    } else {
      setLinkedNewsRSS({ count: 0, articles: [] });
      setPerTickerNews({ count: 0, articles: [] });
      setTickerScores({});
    }
  }, [portfolio, ideas, opps]);

  const topPicks = opps?.opportunities?.slice(0, 3) ?? [];

  // Construit le snapshot macro pour les analyses contextuelles
  const snapshot: MarketSnapshot | null = useMemo(() => {
    if (!brief?.market_context || !brief?.market_summary) return null;
    const ms = brief.market_summary;
    return {
      vix: brief.market_context.vix ?? null,
      vix_change_1m: ms.VIX?.change_1m ?? null,
      sp500_price: ms.SP500?.price ?? null,
      sp500_ytd: ms.SP500?.change_ytd ?? null,
      sp500_1m: ms.SP500?.change_1m ?? null,
      nasdaq_ytd: ms.NASDAQ?.change_ytd ?? null,
      nasdaq_1m: ms.NASDAQ?.change_1m ?? null,
      cac40_ytd: ms.CAC40?.change_ytd ?? null,
      cac40_1m: ms.CAC40?.change_1m ?? null,
      us10y: ms.US10Y?.price ?? null,
      us10y_1m_change: ms.US10Y?.change_1m ?? null,
      dxy: ms.DXY?.price ?? null,
      dxy_1m: ms.DXY?.change_1m ?? null,
      gold_ytd: ms.Or?.change_ytd ?? null,
      wti_ytd: ms.WTI?.change_ytd ?? null,
      wti_1m: ms.WTI?.change_1m ?? null,
    };
  }, [brief]);

  // Liste des news linked (perTickerNews + macroLinked) pour l'analyse
  const allLinkedNews = useMemo(() => {
    const m = linkedNewsRSS?.articles ?? [];
    const t = perTickerNews?.articles ?? [];
    return [...t, ...m];
  }, [linkedNewsRSS, perTickerNews]);

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

      {/* Row 1 : Actualité des cibles (50%) ↔ Calendrier earnings (50%) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[520px]">
        <div className="min-h-0">
          <LinkedNewsPanel
            data={linkedNewsRSS}
            perTickerData={perTickerNews}
            portfolioTickers={portfolioTickers}
            ideasTickers={ideasTickers}
            picksTickers={picksTickers}
          />
        </div>
        <div className="min-h-0">
          <EarningsCalendarPanel
            earnings={earnings}
            portfolioTickers={portfolioTickers}
            ideasTickers={ideasTickers}
          />
        </div>
      </div>

      {/* Row 2 : Comprendre marché ↔ Actualité macro */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:h-[460px]">
        <div className="min-h-0">
          <MarketContextPanel
            ctx={brief?.market_context}
            marketSummary={brief?.market_summary}
            loading={brief === undefined}
          />
        </div>
        <div className="min-h-0">
          <MacroNewsPanel data={macroNewsRSS} />
        </div>
      </div>

      {/* Row 3 : Calendrier économique (50%) + Insider trading (50%) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EconomicCalendarPanel />
        <InsiderTradingPanel
          portfolioTickers={portfolioTickers}
          ideasTickers={ideasTickers}
        />
      </div>

      {/* Row 3 bis : Vue analystes (pleine largeur) */}
      <AnalystRecosPanel
        portfolioTickers={portfolioTickers}
        ideasTickers={ideasTickers}
      />

      {/* Row 4 : Stats grille 4 cards en pleine largeur */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ gridAutoRows: "1fr" }}>
        <RichEarningsCard earnings={earnings} />
        <RichPortfolioCard portfolio={portfolio} />
        <RichWatchlistCard watchlists={watchlists} />
        <RichAlertsCard alerts={alerts} />
      </div>
    </div>
  );
}
