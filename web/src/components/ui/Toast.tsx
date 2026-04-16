"use client";
/**
 * Système de toast minimaliste — sans dépendance externe.
 * Usage :
 *   const { toast } = useToast();
 *   toast("Message", "success" | "error");
 *
 * Le <ToastContainer /> doit être monté une fois dans le layout.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastType = "success" | "error" | "info";
type Toast = { id: number; text: string; type: ToastType };

interface ToastContextValue {
  toast: (text: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((text: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, text, type }]);
    // Auto-disparition après 4s
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismiss = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Conteneur flottant — bas-droite, au-dessus du chat bouton */}
      <div className="fixed bottom-20 sm:bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto cursor-pointer min-w-[260px] max-w-sm
                        rounded-lg border px-4 py-3 text-sm shadow-lg
                        animate-[slideIn_0.2s_ease-out]
                        ${typeStyle(t.type)}`}
          >
            <div className="flex items-start gap-2">
              <span className="flex-shrink-0">{typeIcon(t.type)}</span>
              <span className="flex-1">{t.text}</span>
              <span className="flex-shrink-0 opacity-40 hover:opacity-80">×</span>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans un ToastProvider");
  return ctx;
}

function typeStyle(type: ToastType): string {
  if (type === "success") return "bg-green-50 border-green-200 text-green-800";
  if (type === "error") return "bg-red-50 border-red-200 text-red-800";
  return "bg-surface border-edge text-primary";
}

function typeIcon(type: ToastType): string {
  if (type === "success") return "✓";
  if (type === "error") return "⚠";
  return "ℹ";
}
