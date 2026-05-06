"use client";

import { useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta } from "@/lib/tickerMeta";
import { RSS_CATEGORY_LABELS, SOURCE_BADGES, LinkedFilter } from "./shared";
import { IcLinkedNews } from "./icons";

interface LinkedNewsPanelProps {
  data: any;
  perTickerData: any;
  portfolioTickers: Set<string>;
  ideasTickers: Set<string>;
  picksTickers: Set<string>;
}

export function LinkedNewsPanel({
  data, perTickerData, portfolioTickers, ideasTickers, picksTickers,
}: LinkedNewsPanelProps) {
  const [filter, setFilter] = useState<LinkedFilter>("all");

  if (data === undefined && perTickerData === undefined) {
    return <div className="rounded-2xl border border-edge bg-surface h-full min-h-[400px] animate-pulse" />;
  }

  const macroLinked = data?.articles ?? [];
  const perTicker = perTickerData?.articles ?? [];

  // Dédoublonnage par lien et par titre
  const seenLinks = new Set<string>();
  const seenTitleKeys = new Set<string>();
  const merged: any[] = [];
  for (const a of [...perTicker, ...macroLinked]) {
    const link = a.link || "";
    const titleKey = (a.title || "").slice(0, 50).toLowerCase();
    if (link && seenLinks.has(link)) continue;
    if (titleKey && seenTitleKeys.has(titleKey)) continue;
    seenLinks.add(link);
    seenTitleKeys.add(titleKey);
    merged.push(a);
  }

  merged.sort((a, b) => (b.published || "").localeCompare(a.published || ""));

  const annotated = merged.map((a: any) => {
    const sources: LinkedFilter[] = [];
    for (const t of a.tickers_mentioned ?? []) {
      const tu = t.toUpperCase();
      if (portfolioTickers.has(tu)) sources.push("portfolio");
      if (ideasTickers.has(tu))     sources.push("ideas");
      if (picksTickers.has(tu))     sources.push("picks");
    }
    return { ...a, sources: Array.from(new Set(sources)) };
  });

  const filtered = filter === "all" ? annotated : annotated.filter((a: any) => a.sources.includes(filter));

  const counts = {
    all: annotated.length,
    portfolio: annotated.filter((a: any) => a.sources.includes("portfolio")).length,
    ideas:     annotated.filter((a: any) => a.sources.includes("ideas")).length,
    picks:     annotated.filter((a: any) => a.sources.includes("picks")).length,
  };

  return (
    <div className="card-premium card-aura relative p-5 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2 flex-shrink-0 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <IcLinkedNews size={18} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Actualité des cibles
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted whitespace-nowrap">{filtered.length} article{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <p className="text-xs text-muted mb-3 leading-relaxed flex-shrink-0">
        Actualités RSS mentionnant les sociétés de votre <span className="font-semibold text-secondary">portefeuille</span>,
        de vos <span className="font-semibold text-secondary">idées en suivi</span> ou des <span className="font-semibold text-secondary">picks de la semaine</span>.
      </p>

      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <label htmlFor="linked-filter" className="text-[0.7rem] font-bold uppercase tracking-widest text-muted">Source</label>
        <select
          id="linked-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value as LinkedFilter)}
          className="flex-1 text-xs bg-surface border border-edge rounded-md px-2 py-1.5
                     text-primary focus:outline-none focus:border-navy dark:focus:border-accent
                     hover:bg-bg/50 cursor-pointer transition-colors"
        >
          <option value="all">Tout ({counts.all})</option>
          <option value="portfolio">Portefeuille uniquement ({counts.portfolio})</option>
          <option value="ideas">Idées en suivi ({counts.ideas})</option>
          <option value="picks">Picks de la semaine ({counts.picks})</option>
        </select>
      </div>

      {data?.scanning && filtered.length === 0 ? (
        <div className="py-6 text-xs text-secondary text-center">Récupération des sources RSS...</div>
      ) : filtered.length > 0 ? (
        <ul className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-2 nice-scroll">
          {filtered.map((n: any, i: number) => <LinkedNewsRow key={i} article={n} />)}
        </ul>
      ) : annotated.length > 0 ? (
        <p className="text-xs text-muted italic py-4 text-center">
          Aucun article pour ce filtre.
        </p>
      ) : (
        <div className="py-4 text-xs text-secondary leading-relaxed">
          <p>Aucune actualité liée à vos sociétés pour l&apos;instant.</p>
          <p className="text-muted text-xs mt-2">
            Plus tu ajoutes de tickers (portefeuille, idées), plus ce flux sera personnalisé.
          </p>
        </div>
      )}
    </div>
  );
}

function LinkedNewsRow({ article }: { article: any }) {
  const date = article.published ? new Date(article.published) : null;
  const dateStr = date ? date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
  const langFlag = article.lang === "fr" ? "🇫🇷" : "🇬🇧";
  const cat = RSS_CATEGORY_LABELS[article.category] ?? RSS_CATEGORY_LABELS.company;
  const sources: LinkedFilter[] = article.sources ?? [];

  return (
    <li className="border-b border-edge/30 last:border-0 pb-3 last:pb-0">
      <a href={article.link} target="_blank" rel="noopener noreferrer" className="group/news block">
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1 flex-shrink-0">
            {article.tickers_mentioned?.slice(0, 2).map((t: string) => (
              <TickerBadge key={t} ticker={t} size="xs" showName={false} />
            ))}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-1 flex-wrap">
              {sources.map((s) => {
                const sb = SOURCE_BADGES[s];
                return (
                  <span key={s} className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${sb.bg} ${sb.text} ${sb.border}`}>
                    {sb.label}
                  </span>
                );
              })}
              <span className={`text-[0.55rem] font-bold uppercase tracking-wider px-1 py-px rounded border ${cat.bg} ${cat.text} ${cat.border}`}>
                {cat.label}
              </span>
            </div>
            <p className="text-xs text-primary leading-snug group-hover/news:text-navy dark:group-hover/news:text-accent transition-colors line-clamp-3">
              {article.title}
            </p>
            {article.summary && article.summary.length > 30 && (
              <p className="text-[0.7rem] text-secondary leading-relaxed mt-1 line-clamp-2 italic">
                {article.summary}
              </p>
            )}
            <div className="flex items-center gap-1.5 mt-1 text-[0.625rem] text-muted">
              <span>{langFlag} {article.publisher}</span>
              {dateStr && <><span>·</span><span>{dateStr}</span></>}
              {article.tickers_mentioned?.length > 0 && (
                <>
                  <span>·</span>
                  <span className="truncate">{article.tickers_mentioned.slice(0, 3).map((t: string) => getTickerMeta(t).name).join(", ")}</span>
                </>
              )}
            </div>
          </div>
        </div>
      </a>
    </li>
  );
}
