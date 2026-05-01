"use client";

import { getNewsImpact } from "@/lib/macroExplainer";
import { RSS_CATEGORY_LABELS } from "./shared";

interface MacroNewsPanelProps {
  data: any;
}

export function MacroNewsPanel({ data }: MacroNewsPanelProps) {
  if (data === undefined) return <div className="rounded-2xl border border-edge bg-surface h-96 animate-pulse" />;

  const articles = data?.articles ?? [];
  const computedAt = data?.computed_at ? new Date(data.computed_at) : null;
  const ageMin = computedAt ? Math.round((Date.now() - computedAt.getTime()) / 60000) : null;

  return (
    <div className="card-premium relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">📰</span>
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Actualité macro & géopolitique
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">
          {articles.length > 0 && `${data.count} articles`}
          {ageMin != null && ` · maj il y a ${ageMin === 0 ? "< 1" : ageMin} min`}
        </span>
      </div>

      {data?.scanning && articles.length === 0 ? (
        <div className="py-6 text-xs text-secondary text-center">
          Récupération des sources RSS en cours...
        </div>
      ) : articles.length === 0 ? (
        <p className="py-4 text-xs text-muted italic text-center">Aucune actualité macro disponible.</p>
      ) : (
        <ul className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
          {articles.map((n: any, i: number) => <MacroNewsRow key={i} article={n} />)}
        </ul>
      )}

      <p className="text-[0.7rem] text-muted mt-3 pt-2 border-t border-edge/40 flex-shrink-0">
        Sources gratuites : Les Échos · Boursorama · Le Monde · CNBC · MarketWatch · Reuters · BBC · La Tribune · Le Figaro · Yahoo · Investing.com
      </p>
    </div>
  );
}

function MacroNewsRow({ article }: { article: any }) {
  const style = RSS_CATEGORY_LABELS[article.category] ?? RSS_CATEGORY_LABELS.company;
  const date = article.published ? new Date(article.published) : null;
  const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : null;
  const langFlag = article.lang === "fr" ? "🇫🇷" : "🇬🇧";

  const impact = getNewsImpact(article.title, article.summary || "", article.category);

  return (
    <li className="border-l-2 pl-3 py-1.5 hover:bg-bg/40 transition-colors rounded-r" style={{ borderColor: "rgb(var(--accent))" }}>
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group/news block">
        <div className="flex items-start gap-2">
          <span className="text-base flex-shrink-0">{style.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
              <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${style.bg} ${style.text} ${style.border}`}>
                {style.label}
              </span>
              <span className="text-[0.625rem] text-muted">{langFlag} {article.publisher}</span>
              {dateStr && <span className="text-[0.625rem] text-muted">· {dateStr}</span>}
            </div>
            <p className="text-xs text-primary leading-snug group-hover/news:text-navy dark:group-hover/news:text-accent transition-colors line-clamp-3">
              {article.title}
            </p>
            {article.tickers_mentioned?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {article.tickers_mentioned.slice(0, 5).map((t: string) => (
                  <span key={t} className="text-[0.625rem] font-mono font-bold text-navy dark:text-accent bg-navy/5 dark:bg-accent/10 px-1 py-px rounded">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-1.5 pl-2 border-l-2 border-amber-500/40 bg-amber-500/5 rounded-r py-1 px-2">
              <p className="text-[0.7rem] text-secondary leading-relaxed">
                💡 {impact.text}
              </p>
              {impact.affects && (
                <p className="text-[0.625rem] text-muted mt-1 font-medium">
                  📊 {impact.affects}
                </p>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}
