/**
 * Page Portefeuille — /portfolio
 * Positions, P&L, exposition sectorielle, transactions.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getPositions, addTransaction, deletePosition,
  calculatePositionSize, getStopLoss,
} from "@/lib/api";
import type {
  PortfolioData, PositionSizeResult, StopLossResult,
} from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useToast } from "@/components/ui/Toast";

export default function PortfolioPage() {
  useDocumentTitle("Portefeuille");
  const { toast } = useToast();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "", type: "buy" as "buy" | "sell",
    quantity: "", price: "", fees: "", note: "",
  });
  const [formError, setFormError] = useState("");
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);

  const handleDelete = async (ticker: string) => {
    if (!confirm(`Supprimer la position ${ticker} ?`)) return;
    setDeletingTicker(ticker);
    try {
      await deletePosition(ticker);
      toast(`Position ${ticker} supprimée`, "success");
      loadData();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erreur lors de la suppression", "error");
    } finally {
      setDeletingTicker(null);
    }
  };

  const loadData = () => {
    setLoading(true);
    getPositions().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    try {
      await addTransaction({
        ticker: form.ticker.toUpperCase(),
        type: form.type,
        quantity: parseFloat(form.quantity),
        price: parseFloat(form.price),
        fees: form.fees ? parseFloat(form.fees) : 0,
        note: form.note || undefined,
      });
      toast(`Transaction ${form.type === "buy" ? "achat" : "vente"} ${form.ticker.toUpperCase()} enregistrée`, "success");
      setShowForm(false);
      setForm({ ticker: "", type: "buy", quantity: "", price: "", fees: "", note: "" });
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (loading) return <p className="text-secondary text-sm">Chargement…</p>;
  if (!data) return <p className="text-red-600 text-sm">Impossible de charger le portefeuille. Vérifiez que le backend est démarré.</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-primary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Portefeuille
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-navy hover:bg-navy-hover rounded text-white transition-colors font-medium"
        >
          + Transaction
        </button>
      </div>

      {/* Formulaire transaction */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-navy/20 bg-surface p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-navy">Nouvelle transaction</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Ticker" required>
              <input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                placeholder="AAPL" className={inputClass} required />
            </Field>
            <Field label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
                className={inputClass}>
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
              </select>
            </Field>
            <Field label="Quantité" required>
              <input type="number" step="any" value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })} className={inputClass} required />
            </Field>
            <Field label="Prix unitaire" required>
              <input type="number" step="any" value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })} className={inputClass} required />
            </Field>
            <Field label="Frais">
              <input type="number" step="any" value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })} placeholder="0" className={inputClass} />
            </Field>
            <Field label="Note">
              <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Optionnel" className={inputClass} />
            </Field>
          </div>
          {formError && <p className="text-red-700 text-xs">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" className="text-sm px-4 py-1.5 bg-navy hover:bg-navy-hover rounded text-white font-medium transition-colors">
              Enregistrer
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm px-4 py-1.5 border border-edge rounded text-secondary hover:border-navy/30 transition-colors">
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Résumé global */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { label: "Valeur totale",
              value: `${data.total_value?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}`,
              color: "text-primary" },
            { label: "P&L total",
              value: data.total_pnl != null
                ? `${data.total_pnl > 0 ? "+" : ""}${data.total_pnl.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}`
                : "—",
              color: data.total_pnl != null ? (data.total_pnl > 0 ? "text-green-700" : "text-red-700") : "text-muted" },
            { label: "P&L %",
              value: data.total_pnl_pct != null
                ? `${data.total_pnl_pct > 0 ? "+" : ""}${data.total_pnl_pct.toFixed(2)}%`
                : "—",
              color: data.total_pnl_pct != null ? (data.total_pnl_pct > 0 ? "text-green-700" : "text-red-700") : "text-muted" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-edge bg-surface p-3 shadow-sm">
              <p className="text-[10px] text-muted uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-sm font-mono font-semibold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tableau des positions */}
      {data && data.positions.length > 0 ? (
        <div className="rounded-lg border border-edge overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-edge bg-bg">
                {["Ticker", "Qté", "P. moyen", "Cours", "Valeur", "P&L", "P&L %", "Auj.", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos) => (
                <tr key={pos.ticker} className="border-b border-edge bg-surface hover:bg-bg transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${pos.ticker}`} className="font-mono font-bold text-navy hover:text-navy-hover">
                      {pos.ticker}
                    </Link>
                    {pos.sector && <p className="text-[10px] text-muted">{pos.sector}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-secondary">{pos.quantity}</td>
                  <td className="px-4 py-2.5 font-mono text-secondary">{pos.avg_cost.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono text-primary font-medium">{pos.current_price?.toFixed(2) ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-primary">
                    {pos.market_value?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {pos.pnl != null ? (
                      <span className={`font-mono font-medium ${pos.pnl >= 0 ? "text-green-700" : "text-red-700"}`}>
                        {pos.pnl > 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5"><ChangeCell value={pos.pnl_pct} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={pos.change_1d} /></td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => handleDelete(pos.ticker)} disabled={deletingTicker === pos.ticker}
                      className="text-xs text-muted hover:text-red-700 transition-colors disabled:opacity-40"
                      title="Supprimer la position">
                      {deletingTicker === pos.ticker ? "…" : "✕"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">Aucune position. Clique sur &quot;+ Transaction&quot; pour commencer.</p>
        </div>
      )}

      {/* Exposition sectorielle */}
      {data && Object.keys(data.sector_exposure).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-xs">▣</span>
            <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">Exposition sectorielle</h2>
            <div className="flex-1 h-px bg-edge" />
          </div>
          <div className="space-y-2">
            {Object.entries(data.sector_exposure).map(([sector, info]) => (
              <div key={sector} className="flex items-center gap-3">
                <span className="text-xs text-secondary w-28 sm:w-44 truncate">{sector}</span>
                <div className="flex-1 bg-surface-alt rounded-full h-1.5">
                  <div className="bg-navy h-1.5 rounded-full transition-all" style={{ width: `${info.weight}%` }} />
                </div>
                <span className="text-xs font-mono text-secondary w-10 text-right">{info.weight.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calculateur de risque */}
      <RiskCalculator portfolioValue={data?.total_value} />
    </div>
  );
}

const inputClass =
  "w-full bg-bg border border-edge rounded px-2.5 py-1.5 text-sm " +
  "text-primary placeholder-muted focus:outline-none focus:border-navy transition-colors";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-muted uppercase tracking-wider mb-1 block font-medium">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

/* ── Calculateur de risque ─────────────────────────────────────────────────── */

function RiskCalculator({ portfolioValue }: { portfolioValue?: number }) {
  const [open, setOpen] = useState(false);

  // Position sizing state
  const [psForm, setPsForm] = useState({
    portfolio_value: "",
    risk_pct: "1",
    entry_price: "",
    stop_price: "",
  });
  const [psResult, setPsResult] = useState<PositionSizeResult | null>(null);
  const [psLoading, setPsLoading] = useState(false);
  const [psError, setPsError] = useState("");

  // Stop-loss state
  const [slTicker, setSlTicker] = useState("");
  const [slResult, setSlResult] = useState<StopLossResult | null>(null);
  const [slLoading, setSlLoading] = useState(false);
  const [slError, setSlError] = useState("");

  // Pre-fill portfolio value when data is available and form is empty
  useEffect(() => {
    if (portfolioValue && !psForm.portfolio_value) {
      setPsForm((prev) => ({ ...prev, portfolio_value: portfolioValue.toFixed(2) }));
    }
  }, [portfolioValue]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePositionSize = async (e: React.FormEvent) => {
    e.preventDefault();
    setPsError("");
    setPsResult(null);
    setPsLoading(true);
    try {
      const result = await calculatePositionSize({
        portfolio_value: parseFloat(psForm.portfolio_value),
        risk_pct: parseFloat(psForm.risk_pct),
        entry_price: parseFloat(psForm.entry_price),
        stop_price: parseFloat(psForm.stop_price),
      });
      setPsResult(result);
    } catch (err: unknown) {
      setPsError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setPsLoading(false);
    }
  };

  const handleStopLoss = async (e: React.FormEvent) => {
    e.preventDefault();
    setSlError("");
    setSlResult(null);
    if (!slTicker.trim()) return;
    setSlLoading(true);
    try {
      const result = await getStopLoss(slTicker.trim().toUpperCase());
      setSlResult(result);
    } catch (err: unknown) {
      setSlError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSlLoading(false);
    }
  };

  return (
    <div>
      {/* Header — toggle */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full group"
      >
        <span className="text-accent text-xs">◆</span>
        <h2 className="text-[10px] font-semibold text-muted uppercase tracking-widest">
          Calculateur de risque
        </h2>
        <div className="flex-1 h-px bg-edge" />
        <span className="text-muted text-xs transition-transform group-hover:text-secondary">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* ── Position Sizing ───────────────────────────────────── */}
          <div className="rounded-lg border border-edge bg-surface p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-navy">Position sizing</h3>
            <form onSubmit={handlePositionSize} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Valeur portefeuille" required>
                  <input
                    type="number" step="any"
                    value={psForm.portfolio_value}
                    onChange={(e) => setPsForm({ ...psForm, portfolio_value: e.target.value })}
                    className={inputClass} required
                  />
                </Field>
                <Field label="Risque %" required>
                  <input
                    type="number" step="any" min="0.1" max="100"
                    value={psForm.risk_pct}
                    onChange={(e) => setPsForm({ ...psForm, risk_pct: e.target.value })}
                    className={inputClass} required
                  />
                </Field>
                <Field label="Prix d'entrée" required>
                  <input
                    type="number" step="any"
                    value={psForm.entry_price}
                    onChange={(e) => setPsForm({ ...psForm, entry_price: e.target.value })}
                    className={inputClass} required
                  />
                </Field>
                <Field label="Prix stop-loss" required>
                  <input
                    type="number" step="any"
                    value={psForm.stop_price}
                    onChange={(e) => setPsForm({ ...psForm, stop_price: e.target.value })}
                    className={inputClass} required
                  />
                </Field>
              </div>
              <button
                type="submit" disabled={psLoading}
                className="text-sm px-4 py-1.5 bg-navy hover:bg-navy-hover rounded text-white font-medium transition-colors disabled:opacity-50"
              >
                {psLoading ? "Calcul…" : "Calculer"}
              </button>
            </form>

            {psError && <p className="text-red-700 text-xs">{psError}</p>}

            {psResult && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-edge">
                {[
                  { label: "Actions à acheter", value: psResult.shares.toString(), bold: true },
                  { label: "Risque en $", value: `$${psResult.dollar_risk.toFixed(2)}` },
                  { label: "Valeur position", value: `$${psResult.position_value.toLocaleString("fr-FR", { minimumFractionDigits: 2 })}` },
                  { label: "% du portefeuille", value: `${psResult.pct_of_portfolio.toFixed(1)}%` },
                ].map(({ label, value, bold }) => (
                  <div key={label} className="py-1">
                    <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
                    <p className={`text-sm font-mono ${bold ? "font-bold text-navy" : "text-primary"}`}>
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Stop-Loss ────────────────────────────────────────── */}
          <div className="rounded-lg border border-edge bg-surface p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-semibold text-navy">Niveaux de stop-loss</h3>
            <form onSubmit={handleStopLoss} className="flex gap-2">
              <input
                value={slTicker}
                onChange={(e) => setSlTicker(e.target.value)}
                placeholder="AAPL"
                className={inputClass + " flex-1"}
                required
              />
              <button
                type="submit" disabled={slLoading}
                className="text-sm px-4 py-1.5 bg-navy hover:bg-navy-hover rounded text-white font-medium transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {slLoading ? "…" : "Analyser"}
              </button>
            </form>

            {slError && <p className="text-red-700 text-xs">{slError}</p>}

            {slResult && (
              <div className="space-y-3 pt-2 border-t border-edge">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-mono font-bold text-navy">{slResult.ticker}</span>
                  <span className="text-sm font-mono text-primary">${slResult.current_price.toFixed(2)}</span>
                </div>
                <p className="text-[10px] text-muted">
                  Amplitude 52 sem. : {slResult.amplitude_52w_pct.toFixed(1)}%
                </p>
                <div className="space-y-2">
                  {(["tight", "moderate", "wide"] as const).map((level) => {
                    const stop = slResult.stops[level];
                    const colorMap = { tight: "text-red-700", moderate: "text-amber-600", wide: "text-green-700" };
                    return (
                      <div key={level} className="flex items-center justify-between rounded bg-surface-alt px-3 py-2">
                        <div>
                          <span className="text-xs font-medium text-secondary">{stop.label}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-mono font-medium text-primary">${stop.price.toFixed(2)}</span>
                          <span className={`text-xs font-mono ml-2 ${colorMap[level]}`}>
                            {stop.pct_from_entry.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
