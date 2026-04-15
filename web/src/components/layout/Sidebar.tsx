"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/",             label: "Brief",        icon: "◈" },
  { href: "/opportunities", label: "Opportunités", icon: "◎" },
  { href: "/watchlist",    label: "Watchlist",    icon: "◉" },
  { href: "/portfolio",    label: "Portefeuille", icon: "▣" },
  { href: "/idea",         label: "Idée ?",       icon: "◇" },
  { href: "/company/AAPL", label: "Recherche",    icon: "⊕" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-52 flex-shrink-0 bg-white border-r border-[#BFD0DC] flex flex-col shadow-sm">

      {/* Logo — serré et élégant */}
      <div className="px-5 py-5 border-b border-[#BFD0DC]">
        {/* Ligne or décorative */}
        <div className="w-8 h-px bg-[#5E96B0] mb-3" />
        <span
          className="block text-sm font-bold tracking-[0.12em] uppercase text-[#1E3A5F]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Austerlitz
        </span>
        <p className="text-[10px] tracking-[0.2em] uppercase text-[#5E96B0] mt-0.5 font-medium">
          Hedge Fund
        </p>
      </div>

      {/* Navigation */}
      <ul className="flex-1 py-3 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2 rounded text-sm transition-all duration-150",
                  isActive
                    ? "bg-[#1E3A5F] text-white font-medium shadow-sm"
                    : "text-[#2D4A5C] hover:bg-[#EEF2F6] hover:text-[#0B1929]"
                )}
              >
                <span className={clsx("text-xs", isActive ? "text-[#5E96B0]" : "opacity-50")}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-[#BFD0DC]">
        <p className="text-[10px] text-[#7898AC] leading-relaxed">
          Données : yfinance<br />
          Délai : ~15 min (US)
        </p>
      </div>
    </nav>
  );
}
