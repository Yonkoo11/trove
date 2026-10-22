# Surfaces

| Route | Shows | Real data behind it | Reachable |
|---|---|---|---|
| / (one page) | Receipt of the lock transaction: what a public viewer sees vs what each party sees | site/gate1-viewer-fields.json (regtest tx 04e045ba…c169, height 117, valueBalanceZat 10000, 2 actions) | yes |
| / loan endings | Repay, default, abort: signers and paid zat | README.md lifecycle numbers: 99,990,000 / 93,328,625 + 6,641,375 / 99,990,000 | yes |
| / still public | Stablecoin leg, keeper reading, unaudited FROST, regtest only, open findings A2 A3 A7 A9 | README.md limits | yes |
| / limits back-test | 11% of 336 thirty-day loans liquidated, 0 bad debt at 40/70 | scripts/backtest.mjs over data/zec-usd-365d.json | yes |
| / verify | npm test 35 pass; commands to rerun | package.json | yes |

States: static page, no loading or error states; the receipt is data in the HTML, not fetched.
