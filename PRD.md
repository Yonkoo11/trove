# Trove: product brief

**Who:** a ZEC holder who wants dollars without selling or exposing the holding, and a lender who wants a fixed-term loan with collateral they cannot be cheated out of. A keeper (third party) breaks ties.

**What:** a fixed-term loan desk. Collateral sits in a shielded vault; spend needs 2 of 3 keys (borrower, lender, keeper). Quote, lock, repay or default, release.

**Numbers the product runs on (from `src/defaults.mjs`):**

```js
DEFAULT_LIMITS = { maxStartLtvBps: 4000, liqLtvBps: 7000, penaltyBps: 500, aprBps: 1000 }
// 40% max start LTV, 70% liquidation LTV, 5% default penalty, 10% APR
// vault spend: 2 of 3 FROST signatures (borrower, lender, keeper)
// price: median of at least 2 keyless sources, ed25519-signed, max age 600 s
// release: repay = borrower+lender, default = lender+keeper, abort = borrower+keeper
```

- Back-test: 336 thirty-day loans, 11% liquidated, 0 bad debt at 40/70.
- Regtest payouts: repay +99990000 zat, default 93328625 / 6641375 zat, abort and late-deposit refund +99990000 zat.
- Tests: 47 pass, 0 fail.

**Screens (static site, `site/`):**
- Borrow: enter ZEC and dollars wanted, see the loan-to-value, interest and the two limits (40% start, 70% liquidate), get the loan terms.
- Loans: the three regtest runs (A repaid, B price default, C aborted), who signed, what was paid out.
- Lend: the lender's side of a quote.
- Limits: back-test of the limits over 365 daily ZEC closes.
- Loan detail: state timeline, payout, what the chain shows (fields from `docs/gate1-viewer-fields.json`) and what stays public.

## Acceptance list and verification

Run each command; the expected output is the bar. If it differs, fix the code, never the expected value.

```sh
npm test                                   # expect: # pass 47, # fail 0
node scripts/backtest.mjs                  # expect: 336 loans, 11% liquidated, 0 bad debt at 40/70
node scripts/lifecycle.mjs A               # expect: {"borrower":"99990000","lender":"0"} closed_repaid
node scripts/lifecycle.mjs B               # expect: {"borrower":"6641375","lender":"93328625"} closed_defaulted
node scripts/lifecycle.mjs C               # expect: {"borrower":"99990000","lender":"0"} closed_aborted
node scripts/lifecycle.mjs D               # expect: {"borrower":"99990000","lender":"0"} closed_aborted
DESIGN_URL=http://localhost:5173 bash ~/.claude/skills/design/scripts/design-check.sh . http://localhost:5173   # expect: exit 0
```

- [ ] `npm test` ends with 47 pass, 0 fail
- [ ] backtest prints 11% liquidated, 0 bad debt at 40% and 70%
- [ ] A, B, C, D end in the states and balances above
- [ ] every route loads with 0 console errors at 1440px and 390px
- [ ] no copy says the loan is hidden end to end (the stablecoin leg is public)

## Loan terms the Borrow screen prints (1 ZEC = 100000000 zat)

```js
{ collateralZat: 100000000n, maxStartLtvBps: 4000, liqLtvBps: 7000,
  penaltyBps: 500, aprBps: 1000, termSeconds: 2592000, // 30 days
  fundWindow: 3600, payWindow: 3600, maxPriceAge: 600, // 1 hour, 1 hour, 10 minutes
  signers: ['borrower', 'lender', 'keeper'], threshold: 2 }
```

## Setup (one list, 20 minutes)

1. Node 20. 2. Local regtest stack: zebrad, zainod, frostd (`spike-scripts/gate2-setup.sh`). 3. No API keys: price sources are keyless.

## What people get wrong

- Calling the loan "private" end to end. The stablecoin leg is visible; say what is hidden and what is not.
- Claiming the release rules are enforced by the chain. They are enforced by software in `src/loan.mjs`.
- Claiming mainnet or an audit. Regtest only, unaudited.

## Finished output

Loan detail for scenario B: state `closed_defaulted`, lender +93328625 zat, borrower +6641375 zat, chain view shows only the fee (10000 zat). That is the bar.

**Not in scope:** mainnet, an audit, on-chain policy enforcement, a second asset.
