import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
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
      <body className="min-h-screen bg-[#EEF2F6] text-[#0B1929]">
        <ToastProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
              <TopBar />
              <main className="flex-1 overflow-y-auto p-3 sm:p-6 relative">
                <BackgroundLines />
                <div className="relative z-10">{children}</div>
              </main>
            </div>
          </div>
          <ChatWidget />
        </ToastProvider>
      </body>
    </html>
  );
}
