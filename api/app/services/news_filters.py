"""
Filtres pour les news macro & géopolitique — approche "qualité par les sources".

Pas de whitelist d'entités (trop de faux négatifs).
Pas de scoring sémantique (trop fragile).

À la place :
  1. Sélection drastique des sources via `macro_quality` dans rss_aggregator.
  2. Blacklist agressive sur les titres pour couper les rares dérives.
  3. Dédup par signature de tokens (Jaccard).
  4. Filtre de fraîcheur (< 36 h).
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional


# ── Blacklist : si présent dans titre OU résumé → article rejeté ──────────
BLACKLIST: tuple[str, ...] = (
    # Lifestyle / vie privée
    "lifestyle", "ma vie", "je déteste", "happiness", "happy life",
    "weekend", "vacation", "vacances", "voyage", "travel ", "destination",
    "tourism", "tourisme", "tourist",
    # Sport / loisirs
    "football", "soccer", "tennis", "rugby", "basketball", "marathon",
    "olympics", "olympic", "world cup", "coupe du monde",
    "festival", "concert", "movie", "film de", "tv show", "netflix series",
    # Alimentaire / mode / déco
    "restaurant", "recipe", "recette", "fashion", "mode féminine",
    "decoration", "interior design", "home design",
    # People / faits divers
    "celebrity", "celebrities", "kardashian", "marriage", "divorce",
    "death of", "obituary", "wedding",
    # Météo / quotidien
    "weather", "météo", "snowstorm", "heatwave",
    # Carrière perso / wellness
    "career advice", "mental health tips", "yoga", "meditation",
    # Listicles bruyants
    "best stocks to buy", "top stocks to", "stocks to watch this week",
    "actions à acheter", "meilleures actions",
    "things to do this weekend", "what to watch tonight",
    # Personal finance / chronique perso (ex. MarketWatch advice column)
    "kids", " ira ", "401k", "401(k)", "social security at",
    "should we", "should i", "i always did", "personal finance",
    "mortgage", "retirees", "retirement fund", "beneficiaries",
    "graveyard shift", "claim social security", "i have enough money",
    "thousandaires", "should you", "ask the experts",
    # Health story
    "hantavirus", "outbreak", "cruise ship",
)


def is_blacklisted(title: str, summary: str = "") -> bool:
    """True si le titre ou le résumé contient un mot-clé blacklist."""
    text = f"{title} {summary}".lower()
    return any(kw in text for kw in BLACKLIST)


# ── Stopwords pour signature de dedup ─────────────────────────────────────
_STOPWORDS_EN = {
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "of", "in", "on", "at", "to", "for", "with", "as", "by", "from",
    "and", "or", "but", "if", "then", "than", "so",
    "this", "that", "these", "those",
    "it", "its", "his", "her", "their", "our",
    "will", "would", "could", "should", "may", "might", "can", "shall",
    "after", "before", "during", "since", "while",
    "new", "more", "most", "less", "very",
    "what", "when", "where", "why", "how", "who",
}
_STOPWORDS_FR = {
    "le", "la", "les", "un", "une", "des", "du", "de", "d",
    "et", "ou", "mais", "si", "que", "qui", "quoi", "où", "pour",
    "par", "avec", "sans", "dans", "sur", "sous",
    "ce", "cette", "ces", "son", "sa", "ses", "leur", "leurs",
    "il", "elle", "ils", "elles", "on", "nous", "vous",
    "est", "sont", "était", "été", "être", "avoir", "ont",
    "plus", "moins", "très", "peu", "trop",
    "après", "avant", "depuis", "pendant",
    "comment", "pourquoi", "quand",
}
_STOPWORDS_NEWS_ACTIONS = {
    "announces", "announced", "says", "said", "reports", "reported",
    "files", "filed", "filing", "beats", "missed", "misses", "miss",
    "plunges", "plunge", "surges", "surge", "jumps", "jump", "rises", "rise",
    "falls", "fall", "drops", "drop", "soars", "soar", "tumbles", "tumble",
    "hits", "hit", "finds", "found", "outlines", "plans", "plan", "calls",
    "expects", "expected", "signals", "signaled", "braces", "brace",
    "considering", "consider", "eyes", "eyeing", "mulls", "mulling",
    "weighing", "weighed", "looks", "looking", "sees", "seen", "gets",
    "faces", "faced", "warns", "warned", "warning",
    "today", "yesterday", "week", "month", "year",
    # FR
    "annonce", "annonces", "annoncé", "déclare", "rapporte",
    "dépose", "déposé", "bondit", "chute", "chutent", "monte", "montent",
    "tombe", "tombent", "frappe", "frappent",
    "alerte", "averti", "avertit",
    "aujourd", "hier", "semaine", "mois",
}
STOPWORDS = _STOPWORDS_EN | _STOPWORDS_FR | _STOPWORDS_NEWS_ACTIONS


def _normalize(s: str) -> str:
    """Lowercase + retire ponctuation + collapse espaces."""
    s = s.lower()
    s = re.sub(r"[^\w\s\-]", " ", s, flags=re.UNICODE)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def title_signature(title: str) -> frozenset[str]:
    """Set des tokens significatifs (>3 chars, hors stopwords). Sert à la dedup."""
    norm = _normalize(title)
    tokens = [t for t in norm.split() if len(t) > 3 and t not in STOPWORDS]
    return frozenset(tokens[:10])


def jaccard_similarity(a: frozenset[str], b: frozenset[str]) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    union = len(a | b)
    return inter / union if union else 0.0


# ── Fraîcheur (utilisée par /news/macro pour écarter les articles vieux) ──
def is_fresh(published_iso: Optional[str], max_hours: float = 36.0) -> bool:
    """True si l'article a été publié il y a moins de `max_hours` heures."""
    if not published_iso:
        return True  # tolérant si la date manque
    try:
        dt = datetime.fromisoformat(published_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        hours_old = (datetime.now(timezone.utc) - dt).total_seconds() / 3600
        return hours_old <= max_hours
    except Exception:
        return True
