/**
 * Page Idées — /idea
 * Soumettre une idée → le système génère un avis argumenté et le conserve.
 */
"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getIdeas, submitIdea, getIdea, reviseIdea } from "@/lib/api";
import type { IdeaSummary, IdeaDetail } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

function IdeaPageContent() {
  useDocumentTitle("Idées");
  const searchParams = useSearchParams();
  const prefillTicker = searchParams.get("ticker") || "";

  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null);
  const [ticker, setTicker] = useState(prefillTicker);
  const [userThesis, setUserThesis] = useState("");
  const [loading, setLoading] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [showReviseForm, setShowReviseForm] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { getIdeas().then(setIdeas).catch(() => {}); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true); setError("");
    try {
      const result = await submitIdea(ticker.trim().toUpperCase(), userThesis || undefined) as { idea: { id: number } };
      const detail = await getIdea(result.idea.id);
      setSelectedIdea(detail);
      setIdeas((prev) => [{
        id: result.idea.id, ticker: ticker.toUpperCase(), name: detail.company.name,
        conviction: detail.idea.conviction || undefined, action: detail.idea.action || undefined,
        horizon: detail.idea.horizon || undefined, created_at: detail.idea.created_at,
      }, ...prev]);
      setTicker(""); setUserThesis("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectIdea = async (id: number) => {
    const detail = await getIdea(id);
    setSelectedIdea(detail);
  };

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIdea || !revisionNote.trim()) return;
    const result = await reviseIdea(selectedIdea.idea.id, revisionNote);
    setSelectedIdea(result as unknown as IdeaDetail);
    setRevisionNote(""); setShowReviseForm(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-primary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Idées
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Soumets un ticker — le système génère un avis argumenté, le date, et le révise si les faits changent.
        </p>
      </div>

      {/* Formulaire de soumission */}
      <form onSubmit={handleSubmit} className="rounded-lg border border-edge bg-surface p-5 space-y-4 shadow-sm">
        <h2 className="text-xs font-semibold text-navy uppercase tracking-widest">Nouvelle idée</h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (ex: NVDA)"
            className="bg-bg border border-edge rounded px-3 py-2 text-sm
                       text-primary placeholder-muted focus:outline-none focus:border-navy w-full sm:w-40 transition-colors"
            required />
          <textarea value={userThesis} onChange={(e) => setUserThesis(e.target.value)}
            placeholder="Ta thèse (optionnel) — pourquoi tu trouves ça intéressant…"
            className="flex-1 bg-bg border border-edge rounded px-3 py-2 text-sm
                       text-primary placeholder-muted focus:outline-none focus:border-navy
                       resize-none h-16 transition-colors" />
        </div>
        {error && <p className="text-red-700 text-xs">{error}</p>}
        <button type="submit" disabled={loading}
          className="text-sm px-4 py-2 bg-navy hover:bg-navy-hover rounded text-white font-medium disabled:opacity-50 transition-colors">
          {loading ? "Analyse en cours…" : "→ Analyser"}
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Liste des idées */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-accent text-xs">◇</span>
            <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
              Historique ({ideas.length})
            </h2>
          </div>
          {ideas.length === 0 ? (
            <p className="text-muted text-xs">Aucune idée soumise.</p>
          ) : (
            ideas.map((idea) => (
              <button key={idea.id} onClick={() => handleSelectIdea(idea.id)}
                className={`w-full text-left rounded border p-2.5 transition-all duration-150 ${
                  selectedIdea?.idea.id === idea.id
                    ? "border-navy bg-navy/5 shadow-sm"
                    : "border-edge bg-surface hover:border-navy/30"
                }`}>
                <p className="text-sm font-mono font-bold text-navy">{idea.ticker}</p>
                <p className="text-xs text-secondary mt-0.5 truncate">{idea.name}</p>
                <p className="text-[10px] text-muted mt-1">{idea.action} · {idea.conviction}</p>
              </button>
            ))
          )}
        </div>

        {/* Détail */}
        <div className="md:col-span-2">
          {!selectedIdea ? (
            <div className="rounded-lg border border-edge bg-surface p-6 text-center shadow-sm">
              <p className="text-muted text-sm">Soumets une idée ou sélectionnes-en une pour voir l&apos;analyse.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* En-tête */}
              <div className="flex items-start justify-between">
                <div>
                  <Link href={`/company/${selectedIdea.company.ticker}`}
                    className="text-xl font-bold font-mono text-navy hover:text-navy-hover">
                    {selectedIdea.company.ticker}
                  </Link>
                  <p className="text-secondary text-sm">{selectedIdea.company.name}</p>
                </div>
                <div className="text-right text-xs text-muted">
                  <p>{new Date(selectedIdea.idea.created_at).toLocaleDateString("fr-FR")}</p>
                  {selectedIdea.idea.updated_at && (
                    <p>Révisé le {new Date(selectedIdea.idea.updated_at).toLocaleDateString("fr-FR")}</p>
                  )}
                </div>
              </div>

              {/* Thèse utilisateur */}
              {selectedIdea.idea.user_thesis && (
                <div className="rounded border border-edge bg-bg p-3">
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Ta thèse initiale</p>
                  <p className="text-sm text-primary">{selectedIdea.idea.user_thesis}</p>
                </div>
              )}

              {/* Avis système */}
              {selectedIdea.idea.system_opinion && (
                <div className="rounded border border-navy/15 bg-surface p-3 shadow-sm">
                  <p className="text-[10px] text-navy uppercase tracking-wider mb-2 font-semibold">Avis du système</p>
                  <pre className="text-xs text-primary whitespace-pre-wrap font-mono leading-relaxed">
                    {selectedIdea.idea.system_opinion}
                  </pre>
                </div>
              )}

              {/* Arguments */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {selectedIdea.idea.pro_args && (
                  <div className="rounded border border-green-200 bg-green-50 p-3">
                    <p className="text-[10px] text-green-700 uppercase tracking-wider mb-1.5 font-semibold">+ Pour</p>
                    <p className="text-xs text-green-800 whitespace-pre-wrap">{selectedIdea.idea.pro_args}</p>
                  </div>
                )}
                {selectedIdea.idea.con_args && (
                  <div className="rounded border border-red-200 bg-red-50 p-3">
                    <p className="text-[10px] text-red-700 uppercase tracking-wider mb-1.5 font-semibold">- Contre</p>
                    <p className="text-xs text-red-800 whitespace-pre-wrap">{selectedIdea.idea.con_args}</p>
                  </div>
                )}
              </div>

              {/* Conditions de validation */}
              {selectedIdea.idea.validation_conditions && (
                <div>
                  <p className="text-[10px] text-muted uppercase tracking-wider mb-1">Conditions de validation</p>
                  <p className="text-xs text-secondary whitespace-pre-wrap">{selectedIdea.idea.validation_conditions}</p>
                </div>
              )}

              {/* Révision */}
              <div>
                <button onClick={() => setShowReviseForm(!showReviseForm)}
                  className="text-xs text-navy hover:text-navy-hover font-medium transition-colors">
                  ↻ Réviser l&apos;avis (les faits ont changé)
                </button>
                {showReviseForm && (
                  <form onSubmit={handleRevise} className="mt-2 space-y-2">
                    <textarea value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)}
                      placeholder="Ce qui a changé : résultats, management, news macro…"
                      className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm
                                 text-primary placeholder-muted focus:outline-none
                                 focus:border-navy resize-none h-20 transition-colors"
                      required />
                    <button type="submit"
                      className="text-xs px-3 py-1.5 bg-navy hover:bg-navy-hover rounded text-white font-medium transition-colors">
                      Recalculer l&apos;avis
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function IdeaPage() {
  return (
    <Suspense fallback={<div className="text-muted text-sm">Chargement…</div>}>
      <IdeaPageContent />
    </Suspense>
  );
}
