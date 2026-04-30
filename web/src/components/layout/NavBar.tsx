"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const NAV_ITEMS = [
  { href: "/brief",        label: "Brief",        icon: "◈" },
  { href: "/opportunities", label: "Opportunités", icon: "◎" },
  { href: "/earnings",     label: "Earnings",     icon: "⊞" },
  { href: "/alerts",       label: "Alertes",      icon: "⚡" },
  { href: "/watchlist",    label: "Watchlist",    icon: "◉" },
  { href: "/portfolio",    label: "Portefeuille", icon: "▣" },
  { href: "/idea",         label: "Recherche",    icon: "◇" },
  { href: "/analyst",      label: "Analyste",     icon: "⧫" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="bg-surface border-b border-edge flex-shrink-0 overflow-x-auto">
      <ul className="flex items-center px-4 sm:px-6 gap-1 min-w-max">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={clsx(
                  "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-all duration-150 whitespace-nowrap",
                  isActive
                    ? "border-navy text-navy dark:border-accent dark:text-accent"
                    : "border-transparent text-secondary hover:text-primary hover:border-edge"
                )}
              >
                <span className={clsx("text-[10px]", isActive ? "opacity-100" : "opacity-40")}>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
