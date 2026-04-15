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
    <header className="h-11 bg-white border-b border-[#BFD0DC] flex items-center px-6 gap-4 flex-shrink-0">
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un ticker…"
          className="bg-[#EEF2F6] border border-[#BFD0DC] rounded px-3 py-1.5 text-xs
                     text-[#0B1929] placeholder-[#7898AC] focus:outline-none
                     focus:border-[#1E3A5F] focus:bg-white transition-colors w-48"
        />
        <button
          type="submit"
          className="text-xs px-3 py-1.5 bg-[#1E3A5F] hover:bg-[#162d4a]
                     rounded text-white transition-colors font-medium"
        >
          →
        </button>
      </form>

      <p className="text-[10px] text-[#7898AC] ml-auto tracking-wide">
        À titre informatif uniquement · Pas un conseil en investissement
      </p>
    </header>
  );
}
