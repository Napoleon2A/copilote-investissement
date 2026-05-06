/**
 * Page fiche entreprise — /company/[ticker]
 */
import type { Metadata } from "next";
import { getCompanyBrief, getCompanyScores, getCompetitors, getAnalysis } from "@/lib/api";
import type { CompetitorEntry, DeepAnalysis } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import Link from "next/link";

interface Props {
  params: Promise<{ ticker: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} · Austerlitz` };
}

const ACTION_COLORS: Record<string, string> = {
  read:      "bg-amber-50 text-amber-700 border-amber-200",
  watch:     "bg-blue-50 text-blue-700 border-blue-200",
  buy_small: "bg-green-50 text-green-700 border-green-200",
  add:       "bg-green-50 text-green-700 border-green-200",
  avoid:     "bg-red-50 text-red-700 border-red-200",
  hold:      "bg-bg text-secondary border-edge",
};

export default async function CompanyPage({ params }: Props) {
  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  let brief = null;
  let scores = null;
  let competitors: CompetitorEntry[] = [];
  let deepAnalysis: DeepAnalysis | null = null;

  try {
    [brief, scores] = await Promise.all([
      getCompanyBrief(upperTicker),
      getCompanyScores(upperTicker),
    ]);
    // Fetch concurrents + analyse approfondie en parallèle (non-bloquants)
    try {
      const compData = await getCompetitors(upperTicker);
      competitors = compData.competitors;
    } catch { /* pas de concurrents trouvés — pas grave */ }
    try {
      const r = await getAnalysis(upperTicker);
      deepAnalysis = r?.analysis ?? null;
    } catch { /* pas d'analyse approfondie disponible — c'est OK */ }
  } catch {
    return (
      <div className="max-w-2xl mx-auto">
        <p className="text-red-700 text-sm">
          Données indisponibles pour{" "}
          <span className="font-mono font-bold">{upperTicker}</span>.
          Vérifie que le ticker est correct et que le backend est actif.
        </p>
      </div>
    );
  }

  const actionColor = ACTION_COLORS[brief.action] ?? ACTION_COLORS.hold;

  return (
    <div className="space-y-5 pb-6">

      {/* En-tête style premium */}
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-edge/40">
        <div className="flex items-center gap-4">
          <div className="w-1 h-14 bg-gradient-to-b from-accent to-navy rounded-full" />
          <div>
            <Link href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </Link>
            <h1 className="text-3xl font-bold font-mono text-navy dark:text-accent leading-none">
              {upperTicker}
            </h1>
            {brief.name && <p className="text-base text-primary mt-1.5 font-medium">{brief.name}</p>}
            {brief.sector && <p className="text-xs text-muted mt-0.5 uppercase tracking-wide">{brief.sector}</p>}
          </div>
        </div>
        <div className={`rounded-full border px-4 py-2 text-sm font-semibold flex-shrink-0 ${actionColor}`}>
          → {brief.action_label}
        </div>
      </div>

      {/* Activité — description enrichie de la société */}
      <ActivityBlock
        ticker={upperTicker}
        identity={brief.identity}
        sector={brief.sector}
        analysis={deepAnalysis}
      />

      {/* Prix + variations */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="Prix">
            <span className="text-xl font-mono font-semibold text-primary">
              {brief.current_price != null
                ? brief.current_price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : "—"}
            </span>
          </Metric>
          <Metric label="Aujourd'hui"><ChangeCell value={brief.change_1d} /></Metric>
          <Metric label="1 mois"><ChangeCell value={brief.change_1m} /></Metric>
          <Metric label="YTD"><ChangeCell value={brief.change_ytd} /></Metric>
        </div>
      </div>

      {/* Score composite + sous-scores */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex flex-col items-center">
          <ScoreBadge score={brief.scores.composite} size="md" />
          <span className="text-[10px] text-muted mt-1 uppercase tracking-wider">{brief.scores.composite_label}</span>
        </div>
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
          {[
            { label: "Qualité",   score: brief.scores.quality },
            { label: "Valeur",    score: brief.scores.valuation },
            { label: "Croiss.",   score: brief.scores.growth },
            { label: "Momentum",  score: brief.scores.momentum },
            { label: "Risque",    score: brief.scores.risk },
          ].map((s) => (
            <div key={s.label}>
              <ScoreBadge score={s.score} size="sm" />
              <p className="text-[10px] text-muted mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Arguments pour / contre */}
      {(brief.pro_args.length > 0 || brief.con_args.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {brief.pro_args.length > 0 && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <h3 className="text-[10px] font-semibold text-green-700 uppercase tracking-widest mb-2">
                Points favorables
              </h3>
              <ul className="space-y-1.5">
                {brief.pro_args.map((arg, i) => (
                  <li key={i} className="text-sm text-green-900 flex gap-2">
                    <span className="text-green-500 flex-shrink-0 font-bold">+</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.con_args.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <h3 className="text-[10px] font-semibold text-red-700 uppercase tracking-widest mb-2">
                Points défavorables
              </h3>
              <ul className="space-y-1.5">
                {brief.con_args.map((arg, i) => (
                  <li key={i} className="text-sm text-red-900 flex gap-2">
                    <span className="text-red-500 flex-shrink-0 font-bold">−</span>
                    <span>{arg}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Métriques clés */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">Métriques clés</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Metric label="P/E"><MetricValue v={brief.key_metrics.pe_ratio} decimals={1} suffix="x" /></Metric>
          <Metric label="EV/EBITDA"><MetricValue v={brief.key_metrics.ev_ebitda} decimals={1} suffix="x" /></Metric>
          <Metric label="Marge opé."><MetricValue v={brief.key_metrics.operating_margin} pct /></Metric>
          <Metric label="ROE"><MetricValue v={brief.key_metrics.roe} pct /></Metric>
          <Metric label="Croiss. CA"><MetricValue v={brief.key_metrics.revenue_growth} pct /></Metric>
          <Metric label="D/E"><MetricValue v={brief.key_metrics.debt_to_equity} decimals={0} suffix="%" /></Metric>
          <Metric label="FCF"><MetricValue v={brief.key_metrics.free_cashflow} big /></Metric>
        </div>
      </div>

      {/* Détail des scores */}
      {scores && (
        <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-4">Détail des scores</h3>
          <div className="space-y-4">
            {([
              ["Qualité",      scores.scores.quality],
              ["Valorisation", scores.scores.valuation],
              ["Croissance",   scores.scores.growth],
              ["Momentum",     scores.scores.momentum],
              ["Risque",       scores.scores.risk],
            ] as [string, { score: number; reasons: string[] }][]).map(([label, detail]) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-1.5">
                  <ScoreBadge score={detail.score} size="sm" />
                  <span className="text-sm font-medium text-primary">{label}</span>
                </div>
                <ul className="ml-1 space-y-0.5">
                  {detail.reasons.map((r, i) => (
                    <li key={i} className="text-xs text-secondary flex gap-1.5">
                      <span className="text-accent flex-shrink-0">·</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Analyse approfondie (narrative engine) */}
      {brief.narrative && (
        <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm space-y-4">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Analyse approfondie</h3>
          {[
            { title: "Résumé", text: brief.narrative.summary },
            { title: "Fondamentaux", text: brief.narrative.fundamentals_narrative },
            { title: "Contexte sectoriel", text: brief.narrative.sector_context },
            { title: "Position concurrentielle", text: brief.narrative.competitive_position },
            { title: "Facteurs de risque", text: brief.narrative.risk_factors },
            { title: "Catalyseurs", text: brief.narrative.catalyst_watch },
          ].map((section) => (
            section.text && section.text !== "Secteur non couvert par l'univers d'analyse." && (
              <div key={section.title}>
                <h4 className="text-xs font-semibold text-navy mb-1">{section.title}</h4>
                <p className="text-xs text-secondary leading-relaxed">{section.text}</p>
              </div>
            )
          ))}
        </div>
      )}

      {/* News récentes */}
      {brief.recent_news.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">Actualités récentes</h3>
          <ul className="space-y-3">
            {brief.recent_news.map((item, i) => (
              <li key={i} className="border-b border-edge pb-3 last:border-0 last:pb-0">
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-primary hover:text-navy leading-snug transition-colors">
                  {item.title}
                </a>
                <p className="text-[10px] text-muted mt-0.5">
                  {item.publisher}
                  {item.published && ` · ${new Date(item.published).toLocaleDateString("fr-FR")}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Concurrents */}
      {competitors.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
          <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">Concurrents</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-edge">
                  {["Ticker", "Prix", "1J", "1M", "Score", "Qualité", "Valeur"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-muted uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {competitors.filter((c) => !c.error).map((c) => (
                  <tr key={c.ticker} className="border-b border-edge hover:bg-bg transition-colors">
                    <td className="px-3 py-2">
                      <Link href={`/company/${c.ticker}`} className="font-mono font-bold text-navy hover:text-navy-hover">
                        {c.ticker}
                      </Link>
                      <p className="text-[10px] text-muted truncate max-w-[120px]">{c.name}</p>
                    </td>
                    <td className="px-3 py-2 font-mono text-primary">
                      {c.current_price?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                    </td>
                    <td className="px-3 py-2"><ChangeCell value={c.change_1d} /></td>
                    <td className="px-3 py-2"><ChangeCell value={c.change_1m} /></td>
                    <td className="px-3 py-2">
                      {c.composite_score != null ? <ScoreBadge score={c.composite_score} size="sm" /> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.quality_score != null ? <ScoreBadge score={c.quality_score} size="sm" /> : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {c.valuation_score != null ? <ScoreBadge score={c.valuation_score} size="sm" /> : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Conviction / horizon */}
      <div className="flex items-center gap-4 text-xs text-secondary">
        <span>Conviction : <span className="text-primary font-medium">{brief.conviction}</span></span>
        <span className="text-edge">·</span>
        <span>Horizon : <span className="text-primary font-medium">{brief.horizon}</span></span>
      </div>

      <p className="text-[10px] text-muted tracking-wide">{brief.disclaimer}</p>
    </div>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function MetricValue({ v, decimals = 2, suffix = "", pct = false, big = false }: {
  v: number | null | undefined;
  decimals?: number; suffix?: string; pct?: boolean; big?: boolean;
}) {
  if (v == null) return <span className="text-muted text-sm">—</span>;

  let display: string;
  if (pct) {
    display = `${(v * 100).toFixed(1)}%`;
  } else if (big) {
    const abs = Math.abs(v);
    if (abs >= 1e9) display = `${(v / 1e9).toFixed(1)}B`;
    else if (abs >= 1e6) display = `${(v / 1e6).toFixed(0)}M`;
    else display = v.toFixed(0);
  } else {
    display = `${v.toFixed(decimals)}${suffix}`;
  }

  return <span className="text-sm font-mono text-primary font-medium">{display}</span>;
}

// ── Bloc "Activité" : combine identité yfinance + analyse approfondie si dispo ──

interface Identity {
  long_business_summary?: string | null;
  industry?: string | null;
  country?: string | null;
  employees?: number | null;
  website?: string | null;
  city?: string | null;
  exchange?: string | null;
}

function ActivityBlock({
  ticker, identity, sector, analysis,
}: {
  ticker: string;
  identity: Identity | undefined | null;
  sector: string | null | undefined;
  analysis: DeepAnalysis | null;
}) {
  const id: Identity = identity ?? {};
  const hasDeep = !!(analysis && (analysis.business_summary || analysis.competitive_moat || analysis.value_chain));

  return (
    <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Activité</h3>
        <div className="flex items-center gap-3 text-[0.7rem] text-secondary">
          {sector && <span>{sector}</span>}
          {id.industry && <span className="text-muted">·</span>}
          {id.industry && <span>{id.industry}</span>}
          {id.country && <span className="text-muted">·</span>}
          {id.country && <span>{id.country}</span>}
          {id.employees ? <span className="text-muted">·</span> : null}
          {id.employees ? <span>{id.employees.toLocaleString("fr-FR")} emp.</span> : null}
          {id.website && (
            <>
              <span className="text-muted">·</span>
              <a href={id.website} target="_blank" rel="noopener noreferrer"
                className="text-navy dark:text-accent hover:underline">site ↗</a>
            </>
          )}
        </div>
      </div>

      {/* PRIORITÉ 1 : analyse approfondie si elle existe */}
      {hasDeep ? (
        <div className="space-y-3">
          {analysis!.business_summary && (
            <Section title="Le business" text={analysis!.business_summary} />
          )}
          {analysis!.competitive_moat && (
            <Section title="Avantage concurrentiel" text={analysis!.competitive_moat} />
          )}
          {analysis!.value_chain && (
            <Section title="Chaîne de valeur" text={analysis!.value_chain} />
          )}
          <p className="text-[0.625rem] text-muted italic pt-1 border-t border-edge/30">
            Source : analyse approfondie · {analysis!.generated_at?.slice(0, 10) ?? ""} ·{" "}
            <Link href="/analyst" className="text-navy dark:text-accent hover:underline">mettre à jour →</Link>
          </p>
        </div>
      ) : (
        // PRIORITÉ 2 : description yfinance brute + invitation à l'analyse
        <div className="space-y-3">
          {id.long_business_summary ? (
            <details className="text-xs text-secondary leading-relaxed">
              <summary className="cursor-pointer text-primary font-medium select-none mb-1">
                Description (yfinance, EN — clique pour déplier)
              </summary>
              <p className="mt-2 whitespace-pre-line">{id.long_business_summary}</p>
              <a
                href={`https://www.deepl.com/translator#en/fr/${encodeURIComponent(id.long_business_summary.slice(0, 1500))}`}
                target="_blank" rel="noopener noreferrer"
                className="text-[0.7rem] text-navy dark:text-accent hover:underline mt-2 inline-block"
              >
                Traduire avec DeepL ↗
              </a>
            </details>
          ) : (
            <p className="text-xs text-muted italic">Description non disponible.</p>
          )}
          <div className="rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
            <p className="text-[0.7rem] text-secondary leading-relaxed">
              <span className="font-medium text-primary">Aucune analyse approfondie pour {ticker}.</span>{" "}
              Va sur la <Link href={`/analyst?ticker=${ticker}`} className="text-navy dark:text-accent font-medium hover:underline">page Analyste →</Link> pour générer un prompt structuré
              à coller dans claude.ai (gratuit). Au retour, copie la réponse ; les sections « Le business », « Avantage concurrentiel »
              et « Chaîne de valeur » s'afficheront ici.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-navy dark:text-accent mb-1">{title}</h4>
      <p className="text-xs text-secondary leading-relaxed whitespace-pre-line">{text}</p>
    </div>
  );
}
