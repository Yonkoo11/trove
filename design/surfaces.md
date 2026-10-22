# Surfaces

Real data behind each screen. A screen with no real data is cut.

| Route | What it shows | Real data behind it | Reachable today |
|---|---|---|---|
| #/borrow (default) | Loan ticket form: ZEC collateral in, dollars out. Live max borrow, LTV, liquidation price, interest, total to repay, term. Beside it: what the chain shows for the lock transaction | src/money.mjs and src/defaults.mjs (40% start, 70% liquidation, 5% penalty, 10% APR); site/gate1-viewer-fields.json (txid 04e045ba..., height 117, fee 10000 zat, 0 transparent in/out, 2 Ironwood actions) | yes |
| #/loans | Table of the three regtest runs: repay, price default, abort. State, signers, paid amounts, a stub line of what the chain showed | README lifecycle numbers (repay: borrower +99,990,000 zat; default: lender +93,328,625, borrower +6,641,375; abort: borrower +99,990,000), labelled regtest 2026-10-22 | yes |
| #/loan/:id | One loan: state timeline, who signs each ending, what a public viewer sees and what stays public | src/loan.mjs states and release policy; the same run numbers | yes |
| #/lend | Lender view of the same ticket: what they fund, what they earn, what they can and cannot sign alone | src/loan.mjs, src/money.mjs interestDue | yes |
| #/limits | What is not hidden or not enforced by the chain, back-test, how to verify | README honesty table; data/zec-usd-365d.json back-test (336 loans, 11% liquidated, 0 bad debt at 40/70) | yes |

Not on a screen because there is no data: mainnet or testnet loans, live on-chain prices, wallet connection. The page says so rather than faking them.

## States per screen
- Borrow: empty (no amount: placeholders and a default worked example labelled as one), loading (price fetching: last stored close shown, labelled with its date), populated, error (amount over max: the ticket says the limit and the button is disabled).
- Loans: populated only; each row says "regtest run" so nothing reads as a live loan.
- Loan detail: unknown id shows "No such loan" with a link back to Loans.
- Lend, Limits: static.
- Working surface: Borrow, the loan ticket form with live cost lines (site/app.js, route #/borrow).
