"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { chatWithBot } from "@/lib/api";
import type { ChatMessage } from "@/lib/api";
import { useDocumentTitle } from "@/lib/useDocumentTitle";

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
  useDocumentTitle("Chat");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "assistant",
      text: "## Austerlitz Hedge Fund\n\nPose-moi une question sur le marché, un ticker ou une opportunité.\n\nExemples :\n• *Analyse AAPL*\n• *Meilleures opportunités*\n• *État du marché*\n• *News sur NVDA*\n• *Explique le P/E*",
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
        prev.map((m) => m.loading ? { ...m, text: response.text, data: response.data, loading: false } : m)
      );
    } catch {
      setMessages((prev) =>
        prev.map((m) => m.loading ? { ...m, text: "Erreur de connexion au backend.", loading: false } : m)
      );
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-100px)] sm:h-[calc(100vh-120px)]">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-primary"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Chatbot
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Analyse, opportunités, news, concepts — en langage naturel
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        <div ref={bottomRef} />
      </div>

      {messages.length <= 1 && (
        <div className="flex flex-wrap gap-2 py-3">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => sendMessage(s)}
              className="text-xs px-3 py-1.5 border border-edge rounded-full text-secondary
                         hover:border-navy/30 hover:text-navy bg-surface transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
        className="flex gap-2 pt-3 border-t border-edge">
        <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)}
          placeholder="Pose une question… (ex: Analyse AAPL, opportunités, marché)"
          disabled={loading}
          className="flex-1 bg-surface border border-edge rounded-lg px-4 py-2.5 text-sm
                     text-primary placeholder-muted focus:outline-none focus:border-navy
                     disabled:opacity-50 transition-colors"
          autoComplete="off" />
        <button type="submit" disabled={loading || !input.trim()}
          className="px-4 py-2 bg-navy hover:bg-navy-hover rounded-lg text-white text-sm
                     transition-colors disabled:opacity-40 flex-shrink-0 font-medium">
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
        <div className="w-7 h-7 rounded-full bg-navy flex-shrink-0 flex items-center justify-center text-[10px] text-accent font-bold"
             style={{ fontFamily: "'Space Grotesk', sans-serif" }}>A</div>
        <div className="flex-1 rounded-lg bg-surface border border-edge p-4 shadow-sm">
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-1.5 h-1.5 bg-navy rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex gap-3 flex-row-reverse">
        <div className="w-7 h-7 rounded-full bg-surface-alt border border-edge flex-shrink-0 flex items-center justify-center text-xs text-secondary">
          →
        </div>
        <div className="rounded-lg bg-navy px-4 py-2.5 text-sm text-white max-w-md shadow-sm">
          {message.text}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-navy flex-shrink-0 flex items-center justify-center text-[10px] text-accent font-bold"
           style={{ fontFamily: "'Space Grotesk', sans-serif" }}>A</div>
      <div className="flex-1 rounded-lg bg-surface border border-edge p-4 shadow-sm">
        <MarkdownText text={message.text} />
        {!!message.data && <DataLinks data={message.data as Record<string, unknown>} />}
      </div>
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-sm text-primary space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return <p key={i} className="text-base font-semibold text-navy mb-2"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{line.slice(3)}</p>;
        if (line.startsWith("**") && line.endsWith("**") && line.length > 4)
          return <p key={i} className="font-semibold text-primary">{line.slice(2, -2)}</p>;
        if (line.startsWith("+ ")) return <p key={i} className="text-green-700 text-xs">{line}</p>;
        if (line.startsWith("− ") || line.startsWith("- ")) return <p key={i} className="text-red-700 text-xs">{line}</p>;
        if (line.startsWith("• ") || line.startsWith("* ")) return <p key={i} className="text-secondary text-xs pl-2">{line}</p>;
        if (line.startsWith("↳ ")) return <p key={i} className="text-muted text-xs pl-4">{line}</p>;
        if (line === "") return <div key={i} className="h-1" />;
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
  const opportunities = data.opportunities as Array<{ ticker: string; scores: { composite: number }; action_label: string }> | undefined;
  const ticker = data.ticker as string | undefined;

  if (opportunities && opportunities.length > 0) {
    return (
      <div className="mt-3 flex flex-wrap gap-2 border-t border-edge pt-2">
        {opportunities.slice(0, 5).map((opp) => (
          <Link key={opp.ticker} href={`/company/${opp.ticker}`}
            className="text-xs px-2.5 py-1 border border-navy/20 bg-bg rounded text-navy hover:bg-surface-alt transition-colors">
            {opp.ticker} ({opp.scores.composite}/10)
          </Link>
        ))}
      </div>
    );
  }

  if (ticker) {
    return (
      <div className="mt-3 border-t border-edge pt-2">
        <Link href={`/company/${ticker}`}
          className="text-xs px-3 py-1 border border-navy/20 bg-bg rounded text-navy hover:bg-surface-alt transition-colors">
          → Voir la fiche {ticker}
        </Link>
      </div>
    );
  }

  return null;
}
