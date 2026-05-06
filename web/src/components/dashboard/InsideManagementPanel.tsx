"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { fetchJSON, API } from "./shared";
import { IcInsideMgmt } from "./icons";

interface Props {
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
}

interface Officer {
  name: string;
  title: string;
  age: number | null;
  total_pay: number | null;
  year_born: number | null;
  fiscal_year: number | null;
  x_handle: string | null;
  linkedin_url: string | null;
}

interface OfficersData {
  ticker: string;
  count: number;
  officers: Officer[];
}

/**
 * Renvoie une catégorie pour le tri : CEO en premier, puis CFO, COO, CTO, CXO, autres.
 */
function rankTitle(title: string): number {
  const t = (title || "").toUpperCase();
  if (t.includes("CEO") || t.includes("CHIEF EXECUTIVE")) return 0;
  if (t.includes("CFO") || t.includes("CHIEF FINANCIAL")) return 1;
  if (t.includes("COO") || t.includes("CHIEF OPERATING")) return 2;
  if (t.includes("CTO") || t.includes("CHIEF TECHNOLOGY")) return 3;
  if (t.includes("CHAIR") || t.includes("PRESIDENT")) return 4;
  return 5;
}

/**
 * Catégorie courte (CEO / CFO / COO / Chair / Other) pour le badge.
 */
function shortRole(title: string): string {
  const t = (title || "").toUpperCase();
  if (t.includes("CEO") || t.includes("CHIEF EXECUTIVE")) return "CEO";
  if (t.includes("CFO") || t.includes("CHIEF FINANCIAL")) return "CFO";
  if (t.includes("COO") || t.includes("CHIEF OPERATING")) return "COO";
  if (t.includes("CTO") || t.includes("CHIEF TECHNOLOGY")) return "CTO";
  if (t.includes("CHAIR")) return "Chair";
  if (t.includes("PRESIDENT")) return "Pres.";
  return "Exec";
}

export function InsideManagementPanel({ portfolioTickers, ideasTickers }: Props) {
  const [data, setData] = useState<Record<string, OfficersData> | null>(null);

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
        const r = await fetchJSON<OfficersData>(`${API}/companies/${t}/officers`);
        return [t, r] as const;
      })
    ).then((results) => {
      const map: Record<string, OfficersData> = {};
      for (const [t, r] of results) {
        if (r) map[t] = r;
      }
      setData(map);
    });
  }, [allTickers.join(",")]);

  if (data === null) return <div className="card-premium p-4 h-32 animate-pulse" />;

  const withOfficers = Object.values(data).filter((d) => d.count > 0);

  if (withOfficers.length === 0) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <IcInsideMgmt size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Inside management
          </h4>
        </div>
        <p className="text-xs text-muted italic text-center py-3">
          Aucun dirigeant identifié pour tes tickers (yfinance n&apos;a pas remonté de companyOfficers).
        </p>
      </div>
    );
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IcInsideMgmt size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Inside management
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">{withOfficers.length} sociétés · top management</span>
      </div>

      <p className="text-[0.7rem] text-muted leading-relaxed mb-2">
        Top dirigeants des sociétés en portefeuille et idées.
        Slots X / LinkedIn préparés pour suivre changements de poste et publications clés (à connecter).
      </p>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {withOfficers.map((d) => <OfficersRow key={d.ticker} data={d} />)}
      </div>
    </div>
  );
}

function OfficersRow({ data }: { data: OfficersData }) {
  const meta = getTickerMeta(data.ticker);
  const sorted = [...data.officers].sort((a, b) => rankTitle(a.title) - rankTitle(b.title));
  const top = sorted.slice(0, 3);

  return (
    <Link href={`/company/${data.ticker}`} className="block group">
      <div className="rounded-lg border border-edge/30 bg-surface/40 p-2.5 hover:bg-bg/40 transition-colors">
        <div className="flex items-center gap-2 mb-1.5">
          <TickerBadge ticker={data.ticker} size="xs" showName={false} />
          <span className="font-mono font-bold text-xs text-navy dark:text-accent">{data.ticker}</span>
          <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
          <span className="text-[0.625rem] font-semibold text-muted">{data.count} dirigeants</span>
        </div>

        <ul className="space-y-1">
          {top.map((o, i) => (
            <li key={i} className="flex items-center gap-2 text-[0.7rem]">
              <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-1.5 py-px rounded border whitespace-nowrap
                ${i === 0
                  ? "bg-navy/10 text-navy dark:bg-accent/15 dark:text-accent border-navy/30 dark:border-accent/30"
                  : "bg-surface-alt text-muted border-edge"}`}>
                {shortRole(o.title)}
              </span>
              <span className="text-primary font-medium truncate flex-1">{o.name?.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.|Mx\.)\s+/, "")}</span>
              {o.age != null && (
                <span className="text-[0.55rem] text-muted whitespace-nowrap">{o.age} ans</span>
              )}
              {o.total_pay != null && o.total_pay > 0 && (
                <span className="text-[0.625rem] font-mono text-muted whitespace-nowrap" title="Total compensation (proxy SEC)">
                  {formatPay(o.total_pay)}
                </span>
              )}
              <span className="text-[0.55rem] text-muted/50 italic whitespace-nowrap" title="À connecter : feed Twitter/X et LinkedIn changes">
                X · in
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Link>
  );
}

function formatPay(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M$`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K$`;
  return `${n}$`;
}
