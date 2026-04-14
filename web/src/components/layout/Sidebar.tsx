"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Brief", icon: "⚡" },
  { href: "/watchlist", label: "Watchlist", icon: "👁" },
  { href: "/portfolio", label: "Portefeuille", icon: "📊" },
  { href: "/idea", label: "Idée ?", icon: "💡" },
  { href: "/company/AAPL", label: "Recherche", icon: "🔍" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-52 flex-shrink-0 bg-[#1a1d27] border-r border-[#2a2d3a] flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-[#2a2d3a]">
        <span className="text-sm font-semibold text-indigo-400 tracking-wide">
          COPILOTE
        </span>
        <p className="text-xs text-slate-500 mt-0.5">Investissement</p>
      </div>

      {/* Navigation */}
      <ul className="flex-1 p-2 space-y-1">
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
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  isActive
                    ? "bg-indigo-500/20 text-indigo-300"
                    : "text-slate-400 hover:bg-[#2a2d3a] hover:text-slate-200"
                )}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Footer */}
      <div className="p-4 border-t border-[#2a2d3a]">
        <p className="text-xs text-slate-600">
          Données : yfinance<br />
          Délai : ~15 min (US)
        </p>
      </div>
    </nav>
  );
}
