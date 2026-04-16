"use client";
import { useEffect } from "react";

/**
 * Met à jour le titre de l'onglet (document.title).
 * À utiliser dans les composants client ; pour les server components,
 * préférer `export const metadata = { title: "..." }`.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${title} · Austerlitz`;
    return () => { document.title = previous; };
  }, [title]);
}
