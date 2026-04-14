/**
 * Page Portefeuille — /portfolio
 * Positions, P&L, exposition sectorielle, transactions.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getPositions, addTransaction, deletePosition } from "@/lib/api";
import type { PortfolioData } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";

export default function PortfolioPage() {
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "",
    type: "buy" as "buy" | "sell",
    quantity: "",
    price: "",
    fees: "",
    note: "",
  });
  const [formError, setFormError] = useState("");
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);

  const handleDelete = async (ticker: string) => {
    if (!confirm(`Supprimer la position ${ticker} ? Cette action est irréversible.`)) return;
    setDeletingTicker(ticker);
    try {
      await deletePosition(ticker);
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur lors de la suppression");
    } finally {
      setDeletingTicker(null);
    }
  };

  const loadData = () => {
    setLoading(true);
    getPositions()
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
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
      setShowForm(false);
      setForm({ ticker: "", type: "buy", quantity: "", price: "", fees: "", note: "" });
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (loading) return <p className="text-slate-600 text-sm">Chargement...</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-slate-100">Portefeuille</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
        >
          + Transaction
        </button>
      </div>

      {/* Formulaire transaction */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-indigo-500/30 bg-[#1a1d27] p-4 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ticker" required>
              <input
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                placeholder="AAPL"
                className={inputClass}
                required
              />
            </Field>
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
                className={inputClass}
              >
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
              </select>
            </Field>
            <Field label="Quantité" required>
              <input
                type="number"
                step="any"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Prix">
              <input
                type="number"
                step="any"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Frais">
              <input
                type="number"
                step="any"
                value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })}
                placeholder="0"
                className={inputClass}
              />
            </Field>
            <Field label="Note">
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                placeholder="Optionnel"
                className={inputClass}
              />
            </Field>
          </div>
          {formError && <p className="text-red-400 text-xs">{formError}</p>}
          <div className="flex gap-2">
            <button type="submit" className="text-sm px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white">
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm px-4 py-1.5 border border-[#2a2d3a] rounded text-slate-400 hover:text-slate-200"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Résumé global */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Valeur totale", value: `${data.total_value?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}` },
            {
              label: "P&L total",
              value: data.total_pnl != null
                ? `${data.total_pnl > 0 ? "+" : ""}${data.total_pnl.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}`
                : "—",
              color: data.total_pnl != null
                ? data.total_pnl > 0 ? "text-green-400" : "text-red-400"
                : "text-slate-400",
            },
            {
              label: "P&L %",
              value: data.total_pnl_pct != null ? `${data.total_pnl_pct > 0 ? "+" : ""}${data.total_pnl_pct.toFixed(2)}%` : "—",
              color: data.total_pnl_pct != null
                ? data.total_pnl_pct > 0 ? "text-green-400" : "text-red-400"
                : "text-slate-400",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-3">
              <p className="text-xs text-slate-600 mb-1">{label}</p>
              <p className={`text-sm font-mono font-semibold ${color || "text-slate-200"}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tableau des positions */}
      {data && data.positions.length > 0 ? (
        <div className="rounded-lg border border-[#2a2d3a] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2d3a] bg-[#1a1d27]">
                {["Ticker", "Qté", "P. moyen", "Cours", "Valeur", "P&L", "P&L %", "Auj.", ""].map((h) => (
                  <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos) => (
                <tr key={pos.ticker} className="border-b border-[#2a2d3a] bg-[#0f1117] hover:bg-[#1a1d27]">
                  <td className="px-4 py-2.5">
                    <div>
                      <Link href={`/company/${pos.ticker}`} className="font-mono font-bold text-indigo-300 hover:text-indigo-200">
                        {pos.ticker}
                      </Link>
                      {pos.sector && <p className="text-xs text-slate-600">{pos.sector}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">{pos.quantity}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-400">{pos.avg_cost.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {pos.current_price?.toFixed(2) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {pos.market_value?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {pos.pnl != null ? (
                      <span className={pos.pnl >= 0 ? "text-green-400 font-mono" : "text-red-400 font-mono"}>
                        {pos.pnl > 0 ? "+" : ""}{pos.pnl.toFixed(2)}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <ChangeCell value={pos.pnl_pct} />
                  </td>
                  <td className="px-4 py-2.5">
                    <ChangeCell value={pos.change_1d} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(pos.ticker)}
                      disabled={deletingTicker === pos.ticker}
                      className="text-xs text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      title="Supprimer la position"
                    >
                      {deletingTicker === pos.ticker ? "…" : "✕"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-8 text-center">
          <p className="text-slate-500 text-sm">Aucune position. Clique sur &quot;+ Transaction&quot; pour commencer.</p>
        </div>
      )}

      {/* Exposition sectorielle */}
      {data && Object.keys(data.sector_exposure).length > 0 && (
        <div>
          <h2 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">Exposition sectorielle</h2>
          <div className="space-y-1.5">
            {Object.entries(data.sector_exposure).map(([sector, info]) => (
              <div key={sector} className="flex items-center gap-3">
                <span className="text-xs text-slate-400 w-40 truncate">{sector}</span>
                <div className="flex-1 bg-[#2a2d3a] rounded-full h-1.5">
                  <div
                    className="bg-indigo-500 h-1.5 rounded-full"
                    style={{ width: `${info.weight}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-slate-500 w-10 text-right">
                  {info.weight.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full bg-[#0f1117] border border-[#2a2d3a] rounded px-2 py-1.5 text-sm " +
  "text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-slate-500 mb-1 block">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
