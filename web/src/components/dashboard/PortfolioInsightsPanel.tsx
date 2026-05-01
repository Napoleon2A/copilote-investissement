"use client";

import { TickerBadge } from "@/components/ui/TickerBadge";
import { buildPortfolioInsights, type Insight, type InsightTone } from "@/lib/portfolioInsights";
import { SECTOR_COLORS } from "@/lib/tickerMeta";
import type { MarketSnapshot } from "@/lib/macroExplainer";
import { useState } from "react";

interface PortfolioInsightsPanelProps {
  snapshot: MarketSnapshot | null;
  portfolio: any;
  ideas: any[] | null;
  picks: any[];
  earnings: any;
  linkedNews: any[];
  sectorRotation?: any;
}

export function PortfolioInsightsPanel({
  snapshot, portfolio, ideas, picks, earnings, linkedNews, sectorRotation,
}: PortfolioInsightsPanelProps) {
  // Loading
  if (!snapshot || portfolio === undefined || ideas === undefined) {
    return <div className="card-premium p-5 h-72 animate-pulse" />;
  }

  const positions = portfolio?.positions ?? [];
  const totalValue = portfolio?.total_value ?? 0;
  const upcomingEarnings = earnings?.earnings ?? [];

  // Si rien à analyser
  if (positions.length === 0 && (ideas?.length ?? 0) === 0) {
    return (
      <div className="card-premium card-aura relative p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🎯</span>
          <h2 className="section-title">Analyse personnalisée</h2>
        </div>
        <div className="py-8 text-center">
          <p className="text-secondary text-sm">Aucune position ni idée enregistrée.</p>
          <p className="text-muted text-xs mt-1">
            Ajoute des positions au portefeuille ou des idées en suivi pour générer une analyse personnalisée.
          </p>
        </div>
      </div>
    );
  }

  const result = buildPortfolioInsights({
    snapshot,
    positions,
    totalValue,
    ideas: ideas ?? [],
    picks,
    upcomingEarnings,
    linkedNews,
    sectorRotation,
  });

  const {
    insights, exposureBySector, exposureByGeo, exposureByTrend,
    macroExposure, diversificationScore, riskLevel, scoreBreakdown,
  } = result;

  const dangerCount  = insights.filter(i => i.tone === "danger").length;
  const warningCount = insights.filter(i => i.tone === "warning").length;
  const infoCount    = insights.filter(i => i.tone === "info").length;
  const goodCount    = insights.filter(i => i.tone === "good").length;

  return (
    <div className="card-premium card-aura relative p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <h2 className="section-title">Analyse personnalisée de votre portefeuille</h2>
            <p className="section-title-hint mt-0.5">
              Insights croisés : positions, idées, picks × macro × earnings × news
            </p>
          </div>
        </div>

        {/* Score de diversification + risk badge */}
        <div className="flex items-center gap-3">
          <DiversificationScore score={diversificationScore} breakdown={scoreBreakdown} />
          <RiskBadge level={riskLevel} />
        </div>
      </div>

      {/* Compteurs */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <CounterPill count={dangerCount}  label="Risques"     tone="danger" />
        <CounterPill count={warningCount} label="Vigilances"  tone="warning" />
        <CounterPill count={infoCount}    label="Informations" tone="info" />
        <CounterPill count={goodCount}    label="Favorables"  tone="good" />
      </div>

      {/* Layout : insights à gauche + exposition à droite */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Liste des insights (col-span-2) */}
        <div className="lg:col-span-2 space-y-2 max-h-[420px] overflow-y-auto pr-2 nice-scroll">
          {insights.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-emerald-700 dark:text-emerald-400 font-medium">✓ Aucun signal critique</p>
              <p className="text-xs text-muted mt-1">Le portefeuille est dans une zone sans alerte particulière selon les critères analysés.</p>
            </div>
          ) : (
            insights.map((insight, i) => <InsightCard key={i} insight={insight} />)
          )}
        </div>

        {/* Exposition (col-span-1) */}
        <div className="space-y-3">
          {/* Score qualité — basé sur perf société/secteur */}
          {positions.length > 0 && (
            <div className="rounded-lg border border-edge/50 bg-surface/40 p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">⚖ Qualité du portefeuille</p>
              <div className="space-y-1.5">
                <ScoreBar label="Performance"    score={scoreBreakdown.geo}         hint="% de positions en gain latent" />
                <ScoreBar label="Momentum cycle" score={scoreBreakdown.trends}      hint="Performance moyenne 1 mois" />
                <ScoreBar label="Secteurs leaders" score={scoreBreakdown.sector}    hint="% de tes secteurs dans les top performeurs" />
                <ScoreBar label="Force relative"  score={scoreBreakdown.positionMax} hint="% de positions sur-performant leur secteur" />
              </div>
            </div>
          )}

          {/* Exposition sectorielle */}
          {exposureBySector.length > 0 && (
            <div className="rounded-lg border border-edge/50 bg-surface/40 p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">📊 Secteurs</p>
              <div className="space-y-1.5">
                {exposureBySector.map((e) => {
                  const colors = SECTOR_COLORS[e.sector];
                  return (
                    <div key={e.sector}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <span className={`font-medium ${colors.text}`}>{e.label}</span>
                        <span className="font-mono text-secondary">{e.weight}%</span>
                      </div>
                      <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
                        <div className={`h-full ${colors.bg.replace("/10", "/60")} rounded-full transition-all`}
                          style={{ width: `${e.weight}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Sensibilité macro */}
          {macroExposure.length > 0 && (
            <div className="rounded-lg border border-edge/50 bg-surface/40 p-3">
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-muted mb-2">🌐 Sensibilité macro</p>
              <ul className="space-y-1.5">
                {macroExposure.map((m, i) => {
                  const tone = m.impact === "very_negative" || m.impact === "negative" ? "text-red-600 dark:text-red-400"
                            : m.impact === "very_positive" || m.impact === "positive" ? "text-emerald-600 dark:text-emerald-400"
                            : "text-muted";
                  const dot = m.impact === "very_negative" || m.impact === "negative" ? "bg-red-500"
                            : m.impact === "very_positive" || m.impact === "positive" ? "bg-emerald-500"
                            : "bg-muted";
                  return (
                    <li key={i} className="text-xs">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                        <span className="font-semibold text-primary">{m.factor}</span>
                      </div>
                      <p className={`text-[0.7rem] leading-snug pl-3 ${tone}`}>{m.comment}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Composants internes ─────────────────────────────────────────────── */

function InsightCard({ insight }: { insight: Insight }) {
  const styles: Record<InsightTone, { bg: string; border: string; text: string; emoji: string }> = {
    danger:  { bg: "bg-red-500/5",    border: "border-l-red-500",    text: "text-red-700 dark:text-red-400",       emoji: "🚨" },
    warning: { bg: "bg-amber-500/5",  border: "border-l-amber-500",  text: "text-amber-700 dark:text-amber-400",   emoji: "⚠" },
    info:    { bg: "bg-blue-500/5",   border: "border-l-blue-500",   text: "text-blue-700 dark:text-blue-400",     emoji: "💡" },
    good:    { bg: "bg-emerald-500/5", border: "border-l-emerald-500", text: "text-emerald-700 dark:text-emerald-400", emoji: "✓" },
  };
  const s = styles[insight.tone];

  return (
    <div className={`rounded-lg border-l-4 border border-edge/30 ${s.bg} ${s.border} p-3`}>
      <div className="flex items-start gap-2">
        <span className="text-base flex-shrink-0">{s.emoji}</span>
        <div className="flex-1 min-w-0">
          <h4 className={`text-sm font-semibold ${s.text} mb-1`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {insight.title}
          </h4>
          <p className="text-xs text-secondary leading-relaxed">{insight.detail}</p>
          {insight.tickers && insight.tickers.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {insight.tickers.map(t => (
                <TickerBadge key={t} ticker={t} size="xs" showName={true} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBar({ label, score, hint }: { label: string; score: number; hint: string }) {
  const color = score >= 7 ? "bg-emerald-500"
              : score >= 4 ? "bg-amber-500"
              :              "bg-red-500";
  const colorText = score >= 7 ? "text-emerald-700 dark:text-emerald-400"
                  : score >= 4 ? "text-amber-700 dark:text-amber-400"
                  :              "text-red-700 dark:text-red-400";
  return (
    <div title={hint}>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-secondary">{label}</span>
        <span className={`font-mono font-bold ${colorText}`}>{score}/10</span>
      </div>
      <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`}
          style={{ width: `${score * 10}%` }} />
      </div>
    </div>
  );
}

function DiversificationScore({ score, breakdown }: { score: number; breakdown?: { sector: number; geo: number; positionMax: number; trends: number } }) {
  const color = score >= 7 ? "text-emerald-600 dark:text-emerald-400 stroke-emerald-500"
              : score >= 4 ? "text-amber-600 dark:text-amber-400 stroke-amber-500"
              :              "text-red-600 dark:text-red-400 stroke-red-500";
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const offset = circ - ((score / 10) * circ);

  const tooltipText = breakdown
    ? `Sectoriel: ${breakdown.sector}/10 · Géo: ${breakdown.geo}/10 · Position max: ${breakdown.positionMax}/10 · Mégatrends: ${breakdown.trends}/10`
    : "";

  return (
    <div className="relative flex items-center gap-2" title={tooltipText}>
      <svg width={48} height={48} viewBox="0 0 48 48" className="-rotate-90">
        <circle cx={24} cy={24} r={radius} className="fill-none stroke-edge" strokeWidth={3} />
        <circle cx={24} cy={24} r={radius}
          className={`fill-none ${color}`}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center" style={{ width: 48 }}>
        <span className={`text-xs font-bold ${color}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          {score}
        </span>
      </div>
      <div className="text-left">
        <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted">Diversification</p>
        <p className="text-[0.7rem] text-secondary">{score}/10 multifactoriel</p>
      </div>
    </div>
  );
}

function RiskBadge({ level }: { level: "low" | "medium" | "high" }) {
  const styles = {
    low:    { bg: "bg-emerald-500/10",  text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-500/30", label: "Risque faible" },
    medium: { bg: "bg-amber-500/10",    text: "text-amber-700 dark:text-amber-400",     border: "border-amber-500/30",   label: "Risque modéré" },
    high:   { bg: "bg-red-500/10",      text: "text-red-700 dark:text-red-400",         border: "border-red-500/30",     label: "Risque élevé" },
  };
  const s = styles[level];
  return (
    <span className={`text-[0.7rem] font-bold uppercase tracking-widest px-2 py-1 rounded border ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  );
}

function CounterPill({ count, label, tone }: { count: number; label: string; tone: InsightTone }) {
  const styles: Record<InsightTone, string> = {
    danger:  "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    info:    "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
    good:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  };
  const isActive = count > 0;
  return (
    <div className={`rounded-lg border p-2 text-center ${isActive ? styles[tone] : "bg-surface-alt text-muted border-edge"}`}>
      <p className="text-2xl font-bold leading-none"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{count}</p>
      <p className="text-[0.625rem] uppercase tracking-widest mt-1">{label}</p>
    </div>
  );
}
