import type { Metadata } from "next";
import "./globals.css";
import { TopBar } from "@/components/layout/TopBar";
import { NavBar } from "@/components/layout/NavBar";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { BackgroundLines } from "@/components/ui/BackgroundLines";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: {
    default: "Austerlitz Hedge Fund",
    template: "%s · Austerlitz",
  },
  description: "Suivi, analyse et aide à la décision en investissement",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Script anti-flash : applique la classe .dark avant le rendu,
  // en se basant sur localStorage puis sur la préférence système.
  const themeInitScript = `
    (function() {
      try {
        var stored = localStorage.getItem('theme');
        var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        var isDark = stored === 'dark' || (stored === null && prefersDark);
        if (isDark) document.documentElement.classList.add('dark');
      } catch (e) {}
    })();
  `;

  return (
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-bg text-primary">
        <ToastProvider>
          <div className="flex flex-col h-screen overflow-hidden">
            <TopBar />
            <NavBar />
            <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6 relative">
              <BackgroundLines />
              <div className="relative z-10">{children}</div>
            </main>
          </div>
          <ChatWidget />
        </ToastProvider>
      </body>
    </html>
  );
}
