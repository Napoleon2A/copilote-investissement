"use client";
import { useTheme } from "@/lib/useTheme";

/**
 * Petit bouton toggle dark/light mode.
 * Affiche ☀ en mode sombre (clic pour passer en clair),
 * et ☾ en mode clair (clic pour passer en sombre).
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      className="w-8 h-8 rounded flex items-center justify-center text-sm
                 text-[#2D4A5C] hover:bg-[#EEF2F6] hover:text-[#1E3A5F] transition-colors"
      aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
      title={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
