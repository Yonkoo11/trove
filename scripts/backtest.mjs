// Replays 30-day loans over daily ZEC/USD closes (CoinGecko, 365 days to 2026-10-22) at several opening and
// liquidation LTVs. Daily closes miss intraday moves, so the gap risk it reports is a floor, not a ceiling.
import { readFileSync } from 'node:fs';
const prices = JSON.parse(readFileSync(new URL('../data/zec-usd-365d.json', import.meta.url))).prices.map((p) => p[1]);
const TERM = 30, APR = 0.10;
const rows = [];
for (const open of [0.3, 0.4, 0.5]) for (const liq of [0.65, 0.70, 0.75, 0.85]) {
  let n = 0, liqd = 0, falseLiq = 0, bad = 0;
  for (let s = 0; s + TERM < prices.length; s++) {
    n++;
    const debt0 = open * prices[s];
    let hit = -1;
    for (let d = 1; d <= TERM; d++) {
      const debt = debt0 * (1 + APR * d / 365);
      if (debt / prices[s + d] >= liq) { hit = d; break; }
    }
    if (hit < 0) continue;
    liqd++;
    const debtHit = debt0 * (1 + APR * hit / 365);
    if (debtHit / prices[s + hit] >= 1) bad++;                         // collateral no longer covers the debt
    if (debt0 * (1 + APR * TERM / 365) / prices[s + TERM] < open) falseLiq++; // would have been healthier than at opening by term end
  }
  rows.push({ open, liq, loans: n, liquidatedPct: +(100 * liqd / n).toFixed(1), badDebtPct: +(100 * bad / n).toFixed(1), falseLiqPct: +(100 * falseLiq / n).toFixed(1) });
}
console.table(rows);
const worst = Math.min(...prices.slice(1).map((p, i) => p / prices[i] - 1));
console.log(`worst one-day move in the data: ${(worst * 100).toFixed(1)}%`);
