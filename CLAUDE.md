# CLAUDE.md — Copilote Investissement

Instructions pour Claude Code dans ce projet.

## Vision produit

Copilote d'investissement personnel. La sortie principale n'est pas une base de données —
c'est un flux de décisions potentielles, court et priorisé.

Trois flux : (1) mes investissements existants, (2) idées détectées par le système,
(3) idées soumises par l'utilisateur.

## Stack

- **Backend** : Python 3.12 + FastAPI + SQLModel + SQLite (aiosqlite) + yfinance
- **Frontend** : Next.js 14 + TypeScript + Tailwind CSS
- **Tests** : pytest (backend), aucun test frontend pour V1
- **Infra** : Docker Compose (optionnel), lancement local possible

## Conventions

### Python
- Types partout (Pydantic, SQLModel)
- Async/await pour toutes les routes FastAPI
- Services séparés des routers — la logique métier va dans `services/`
- Chaque fichier commence par un docstring expliquant son rôle
- Nommage snake_case, classes PascalCase

### TypeScript / React
- TypeScript strict
- Composants dans `components/`, pages dans `app/`
- Pas de `any` — toujours typer explicitement
- Les types API sont définis dans `lib/api.ts`

### Calculs financiers
- **Règle absolue** : tout calcul financier doit être documenté dans un commentaire
  qui explique la formule, ses hypothèses et ses limites
- Toujours distinguer : données observées / calculs / interprétations
- Les données manquantes retournent `None`, jamais une valeur inventée
- Chaque score doit avoir des `reasons` — jamais un chiffre sans explication

## Fichiers importants

| Fichier | Rôle |
|---|---|
| `api/app/services/scoring.py` | Moteur de scoring — modifier SCORE_WEIGHTS pour ajuster les pondérations |
| `api/app/services/data_service.py` | Seul endroit qui touche à yfinance |
| `api/app/services/brief_service.py` | Génération du brief quotidien |
| `api/app/models.py` | Tous les modèles de données |
| `web/src/lib/api.ts` | Client API + tous les types TypeScript |

## Règles de sécurité

- Ne jamais exposer de clés API dans le code — utiliser `.env`
- Ne jamais committer le fichier `trading.db`
- Ne jamais présenter le système comme un conseiller financier
- Les scores sont des heuristiques, pas des prédictions

## Interdictions

- Pas de ML opaque en V1 — heuristiques explicables uniquement
- Pas de données inventées — si yfinance ne retourne rien, retourner `None`
- Ne pas casser la compatibilité des routes API sans mise à jour du client TS
- Ne pas supprimer les champs `reasons` des scores — ils sont affichés en UI

## Ordre de priorité si modifications

1. Corriger les bugs qui cassent les fonctions existantes
2. Améliorer la qualité/pertinence des scores et du brief
3. Ajouter de nouvelles pages/features
4. Refactoring et nettoyage

## Pour ajouter un nouveau provider de données

1. Créer un fichier `api/app/services/nom_provider.py`
2. Implémenter les mêmes fonctions que `data_service.py`
3. Changer l'import dans les routers — un seul endroit à modifier
