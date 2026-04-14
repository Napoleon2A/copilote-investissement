"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function TopBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/company/${query.trim().toUpperCase()}`);
      setQuery("");
    }
  };

  return (
    <header className="h-12 bg-[#1a1d27] border-b border-[#2a2d3a] flex items-center px-6 gap-4 flex-shrink-0">
      {/* Recherche rapide */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker (ex: AAPL, MC.PA)"
          className="bg-[#0f1117] border border-[#2a2d3a] rounded px-3 py-1 text-sm
                     text-slate-200 placeholder-slate-600 focus:outline-none
                     focus:border-indigo-500 w-52"
        />
        <button
          type="submit"
          className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500
                     rounded text-white transition-colors"
        >
          →
        </button>
      </form>

      {/* Disclaimer discret */}
      <p className="text-xs text-slate-600 ml-auto">
        À titre informatif uniquement. Pas un conseil en investissement.
      </p>
    </header>
  );
}
