"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  UnifiedItem,
  UnifiedSource,
  buildUnifiedList,
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

// Alias local pour compatibilité avec l'ancien code de la page
type ItemSource = UnifiedSource;

type SourceFilter = "all" | "scanner" | "radar" | "both";
type SignalFilter = "all" | "fort" | "moyen" | "faible_plus";  // faible_plus = faible OU mieux
type SortOption = "signal" | "scanner_score" | "original";

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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [signalFilter, setSignalFilter] = useState<SignalFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("signal");
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

  // Liste unifiée scanner + radar + filtres + tri.
  const unifiedList: UnifiedItem[] = useMemo(() => {
    const base = buildUnifiedList(list, radar?.radar);
    let filtered = base;

    // Filtre par source
    if (sourceFilter !== "all") {
      filtered = filtered.filter((x) => x.source === sourceFilter);
    }

    // Filtre par force du signal (nécessite que les signaux soient chargés)
    if (signalFilter !== "all" && Object.keys(signals).length > 0) {
      filtered = filtered.filter((x) => {
        const lbl = signals[x.ticker]?.signal_strength?.label ?? "absent";
        if (signalFilter === "fort") return lbl === "fort";
        if (signalFilter === "moyen") return lbl === "fort" || lbl === "moyen";
        if (signalFilter === "faible_plus") return lbl === "fort" || lbl === "moyen" || lbl === "faible";
        return true;
      });
    }

    // Tri
    if (sortBy === "signal" && Object.keys(signals).length > 0) {
      filtered = [...filtered].sort((a, b) => {
        const sa = signals[a.ticker]?.signal_strength?.score ?? 0;
        const sb = signals[b.ticker]?.signal_strength?.score ?? 0;
        if (sa !== sb) return sb - sa;
        return base.indexOf(a) - base.indexOf(b);
      });
    } else if (sortBy === "scanner_score") {
      filtered = [...filtered].sort((a, b) => {
        const sa = a.scanner?.scores?.composite ?? -1;
        const sb = b.scanner?.scores?.composite ?? -1;
        return sb - sa;
      });
    }
    // sortBy === "original" : pas de re-tri

    return filtered;
  }, [list, radar, signals, sourceFilter, signalFilter, sortBy]);

  // Enrichissement signaux pour la liste unifiée.
  useEffect(() => {
    if (unifiedList.length === 0) return;
    const tickers = unifiedList.map((o) => o.ticker);
    getDiscoverySignals(tickers)
      .then((d) => setSignals(d))
      .catch(() => setSignals({}));
  }, [unifiedList]);

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
              Opportunités de la semaine
            </h1>
            <p className="text-sm text-muted mt-1">
              Scanner sur {opps?.universe_size ?? "67"} tickers (score ≥ {opps?.min_score_applied ?? 6}) +
              radar smart-money (initiations 13-F par fonds high-conviction)
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

      {/* Filtres et tri */}
      {!opps?.scanning && unifiedList.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <FilterSelect
            label="Source"
            value={sourceFilter}
            onChange={(v) => setSourceFilter(v as SourceFilter)}
            options={[
              { value: "all", label: "Toutes les sources" },
              { value: "scanner", label: "Scanner momentum" },
              { value: "radar", label: "Radar smart-money" },
              { value: "both", label: "Scanner + Smart-money" },
            ]}
          />
          <FilterSelect
            label="Signal"
            value={signalFilter}
            onChange={(v) => setSignalFilter(v as SignalFilter)}
            options={[
              { value: "all", label: "Tous" },
              { value: "fort", label: "Fort uniquement (≥7)" },
              { value: "moyen", label: "Moyen et + (≥3)" },
              { value: "faible_plus", label: "Faible et + (>0)" },
            ]}
          />
          <FilterSelect
            label="Tri"
            value={sortBy}
            onChange={(v) => setSortBy(v as SortOption)}
            options={[
              { value: "signal", label: "Par force du signal" },
              { value: "scanner_score", label: "Par score scanner" },
              { value: "original", label: "Ordre d'origine" },
            ]}
          />
          <span className="text-muted ml-auto">
            {unifiedList.length} affichée{unifiedList.length > 1 ? "s" : ""}
          </span>
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

      {/* Liste unifiée scanner + radar */}
      {!opps?.scanning && unifiedList.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {unifiedList.map((item, i) => (
            <OpportunityCard key={item.ticker} item={item} rank={i + 1} signals={signals[item.ticker]} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {opps && !opps.scanning && unifiedList.length === 0 && (
        <div className="card-premium p-8 text-center">
          <p className="text-primary">Aucune opportunité détectée actuellement.</p>
          <p className="text-sm text-muted mt-1">Ni le scanner momentum ni le radar smart-money 13-F ne remontent de signal.</p>
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

interface OpportunityCardProps {
  item: UnifiedItem;
  rank: number;
  signals?: TickerSignals;
}

function OpportunityCard({ item, rank, signals }: OpportunityCardProps) {
  const opp = item.scanner;
  const radar = item.radar;
  const ticker = item.ticker;
  const meta = getTickerMeta(ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const change = opp?.change_1d;
  const isUp = (change ?? 0) >= 0;
  const score = opp?.scores?.composite;
  const scoreColor = score == null ? ""
                  : score >= 7.5 ? "text-emerald-600 dark:text-emerald-400 stroke-emerald-500"
                  : score >= 6.5 ? "text-amber-600 dark:text-amber-400 stroke-amber-500"
                  :                "text-muted stroke-muted";

  // Highlights : si scanner présent, ses highlights ; sinon dérivés du radar
  const highlights: string[] = opp?.highlights?.length
    ? opp.highlights.slice(0, 3)
    : radar
    ? buildRadarHighlights(radar)
    : [];

  const actionLabel = opp?.action_label
    ?? (radar ? "Smart-money initiated" : "");

  return (
    <Link href={`/company/${ticker}`} className="block group">
      <div className="card-premium card-aura relative p-5 h-full flex flex-col">
        {/* Header : rank + badges source */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
              #{rank}
            </span>
            {sectorStyle && sector && (
              <span className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                {SECTOR_LABEL[sector]}
              </span>
            )}
            {opp?.new_opportunity && (
              <span className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                Nouveau
              </span>
            )}
            <SourceBadge source={item.source} />
            <SignalStrengthBadge signals={signals} />
          </div>
          {score != null && <ScoreGauge value={score} colorClass={scoreColor} size={48} />}
        </div>

        {/* Logo + nom */}
        <div className="flex items-center gap-3 mb-3">
          <TickerBadge ticker={ticker} size="lg" showName={false} />
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-primary leading-tight truncate"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {meta.name || radar?.name || ticker}
            </h3>
            <p className="text-xs text-muted font-mono">{ticker}{actionLabel ? ` · ${actionLabel}` : ""}</p>
          </div>
        </div>

        {/* Highlights */}
        {highlights.length > 0 && (
          <ul className="space-y-1 mb-3 flex-1">
            {highlights.map((h, i) => (
              <li key={i} className="text-xs text-secondary leading-snug flex items-start gap-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 flex-shrink-0">▸</span>
                <span className="line-clamp-2">{h}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Signaux complémentaires (informatifs, non bloquants) */}
        <SignalBadges signals={signals} />

        {/* Bottom : change + sparkline + upside (uniquement si scanner) */}
        {opp ? (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-edge/40">
            <div>
              <p className="text-[0.625rem] uppercase tracking-widest text-muted">1 jour</p>
              <p className={`text-sm font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {isUp ? "+" : ""}{change?.toFixed(2)}%
              </p>
            </div>
            <Sparkline ticker={ticker} width={70} height={22} />
            {opp.upside_vs_target != null && (
              <div className="text-right">
                <p className="text-[0.625rem] uppercase tracking-widest text-muted">Upside</p>
                <p className={`text-sm font-bold font-mono ${opp.upside_vs_target >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {opp.upside_vs_target > 0 ? "+" : ""}{opp.upside_vs_target.toFixed(0)}%
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 pt-3 border-t border-edge/40">
            <span className="text-[0.625rem] uppercase tracking-widest text-muted">Sparkline 1Y</span>
            <Sparkline ticker={ticker} width={120} height={22} />
          </div>
        )}
      </div>
    </Link>
  );
}

function buildRadarHighlights(r: SmartMoneyRadarItem): string[] {
  return r.highlights.slice(0, 3).map((h) => {
    const verb = h.status === "initiated" ? "ouvre" : "augmente";
    const delta = h.delta_pct != null ? ` (Δ ${h.delta_pct >= 0 ? "+" : ""}${h.delta_pct.toFixed(0)}%)` : "";
    const date = h.report_date ? ` · ${h.report_date}` : "";
    return `${h.fund_name} ${verb} à ${h.position_pct?.toFixed(1)}% du book${delta}${date}`;
  });
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs bg-surface border border-edge rounded-md px-2 py-1 text-primary focus:outline-none focus:border-navy dark:focus:border-accent hover:bg-bg/50 cursor-pointer transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function SignalStrengthBadge({ signals }: { signals?: TickerSignals }) {
  if (!signals?.signal_strength) return null;
  const { score, label, components } = signals.signal_strength;
  if (score <= 0) return null;
  const tone = label === "fort" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
    : label === "moyen" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";
  const breakdown = Object.entries(components)
    .map(([k, v]) => `${k}: ${v >= 0 ? "+" : ""}${v}`)
    .join(" · ");
  return (
    <span
      title={`Score multi-angles : ${score} (${label})\n${breakdown}`}
      className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${tone}`}
    >
      Signal {label} {score.toFixed(1)}
    </span>
  );
}

function SourceBadge({ source }: { source: ItemSource }) {
  if (source === "scanner") return null;  // case par défaut, pas de badge
  const label = source === "radar" ? "Smart-money" : "Smart-money +";
  const tooltip = source === "radar"
    ? "Détecté uniquement par le radar smart-money (initiation 13-F par fonds high-conviction)"
    : "Détecté par le scanner ET le radar smart-money — double signal";
  return (
    <span
      title={tooltip}
      className="text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 border border-purple-500/30"
    >
      {label}
    </span>
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

  // Analyst consensus
  const an = signals.analyst;
  if (an.present && an.is_strong_buy) {
    const trend = an.trend_6m_pp != null
      ? ` · trend 6m ${an.trend_6m_pp >= 0 ? "+" : ""}${an.trend_6m_pp}pp`
      : "";
    const upside = an.upside_pct != null ? ` · upside ${an.upside_pct >= 0 ? "+" : ""}${an.upside_pct}%` : "";
    badges.push({
      label: `Strong Buy (${an.n_analysts})`,
      tooltip: `Consensus analystes ${an.buy_pct?.toFixed(0)}% Buy${trend}${upside}`,
      tone: "bull",
    });
  } else if (an.present && an.consensus === "sell") {
    badges.push({
      label: `Consensus Sell`,
      tooltip: `${an.buy_pct?.toFixed(0)}% Buy seulement (${an.n_analysts} analystes)`,
      tone: "bear",
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
