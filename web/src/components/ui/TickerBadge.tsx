"use client";

import { useState } from "react";
import { getTickerMeta, getLogoUrl, SECTOR_COLORS, SECTOR_LABEL } from "@/lib/tickerMeta";

interface TickerBadgeProps {
  ticker: string;
  size?: "xs" | "sm" | "md" | "lg";
  showName?: boolean;
  showSector?: boolean;
  nameOverride?: string;
}

const SIZE_MAP = {
  xs: { logo: "w-5 h-5", ticker: "text-[10px]", name: "text-[9px]" },
  sm: { logo: "w-6 h-6", ticker: "text-xs",     name: "text-[10px]" },
  md: { logo: "w-8 h-8", ticker: "text-sm",     name: "text-[11px]" },
  lg: { logo: "w-12 h-12", ticker: "text-base", name: "text-xs" },
};

export function TickerBadge({
  ticker, size = "sm", showName = true, showSector = false, nameOverride,
}: TickerBadgeProps) {
  const meta = getTickerMeta(ticker);
  const logoUrl = getLogoUrl(ticker);
  const sizes = SIZE_MAP[size];
  const displayName = nameOverride || meta.name;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Logo url={logoUrl} ticker={ticker} className={sizes.logo} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`font-mono font-bold tracking-tight text-navy dark:text-accent ${sizes.ticker}`}>
            {ticker}
          </span>
          {showSector && meta.sector && (
            <span className={`text-[8px] font-semibold px-1 py-px rounded uppercase tracking-wider border ${SECTOR_COLORS[meta.sector].bg} ${SECTOR_COLORS[meta.sector].text} ${SECTOR_COLORS[meta.sector].border}`}>
              {SECTOR_LABEL[meta.sector]}
            </span>
          )}
        </div>
        {showName && displayName !== ticker && (
          <div className={`text-secondary truncate leading-tight ${sizes.name}`}>
            {displayName}
          </div>
        )}
      </div>
    </div>
  );
}

function Logo({ url, ticker, className }: { url: string | null; ticker: string; className: string }) {
  const [error, setError] = useState(false);
  const meta = getTickerMeta(ticker);

  if (!url || error) {
    // Fallback premium : initiales sur fond gradient sectoriel
    const sectorColors = meta.sector ? SECTOR_COLORS[meta.sector] : null;
    const bg = sectorColors?.bg ?? "bg-gradient-to-br from-navy/15 to-navy/5 dark:from-accent/20 dark:to-accent/5";
    const txt = sectorColors?.text ?? "text-navy dark:text-accent";
    return (
      <div className={`${className} logo-tile rounded-lg flex items-center justify-center font-semibold font-mono ${bg} ${txt} flex-shrink-0`}>
        {ticker.charAt(0)}
      </div>
    );
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={url}
      alt={ticker}
      loading="lazy"
      decoding="async"
      className={`${className} logo-tile rounded-lg object-contain p-1 flex-shrink-0`}
      onError={() => setError(true)}
    />
  );
}
