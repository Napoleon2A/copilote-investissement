"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Hook de gestion du thème clair/sombre.
 * Lit / persiste le choix dans localStorage ("theme": "dark" | "light").
 * Applique la classe `.dark` sur <html> — Tailwind + overrides CSS font le reste.
 */
export function useTheme(): { theme: Theme; toggle: () => void } {
  const [theme, setTheme] = useState<Theme>("light");

  // Lecture initiale côté client (évite les erreurs SSR)
  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = stored ?? (systemDark ? "dark" : "light");
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return { theme, toggle };
}
