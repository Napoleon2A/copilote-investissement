# ── Copilote Investissement — Makefile ──────────────────────────────────────
# Usage : make <commande>
# Prérequis : Python 3.12+ et Node 18+ installés, OU Docker Desktop.

# ── Lancement sans Docker (plus simple pour débuter) ────────────────────────

dev-api:          ## Lancer le backend FastAPI en local
	cd api && pip install -r requirements.txt -q && uvicorn app.main:app --reload

dev-web:          ## Lancer le frontend Next.js en local
	cd web && npm install && npm run dev

# Lance les deux en parallèle (nécessite un terminal qui supporte &)
dev:              ## Lancer API + Web ensemble (macOS/Linux)
	@echo "Lancement de l'API et du frontend..."
	@(cd api && uvicorn app.main:app --reload &) && cd web && npm run dev

# ── Lancement avec Docker ────────────────────────────────────────────────────

docker-up:        ## Lancer tout via Docker Compose
	docker compose up --build

docker-down:      ## Arrêter les containers Docker
	docker compose down

docker-logs:      ## Voir les logs des containers
	docker compose logs -f

# ── Tests ────────────────────────────────────────────────────────────────────

test:             ## Lancer les tests Python
	cd api && pip install pytest -q && python -m pytest app/tests/ -v

# ── Utilitaires ──────────────────────────────────────────────────────────────

clean:            ## Nettoyer les fichiers temporaires
	find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -delete 2>/dev/null || true
	find . -name ".pytest_cache" -type d -exec rm -rf {} + 2>/dev/null || true

help:             ## Afficher cette aide
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: dev-api dev-web dev docker-up docker-down docker-logs test clean help
