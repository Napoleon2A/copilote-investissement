/**
 * Page Watchlist — /watchlist
 * Vue tableau avec prix, variations et scores pour tous les tickers suivis.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getWatchlists,
  getWatchlistSnapshot,
  createWatchlist,
  addToWatchlist,
  removeFromWatchlist,
} from "@/lib/api";
import type { Watchlist, WatchlistSnapshotItem } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";

export default function WatchlistPage() {
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<WatchlistSnapshotItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [newListName, setNewListName] = useState("");
  const [error, setError] = useState("");

  // Charger les watchlists au montage
  useEffect(() => {
    getWatchlists()
      .then((data) => {
        setWatchlists(data);
        if (data.length > 0) setSelectedId(data[0].id);
      })
      .catch(() => setError("Backend inaccessible"));
  }, []);

  // Charger le snapshot quand la watchlist change
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
    try {
      await addToWatchlist(selectedId, newTicker.trim());
      setNewTicker("");
      // Rafraîchir
      const data = await getWatchlistSnapshot(selectedId);
      setSnapshot(data.snapshots);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur");
    }
  };

  const handleRemove = async (ticker: string) => {
    if (!selectedId) return;
    await removeFromWatchlist(selectedId, ticker);
    setSnapshot((prev) => prev.filter((s) => s.ticker !== ticker));
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
    <div className="max-w-4xl mx-auto space-y-4">
      <h1 className="text-lg font-semibold text-slate-100">Watchlist</h1>

      {/* Sélecteur de watchlist + création */}
      <div className="flex items-center gap-3 flex-wrap">
        {watchlists.map((wl) => (
          <button
            key={wl.id}
            onClick={() => setSelectedId(wl.id)}
            className={`text-sm px-3 py-1 rounded border transition-colors ${
              selectedId === wl.id
                ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                : "border-[#2a2d3a] text-slate-400 hover:border-slate-500"
            }`}
          >
            {wl.name}
          </button>
        ))}

        {/* Créer une nouvelle liste */}
        <form onSubmit={handleCreateList} className="flex gap-2">
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nouvelle liste..."
            className="bg-[#0f1117] border border-[#2a2d3a] rounded px-2 py-1 text-xs
                       text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500 w-32"
          />
          <button
            type="submit"
            className="text-xs px-2 py-1 border border-[#2a2d3a] rounded text-slate-400
                       hover:border-slate-500 hover:text-slate-200"
          >
            +
          </button>
        </form>
      </div>

      {/* Ajouter un ticker */}
      {selectedId && (
        <form onSubmit={handleAddTicker} className="flex gap-2 items-center">
          <input
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Ajouter ticker (ex: MSFT)"
            className="bg-[#0f1117] border border-[#2a2d3a] rounded px-3 py-1.5 text-sm
                       text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500 w-52"
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white transition-colors"
          >
            Ajouter
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}

      {/* Tableau snapshot */}
      {loading ? (
        <p className="text-slate-600 text-sm">Chargement...</p>
      ) : snapshot.length === 0 ? (
        <div className="rounded-lg border border-[#2a2d3a] bg-[#1a1d27] p-8 text-center">
          <p className="text-slate-500 text-sm">
            {watchlists.length === 0
              ? "Crée une watchlist puis ajoute des tickers."
              : "Cette watchlist est vide. Ajoute un ticker ci-dessus."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2d3a] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a2d3a] bg-[#1a1d27]">
                {["Ticker", "Nom", "Prix", "1J", "1M", "YTD", "Score", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.map((item) => (
                <tr
                  key={item.ticker}
                  className="border-b border-[#2a2d3a] bg-[#0f1117] hover:bg-[#1a1d27] transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/company/${item.ticker}`}
                      className="font-mono font-bold text-indigo-300 hover:text-indigo-200"
                    >
                      {item.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400 text-xs max-w-[160px] truncate">
                    {item.name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-300">
                    {item.price?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1d} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1m} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_ytd} /></td>
                  <td className="px-4 py-2.5">
                    {item.composite_score != null ? (
                      <ScoreBadge score={item.composite_score} size="sm" />
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleRemove(item.ticker)}
                      className="text-xs text-slate-700 hover:text-red-400 transition-colors"
                    >
                      ×
                    </button>
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
