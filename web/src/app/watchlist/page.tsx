/**
 * Page Watchlist — /watchlist
 * Vue tableau avec prix, variations et scores pour tous les tickers suivis.
 */
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getWatchlists, getWatchlistSnapshot, createWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/api";
import type { Watchlist, WatchlistSnapshotItem } from "@/lib/api";
import { ChangeCell } from "@/components/ui/ChangeCell";
import { ScoreBadge } from "@/components/ui/ScoreBadge";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

export default function WatchlistPage() {
  useDocumentTitle("Watchlist");
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
    try {
      await addToWatchlist(selectedId, newTicker.trim());
      setNewTicker("");
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
    <div className="max-w-4xl mx-auto space-y-5">
      <h1 className="text-lg font-semibold text-[#0B1929]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        Watchlist
      </h1>

      {/* Sélecteur + création */}
      <div className="flex items-center gap-2 flex-wrap">
        {watchlists.map((wl) => (
          <button key={wl.id} onClick={() => setSelectedId(wl.id)}
            className={`text-sm px-3 py-1 rounded border transition-colors ${
              selectedId === wl.id
                ? "border-[#1E3A5F] bg-[#1E3A5F] text-white font-medium"
                : "border-[#BFD0DC] text-[#2D4A5C] bg-white hover:border-[#1E3A5F]/30 hover:text-[#1E3A5F]"
            }`}>
            {wl.name}
          </button>
        ))}
        <form onSubmit={handleCreateList} className="flex gap-2">
          <input value={newListName} onChange={(e) => setNewListName(e.target.value)}
            placeholder="Nouvelle liste…"
            className="bg-white border border-[#BFD0DC] rounded px-2.5 py-1 text-xs
                       text-[#0B1929] placeholder-[#7898AC] focus:outline-none focus:border-[#1E3A5F] w-32 transition-colors" />
          <button type="submit"
            className="text-xs px-2.5 py-1 border border-[#BFD0DC] rounded text-[#2D4A5C]
                       bg-white hover:border-[#1E3A5F]/30 hover:text-[#1E3A5F] transition-colors">
            +
          </button>
        </form>
      </div>

      {/* Ajouter un ticker */}
      {selectedId && (
        <form onSubmit={handleAddTicker} className="flex gap-2 items-center">
          <input value={newTicker} onChange={(e) => setNewTicker(e.target.value.toUpperCase())}
            placeholder="Ajouter un ticker (ex: MSFT)"
            className="flex-1 sm:flex-none bg-white border border-[#BFD0DC] rounded px-3 py-1.5 text-sm
                       text-[#0B1929] placeholder-[#7898AC] focus:outline-none focus:border-[#1E3A5F] sm:w-52 transition-colors" />
          <button type="submit"
            className="text-sm px-3 py-1.5 bg-[#1E3A5F] hover:bg-[#162d4a] rounded text-white transition-colors font-medium">
            Ajouter
          </button>
          {error && <p className="text-xs text-red-700">{error}</p>}
        </form>
      )}

      {/* Tableau */}
      {loading ? (
        <p className="text-[#7898AC] text-sm">Chargement…</p>
      ) : snapshot.length === 0 ? (
        <div className="rounded-lg border border-[#BFD0DC] bg-white p-8 text-center shadow-sm">
          <p className="text-[#2D4A5C] text-sm">
            {watchlists.length === 0
              ? "Crée une watchlist puis ajoute des tickers."
              : "Cette watchlist est vide. Ajoute un ticker ci-dessus."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#BFD0DC] overflow-x-auto shadow-sm">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-[#BFD0DC] bg-[#EEF2F6]">
                {["Ticker", "Nom", "Prix", "1J", "1M", "YTD", "Score", ""].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[#7898AC] uppercase tracking-widest">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshot.map((item) => (
                <tr key={item.ticker} className="border-b border-[#BFD0DC] bg-white hover:bg-[#EEF2F6] transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/company/${item.ticker}`}
                      className="font-mono font-bold text-[#1E3A5F] hover:text-[#162d4a]">
                      {item.ticker}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-[#2D4A5C] text-xs max-w-[160px] truncate">{item.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[#0B1929] font-medium">
                    {item.price?.toLocaleString("fr-FR", { minimumFractionDigits: 2 }) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1d} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_1m} /></td>
                  <td className="px-4 py-2.5"><ChangeCell value={item.change_ytd} /></td>
                  <td className="px-4 py-2.5">
                    {item.composite_score != null
                      ? <ScoreBadge score={item.composite_score} size="sm" />
                      : <span className="text-[#7898AC]">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => handleRemove(item.ticker)}
                      className="text-xs text-[#7898AC] hover:text-red-700 transition-colors">
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
