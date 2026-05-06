"use client";

import Link from "next/link";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { ListSkeleton, BADGE_COLORS } from "./shared";
import { IcEarnings, IcPortfolio, IcWatchlist, IcAlerts, IcAnalystVue } from "./icons";

/* ════════════════════════════════════════════════════════════════════════
 * Compact card wrapper — utilisé par les 4 cards stats à droite
 * ════════════════════════════════════════════════════════════════════════ */

function CompactCard({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="block group h-full">
      <div className="card-premium relative p-4 overflow-hidden h-full flex flex-col">
        {children}
      </div>
    </Link>
  );
}

function CompactHeader({ Icon, label, badge, badgeColor = "default" }: {
  Icon: React.ComponentType<{ size?: number; className?: string }>; label: string; badge?: React.ReactNode; badgeColor?: keyof typeof BADGE_COLORS;
}) {
  return (
    <div className="flex items-center justify-between mb-2.5 flex-shrink-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="text-accent/70 group-hover:text-accent transition-colors flex-shrink-0">
          <Icon size={14} />
        </span>
        <h3 className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-secondary truncate"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {label}
        </h3>
      </div>
      {badge && (
        <span className={`text-[0.7rem] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0 ${BADGE_COLORS[badgeColor]}`}>
          {badge}
        </span>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Vue analystes — synthèse buy/hold/sell par ticker (compact)
 * ════════════════════════════════════════════════════════════════════════ */

interface RecoEntry {
  ticker: string;
  recommendations: Array<{ strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }>;
}

export function RichAnalystCard({ recos }: { recos: Record<string, RecoEntry> | null | undefined }) {
  if (recos === undefined || recos === null) {
    return (
      <CompactCard href="/analyst">
        <CompactHeader Icon={IcAnalystVue} label="Vue analystes" badge="..." />
        <ListSkeleton rows={3} />
      </CompactCard>
    );
  }

  // Aggrégation : pour chaque ticker, calcul du % buy (mois le plus récent)
  const rows = Object.values(recos)
    .map((d) => {
      const r = d.recommendations?.[0];
      if (!r) return null;
      const total = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell;
      if (total === 0) return null;
      const buyPct = (r.strongBuy + r.buy) / total;
      const sellPct = (r.sell + r.strongSell) / total;
      const sentiment: "buy" | "hold" | "sell" =
        buyPct > 0.6 ? "buy" : sellPct > 0.4 ? "sell" : buyPct > sellPct ? "buy" : "hold";
      return { ticker: d.ticker, total, buyPct, sentiment };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.buyPct - a.buyPct);

  return (
    <CompactCard href="/analyst">
      <CompactHeader Icon={IcAnalystVue} label="Vue analystes" badge={rows.length > 0 ? `${rows.length} sociétés` : "—"} />
      {rows.length > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {rows.slice(0, 5).map((r) => (
            <li key={r.ticker} className="flex items-center gap-2 py-1 border-b border-edge/30 last:border-0">
              <TickerBadge ticker={r.ticker} size="xs" showName={false} />
              <span className="font-mono font-bold text-[0.7rem] text-navy dark:text-accent">{r.ticker}</span>
              <span className="flex-1 h-1.5 rounded bg-surface-alt overflow-hidden">
                <span className={`block h-full ${
                  r.sentiment === "buy" ? "bg-emerald-500"
                  : r.sentiment === "sell" ? "bg-red-500"
                  : "bg-amber-500"
                }`} style={{ width: `${Math.round(r.buyPct * 100)}%` }} />
              </span>
              <span className={`text-[0.625rem] font-bold whitespace-nowrap ${
                r.sentiment === "buy" ? "text-emerald-700 dark:text-emerald-400"
                : r.sentiment === "sell" ? "text-red-700 dark:text-red-400"
                : "text-amber-700 dark:text-amber-400"
              }`}>
                {Math.round(r.buyPct * 100)}% Buy
              </span>
              <span className="text-[0.55rem] text-muted whitespace-nowrap">{r.total}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted italic">Aucune recommandation disponible.</p>
      )}
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Earnings — liste des prochaines publications
 * ════════════════════════════════════════════════════════════════════════ */

export function RichEarningsCard({ earnings }: { earnings: any }) {
  const list = earnings?.earnings ?? [];
  return (
    <CompactCard href="/earnings">
      <CompactHeader Icon={IcEarnings} label="Earnings" badge={earnings != null ? `${earnings.count} à venir` : "..."} />
      {earnings != null && list.length > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {list.slice(0, 5).map((e: any, i: number) => {
            const meta = getTickerMeta(e.ticker);
            return (
              <li key={i} className="flex items-center gap-2 py-1 border-b border-edge/30 last:border-0">
                <TickerBadge ticker={e.ticker} size="xs" showName={false} />
                <span className="text-[0.7rem] text-secondary truncate flex-1">{meta.name}</span>
                <span className={`text-[0.625rem] font-bold px-1.5 py-0.5 rounded border whitespace-nowrap flex-shrink-0
                  ${e.days_until === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                    : e.days_until <= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                    : "bg-surface-alt text-muted border-edge"}`}>
                  {e.days_until === 0 ? "Auj." : `J-${e.days_until}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : earnings != null ? (
        <p className="text-xs text-muted italic">Aucune publication à venir.</p>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Portefeuille — valeur + PnL + liste positions
 * ════════════════════════════════════════════════════════════════════════ */

export function RichPortfolioCard({ portfolio }: { portfolio: any }) {
  const pnl = portfolio?.total_pnl_pct;
  const isUp = pnl != null && pnl >= 0;
  const positions = portfolio?.positions ?? [];

  return (
    <CompactCard href="/portfolio">
      <CompactHeader
        Icon={IcPortfolio} label="Portefeuille"
        badge={pnl != null ? `${isUp ? "+" : ""}${pnl.toFixed(1)}%` : "..."}
        badgeColor={pnl != null ? (isUp ? "green" : "red") : "default"}
      />
      {portfolio != null && positions.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between gap-2 mb-2 pb-2 border-b border-edge/40">
            <div>
              <span className="text-2xl font-bold text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                {portfolio.total_value?.toFixed(0)}
              </span>
              <span className="text-[0.7rem] text-muted ml-1">{portfolio.currency === "EUR" ? "€" : portfolio.currency}</span>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                {isUp ? "+" : ""}{portfolio.total_pnl?.toFixed(0)}{portfolio.currency === "EUR" ? "€" : ""}
              </p>
              <p className="text-[0.625rem] text-muted">PnL latent</p>
            </div>
          </div>
          <ul className="space-y-1 flex-1">
            {positions.slice(0, 4).map((p: any, i: number) => (
              <li key={i} className="flex items-center gap-2 text-[0.7rem]">
                <TickerBadge ticker={p.ticker} size="xs" showName={false} />
                <span className="text-muted truncate flex-1 font-mono">{p.quantity?.toFixed(0)}×</span>
                <span className={`font-mono font-bold ${(p.pnl_pct ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                  {(p.pnl_pct ?? 0) >= 0 ? "+" : ""}{p.pnl_pct?.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : portfolio != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">Aucune position ouverte.</p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
            + Ouvrir une position
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Watchlist — liste des watchlists
 * ════════════════════════════════════════════════════════════════════════ */

export function RichWatchlistCard({ watchlists }: { watchlists: any[] | null | undefined }) {
  return (
    <CompactCard href="/watchlist">
      <CompactHeader Icon={IcWatchlist} label="Watchlist" badge={watchlists != null ? `${watchlists.length} ${watchlists.length <= 1 ? "liste" : "listes"}` : "..."} />
      {watchlists != null && watchlists.length > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {watchlists.slice(0, 5).map((w: any) => (
            <li key={w.id} className="flex items-center justify-between gap-2 py-1 border-b border-edge/30 last:border-0">
              <span className="text-xs text-primary truncate font-medium">{w.name}</span>
              <span className="text-[0.625rem] font-mono font-bold text-navy dark:text-accent bg-navy/5 dark:bg-accent/10 px-1.5 py-0.5 rounded">
                {w.item_count ?? 0}
              </span>
            </li>
          ))}
        </ul>
      ) : watchlists != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">
            Aucun ticker surveillé. Crée une watchlist pour suivre les sociétés qui t&apos;intéressent.
          </p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
            + Créer une watchlist
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 * Alertes — liste des alertes actives
 * ════════════════════════════════════════════════════════════════════════ */

export function RichAlertsCard({ alerts }: { alerts: any }) {
  const count = alerts?.count ?? null;
  const list = alerts?.alerts ?? [];
  return (
    <CompactCard href="/alerts">
      <CompactHeader Icon={IcAlerts} label="Alertes" badge={count != null ? `${count} active${count !== 1 ? "s" : ""}` : "..."}
        badgeColor={count != null && count > 0 ? "orange" : "default"} />
      {alerts != null && count > 0 ? (
        <ul className="space-y-1.5 flex-1">
          {list.slice(0, 5).map((a: any, i: number) => (
            <li key={i} className="flex items-center gap-2 py-1 border-b border-edge/30 last:border-0">
              <TickerBadge ticker={a.ticker} size="xs" showName={false} />
              <span className="text-[0.7rem] text-secondary truncate flex-1">{a.condition}</span>
            </li>
          ))}
        </ul>
      ) : alerts != null ? (
        <div className="flex flex-col gap-2 flex-1">
          <p className="text-xs text-secondary leading-snug">
            Aucune alerte active. Configure des seuils prix ou événements pour être notifié.
          </p>
          <span className="text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded inline-block w-fit
                           bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30">
            + Créer une alerte
          </span>
        </div>
      ) : <ListSkeleton rows={3} />}
    </CompactCard>
  );
}
