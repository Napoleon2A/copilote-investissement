/**
 * Page principale — Brief quotidien
 *
 * C'est la sortie centrale du système :
 * - Bandeau Napoléon (identité visuelle du fonds)
 * - Résumé de marché (S&P 500, CAC 40, VIX)
 * - 3 à 7 signaux prioritaires (portefeuille + watchlist + idées)
 * - Chaque signal avec : pourquoi maintenant + action suggérée
 */
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

  const portfolioItems  = brief?.items.filter((i) => i.type === "portfolio_alert")  ?? [];
  const watchlistItems  = brief?.items.filter((i) => i.type === "watchlist_signal") ?? [];
  const ideaItems       = brief?.items.filter((i) => i.type === "idea_followup")    ?? [];
  const opportunityItems= brief?.items.filter((i) => i.type === "opportunity")      ?? [];

  return (
    <div className="max-w-3xl mx-auto space-y-5">

      {/* ── Bandeau Napoléon ───────────────────────────────────────────────── */}
      <NapoleonBanner date={brief?.date} />

      {/* Erreur backend */}
      {!brief && (
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-6 text-center shadow-sm">
          <p className="text-[#2D4A5C] text-sm mb-2">
            Le backend n&apos;est pas accessible.
          </p>
          <p className="text-[#7898AC] text-xs">
            Lance <code className="text-[#1E3A5F] bg-[#E2EAF0] px-1 rounded">uvicorn app.main:app --reload</code> dans <code className="text-[#1E3A5F] bg-[#E2EAF0] px-1 rounded">api/</code>
          </p>
        </div>
      )}

      {/* Contexte de marché */}
      {brief?.market_context && <MarketContextBanner ctx={brief.market_context} />}

      {/* Résumé de marché */}
      {brief && <MarketSummary data={brief.market_summary} />}

      {/* Brief vide */}
      {brief && brief.item_count === 0 && (
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-6 text-center shadow-sm">
          <p className="text-[#0B1929] text-sm">Aucun signal notable aujourd&apos;hui.</p>
          <p className="text-[#7898AC] text-xs mt-1">
            Ajoute des tickers à ta watchlist ou à ton portefeuille pour générer un brief.
          </p>
        </div>
      )}

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

      {/* Opportunités détectées */}
      {opportunityItems.length > 0 && (
        <Section title="Opportunités détectées" tag="◎">
          {opportunityItems.map((item, i) => <BriefItemCard key={i} item={item} />)}
        </Section>
      )}

      {/* Disclaimer */}
      {brief && (
        <p className="text-[10px] text-[#7898AC] text-center pb-4 tracking-wide">
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
    <div className="relative w-full rounded-xl overflow-hidden shadow-md" style={{ height: "190px" }}>
      {/* Tableau de David — Bonaparte franchissant les Alpes (domaine public) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/napoleon.jpg"
        alt="Bonaparte franchissant le Grand-Saint-Bernard — Jacques-Louis David"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "50% 18%" }}
      />

      {/* Dégradé overlay : marine gauche → transparent droite */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to right, rgba(30,58,95,0.90) 0%, rgba(30,58,95,0.65) 45%, rgba(30,58,95,0.10) 100%)",
        }}
      />

      {/* Texte superposé */}
      <div className="absolute inset-0 flex flex-col justify-center px-8">
        {/* Règle or supérieure */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-px bg-[#5E96B0]" />
          <span className="text-[#5E96B0] text-[9px] tracking-[0.35em] uppercase font-medium opacity-80">
            Est. mmxxiii
          </span>
        </div>

        {/* Nom du fonds */}
        <h1
          className="text-white text-3xl font-bold tracking-[0.08em] uppercase"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Austerlitz
        </h1>
        <p className="text-[#5E96B0] text-[10px] tracking-[0.3em] uppercase font-medium mt-1">
          Hedge Fund
        </p>

        {/* Règle or inférieure + date */}
        <div className="flex items-center gap-3 mt-4">
          <div className="w-12 h-px bg-[#5E96B0]" />
          <span className="text-white/60 text-[10px] tracking-wider capitalize">
            {dateStr}
          </span>
        </div>
      </div>

      {/* Coin bas-droit : crédit discret */}
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
  "neutral":   "border-[#BFD0DC] bg-[#EEF2F6] text-[#2D4A5C]",
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
        <span className="text-[#5E96B0] text-xs">{tag}</span>
        <h2 className="text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest">
          {title}
        </h2>
        <div className="flex-1 h-px bg-[#BFD0DC]" />
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
