"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import {
  getScanOpportunities,
  getDiscoverySignals,
  getSmartMoneyRadar,
  getScannerStatus,
  ScanOpportunity,
  TickerSignals,
  SmartMoneyRadarResponse,
  SmartMoneyRadarItem,
  SmartMoneyHighlight,
} from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface OpportunitiesResponse {
  count: number;
  opportunities: ScanOpportunity[];
  universe_size?: number;
  min_score_applied?: number;
  cache_age_minutes?: number;
  is_refreshing?: boolean;
  scanning?: boolean;
}

// Un scan complet doit toucher 67 tickers via yfinance (rate-limité). Empiriquement
// > 30s. Si le scan finit en moins de ce seuil, signaler à l'utilisateur que
// les résultats sont probablement servis de cache et ne reflètent pas un
// vrai re-scan.
const SUSPICIOUS_FAST_SCAN_SECONDS = 20;
const SCAN_POLL_INTERVAL_MS = 2000;
const SCAN_POLL_MAX_MS = 180_000;

export default function OpportunitiesPage() {
  const [opps, setOpps] = useState<OpportunitiesResponse | undefined>(undefined);
  const [signals, setSignals] = useState<Record<string, TickerSignals>>({});
  const [radar, setRadar] = useState<SmartMoneyRadarResponse | undefined>(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [scanElapsed, setScanElapsed] = useState(0);
  const [lastScanWarning, setLastScanWarning] = useState<string | null>(null);
  const pollAbort = useRef<{ stop: boolean }>({ stop: false });

  const load = async () => {
    setOpps(undefined);
    setSignals({});
    try {
      const d = await getScanOpportunities(15);
      setOpps(d as OpportunitiesResponse);
    } catch {
      setOpps({ count: 0, opportunities: [] });
    }
  };

  const loadRadar = async () => {
    try {
      const r = await getSmartMoneyRadar({ minFunds: 1, limit: 15 });
      setRadar(r);
    } catch {
      setRadar(undefined);
    }
  };

  // Polling propre du status scanner pendant un refresh
  const pollUntilDone = async (startedAt: Date) => {
    pollAbort.current.stop = false;
    const start = Date.now();
    while (!pollAbort.current.stop) {
      if (Date.now() - start > SCAN_POLL_MAX_MS) {
        setLastScanWarning("Scan trop long (>3min), affichage du dernier cache disponible.");
        break;
      }
      await new Promise((r) => setTimeout(r, SCAN_POLL_INTERVAL_MS));
      setScanElapsed(Math.round((Date.now() - start) / 1000));
      try {
        const s = await getScannerStatus();
        if (!s.is_refreshing) {
          // Garde-fou qualité : un scan déclenché qui se termine en quelques
          // secondes est suspect (cache servi sans re-scan réel).
          const elapsed = Math.round((Date.now() - start) / 1000);
          if (elapsed < SUSPICIOUS_FAST_SCAN_SECONDS) {
            setLastScanWarning(
              `Scan terminé en ${elapsed}s — durée anormalement courte pour un scan ` +
              `complet (${s.universe_size} tickers). Résultats probablement servis ` +
              `depuis cache, vérifier la fraîcheur.`
            );
          } else {
            setLastScanWarning(null);
          }
          break;
        }
      } catch {
        // Erreur transitoire, on continue le poll
      }
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    setScanElapsed(0);
    setLastScanWarning(null);
    const startedAt = new Date();
    try {
      await fetch(`${API}/scanner/refresh`, { method: "POST" });
      await pollUntilDone(startedAt);
    } finally {
      await Promise.all([load(), loadRadar()]);
      setRefreshing(false);
      setScanElapsed(0);
    }
  };

  useEffect(() => {
    load();
    loadRadar();
    return () => {
      pollAbort.current.stop = true;
    };
  }, []);

  const list: ScanOpportunity[] = opps?.opportunities ?? [];

  // Enrichissement signaux (ETF, smart-money, insider) — chargement en
  // arrière-plan, jamais bloquant pour l'affichage de la liste.
  useEffect(() => {
    if (list.length === 0) return;
    const tickers = list.map((o) => o.ticker);
    getDiscoverySignals(tickers)
      .then((d) => setSignals(d))
      .catch(() => setSignals({}));
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
          {opps?.cache_age_minutes != null && !refreshing && (
            <span className="text-xs text-muted">
              Cache : {opps.cache_age_minutes < 1 ? "< 1 min" : `${Math.round(opps.cache_age_minutes)} min`}
            </span>
          )}
          {refreshing && (
            <span className="text-xs text-muted font-mono">Scan en cours · {scanElapsed}s</span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {refreshing ? `Scan en cours... (${scanElapsed}s)` : "↻ Relancer le scan"}
          </button>
        </div>
      </div>

      {/* Warning scan suspect */}
      {lastScanWarning && (
        <div className="card-premium p-3 border-l-4 border-amber-500 bg-amber-500/5">
          <p className="text-xs text-amber-700 dark:text-amber-400">{lastScanWarning}</p>
        </div>
      )}

      {/* État scan en cours */}
      {opps?.scanning && (
        <div className="card-premium p-8 text-center">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-primary font-medium">Premier scan en cours</p>
          <p className="text-sm text-muted mt-1">~30-60 secondes — analyse de {opps.universe_size ?? 67} tickers en parallèle</p>
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

      {/* Smart-money radar — canal indépendant des opportunités */}
      <SmartMoneyRadarSection radar={radar} />
    </div>
  );
}

interface OpportunityCardProps {
  opp: ScanOpportunity;
  rank: number;
  signals?: TickerSignals;
}

function OpportunityCard({ opp, rank, signals }: OpportunityCardProps) {
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

type Tone = "info" | "bull" | "bear" | "warn";
interface BadgeSpec {
  label: string;
  tooltip: string;
  tone: Tone;
}

function SignalBadges({ signals }: { signals?: TickerSignals }) {
  if (!signals) return null;

  const badges: BadgeSpec[] = [];

  if (signals.etf.present) {
    badges.push({
      label: `ETF×${signals.etf.etf_count}`,
      tooltip: `Présent dans : ${signals.etf.etfs.join(", ")}`,
      tone: "info",
    });
  }

  // Smart money — tooltip enrichi avec date du 13-F (fraîcheur du signal)
  const sm = signals.smart_money;
  const freshness = sm.latest_filing_date
    ? ` · 13-F filé le ${sm.latest_filing_date}` +
      (sm.freshness_days != null ? ` (${sm.freshness_days}j)` : "")
    : "";

  if (sm.initiated > 0) {
    const initFunds = sm.highlights
      .filter((h) => h.status === "initiated")
      .map((h) => h.fund_name)
      .join(", ");
    badges.push({
      label: `${sm.initiated} fonds initiated`,
      tooltip: `Vient d'ouvrir : ${initFunds || "fonds high-conviction"}${freshness}`,
      tone: "bull",
    });
  } else if (sm.concentrated_holders > 0) {
    const top = sm.highlights[0];
    const tooltip = top
      ? `${top.fund_name} ${top.position_pct?.toFixed(1)}% du book` +
        (top.delta_pct != null ? ` (Δ ${top.delta_pct >= 0 ? "+" : ""}${top.delta_pct.toFixed(0)}%)` : "") +
        freshness
      : "";
    badges.push({
      label: `${sm.concentrated_holders} fonds`,
      tooltip,
      tone: "info",
    });
  }

  if (signals.insider.present && signals.insider.is_significant) {
    const ins = signals.insider;
    const net = ins.net_value_usd;
    const sign = net >= 0 ? "+" : "-";
    const pctMcap =
      ins.net_pct_market_cap_bps != null
        ? ` · ${(ins.net_pct_market_cap_bps / 100).toFixed(2)}% market cap`
        : "";
    const recency = ins.latest_transaction_date
      ? ` · dernier ${ins.latest_transaction_date}`
      : "";
    const breakdown =
      `${ins.buy_count} achat(s) ` +
      (ins.buy_value_usd > 0 ? `($${formatM(ins.buy_value_usd)}) ` : "") +
      `vs ${ins.sell_count} vente(s)` +
      (ins.sell_value_usd > 0 ? ` ($${formatM(ins.sell_value_usd)})` : "");
    badges.push({
      label: `Insider ${sign}$${formatM(Math.abs(net))}`,
      tooltip: `Net 90j${pctMcap}${recency} — ${breakdown}`,
      tone: net >= 0 ? "bull" : "bear",
    });
  }

  if (signals.political.source_available && signals.political.count > 0) {
    badges.push({
      label: `${signals.political.count} trade pol.`,
      tooltip: signals.political.highlights.map((h) => `${h.name}: ${h.transaction}`).join(" | "),
      tone: "warn",
    });
  }

  if (badges.length === 0) return null;

  const toneClass: Record<Tone, string> = {
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

// ─── Smart-money radar — section indépendante ──────────────────────────────

function SmartMoneyRadarSection({ radar }: { radar?: SmartMoneyRadarResponse }) {
  if (!radar) return null;
  if (radar.radar.length === 0) {
    return (
      <div className="pt-8 mt-4 border-t border-edge/40">
        <h2 className="text-lg font-semibold text-primary mb-1"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Radar smart-money
        </h2>
        <p className="text-xs text-muted mb-3">
          Initiations & augmentations significatives par les fonds high-conviction (13-F).
        </p>
        <div className="card-premium p-6 text-center">
          <p className="text-sm text-muted">
            Aucun fonds high-conviction n'a initié de position récente sur les candidats ETF thématiques.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-8 mt-4 border-t border-edge/40">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-primary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Radar smart-money <span className="text-sm text-muted font-normal">— {radar.total} tickers détectés</span>
          </h2>
          <p className="text-xs text-muted">
            Initiations & augmentations significatives par les fonds high-conviction (13-F),
            indépendamment du score momentum classique. Seuil concentration ≤ {radar.max_fund_positions} positions.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {radar.radar.map((item) => (
          <RadarCard key={item.symbol} item={item} />
        ))}
      </div>
    </div>
  );
}

function RadarCard({ item }: { item: SmartMoneyRadarItem }) {
  const meta = getTickerMeta(item.symbol);
  return (
    <Link href={`/company/${item.symbol}`} className="block">
      <div className="card-premium p-4 h-full flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TickerBadge ticker={item.symbol} size="md" showName={false} />
            <div className="min-w-0">
              <p className="text-sm font-bold text-primary truncate">{meta.name || item.name}</p>
              <p className="text-[0.65rem] text-muted font-mono">{item.symbol}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-0.5">
            {item.initiated_count > 0 && (
              <span className="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                {item.initiated_count} initiated
              </span>
            )}
            {item.increased_count > 0 && (
              <span className="text-[0.625rem] font-semibold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                {item.increased_count} increased
              </span>
            )}
          </div>
        </div>
        <ul className="space-y-0.5 text-[0.7rem] text-secondary">
          {item.highlights.slice(0, 3).map((h, i) => (
            <li key={i} className="truncate">
              <span className="font-medium">{h.fund_name}</span>{" "}
              <span className="text-muted">
                {h.position_pct?.toFixed(1)}%
                {h.delta_pct != null && ` (Δ ${h.delta_pct >= 0 ? "+" : ""}${h.delta_pct.toFixed(0)}%)`}
                {h.report_date && ` · ${h.report_date}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Link>
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
