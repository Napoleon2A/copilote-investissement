# Copilote Investissement

Outil personnel d'aide à la décision en investissement — petit, rapide, utile.

**Ce que ça fait :**
- Brief quotidien : 3 à 7 signaux prioritaires sur tes lignes et ta watchlist
- Fiche entreprise : scores, fondamentaux, note d'opportunité courte
- Watchlist : suivi en temps réel avec scores calculés
- Portefeuille : positions, P&L, exposition sectorielle
- Idées : soumets un ticker → avis argumenté, révisable dans le temps

**Ce que ça n'est pas :** un conseiller financier. Toutes les sorties sont des pistes de recherche.

---

## Démarrage rapide

### Option 1 — Local (le plus simple)

**Prérequis :** Python 3.12+ et Node.js 18+

```bash
# Terminal 1 — Backend
cd api
pip install -r requirements.txt
uvicorn app.main:app --reload
# → API disponible sur http://localhost:8000
# → Docs interactives sur http://localhost:8000/docs

# Terminal 2 — Frontend
cd web
npm install
npm run dev
# → Interface sur http://localhost:3000
```

### Option 2 — Docker

**Prérequis :** Docker Desktop installé et lancé

```bash
docker compose up --build
# → API sur http://localhost:8000
# → Interface sur http://localhost:3000
```

---

## Utilisation

### 1. Ajouter des entreprises à ta watchlist

1. Va sur http://localhost:3000/watchlist
2. Crée une liste ("Tech US", "Europe", etc.)
3. Ajoute des tickers : `AAPL`, `MSFT`, `MC.PA`, `AIR.PA`, etc.

Les tickers européens s'écrivent avec leur suffixe de marché :
- `.PA` pour Paris (Euronext)
- `.AS` pour Amsterdam
- `.DE` pour Frankfurt
- `.L` pour Londres

### 2. Voir le brief quotidien

Va sur http://localhost:3000 — le brief se génère automatiquement
à partir de tes positions et ta watchlist.

### 3. Analyser une entreprise

- Tape un ticker dans la barre de recherche en haut
- Ou navigue vers `/company/AAPL`

### 4. Enregistrer une transaction

1. Va sur http://localhost:3000/portfolio
2. Clique "Ajouter Transaction"
3. Remplis le formulaire (ticker, type, quantité, prix)

### 5. Soumettre une idée

1. Va sur http://localhost:3000/idea
2. Entre le ticker
3. Ajoute ta thèse (optionnel)
4. Le système génère un avis que tu peux revisiter plus tard

---

## Architecture

```
Trading/
├── api/                  ← Backend Python (FastAPI + SQLite)
│   ├── app/
│   │   ├── main.py       ← Point d'entrée API
│   │   ├── models.py     ← Modèles de données (SQLModel)
│   │   ├── database.py   ← Connexion SQLite
│   │   ├── routers/      ← Routes (companies, watchlist, portfolio, ideas, brief)
│   │   └── services/     ← Logique métier (data_service, scoring, brief_service)
│   ├── requirements.txt
│   └── Dockerfile
├── web/                  ← Frontend TypeScript (Next.js 14 + Tailwind)
│   ├── src/
│   │   ├── app/          ← Pages (/, /watchlist, /portfolio, /company/[ticker], /idea)
│   │   ├── components/   ← Composants React
│   │   └── lib/api.ts    ← Client API
│   └── Dockerfile
├── docker-compose.yml
├── Makefile
└── README.md
```

## Données

Toutes les données de marché proviennent de **yfinance** (Yahoo Finance) :
- Gratuit, aucune clé API requise
- Délai d'environ 15 minutes pour les marchés US
- Fondamentaux trailing (12 mois glissants)
- Couverture : US, Europe, et la plupart des marchés mondiaux

**Limites connues :**
- Les fondamentaux des small caps peuvent être incomplets
- Pas de données intraday fiables au-delà de 60 jours
- Yahoo Finance peut changer son API sans préavis

## Tests

```bash
cd api && python -m pytest app/tests/ -v
```

---

*Ce projet est à usage personnel. Ce n'est pas un conseil en investissement.*
