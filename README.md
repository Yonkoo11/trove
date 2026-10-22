# Trove

![tests: 47 pass](https://img.shields.io/badge/npm%20test-47%20pass-brightgreen) ![chain: regtest only](https://img.shields.io/badge/chain-regtest%20only-lightgrey)

A fixed-term ZEC-collateral loan desk for two parties. The borrower's collateral sits in a **shielded vault** whose spend key is a 2-of-3 FROST key split between borrower, lender and a keeper. On the Zcash chain the lock and every payout look like ordinary shielded transfers: no amounts, no addresses, only the fee.

Built for Zecathon, Private Markets track. Status: loan rules and keeper reader tested; full lifecycle tested on a **local regtest chain**; not run on public testnet; not audited.

## What's real, and what we deliberately did not claim

| Capability | Evidence | Status |
|---|---|---|
| Loan rules (open, repay, price default, term default, abort) | `npm test`: 47 pass, 0 fail | tested |
| Lock, repay, default and abort move real shielded funds with the right 2 of 3 signers | `node scripts/lifecycle.mjs A\|B\|C` on regtest, balances checked after each | tested (regtest only) |
| A viewer of the chain sees only the fee | `docs/gate1-viewer-fields.json`: valueBalanceZat 10000, transparent in/out 0/0 | tested (one tx) |
| Default limits 40% open / 70% liquidate | `node scripts/backtest.mjs` over 365 daily ZEC closes: 11% of 30-day loans liquidated, 0 bad debt | tested, daily prices miss intraday dips |
| Fresh-context attacker review | 10 findings, 7 fixed with tests, A7 and lender overpayment disclosed below | reviewed, not proven |
| Forged signature rejected by the node | signer tool rejects a random signature; a forged one sent straight to the node was not tried | not tested |
| Public testnet run | none | not done |
| Anonymity of the loan | not claimed: the stablecoin leg is public and the keeper sees the price it signs | not claimed |
| On-chain enforcement of who signs a payout | not claimed: any 2 of 3 keys can spend | not claimed |
| Audit of the FROST crates or this code | none | not done |

## What this does not hide or stop

- **The stablecoin leg is public.** Principal and repayment cross chains and are visible there.
- **Policy is software, not chain law.** Any 2 of the 3 keys can spend. Keeper + lender together can take the collateral. Who signs each payout is enforced by `src/loan.mjs`, not by Zcash.
- **The price is the keeper's reading.** Median of at least two keyless sources (CoinGecko live; Coinbase and Kraken parsers tested only against sample replies), signed with ed25519, not verified on-chain.
- **The FROST crates are unaudited** and the demo tool is marked "not for production". The orchard fork with FROST support (`unstable-frost`, zcash/orchard#475) is unmerged.
- **Event time is supplied by the driver.** The rules trust it to come from a trusted clock or block time.
- Fixed in the rules and unit-tested, not re-run on chain: late or short deposits are refunded in full (`refundDeposit`), over-locked collateral is returned in full, duplicate loan ids are refused by `LoanBook` (findings A2, A3, A9).
- Still open: a lender can hold back a newer price and submit an older one that is still fresh (A7, bounded by `maxPriceAge`); a lender who pays more than the principal is not refunded the extra; one shared vault wallet serves every loan on regtest.

## Verify it yourself

```
npm test                         # 42 pass, 0 fail
node scripts/backtest.mjs        # table of liquidation rates; worst day -26.1%
```

Chain runs need the local regtest stack (zebrad, zainod, frost-zcash-demo built under `spike/`, which is not committed); see `spike-scripts/gate2-setup.sh` then `node scripts/lifecycle.mjs A`. Expected: A ends `closed_repaid` with the borrower +99990000 zat, B ends `closed_defaulted` (lender +93328625, borrower +6641375), C ends `closed_aborted` with the borrower +99990000. Those are the numbers from the 2026-10-22 runs.

## Project layout

```
trove/
├── src/       loan rules, BigInt money maths, signed keeper price
├── scripts/   lifecycle.mjs (regtest runs A, B, C), backtest.mjs
├── site/      the app: Borrow, Loans, Lend, Limits (static, no build step)
├── test/      unit and random-sequence stress tests
├── docs/      gate1-viewer-fields.json, what a chain viewer sees
├── design/    audience, judge, direction and build brief
└── company/   THESIS.md
```
