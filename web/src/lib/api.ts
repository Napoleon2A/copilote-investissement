/**
 * Client API — toutes les requêtes vers le backend FastAPI passent ici.
 * L'URL de base est configurée via NEXT_PUBLIC_API_URL dans .env.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Erreur ${res.status}`);
  }

  return res.json();
}

// ── Brief ─────────────────────────────────────────────────────────────────────

export const getBrief = () => request<Brief>("/brief");

// ── Companies ─────────────────────────────────────────────────────────────────

export const searchCompany = (q: string) =>
  request<{ source: string; company: CompanyInfo }>(`/companies/search?q=${q}`);

export const getCompany = (ticker: string) =>
  request<{ company: Company | null; live_info: LiveInfo | null }>(`/companies/${ticker}`);

export const getCompanyPrice = (ticker: string) =>
  request<PriceData>(`/companies/${ticker}/price`);

export const getCompanyScores = (ticker: string) =>
  request<ScoreResult>(`/companies/${ticker}/scores`);

export const getCompanyBrief = (ticker: string) =>
  request<CompanyBrief>(`/companies/${ticker}/brief`);

export const getCompanyNews = (ticker: string, count = 10) =>
  request<{ ticker: string; news: NewsItem[] }>(`/companies/${ticker}/news?count=${count}`);

export const getCompanyHistory = (ticker: string, period = "1y") =>
  request<{ data: OHLCVPoint[] }>(`/companies/${ticker}/history?period=${period}`);

export const syncCompany = (ticker: string) =>
  request(`/companies/${ticker}/sync`, { method: "POST" });

// ── Watchlists ────────────────────────────────────────────────────────────────

export const getWatchlists = () => request<Watchlist[]>("/watchlists");

export const createWatchlist = (name: string, description?: string) =>
  request<Watchlist>("/watchlists", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });

export const getWatchlist = (id: number) =>
  request<{ watchlist: Watchlist; items: WatchlistItem[] }>(`/watchlists/${id}`);

export const getWatchlistSnapshot = (id: number) =>
  request<WatchlistSnapshot>(`/watchlists/${id}/snapshot`);

export const addToWatchlist = (id: number, ticker: string, note?: string) =>
  request(`/watchlists/${id}/items`, {
    method: "POST",
    body: JSON.stringify({ ticker, note }),
  });

export const removeFromWatchlist = (id: number, ticker: string) =>
  request(`/watchlists/${id}/items/${ticker}`, { method: "DELETE" });

// ── Portfolio ─────────────────────────────────────────────────────────────────

export const getPositions = () => request<PortfolioData>("/portfolio/positions");

export const getTransactions = () => request<Transaction[]>("/portfolio/transactions");

export const addTransaction = (data: TransactionCreate) =>
  request("/portfolio/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deletePosition = (ticker: string) =>
  request(`/portfolio/positions/${ticker}`, { method: "DELETE" });

export const saveThesis = (ticker: string, data: ThesisCreate) =>
  request(`/portfolio/positions/${ticker}/thesis`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getThesis = (ticker: string) =>
  request<InvestmentThesis>(`/portfolio/positions/${ticker}/thesis`);

// ── Chat ──────────────────────────────────────────────────────────────────────

export const chatWithBot = (
  message: string,
  history: ChatMessage[] = [],
  context?: string
) =>
  request<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({ message, history, context }),
  });

// ── Scanner ───────────────────────────────────────────────────────────────────

export const getScanOpportunities = (maxResults = 10) =>
  request<{ count: number; opportunities: ScanOpportunity[] }>(
    `/scanner/opportunities?max_results=${maxResults}`
  );

export const getMacroScan = () => request<MacroScan>("/scanner/macro");

// ── Ideas ─────────────────────────────────────────────────────────────────────

export const getIdeas = () => request<IdeaSummary[]>("/ideas");

export const submitIdea = (ticker: string, userThesis?: string) =>
  request("/ideas", {
    method: "POST",
    body: JSON.stringify({ ticker, user_thesis: userThesis }),
  });

export const getIdea = (id: number) => request<IdeaDetail>(`/ideas/${id}`);

export const reviseIdea = (id: number, whatChanged: string) =>
  request(`/ideas/${id}/revise`, {
    method: "POST",
    body: JSON.stringify({ what_changed: whatChanged }),
  });

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarketContext {
  regime: string;
  regime_label: string;
  regime_advice: string;
  session_mood: string;
  vix?: number;
}

export interface Brief {
  date: string;
  generated_at: string;
  item_count: number;
  items: BriefItem[];
  market_summary: Record<string, MarketIndex>;
  market_context?: MarketContext;
  disclaimer: string;
}

export interface BriefPosition {
  quantity: number;
  avg_cost: number;
  cost_basis: number;
  market_value: number;
  pnl: number;
  pnl_pct: number | null;
  currency: string;
}

export interface BriefItem {
  ticker: string;
  type: string;
  context: string;
  current_price: number | null;
  change_1d: number | null;
  change_1m: number | null;
  signals: string[];
  scores: Record<string, number>;
  action: string;
  action_label: string;
  priority: number;
  why_now: string;
  position?: BriefPosition | null;
}

export interface MarketIndex {
  price: number | null;
  change_1d: number | null;
  change_ytd: number | null;
}

export interface Company {
  id: number;
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  currency?: string;
  market_cap?: number;
}

export interface CompanyInfo {
  ticker: string;
  name: string;
  exchange?: string;
  sector?: string;
}

export interface LiveInfo {
  name: string;
  sector?: string;
  industry?: string;
  description?: string;
  employees?: number;
  website?: string;
}

export interface PriceData {
  ticker: string;
  current_price: number;
  change_1d?: number;
  change_5d?: number;
  change_1m?: number;
  change_3m?: number;
  change_ytd?: number;
  pct_from_52w_high?: number;
  pct_from_52w_low?: number;
}

export interface ScoreDetail {
  score: number;
  reasons: string[];
}

export interface ScoreResult {
  ticker: string;
  composite_label: string;
  scores: {
    composite: number;
    quality: ScoreDetail;
    valuation: ScoreDetail;
    growth: ScoreDetail;
    momentum: ScoreDetail;
    risk: ScoreDetail;
  };
}

export interface CompanyBrief {
  ticker: string;
  name: string;
  sector?: string;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
  change_ytd?: number;
  scores: {
    composite: number;
    composite_label: string;
    quality: number;
    valuation: number;
    growth: number;
    momentum: number;
    risk: number;
  };
  pro_args: string[];
  con_args: string[];
  action: string;
  action_label: string;
  conviction: string;
  horizon: string;
  recent_news: NewsItem[];
  key_metrics: Record<string, number | null>;
  disclaimer: string;
}

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  published?: string;
}

export interface OHLCVPoint {
  Date: string;
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface Watchlist {
  id: number;
  name: string;
  description?: string;
  created_at: string;
}

export interface WatchlistItem {
  id: number;
  ticker: string;
  name: string;
  sector?: string;
  note?: string;
  added_at: string;
}

export interface WatchlistSnapshot {
  watchlist: string;
  item_count: number;
  snapshots: WatchlistSnapshotItem[];
}

export interface WatchlistSnapshotItem {
  ticker: string;
  name: string;
  sector?: string;
  note?: string;
  price?: number;
  change_1d?: number;
  change_1m?: number;
  change_ytd?: number;
  pct_from_52w_high?: number;
  composite_score?: number;
  composite_label?: string;
}

export interface PortfolioData {
  portfolio: string;
  currency: string;
  total_cost: number;
  total_value: number;
  total_pnl?: number;
  total_pnl_pct?: number;
  position_count: number;
  positions: PositionItem[];
  sector_exposure: Record<string, { value: number; weight: number }>;
}

export interface PositionItem {
  ticker: string;
  name: string;
  sector?: string;
  quantity: number;
  avg_cost: number;
  current_price?: number;
  cost_basis: number;
  market_value?: number;
  pnl?: number;
  pnl_pct?: number;
  change_1d?: number;
  pct_from_52w_high?: number;
}

export interface Transaction {
  id: number;
  ticker: string;
  name: string;
  type: string;
  quantity: number;
  price: number;
  fees: number;
  total: number;
  date: string;
  note?: string;
}

export interface TransactionCreate {
  ticker: string;
  type: "buy" | "sell";
  quantity: number;
  price: number;
  fees?: number;
  note?: string;
}

export interface ThesisCreate {
  thesis: string;
  catalysts?: string;
  risks?: string;
  horizon?: string;
  conviction?: number;
  invalidation_conditions?: string;
}

export interface InvestmentThesis {
  id: number;
  thesis: string;
  catalysts?: string;
  risks?: string;
  horizon?: string;
  conviction: number;
  invalidation_conditions?: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatResponse {
  type: string;
  text: string;
  data?: Record<string, unknown>;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  data?: Record<string, unknown>;
}

export interface MacroScan {
  macro: Record<string, { price?: number; change_1d?: number; change_ytd?: number }>;
  sectors: Record<string, { ticker: string; change_1d?: number; change_1m?: number; change_ytd?: number; pct_from_52w_high?: number }>;
  outperformers: Array<{ sector: string; outperformance: number }>;
  underperformers: Array<{ sector: string; underperformance: number }>;
  risk_regime: string;
  vix?: number;
  scanned_at: string;
}

export interface ScanOpportunity {
  ticker: string;
  name?: string;
  type: string;
  signal_type?: string;
  sector_group?: string;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
  change_3m?: number;
  change_ytd?: number;
  pct_from_52w_high?: number;
  scores: {
    composite: number;
    composite_label: string;
    quality: number;
    valuation: number;
    growth: number;
    momentum: number;
    risk: number;
  };
  highlights: string[];
  action: string;
  action_label: string;
  news_sentiment?: string;
  has_catalyst?: boolean;
  key_headlines?: string[];
  upside_vs_target?: number | null;
  analyst_count?: number | null;
  market_cap?: number | null;
}

export interface IdeaSummary {
  id: number;
  ticker: string;
  name: string;
  conviction?: string;
  action?: string;
  horizon?: string;
  created_at: string;
  updated_at?: string;
}

export interface IdeaDetail {
  idea: {
    id: number;
    user_thesis?: string;
    system_opinion?: string;
    pro_args?: string;
    con_args?: string;
    validation_conditions?: string;
    conviction?: string;
    action?: string;
    horizon?: string;
    created_at: string;
    updated_at?: string;
  };
  company: Company;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
}
