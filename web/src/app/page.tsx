/**
 * Page principale — Brief quotidien
 *
 * C'est la sortie centrale du système :
 * - Résumé de marché (S&P 500, CAC 40, VIX)
 * - 3 à 7 signaux prioritaires (portefeuille + watchlist + idées)
 * - Chaque signal avec : pourquoi maintenant + action suggérée
 */
// Force Next.js à re-fetcher à chaque requête (pas de cache statique)
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { getBrief } from "@/lib/api";
import { BriefItemCard } from "@/components/brief/BriefItemCard";
import { MarketSummary } from "@/components/brief/MarketSummary";
import type { Brief, MarketContext } from "@/lib/api";

async function fetchBrief(): Promise<Brief | null> {
  try {
    return await getBrief();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const brief = await fetchBrief();

  if (!brief) {
    return (
      <div className="max-w-3xl mx-auto">
        <PageHeader />
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-6 text-center">
          <p className="text-slate-400 text-sm mb-2">
            Le backend n&apos;est pas accessible.
          </p>
          <p className="text-slate-600 text-xs">
            Lance <code className="text-indigo-400">uvicorn app.main:app --reload</code> dans le dossier <code className="text-indigo-400">api/</code>
          </p>
        </div>
      </div>
    );
  }

  const portfolioItems = brief.items.filter((i) => i.type === "portfolio_alert");
  const watchlistItems = brief.items.filter((i) => i.type === "watchlist_signal");
  const ideaItems = brief.items.filter((i) => i.type === "idea_followup");
  const opportunityItems = brief.items.filter((i) => i.type === "opportunity");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <PageHeader date={brief.date} count={brief.item_count} />

      {/* Contexte de marché */}
      {brief.market_context && <MarketContextBanner ctx={brief.market_context} />}

      {/* Résumé de marché */}
      <MarketSummary data={brief.market_summary} />

      {/* Brief vide */}
      {brief.item_count === 0 && (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-6 text-center">
          <p className="text-slate-300 text-sm">Aucun signal notable aujourd&apos;hui.</p>
          <p className="text-slate-600 text-xs mt-1">
            Ajoute des tickers à ta watchlist ou à ton portefeuille pour générer un brief.
          </p>
        </div>
      )}

      {/* Alertes portefeuille */}
      {portfolioItems.length > 0 && (
        <Section title="Portefeuille" emoji="📊">
          {portfolioItems.map((item, i) => (
            <BriefItemCard key={i} item={item} />
          ))}
        </Section>
      )}

      {/* Signaux watchlist */}
      {watchlistItems.length > 0 && (
        <Section title="Watchlist" emoji="👁">
          {watchlistItems.map((item, i) => (
            <BriefItemCard key={i} item={item} />
          ))}
        </Section>
      )}

      {/* Idées à revisiter */}
      {ideaItems.length > 0 && (
        <Section title="Idées en suivi" emoji="💡">
          {ideaItems.map((item, i) => (
            <BriefItemCard key={i} item={item} />
          ))}
        </Section>
      )}

      {/* Opportunités détectées par le scanner */}
      {opportunityItems.length > 0 && (
        <Section title="Opportunités détectées" emoji="🎯">
          {opportunityItems.map((item, i) => (
            <BriefItemCard key={i} item={item} />
          ))}
        </Section>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-slate-700 text-center pb-4">
        {brief.disclaimer}
      </p>
    </div>
  );
}

const REGIME_STYLES: Record<string, string> = {
  "risk-on":   "border-green-500/25 bg-green-500/5 text-green-400",
  "risk-off":  "border-red-500/25 bg-red-500/5 text-red-400",
  "calme":     "border-blue-500/25 bg-blue-500/5 text-blue-400",
  "vigilance": "border-yellow-500/25 bg-yellow-500/5 text-yellow-400",
  "neutral":   "border-slate-500/25 bg-slate-500/5 text-slate-400",
};

function MarketContextBanner({ ctx }: { ctx: MarketContext }) {
  const style = REGIME_STYLES[ctx.regime] ?? REGIME_STYLES.neutral;
  return (
    <div className={`rounded-lg border p-3 ${style}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider opacity-70">Régime</span>
          <span className="text-xs font-bold">{ctx.regime_label}</span>
          {ctx.vix != null && (
            <span className="text-xs opacity-60">· VIX {ctx.vix.toFixed(1)}</span>
          )}
        </div>
        <span className="text-xs opacity-80">{ctx.session_mood}</span>
      </div>
      <p className="text-xs opacity-60 mt-1">{ctx.regime_advice}</p>
    </div>
  );
}

function PageHeader({ date, count }: { date?: string; count?: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <div>
        <h1 className="text-lg font-semibold text-slate-100">Brief du jour</h1>
        {date && (
          <p className="text-sm text-slate-500 mt-0.5">
            {new Date(date).toLocaleDateString("fr-FR", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        )}
      </div>
      {count !== undefined && (
        <span className="text-xs text-slate-600">
          {count} signal{count !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}

function Section({
  title,
  emoji,
  children,
}: {
  title: string;
  emoji: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
        <span>{emoji}</span>
        {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
