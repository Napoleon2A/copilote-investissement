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

function IdeaPageContent() {
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

  useEffect(() => {
    getIdeas().then(setIdeas).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await submitIdea(ticker.trim().toUpperCase(), userThesis || undefined) as { idea: { id: number } };
      const detail = await getIdea(result.idea.id);
      setSelectedIdea(detail);
      setIdeas((prev) => [
        {
          id: result.idea.id,
          ticker: ticker.toUpperCase(),
          name: detail.company.name,
          conviction: detail.idea.conviction || undefined,
          action: detail.idea.action || undefined,
          horizon: detail.idea.horizon || undefined,
          created_at: detail.idea.created_at,
        },
        ...prev,
      ]);
      setTicker("");
      setUserThesis("");
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
    setRevisionNote("");
    setShowReviseForm(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-lg font-semibold text-slate-100">Idées</h1>
      <p className="text-sm text-slate-500">
        Soumets un ticker. Le système génère un avis argumenté, le date, et le révise si les faits changent.
      </p>

      {/* Formulaire de soumission */}
      <form
        onSubmit={handleSubmit}
        className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-4 space-y-3"
      >
        <div className="flex gap-3">
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (ex: NVDA)"
            className="bg-[#0f1117] border border-[#2a2d3a] rounded px-3 py-2 text-sm
                       text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 w-40"
            required
          />
          <textarea
            value={userThesis}
            onChange={(e) => setUserThesis(e.target.value)}
            placeholder="Ta thèse (optionnel) — pourquoi tu trouves ça intéressant..."
            className="flex-1 bg-[#0f1117] border border-[#2a2d3a] rounded px-3 py-2 text-sm
                       text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500
                       resize-none h-16"
          />
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded text-white
                     disabled:opacity-50 transition-colors"
        >
          {loading ? "Analyse en cours..." : "→ Analyser"}
        </button>
      </form>

      <div className="grid grid-cols-3 gap-4">
        {/* Liste des idées */}
        <div className="space-y-2">
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Historique ({ideas.length})
          </h2>
          {ideas.length === 0 ? (
            <p className="text-slate-700 text-xs">Aucune idée soumise.</p>
          ) : (
            ideas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => handleSelectIdea(idea.id)}
                className={`w-full text-left rounded border p-2.5 transition-colors ${
                  selectedIdea?.idea.id === idea.id
                    ? "border-indigo-500/50 bg-indigo-500/10"
                    : "border-[#2a2d3a] bg-[#1a1d27] hover:border-slate-600"
                }`}
              >
                <p className="text-sm font-mono font-bold text-indigo-300">{idea.ticker}</p>
                <p className="text-xs text-slate-500 mt-0.5 truncate">{idea.name}</p>
                <p className="text-xs text-slate-700 mt-1">
                  {idea.action} · {idea.conviction}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Détail de l'idée sélectionnée */}
        <div className="col-span-2">
          {!selectedIdea ? (
            <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-6 text-center">
              <p className="text-slate-600 text-sm">Soumets une idée ou sélectionnes-en une pour voir l&apos;analyse.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* En-tête */}
              <div className="flex items-start justify-between">
                <div>
                  <Link
                    href={`/company/${selectedIdea.company.ticker}`}
                    className="text-xl font-bold font-mono text-indigo-300 hover:text-indigo-200"
                  >
                    {selectedIdea.company.ticker}
                  </Link>
                  <p className="text-slate-400 text-sm">{selectedIdea.company.name}</p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <p>{new Date(selectedIdea.idea.created_at).toLocaleDateString("fr-FR")}</p>
                  {selectedIdea.idea.updated_at && (
                    <p>Révisé le {new Date(selectedIdea.idea.updated_at).toLocaleDateString("fr-FR")}</p>
                  )}
                </div>
              </div>

              {/* Thèse utilisateur */}
              {selectedIdea.idea.user_thesis && (
                <div className="rounded border border-[#2a2d3a] bg-[#0f1117] p-3">
                  <p className="text-xs text-slate-600 mb-1">Ta thèse initiale</p>
                  <p className="text-sm text-slate-300">{selectedIdea.idea.user_thesis}</p>
                </div>
              )}

              {/* Avis système */}
              {selectedIdea.idea.system_opinion && (
                <div className="rounded border border-indigo-500/20 bg-[#1a1d27] p-3">
                  <p className="text-xs text-indigo-500 mb-2">Avis du système</p>
                  <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                    {selectedIdea.idea.system_opinion}
                  </pre>
                </div>
              )}

              {/* Arguments */}
              <div className="grid grid-cols-2 gap-3">
                {selectedIdea.idea.pro_args && (
                  <div>
                    <p className="text-xs text-green-600 mb-1">+ Pour</p>
                    <p className="text-xs text-slate-400 whitespace-pre-wrap">
                      {selectedIdea.idea.pro_args}
                    </p>
                  </div>
                )}
                {selectedIdea.idea.con_args && (
                  <div>
                    <p className="text-xs text-red-600 mb-1">- Contre</p>
                    <p className="text-xs text-slate-400 whitespace-pre-wrap">
                      {selectedIdea.idea.con_args}
                    </p>
                  </div>
                )}
              </div>

              {/* Conditions de validation */}
              {selectedIdea.idea.validation_conditions && (
                <div>
                  <p className="text-xs text-slate-600 mb-1">Conditions de validation</p>
                  <p className="text-xs text-slate-500 whitespace-pre-wrap">
                    {selectedIdea.idea.validation_conditions}
                  </p>
                </div>
              )}

              {/* Révision */}
              <div>
                <button
                  onClick={() => setShowReviseForm(!showReviseForm)}
                  className="text-xs text-indigo-400 hover:text-indigo-300"
                >
                  ↻ Réviser l&apos;avis (les faits ont changé)
                </button>

                {showReviseForm && (
                  <form onSubmit={handleRevise} className="mt-2 space-y-2">
                    <textarea
                      value={revisionNote}
                      onChange={(e) => setRevisionNote(e.target.value)}
                      placeholder="Ce qui a changé : publication de résultats, changement de management, news macro..."
                      className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded px-3 py-2 text-sm
                                 text-slate-200 placeholder-slate-600 focus:outline-none
                                 focus:border-indigo-500 resize-none h-20"
                      required
                    />
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white"
                    >
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
    <Suspense fallback={<div className="text-slate-600 text-sm">Chargement...</div>}>
      <IdeaPageContent />
    </Suspense>
  );
}
