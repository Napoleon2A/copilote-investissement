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

- Pas de ML opaque — heuristiques explicables uniquement
- Pas de données inventées — si yfinance ne retourne rien, retourner `None`
- Ne pas casser la compatibilité des routes API sans mise à jour du client TS
- Ne pas supprimer les champs `reasons` des scores — ils sont affichés en UI
- Ne pas utiliser de couleurs hardcodées dans le frontend — tokens sémantiques uniquement

## Ordre de priorité si modifications

1. Corriger les bugs qui cassent les fonctions existantes
2. Améliorer la qualité/pertinence des scores, du brief et des analyses
3. Ajouter de nouvelles pages/features
4. Refactoring et nettoyage

## Pour ajouter un nouveau provider de données

1. Créer `api/app/services/providers/nom_provider.py`
2. Implémenter le Protocol défini dans `data_provider.py`
3. Modifier `data_service.py` pour déléguer au provider actif

## Prochaines priorités

1. Tests automatisés (pytest) — aucun test n'existe encore
2. Migrations DB (Alembic) — les changements de schéma ne s'appliquent pas aux bases existantes
3. Vérification visuelle frontend (dark mode, responsive, nouvelles pages)
4. IBKR quand l'utilisateur fournira l'accès API
