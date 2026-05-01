"use client";

/**
 * Icônes centralisées pour le dashboard — wrappers autour de Lucide React.
 * Utilisées partout pour remplacer les emojis (🌍 📰 🎯 ⚖️ etc.).
 */

import {
  Globe2, Newspaper, Target, Scale, Landmark, Zap, BarChart3,
  Wallet, Eye, CalendarDays, Lightbulb, Bot, Sparkles, BookOpen,
  RotateCw, TrendingUp, DollarSign, Factory, Building2,
  AlertOctagon, AlertTriangle, CheckCircle2, ArrowUp, ArrowDown,
  Crosshair, Briefcase, Earth, Coins, Fuel,
} from "lucide-react";

interface IconProps {
  size?: number;
  className?: string;
}

/* ── Section icons ──────────────────────────────────────────────────── */
export const IcMarket       = (p: IconProps) => <Globe2     {...p} />; // Comprendre le marché
export const IcMacroNews    = (p: IconProps) => <Newspaper  {...p} />; // Actualité macro
export const IcLinkedNews   = (p: IconProps) => <Target     {...p} />; // Actualité des cibles
export const IcInsights     = (p: IconProps) => <Crosshair  {...p} />; // Analyse personnalisée

/* ── Stat cards ─────────────────────────────────────────────────────── */
export const IcEarnings   = (p: IconProps) => <CalendarDays {...p} />; // Earnings
export const IcPortfolio  = (p: IconProps) => <Briefcase    {...p} />; // Portefeuille
export const IcWatchlist  = (p: IconProps) => <Eye          {...p} />; // Watchlist
export const IcAlerts     = (p: IconProps) => <Zap          {...p} />; // Alertes
export const IcIdea       = (p: IconProps) => <Lightbulb    {...p} />; // Recherche / Idée
export const IcAnalyst    = (p: IconProps) => <Bot          {...p} />; // Analyste IA

/* ── News categories ────────────────────────────────────────────────── */
export const IcMacro        = (p: IconProps) => <Landmark   {...p} />; // Banques centrales
export const IcGeopolitical = (p: IconProps) => <Earth      {...p} />; // Géopolitique
export const IcRegulatory   = (p: IconProps) => <Scale      {...p} />; // Réglementaire
export const IcSector       = (p: IconProps) => <Factory    {...p} />; // Sectoriel
export const IcCompany      = (p: IconProps) => <Building2  {...p} />; // Société

/* ── Insight tones ──────────────────────────────────────────────────── */
export const IcDanger  = (p: IconProps) => <AlertOctagon  {...p} />;
export const IcWarning = (p: IconProps) => <AlertTriangle {...p} />;
export const IcInfo    = (p: IconProps) => <Lightbulb     {...p} />;
export const IcGood    = (p: IconProps) => <CheckCircle2  {...p} />;

/* ── Macro indicators ───────────────────────────────────────────────── */
export const IcIndices   = (p: IconProps) => <BarChart3   {...p} />;
export const IcRates     = (p: IconProps) => <DollarSign  {...p} />;
export const IcDollar    = (p: IconProps) => <DollarSign  {...p} />;
export const IcGold      = (p: IconProps) => <Coins       {...p} />;
export const IcOil       = (p: IconProps) => <Fuel        {...p} />;
export const IcRotation  = (p: IconProps) => <RotateCw    {...p} />;
export const IcDiagnosis = (p: IconProps) => <BarChart3   {...p} />;
export const IcSparkles  = (p: IconProps) => <Sparkles    {...p} />;
export const IcUp        = (p: IconProps) => <ArrowUp     {...p} />;
export const IcDown      = (p: IconProps) => <ArrowDown   {...p} />;
export const IcTrending  = (p: IconProps) => <TrendingUp  {...p} />;
export const IcWallet    = (p: IconProps) => <Wallet      {...p} />;
export const IcBookOpen  = (p: IconProps) => <BookOpen    {...p} />;
