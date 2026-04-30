"use client";

import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Cache module-level : un même ticker n'est fetché qu'une seule fois par session
const sparklineCache = new Map<string, number[]>();
const sparklinePending = new Map<string, Promise<number[] | null>>();

interface SparklineProps {
  ticker: string;
  width?: number;
  height?: number;
  /** Période yfinance : 1mo, 3mo, 6mo, 1y */
  period?: string;
}

async function fetchHistory(ticker: string, period: string): Promise<number[] | null> {
  const key = `${ticker}-${period}`;

  // Cache hit
  if (sparklineCache.has(key)) return sparklineCache.get(key)!;

  // Fetch en cours pour ce ticker → on s'y attache
  if (sparklinePending.has(key)) return sparklinePending.get(key)!;

  // Nouveau fetch
  const promise = fetch(`${API}/companies/${ticker}/history?period=${period}`)
    .then((r) => r.ok ? r.json() : null)
    .then((d) => {
      if (!d?.data) return null;
      const closes = d.data.map((p: any) => p.Close).filter((v: any) => typeof v === "number");
      sparklineCache.set(key, closes);
      return closes;
    })
    .catch(() => null)
    .finally(() => {
      sparklinePending.delete(key);
    });

  sparklinePending.set(key, promise);
  return promise;
}

export function Sparkline({ ticker, width = 80, height = 28, period = "1mo" }: SparklineProps) {
  const [points, setPoints] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchHistory(ticker, period).then((data) => {
      if (cancelled || !data) return;
      setPoints(data);
    });
    return () => { cancelled = true; };
  }, [ticker, period]);

  if (!points || points.length < 2) {
    return <div style={{ width, height }} className="bg-surface-alt/40 rounded animate-pulse" />;
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const path = points
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const isUp = points[points.length - 1] >= points[0];
  const stroke = isUp ? "rgb(16 185 129)" : "rgb(239 68 68)"; // emerald-500 / red-500
  const gradId = `spark-${ticker}-${isUp ? "up" : "down"}`;

  // Aire sous la courbe
  const areaPath = `${path} L${width.toFixed(1)},${height.toFixed(1)} L0,${height.toFixed(1)} Z`;

  // Dernier point pour mettre un dot
  const lastX = (points.length - 1) * stepX;
  const lastY = height - ((points[points.length - 1] - min) / range) * height;

  return (
    <svg width={width} height={height} className="overflow-visible">
      <defs>
        <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r="2" fill={stroke} />
    </svg>
  );
}
