"use client";

import { useState } from "react";
import type { DeepAnalysis } from "@/lib/api";

const VERDICT_COLORS: Record<string, string> = {
  buy: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
  watch: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700",
  avoid: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-700",
};

const CONVICTION_COLORS: Record<string, string> = {
  "élevé": "text-green-700 dark:text-green-400",
  "moyen": "text-amber-700 dark:text-amber-400",
  "faible": "text-red-700 dark:text-red-400",
};

interface Props {
  analysis: DeepAnalysis;
  defaultOpen?: boolean;
}

export function ExpandableThesisCard({ analysis, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const verdictStyle = VERDICT_COLORS[analysis.verdict_action] ?? VERDICT_COLORS.watch;
  const convictionStyle = CONVICTION_COLORS[analysis.verdict_conviction] ?? "";

  // Résumé : one_liner du verdict JSON, sinon première phrase de la thèse
  const shortThesis = analysis.one_liner
    ?? (analysis.investment_thesis
      ? analysis.investment_thesis.split(/[.!?]\s/)[0] + "."
      : null);

  // Sections à afficher (ignorer les nulles/vides)
  const sections: { label: string; content: string }[] = [];
  if (analysis.business_summary) sections.push({ label: "Le Business", content: analysis.business_summary });
  if (analysis.competitive_moat) sections.push({ label: "Avantage Concurrentiel", content: analysis.competitive_moat });
  if (analysis.value_chain) sections.push({ label: "Chaîne de Valeur", content: analysis.value_chain });
  if (analysis.financial_dynamics) sections.push({ label: "Dynamique Financière", content: analysis.financial_dynamics });
  if (analysis.current_momentum) sections.push({ label: "Momentum Actuel", content: analysis.current_momentum });
  if (analysis.specific_risks) sections.push({ label: "Risques Concrets", content: analysis.specific_risks });
  if (analysis.investment_thesis) sections.push({ label: "Thèse d'Investissement", content: analysis.investment_thesis });

  return (
    <div className="rounded-lg border border-edge bg-surface shadow-sm overflow-hidden transition-all duration-200">
      {/* Header — toujours visible */}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-alt/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {/* Ticker */}
          <span className="font-mono font-bold text-lg text-navy">{analysis.ticker}</span>

          {/* Verdict badge */}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border uppercase ${verdictStyle}`}>
            {analysis.verdict_action}
          </span>

          {/* Conviction */}
          <span className={`text-xs font-medium ${convictionStyle}`}>
            {analysis.verdict_conviction}
          </span>

          {/* Prix d'entrée */}
          {analysis.ideal_entry_price != null && (
            <span className="text-xs text-muted font-mono">
              Entrée : ${analysis.ideal_entry_price.toFixed(0)}
            </span>
          )}

          {/* Résumé de la thèse */}
          {!open && shortThesis && (
            <span className="text-xs text-secondary truncate hidden sm:inline">
              — {shortThesis}
            </span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-5 h-5 text-muted transition-transform duration-200 flex-shrink-0 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Body — sections flexibles */}
      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-edge">
          {sections.map((section) => (
            <div key={section.label} className="pt-3">
              {/* Si c'est le seul bloc (texte complet collé), afficher avec formatage markdown */}
              {sections.length === 1 && section.content.length > 500 ? (
                <FormattedBlock text={section.content} />
              ) : (
                <>
                  <h4 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-1.5">
                    {section.label}
                  </h4>
                  <div className="text-sm text-secondary leading-relaxed whitespace-pre-line">
                    {section.content}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Verdict détaillé */}
          <div className="pt-3 border-t border-edge">
            <h4 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-2">
              Verdict
            </h4>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <span className="text-muted">Action : </span>
                <span className={`font-semibold uppercase ${verdictStyle.split(" ").filter(c => c.startsWith("text-")).join(" ")}`}>
                  {analysis.verdict_action}
                </span>
              </div>
              <div>
                <span className="text-muted">Conviction : </span>
                <span className={`font-semibold ${convictionStyle}`}>{analysis.verdict_conviction}</span>
              </div>
              {analysis.verdict_horizon && (
                <div>
                  <span className="text-muted">Horizon : </span>
                  <span className="text-primary">{analysis.verdict_horizon}</span>
                </div>
              )}
              {analysis.ideal_entry_price != null && (
                <div>
                  <span className="text-muted">Prix d&apos;entrée idéal : </span>
                  <span className="font-mono text-primary">${analysis.ideal_entry_price.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Métadonnées */}
          <div className="flex items-center gap-4 text-[10px] text-muted pt-2">
            <span>Généré le {new Date(analysis.generated_at).toLocaleDateString("fr-FR")}</span>
            {analysis.cost_usd > 0 && <span>Coût : {analysis.cost_usd.toFixed(4)}$</span>}
            {analysis.from_cache && <span className="text-navy">depuis le cache</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FormattedBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="space-y-2 text-sm text-secondary leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
          const content = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "");
          return <h3 key={i} className="text-base font-bold text-primary mt-4 mb-1 border-b border-edge pb-1">{content}</h3>;
        }

        const heading = trimmed.match(/^(\d+\.\s*)?\*\*(.+?)\*\*\s*(?:—|:)?\s*(.*)/);
        if (heading && !heading[3]) {
          return <h4 key={i} className="text-sm font-bold text-primary mt-3 uppercase tracking-wide">{heading[1] || ""}{heading[2]}</h4>;
        }

        if (trimmed.includes("**")) {
          const parts = trimmed.split(/(\*\*.*?\*\*)/g);
          return (
            <p key={i}>
              {parts.map((part, j) =>
                part.startsWith("**") && part.endsWith("**")
                  ? <strong key={j} className="text-primary font-semibold">{part.slice(2, -2)}</strong>
                  : <span key={j}>{part}</span>
              )}
            </p>
          );
        }

        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-accent flex-shrink-0">•</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }

        if (trimmed.match(/^[-=]{3,}$/)) return <hr key={i} className="border-edge my-3" />;

        return <p key={i}>{trimmed}</p>;
      })}
    </div>
  );
}
