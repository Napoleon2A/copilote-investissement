import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { BackgroundLines } from "@/components/ui/BackgroundLines";

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
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#EEF2F6] text-[#0B1929]">
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
      </body>
    </html>
  );
}
