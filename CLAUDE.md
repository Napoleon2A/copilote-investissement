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

- **Backend** : Python 3.12 + FastAPI + SQLModel + SQLite (aiosqlite) + yfinance
- **Frontend** : Next.js 15 (App Router) + TypeScript strict + Tailwind CSS
- **Tests** : pytest (backend) — pas encore implémentés, priorité prochaine
- **Infra** : lancement local (uvicorn + npm run dev)
- **Repo** : github.com/Napoleon2A/copilote-investissement

## Architecture backend

### Routers (12)
`companies`, `watchlist`, `portfolio`, `ideas`, `brief`, `scanner`, `chat`,
`earnings`, `alerts`, `risk` + health/root

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
| `data_provider.py` | Interface Protocol pour futurs providers (IBKR) |

### Modèles DB (models.py)
Company, Watchlist, WatchlistItem, Portfolio, Position, Transaction,
InvestmentThesis, UserIdea, IdeaRevision, PriceSnapshot, Alert,
SeenOpportunity, AnalysisLog, Prediction

### Données yfinance — clés snake_case
`get_fundamentals()` retourne des clés snake_case (ex: `operating_margin`, `debt_to_equity`,
`free_cashflow`, `revenue_growth`). Ne JAMAIS utiliser les noms yfinance camelCase
(ex: `operatingMargins`) — c'est un bug déjà rencontré et corrigé.

## Architecture frontend

### Pages (app/)
`/` (Brief), `/opportunities`, `/earnings`, `/alerts`, `/watchlist`,
`/portfolio` (avec calculateur de risque), `/idea` (recherche + idée fusionnées),
`/chat`, `/company/[ticker]`

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
- Ne pas dépasser le hard-cap budget mensuel (5$/mois par défaut)

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

- **Budget** : hard-cap 5$/mois, compteur en DB, endpoint `/analyst/budget`
- **Déclenchement** : uniquement via bouton manuel + confirmation utilisateur
- **Anti-hallucination** : Claude reçoit UNIQUEMENT des données collectées et vérifiées. Le prompt interdit d'inventer des faits.
- **Cache** : analyses valides 7 jours, pas de re-génération inutile
- **Optimisation coût** : Haiku pour le tri, Sonnet pour le deep uniquement

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
