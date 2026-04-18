/**
 * Page Recherche & Idées — /idea
 *
 * Fusion de l'ancien onglet "Recherche" et "Idée" :
 * 1. Chercher un ticker → aperçu inline (CompanyPreview)
 * 2. Soumettre comme idée → le système génère un avis daté et révisable
 * 3. Historique des idées à gauche
 * 4. Recherches récentes (localStorage)
 */
"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getIdeas, submitIdea, getIdea, reviseIdea, getCompanyBrief } from "@/lib/api";
import type { IdeaSummary, IdeaDetail, CompanyBrief } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { CompanyPreview } from "@/components/idea/CompanyPreview";

// Recherches récentes stockées en localStorage
type RecentSearch = { ticker: string; name: string; date: string };

function getRecentSearches(): RecentSearch[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem("recent_searches") || "[]"); }
  catch { return []; }
}
function addRecentSearch(ticker: string, name: string) {
  const list = getRecentSearches().filter((s) => s.ticker !== ticker);
  list.unshift({ ticker, name, date: new Date().toISOString() });
  localStorage.setItem("recent_searches", JSON.stringify(list.slice(0, 10)));
}

function IdeaPageContent() {
  useDocumentTitle("Recherche");
  const searchParams = useSearchParams();
  const prefillTicker = searchParams.get("ticker") || "";

  // États
  const [ideas, setIdeas] = useState<IdeaSummary[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<IdeaDetail | null>(null);
  const [ticker, setTicker] = useState(prefillTicker);
  const [userThesis, setUserThesis] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revisionNote, setRevisionNote] = useState("");
  const [showReviseForm, setShowReviseForm] = useState(false);

  // Mode aperçu : afficher le company brief inline avant de soumettre
  const [preview, setPreview] = useState<CompanyBrief | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>([]);
  // "preview" = aperçu en cours, "idea" = idée sélectionnée
  const [mode, setMode] = useState<"preview" | "idea">("preview");

  useEffect(() => { getIdeas().then(setIdeas).catch(() => {}); }, []);
  useEffect(() => { setRecentSearches(getRecentSearches()); }, []);

  // Rechercher un ticker → afficher l'aperçu
  const handleSearch = useCallback(async (searchTicker?: string) => {
    const t = (searchTicker || ticker).trim().toUpperCase();
    if (!t) return;
    setPreviewLoading(true);
    setError("");
    setPreview(null);
    setSelectedIdea(null);
    setMode("preview");
    try {
      const brief = await getCompanyBrief(t);
      setPreview(brief);
      addRecentSearch(t, brief.name || t);
      setRecentSearches(getRecentSearches());
      setTicker(t);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Ticker "${t}" introuvable`);
    } finally {
      setPreviewLoading(false);
    }
  }, [ticker]);

  // Soumettre comme idée
  const handleSubmitIdea = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setError("");
    try {
      const result = await submitIdea(ticker.trim().toUpperCase(), userThesis || undefined) as { idea: { id: number } };
      const detail = await getIdea(result.idea.id);
      setSelectedIdea(detail);
      setMode("idea");
      setPreview(null);
      setIdeas((prev) => [{
        id: result.idea.id, ticker: ticker.toUpperCase(), name: detail.company.name,
        conviction: detail.idea.conviction || undefined, action: detail.idea.action || undefined,
        horizon: detail.idea.horizon || undefined, created_at: detail.idea.created_at,
      }, ...prev]);
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
    setPreview(null);
    setMode("idea");
  };

  const handleRevise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedIdea || !revisionNote.trim()) return;
    const result = await reviseIdea(selectedIdea.idea.id, revisionNote);
    setSelectedIdea(result as unknown as IdeaDetail);
    setRevisionNote("");
    setShowReviseForm(false);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSearch();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-primary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Recherche & Idées
        </h1>
        <p className="text-xs text-muted mt-0.5">
          Tape un ticker pour voir l&apos;analyse, puis soumets-le comme idée pour le suivre.
        </p>
      </div>

      {/* Barre de recherche */}
      <form onSubmit={handleSearchSubmit} className="rounded-lg border border-edge bg-surface p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-3">
          <input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker (ex: NVDA, AAPL, MC.PA)"
            className="bg-bg border border-edge rounded px-3 py-2 text-sm
                       text-primary placeholder-muted focus:outline-none focus:border-navy
                       w-full sm:w-44 transition-colors font-mono"
            required />
          <button type="submit" disabled={previewLoading}
            className="text-sm px-4 py-2 bg-navy hover:bg-navy-hover rounded text-white font-medium
                       disabled:opacity-50 transition-colors flex-shrink-0">
            {previewLoading ? "Analyse…" : "Analyser"}
          </button>
          {preview && (
            <button type="button" onClick={handleSubmitIdea} disabled={loading}
              className="text-sm px-4 py-2 border border-navy text-navy hover:bg-navy hover:text-white
                         rounded font-medium disabled:opacity-50 transition-colors flex-shrink-0">
              {loading ? "Soumission…" : "Soumettre comme idée"}
            </button>
          )}
        </div>
        {preview && (
          <div className="mt-3">
            <textarea value={userThesis} onChange={(e) => setUserThesis(e.target.value)}
              placeholder="Ta thèse (optionnel) — pourquoi tu trouves ça intéressant…"
              className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm
                         text-primary placeholder-muted focus:outline-none focus:border-navy
                         resize-none h-14 transition-colors" />
          </div>
        )}
        {error && <p className="text-red-700 text-xs mt-2">{error}</p>}
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Colonne gauche — Historique */}
        <div className="lg:col-span-1 space-y-4">
          {/* Recherches récentes */}
          {recentSearches.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-accent text-xs">⊕</span>
                <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                  Recherches récentes
                </h2>
              </div>
              <div className="flex flex-wrap lg:flex-col gap-1.5">
                {recentSearches.map((s) => (
                  <button key={s.ticker} onClick={() => { setTicker(s.ticker); handleSearch(s.ticker); }}
                    className="text-left rounded border border-edge bg-surface px-2.5 py-1.5
                               hover:border-navy/30 transition-all text-xs">
                    <span className="font-mono font-bold text-navy">{s.ticker}</span>
                    <span className="text-muted ml-1.5 truncate">{s.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Idées soumises */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-accent text-xs">◇</span>
              <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
                Idées ({ideas.length})
              </h2>
            </div>
            {ideas.length === 0 ? (
              <p className="text-muted text-xs">Aucune idée soumise.</p>
            ) : (
              <div className="space-y-1.5">
                {ideas.map((idea) => (
                  <button key={idea.id} onClick={() => handleSelectIdea(idea.id)}
                    className={`w-full text-left rounded border p-2.5 transition-all duration-150 ${
                      mode === "idea" && selectedIdea?.idea.id === idea.id
                        ? "border-navy bg-navy/5 shadow-sm"
                        : "border-edge bg-surface hover:border-navy/30"
                    }`}>
                    <p className="text-sm font-mono font-bold text-navy">{idea.ticker}</p>
                    <p className="text-xs text-secondary mt-0.5 truncate">{idea.name}</p>
                    <p className="text-[10px] text-muted mt-1">{idea.action} · {idea.conviction}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Colonne droite — Contenu principal */}
        <div className="lg:col-span-3">
          {/* Chargement aperçu */}
          {previewLoading && (
            <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
              <p className="text-secondary text-sm">Analyse en cours…</p>
              <p className="text-muted text-xs mt-1">Récupération des données et calcul des scores</p>
            </div>
          )}

          {/* Aperçu Company Brief inline */}
          {mode === "preview" && preview && !previewLoading && (
            <CompanyPreview brief={preview} />
          )}

          {/* Idée sélectionnée */}
          {mode === "idea" && selectedIdea && (
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

          {/* État vide */}
          {!preview && !selectedIdea && !previewLoading && (
            <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
              <p className="text-muted text-sm">
                Tape un ticker ci-dessus pour voir l&apos;analyse, ou sélectionne une idée dans l&apos;historique.
              </p>
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
