"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchJSON<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<any>(undefined);
  const [signals, setSignals] = useState<Record<string, any>>({});
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setOpps(undefined);
    setSignals({});
    const d = await fetchJSON<any>(`${API}/scanner/opportunities?max_results=15`);
    setOpps(d);
  };

  const refresh = async () => {
    setRefreshing(true);
    await fetch(`${API}/scanner/refresh`, { method: "POST" });
    setTimeout(async () => {
      await load();
      setRefreshing(false);
    }, 60000);  // attend 60s pour le re-scan
  };

  useEffect(() => { load(); }, []);

  const list: any[] = opps?.opportunities ?? [];

  // Enrichissement signaux (ETF, smart-money, insider) — chargement en
  // arrière-plan, jamais bloquant pour l'affichage de la liste.
  useEffect(() => {
    if (list.length === 0) return;
    const tickers = list.map((o: any) => o.ticker).join(",");
    fetchJSON<Record<string, any>>(`${API}/discovery/signals?tickers=${encodeURIComponent(tickers)}`)
      .then(d => { if (d) setSignals(d); });
  }, [opps]);

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-edge/40">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-emerald-500 to-emerald-700 rounded-full" />
          <div>
            <Link href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </Link>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Opportunités du jour
            </h1>
            <p className="text-sm text-muted mt-1">
              Scanner sur {opps?.universe_size ?? "67"} tickers · seuil score ≥ {opps?.min_score_applied ?? 6}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {opps?.cache_age_minutes != null && (
            <span className="text-xs text-muted">
              Cache : {opps.cache_age_minutes < 1 ? "< 1 min" : `${Math.round(opps.cache_age_minutes)} min`}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing || opps?.is_refreshing}
            className="text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing || opps?.is_refreshing ? "Scan en cours..." : "↻ Relancer le scan"}
          </button>
        </div>
      </div>

      {/* État scan en cours */}
      {opps?.scanning && (
        <div className="card-premium p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-primary font-medium">Premier scan en cours</p>
          <p className="text-sm text-muted mt-1">~60 secondes — analyse de 67 tickers en parallèle</p>
        </div>
      )}

      {/* Liste des opportunités */}
      {!opps?.scanning && list.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {list.map((opp, i) => (
            <OpportunityCard key={opp.ticker} opp={opp} rank={i + 1} signals={signals[opp.ticker]} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {opps && !opps.scanning && list.length === 0 && (
        <div className="card-premium p-8 text-center">
          <p className="text-primary">Aucune opportunité détectée actuellement.</p>
          <p className="text-sm text-muted mt-1">Les conditions de marché ne génèrent pas de signal au-dessus du seuil.</p>
        </div>
      )}

      {/* Loading */}
      {opps === undefined && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="card-premium p-5 h-64 animate-pulse" />
          ))}
        </div>
      )}
    </div>
  );
}

function OpportunityCard({ opp, rank, signals }: { opp: any; rank: number; signals?: any }) {
  const meta = getTickerMeta(opp.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const change = opp.change_1d;
  const isUp = (change ?? 0) >= 0;
  const score = opp.scores?.composite;
  const scoreColor = score >= 7.5 ? "text-emerald-600 dark:text-emerald-400 stroke-emerald-500"
                  : score >= 6.5 ? "text-amber-600 dark:text-amber-400 stroke-amber-500"
                  :                "text-muted stroke-muted";

  return (
    <Link href={`/company/${opp.ticker}`} className="block group">
      <div className="card-premium card-aura relative p-5 h-full flex flex-col">
        {/* Header : rank + badges */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              #{rank}
            </span>
            {sectorStyle && sector && (
              <span className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                {SECTOR_LABEL[sector]}
              </span>
            )}
            {opp.new_opportunity && (
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                Nouveau
              </span>
            )}
          </div>
          {score != null && <ScoreGauge value={score} colorClass={scoreColor} size={48} />}
        </div>

        {/* Logo + nom */}
        <div className="flex items-center gap-3 mb-3">
          <TickerBadge ticker={opp.ticker} size="lg" showName={false} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-primary leading-tight truncate"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {meta.name}
            </h3>
            <p className="text-xs text-muted font-mono">{opp.ticker} · {opp.action_label}</p>
          </div>
        </div>

        {/* Highlights */}
        {opp.highlights?.length > 0 && (
          <ul className="space-y-1 mb-3 flex-1">
            {opp.highlights.slice(0, 3).map((h: string, i: number) => (
              <li key={i} className="text-xs text-secondary leading-snug flex items-start gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">▸</span>
                <span className="line-clamp-2">{h}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Signaux complémentaires (informatifs, non bloquants) */}
        <SignalBadges signals={signals} />

        {/* Bottom : change + sparkline + upside */}
        <div className="flex items-center justify-between gap-2 pt-3 border-t border-edge/40">
          <div>
            <p className="text-[0.625rem] uppercase tracking-widest text-muted">1 jour</p>
            <p className={`text-sm font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {isUp ? "+" : ""}{change?.toFixed(2)}%
            </p>
          </div>
          <Sparkline ticker={opp.ticker} width={70} height={22} />
          {opp.upside_vs_target != null && (
            <div className="text-right">
              <p className="text-[0.625rem] uppercase tracking-widest text-muted">Upside</p>
              <p className={`text-sm font-bold font-mono ${opp.upside_vs_target >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {opp.upside_vs_target > 0 ? "+" : ""}{opp.upside_vs_target.toFixed(0)}%
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

/**
 * Badges informatifs : ETF thématiques, smart money 13-F, insider trading.
 * Ne masquent JAMAIS la card si absents — c'est un complément, pas un filtre.
 */
function SignalBadges({ signals }: { signals?: any }) {
  if (!signals) return null;

  const badges: Array<{ label: string; tooltip: string; tone: "info" | "bull" | "bear" | "warn" }> = [];

  // ETF thématique
  if (signals.etf?.present) {
    badges.push({
      label: `ETF×${signals.etf.etf_count}`,
      tooltip: `Présent dans : ${(signals.etf.etfs || []).join(", ")}`,
      tone: "info",
    });
  }

  // Smart money — initiated en priorité (signal le plus fort)
  if (signals.smart_money?.initiated > 0) {
    const initFunds = (signals.smart_money.highlights || [])
      .filter((h: any) => h.status === "initiated")
      .map((h: any) => h.fund_name)
      .join(", ");
    badges.push({
      label: `${signals.smart_money.initiated} fonds initiated`,
      tooltip: `Vient d'ouvrir une position : ${initFunds || "fonds high-conviction"}`,
      tone: "bull",
    });
  } else if (signals.smart_money?.concentrated_holders > 0) {
    const top = signals.smart_money.highlights?.[0];
    const tooltip = top
      ? `${top.fund_name} ${top.position_pct?.toFixed(1)}% du book${top.delta_pct != null ? ` (Δ ${top.delta_pct >= 0 ? "+" : ""}${top.delta_pct.toFixed(0)}%)` : ""}`
      : "";
    badges.push({
      label: `${signals.smart_money.concentrated_holders} fonds`,
      tooltip,
      tone: "info",
    });
  }

  // Insider top management — net signé
  if (signals.insider?.present) {
    const net = signals.insider.net_value_usd ?? 0;
    if (net > 100_000) {
      badges.push({
        label: `Insider +$${formatM(net)}`,
        tooltip: `${signals.insider.buy_count} achat(s), ${signals.insider.sell_count} vente(s) sur 90j`,
        tone: "bull",
      });
    } else if (net < -100_000) {
      badges.push({
        label: `Insider -$${formatM(Math.abs(net))}`,
        tooltip: `${signals.insider.buy_count} achat(s), ${signals.insider.sell_count} vente(s) sur 90j`,
        tone: "bear",
      });
    }
  }

  // Politique : signal stub pour l'instant — affiché uniquement si source branchée
  if (signals.political?.source_available && signals.political?.count > 0) {
    badges.push({
      label: `${signals.political.count} trade pol.`,
      tooltip: (signals.political.highlights || []).map((h: any) => `${h.name}: ${h.transaction}`).join(" | "),
      tone: "warn",
    });
  }

  if (badges.length === 0) return null;

  const toneClass: Record<string, string> = {
    info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    bull: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    bear: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    warn: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  };

  return (
    <div className="flex flex-wrap gap-1 mb-3">
      {badges.map((b, i) => (
        <span
          key={i}
          title={b.tooltip}
          className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${toneClass[b.tone]}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

function formatM(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toFixed(0);
}

function ScoreGauge({ value, colorClass, size = 48 }: { value: number; colorClass: string; size?: number }) {
  const pct = Math.min(100, (value / 10) * 100);
  const radius = size * 0.36;
  const stroke = size > 50 ? 3 : 2.5;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const center = size / 2;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} className="fill-none stroke-edge" strokeWidth={stroke} />
        <circle cx={center} cy={center} r={radius}
          className={`fill-none ${colorClass}`}
          strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xs font-bold ${colorClass}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {value.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
