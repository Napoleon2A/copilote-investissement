"use client";

import { useEffect, useState } from "react";
import { fetchJSON, API } from "./shared";
import { IcRates } from "./icons";

const COUNTRY_FLAGS: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", FR: "🇫🇷", DE: "🇩🇪", GB: "🇬🇧", UK: "🇬🇧",
  JP: "🇯🇵", CN: "🇨🇳", CH: "🇨🇭", CA: "🇨🇦", AU: "🇦🇺",
};

// Pays high-impact pour un investisseur global français : US/EU drivers + GB, JP, CN macro influents + FR/DE pour la zone euro.
const HIGH_IMPACT_COUNTRIES = "US,EU,GB,JP,CN,FR,DE";

export function EconomicCalendarPanel() {
  const [data, setData] = useState<any>(undefined);

  useEffect(() => {
    fetchJSON<any>(
      `${API}/finnhub/economic-calendar?max_days=15&lookback_days=7&only_high=true&countries=${HIGH_IMPACT_COUNTRIES}`
    ).then(setData);
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

  const pastCount = events.filter((e: any) => e.is_past).length;
  const upcomingCount = events.length - pastCount;

  return (
    <div className="card-premium relative p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <IcRates size={16} className="text-accent" />
          <h4 className="text-xs font-bold uppercase tracking-[0.14em] text-secondary"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Events macro · récents &amp; à venir
          </h4>
        </div>
        <span className="text-[0.7rem] text-muted">
          {pastCount} récents · {upcomingCount} à venir
        </span>
      </div>

      <div className="space-y-2 max-h-[260px] overflow-y-auto pr-2 nice-scroll">
        {Object.entries(grouped).slice(0, 12).map(([day, items]) => {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const eventDate = new Date(day);
          eventDate.setHours(0, 0, 0, 0);
          const daysFromToday = Math.round((eventDate.getTime() - today.getTime()) / 86400000);
          const dateStr = eventDate.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

          // Pastille temporelle : "Hier" / "J-X" / "Auj." / "Demain" / "J+X"
          const pillLabel =
            daysFromToday === 0 ? "Auj." :
            daysFromToday === -1 ? "Hier" :
            daysFromToday === 1 ? "Demain" :
            daysFromToday < 0 ? `J${daysFromToday}` :
            `J+${daysFromToday}`;
          const pillStyle =
            daysFromToday === 0 ? "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30"
            : Math.abs(daysFromToday) <= 3 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
            : "bg-surface-alt text-muted border-edge";

          return (
            <div key={day}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[0.625rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap ${pillStyle}`}>
                  {pillLabel}
                </span>
                <span className="text-xs font-medium text-secondary capitalize">{dateStr}</span>
              </div>
              <ul className="space-y-1.5 ml-1">
                {items.map((e: any, i: number) => <EventRow key={i} ev={e} />)}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Format compact d'une valeur (53.2, 2.4%, 250K)
function fmt(v: any): string {
  if (v == null || v === "") return "—";
  const num = Number(v);
  if (Number.isNaN(num)) return String(v);
  const av = Math.abs(num);
  if (av >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (av >= 1000) return `${(num / 1000).toFixed(1)}K`;
  if (av >= 100) return num.toFixed(0);
  if (av < 10) return num.toFixed(2);
  return num.toFixed(1);
}

function EventRow({ ev }: { ev: any }) {
  const flag = COUNTRY_FLAGS[ev.country] ?? ev.country;
  const isPast = !!ev.is_past;
  const actual = ev.actual;
  const estimate = ev.estimate;
  const prev = ev.prev;

  // Couleur du chiffre actual : surprise haussière vs estimate = bleu, baissière = ambre
  let actualTone = "text-primary";
  if (isPast && actual != null && estimate != null) {
    const a = Number(actual), e = Number(estimate);
    if (!Number.isNaN(a) && !Number.isNaN(e) && e !== 0) {
      const diffPct = ((a - e) / Math.abs(e)) * 100;
      if (diffPct > 2) actualTone = "text-sky-700 dark:text-sky-400";
      else if (diffPct < -2) actualTone = "text-amber-700 dark:text-amber-400";
    }
  }

  return (
    <li className="text-[0.7rem] py-0.5">
      <div className="flex items-center gap-2">
        <span className="flex-shrink-0">{flag}</span>
        <span className="flex-1 text-primary truncate">{ev.event}</span>
        {isPast && actual != null ? (
          <span className={`font-mono text-[0.7rem] font-semibold ${actualTone}`}>{fmt(actual)}</span>
        ) : estimate != null ? (
          <span className="font-mono text-[0.65rem] text-muted">cons. {fmt(estimate)}</span>
        ) : null}
      </div>
      {/* Ligne secondaire : interprétation pour les passés, ou consensus + précédent pour les à venir */}
      {isPast && ev.interpretation ? (
        <p className="ml-6 mt-0.5 text-[0.625rem] text-secondary leading-snug">{ev.interpretation}</p>
      ) : isPast && actual != null ? (
        // Pas d'interprétation possible (estimate manque) — on affiche au moins prev
        prev != null && (
          <p className="ml-6 mt-0.5 text-[0.625rem] text-muted leading-snug">vs précédent {fmt(prev)}</p>
        )
      ) : !isPast && prev != null ? (
        <p className="ml-6 mt-0.5 text-[0.625rem] text-muted leading-snug">précédent {fmt(prev)}</p>
      ) : null}
    </li>
  );
}
