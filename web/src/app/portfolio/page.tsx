"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TickerBadge } from "@/components/ui/TickerBadge";
import { Sparkline } from "@/components/ui/Sparkline";
import { getTickerMeta, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";
import {
  getPositions, addTransaction, deletePosition,
} from "@/lib/api";
import type { PortfolioData } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

export default function PortfolioPage() {
  const { toast } = useToast();
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    ticker: "", type: "buy" as "buy" | "sell",
    quantity: "", price: "", fees: "", note: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await getPositions();
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.ticker || !form.quantity || !form.price) return;
    setSubmitting(true);
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
      setForm({ ticker: "", type: "buy", quantity: "", price: "", fees: "", note: "" });
      setShowForm(false);
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erreur", "error");
    }
    setSubmitting(false);
  };

  const handleDelete = async (ticker: string) => {
    if (!confirm(`Supprimer la position ${ticker} ?`)) return;
    setDeletingTicker(ticker);
    try {
      await deletePosition(ticker);
      toast(`Position ${ticker} supprimée`, "success");
      load();
    } catch (err: unknown) {
      toast(err instanceof Error ? err.message : "Erreur", "error");
    }
    setDeletingTicker(null);
  };

  const positions = data?.positions ?? [];
  const pnl = data?.total_pnl_pct ?? null;
  const isUp = pnl != null && pnl >= 0;

  return (
    <div className="space-y-5 pb-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-edge/40">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-accent to-navy rounded-full" />
          <div>
            <Link href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </Link>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Portefeuille
            </h1>
            <p className="text-sm text-muted mt-1">
              {data?.portfolio} · {positions.length} position{positions.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs font-medium px-3 py-2 rounded-lg bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20 hover:bg-navy/20 transition-colors"
        >
          {showForm ? "Annuler" : "+ Nouvelle transaction"}
        </button>
      </div>

      {/* Stats globales */}
      {data && positions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Valeur totale" value={`${data.total_value?.toFixed(0)}${data.currency === "EUR" ? "€" : data.currency}`} />
          <StatCard label="Coût d'acquisition" value={`${data.total_cost?.toFixed(0)}${data.currency === "EUR" ? "€" : data.currency}`} />
          <StatCard
            label="PnL latent"
            value={`${(data.total_pnl ?? 0) >= 0 ? "+" : ""}${data.total_pnl?.toFixed(0)}${data.currency === "EUR" ? "€" : data.currency}`}
            colorClass={isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          />
          <StatCard
            label="Performance"
            value={`${isUp ? "+" : ""}${pnl?.toFixed(2)}%`}
            colorClass={isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
          />
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card-premium p-5">
          <h3 className="section-title mb-4">Nouvelle transaction</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
            <FormField label="Ticker">
              <input
                type="text" required
                value={form.ticker}
                onChange={(e) => setForm({ ...form, ticker: e.target.value })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
                placeholder="AAPL"
              />
            </FormField>
            <FormField label="Type">
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as "buy" | "sell" })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
              >
                <option value="buy">Achat</option>
                <option value="sell">Vente</option>
              </select>
            </FormField>
            <FormField label="Quantité">
              <input
                type="number" step="any" required
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
                placeholder="100"
              />
            </FormField>
            <FormField label="Prix unitaire (€)">
              <input
                type="number" step="any" required
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
                placeholder="3.50"
              />
            </FormField>
            <FormField label="Frais (€)">
              <input
                type="number" step="any"
                value={form.fees}
                onChange={(e) => setForm({ ...form, fees: e.target.value })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
                placeholder="0"
              />
            </FormField>
            <FormField label="Note">
              <input
                type="text"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full bg-bg border border-edge rounded px-3 py-2 text-sm focus:outline-none focus:border-navy"
                placeholder="Optionnel"
              />
            </FormField>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-navy text-white hover:bg-navy-hover disabled:opacity-50"
          >
            {submitting ? "Enregistrement..." : "Enregistrer"}
          </button>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => <div key={i} className="card-premium p-5 h-48 animate-pulse" />)}
        </div>
      )}

      {/* Positions */}
      {!loading && positions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {positions.map((p: any) => (
            <PositionCard
              key={p.ticker}
              p={p}
              currency={data?.currency ?? "EUR"}
              onDelete={handleDelete}
              deleting={deletingTicker === p.ticker}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && positions.length === 0 && !showForm && (
        <div className="card-premium p-8 text-center">
          <div className="text-4xl mb-3">▣</div>
          <p className="text-primary font-medium">Aucune position dans le portefeuille</p>
          <p className="text-sm text-muted mt-1 mb-4">Commence par enregistrer ta première transaction.</p>
          <button onClick={() => setShowForm(true)}
            className="text-xs font-bold uppercase tracking-widest px-4 py-2 rounded bg-navy/10 text-navy dark:bg-accent/10 dark:text-accent border border-navy/20 dark:border-accent/20">
            + Première transaction
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, colorClass }: { label: string; value: string; colorClass?: string }) {
  return (
    <div className="card-premium p-4">
      <p className="text-[0.625rem] font-bold uppercase tracking-widest text-muted">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${colorClass ?? "text-primary"}`}
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function PositionCard({ p, currency, onDelete, deleting }: {
  p: any; currency: string; onDelete: (t: string) => void; deleting: boolean;
}) {
  const meta = getTickerMeta(p.ticker);
  const sector = meta.sector;
  const sectorStyle = sector ? SECTOR_COLORS[sector] : null;
  const isUp = (p.pnl_pct ?? 0) >= 0;
  const cur = currency === "EUR" ? "€" : currency;

  return (
    <div className="card-premium card-aura relative p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <TickerBadge ticker={p.ticker} size="lg" showName={false} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {sectorStyle && sector && (
                <span className={`text-[0.625rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border ${sectorStyle.bg} ${sectorStyle.text} ${sectorStyle.border}`}>
                  {SECTOR_LABEL[sector]}
                </span>
              )}
            </div>
            <h3 className="text-lg font-bold text-primary leading-tight truncate"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              {meta.name}
            </h3>
            <p className="text-xs text-muted font-mono">{p.ticker}</p>
          </div>
        </div>
        <button
          onClick={() => onDelete(p.ticker)}
          disabled={deleting}
          className="text-[0.625rem] text-muted hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
          aria-label={`Supprimer ${p.ticker}`}
        >
          {deleting ? "..." : "✕"}
        </button>
      </div>

      {/* Détails position */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <Detail label="Quantité" value={p.quantity?.toFixed(p.quantity % 1 === 0 ? 0 : 2)} />
        <Detail label="Coût moyen" value={`${p.avg_cost?.toFixed(2)}${cur}`} />
        <Detail label="Cours actuel" value={`${p.current_price?.toFixed(2)}${cur}`} />
      </div>

      {/* PnL + Sparkline */}
      <div className="flex items-end justify-between gap-3 pt-3 border-t border-edge/40">
        <div>
          <p className="text-[0.625rem] uppercase tracking-widest text-muted">PnL latent</p>
          <p className={`text-lg font-bold font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            {isUp ? "+" : ""}{p.pnl?.toFixed(0)}{cur} ({isUp ? "+" : ""}{p.pnl_pct?.toFixed(1)}%)
          </p>
        </div>
        <Sparkline ticker={p.ticker} width={100} height={32} period="3mo" />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.625rem] uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm font-mono font-semibold text-primary mt-0.5">{value}</p>
    </div>
  );
}
