"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

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

  const toggleSidebar = () => {
    window.dispatchEvent(new Event("toggle-sidebar"));
  };

  return (
    <header className="h-11 bg-surface border-b border-edge flex items-center px-3 sm:px-6 gap-2 sm:gap-4 flex-shrink-0">
      {/* Burger button — mobile uniquement */}
      <button
        type="button"
        onClick={toggleSidebar}
        className="md:hidden flex flex-col items-center justify-center gap-[3px] w-8 h-8 rounded hover:bg-bg transition-colors"
        aria-label="Ouvrir le menu"
      >
        <span className="block w-4 h-px bg-secondary" />
        <span className="block w-4 h-px bg-secondary" />
        <span className="block w-4 h-px bg-secondary" />
      </button>

      <form onSubmit={handleSearch} className="flex items-center gap-2 flex-1 md:flex-initial">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker…"
          className="bg-bg border border-edge rounded px-3 py-1.5 text-xs
                     text-primary placeholder-muted focus:outline-none
                     focus:border-navy focus:bg-surface transition-colors
                     w-full md:w-48"
        />
        <button
          type="submit"
          className="text-xs px-3 py-1.5 bg-navy hover:bg-navy-hover
                     rounded text-white transition-colors font-medium flex-shrink-0"
        >
          →
        </button>
      </form>

      {/* Disclaimer — masqué sur mobile, visible dès md */}
      <p className="hidden md:block text-[10px] text-muted ml-auto tracking-wide">
        À titre informatif uniquement · Pas un conseil en investissement
      </p>

      {/* Toggle dark/light — tout à droite, responsive (auto sur mobile) */}
      <div className="ml-auto md:ml-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
