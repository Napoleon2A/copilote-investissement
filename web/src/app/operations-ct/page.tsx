"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getEarningsTradePrompt,
  getActiveEarningsTrades,
  importEarningsTradeResponse,
  updateEarningsTradeStatus,
  EarningsTrade,
  EarningsTradePromptResponse,
  EarningsTradeImportResult,
} from "@/lib/api";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";

export default function OperationsCTPage() {
  const [trades, setTrades] = useState<EarningsTrade[] | undefined>(undefined);
  const [prompt, setPrompt] = useState<EarningsTradePromptResponse | undefined>(undefined);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<EarningsTradeImportResult | null>(null);
  const [importing, setImporting] = useState(false);
  const [daysAhead, setDaysAhead] = useState(14);
  const [copyHint, setCopyHint] = useState<string | null>(null);

  const reload = async () => {
    const r = await getActiveEarningsTrades();
    setTrades(r.trades);
  };

  useEffect(() => {
    reload();
  }, []);

  const generatePrompt = async () => {
    const p = await getEarningsTradePrompt(daysAhead);
    setPrompt(p);
    setShowPromptModal(true);
  };

  const copyPrompt = async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.prompt);
      setCopyHint("Copié — colle-le dans claude.ai");
      setTimeout(() => setCopyHint(null), 3000);
    } catch {
      setCopyHint("Échec du copier — sélectionne et Ctrl+C manuellement");
    }
  };

  const importResponse = async () => {
    if (importText.length < 50) return;
    setImporting(true);
    try {
      const r = await importEarningsTradeResponse(importText);
      setImportResult(r);
      await reload();
    } catch (e) {
      setImportResult({ created: 0, updated: 0, skipped: 0, items: [], error: String(e) });
    } finally {
      setImporting(false);
    }
  };

  const markStatus = async (id: number, status: EarningsTrade["status"]) => {
    await updateEarningsTradeStatus(id, status);
    await reload();
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-edge/40 flex-wrap">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-amber-500 to-orange-700 rounded-full" />
          <div>
            <Link href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </Link>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Opérations court terme
            </h1>
            <p className="text-sm text-muted mt-1">
              Trade des earnings : entrer avant la publication, sortir après le bump si Claude estime un beat probable.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={daysAhead}
            onChange={(e) => setDaysAhead(Number(e.target.value))}
            className="text-xs bg-surface border border-edge rounded-md px-2 py-1.5 text-primary focus:outline-none focus:border-navy dark:focus:border-accent hover:bg-bg/50 cursor-pointer"
          >
            <option value="7">7 jours</option>
            <option value="14">14 jours</option>
            <option value="21">21 jours</option>
            <option value="30">30 jours</option>
          </select>
          <button
            onClick={generatePrompt}
            className="text-xs font-medium px-3 py-2 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
          >
            ① Générer le prompt
          </button>
          <button
            onClick={() => { setShowImportModal(true); setImportResult(null); }}
            className="text-xs font-medium px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
          >
            ② Importer la réponse
          </button>
        </div>
      </div>

      {/* Workflow help */}
      <div className="card-premium p-4 text-xs text-secondary">
        <p className="mb-1"><strong>Workflow</strong> : Génère le mégaprompt → colle dans <a href="https://claude.ai" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">claude.ai</a> → récupère la réponse → importe-la ici. Aucune exécution automatique : à toi de passer les ordres au broker.</p>
        <p className="text-muted">Privilégier les earnings dans 5-15j (au-delà : signaux trop volatils ; en-deçà : trop tard pour rentrer proprement).</p>
      </div>

      {/* Liste des trades actifs */}
      {trades === undefined && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-premium p-5 h-48 animate-pulse" />
          ))}
        </div>
      )}

      {trades && trades.length === 0 && (
        <div className="card-premium p-8 text-center">
          <p className="text-primary">Aucun earnings trade actif.</p>
          <p className="text-sm text-muted mt-1">Lance la génération du prompt ci-dessus, colle dans claude.ai, importe la réponse.</p>
        </div>
      )}

      {trades && trades.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trades.map((t) => (
            <TradeCard key={t.id} trade={t} onMarkStatus={markStatus} />
          ))}
        </div>
      )}

      {/* Prompt modal */}
      {showPromptModal && prompt && (
        <Modal onClose={() => setShowPromptModal(false)} title="Mégaprompt à coller dans claude.ai">
          <p className="text-xs text-muted mb-2">
            {prompt.candidates.length} candidats détectés (earnings dans les {prompt.days_ahead}j) — copie le bloc et colle-le dans une nouvelle conversation claude.ai.
          </p>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={copyPrompt}
              className="text-xs font-medium px-3 py-1.5 rounded bg-navy/10 dark:bg-accent/10 text-navy dark:text-accent border border-navy/30 dark:border-accent/30 hover:bg-navy/20 dark:hover:bg-accent/20 transition-colors"
            >
              📋 Copier
            </button>
            {copyHint && <span className="text-xs text-emerald-600 dark:text-emerald-400">{copyHint}</span>}
          </div>
          <textarea
            readOnly
            value={prompt.prompt}
            className="w-full h-[60vh] p-3 text-xs font-mono bg-bg border border-edge rounded text-primary"
          />
        </Modal>
      )}

      {/* Import modal */}
      {showImportModal && (
        <Modal onClose={() => setShowImportModal(false)} title="Coller la réponse claude.ai">
          {!importResult && (
            <>
              <p className="text-xs text-muted mb-2">
                Colle la réponse complète de claude.ai (sections "## TICKER — Nom" attendues).
              </p>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Colle ici la réponse de claude.ai..."
                className="w-full h-[50vh] p-3 text-xs font-mono bg-surface border border-edge rounded text-primary focus:outline-none focus:border-navy dark:focus:border-accent"
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => { setShowImportModal(false); setImportText(""); }}
                  className="text-xs font-medium px-3 py-1.5 rounded border border-edge text-muted hover:bg-bg/50"
                >
                  Annuler
                </button>
                <button
                  onClick={importResponse}
                  disabled={importing || importText.length < 50}
                  className="text-xs font-medium px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 disabled:opacity-50"
                >
                  {importing ? "Import..." : "Importer"}
                </button>
              </div>
            </>
          )}
          {importResult && (
            <div className="text-xs text-secondary space-y-2">
              {importResult.error && <p className="text-red-600 dark:text-red-400">Erreur : {importResult.error}</p>}
              {importResult.warning && <p className="text-amber-600 dark:text-amber-400">{importResult.warning}</p>}
              <p>
                <strong className="text-emerald-600 dark:text-emerald-400">{importResult.created} créés</strong>
                {" · "}<strong className="text-blue-600 dark:text-blue-400">{importResult.updated} mis à jour</strong>
                {" · "}<strong className="text-muted">{importResult.skipped} ignorés</strong>
              </p>
              <ul className="text-[0.7rem] space-y-0.5">
                {importResult.items.map((it, i) => (
                  <li key={i} className="flex justify-between border-b border-edge/30 pb-0.5">
                    <span className="font-mono">{it.ticker}</span>
                    <span className="text-muted">{it.status}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => { setShowImportModal(false); setImportText(""); setImportResult(null); }}
                  className="text-xs font-medium px-3 py-1.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20"
                >
                  OK
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function TradeCard({ trade, onMarkStatus }: { trade: EarningsTrade; onMarkStatus: (id: number, status: EarningsTrade["status"]) => void }) {
  const meta = getTickerMeta(trade.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const isImminent = trade.days_until_earnings <= 3;
  const convStyle = trade.claude_conviction === "élevé"
    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40"
    : trade.claude_conviction === "moyen"
    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
    : "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30";

  return (
    <div className="card-premium card-aura p-4 flex flex-col gap-2.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          {sectorStyle && sector && (
            <span className={`text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
              {SECTOR_LABEL[sector]}
            </span>
          )}
          <span className={`text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${convStyle}`}>
            Conv. {trade.claude_conviction}
          </span>
          {isImminent && (
            <span className="text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30">
              ⚡ J-{trade.days_until_earnings}
            </span>
          )}
        </div>
        <span className="text-[0.6rem] uppercase tracking-widest text-muted">{trade.status}</span>
      </div>

      {/* Logo + nom + earnings date */}
      <Link href={`/company/${trade.ticker}`} className="flex items-center gap-3">
        <TickerBadge ticker={trade.ticker} size="md" showName={false} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-primary leading-tight truncate"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {meta.name || trade.ticker}
          </h3>
          <p className="text-xs text-muted">
            Earnings le {trade.earnings_date}
            {trade.days_until_earnings > 0 ? ` · J-${trade.days_until_earnings}` : " · aujourd'hui"}
          </p>
          {meta.activity && (
            <p className="text-[0.7rem] text-secondary line-clamp-1 mt-0.5">{meta.activity}</p>
          )}
        </div>
      </Link>

      {/* Targets */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <PriceCell label="Achat" value={trade.target_buy_price} tone="bull" />
        <PriceCell label="Vente" value={trade.target_sell_price} tone="emerald" />
        <PriceCell label="Stop" value={trade.stop_loss_price} tone="bear" />
      </div>

      {/* Expected surprise */}
      {trade.expected_surprise_pct != null && (
        <div className="text-[0.7rem] text-secondary">
          Beat attendu :{" "}
          <span className={`font-mono font-bold ${trade.expected_surprise_pct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
            {trade.expected_surprise_pct >= 0 ? "+" : ""}{trade.expected_surprise_pct.toFixed(1)}% vs consensus
          </span>
        </div>
      )}

      {/* Signals */}
      {trade.key_signals.length > 0 && (
        <ul className="space-y-0.5 flex-1">
          {trade.key_signals.slice(0, 3).map((s, i) => (
            <li key={i} className="text-[0.7rem] text-secondary leading-snug flex items-start gap-1.5">
              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">▸</span>
              <span className="line-clamp-2">{s}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Rationale */}
      {trade.rationale && (
        <details className="text-[0.7rem] text-secondary">
          <summary className="cursor-pointer font-semibold text-muted hover:text-secondary">Rationale</summary>
          <p className="mt-1 leading-relaxed">{trade.rationale}</p>
        </details>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 pt-2 border-t border-edge/40 flex-wrap">
        {trade.status === "pending" && (
          <button onClick={() => onMarkStatus(trade.id, "triggered")}
            className="text-[0.65rem] px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
            ✓ Acheté
          </button>
        )}
        {trade.status === "triggered" && (
          <>
            <button onClick={() => onMarkStatus(trade.id, "closed_win")}
              className="text-[0.65rem] px-2 py-1 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20">
              ✓ Vendu (gain)
            </button>
            <button onClick={() => onMarkStatus(trade.id, "closed_loss")}
              className="text-[0.65rem] px-2 py-1 rounded bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/30 hover:bg-red-500/20">
              ✗ Vendu (perte)
            </button>
          </>
        )}
        {trade.status === "pending" && (
          <button onClick={() => onMarkStatus(trade.id, "missed")}
            className="text-[0.65rem] px-2 py-1 rounded bg-muted/10 text-muted border border-muted/30 hover:bg-muted/20">
            Skip / raté
          </button>
        )}
      </div>
    </div>
  );
}

function PriceCell({ label, value, tone }: { label: string; value: number | null; tone: "bull" | "emerald" | "bear" }) {
  const cls = tone === "bull"
    ? "text-emerald-700 dark:text-emerald-400"
    : tone === "emerald"
    ? "text-emerald-700 dark:text-emerald-400"
    : "text-red-700 dark:text-red-400";
  return (
    <div className="bg-bg/40 rounded p-1.5">
      <p className="text-[0.55rem] uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-xs font-bold font-mono ${cls}`}>
        {value != null ? `${value.toFixed(2)}$` : "—"}
      </p>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-xl border border-edge max-w-3xl w-full p-5 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-primary">{title}</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-primary text-2xl leading-none"
          >×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
