#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# start.sh — Lance le Copilote Investissement en un clic
# Usage : ./start.sh
# Arrêt  : Ctrl+C (les deux processus s'arrêtent ensemble)
# ─────────────────────────────────────────────────────────────
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$ROOT_DIR/api"
WEB_DIR="$ROOT_DIR/web"

# Couleurs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔═══════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Copilote Investissement — Démarrage ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════╝${NC}"
echo ""

# ── Nettoyage des ports si déjà utilisés ────────────────────
for PORT in 8000 3000; do
    PID=$(lsof -ti:$PORT 2>/dev/null || true)
    if [ -n "$PID" ]; then
        echo -e "${YELLOW}Port $PORT occupé — arrêt du processus $PID${NC}"
        kill -9 $PID 2>/dev/null || true
    fi
done

# ── Backend (FastAPI) ────────────────────────────────────────
echo -e "${GREEN}▶ Backend FastAPI  → http://localhost:8000${NC}"
echo -e "  Docs API      → http://localhost:8000/docs"
echo ""

cd "$API_DIR"

# Activer le venv si présent
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "../.venv" ]; then
    source ../.venv/bin/activate
fi

uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Attendre que l'API soit prête
echo -n "  Attente démarrage API..."
for i in {1..20}; do
    if curl -s http://localhost:8000/health > /dev/null 2>&1; then
        echo -e " ${GREEN}OK${NC}"
        break
    fi
    sleep 0.5
    echo -n "."
done
echo ""

# ── Frontend (Next.js) ───────────────────────────────────────
echo -e "${GREEN}▶ Frontend Next.js → http://localhost:3000${NC}"
echo ""

cd "$WEB_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Application prête !"
echo -e "  ${GREEN}http://localhost:3000${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Ctrl+C pour tout arrêter"
echo ""

# Arrêt propre des deux processus ensemble
trap "echo ''; echo 'Arrêt...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM

# Attendre que l'un des deux se termine
wait $BACKEND_PID $FRONTEND_PID
