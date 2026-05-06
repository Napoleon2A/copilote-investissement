# CLAUDE.md — Austerlitz Hedge Fund

Instructions pour Claude Code dans ce projet.

## Vision produit

Copilote d'investissement personnel évoluant vers un système semi-automatique.
La sortie principale est un flux de décisions potentielles, court et priorisé.

Trois flux : (1) positions existantes, (2) opportunités détectées par le système,
(3) idées soumises par l'utilisateur.

Futur : intégration IBKR (exécution d'ordres) + Twitter/X (veille sentiment).
Le DataProvider Protocol est prêt pour brancher d'autres sources de données.

## Stack

- **Backend** : Python 3.12 + FastAPI + SQLModel + SQLite (aiosqlite) + yfinance + httpx + BeautifulSoup + feedparser
- **Frontend** : Next.js 15 (App Router) + TypeScript strict + Tailwind CSS
- **Tests** : pytest — 29 tests sur les helpers de validation multi-angles (api/tests/)
- **Infra** : lancement local (uvicorn + npm run dev)
- **Repo** : github.com/Napoleon2A/copilote-investissement
- **Dépendances optionnelles à vérifier** : `feedparser` (RSS), `bs4` (scraping ETF). Au boot, `_check_optional_deps()` warn explicitement si manquantes.

## Architecture backend

### Routers (16)
`companies`, `watchlist`, `portfolio`, `ideas`, `brief`, `scanner`, `chat`,
`earnings`, `alerts`, `risk`, `analyst`, `news`, `finnhub_data`,
`sec_edgar_router`, `discovery_router`, `earnings_trade_router` + health/root

### Services
| Service | Rôle |
|---|---|
| `data_service.py` | Seul point de contact avec yfinance — ne jamais appeler yfinance ailleurs |
| `scoring.py` | Moteur de scoring 5 axes (quality, valuation, growth, momentum, risk) |
| `brief_service.py` | Brief quotidien + macro intelligence (8 actifs, 6 secteurs, rotation, cross-asset) |
| `narrative_engine.py` | Analyse qualitative rule-based (fondamentaux, secteur, concurrents, risques, catalyseurs) |
| `scanner.py` | Détection d'opportunités sur 67 tickers + `SCAN_UNIVERSE` par secteur |
| `risk_manager.py` | Position sizing, stop-loss, concentration sectorielle |
| `conviction_tracker.py` | Suivi de précision des prédictions (1W/1M/3M) |
| `alert_service.py` | Vérification et déclenchement d'alertes prix/earnings |
| `earnings_service.py` | Scanner des publications de résultats à venir |
| `news_aggregator.py` | Agrégation et déduplication des news multi-tickers |
| `company_utils.py` | Utilitaire partagé get_or_create_company |
| `web_research.py` | Google News RSS, SEC EDGAR API, scraping site corporate, comparaison concurrents |
| `llm_service.py` | Client Claude API avec hard-cap 3$/mois, BudgetTracker, logging tokens |
| `investment_analyst.py` | Agent Warren Buffett : collecte multi-sources → prompt → Claude → thèse. Prompt clipboard gratuit |
| `data_provider.py` | Interface Protocol pour futurs providers (IBKR) |
| `etf_holdings.py` | Composition d'ETF thématiques (20 ETF AI/semi/uranium/DC). Cascade GlobalX CSV → stockanalysis.com → yfinance. ANCHOR_TICKERS pour les trous (VRT, etc.). Mapping ADR US (CCO CN→CCJ). |
| `sec_edgar.py` | 13-F des 25 super-investisseurs. Throttle (semaphore 5 + 0.12s/req) pour éviter 429. Cache disque persistant. |
| `finnhub_ticker.py` | Données par société : insider tx, recommandations, target price, profile, news. Cache disque. |
| `finnhub_calendar.py` / `finnhub_economic.py` | Calendriers earnings + macro events. |
| `political_trades.py` | STUB — sources gratuites bloquées 06/05/2026, plan dans memory/project_todo_political_trades. |
| `_disk_cache.py` | Persistance pickle légère pour les caches process (sec_edgar, etf_holdings, finnhub_ticker). Flush périodique 60-300s. Évite les 30-90s "cache cold" au restart. |
| `earnings_trade_service.py` | **Module Opérations CT** — workflow prompt clipboard pour trader les earnings. build_prompt → user→claude.ai → parse_response → DB. Aucune exécution auto. |

### Modèles DB (models.py)
Company, Watchlist, WatchlistItem, Portfolio, Position, Transaction,
InvestmentThesis, UserIdea, IdeaRevision, PriceSnapshot, Alert,
SeenOpportunity, AnalysisLog, Prediction, InvestmentAnalysis,
WeeklySelection, EarningsTrade, LLMUsageLog

### Données yfinance — clés snake_case
`get_fundamentals()` retourne des clés snake_case (ex: `operating_margin`, `debt_to_equity`,
`free_cashflow`, `revenue_growth`). Ne JAMAIS utiliser les noms yfinance camelCase
(ex: `operatingMargins`) — c'est un bug déjà rencontré et corrigé.

## Architecture frontend

### Pages (app/)
`/` (Brief), `/opportunities` (scanner + radar smart-money fusionnés, filtres),
`/operations-ct` (earnings trades — workflow prompt clipboard),
`/earnings`, `/alerts`, `/watchlist`,
`/portfolio` (avec calculateur de risque), `/idea` (recherche + idée fusionnées),
`/chat`, `/company/[ticker]`, `/analyst` (analyse deep + sélection hebdo)

### Style
- Dark mode via `darkMode: "class"` + CSS variables RGB channels dans `globals.css`
- Couleurs sémantiques Tailwind : `bg`, `surface`, `surface-alt`, `edge`, `primary`,
  `secondary`, `muted`, `navy` (+ hover), `accent`
- **JAMAIS** de couleurs hardcodées (`bg-white`, `text-gray-500`, etc.) — toujours les tokens
- Anti-flash script dans layout.tsx pour éviter le flash blanc au chargement

### Fichiers clés frontend
| Fichier | Rôle |
|---|---|
| `lib/api.ts` | Client API + TOUS les types TypeScript — source de vérité pour les types |
| `globals.css` | Variables CSS (light + dark), animations |
| `tailwind.config.js` | Tokens sémantiques, darkMode: "class" |
| `components/layout/Sidebar.tsx` | Navigation principale |
| `components/analyst/ExpandableThesisCard.tsx` | Card extensible pour thèses d'investissement |
| `components/ui/Skeleton.tsx` | Composants skeleton pour loading states |

## Conventions

### Python
- Types partout (Pydantic, SQLModel)
- Async/await pour toutes les routes FastAPI
- Services séparés des routers — la logique métier va dans `services/`
- Chaque fichier commence par un docstring expliquant son rôle
- Try/except + rollback sur chaque `session.commit()`
- Validation Pydantic (max_length, min_length) sur les inputs utilisateur

### TypeScript / React
- TypeScript strict, `tsc --noEmit` doit passer sans erreur
- Composants dans `components/`, pages dans `app/`
- Pas de `any` — toujours typer explicitement, return types sur toutes les fonctions API
- Les types API sont définis dans `lib/api.ts`

### Calculs financiers
- **Règle absolue** : tout calcul financier doit être documenté dans un commentaire
- Toujours distinguer : données observées / calculs / interprétations
- Les données manquantes retournent `None`, jamais une valeur inventée
- Chaque score doit avoir des `reasons` — jamais un chiffre sans explication

## Règles de sécurité

- Ne jamais exposer de clés API dans le code — utiliser `.env`
- Ne jamais committer `trading.db`
- Ne jamais présenter le système comme un conseiller financier
- Les scores sont des heuristiques, pas des prédictions

## Interdictions

- Pas de données inventées — si une source ne retourne rien, retourner `None`
- Ne pas casser la compatibilité des routes API sans mise à jour du client TS
- Ne pas supprimer les champs `reasons` des scores — ils sont affichés en UI
- Ne pas utiliser de couleurs hardcodées dans le frontend — tokens sémantiques uniquement
- **JAMAIS d'appel Claude API au chargement de page** — uniquement via bouton + confirmation
- **JAMAIS de retry automatique** sur les appels Claude API
- Ne pas dépasser le hard-cap budget mensuel (3$/mois) — les appels ratés comptent aussi

## Philosophie d'analyse — CRUCIAL

Le système ne doit PAS être un "Yahoo Finance bis" qui affiche des ratios.
Il doit **raisonner comme un investisseur qui met son propre argent** :

- **Du raisonnement, pas du reporting** : pas "P/E = 34x" mais "P/E à 34x, cher vs MSFT (26x), MAIS justifié par un FCF de 106B$ finançant 90B$/an de buybacks"
- **Comprendre le business** : que fait l'entreprise, pour qui, quel problème elle résout, quel est son avantage concurrentiel durable
- **La chaîne de valeur** : fournisseurs critiques, concentration clients, pouvoir de négociation
- **Des risques SPÉCIFIQUES** : pas "risque réglementaire" générique mais "le DMA européen pourrait forcer l'ouverture de l'App Store, menaçant 30% de marge sur les services"
- **Croiser les sources** : yfinance + SEC EDGAR + Google News + sites corporate
- **Qualité > quantité** : 5 thèses profondes par semaine valent mieux que 50 scores superficiels
- **Mâcher le travail** : l'utilisateur ne devrait pas avoir à interpréter les données lui-même

## Claude API — Moteur de raisonnement

Le moteur rule-based (if/else) est conservé pour le scoring rapide et gratuit.
Claude API (Sonnet) est utilisé pour les analyses deep — avec gardes-fous stricts :

- **Budget** : hard-cap 3$/mois, compteur en DB (appels ratés inclus), endpoint `/analyst/budget`
- **Déclenchement** : uniquement via bouton manuel + confirmation utilisateur
- **Anti-hallucination** : Claude reçoit UNIQUEMENT des données collectées et vérifiées. Le prompt interdit d'inventer des faits.
- **Cache** : analyses valides 7 jours, pas de re-génération inutile
- **Optimisation coût** : Haiku pour le tri, Sonnet pour le deep uniquement

## Approche prompt clipboard (prioritaire)

Le système privilégie la génération de prompts à copier-coller dans claude.ai (gratuit avec
l'abonnement) plutôt que l'API Claude payante. Le flux :

1. L'utilisateur clique "Générer le prompt" sur la page Analyste / Opérations CT
2. Le backend collecte 12+ sources gratuites (yfinance deep, Google News, SEC EDGAR, site corporate, macro)
3. Un prompt de ~20k caractères est construit avec toutes les données + instructions pour Claude
4. L'utilisateur copie → colle dans claude.ai → Claude analyse + complète avec ses propres recherches
5. L'utilisateur colle la réponse dans la zone d'import → stockée en DB → affichée dans Brief + Analyste / Opérations CT

L'option API (0.15$/analyse) reste disponible mais secondaire.

Deux modules suivent ce pattern :
- **investment_analyst.py** — analyses fondamentales deep (sélection hebdo)
- **earnings_trade_service.py** — earnings trades court terme (Opérations CT)

## Validation multi-angles (/discovery/signals)

Pour chaque ticker, le système agrège 5 angles de validation indépendants
(annotent, ne filtrent JAMAIS — cf. memory feedback_inform_dont_filter) :

1. **ETF thématiques** — présence dans 20 ETF AI/semi/uranium/datacenter
2. **Smart-money 13-F** — fonds high-conviction (≤30 positions, cf. feedback_fund_filter)
   qui détiennent ou viennent d'initier
3. **Insider top management** — net achats/ventes 90j, significativité calibrée
   sur 5 bps du market cap (pas un seuil absolu trompeur cross-cap), pondération
   exp-decay (demi-vie 30j) pour favoriser le récent
4. **Consensus analystes** — Finnhub strong_buy, trend 6m (pp), upside vs target
5. **Trades politiques** — STUB (sources gratuites bloquées, plan dans memory)

Score agrégé `signal_strength` : addition pondérée documentée
(ETF×0.5, sm_initiated×3, holders×0.7, insider buy ±2.5, sell -1.5, analyst SB×1.5, trend ±1.0)
→ label `fort` (≥7) / `moyen` (≥3) / `faible` (>0) / `absent`.

### Smart-money radar (/discovery/smart-money-radar)

Canal de découverte **indépendant** du scanner momentum. Remonte les tickers
où ≥ N fonds high-conviction ont **initié** ou **augmenté ≥ 50%** au dernier 13-F,
même si le score scanner est faible (signal contrarian). Default seuil 40 positions
(plus tolérant que cross-signals strict à 30, sinon vide en pratique).

### Module Opérations CT (/operations-ct)

Trade des publications de résultats : entrer avant earnings, sortir après le bump
si Claude estime un beat probable. Workflow prompt clipboard intégral :
1. `GET /earnings-trade/prompt` → mégaprompt assemblé (earnings 14j × portfolio + idées + opps)
2. User colle dans claude.ai → réponse Markdown structurée par ticker
3. `POST /earnings-trade/import` → parse + crée des EarningsTrade en DB
4. `/operations-ct` affiche les trades pending/triggered avec target buy/sell/stop
5. User marque Acheté/Vendu/Skip après exécution manuelle au broker

**Aucune exécution automatique. Aucun appel API Claude payant.**

## Stratégie de découverte d'opportunités

Pas juste un univers fixe scanné bêtement. Process en 3 couches :

1. **Macro-thématique** (Haiku) : mégatrends → sous-segments → tickers candidats
   Ex: "IA → consommation énergie → refroidissement data centers → Vertiv (VRT)"
2. **Screening quantitatif** (yfinance, gratuit) : filtres dynamiques sur les secteurs identifiés
3. **Validation qualitative** (Sonnet) : deep dive business sur les 5 meilleurs candidats

## Ordre de priorité si modifications

1. Corriger les bugs qui cassent les fonctions existantes
2. Améliorer la profondeur et la pertinence des analyses (business, pas juste ratios)
3. Ajouter de nouvelles sources de données
4. Améliorer l'UX (navigation, cards extensibles, loading states)
5. Refactoring et nettoyage

## Prochaines priorités (Austerlitz v2)

1. **Phase 1** : Deep data layer (yfinance enrichi + web research + univers élargi)
2. **Phase 2** : Moteur Claude API (investment_analyst.py, gardes-fous budget)
3. **Phase 3** : Modèles DB + endpoints analyst
4. **Phase 4** : Frontend navigation (loading.tsx, skeletons)
5. **Phase 5** : Brief 50/50 + cards extensibles
6. **Phase 6** : Page company enrichie (onglets)
7. **Phase 7** : Polish

Plan complet dans `.claude/plans/snazzy-wibbling-sunbeam.md`
