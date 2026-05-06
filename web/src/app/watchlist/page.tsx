/**
 * Page Watchlist — /watchlist
 * Vue tableau avec prix, variations et scores pour tous les tickers suivis.
 */
"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getWatchlists, getWatchlistSnapshot, createWatchlist, addToWatchlist, removeFromWatchlist, createAlert } from "@/lib/api";
import type { Watchlist, WatchlistSnapshotItem } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { useDocumentTitle } from "@/lib/useDocumentTitle";
import { useToast } from "@/components/ui/Toast";

export default function WatchlistPage() {
  useDocumentTitle("Watchlist");
  const { toast } = useToast();
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<WatchlistSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [newListName, setNewListName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getWatchlists()
      .then((data) => { setWatchlists(data); if (data.length > 0) setSelectedId(data[0].id); })
      .catch(() => setError("Backend inaccessible"));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    getWatchlistSnapshot(selectedId)
      .then((data) => setSnapshot(data.snapshots))
      .catch(() => setSnapshot([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !newTicker.trim()) return;
    const tickerToAdd = newTicker.trim();
    try {
      await addToWatchlist(selectedId, tickerToAdd);
      setNewTicker("");
      toast(`${tickerToAdd} ajouté à la watchlist`, "success");
      const data = await getWatchlistSnapshot(selectedId);
      setSnapshot(data.snapshots);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur";
      setError(msg);
      toast(msg, "error");
    }
  };

  const handleRemove = async (ticker: string) => {
    if (!selectedId) return;
    await removeFromWatchlist(selectedId, ticker);
    setSnapshot((prev) => prev.filter((s) => s.ticker !== ticker));
    toast(`${ticker} retiré de la watchlist`, "success");
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    const wl = await createWatchlist(newListName.trim());
    setWatchlists((prev) => [...prev, wl]);
    setSelectedId(wl.id);
    setNewListName("");
  };

  return (
    <div className="space-y-5 pb-6">
      {/* Header style premium */}
      <div className="flex items-end justify-between gap-4 pb-4 border-b border-edge/40">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-accent to-navy rounded-full" />
          <div>
            <a href="/" className="text-xs text-muted hover:text-navy dark:hover:text-accent transition-colors flex items-center gap-1 mb-1">
              <span>←</span> <span>Retour au tableau de bord</span>
            </a>
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Watchlist
            </h1>
            <p className="text-sm text-muted mt-1">
              Tickers sous surveillance · {watchlists.length} liste{watchlists.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Sélecteur + création */}
      <div className="flex items-center gap-2 flex-wrap">
        {watchlists.map((wl) => (
          <button key={wl.id} onClick={() => setSelectedId(wl.id)}
            className={`text-sm px-3 py-1 rounded border transition-colors ${
              selectedId === wl.id
                ? "border-navy bg-navy text-white font-medium"
                : "border-edge text-secondary bg-surface hover:border-navy/30 hover:text-navy"
            }`}>
            {wl.name}
          </button>
        ))}
        <form onSubmit={handleCreateList} className="flex gap-2">
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nouvelle liste…"
            className="bg-surface border border-edge rounded px-2.5 py-1 text-xs
                       text-primary placeholder-muted focus:outline-none focus:border-navy w-32 transition-colors" />
          <button type="submit"
            className="text-xs px-2.5 py-1 border border-edge rounded text-secondary
                       bg-surface hover:border-navy/30 hover:text-navy transition-colors">
            +
          </button>
        </form>
      </div>

      {/* Ajouter un ticker */}
      {selectedId && (
        <form onSubmit={handleAddTicker} className="flex gap-2 items-center">
          <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Ajouter un ticker (ex: MSFT)"
            className="flex-1 sm:flex-none bg-surface border border-edge rounded px-3 py-1.5 text-sm
                       text-primary placeholder-muted focus:outline-none focus:border-navy sm:w-52 transition-colors" />
          <button type="submit"
            className="text-sm px-3 py-1.5 bg-navy hover:bg-navy-hover rounded text-white transition-colors font-medium">
            Ajouter
          </button>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </form>
      )}

      {/* Tableau */}
      {loading ? (
        <p className="text-muted text-sm">Chargement…</p>
      ) : snapshot.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface p-8 text-center shadow-sm">
          <p className="text-secondary text-sm">
            {watchlists.length === 0
              ? "Crée une watchlist puis ajoute des tickers."
              : "Cette watchlist est vide. Ajoute un ticker ci-dessus."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-edge overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-edge bg-bg">
                {["Ticker", "Nom", "Prix", "1J", "1M", "YTD", "Score", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-muted uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.map((item) => (
                <tr key={item.ticker} className="border-b border-edge bg-surface hover:bg-bg transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${item.ticker}`}
                      className="font-mono font-bold text-navy hover:text-navy-hover">
                      {item.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-secondary text-xs max-w-[160px] truncate">{item.name}</td>
                  <td className="px-4 py-2.5 font-mono text-primary font-medium">
                    {item.price?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1d} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1m} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_ytd} /></td>
                  <td className="px-4 py-2.5">
                    {item.composite_score != null
                      ? <ScoreBadge score={item.composite_score} size="sm" />
                      : <span className="text-muted">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <QuickAlertButton ticker={item.ticker} currentPrice={item.price ?? null} onDone={(msg) => toast(msg, "success")} />
                      <button onClick={() => handleRemove(item.ticker)}
                        title="Retirer de la watchlist"
                        className="text-xs text-muted hover:text-red-700 transition-colors">
                        ×
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Quick "+ alerte" depuis la watchlist ───────────────────────────────
type AlertType = "price_above" | "price_below" | "change_pct" | "earnings";

function QuickAlertButton({ ticker, currentPrice, onDone }: {
  ticker: string;
  currentPrice: number | null;
  onDone: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AlertType>("price_below");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Pré-remplir une valeur sensée selon le type quand le popover s'ouvre
  useEffect(() => {
    if (!open) return;
    if (type === "price_below" && currentPrice) setValue((currentPrice * 0.95).toFixed(2));
    else if (type === "price_above" && currentPrice) setValue((currentPrice * 1.05).toFixed(2));
    else if (type === "change_pct") setValue("5");
    else if (type === "earnings") setValue("7");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  // Click outside pour fermer
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const submit = async () => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) return;
    setBusy(true);
    try {
      await createAlert({ ticker, type, condition_value: num });
      setOpen(false);
      onDone(`Alerte créée sur ${ticker}`);
    } catch (err) {
      onDone(err instanceof Error ? err.message : "Erreur création alerte");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        title="Créer une alerte sur ce ticker"
        className="text-xs text-navy hover:text-accent transition-colors px-1.5 py-0.5 rounded border border-edge hover:border-navy"
      >
        + alerte
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-edge bg-surface shadow-xl p-3 text-left">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-muted mb-2">Alerte sur {ticker}</p>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AlertType)}
            className="w-full rounded border border-edge bg-bg px-2 py-1 text-xs text-primary mb-2"
          >
            <option value="price_below">Prix descend sous…</option>
            <option value="price_above">Prix monte au-dessus de…</option>
            <option value="change_pct">Variation 1J ≥ ± X%</option>
            <option value="earnings">Earnings dans ≤ X jours</option>
          </select>
          <input
            type="number"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={type === "earnings" ? "7" : type === "change_pct" ? "5" : "prix"}
            className="w-full rounded border border-edge bg-bg px-2 py-1 text-xs text-primary mb-2"
          />
          {currentPrice && (type === "price_below" || type === "price_above") && (
            <p className="text-[0.625rem] text-muted mb-2">Prix actuel : {currentPrice.toFixed(2)}</p>
          )}
          <div className="flex gap-2">
            <button onClick={submit} disabled={busy || !value}
              className="flex-1 rounded bg-navy text-white text-xs px-2 py-1 hover:bg-navy-hover disabled:opacity-50">
              {busy ? "…" : "Créer"}
            </button>
            <button onClick={() => setOpen(false)}
              className="rounded border border-edge text-xs px-2 py-1 text-secondary hover:bg-surface-alt">
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
