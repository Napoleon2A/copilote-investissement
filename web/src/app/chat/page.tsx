/**
 * Page Chatbot — /chat
 *
 * Interface de conversation pour interroger le système en langage naturel.
 * Questions possibles :
 *   - "Analyse AAPL"
 *   - "Quelles sont les meilleures opportunités ?"
 *   - "Etat du marché"
 *   - "News sur NVDA"
 *   - "Explique-moi le P/E"
 *   - "Qu'est-ce que le VIX ?"
 */
"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { chatWithBot } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";

const SUGGESTIONS = [
  "Meilleures opportunités maintenant",
  "État du marché",
  "Analyse NVDA",
  "News sur AAPL",
  "Explique-moi le VIX",
  "Qu'est-ce que le P/E ?",
  "Analyse META",
  "Secteurs en surperformance",
];

type Message = {
  id: number;
  role: "user" | "assistant";
  text: string;
  data?: unknown;
  loading?: boolean;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "## Copilote Investissement\n\nPose-moi une question sur le marché, un ticker ou une opportunité.\n\nExemples :\n• *Analyse AAPL*\n• *Meilleures opportunités*\n• *État du marché*\n• *News sur NVDA*\n• *Explique le P/E*",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: Message = { id: Date.now(), role: "user", text };
    const loadingMsg: Message = {
      id: Date.now() + 1,
      role: "assistant",
      text: "",
      loading: true,
    };

    setMessages((prev) => [...prev, userMsg, loadingMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await chatWithBot(text);
      setMessages((prev) =>
        prev.map((m) =>
          m.loading
            ? { ...m, text: response.text, data: response.data, loading: false }
            : m
        )
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.loading
            ? {
                ...m,
                text: "Erreur de connexion au backend. Vérifie que l'API est active.",
                loading: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-120px)]">
      {/* En-tête */}
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Chatbot</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Analyse, opportunités, news, concepts — en langage naturel
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (si premier message seulement) */}
      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 py-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 border border-[#2a2d3a] rounded-full text-slate-400
                         hover:border-indigo-500/50 hover:text-indigo-300 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 pt-3 border-t border-[#2a2d3a]">
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pose une question... (ex: Analyse AAPL, opportunités, marché)"
          disabled={loading}
          className="flex-1 bg-[#1a1d27] border border-[#2a2d3a] rounded-lg px-4 py-2.5 text-sm
                     text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500
                     disabled:opacity-50"
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white text-sm
                     transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {loading ? "…" : "→"}
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";

  if (message.loading) {
    return (
      <div className="flex gap-3">
        <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex-shrink-0 flex items-center justify-center text-xs text-indigo-400">
          ⚡
        </div>
        <div className="flex-1 rounded-lg bg-[#1a1d27] border border-[#2a2d3a] p-4">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-7 h-7 rounded-full bg-slate-700 flex-shrink-0 flex items-center justify-center text-xs text-slate-300">
          →
        </div>
        <div className="rounded-lg bg-indigo-600/20 border border-indigo-500/30 px-4 py-2.5 text-sm text-slate-200 max-w-md">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-indigo-600/30 flex-shrink-0 flex items-center justify-center text-xs text-indigo-400">
        ⚡
      </div>
      <div className="flex-1 rounded-lg bg-[#1a1d27] border border-[#2a2d3a] p-4">
        <MarkdownText text={message.text} />
        {!!message.data && <DataLinks data={message.data as Record<string, unknown>} />}
      </div>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  // Rendu markdown minimal : ## titres, **gras**, • listes, \n paragraphes
  const lines = text.split("\n");
  return (
    <div className="text-sm text-slate-300 space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="text-base font-semibold text-slate-100 mb-2">
              {line.slice(3)}
            </p>
          );
        }
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4) {
          return (
            <p key={i} className="font-medium text-slate-200">
              {line.slice(2, -2)}
            </p>
          );
        }
        if (line.startsWith("+ ")) {
          return (
            <p key={i} className="text-green-400 text-xs">
              {line}
            </p>
          );
        }
        if (line.startsWith("− ") || line.startsWith("- ")) {
          return (
            <p key={i} className="text-red-400 text-xs">
              {line}
            </p>
          );
        }
        if (line.startsWith("• ") || line.startsWith("* ")) {
          return (
            <p key={i} className="text-slate-400 text-xs pl-2">
              {line}
            </p>
          );
        }
        if (line.startsWith("↳ ")) {
          return (
            <p key={i} className="text-slate-500 text-xs pl-4">
              {line}
            </p>
          );
        }
        if (line === "") return <div key={i} className="h-1" />;

        // Traitement inline bold (**texte**)
        const parts = line.split(/\*\*(.+?)\*\*/g);
        if (parts.length > 1) {
          return (
            <p key={i}>
              {parts.map((part: string, j: number) =>
                j % 2 === 1 ? (
                  <strong key={j} className="text-slate-200 font-medium">
                    {part}
                  </strong>
                ) : (
                  <span key={j}>{part}</span>
                )
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
  const opportunities = data.opportunities as Array<{ ticker: string; scores: { composite: number }; action_label: string }> | undefined;
  const ticker = data.ticker as string | undefined;

  if (opportunities && opportunities.length > 0) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-[#2a2d3a] pt-2">
        {opportunities.slice(0, 5).map((opp) => (
          <Link
            key={opp.ticker}
            href={`/company/${opp.ticker}`}
            className="text-xs px-2.5 py-1 border border-indigo-500/30 bg-indigo-500/10 rounded text-indigo-300 hover:bg-indigo-500/20"
          >
            {opp.ticker} ({opp.scores.composite}/10)
          </Link>
        ))}
      </div>
    );
  }

  if (ticker) {
    return (
      <div className="mt-3 border-t border-[#2a2d3a] pt-2">
        <Link
          href={`/company/${ticker}`}
          className="text-xs px-3 py-1 border border-indigo-500/30 bg-indigo-500/10 rounded text-indigo-300 hover:bg-indigo-500/20"
        >
          → Voir la fiche {ticker}
        </Link>
      </div>
    );
  }

  return null;
}
