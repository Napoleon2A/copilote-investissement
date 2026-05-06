"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { fetchJSON, API } from "./shared";
import { Fish } from "lucide-react";

interface Props {
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
}

// ─── SEC EDGAR 13-F ("stars investors") — facultatif, peut être absent ───
interface Whale {
  fund_name: string;
  fund_cik: string;
  value_usd: number;
  shares: number;
  position_pct: number;
}
interface WhaleData {
  ticker: string;
  count: number;
  holders: Whale[];
}

// ─── yfinance institutional holders (toujours dispo, asset managers) ────
interface InstHolder {
  name: string;
  pct_held: number | null;     // 0.069 = 6.9%
  shares: number;
  value: number | null;
  pct_change_qoq: number | null; // 0.27 = +27% Q/Q
}
interface HoldersData {
  ticker: string;
  report_date: string | null;
  pct_insiders: number | null;
  pct_institutions: number | null;
  holders: InstHolder[];
}

export function WhalePanel({ portfolioTickers, ideasTickers }: Props) {
  const [whales, setWhales] = useState<Record<string, WhaleData> | null>(null);
  const [holders, setHolders] = useState<Record<string, HoldersData> | null>(null);

  const allTickers = useMemo(
    () => Array.from(new Set([...portfolioTickers, ...ideasTickers])),
    [portfolioTickers, ideasTickers]
  );

  useEffect(() => {
    if (allTickers.length === 0) {
      setWhales({});
      setHolders({});
      return;
    }
    const list = allTickers.join(",");
    fetchJSON<{ data: Record<string, WhaleData> }>(`${API}/sec/whales-batch?tickers=${encodeURIComponent(list)}`)
      .then((r) => setWhales(r?.data ?? {}));
    fetchJSON<{ data: Record<string, HoldersData> }>(`${API}/companies/holders-batch?tickers=${encodeURIComponent(list)}`)
      .then((r) => setHolders(r?.data ?? {}));
  }, [allTickers.join(",")]);

  if (whales === null || holders === null) return <div className="card-premium p-4 h-32 animate-pulse" />;

  // Fusion : pour chaque ticker, on a top holders yfinance ET éventuellement les whales 13-F
  const tickers = allTickers.filter((t) => (holders[t]?.holders?.length ?? 0) > 0 || (whales[t]?.count ?? 0) > 0);

  if (tickers.length === 0) {
    return (
      <div className="card-premium p-4">
        <div className="flex items-center gap-2 mb-3">
          <Fish size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Détenteurs &amp; whales
          </h4>
        </div>
        <p className="text-xs text-muted italic text-center py-3">
          Aucune donnée d&apos;actionnariat disponible pour tes tickers.
        </p>
      </div>
    );
  }

  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Fish size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Détenteurs &amp; whales
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">{tickers.length} ticker{tickers.length > 1 ? "s" : ""}</span>
      </div>

      <p className="text-[0.7rem] text-muted leading-relaxed mb-2">
        Top détenteurs institutionnels (asset managers via yfinance) + sociétés stars détectées (13-F SEC EDGAR si match).
      </p>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {tickers.map((t) => (
          <HolderRow
            key={t}
            ticker={t}
            holders={holders[t]?.holders ?? []}
            pctInsiders={holders[t]?.pct_insiders ?? null}
            pctInstitutions={holders[t]?.pct_institutions ?? null}
            reportDate={holders[t]?.report_date ?? null}
            whales={whales[t]?.holders ?? []}
          />
        ))}
      </div>
    </div>
  );
}

function HolderRow({
  ticker, holders, pctInsiders, pctInstitutions, reportDate, whales,
}: {
  ticker: string;
  holders: InstHolder[];
  pctInsiders: number | null;
  pctInstitutions: number | null;
  reportDate: string | null;
  whales: Whale[];
}) {
  const meta = getTickerMeta(ticker);
  // Borne max pour l'échelle des barres : le plus gros holder de cette société
  const maxPct = holders.length > 0 ? Math.max(...holders.map((h) => h.pct_held ?? 0)) : 1;
  const top4 = holders.slice(0, 4);

  return (
    <Link href={`/company/${ticker}`} className="block group">
      <div className="rounded-lg border border-edge/30 bg-surface/30 hover:bg-bg/40 p-2.5 transition-colors">
        {/* En-tête ticker */}
        <div className="flex items-center gap-2 mb-1.5">
          <TickerBadge ticker={ticker} size="xs" showName={false} />
          <span className="font-mono font-bold text-xs text-navy dark:text-accent">{ticker}</span>
          <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
          {pctInstitutions != null && (
            <span className="text-[0.625rem] text-muted whitespace-nowrap">
              instit. {(pctInstitutions * 100).toFixed(0)}%
              {pctInsiders != null && pctInsiders > 0.01 && ` · init. ${(pctInsiders * 100).toFixed(1)}%`}
            </span>
          )}
        </div>

        {/* Top 4 holders avec barre de poids et évolution Q/Q */}
        {top4.length > 0 && (
          <div className="space-y-1">
            {top4.map((h) => {
              const widthPct = maxPct > 0 ? Math.max(2, ((h.pct_held ?? 0) / maxPct) * 100) : 0;
              const qoq = h.pct_change_qoq;
              const qoqPct = qoq != null ? qoq * 100 : null;
              const qoqColor =
                qoqPct == null ? "text-muted" :
                qoqPct >= 5 ? "text-emerald-700 dark:text-emerald-500" :
                qoqPct <= -5 ? "text-red-700 dark:text-red-500" :
                "text-muted";
              const qoqLabel =
                qoqPct == null ? "" :
                Math.abs(qoqPct) < 1 ? "≈" :
                qoqPct > 0 ? `+${qoqPct.toFixed(0)}%` :
                `${qoqPct.toFixed(0)}%`;
              return (
                <div key={h.name} className="flex items-center gap-2 text-[0.625rem]">
                  <span className="text-secondary truncate flex-1" title={h.name}>{shortenHolder(h.name)}</span>
                  <span className="font-mono text-primary tabular-nums w-10 text-right">
                    {h.pct_held != null ? `${(h.pct_held * 100).toFixed(1)}%` : "—"}
                  </span>
                  <div className="flex-shrink-0 w-12 h-1.5 rounded-full bg-edge/20 overflow-hidden">
                    <div className="h-full bg-navy/60 dark:bg-accent/70 rounded-full" style={{ width: `${widthPct}%` }} />
                  </div>
                  <span className={`font-mono tabular-nums w-10 text-right ${qoqColor}`} title="Évolution trimestre / trimestre">
                    {qoqLabel}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Stars investors (13-F) en-dessous, si présents */}
        {whales.length > 0 && (
          <div className="mt-2 pt-1.5 border-t border-edge/20">
            <p className="text-[0.55rem] uppercase tracking-wider text-muted mb-0.5">★ Whales connus</p>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.625rem]">
              {whales.slice(0, 3).map((w) => (
                <span key={w.fund_cik} className="text-secondary">
                  {w.fund_name.split(" (")[0]}
                  <span className="text-muted"> · {formatNumber(w.value_usd)}$</span>
                </span>
              ))}
              {whales.length > 3 && <span className="text-muted italic">+{whales.length - 3}</span>}
            </div>
          </div>
        )}

        {reportDate && (
          <p className="text-[0.55rem] text-muted mt-1">Source 13-F au {reportDate}</p>
        )}
      </div>
    </Link>
  );
}

// Raccourcit "Blackrock Inc." / "The Vanguard Group, Inc." pour économiser la largeur
function shortenHolder(name: string): string {
  return name
    .replace(/, ?Inc\.?$/i, "")
    .replace(/ Inc\.?$/i, "")
    .replace(/, ?LLC$/i, "")
    .replace(/, ?LP$/i, "")
    .replace(/, ?LLP$/i, "")
    .replace(/^The /i, "");
}

function formatNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}K`;
  return Math.round(n).toString();
}
