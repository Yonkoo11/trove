// Default loan limits, set from scripts/backtest.mjs over 365 days of daily ZEC closes (see README "Back-test").
// Open at 40% LTV, liquidate at 70%: 11% of 30-day loans liquidated, 0 bad debt in the data. The worst one-day
// move was -26%, so a 70% line (70/0.74 = 95%) still covers the debt after that move; 75% (101%) would not.
export const DEFAULT_LIMITS = { maxStartLtvBps: 4000, liqLtvBps: 7000, penaltyBps: 500, aprBps: 1000 };
