"use client";
/**
 * Widget chat flottant — bas-droite, présent sur toutes les pages.
 */
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { chatWithBot } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";

const SUGGESTIONS = [
  "Meilleures opportunités",
  "État du marché",
  "Analyse NVDA",
  "Explique le VIX",
];

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  data?: unknown;
  loading?: boolean;
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "Bonjour. Pose-moi une question sur le marché, un ticker ou une opportunité.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: Date.now(), role: "user", text };
    const loadingMsg: Message = { id: Date.now() + 1, role: "assistant", text: "", loading: true };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setLoading(true);

    try {
      const history = messages
        .filter((m) => !m.loading)
        .map((m) => ({ role: m.role, text: m.text, data: m.data as Record<string, unknown> | undefined }));
      const response = await chatWithBot(text, history);
      setMessages((prev) =>
        prev.map((m) =>
          m.loading ? { ...m, text: response.text, data: response.data, loading: false } : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.loading ? { ...m, text: "Erreur de connexion au backend.", loading: false } : m
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Panneau chat */}
      {open && (
        <div
          className="fixed bottom-20 right-3 left-3 sm:left-auto sm:right-4 z-50 sm:w-96 flex flex-col rounded-xl
                     border border-edge bg-surface shadow-xl max-h-[75vh]"
          style={{ height: "480px" }}
        >
          {/* En-tête */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-edge flex-shrink-0 bg-navy rounded-t-xl">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-sm font-medium text-white tracking-wide">Austerlitz IA</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-white/50 hover:text-white text-lg leading-none transition-colors"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-bg">
            {messages.map((msg) => (
              <Bubble key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 pt-1 flex flex-wrap gap-1.5 flex-shrink-0 bg-bg border-t border-edge">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="text-[10px] px-2.5 py-1 border border-edge rounded-full
                             text-secondary bg-surface hover:border-navy/30 hover:text-navy
                             transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex gap-2 px-3 py-3 border-t border-edge flex-shrink-0 bg-surface rounded-b-xl"
          >
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Question…"
              disabled={loading}
              className="flex-1 bg-bg border border-edge rounded-lg px-3 py-2 text-sm
                         text-primary placeholder-muted focus:outline-none focus:border-navy
                         disabled:opacity-50 transition-colors"
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-3 py-2 bg-navy hover:bg-navy-hover rounded-lg text-white text-sm
                         transition-colors disabled:opacity-40 flex-shrink-0 font-medium"
            >
              {loading ? "…" : "→"}
            </button>
          </form>
        </div>
      )}

      {/* Bouton flottant */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-navy hover:bg-navy-hover
                   flex items-center justify-center shadow-lg shadow-navy/20 transition-all duration-150
                   border-2 border-accent/40"
        title="Ouvrir le chatbot"
      >
        {open ? (
          <span className="text-white text-lg leading-none font-medium">×</span>
        ) : (
          <span className="text-accent text-base font-bold"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}>A</span>
        )}
      </button>
    </>
  );
}

function Bubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (message.loading) {
    return (
      <div className="flex gap-2">
        <div className="w-6 h-6 rounded-full bg-navy flex-shrink-0 flex items-center justify-center text-[10px] text-accent font-bold"
             style={{ fontFamily: "'Space Grotesk', sans-serif" }}>A</div>
        <div className="rounded-lg bg-surface border border-edge px-3 py-2 flex gap-1 items-center shadow-sm">
          <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-2 flex-row-reverse">
        <div className="rounded-lg bg-navy px-3 py-2 text-xs text-white max-w-[80%] shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <div className="w-6 h-6 rounded-full bg-navy flex-shrink-0 flex items-center justify-center text-[10px] text-accent font-bold flex-shrink-0"
           style={{ fontFamily: "'Space Grotesk', sans-serif" }}>A</div>
      <div className="flex-1 rounded-lg bg-surface border border-edge px-3 py-2 shadow-sm">
        <MiniMarkdown text={message.text} />
        {!!message.data && <DataLinks data={message.data as Record<string, unknown>} />}
      </div>
    </div>
  );
}

function MiniMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-xs text-primary space-y-0.5">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return <p key={i} className="text-sm font-semibold text-navy"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{line.slice(3)}</p>;
        if (line.startsWith("+ ")) return <p key={i} className="text-green-700">{line}</p>;
        if (line.startsWith("− ") || line.startsWith("- ")) return <p key={i} className="text-red-700">{line}</p>;
        if (line.startsWith("• ") || line.startsWith("* ")) return <p key={i} className="text-secondary pl-1">{line}</p>;
        if (line === "") return <div key={i} className="h-0.5" />;
        const parts = line.split(/\*\*(.+?)\*\*/g);
        if (parts.length > 1) {
          return (
            <p key={i}>
              {parts.map((part, j) =>
                j % 2 === 1
                  ? <strong key={j} className="text-primary font-semibold">{part}</strong>
                  : <span key={j}>{part}</span>
              )}
            </p>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}

function DataLinks({ data }: { data: Record<string, unknown> }) {
  const opportunities = data.opportunities as Array<{ ticker: string; scores: { composite: number } }> | undefined;
  const ticker = data.ticker as string | undefined;

  if (opportunities && opportunities.length > 0) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5 border-t border-edge pt-2">
        {opportunities.slice(0, 4).map((opp) => (
          <Link key={opp.ticker} href={`/company/${opp.ticker}`}
            className="text-xs px-2 py-0.5 border border-navy/20 bg-bg rounded text-navy hover:bg-surface-alt transition-colors">
            {opp.ticker} ({opp.scores.composite}/10)
          </Link>
        ))}
      </div>
    );
  }

  if (ticker) {
    return (
      <div className="mt-2 border-t border-edge pt-2">
        <Link href={`/company/${ticker}`}
          className="text-xs px-2 py-0.5 border border-navy/20 bg-bg rounded text-navy hover:bg-surface-alt transition-colors">
          → Voir {ticker}
        </Link>
      </div>
    );
  }

  return null;
}
