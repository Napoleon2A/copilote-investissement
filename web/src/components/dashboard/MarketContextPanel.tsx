"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { type MarketSnapshot } from "@/lib/macroExplainer";

/* ── Helpers d'interprétation contextuelle pour les popovers de tuiles ── */

const fmtPct = (v: number | null | undefined, dp = 2) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;

function interpretIndexDay(name: string, c: number | null | undefined): string {
  if (c == null) return "Donnée du jour indisponible.";
  const d = c >= 0 ? "hausse" : "baisse";
  const intensity = Math.abs(c) > 1.5 ? "marquée" : Math.abs(c) > 0.5 ? "modérée" : "légère";
  return `${name} en ${d} ${intensity} de ${c >= 0 ? "+" : ""}${c.toFixed(2)}% aujourd'hui. Plus la hausse est forte, plus le marché signale un appétit pour le risque sur cette zone.`;
}

function interpretVix(v: number | null): string {
  if (v == null) return "Donnée indisponible.";
  if (v < 18) return `À ${v.toFixed(1)}, le VIX est bas : peu de stress, marché calme. Attention, des niveaux <14 ressemblent à de la complaisance et précèdent parfois des corrections.`;
  if (v < 25) return `À ${v.toFixed(1)}, vigilance modérée — niveau historiquement normal. Pas de signal d'alerte.`;
  if (v < 35) return `À ${v.toFixed(1)}, stress élevé : les investisseurs anticipent des mouvements brutaux. Souvent associé à des phases de correction.`;
  return `À ${v.toFixed(1)}, panique ou crise. Niveau atteint en 2008, mars 2020, août 2024. Phase de capitulation possible.`;
}

function interpretMove(m: number | null | undefined): string {
  if (m == null) return "Donnée indisponible.";
  if (m < 80) return `À ${m.toFixed(0)}, marché obligataire calme. Pas de stress en amont des actions.`;
  if (m < 110) return `À ${m.toFixed(0)}, niveau normal historiquement. Pas d'inquiétude particulière.`;
  if (m < 130) return `À ${m.toFixed(0)}, volatilité élevée sur les taux. À surveiller — souvent annonciateur d'un VIX qui grimpe.`;
  return `À ${m.toFixed(0)}, stress obligataire majeur. Le marché des Treasuries bouge fortement, signal historique précurseur de tension sur les actions.`;
}

function interpretUs10y(y: number | null): string {
  if (y == null) return "Donnée indisponible.";
  if (y < 3) return `À ${y.toFixed(2)}%, taux bas. Environnement easy money, soutient les valorisations actions et l'immobilier.`;
  if (y < 4.5) return `À ${y.toFixed(2)}%, niveau normal historiquement (moyenne 50 ans ≈ 4 %). Coût du capital maîtrisé.`;
  if (y < 5) return `À ${y.toFixed(2)}%, taux élevés. Pression sur les valorisations actions (surtout tech/croissance) et immobilier.`;
  return `À ${y.toFixed(2)}%, niveau très restrictif. Risque de cassure sur les actifs à duration longue et l'immobilier commercial.`;
}

function interpretSpread(s: number | null | undefined): string {
  if (s == null) return "Donnée indisponible.";
  if (s < 0) return `À ${s.toFixed(2)} pt, courbe inversée. Signal historique de récession 12-18 mois (modèle Fed NY, fiable à ~90 % sur 50 ans). Le marché obligataire price un ralentissement.`;
  if (s < 0.3) return `À ${s.toFixed(2)} pt, courbe quasi plate. Alerte : transition souvent vue avant une inversion. À surveiller.`;
  if (s < 1.5) return `À ${s.toFixed(2)} pt, courbe normale. Pas de signal récession actif.`;
  return `À ${s.toFixed(2)} pt, courbe pentue. Conditions de crédit normalisées, scenario reflation/croissance.`;
}

function interpretEur(p: number | null, c1m: number | null | undefined): string {
  if (p == null) return "Donnée indisponible.";
  const trend = c1m == null ? "" : ` Évolution sur 1 mois : ${fmtPct(c1m, 1)}.`;
  return `EUR/USD à ${p.toFixed(3)} : il faut ${p.toFixed(3)} $ pour acheter 1 €. Hausse = euro fort (souvent BCE moins dovish que la Fed).${trend}`;
}

function interpretBtc(p: number | null, c1d: number | null | undefined): string {
  if (p == null) return "Donnée indisponible.";
  const trend = c1d == null ? "" : ` Aujourd'hui ${fmtPct(c1d, 1)}.`;
  return `Bitcoin à ${(p / 1000).toFixed(1)} K$. Sert de proxy risk-on/risk-off et liquidité globale (corrélé au NASDAQ en phases d'euphorie).${trend}`;
}

function interpretWti(p: number | null, ytd: number | null | undefined): string {
  if (p == null) return "Donnée indisponible.";
  const trendYtd = ytd == null ? "" : ` ${fmtPct(ytd, 0)} YTD.`;
  if (p < 60) return `WTI à ${p.toFixed(1)} $/baril. Niveau bas, environnement déflationniste — soulagement pour consommateurs et industrie.${trendYtd}`;
  if (p < 80) return `WTI à ${p.toFixed(1)} $/baril. Zone neutre, équilibre offre/demande.${trendYtd}`;
  return `WTI à ${p.toFixed(1)} $/baril. Niveau élevé, pression inflationniste sur carburants, transport, plastiques.${trendYtd}`;
}

function interpretCopperGold(r: number | null, c1m: number | null | undefined): string {
  if (r == null) return "Donnée indisponible.";
  const trend = c1m == null ? "" : ` Variation sur 1 mois : ${fmtPct(c1m, 1)}.`;
  if (c1m != null && c1m > 3) return `Ratio à ${r.toFixed(2)}. La hausse sur 1 mois signale une rotation cyclique : conviction sur la croissance économique réelle.${trend}`;
  if (c1m != null && c1m < -3) return `Ratio à ${r.toFixed(2)}. La baisse sur 1 mois signale une rotation défensive vers les valeurs refuge — peur sur la croissance.${trend}`;
  return `Ratio à ${r.toFixed(2)}. Cuivre = cyclique (économie réelle), or = refuge. Le ratio mesure la conviction sur la croissance.${trend}`;
}

function interpretIta(c1d: number | null | undefined, c1m: number | null | undefined): string {
  if (c1d == null) return "Donnée indisponible.";
  const trend = c1m == null ? "" : ` Sur 30 jours : ${fmtPct(c1m, 1)}.`;
  return `ETF Aérospatial & Défense US (ITA — Lockheed, RTX, Northrop, Boeing, GD). Aujourd'hui ${fmtPct(c1d, 2)}. Sensible aux budgets Pentagone, conflits géopolitiques, contrats long terme.${trend}`;
}

function interpretSmh(c1d: number | null | undefined, c1m: number | null | undefined): string {
  if (c1d == null) return "Donnée indisponible.";
  const trend = c1m == null ? "" : ` Sur 30 jours : ${fmtPct(c1m, 1)}.`;
  return `ETF semi-conducteurs (SMH — NVDA, TSM, AVGO, AMD, ASML). Aujourd'hui ${fmtPct(c1d, 2)}. Proxy le plus pur de la chaîne de valeur hardware IA — tend à mener le NASDAQ en phase d'enthousiasme IA, et à corriger en premier en cas de doute.${trend}`;
}

function interpretGrid(c1d: number | null | undefined, c1m: number | null | undefined, ytd: number | null | undefined): string {
  if (c1d == null) return "Donnée indisponible.";
  const t30 = c1m == null ? "" : ` 30j : ${fmtPct(c1m, 1)}.`;
  const tYtd = ytd == null ? "" : ` YTD : ${fmtPct(ytd, 1)}.`;
  return `ETF infrastructure réseau électrique (GRID — équipements smart grid, transmission, stockage stationnaire). Aujourd'hui ${fmtPct(c1d, 2)}. Le plus proche du business EOSE (batteries grid-scale). ETF peu liquide → la perf 30j peut être bruitée, regarder aussi le YTD pour la tendance de fond.${t30}${tYtd}`;
}

function interpretGold(p: number | null, ytd: number | null | undefined): string {
  if (p == null) return "Donnée indisponible.";
  const trend = ytd == null ? "" : ` ${fmtPct(ytd, 0)} YTD.`;
  if (ytd != null && ytd > 15) return `Or à ${p.toFixed(0)} $/oz. Forte hausse YTD : signal de peur, anticipation d'inflation, ou perte de confiance dans le dollar.${trend}`;
  return `Or à ${p.toFixed(0)} $/oz. Valeur refuge classique, protège contre l'inflation et les crises.${trend}`;
}

/* ── Notes empiriques : uniquement quand le contexte actuel le mérite ─── */
// Backing : modèle Fed NY de probabilité de récession, papers académiques sur la pente de courbe.
// Le 10Y-3M est l'indicateur de récession le plus documenté → on l'affiche TOUJOURS (vraie valeur éducative).
const SPREAD_EMPIRICAL =
  "Le spread 10Y-3M est l'indicateur de récession le plus fiable historiquement : une courbe inversée a précédé chacune des 8 dernières récessions US (sur 50 ans), avec 12-18 mois de délai. Le modèle officiel de la Fed de New York l'utilise pour estimer la probabilité de récession à 12 mois.";

function empiricalVix(v: number | null): string | undefined {
  if (v == null) return undefined;
  if (v >= 30) {
    return "Les pics du VIX au-delà de 30-40 (Lehman 2008 = 89, COVID mars 2020 = 82, août 2024 = 65) ont coïncidé avec des points bas du S&P 500 et marqué des opportunités d'achat majeures pour les investisseurs long terme.";
  }
  return undefined; // VIX bas/normal n'a pas de signal empirique fort
}

function empiricalMove(m: number | null | undefined): string | undefined {
  if (m == null) return undefined;
  if (m >= 110) {
    return "Le marché obligataire bouge typiquement avant les actions en cas de stress. Des niveaux MOVE >130 ont précédé les phases de tension actions (crise 2008, COVID 2020, hausse Fed 2022). Quand MOVE flambe sans que le VIX ne bouge encore, c'est un signal annonciateur.";
  }
  return undefined;
}

function empiricalRussell(c1m: number | null | undefined, sp500_1m: number | null | undefined): string | undefined {
  if (c1m == null || sp500_1m == null) return undefined;
  const diff = c1m - sp500_1m;
  if (diff < -3) {
    return "Une sous-performance significative du Russell 2000 vs S&P (>5 pts sur 3-6 mois) a précédé les phases de ralentissement économique US (2007-2008, 2022). Les small caps stressent en premier sur l'économie domestique car elles ont moins d'export et plus d'endettement à taux variable.";
  }
  return undefined;
}

function interpretRussell(c1d: number | null | undefined, c1m: number | null | undefined, sp500_1m: number | null | undefined): string {
  if (c1d == null) return "Donnée indisponible.";
  let extra = "";
  if (c1m != null && sp500_1m != null) {
    const diff = c1m - sp500_1m;
    if (diff > 2) extra = ` Sur 1 mois, surperforme le S&P de ${diff.toFixed(1)} pts : élargissement du rally aux small caps US.`;
    else if (diff < -3) extra = ` Sur 1 mois, sous-performe le S&P de ${Math.abs(diff).toFixed(1)} pts : inquiétude sur l'économie domestique US.`;
    else extra = ` Sur 1 mois, en ligne avec le S&P (${fmtPct(diff, 1)} d'écart).`;
  }
  return `Russell 2000 ${fmtPct(c1d, 2)} aujourd'hui. Baromètre de l'économie domestique US (les small caps dépendent moins de l'export).${extra}`;
}

/* Helper : sub à 2 segments "j +X% · YTD +Y%" avec couleurs indépendantes.
   Utilisé pour Or, BTC, Pétrole où on garde le PRIX en value mais où on veut
   quand même afficher les deux perfs. */
function dualSub(
  dayPct: number | null | undefined,
  ytdPct: number | null | undefined,
  ytdDigits = 0,
) {
  const fmt = (v: number | null | undefined, dp: number) =>
    v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
  const dayTone = (dayPct ?? 0) >= 0 ? "good" : "bad";
  const ytdTone = (ytdPct ?? 0) >= 0 ? "good" : "bad";
  return (
    <>
      <span className={`${TONE_VALUE[dayTone]} font-medium`}>j {fmt(dayPct, 1)}</span>
      <span className="opacity-40"> · </span>
      <span className={`${TONE_VALUE[ytdTone]} font-medium`}>YTD {fmt(ytdPct, ytdDigits)}</span>
    </>
  );
}

interface MarketContextPanelProps {
  ctx: any;
  marketSummary: any;
  loading: boolean;
}

export function MarketContextPanel({ ctx, marketSummary, loading }: MarketContextPanelProps) {
  if (loading) {
    return <div className="rounded-2xl border border-edge bg-surface h-16 animate-pulse" />;
  }
  if (!ctx) return null;

  const ms = marketSummary ?? {};
  const sp500 = ms.SP500;
  const nasdaq = ms.NASDAQ;
  const cac40 = ms.CAC40;
  const us10y = ms.US10Y;
  const eur = ms.EUR;
  const gold = ms.Or;
  const wti = ms.WTI;
  const btc = ms.BTC;
  const rut = ms.RUT;
  const move = ms.MOVE;
  const spread = ms.SPREAD_10Y_3M;
  const copperGold = ms.COPPER_GOLD;
  const ita = ms.ITA;
  const smh = ms.SMH;
  const grid = ms.GRID;

  // Snapshot global pour les fonctions contextuelles
  const snapshot: MarketSnapshot = {
    vix: ctx.vix ?? null,
    vix_change_1m: ms.VIX?.change_1m ?? null,
    sp500_price: sp500?.price ?? null,
    sp500_ytd: sp500?.change_ytd ?? null,
    sp500_1m: sp500?.change_1m ?? null,
    nasdaq_ytd: nasdaq?.change_ytd ?? null,
    nasdaq_1m: nasdaq?.change_1m ?? null,
    cac40_ytd: cac40?.change_ytd ?? null,
    cac40_1m: cac40?.change_1m ?? null,
    us10y: us10y?.price ?? null,
    us10y_1m_change: us10y?.change_1m ?? null,
    dxy: null,
    dxy_1m: null,
    gold_ytd: gold?.change_ytd ?? null,
    wti_ytd: wti?.change_ytd ?? null,
    wti_1m: wti?.change_1m ?? null,
    rut_1m: rut?.change_1m ?? null,
    move: move?.price ?? null,
    spread_10y_3m: spread?.price ?? null,
    copper_gold_1m: copperGold?.change_1m ?? null,
  };

  void snapshot;

  return (
    <div className="flex gap-2 sm:gap-3 items-stretch">
        {/* ═════ GROUPE GAUCHE — 7 cols × 2 rows (12 tuiles, 2 cellules vides en bas-droite) ═════ */}
        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-1 flex-[7] min-w-0">
          {/* L1 gauche : indices + secteurs ETFs */}
          <MicroTile label="S&P 500"
            value={sp500?.change_1d != null ? `${sp500.change_1d >= 0 ? "+" : ""}${sp500.change_1d.toFixed(2)}% j` : "—"}
            sub={sp500?.change_ytd != null ? `YTD ${sp500.change_ytd >= 0 ? "+" : ""}${sp500.change_ytd.toFixed(1)}%` : "—"}
            tone={(sp500?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(sp500?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Indice des 500 plus grandes capitalisations US. Baromètre #1 du marché actions américain et indicateur global du sentiment risque."
            howToRead={interpretIndexDay("S&P 500", sp500?.change_1d)} />
          <MicroTile label="NASDAQ"
            value={nasdaq?.change_1d != null ? `${nasdaq.change_1d >= 0 ? "+" : ""}${nasdaq.change_1d.toFixed(2)}% j` : "—"}
            sub={nasdaq?.change_ytd != null ? `YTD ${nasdaq.change_ytd >= 0 ? "+" : ""}${nasdaq.change_ytd.toFixed(1)}%` : "—"}
            tone={(nasdaq?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(nasdaq?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Indice des grandes valeurs technologiques US (Apple, Microsoft, Nvidia...). Plus volatil que le S&P 500 et plus sensible aux taux."
            howToRead={interpretIndexDay("NASDAQ", nasdaq?.change_1d)} />
          <MicroTile label="CAC 40"
            value={cac40?.change_1d != null ? `${cac40.change_1d >= 0 ? "+" : ""}${cac40.change_1d.toFixed(2)}% j` : "—"}
            sub={cac40?.change_ytd != null ? `YTD ${cac40.change_ytd >= 0 ? "+" : ""}${cac40.change_ytd.toFixed(1)}%` : "—"}
            tone={(cac40?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(cac40?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Indice des 40 plus grandes capitalisations françaises (LVMH, Total, Sanofi...). Reflète le marché parisien et l'économie de l'Europe continentale."
            howToRead={interpretIndexDay("CAC 40", cac40?.change_1d)} />
          <MicroTile label="Russell"
            value={rut?.change_1d != null ? `${rut.change_1d >= 0 ? "+" : ""}${rut.change_1d.toFixed(2)}% j` : "—"}
            sub={rut?.change_ytd != null ? `YTD ${rut.change_ytd >= 0 ? "+" : ""}${rut.change_ytd.toFixed(1)}%` : "—"}
            tone={(rut?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(rut?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Russell 2000 — indice des 2000 small caps US. Baromètre de l'économie domestique américaine (les small caps dépendent moins de l'export que les large caps)."
            howToRead={interpretRussell(rut?.change_1d, rut?.change_1m, sp500?.change_1m)}
            empirical={empiricalRussell(rut?.change_1m, sp500?.change_1m)} />
          <MicroTile label="Défense"
            value={ita?.change_1d != null ? `${ita.change_1d >= 0 ? "+" : ""}${ita.change_1d.toFixed(2)}% j` : "—"}
            sub={ita?.change_ytd != null ? `YTD ${ita.change_ytd >= 0 ? "+" : ""}${ita.change_ytd.toFixed(1)}%` : "ITA"}
            tone={(ita?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(ita?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="ETF iShares U.S. Aerospace & Defense (ITA, ~6 Mds $ AUM). Réplique le secteur défense US : Lockheed Martin, RTX, Northrop Grumman, Boeing, General Dynamics. Référence pour suivre les budgets Pentagone et les contrats militaires."
            howToRead={interpretIta(ita?.change_1d, ita?.change_1m)} />
          <MicroTile label="IA / Semis"
            value={smh?.change_1d != null ? `${smh.change_1d >= 0 ? "+" : ""}${smh.change_1d.toFixed(2)}% j` : "—"}
            sub={smh?.change_ytd != null ? `YTD ${smh.change_ytd >= 0 ? "+" : ""}${smh.change_ytd.toFixed(1)}%` : "SMH"}
            tone={(smh?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(smh?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="ETF VanEck Semiconductors (SMH, ~25 Mds $ AUM). Concentré sur les semi-conducteurs : NVIDIA, TSMC, Broadcom, AMD, ASML. Proxy le plus pur du hardware IA — bouge typiquement avant le NASDAQ sur les phases d'enthousiasme/déception IA."
            howToRead={interpretSmh(smh?.change_1d, smh?.change_1m)} />
          <MicroTile label="Réseau élec."
            value={grid?.change_1d != null ? `${grid.change_1d >= 0 ? "+" : ""}${grid.change_1d.toFixed(2)}% j` : "—"}
            sub={grid?.change_ytd != null ? `YTD ${grid.change_ytd >= 0 ? "+" : ""}${grid.change_ytd.toFixed(1)}%` : "GRID"}
            tone={(grid?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            subTone={(grid?.change_ytd ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="ETF First Trust Smart Grid Infrastructure (GRID). Suit les équipementiers du réseau électrique modernisé (transmission, distribution, stockage stationnaire). C'est le segment dans lequel s'inscrit EOSE (batteries zinc grid-scale). ETF peu liquide → momentum 30j parfois bruité."
            howToRead={interpretGrid(grid?.change_1d, grid?.change_1m, grid?.change_ytd)} />

          {/* L2 gauche : devise + matières + crypto + ratio (5 tuiles → 2 cells vides en fin) */}
          <MicroTile label="EUR/USD"
            value={eur?.price != null ? eur.price.toFixed(3) : "—"}
            sub={eur?.change_1m != null ? `30j ${eur.change_1m >= 0 ? "+" : ""}${eur.change_1m.toFixed(1)}%` : "FX"}
            tone="neutral"
            whatIsIt="Taux de change euro contre dollar US — la paire la plus tradée au monde. Reflète la divergence de politique monétaire entre BCE et Fed."
            howToRead={interpretEur(eur?.price, eur?.change_1m)} />
          <MicroTile label="Pétrole"
            value={wti?.price != null ? `${wti.price.toFixed(1)}$` : "—"}
            sub={dualSub(wti?.change_1d, wti?.change_ytd, 0)}
            tone={(wti?.change_ytd ?? 0) > 50 ? "bad" : (wti?.change_ytd ?? 0) > 20 ? "warn" : "neutral"}
            whatIsIt="Prix du baril WTI (West Texas Intermediate) en dollars. Driver clé de l'inflation des biens et services (carburants, transport, plastiques, agro)."
            howToRead={interpretWti(wti?.price, wti?.change_ytd)} />
          <MicroTile label="Or"
            value={gold?.price != null ? `${gold.price.toFixed(0)}$` : "—"}
            sub={dualSub(gold?.change_1d, gold?.change_ytd, 0)}
            tone="neutral"
            whatIsIt="Prix de l'once d'or ($/oz, futures GC=F). Valeur refuge classique, utilisée pour se protéger contre l'inflation, les crises et la dépréciation du dollar."
            howToRead={interpretGold(gold?.price, gold?.change_ytd)} />
          <MicroTile label="BTC"
            value={btc?.price != null ? `${(btc.price / 1000).toFixed(1)}K$` : "—"}
            sub={dualSub(btc?.change_1d, btc?.change_ytd, 0)}
            tone={(btc?.change_1d ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Bitcoin — cryptomonnaie de référence. Sert de proxy pour l'appétit pour le risque et la liquidité globale du système (souvent corrélé au NASDAQ en mode risk-on)."
            howToRead={interpretBtc(btc?.price, btc?.change_1d)} />
          <MicroTile label="Cu/Or"
            value={copperGold?.price != null ? copperGold.price.toFixed(2) : "—"}
            sub={copperGold?.change_1m != null ? `30j ${copperGold.change_1m >= 0 ? "+" : ""}${copperGold.change_1m.toFixed(1)}%` : "ratio"}
            tone={(copperGold?.change_1m ?? 0) > 3 ? "good" : (copperGold?.change_1m ?? 0) < -3 ? "bad" : "neutral"}
            subTone={(copperGold?.change_1m ?? 0) >= 0 ? "good" : "bad"}
            whatIsIt="Ratio cuivre/or × 1000. Cuivre = cyclique (bâtiment, électrification, économie réelle). Or = défensif. Mesure la conviction des investisseurs sur la croissance économique."
            howToRead={interpretCopperGold(copperGold?.price, copperGold?.change_1m)} />
        </div>

        {/* ═════ GROUPE DROITE — 2 cols × 2 rows (4 tuiles : volatilité en haut, taux en bas) ═════ */}
        <div className="grid grid-cols-2 gap-1 flex-[2] min-w-0 border-l border-edge/30 pl-2 sm:pl-3">
          {/* L1 droite : volatilité */}
          <MicroTile label="VIX"
            value={ctx.vix != null ? ctx.vix.toFixed(1) : "—"}
            sub="stress" tone={(ctx.vix ?? 0) > 25 ? "bad" : (ctx.vix ?? 0) > 18 ? "warn" : "good"}
            whatIsIt="Indice de volatilité implicite du S&P 500 sur 30 jours, calculé à partir des prix d'options. Mesure la 'peur' anticipée par le marché."
            howToRead={interpretVix(ctx.vix)}
            empirical={empiricalVix(ctx.vix)} />
          <MicroTile label="MOVE"
            value={move?.price != null ? move.price.toFixed(0) : "—"}
            sub="vol bonds" tone={(move?.price ?? 0) > 130 ? "bad" : (move?.price ?? 0) > 100 ? "warn" : "good"}
            whatIsIt="Équivalent du VIX pour les obligations US (volatilité implicite des Treasuries). Le marché obligataire bouge souvent AVANT les actions en cas de stress."
            howToRead={interpretMove(move?.price)}
            empirical={empiricalMove(move?.price)} />

          {/* L2 droite : taux */}
          <MicroTile label="US 10Y"
            value={us10y?.price != null ? `${us10y.price.toFixed(2)}%` : "—"}
            sub="taux" tone={(us10y?.price ?? 0) > 5 ? "bad" : (us10y?.price ?? 0) > 4.5 ? "warn" : "good"}
            whatIsIt="Rendement du Treasury américain à 10 ans. Taux de référence mondial pour valoriser TOUS les actifs (actions, immobilier, crédit corporate)."
            howToRead={interpretUs10y(us10y?.price)} />
          <MicroTile label="10Y-3M"
            value={spread?.price != null ? `${spread.price >= 0 ? "+" : ""}${spread.price.toFixed(2)}` : "—"}
            sub="courbe" tone={(spread?.price ?? 0) < 0 ? "bad" : (spread?.price ?? 0) < 0.3 ? "warn" : "good"}
            whatIsIt="Spread entre le Treasury 10 ans et le T-bill 3 mois. Indicateur de récession le plus fiable historiquement, utilisé par la Fed de New York dans son modèle officiel."
            howToRead={interpretSpread(spread?.price)}
            empirical={SPREAD_EMPIRICAL} />
        </div>
    </div>
  );
}

/* ── Micro-tuile compacte unifiée pour le bandeau du haut ───────────── */
/* Direction A — minimaliste : bordure très fine, couleur réservée au chiffre,
   micro-point rouge pour signaler les indicateurs critiques uniquement.    */

const TILE_BASE = "bg-transparent border border-edge/15 hover:border-edge/40 hover:bg-surface/30 transition-colors";

const TONE_VALUE: Record<string, string> = {
  good:    "text-emerald-700 dark:text-emerald-500",
  warn:    "text-amber-700 dark:text-amber-500",
  bad:     "text-red-700 dark:text-red-500",
  neutral: "text-primary",
};

const POPOVER_WIDTH = 240; // px — doit matcher w-60

function MicroTile({ label, value, sub, tone, subTone, whatIsIt, howToRead, empirical }: {
  label: string; value: string; sub: React.ReactNode;
  tone: "good" | "warn" | "bad" | "neutral";
  subTone?: "good" | "warn" | "bad" | "neutral"; // Couleur dédiée si sub est une string ; ignoré si sub est du JSX coloré inline
  whatIsIt?: string;    // Définition pédagogique de l'indicateur
  howToRead?: string;   // Interprétation du chiffre actuel
  empirical?: string;   // Stat empirique solide (uniquement quand contexte le mérite)
}) {
  const [open, setOpen] = useState(false);
  // Coords absolues calculées pour le popover. On utilise position:fixed
  // pour échapper au stacking context du panneau parent (sinon les cards
  // qui suivent dans le DOM passent par-dessus à cause de z-index local).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasInfo = !!(whatIsIt || howToRead || empirical);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inWrapper = wrapperRef.current?.contains(target);
      const inPopover = popoverRef.current?.contains(target);
      if (!inWrapper && !inPopover) setOpen(false);
    };
    const onScrollOrResize = () => setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  // Calcule top/left absolus du popover (position: fixed) en clampant dans la viewport.
  const computePos = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const top = rect.bottom + 4;
    let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
    if (left < margin) left = margin;
    if (left + POPOVER_WIDTH > window.innerWidth - margin) left = window.innerWidth - POPOVER_WIDTH - margin;
    setPos({ top, left });
  };

  const openNow = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    computePos();
    setOpen(true);
  };
  const closeSoon = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  return (
    <div ref={wrapperRef} className="relative"
      onMouseEnter={hasInfo ? openNow : undefined}
      onMouseLeave={hasInfo ? closeSoon : undefined}
    >
      <button ref={buttonRef} type="button"
        className={`relative w-full rounded ${TILE_BASE} px-1 py-0.5 text-center ${
          hasInfo ? "cursor-help hover:ring-1 hover:ring-accent/30" : ""
        }`}
        onClick={hasInfo ? (e) => { e.stopPropagation(); if (!open) computePos(); setOpen(!open); } : undefined}
        aria-expanded={open}
      >
        {tone === "bad" && (
          <span className="absolute top-1 left-1 w-1 h-1 rounded-full bg-red-500/80" aria-hidden />
        )}
        <p className="text-[0.45rem] font-bold uppercase tracking-wider text-muted leading-tight truncate">{label}</p>
        <p className={`text-[0.7rem] font-bold font-mono leading-tight ${TONE_VALUE[tone]}`}
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{value}</p>
        <p className={`text-[0.45rem] tracking-wider leading-tight truncate ${subTone ? TONE_VALUE[subTone] + " font-medium" : "text-muted opacity-70"}`}>{sub}</p>
      </button>

      {open && hasInfo && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[1000] w-60 rounded-lg border border-edge bg-surface shadow-xl p-2.5 text-left"
          style={{ top: pos.top, left: pos.left }}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          <div className="flex items-baseline justify-between mb-1.5 pb-1.5 border-b border-edge/40">
            <span className="text-xs font-bold text-primary">{label}</span>
            <span className="text-[0.7rem] font-mono font-bold text-navy dark:text-accent">{value}</span>
          </div>
          {whatIsIt && (
            <div className="mb-1.5">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted mb-0.5">Définition</p>
              <p className="text-[0.7rem] text-secondary leading-relaxed">{whatIsIt}</p>
            </div>
          )}
          {howToRead && (
            <div className={empirical ? "mb-1.5" : ""}>
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-muted mb-0.5">Lecture du chiffre actuel</p>
              <p className="text-[0.7rem] text-secondary leading-relaxed">{howToRead}</p>
            </div>
          )}
          {empirical && (
            <div className="rounded border border-amber-500/30 bg-amber-500/5 p-1.5 mt-1">
              <p className="text-[0.55rem] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-0.5">Empiriquement</p>
              <p className="text-[0.7rem] text-secondary leading-relaxed">{empirical}</p>
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
