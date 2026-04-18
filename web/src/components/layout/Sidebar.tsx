"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/",             label: "Brief",        icon: "◈" },
  { href: "/opportunities", label: "Opportunités", icon: "◎" },
  { href: "/earnings",    label: "Earnings",     icon: "⊞" },
  { href: "/alerts",      label: "Alertes",      icon: "⚡" },
  { href: "/watchlist",    label: "Watchlist",    icon: "◉" },
  { href: "/portfolio",    label: "Portefeuille", icon: "▣" },
  { href: "/idea",         label: "Recherche",    icon: "◇" },
];

/**
 * Sidebar responsive :
 * - Desktop (≥md) : visible en permanence sur la gauche
 * - Mobile : masquée par défaut, ouverte via bouton burger dans la TopBar
 *   (le bouton émet un event custom "toggle-sidebar" capté ici)
 */
export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Écoute le burger button de la TopBar + ferme sur changement de route
  useEffect(() => {
    const toggle = () => setMobileOpen((v) => !v);
    window.addEventListener("toggle-sidebar", toggle);
    return () => window.removeEventListener("toggle-sidebar", toggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Overlay mobile — clic pour fermer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-primary/40 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <nav
        className={clsx(
          "bg-surface border-r border-edge flex flex-col shadow-sm",
          // Desktop : dans le flow normal
          "md:w-52 md:flex-shrink-0 md:static md:translate-x-0",
          // Mobile : fixed drawer qui glisse
          "fixed inset-y-0 left-0 z-40 w-60 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-5 py-5 border-b border-edge">
          <div className="w-8 h-px bg-accent mb-3" />
          <span
            className="block text-sm font-bold tracking-[0.12em] uppercase text-navy"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Austerlitz
          </span>
          <p className="text-[10px] tracking-[0.2em] uppercase text-accent mt-0.5 font-medium">
            Hedge Fund
          </p>
        </div>

        {/* Navigation */}
        <ul className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
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
                      ? "bg-navy text-white font-medium shadow-sm"
                      : "text-secondary hover:bg-bg hover:text-primary"
                  )}
                >
                  <span className={clsx("text-xs", isActive ? "text-accent" : "opacity-50")}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-edge">
          <p className="text-[10px] text-muted leading-relaxed">
            Données : yfinance<br />
            Délai : ~15 min (US)
          </p>
        </div>
      </nav>
    </>
  );
}
