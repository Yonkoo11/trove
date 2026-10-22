# Trove: product brief

**Who:** a ZEC holder who wants dollars without selling or exposing the holding, and a lender who wants a fixed-term loan with collateral they cannot be cheated out of. A keeper (third party) breaks ties.

**What:** a fixed-term loan desk. Collateral sits in a shielded vault; spend needs 2 of 3 keys (borrower, lender, keeper). Quote, lock, repay or default, release.

**Screens (static site, `site/`):**
- Borrow: enter ZEC and dollars wanted, see the loan-to-value, interest and the two limits (40% start, 70% liquidate), get the loan terms.
- Loans: the three regtest runs (A repaid, B price default, C aborted), who signed, what was paid out.
- Lend: the lender's side of a quote.
- Limits: back-test of the limits over 365 daily ZEC closes.
- Loan detail: state timeline, payout, what the chain shows (fields from `docs/gate1-viewer-fields.json`) and what stays public.

**Acceptance (each runnable):**
1. `npm test` passes (loan rules, money maths, random-sequence stress).
2. `node scripts/backtest.mjs` prints the liquidation rate and bad debt.
3. `node scripts/lifecycle.mjs A|B|C` on regtest ends with the balances in the README.
4. Site loads at every route with no console errors; `design-check.sh` passes.
5. No copy claims the loan is hidden end to end: the stablecoin leg is public.

**Not in scope:** mainnet, an audit, on-chain policy enforcement, a second asset.
