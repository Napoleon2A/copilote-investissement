"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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

  return (
    <header className="h-11 bg-surface border-b border-edge flex items-center px-4 sm:px-6 gap-4 flex-shrink-0">
      {/* Logo */}
      <Link
        href="/"
        className="flex items-center gap-2 flex-shrink-0 hover:opacity-80 transition-opacity"
      >
        <div className="w-4 h-px bg-accent" />
        <span
          className="text-xs font-bold tracking-[0.15em] uppercase text-navy dark:text-accent"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Austerlitz
        </span>
      </Link>

      <div className="w-px h-4 bg-edge flex-shrink-0" />

      {/* Recherche ticker */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ticker…"
          className="bg-bg border border-edge rounded px-3 py-1.5 text-xs
                     text-primary placeholder-muted focus:outline-none
                     focus:border-navy focus:bg-surface transition-colors
                     w-32 sm:w-48"
        />
        <button
          type="submit"
          className="text-xs px-3 py-1.5 bg-navy hover:bg-navy-hover
                     rounded text-white transition-colors font-medium flex-shrink-0"
        >
          →
        </button>
      </form>

      <p className="hidden md:block text-[10px] text-muted ml-auto tracking-wide">
        À titre informatif uniquement · Pas un conseil en investissement
      </p>

      <div className="ml-auto md:ml-2">
        <ThemeToggle />
      </div>
    </header>
  );
}
