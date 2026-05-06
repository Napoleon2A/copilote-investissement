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
  request<{ status: string }>(`/companies/${ticker}/sync`, { method: "POST" });

export const getCompetitors = (ticker: string) =>
  request<CompetitorData>(`/companies/${ticker}/competitors`);

export interface CompetitorEntry {
  ticker: string;
  name: string;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
  change_ytd?: number;
  composite_score?: number;
  quality_score?: number;
  valuation_score?: number;
  error?: boolean;
}

export interface CompetitorData {
  ticker: string;
  sector: string | null;
  competitors: CompetitorEntry[];
}

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
  request<{ status: string; ticker: string }>(`/watchlists/${id}/items`, {
    method: "POST",
    body: JSON.stringify({ ticker, note }),
  });

export const removeFromWatchlist = (id: number, ticker: string) =>
  request<{ status: string }>(`/watchlists/${id}/items/${ticker}`, { method: "DELETE" });

// ── Portfolio ─────────────────────────────────────────────────────────────────

export const getPositions = () => request<PortfolioData>("/portfolio/positions");

export const getTransactions = () => request<Transaction[]>("/portfolio/transactions");

export const addTransaction = (data: TransactionCreate) =>
  request<{ status: string; transaction: Transaction }>("/portfolio/transactions", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deletePosition = (ticker: string) =>
  request<{ status: string }>(`/portfolio/positions/${ticker}`, { method: "DELETE" });

export const saveThesis = (ticker: string, data: ThesisCreate) =>
  request<{ status: string; thesis: InvestmentThesis }>(`/portfolio/positions/${ticker}/thesis`, {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getThesis = (ticker: string) =>
  request<InvestmentThesis>(`/portfolio/positions/${ticker}/thesis`);

// ── Earnings ─────────────────────────────────────────────────────────────────

export const getUpcomingEarnings = (maxDays = 21) =>
  request<{ count: number; earnings: EarningsPlay[] }>(`/earnings/upcoming?max_days=${maxDays}`);

export interface EarningsPlay {
  ticker: string;
  name: string;
  sector: string | null;
  earnings_date: string;
  days_until: number;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
  pct_from_52w_high?: number;
  volatility_estimate: string;
  scores: {
    composite: number;
    quality: number;
    valuation: number;
    growth: number;
    momentum: number;
    risk: number;
  };
  composite_label: string;
  recommendation: string;
  recommendation_label: string;
  recommendation_reason: string;
  revenue_estimate?: number;
  eps_estimate?: number;
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export const fetchAlerts = () =>
  request<{ count: number; alerts: AlertData[] }>("/alerts");

export const createAlert = (data: AlertCreate) =>
  request<AlertData>("/alerts", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const deleteAlert = (id: number) =>
  request<{ id: number; status: string }>(`/alerts/${id}`, { method: "DELETE" });

export const checkAlerts = () =>
  request<{ checked: number; newly_triggered: number; alerts: AlertData[] }>(
    "/alerts/check",
    { method: "POST" }
  );

export const fetchTriggeredAlerts = () =>
  request<{ count: number; alerts: AlertData[] }>("/alerts/triggered");

export interface AlertData {
  id: number;
  ticker: string;
  type: AlertType;
  condition_value?: number | null;
  message?: string | null;
  triggered: boolean;
  triggered_at?: string | null;
  created_at: string;
}

export interface AlertCreate {
  ticker: string;
  type: AlertType;
  condition_value?: number;
  message?: string;
}

export type AlertType = "price_above" | "price_below" | "change_pct" | "earnings";

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

// ── Discovery signals (validation multi-angles) ───────────────────────────────

export interface EtfSignal {
  present: boolean;
  etf_count: number;
  etfs: string[];
  avg_weight?: number;
}

export interface SmartMoneyHighlight {
  fund_name: string;
  status?: "initiated" | "increased" | "decreased" | "exited" | string | null;
  position_pct: number;
  delta_pct?: number | null;
  report_date?: string | null;
  filing_date?: string | null;
}

export interface SmartMoneySignal {
  present: boolean;
  concentrated_holders: number;
  initiated: number;
  highlights: SmartMoneyHighlight[];
  latest_report_date?: string | null;
  latest_filing_date?: string | null;
  freshness_days?: number | null;
  error?: string;
}

export interface InsiderSignal {
  present: boolean;
  net_value_usd: number;
  net_value_weighted_usd?: number;
  buy_value_usd: number;
  sell_value_usd: number;
  buy_count: number;
  sell_count: number;
  transactions_count: number;
  net_pct_market_cap_bps: number | null;
  is_significant: boolean;
  latest_transaction_date?: string | null;
  error?: string;
}

export interface PoliticalSignal {
  ticker: string;
  count: number;
  buy_count: number;
  sell_count: number;
  highlights: { name: string; transaction: string; amount_range?: string; date?: string }[];
  source_available: boolean;
}

export interface AnalystSignal {
  present: boolean;
  buy_pct: number | null;
  trend_6m_pp: number | null;
  consensus: "strong_buy" | "buy" | "hold" | "sell" | null;
  n_analysts: number;
  upside_pct: number | null;
  is_strong_buy: boolean;
  error?: string;
}

export interface SignalStrength {
  score: number;
  label: "fort" | "moyen" | "faible" | "absent" | "indispo" | string;
  components: Record<string, number>;
}

export interface TickerSignals {
  etf: EtfSignal;
  smart_money: SmartMoneySignal;
  insider: InsiderSignal;
  analyst: AnalystSignal;
  political: PoliticalSignal;
  signal_strength: SignalStrength;
}

export const getDiscoverySignals = (tickers: string[]) =>
  request<Record<string, TickerSignals>>(
    `/discovery/signals?tickers=${encodeURIComponent(tickers.join(","))}`
  );

// Smart-money radar — opportunités issues directement des 13-F (initiations
// récentes par fonds high-conviction). Canal de découverte indépendant du
// scanner momentum classique.
export interface SmartMoneyRadarItem {
  symbol: string;
  name: string;
  initiated_count: number;
  increased_count: number;
  bullish_count: number;
  concentrated_holders: number;
  highlights: SmartMoneyHighlight[];
  score: number;
}

export interface SmartMoneyRadarResponse {
  total: number;
  limit: number;
  min_funds: number;
  max_fund_positions: number;
  duration_seconds: number;
  radar: SmartMoneyRadarItem[];
}

export const getSmartMoneyRadar = (params?: { minFunds?: number; limit?: number }) => {
  const qs = new URLSearchParams();
  if (params?.minFunds) qs.set("min_funds", String(params.minFunds));
  if (params?.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return request<SmartMoneyRadarResponse>(`/discovery/smart-money-radar${suffix}`);
};

// Scanner status — endpoint léger pour polling pendant un refresh
export interface ScannerStatus {
  is_refreshing: boolean;
  has_results: boolean;
  count: number;
  computed_at: string | null;
  cache_age_seconds: number | null;
  universe_size: number;
}

export const getScannerStatus = () => request<ScannerStatus>("/scanner/status");

// ── Earnings Trade — Opérations court terme ─────────────────────────────────

export interface EarningsTrade {
  id: number;
  ticker: string;
  earnings_date: string;
  days_until_earnings: number;
  claude_verdict: "buy" | "skip";
  claude_conviction: "faible" | "moyen" | "élevé";
  expected_surprise_pct: number | null;
  target_buy_price: number | null;
  target_sell_price: number | null;
  stop_loss_price: number | null;
  rationale: string | null;
  key_signals: string[];
  status: "pending" | "triggered" | "closed_win" | "closed_loss" | "missed";
  generated_at: string | null;
  notes: string | null;
}

export interface EarningsTradePromptResponse {
  prompt: string;
  candidates: { ticker: string; earnings_date: string; source: string }[];
  days_ahead: number;
  n_candidates?: number;
}

export interface EarningsTradeImportResult {
  created: number;
  updated: number;
  skipped: number;
  items: { ticker: string; status: string; id?: number }[];
  warning?: string;
  error?: string;
}

export const getEarningsTradePrompt = (daysAhead = 14) =>
  request<EarningsTradePromptResponse>(`/earnings-trade/prompt?days_ahead=${daysAhead}`);

export const importEarningsTradeResponse = (responseText: string) =>
  request<EarningsTradeImportResult>("/earnings-trade/import", {
    method: "POST",
    body: JSON.stringify({ response_text: responseText }),
  });

export const getActiveEarningsTrades = () =>
  request<{ count: number; trades: EarningsTrade[] }>("/earnings-trade/active");

export const updateEarningsTradeStatus = (
  id: number,
  status: EarningsTrade["status"],
  notes?: string,
) =>
  request<{ ok: boolean; id: number; status: string }>(`/earnings-trade/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status, notes }),
  });

// ── Liste unifiée scanner + radar (fusion partagée home / /opportunities) ────

export type UnifiedSource = "scanner" | "radar" | "both";

export interface UnifiedItem {
  ticker: string;
  source: UnifiedSource;
  scanner?: ScanOpportunity;
  radar?: SmartMoneyRadarItem;
}

export function buildUnifiedList(
  scanner: ScanOpportunity[] | undefined,
  radar: SmartMoneyRadarItem[] | undefined,
): UnifiedItem[] {
  const out: UnifiedItem[] = (scanner ?? []).map((o) => ({
    ticker: o.ticker,
    source: "scanner",
    scanner: o,
  }));
  const seen = new Set(out.map((x) => x.ticker));
  for (const r of radar ?? []) {
    if (seen.has(r.symbol)) {
      const existing = out.find((x) => x.ticker === r.symbol);
      if (existing) {
        existing.source = "both";
        existing.radar = r;
      }
    } else {
      out.push({ ticker: r.symbol, source: "radar", radar: r });
      seen.add(r.symbol);
    }
  }
  return out;
}

// ── Ideas ─────────────────────────────────────────────────────────────────────

export const getIdeas = () => request<IdeaSummary[]>("/ideas");

export const submitIdea = (ticker: string, userThesis?: string) =>
  request<{ idea: { id: number }; company: Company }>("/ideas", {
    method: "POST",
    body: JSON.stringify({ ticker, user_thesis: userThesis }),
  });

export const getIdea = (id: number) => request<IdeaDetail>(`/ideas/${id}`);

export const reviseIdea = (id: number, whatChanged: string) =>
  request<IdeaDetail>(`/ideas/${id}/revise`, {
    method: "POST",
    body: JSON.stringify({ what_changed: whatChanged }),
  });

// ── Risk ──────────────────────────────────────────────────────────────────────

export const calculatePositionSize = (data: PositionSizeRequest) =>
  request<PositionSizeResult>("/risk/position-size", {
    method: "POST",
    body: JSON.stringify(data),
  });

export const getStopLoss = (ticker: string) =>
  request<StopLossResult>(`/risk/stop-loss/${ticker}`);

// ── Analyst (Claude API) ─────────────────────────────────────────────────────

export const analyzeDeep = (ticker: string) =>
  request<DeepAnalysis>(`/analyst/analyze/${ticker}`, { method: "POST" });

export const runWeeklySelection = () =>
  request<WeeklySelectionResult>("/analyst/run-weekly", { method: "POST" });

export const getWeeklySelection = () =>
  request<WeeklySelectionResult>("/analyst/weekly-selection");

export const getAnalystBudget = () =>
  request<AnalystBudget>("/analyst/budget");

export const getAnalysis = (ticker: string) =>
  request<{ analysis: DeepAnalysis | null }>(`/analyst/analysis/${ticker}`);

export const getPromptForClipboard = (ticker: string) =>
  request<PromptResult>(`/analyst/prompt/${ticker}`);

export const getWeeklyPromptForClipboard = () =>
  request<WeeklyPromptResult>("/analyst/prompt/weekly");

export interface WeeklyPromptResult {
  tickers: string[];
  scan_count: number;
  prompt: string;
  data_sources: Record<string, boolean>;
  char_count: number;
  estimated_tokens: number;
}

export interface PromptResult {
  ticker: string;
  company_name: string;
  prompt: string;
  data_sources: Record<string, boolean>;
  char_count: number;
  estimated_tokens: number;
}

export interface DeepAnalysis {
  ticker: string;
  business_summary?: string | null;
  competitive_moat?: string | null;
  value_chain?: string | null;
  financial_dynamics?: string | null;
  current_momentum?: string | null;
  specific_risks?: string | null;
  investment_thesis?: string | null;
  verdict_action: string;
  verdict_conviction: string;
  verdict_horizon?: string | null;
  ideal_entry_price?: number | null;
  one_liner?: string | null;
  generated_at: string;
  cost_usd: number;
  from_cache?: boolean;
}

export interface WeeklySelectionResult {
  selection: {
    week_start: string;
    rationale: string;
    generated_at: string;
  } | null;
  theses: DeepAnalysis[];
}

export interface AnalystBudget {
  monthly_spend: number;
  monthly_limit: number;
  remaining: number;
  month: string;
}

export const importAnalysis = (ticker: string, analysisText: string) =>
  request<DeepAnalysis>(`/analyst/import/${ticker}`, {
    method: "POST",
    body: JSON.stringify({ analysis_text: analysisText }),
  });

export const importWeeklyAnalysis = (tickers: string[], analysisText: string) =>
  request<{ id: number; tickers: string[]; selection_rationale: string }>(
    "/analyst/import-weekly",
    {
      method: "POST",
      body: JSON.stringify({ analysis_text: analysisText, tickers }),
    }
  );

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PositionSizeRequest {
  portfolio_value: number;
  risk_pct: number;
  entry_price: number;
  stop_price: number;
}

export interface PositionSizeResult {
  shares: number;
  dollar_risk: number;
  risk_per_share: number;
  position_value: number;
  pct_of_portfolio: number;
  entry_price: number;
  stop_price: number;
}

export interface StopLossLevel {
  price: number;
  pct_from_entry: number;
  label: string;
}

export interface StopLossResult {
  ticker: string;
  current_price: number;
  amplitude_52w_pct: number;
  stops: {
    tight: StopLossLevel;
    moderate: StopLossLevel;
    wide: StopLossLevel;
  };
}

export interface SectorRotationEntry {
  sector: string;
  change_1m: number;
}

export interface SectorRotation {
  leaders: SectorRotationEntry[];
  laggards: SectorRotationEntry[];
  rotation_signal: string;
}

export interface MarketContext {
  regime: string;
  regime_label: string;
  regime_advice: string;
  session_mood: string;
  vix?: number;
  cross_asset_signals?: string[];
  sector_rotation?: SectorRotation;
  macro_narrative?: string;
}

export interface AggregatedNewsItem {
  ticker: string;
  title: string;
  link: string;
  publisher: string;
  published?: string;
  priority: number;
}

export interface Brief {
  date: string;
  generated_at: string;
  item_count: number;
  items: BriefItem[];
  market_summary: Record<string, MarketIndex>;
  market_context?: MarketContext;
  aggregated_news?: AggregatedNewsItem[];
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

export interface BriefAnalystData {
  verdict_action: string;
  verdict_conviction: string;
  verdict_horizon?: string | null;
  ideal_entry_price?: number | null;
  one_liner?: string | null;
  business_summary?: string | null;
  investment_thesis?: string | null;
  specific_risks?: string | null;
  generated_at?: string | null;
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
  analyst_data?: BriefAnalystData | null;
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

export interface CompanyNarrative {
  summary: string;
  fundamentals_narrative: string;
  sector_context: string;
  competitive_position: string;
  risk_factors: string;
  catalyst_watch: string;
}

export interface CompanyIdentity {
  long_business_summary?: string | null;
  industry?: string | null;
  country?: string | null;
  employees?: number | null;
  website?: string | null;
  city?: string | null;
  exchange?: string | null;
}

export interface CompanyBrief {
  ticker: string;
  name: string;
  sector?: string;
  identity?: CompanyIdentity;
  current_price?: number;
  change_1d?: number;
  change_1m?: number;
  change_ytd?: number;
  narrative?: CompanyNarrative;
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
  // Historique des opportunités (Phase 1.3)
  new_opportunity?: boolean;
  first_seen_at?: string;
  times_seen?: number;
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
