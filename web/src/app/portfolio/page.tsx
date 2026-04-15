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
      loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Erreur");
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
      setShowForm(false);
      setForm({ ticker: "", type: "buy", quantity: "", price: "", fees: "", note: "" });
      loadData();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Erreur");
    }
  };

  if (loading) return <p className="text-[#2D4A5C] text-sm">Chargement…</p>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold text-[#0B1929]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
          Portefeuille
        </h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs px-3 py-1.5 bg-[#1E3A5F] hover:bg-[#162d4a] rounded text-white transition-colors font-medium"
        >
          + Transaction
        </button>
      </div>

      {/* Formulaire transaction */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-lg border border-[#1E3A5F]/20 bg-white p-5 space-y-4 shadow-sm">
          <h2 className="text-sm font-semibold text-[#1E3A5F]">Nouvelle transaction</h2>
          <div className="grid grid-cols-2 gap-3">
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
            <button type="submit" className="text-sm px-4 py-1.5 bg-[#1E3A5F] hover:bg-[#162d4a] rounded text-white font-medium transition-colors">
              Enregistrer
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="text-sm px-4 py-1.5 border border-[#BFD0DC] rounded text-[#2D4A5C] hover:border-[#1E3A5F]/30 transition-colors">
              Annuler
            </button>
          </div>
        </form>
      )}

      {/* Résumé global */}
      {data && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Valeur totale",
              value: `${data.total_value?.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}`,
              color: "text-[#0B1929]" },
            { label: "P&L total",
              value: data.total_pnl != null
                ? `${data.total_pnl > 0 ? "+" : ""}${data.total_pnl.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} ${data.currency}`
                : "—",
              color: data.total_pnl != null ? (data.total_pnl > 0 ? "text-green-700" : "text-red-700") : "text-[#7898AC]" },
            { label: "P&L %",
              value: data.total_pnl_pct != null
                ? `${data.total_pnl_pct > 0 ? "+" : ""}${data.total_pnl_pct.toFixed(2)}%`
                : "—",
              color: data.total_pnl_pct != null ? (data.total_pnl_pct > 0 ? "text-green-700" : "text-red-700") : "text-[#7898AC]" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-lg border border-[#BFD0DC] bg-white p-3 shadow-sm">
              <p className="text-[10px] text-[#7898AC] uppercase tracking-widest mb-1">{label}</p>
              <p className={`text-sm font-mono font-semibold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tableau des positions */}
      {data && data.positions.length > 0 ? (
        <div className="rounded-lg border border-[#BFD0DC] overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#BFD0DC] bg-[#EEF2F6]">
                {["Ticker", "Qté", "P. moyen", "Cours", "Valeur", "P&L", "P&L %", "Auj.", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.positions.map((pos) => (
                <tr key={pos.ticker} className="border-b border-[#BFD0DC] bg-white hover:bg-[#EEF2F6] transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${pos.ticker}`} className="font-mono font-bold text-[#1E3A5F] hover:text-[#162d4a]">
                      {pos.ticker}
                    </Link>
                    {pos.sector && <p className="text-[10px] text-[#7898AC]">{pos.sector}</p>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[#2D4A5C]">{pos.quantity}</td>
                  <td className="px-4 py-2.5 font-mono text-[#2D4A5C]">{pos.avg_cost.toFixed(2)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#0B1929] font-medium">{pos.current_price?.toFixed(2) ?? "—"}</td>
                  <td className="px-4 py-2.5 font-mono text-[#0B1929]">
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
                      className="text-xs text-[#7898AC] hover:text-red-700 transition-colors disabled:opacity-40"
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
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-8 text-center shadow-sm">
          <p className="text-[#2D4A5C] text-sm">Aucune position. Clique sur &quot;+ Transaction&quot; pour commencer.</p>
        </div>
      )}

      {/* Exposition sectorielle */}
      {data && Object.keys(data.sector_exposure).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#5E96B0] text-xs">▣</span>
            <h2 className="text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest">Exposition sectorielle</h2>
            <div className="flex-1 h-px bg-[#BFD0DC]" />
          </div>
          <div className="space-y-2">
            {Object.entries(data.sector_exposure).map(([sector, info]) => (
              <div key={sector} className="flex items-center gap-3">
                <span className="text-xs text-[#2D4A5C] w-44 truncate">{sector}</span>
                <div className="flex-1 bg-[#E2EAF0] rounded-full h-1.5">
                  <div className="bg-[#1E3A5F] h-1.5 rounded-full transition-all" style={{ width: `${info.weight}%` }} />
                </div>
                <span className="text-xs font-mono text-[#2D4A5C] w-10 text-right">{info.weight.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full bg-[#EEF2F6] border border-[#BFD0DC] rounded px-2.5 py-1.5 text-sm " +
  "text-[#0B1929] placeholder-[#7898AC] focus:outline-none focus:border-[#1E3A5F] transition-colors";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] text-[#7898AC] uppercase tracking-wider mb-1 block font-medium">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
