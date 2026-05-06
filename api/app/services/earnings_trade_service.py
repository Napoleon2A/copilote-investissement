"""
Earnings Trade Service — workflow "Opérations court terme" autour des publications
de résultats.

Logique : on cherche des sociétés où Claude estime, sur la base de signaux
publics gratuits, que les earnings vont SURPRENDRE positivement le consensus.
On entre avant la publication, on sort après le bump (position courte ~5-15j).

Approche prompt clipboard (cohérente avec investment_analyst.py et la doctrine
du projet — voir CLAUDE.md « Approche prompt clipboard ») :

  1. /operations-ct/prompt        → assemble un mégaprompt avec les earnings
                                    à venir + données contextuelles
  2. user → claude.ai             → analyse et renvoie une réponse structurée
  3. /operations-ct/import        → parse la réponse, crée les EarningsTrade
  4. /operations-ct/active        → liste affichée dans la page et la home

Pas d'appel API Claude payant — uniquement le pattern copier-coller gratuit.
"""
import json
import logging
import re
from datetime import date, datetime, timedelta
from typing import Optional

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.database import AsyncSessionLocal
from app.models import EarningsTrade, Position, Portfolio, UserIdea, Company

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────
# Construction du mégaprompt
# ─────────────────────────────────────────────────────────────────────

PROMPT_HEADER = """Tu es un trader court terme spécialisé dans le trading des publications de résultats (earnings plays). Pour chaque ticker ci-dessous dont les résultats sont publiés dans les 14 jours, évalue si les chances que les résultats publiés DÉPASSENT le consensus analystes sont suffisamment élevées pour justifier une position d'achat AVANT la publication, à liquider au lendemain (post-bump).

Ton verdict doit être DIRECT et FACTUEL — pas de conseil financier déguisé.
Ne recommande "buy" QUE si tu es vraiment convaincu (raisons claires : guidance + momentum + signaux concordants). Privilégie le "skip" en cas de doute.

Pour chaque ticker, retourne EXACTEMENT ce format Markdown :

## TICKER — Nom complet

**Verdict** : buy / skip
**Conviction** : faible / moyen / élevé
**Expected surprise** : +X.X% vs consensus EPS (si buy ; sinon "n/a")
**Target buy** : XX.XX$ (prix idéal d'entrée avant earnings)
**Target sell** : XX.XX$ (post-bump si beat)
**Stop loss** : XX.XX$ (si la pub déçoit)

**Signaux clés** :
- ...
- ...
- ...

**Rationale** :
2-4 phrases qui expliquent pourquoi tu penses que les résultats vont dépasser ou décevoir. Cite des chiffres précis (revenue growth, beat history, guidance, options flow, news récentes, exposition à un thème porteur).

---

Privilégie les sociétés que tu connais (data publiquement disponible). Si tu n'as pas assez d'info, dis "skip".

Données contextuelles ci-dessous (à compléter par tes propres recherches).

"""


def _format_ticker_block(ticker: str, name: str, earnings_date: str, source: str, extra: dict) -> str:
    lines = [f"### {ticker} ({name}) — earnings le {earnings_date}", f"_Source liste : {source}_", ""]
    if extra:
        for k, v in extra.items():
            if v is None or v == "":
                continue
            lines.append(f"- **{k}** : {v}")
        lines.append("")
    return "\n".join(lines)


async def build_earnings_trade_prompt(days_ahead: int = 14) -> dict:
    """
    Construit le mégaprompt à partir des earnings à venir sur :
      - portefeuille (Position)
      - idées suivies (UserIdea)
      - opportunités scanner (top 10 du cache scanner)
    + 5-10 jours.

    Retourne {prompt, candidates: [{ticker, name, earnings_date, source}]}.
    """
    from app.services.finnhub_calendar import get_cached_calendar
    from app.services.scanner import get_cached_opportunities

    earnings_calendar = get_cached_calendar() or []

    # Index ticker → earnings_date (la prochaine dans la fenêtre)
    today = date.today()
    horizon = today + timedelta(days=days_ahead)
    earnings_by_ticker: dict[str, str] = {}
    for ev in earnings_calendar:
        try:
            d = datetime.fromisoformat(ev["date"][:10]).date()
        except (ValueError, TypeError, KeyError):
            continue
        if d < today or d > horizon:
            continue
        t = ev.get("symbol") or ev.get("ticker")
        if not t:
            continue
        t = t.upper()
        if t not in earnings_by_ticker or d < datetime.fromisoformat(earnings_by_ticker[t]).date():
            earnings_by_ticker[t] = d.isoformat()

    # Collecte tickers d'intérêt (portfolio, idées, opps)
    sources: dict[str, str] = {}  # ticker → source label
    async with AsyncSessionLocal() as session:
        positions = (await session.exec(
            select(Position, Company).join(Company, Position.company_id == Company.id)
        )).all()
        for _, c in positions:
            sources.setdefault(c.ticker.upper(), "Portefeuille")

        ideas = (await session.exec(
            select(UserIdea, Company).join(Company, UserIdea.company_id == Company.id)
        )).all()
        for _, c in ideas:
            sources.setdefault(c.ticker.upper(), "Idée suivie")

    opps_cache = get_cached_opportunities()
    for o in (opps_cache.get("opportunities") or [])[:10]:
        sources.setdefault((o.get("ticker") or "").upper(), "Opportunité scanner")

    # Croise avec le calendrier earnings
    candidates = []
    blocks = []
    for ticker, source in sources.items():
        if not ticker:
            continue
        ed = earnings_by_ticker.get(ticker)
        if not ed:
            continue
        candidates.append({"ticker": ticker, "earnings_date": ed, "source": source})
        # Données contextuelles légères (placeholders : Claude.ai complétera)
        blocks.append(_format_ticker_block(
            ticker=ticker,
            name="",  # Claude reconnaît le ticker
            earnings_date=ed,
            source=source,
            extra={
                "Source univers": source,
                # Volontairement light — claude.ai a accès au web et complétera
            },
        ))

    if not blocks:
        return {
            "prompt": (
                PROMPT_HEADER +
                f"\n_Aucun ticker du portefeuille / idées / opportunités n'a d'earnings dans les {days_ahead} prochains jours._\n"
            ),
            "candidates": [],
            "days_ahead": days_ahead,
        }

    body = "\n".join(blocks)
    full_prompt = PROMPT_HEADER + body
    return {
        "prompt": full_prompt,
        "candidates": candidates,
        "days_ahead": days_ahead,
        "n_candidates": len(candidates),
    }


# ─────────────────────────────────────────────────────────────────────
# Parsing de la réponse claude.ai
# ─────────────────────────────────────────────────────────────────────

_RE_HEADING = re.compile(r"^##\s*([A-Z0-9.\-]{1,8})\s*[—\-:]\s*(.+?)\s*$", re.MULTILINE)
_RE_FIELD = re.compile(r"^\s*\*\*([^*]+?)\*\*\s*[:：]\s*(.+?)\s*$", re.MULTILINE)
_RE_PRICE = re.compile(r"([\d]+(?:[.,]\d+)?)\s*\$?")


def _parse_price(s: str) -> Optional[float]:
    if not s:
        return None
    m = _RE_PRICE.search(s.replace(",", "."))
    if not m:
        return None
    try:
        return float(m.group(1))
    except ValueError:
        return None


def _parse_pct(s: str) -> Optional[float]:
    """Extrait un pourcentage signé : '+12.5%' → 12.5, '-5%' → -5."""
    if not s:
        return None
    m = re.search(r"([+\-]?\s*\d+(?:[.,]\d+)?)\s*%", s.replace(",", "."))
    if not m:
        return None
    try:
        return float(m.group(1).replace(" ", ""))
    except ValueError:
        return None


def parse_earnings_trade_response(text: str) -> list[dict]:
    """
    Parse une réponse claude.ai au format documenté dans PROMPT_HEADER.
    Retourne une liste de dicts (un par ticker), avec les champs pertinents.

    Tolère les variations de formatage (séparateurs ---, ordre des champs,
    espaces) — Claude n'est pas strict.
    """
    # Découpe par sections de heading "## TICKER — Nom"
    headings = list(_RE_HEADING.finditer(text))
    if not headings:
        return []

    out: list[dict] = []
    for i, m in enumerate(headings):
        ticker = m.group(1).upper()
        name = m.group(2).strip()
        block_start = m.end()
        block_end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        block = text[block_start:block_end]

        # Extrait les champs **Field** : value
        fields: dict[str, str] = {}
        for fm in _RE_FIELD.finditer(block):
            key = fm.group(1).strip().lower()
            val = fm.group(2).strip()
            fields[key] = val

        # Rationale = tout ce qui suit "**Rationale**" jusqu'à la fin du bloc
        # (le RE_FIELD aura capturé la première ligne ; on récupère le reste libre)
        rationale_match = re.search(r"\*\*Rationale\*\*\s*[:：]?\s*\n?(.+?)(?=\n##|\n---|\Z)", block, re.DOTALL | re.IGNORECASE)
        rationale = rationale_match.group(1).strip() if rationale_match else fields.get("rationale", "")

        # Signaux clés = liste à puces sous "**Signaux clés**"
        signals_match = re.search(r"\*\*Signaux clés?\*\*\s*[:：]?\s*\n((?:[-*]\s*.+\n?)+)", block, re.IGNORECASE)
        signals: list[str] = []
        if signals_match:
            for line in signals_match.group(1).splitlines():
                s = re.sub(r"^[-*]\s*", "", line).strip()
                if s:
                    signals.append(s)

        verdict_raw = (fields.get("verdict") or "").lower()
        verdict = "buy" if "buy" in verdict_raw else "skip"

        conv_raw = (fields.get("conviction") or "").lower()
        if "élev" in conv_raw or "eleve" in conv_raw or "high" in conv_raw:
            conviction = "élevé"
        elif "moyen" in conv_raw or "medium" in conv_raw:
            conviction = "moyen"
        else:
            conviction = "faible"

        out.append({
            "ticker": ticker,
            "name": name,
            "verdict": verdict,
            "conviction": conviction,
            "expected_surprise_pct": _parse_pct(fields.get("expected surprise") or ""),
            "target_buy_price": _parse_price(fields.get("target buy") or ""),
            "target_sell_price": _parse_price(fields.get("target sell") or ""),
            "stop_loss_price": _parse_price(fields.get("stop loss") or ""),
            "rationale": rationale[:2000],  # cap pour ne pas exploser la DB
            "key_signals": signals[:10],
        })
    return out


# ─────────────────────────────────────────────────────────────────────
# Import en DB
# ─────────────────────────────────────────────────────────────────────

async def import_pasted_response(text: str) -> dict:
    """
    Parse + crée des EarningsTrade en DB. Si un trade pour le même ticker
    existait déjà avec status='pending', on le met à jour plutôt que créer
    un doublon.
    """
    from app.services.finnhub_calendar import get_cached_calendar

    parsed = parse_earnings_trade_response(text)
    if not parsed:
        return {"created": 0, "updated": 0, "skipped": 0, "items": [], "warning": "Aucun ticker n'a pu être parsé."}

    # Récupère earnings_date depuis le cache calendar
    earnings_calendar = get_cached_calendar() or []
    earnings_by_ticker: dict[str, date] = {}
    today = date.today()
    horizon = today + timedelta(days=21)
    for ev in earnings_calendar:
        try:
            d = datetime.fromisoformat(ev["date"][:10]).date()
        except Exception:
            continue
        if d < today or d > horizon:
            continue
        t = (ev.get("symbol") or ev.get("ticker") or "").upper()
        if t and (t not in earnings_by_ticker or d < earnings_by_ticker[t]):
            earnings_by_ticker[t] = d

    created = 0
    updated = 0
    skipped = 0
    items = []

    async with AsyncSessionLocal() as session:
        for p in parsed:
            ticker = p["ticker"]
            ed = earnings_by_ticker.get(ticker)
            if ed is None:
                # Pas d'earnings dans la fenêtre — skip mais on garde dans la liste
                skipped += 1
                items.append({"ticker": ticker, "status": "skipped_no_earnings"})
                continue
            if p["verdict"] != "buy":
                # Skip explicite par Claude — on n'enregistre pas
                skipped += 1
                items.append({"ticker": ticker, "status": "skipped_verdict_skip"})
                continue

            # Cherche un trade pending existant
            existing = (await session.exec(
                select(EarningsTrade)
                .where(EarningsTrade.ticker == ticker)
                .where(EarningsTrade.status == "pending")
            )).first()

            if existing:
                existing.earnings_date = ed
                existing.claude_verdict = p["verdict"]
                existing.claude_conviction = p["conviction"]
                existing.expected_surprise_pct = p["expected_surprise_pct"]
                existing.target_buy_price = p["target_buy_price"]
                existing.target_sell_price = p["target_sell_price"]
                existing.stop_loss_price = p["stop_loss_price"]
                existing.rationale = p["rationale"]
                existing.key_signals = json.dumps(p["key_signals"], ensure_ascii=False)
                existing.generated_at = datetime.utcnow()
                updated += 1
                items.append({"ticker": ticker, "status": "updated", "id": existing.id})
            else:
                trade = EarningsTrade(
                    ticker=ticker,
                    earnings_date=ed,
                    claude_verdict=p["verdict"],
                    claude_conviction=p["conviction"],
                    expected_surprise_pct=p["expected_surprise_pct"],
                    target_buy_price=p["target_buy_price"],
                    target_sell_price=p["target_sell_price"],
                    stop_loss_price=p["stop_loss_price"],
                    rationale=p["rationale"],
                    key_signals=json.dumps(p["key_signals"], ensure_ascii=False),
                    status="pending",
                )
                session.add(trade)
                created += 1
                items.append({"ticker": ticker, "status": "created"})
        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error(f"earnings_trade import commit failed: {e}")
            return {"created": 0, "updated": 0, "skipped": skipped, "items": items, "error": str(e)}

    return {"created": created, "updated": updated, "skipped": skipped, "items": items}


# ─────────────────────────────────────────────────────────────────────
# Lecture
# ─────────────────────────────────────────────────────────────────────

async def list_trades(active_only: bool = True, limit: int = 50) -> list[dict]:
    """Liste les EarningsTrade en DB. Active = pending ou triggered."""
    async with AsyncSessionLocal() as session:
        stmt = select(EarningsTrade).order_by(EarningsTrade.earnings_date)
        if active_only:
            stmt = stmt.where(EarningsTrade.status.in_(["pending", "triggered"]))  # type: ignore[attr-defined]
        rows = (await session.exec(stmt)).all()

    today = date.today()
    out = []
    for r in rows[:limit]:
        days_until = (r.earnings_date - today).days
        signals = []
        if r.key_signals:
            try:
                signals = json.loads(r.key_signals)
            except json.JSONDecodeError:
                signals = []
        out.append({
            "id": r.id,
            "ticker": r.ticker,
            "earnings_date": r.earnings_date.isoformat(),
            "days_until_earnings": days_until,
            "claude_verdict": r.claude_verdict,
            "claude_conviction": r.claude_conviction,
            "expected_surprise_pct": r.expected_surprise_pct,
            "target_buy_price": r.target_buy_price,
            "target_sell_price": r.target_sell_price,
            "stop_loss_price": r.stop_loss_price,
            "rationale": r.rationale,
            "key_signals": signals,
            "status": r.status,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
            "notes": r.notes,
        })
    return out


async def update_trade_status(trade_id: int, new_status: str, notes: Optional[str] = None) -> bool:
    """Permet à l'utilisateur de marquer un trade triggered/closed/missed."""
    valid = {"pending", "triggered", "closed_win", "closed_loss", "missed"}
    if new_status not in valid:
        return False
    async with AsyncSessionLocal() as session:
        row = await session.get(EarningsTrade, trade_id)
        if not row:
            return False
        row.status = new_status
        if notes is not None:
            row.notes = notes
        try:
            await session.commit()
            return True
        except Exception as e:
            await session.rollback()
            logger.error(f"update_trade_status failed: {e}")
            return False
