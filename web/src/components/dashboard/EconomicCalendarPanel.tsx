"use client";

import { useEffect, useState } from "react";
import { fetchJSON, API } from "./shared";
import { IcRates } from "./icons";

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", FR: "🇫🇷", DE: "🇩🇪", GB: "🇬🇧", UK: "🇬🇧",
  JP: "🇯🇵", CN: "🇨🇳", CH: "🇨🇭", CA: "🇨🇦", AU: "🇦🇺",
};

const IMPACT_STYLES: Record<string, string> = {
  high:   "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  low:    "bg-surface-alt text-muted border-edge",
};

export function EconomicCalendarPanel() {
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    fetchJSON<any>(`${API}/finnhub/economic-calendar?max_days=15&only_high=true&countries=US,EU`).then(setData);
  }, []);

  if (data === undefined) return <div className="card-premium p-4 h-32 animate-pulse" />;

  const events = data?.events ?? [];
  if (events.length === 0) return null;

  // Groupement par jour
  const grouped: Record<string, any[]> = {};
  for (const e of events) {
    const day = (e.time ?? "").slice(0, 10);
    if (!day) continue;
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(e);
  }

  return (
    <div className="card-premium relative p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IcRates size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Events macro à venir
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">{events.length} high impact · 15j</span>
      </div>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {Object.entries(grouped).slice(0, 10).map(([day, items]) => {
          const date = new Date(day);
          const dateStr = date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eventDate = new Date(day);
          eventDate.setHours(0, 0, 0, 0);
          const daysUntil = Math.round((eventDate.getTime() - today.getTime()) / 86400000);

          return (
            <div key={day}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[0.625rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap
                  ${daysUntil === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
                    : daysUntil <= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                    : "bg-surface-alt text-muted border-edge"}`}>
                  {daysUntil === 0 ? "Auj." : daysUntil === 1 ? "Demain" : `J-${daysUntil}`}
                </span>
                <span className="text-xs font-medium text-secondary capitalize">{dateStr}</span>
              </div>
              <ul className="space-y-1 ml-1">
                {items.map((e: any, i: number) => (
                  <li key={i} className="flex items-center gap-2 text-[0.7rem] py-0.5">
                    <span className="flex-shrink-0">{COUNTRY_FLAGS[e.country] ?? e.country}</span>
                    <span className="flex-1 text-primary truncate">{e.event}</span>
                    <span className={`text-[0.55rem] font-bold uppercase px-1 py-px rounded border ${IMPACT_STYLES[(e.impact ?? "low").toLowerCase()] ?? IMPACT_STYLES.low}`}>
                      {(e.impact ?? "?").toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
