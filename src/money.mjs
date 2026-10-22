// Integer money. Zcash amounts are zats (1e-8 ZEC). Prices are micro-USD per 1 ZEC. Debt is micro-USD.
// BigInt only: floats would make the liquidation line depend on rounding.
export const ZAT_PER_ZEC = 100_000_000n;
export const YEAR_SECONDS = 31_536_000n;

/** Value of `zat` in micro-USD at `priceMicroUsd` per ZEC, rounded down (the lender's collateral is never overstated). */
export function collateralValue(zat, priceMicroUsd) {
  return (zat * priceMicroUsd) / ZAT_PER_ZEC;
}

/** Simple interest, rounded up (the borrower is never undercharged by rounding). */
export function interestDue(principal, aprBps, elapsedSeconds) {
  const e = elapsedSeconds < 0n ? 0n : elapsedSeconds;
  const num = principal * aprBps * e;
  const den = 10_000n * YEAR_SECONDS;
  return (num + den - 1n) / den;
}

/** Loan-to-value in basis points, rounded up (a borderline loan reads as riskier, never safer). */
export function ltvBps(debt, zat, priceMicroUsd) {
  const v = collateralValue(zat, priceMicroUsd);
  if (v <= 0n) return 1_000_000n;
  return (debt * 10_000n + v - 1n) / v;
}
