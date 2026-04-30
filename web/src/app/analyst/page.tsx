"use client";

import { useState, useEffect } from "react";
import { getWeeklySelection, getAnalystBudget, runWeeklySelection, analyzeDeep, getPromptForClipboard, getWeeklyPromptForClipboard, importAnalysis, importWeeklyAnalysis } from "@/lib/api";
import { ExpandableThesisCard } from "@/components/analyst/ExpandableThesisCard";
import type { WeeklySelectionResult, AnalystBudget, DeepAnalysis } from "@/lib/api";

export default function AnalystPage() {
  const [selection, setSelection] = useState<WeeklySelectionResult | null>(null);
  const [budget, setBudget] = useState<AnalystBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ticker individuel
  const [singleTicker, setSingleTicker] = useState("");
  const [singleAnalysis, setSingleAnalysis] = useState<DeepAnalysis | null>(null);
  const [analyzingSingle, setAnalyzingSingle] = useState(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // Générer le prompt (individuel)
  const [copying, setCopying] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [importing, setImporting] = useState(false);

  // Générer le prompt (hebdo)
  const [copyingWeekly, setCopyingWeekly] = useState(false);
  const [generatedWeeklyPrompt, setGeneratedWeeklyPrompt] = useState("");
  const [weeklyPromptTickers, setWeeklyPromptTickers] = useState<string[]>([]);
  const [showWeeklyPasteArea, setShowWeeklyPasteArea] = useState(false);
  const [weeklyPasteText, setWeeklyPasteText] = useState("");
  const [importingWeekly, setImportingWeekly] = useState(false);

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<"weekly" | "single" | null>(null);

  useEffect(() => {
    Promise.all([
      getWeeklySelection().catch(() => null),
      getAnalystBudget().catch(() => null),
    ]).then(([sel, bud]) => {
      setSelection(sel);
      setBudget(bud);
      setLoading(false);
    });
  }, []);

  const handleRunWeekly = async () => {
    setConfirmAction(null);
    setRunning(true);
    setError(null);
    try {
      const result = await runWeeklySelection();
      setSelection(result);
      const bud = await getAnalystBudget().catch(() => null);
      setBudget(bud);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setRunning(false);
    }
  };

  const handleAnalyzeSingle = async () => {
    setConfirmAction(null);
    if (!singleTicker.trim()) return;
    setAnalyzingSingle(true);
    setSingleError(null);
    setSingleAnalysis(null);
    try {
      const result = await analyzeDeep(singleTicker.trim().toUpperCase());
      setSingleAnalysis(result);
      const bud = await getAnalystBudget().catch(() => null);
      setBudget(bud);
    } catch (e: unknown) {
      setSingleError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setAnalyzingSingle(false);
    }
  };

  const handleCopyWeeklyPrompt = async () => {
    setCopyingWeekly(true);
    setGeneratedWeeklyPrompt("");
    setError(null);
    try {
      const result = await getWeeklyPromptForClipboard();
      setWeeklyPromptTickers(result.tickers);
      setGeneratedWeeklyPrompt(result.prompt);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur génération prompt hebdo");
    } finally {
      setCopyingWeekly(false);
    }
  };

  const handleCopyPrompt = async () => {
    if (!singleTicker.trim()) return;
    setCopying(true);
    setGeneratedPrompt("");
    setSingleError(null);
    try {
      const result = await getPromptForClipboard(singleTicker.trim().toUpperCase());
      setGeneratedPrompt(result.prompt);
    } catch (e: unknown) {
      setSingleError(e instanceof Error ? e.message : "Erreur génération prompt");
    } finally {
      setCopying(false);
    }
  };

  const [clipboardOk, setClipboardOk] = useState(false);

  const copyToClipboard = (text: string) => {
    // Méthode la plus fiable : textarea invisible temporaire
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.left = "-9999px";
    el.style.top = "-9999px";
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, text.length);
    document.execCommand("copy");
    document.body.removeChild(el);
    setClipboardOk(true);
    setTimeout(() => setClipboardOk(false), 2000);
  };

  const handleImportPaste = async () => {
    if (!pasteText.trim() || !singleTicker.trim()) return;
    setImporting(true);
    setSingleError(null);
    try {
      const result = await importAnalysis(singleTicker.trim().toUpperCase(), pasteText);
      setSingleAnalysis(result);
      setShowPasteArea(false);
      setPasteText("");
    } catch (e: unknown) {
      setSingleError(e instanceof Error ? e.message : "Erreur import");
    } finally {
      setImporting(false);
    }
  };

  const handleImportWeeklyPaste = async () => {
    if (!weeklyPasteText.trim() || !weeklyPromptTickers.length) return;
    setImportingWeekly(true);
    setError(null);
    try {
      await importWeeklyAnalysis(weeklyPromptTickers, weeklyPasteText);
      // Recharger la sélection
      const sel = await getWeeklySelection().catch(() => null);
      setSelection(sel);
      setShowWeeklyPasteArea(false);
      setWeeklyPasteText("");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur import hebdo");
    } finally {
      setImportingWeekly(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-7 w-48 rounded bg-surface-alt" />
          <div className="h-24 rounded bg-surface-alt" />
          <div className="h-24 rounded bg-surface-alt" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-primary">Analyste IA</h1>
          <p className="text-sm text-secondary mt-0.5">
            Analyses deep via Claude API — raisonnement investisseur
          </p>
        </div>

        {/* Budget badge */}
        {budget && (
          <div className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs">
            <span className="text-muted">Budget {budget.month} : </span>
            <span className="font-mono font-bold text-primary">
              {budget.monthly_spend.toFixed(2)}$
            </span>
            <span className="text-muted"> / {budget.monthly_limit.toFixed(2)}$</span>
            <span className={`ml-2 font-mono ${budget.remaining > 1 ? "text-green-700 dark:text-green-400" : budget.remaining > 0 ? "text-amber-700 dark:text-amber-400" : "text-red-700 dark:text-red-400"}`}>
              ({budget.remaining.toFixed(2)}$ restant)
            </span>
          </div>
        )}
      </div>

      {/* Analyse individuelle */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest mb-3">
          Analyse individuelle
        </h2>
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            value={singleTicker}
            onChange={(e) => setSingleTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (ex: AAPL)"
            className="flex-1 max-w-xs rounded border border-edge bg-bg px-3 py-2 text-sm text-primary
                       placeholder:text-muted focus:outline-none focus:border-navy"
          />
          <button
            onClick={handleCopyPrompt}
            disabled={copying || !singleTicker.trim()}
            className="rounded border border-navy text-navy px-4 py-2 text-sm font-medium
                       hover:bg-navy hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copying ? "Collecte des données..." : "Générer le prompt (gratuit)"}
          </button>
          <button
            onClick={() => setConfirmAction("single")}
            disabled={analyzingSingle || !singleTicker.trim()}
            className="rounded bg-navy px-4 py-2 text-sm font-medium text-white
                       hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {analyzingSingle ? "Analyse en cours..." : "Analyser via API (~0.15$)"}
          </button>
        </div>
        {/* Prompt généré — copier puis coller la réponse */}
        {generatedPrompt && (
          <div className="mt-3 space-y-3">
            {/* Étape 1 : le prompt à copier */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                  Étape 1 — Copie ce prompt dans claude.ai
                </label>
                <button
                  onClick={() => copyToClipboard(generatedPrompt)}
                  className="text-xs text-navy hover:text-navy-hover transition-colors font-medium"
                >
                  {clipboardOk ? "Copié !" : "Copier dans le presse-papier"}
                </button>
              </div>
              <textarea
                data-prompt-area
                readOnly
                value={generatedPrompt}
                rows={8}
                className="w-full rounded border border-edge bg-surface-alt/50 px-3 py-2 text-xs text-secondary
                           font-mono focus:outline-none resize-y cursor-text"
                onFocus={(e) => e.target.select()}
              />
              <p className="text-[10px] text-muted">{generatedPrompt.length} caractères · Clique dans le textarea puis Ctrl+A / Ctrl+C pour copier</p>
            </div>

            {/* Étape 2 : coller la réponse */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                Étape 2 — Colle la réponse de Claude ici
              </label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Colle ici la réponse complète de Claude..."
                rows={6}
                className="w-full rounded border border-edge bg-bg px-3 py-2 text-sm text-primary
                           placeholder:text-muted focus:outline-none focus:border-navy resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleImportPaste}
                  disabled={importing || pasteText.length < 50}
                  className="rounded bg-navy px-4 py-2 text-sm font-medium text-white
                             hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? "Import en cours..." : "Importer l'analyse"}
                </button>
                <button
                  onClick={() => { setGeneratedPrompt(""); setPasteText(""); }}
                  className="rounded border border-edge px-4 py-2 text-sm text-secondary
                             hover:bg-surface-alt transition-colors"
                >
                  Fermer
                </button>
                {pasteText.length > 0 && (
                  <span className="text-[10px] text-muted self-center">{pasteText.length} caractères</span>
                )}
              </div>
            </div>
          </div>
        )}
        {singleError && (
          <p className="text-sm text-red-700 dark:text-red-400 mt-2">{singleError}</p>
        )}
        {singleAnalysis && (
          <div className="mt-4">
            <ExpandableThesisCard analysis={singleAnalysis} defaultOpen />
          </div>
        )}
      </div>

      {/* Sélection hebdomadaire */}
      <div className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
              Sélection hebdomadaire
            </h2>
            {selection?.selection && (
              <p className="text-xs text-secondary mt-1">
                Semaine du {new Date(selection.selection.week_start).toLocaleDateString("fr-FR")}
                {" · "}Générée le {new Date(selection.selection.generated_at).toLocaleDateString("fr-FR")}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCopyWeeklyPrompt}
              disabled={copyingWeekly}
              className="rounded border border-navy text-navy px-4 py-2 text-sm font-medium
                         hover:bg-navy hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copyingWeekly ? "Scan en cours (~30s)..." : "Générer le prompt (gratuit)"}
            </button>
            <button
              onClick={() => setConfirmAction("weekly")}
              disabled={running}
              className="rounded bg-navy px-4 py-2 text-sm font-medium text-white
                         hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {running ? "En cours..." : "Lancer via API (~0.85$)"}
            </button>
          </div>
        </div>

        {/* Prompt hebdo généré */}
        {generatedWeeklyPrompt && (
          <div className="mt-3 space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                  Étape 1 — Copie ce prompt dans claude.ai ({weeklyPromptTickers.join(", ")})
                </label>
                <button
                  onClick={() => copyToClipboard(generatedWeeklyPrompt)}
                  className="text-xs text-navy hover:text-navy-hover transition-colors font-medium"
                >
                  {clipboardOk ? "Copié !" : "Copier dans le presse-papier"}
                </button>
              </div>
              <textarea
                data-prompt-area
                readOnly
                value={generatedWeeklyPrompt}
                rows={8}
                className="w-full rounded border border-edge bg-surface-alt/50 px-3 py-2 text-xs text-secondary
                           font-mono focus:outline-none resize-y cursor-text"
                onFocus={(e) => e.target.select()}
              />
              <p className="text-[10px] text-muted">{generatedWeeklyPrompt.length} caractères · Clique dans le textarea puis Ctrl+A / Ctrl+C pour copier</p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                Étape 2 — Colle la réponse de Claude ici
              </label>
              <textarea
                value={weeklyPasteText}
                onChange={(e) => setWeeklyPasteText(e.target.value)}
                placeholder="Colle ici la réponse complète de Claude..."
                rows={8}
                className="w-full rounded border border-edge bg-bg px-3 py-2 text-sm text-primary
                           placeholder:text-muted focus:outline-none focus:border-navy resize-y"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleImportWeeklyPaste}
                  disabled={importingWeekly || weeklyPasteText.length < 50}
                  className="rounded bg-navy px-4 py-2 text-sm font-medium text-white
                             hover:bg-navy-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importingWeekly ? "Import en cours..." : "Importer la sélection"}
                </button>
                <button
                  onClick={() => { setGeneratedWeeklyPrompt(""); setWeeklyPasteText(""); }}
                  className="rounded border border-edge px-4 py-2 text-sm text-secondary
                             hover:bg-surface-alt transition-colors"
                >
                  Fermer
                </button>
                {weeklyPasteText.length > 0 && (
                  <span className="text-[10px] text-muted self-center">{weeklyPasteText.length} caractères</span>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-700 dark:text-red-400 mb-4">{error}</p>
        )}

        {/* Thèses individuelles (API) */}
        {selection?.theses && selection.theses.length > 0 && (
          <div className="space-y-3">
            {selection.theses.map((thesis) => (
              <ExpandableThesisCard key={thesis.ticker} analysis={thesis} />
            ))}
          </div>
        )}

        {/* Rationale / Analyse collée (rendu formaté) */}
        {selection?.selection?.rationale && (!selection.theses || selection.theses.length === 0) && (
          <div className="rounded-lg border border-edge bg-surface p-5 shadow-sm">
            <FormattedAnalysis text={selection.selection.rationale} />
          </div>
        )}

        {/* Message vide */}
        {!selection?.selection && (!selection?.theses || selection.theses.length === 0) && (
          <p className="text-sm text-muted text-center py-8">
            Aucune sélection disponible. Génère le prompt ou lance la sélection pour commencer.
          </p>
        )}
      </div>

      {/* Confirmation dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg border border-edge bg-surface p-6 shadow-xl max-w-md mx-4">
            <h3 className="text-lg font-bold text-primary mb-2">Confirmer l&apos;analyse</h3>
            <p className="text-sm text-secondary mb-4">
              {confirmAction === "weekly"
                ? "Cela va lancer la sélection hebdomadaire. Coût estimé : ~0.85$. Les résultats seront mis en cache pour 7 jours."
                : `Cela va lancer une analyse deep de ${singleTicker}. Coût estimé : ~0.15$. Le résultat sera mis en cache pour 7 jours.`}
            </p>
            {budget && (
              <p className="text-xs text-muted mb-4">
                Budget restant : {budget.remaining.toFixed(2)}$ / {budget.monthly_limit.toFixed(2)}$
              </p>
            )}
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="rounded border border-edge px-4 py-2 text-sm text-secondary hover:bg-surface-alt transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={confirmAction === "weekly" ? handleRunWeekly : handleAnalyzeSingle}
                className="rounded bg-navy px-4 py-2 text-sm font-medium text-white hover:bg-navy-hover transition-colors"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormattedAnalysis({ text }: { text: string }) {
  const lines = text.split("\n");

  return (
    <div className="space-y-2 text-sm text-secondary leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        // Titres ## ou **TITRE**
        if (trimmed.startsWith("## ") || trimmed.startsWith("# ")) {
          const content = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "");
          return (
            <h3 key={i} className="text-base font-bold text-primary mt-4 mb-1 border-b border-edge pb-1">
              {content}
            </h3>
          );
        }

        // Sous-titres avec numéro : "1. **LE BUSINESS**" ou "**VERDICT**"
        const numberedHeading = trimmed.match(/^(\d+\.\s*)?\*\*(.+?)\*\*\s*(?:—|:)?\s*(.*)/);
        if (numberedHeading && !numberedHeading[3]) {
          return (
            <h4 key={i} className="text-sm font-bold text-primary mt-3 uppercase tracking-wide">
              {numberedHeading[1] || ""}{numberedHeading[2]}
            </h4>
          );
        }

        // Lignes avec du gras inline
        if (trimmed.includes("**")) {
          const parts = trimmed.split(/(\*\*.*?\*\*)/g);
          return (
            <p key={i}>
              {parts.map((part, j) =>
                part.startsWith("**") && part.endsWith("**") ? (
                  <strong key={j} className="text-primary font-semibold">
                    {part.slice(2, -2)}
                  </strong>
                ) : (
                  <span key={j}>{part}</span>
                )
              )}
            </p>
          );
        }

        // Bullet points
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ") || trimmed.startsWith("* ")) {
          return (
            <div key={i} className="flex gap-2 pl-2">
              <span className="text-accent flex-shrink-0">•</span>
              <span>{trimmed.slice(2)}</span>
            </div>
          );
        }

        // Ligne de séparation
        if (trimmed.match(/^[-=]{3,}$/)) {
          return <hr key={i} className="border-edge my-3" />;
        }

        // Texte normal
        return <p key={i}>{trimmed}</p>;
      })}
    </div>
  );
}
