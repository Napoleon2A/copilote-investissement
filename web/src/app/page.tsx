/**
 * Page principale — Brief quotidien (pleine largeur)
 *
 * Layout 2 colonnes sur desktop :
 *   Gauche (2/3) : alertes portefeuille, signaux watchlist, idées en suivi
 *   Droite (1/3) : résumé de marché (sticky), opportunités mini, fil d'actu (futur)
 *
 * Mobile : colonne unique empilée.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getBrief } from "@/lib/api";
import { BriefItemCard } from "@/components/brief/BriefItemCard";
import { MarketSummary } from "@/components/brief/MarketSummary";
import type { Brief, MarketContext } from "@/lib/api";
import Link from "next/link";

async function fetchBrief(): Promise<Brief | null> {
  try {
    return await getBrief();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const brief = await fetchBrief();

  const portfolioItems  = brief?.items.filter((i) => i.type === "portfolio_alert")  ?? [];
  const watchlistItems  = brief?.items.filter((i) => i.type === "watchlist_signal") ?? [];
  const ideaItems       = brief?.items.filter((i) => i.type === "idea_followup")    ?? [];
  const opportunityItems= brief?.items.filter((i) => i.type === "opportunity")      ?? [];

  const hasSignals = portfolioItems.length + watchlistItems.length + ideaItems.length > 0;

  return (
    <div className="max-w-7xl mx-auto space-y-5">

      {/* ── Bandeau Napoléon ── pleine largeur ──────────────────────────────── */}
      <NapoleonBanner date={brief?.date} />

      {/* Erreur backend */}
      {!brief && (
        <div className="rounded-lg border border-edge bg-surface p-6 text-center shadow-sm">
          <p className="text-secondary text-sm mb-2">
            Le backend n&apos;est pas accessible.
          </p>
          <p className="text-muted text-xs">
            Lance <code className="text-navy bg-surface-alt px-1 rounded">uvicorn app.main:app --reload</code> dans <code className="text-navy bg-surface-alt px-1 rounded">api/</code>
          </p>
        </div>
      )}

      {/* Contexte de marché — pleine largeur */}
      {brief?.market_context && <MarketContextBanner ctx={brief.market_context} />}

      {/* Brief vide */}
      {brief && brief.item_count === 0 && !opportunityItems.length && (
        <div className="rounded-lg border border-edge bg-surface p-6 text-center shadow-sm">
          <p className="text-primary text-sm">Aucun signal notable aujourd&apos;hui.</p>
          <p className="text-muted text-xs mt-1">
            Ajoute des tickers à ta watchlist ou à ton portefeuille pour générer un brief.
          </p>
        </div>
      )}

      {/* ── Grille principale ─────────────────────────────────────────────────── */}
      {brief && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Colonne gauche (2/3) — Signaux ────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">
            {/* Alertes portefeuille */}
            {portfolioItems.length > 0 && (
              <Section title="Portefeuille" tag="▣">
                {portfolioItems.map((item, i) => <BriefItemCard key={i} item={item} />)}
              </Section>
            )}

            {/* Signaux watchlist */}
            {watchlistItems.length > 0 && (
              <Section title="Watchlist" tag="◉">
                {watchlistItems.map((item, i) => <BriefItemCard key={i} item={item} />)}
              </Section>
            )}

            {/* Idées à revisiter */}
            {ideaItems.length > 0 && (
              <Section title="Idées en suivi" tag="◇">
                {ideaItems.map((item, i) => <BriefItemCard key={i} item={item} />)}
              </Section>
            )}

            {/* Si aucun signal : message */}
            {!hasSignals && (
              <div className="rounded-lg border border-edge bg-surface p-6 text-center shadow-sm">
                <p className="text-secondary text-sm">Aucun signal prioritaire.</p>
                <p className="text-muted text-xs mt-1">
                  Les alertes portefeuille, watchlist et idées apparaîtront ici.
                </p>
              </div>
            )}
          </div>

          {/* ── Colonne droite (1/3) — Marché & Opportunités ──────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            {/* Résumé de marché */}
            <MarketSummary data={brief.market_summary} />

            {/* Opportunités détectées — version compacte */}
            {opportunityItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-accent text-xs">◎</span>
                    <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                      Opportunités
                    </h2>
                  </div>
                  <Link href="/opportunities" className="text-[10px] text-navy hover:text-navy-hover transition-colors">
                    Voir tout →
                  </Link>
                </div>
                <div className="space-y-2">
                  {opportunityItems.slice(0, 5).map((item, i) => (
                    <Link key={i} href={`/company/${item.ticker}`}
                      className="flex items-center justify-between rounded-lg border border-edge bg-surface px-3 py-2.5
                                 hover:border-navy/30 hover:shadow-sm transition-all duration-150 group">
                      <div>
                        <span className="font-mono font-bold text-sm text-navy group-hover:text-navy-hover">{item.ticker}</span>
                        {item.change_1d != null && (
                          <span className={`ml-2 text-xs font-mono ${item.change_1d >= 0 ? "text-green-700" : "text-red-700"}`}>
                            {item.change_1d > 0 ? "+" : ""}{item.change_1d.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {item.scores?.composite != null && (
                          <span className={`text-xs font-mono font-medium px-1.5 py-0.5 rounded border
                            ${item.scores.composite >= 7.5 ? "bg-green-50 text-green-700 border-green-200"
                              : item.scores.composite >= 5 ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-red-50 text-red-700 border-red-200"}`}>
                            {item.scores.composite.toFixed(1)}
                          </span>
                        )}
                        <span className="text-xs text-muted">→ {item.action_label}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {/* Fil d'actualités agrégé */}
            {brief.aggregated_news && brief.aggregated_news.length > 0 && (
              <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-accent text-xs">⊕</span>
                  <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Fil d&apos;actualités</h2>
                </div>
                <ul className="space-y-2.5">
                  {brief.aggregated_news.slice(0, 8).map((item, i) => (
                    <li key={i} className="border-b border-edge pb-2 last:border-0 last:pb-0">
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-mono font-bold text-navy flex-shrink-0 mt-0.5">{item.ticker}</span>
                        <div className="flex-1 min-w-0">
                          <a href={item.link} target="_blank" rel="noopener noreferrer"
                            className="text-xs text-primary hover:text-navy leading-snug transition-colors line-clamp-2">
                            {item.title}
                          </a>
                          <p className="text-[10px] text-muted mt-0.5">
                            {item.publisher}
                            {item.published && ` · ${new Date(item.published).toLocaleDateString("fr-FR")}`}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      {brief && (
        <p className="text-[10px] text-muted text-center pb-4 tracking-wide">
          {brief.disclaimer}
        </p>
      )}
    </div>
  );
}

/* ── Bandeau Napoléon ──────────────────────────────────────────────────────── */

function NapoleonBanner({ date }: { date?: string }) {
  const dateStr = date
    ? new Date(date).toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      })
    : new Date().toLocaleDateString("fr-FR", {
        weekday: "long", day: "numeric", month: "long", year: "numeric",
      });

  return (
    <div className="relative w-full rounded-xl overflow-hidden shadow-md h-[140px] sm:h-[190px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/napoleon.jpg"
        alt="Bonaparte franchissant le Grand-Saint-Bernard — Jacques-Louis David"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "50% 18%" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(30,58,95,0.90) 0%, rgba(30,58,95,0.65) 45%, rgba(30,58,95,0.10) 100%)",
        }}
      />
      <div className="absolute inset-0 flex flex-col justify-center px-5 sm:px-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-px bg-accent" />
          <span className="text-accent text-[9px] tracking-[0.35em] uppercase font-medium opacity-80">
            Est. mmxxiii
          </span>
        </div>
        <h1
          className="text-white text-2xl sm:text-3xl font-bold tracking-[0.08em] uppercase"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Austerlitz
        </h1>
        <p className="text-accent text-[10px] tracking-[0.3em] uppercase font-medium mt-1">
          Hedge Fund
        </p>
        <div className="flex items-center gap-3 mt-4">
          <div className="w-12 h-px bg-accent" />
          <span className="text-white/60 text-[10px] tracking-wider capitalize">
            {dateStr}
          </span>
        </div>
      </div>
      <p className="absolute bottom-2 right-3 text-white/25 text-[8px] tracking-wide">
        David, 1801 · Domaine public
      </p>
    </div>
  );
}

/* ── Régime de marché ──────────────────────────────────────────────────────── */

const REGIME_STYLES: Record<string, string> = {
  "risk-on":   "border-green-200  bg-green-50  text-green-800",
  "risk-off":  "border-red-200    bg-red-50    text-red-800",
  "calme":     "border-blue-200   bg-blue-50   text-blue-800",
  "vigilance": "border-amber-200  bg-amber-50  text-amber-800",
  "neutral":   "border-edge bg-bg text-secondary",
};

function MarketContextBanner({ ctx }: { ctx: MarketContext }) {
  const style = REGIME_STYLES[ctx.regime] ?? REGIME_STYLES.neutral;
  return (
    <div className={`rounded-lg border p-3 shadow-sm ${style}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest opacity-60">Régime</span>
          <span className="text-xs font-bold">{ctx.regime_label}</span>
          {ctx.vix != null && (
            <span className="text-xs opacity-50">· VIX {ctx.vix.toFixed(1)}</span>
          )}
        </div>
        <span className="text-xs opacity-70">{ctx.session_mood}</span>
      </div>
      <p className="text-xs opacity-60 mt-1">{ctx.regime_advice}</p>
    </div>
  );
}

/* ── Section ───────────────────────────────────────────────────────────────── */

function Section({ title, tag, children }: { title: string; tag: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-accent text-xs">{tag}</span>
        <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
          {title}
        </h2>
        <div className="flex-1 h-px bg-edge" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
