# Trove

![tests: 52 pass](https://img.shields.io/badge/npm%20test-52%20pass-brightgreen) ![chain: regtest + testnet](https://img.shields.io/badge/chain-regtest%20%2B%20testnet-lightgrey)

Live quote desk: https://trovedesk.xyz (no real funds).

A fixed-term ZEC-collateral loan desk for two parties. The borrower's collateral sits in a **shielded vault** whose spend key is a 2-of-3 FROST key split between borrower, lender and a keeper. On the Zcash chain the lock and every payout look like ordinary shielded transfers: no amounts, no addresses, only the fee.

Built for Zecathon, Private Markets track. Status: loan rules and keeper reader tested; full lifecycle tested on a **local regtest chain**; lock and three payouts run on **public Zcash testnet** (26 Oct 2026); not audited.

## What's real, and what we deliberately did not claim

| Capability | Evidence | Status |
|---|---|---|
| Loan rules (open, repay, price default, term default, abort) | `npm test`: 52 pass, 0 fail | tested |
| Lock, repay, default, abort and late-deposit refund move real shielded funds with the right 2 of 3 signers | `node scripts/lifecycle.mjs A\|B\|C\|D` on regtest, balances checked after each | tested (regtest only) |
| A viewer of the chain sees only the fee | `docs/gate1-viewer-fields.json`: valueBalanceZat 10000, transparent in/out 0/0 | tested (one tx) |
| Default limits 40% open / 70% liquidate | `node scripts/backtest.mjs` over 365 daily ZEC closes: 11% of 30-day loans liquidated, 0 bad debt | tested, daily prices miss intraday dips |
| Fresh-context attacker review | 10 findings, 7 fixed with tests, A7 closed at the keeper's signing step, see below | reviewed, not proven |
| Forged signature rejected by the node | a real FROST-signed vault spend with one bit flipped in a spend signature (first half, then second half) was posted to the node: both refused ("Orchard or Ironwood Halo2 proof verification failed", the node's single message for its batched proof and signature check), the untouched copy was accepted (`spike-scripts/forged-node.py`); the signer and builder also refuse tampered signatures earlier (`forged.sh`) | tested (regtest) |
| Public testnet run | lock `ed25f049...63dd` then repay-style, default and abort payouts (`73f46ef8...dc48`, `37284cad...6994`, `ab24ccf6...f099`) on testnet.zec.rocks; a fresh view-only wallet synced from the public server shows the vault at 0.0497 ZEC, borrower 0.35, lender 0.10; one signer alone produced no signature. A second 0.2 ZEC lock, an overdraw refused (by the wallet's balance check) and two payouts in a row before change confirmed (`6da6b8bb...cad0`, `e5e6aa88...42a4`) also ran. `spike-scripts/testnet-setup.sh`, `build-signer-nu7.sh` | tested (testnet, one run; refund by name, keeper price signing and block-explorer confirmation not run) |
| Anonymity of the loan | not claimed: the stablecoin leg is public and the keeper sees the price it signs | not claimed |
| On-chain enforcement of who signs a payout | not claimed: any 2 of 3 keys can spend | not claimed |
| Audit of the FROST crates or this code | none | not done |

## What this does not hide or stop

- **The stablecoin leg is public.** Principal and repayment cross chains and are visible there.
- **Policy is software, not chain law.** Any 2 of the 3 keys can spend. Keeper + lender together can take the collateral. Who signs each payout is enforced by `src/loan.mjs`, not by Zcash.
- **The price is the keeper's reading.** Median of at least two keyless sources (CoinGecko, Gemini and Bitfinex read live on 2026-10-25 and agree within 3%; Coinbase and Kraken parsers tested only against sample replies), signed with ed25519, not verified on-chain.
- **The FROST crates are unaudited** and the demo tool is marked "not for production". The vault key comes from an experimental Orchard call (`unstable-frost`, zcash/orchard#475) that is unmerged. Its reviewer marked it temporary and incompatible with ZIP 2005 quantum recoverability, and warned that future wallets might not support such keys, so the funds could become inaccessible. It is why Trove stays on regtest.
- **Event time is supplied by the driver.** The rules trust it to come from a trusted clock or block time.
- Fixed in the rules and unit-tested, not re-run on chain: late or short deposits are refunded in full (`refundDeposit`), over-locked collateral is returned in full, duplicate loan ids are refused by `LoanBook` (findings A2, A3, A9).
- A7 (a lender holding back a newer price and submitting an older one still inside `maxPriceAge`): a default is now a two-step event. The lender declares it, then the keeper's `keeperCosign` step takes its own newer signed reading, refuses a price default if that reading puts the loan back under the liquidation line, and stores the split at the keeper's price. Payouts are only accepted after that step. Tested in `test/loan.test.mjs` and run on chain in lifecycle B. It is the keeper's rule, not something the chain enforces; a keeper that colludes with the lender defeats it.
- Still open: a payment above what the loan needs is flagged as a refund owed (`excess` effect), but the refund itself is a manual step on the other chain; one shared vault wallet serves every loan on regtest.

## How a loan works

1. The borrower enters ZEC and a dollar amount. The page makes a request code that holds only those two numbers.
2. A lender pastes the code, checks the terms, and funds the dollar side. The ZEC is locked in a shielded vault that needs two of three keys (borrower, lender, keeper).
3. The policy fixes who gets paid. Repaid: borrower and lender. Defaulted or liquidated: lender and keeper. Aborted or refunded: borrower and keeper.

## What each key can do

- **Borrower:** repay and get the ZEC back, or refund an unfunded request.
- **Lender:** with the keeper, take the ZEC after a default or liquidation.
- **Keeper:** signs the price and co-signs defaults and refunds. It cannot move funds alone.

## What the chain shows

The vault release is shielded. Only transaction fees are visible; `site/gate1-viewer-fields.json` lists the fields a viewer sees. The dollar payment on the other chain and the keeper's price reading are public.

## Verify it yourself

```
npm test                         # 52 pass, 0 fail
node scripts/backtest.mjs        # table of liquidation rates; worst day -26.1%
```

Chain runs need the local regtest stack (zebrad, zainod, frost-zcash-demo built under `spike/`, which is not committed); see `spike-scripts/gate2-setup.sh` then `node scripts/lifecycle.mjs A`. Expected: A ends `closed_repaid` with the borrower +99990000 zat, B ends `closed_defaulted` (lender +93328625, borrower +6641375), C ends `closed_aborted` with the borrower +99990000, D (deposit after the funding window) is refused by the rules, then refunded to the borrower +99990000 (`closed_aborted`). Those are the numbers from the 2026-10-25 runs on a freshly built chain (lifecycle B stalled once on a local tool, then passed on rerun).

## Project layout

```
trove/
├── src/       loan rules, BigInt money maths, signed keeper price
├── scripts/   lifecycle.mjs (regtest runs A, B, C, D), backtest.mjs
├── site/      the app: Borrow, Loans, Lend, Limits (static, no build step)
├── test/      unit and random-sequence stress tests
├── docs/      MAINNET.md (what must be true before real funds), what a chain viewer sees
├── spike-scripts/  regtest and testnet setup, signer build, forged-signature check
└── brand/     logo exports
```
