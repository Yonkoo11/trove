# Trove

![tests: 122 pass](https://img.shields.io/badge/npm%20test-122%20pass-brightgreen) ![chain: regtest + testnet](https://img.shields.io/badge/chain-regtest%20%2B%20testnet-lightgrey)

Live quote desk: https://trovedesk.xyz (no real funds).

A fixed-term ZEC-collateral loan desk for two parties. The borrower's collateral sits in a **shielded vault** whose spend key is a 2-of-3 FROST key split between borrower, lender and a keeper. On the Zcash chain the lock and every payout look like ordinary shielded transfers: no amounts, no addresses, only the fee.

Built for Zecathon, Private Markets track. Status: loan rules and keeper reader tested; full lifecycle tested on a **local regtest chain**; lock and three payouts run on **public Zcash testnet** (26 Oct 2026); loan rules reviewed by us on 28 Oct 2026, no outside audit.

## What's real, and what we deliberately did not claim

| Capability | Evidence | Status |
|---|---|---|
| Loan rules (open, repay, price default, term default, abort) | `npm test`: 122 pass, 0 fail | tested |
| Lock, repay, default, abort and late-deposit refund move real shielded funds with the right 2 of 3 signers | `node scripts/lifecycle.mjs A\|B\|C\|D` on regtest, balances checked after each | tested (regtest only) |
| A viewer of the chain sees only the fee | `docs/gate1-viewer-fields.json`: valueBalanceZat 10000, transparent in/out 0/0 | tested (one tx) |
| Default limits 40% open / 70% liquidate | `node scripts/backtest.mjs` over 365 daily ZEC closes: 11% of 30-day loans liquidated, 0 bad debt | tested, daily prices miss intraday dips |
| Fresh-context attacker review | 10 findings, 7 fixed with tests, A7 closed at the keeper's signing step, see below | reviewed, not proven |
| Forged signature rejected by the node | a real FROST-signed vault spend with one bit flipped in a spend signature (first half, then second half) was posted to the node: both refused ("Orchard or Ironwood Halo2 proof verification failed", the node's single message for its batched proof and signature check), the untouched copy was accepted (`spike-scripts/forged-node.py`); the signer and builder also refuse tampered signatures earlier (`forged.sh`) | tested (regtest) |
| Public testnet run | lock `ed25f049...63dd` then repay-style, default and abort payouts (`73f46ef8...dc48`, `37284cad...6994`, `ab24ccf6...f099`) on testnet.zec.rocks; a fresh view-only wallet synced from the public server shows the vault at 0.0497 ZEC, borrower 0.35, lender 0.10; one signer alone produced no signature. A second 0.2 ZEC lock, an overdraw refused (by the wallet's balance check) and two payouts in a row before change confirmed (`6da6b8bb...cad0`, `e5e6aa88...42a4`) also ran. `spike-scripts/testnet-setup.sh`, `build-signer-nu7.sh` | tested (testnet, one run; refund by name, keeper price signing and block-explorer confirmation not run) |
| Lock page pays the vault from the borrower's own wallet | the QR on `#/lock/trove1.1000000.200` was read off a screenshot with zbarimg, parsed by the reference `zip321` crate (0.01 ZEC, testnet only), and paid by `zcash-devtool wallet pay --payment-uri`: tx `ca513ff2...bcf7`, the vault's view-only wallet rose by 1,000,000 zat and shows the memo `trove1.1000000.200`; `node scripts/qr-roundtrip.mjs` decodes 302 generated codes | tested (testnet, one payment; no phone wallet scanned it) |
| Dollar payment checked before a loan counts as funded | 5 test USDC sent lender to borrower on Solana devnet with memo `trove-L1` (tx `3LMZwcSa...YnxF`); `scripts/check-payment.mjs` counted it as `loanPaid` and refused the same transfer for another loan id, one unit more owed, and sender and recipient swapped. The checker also requires the named sender's signature and refuses a transfer already counted; `test/dollar-check.test.mjs` replays the saved transaction | tested (devnet, one payment, sent from the command line; repay leg checked only in unit tests; not escrow) |
| Desk pause and funds cap refuse new locks | `test/mainnet-guards.test.mjs`, 8 tests: a paused desk or a loan one zatoshi over the cap is refused; a loan already locked can still be paid, repaid, refunded or paid out; a party cannot lift the pause from inside its own event; a junk cap fails closed. `scripts/lifecycle.mjs` reads `TROVE_PAUSED=1`, `TROVE_MAX_COLLATERAL_ZAT` and `TROVE_MAX_PRINCIPAL` and asks the rules before any ZEC moves: paused, collateral over the cap and loan over the cap each stop the run with "no funds moved" | tested (unit tests, and the three refusals run on 28 Oct 2026; a run allowed under a cap not re-run on chain since) |
| Malformed payment data refused, never a crash | `test/dollar-check-hostile.test.mjs`: 27 bad inputs (negative, hex, blank, oversized amounts, bad block times, junk balance entries, non-list fields) each give a refusal; 2000 random balance strings never throw and never count more than the recipient gained (3 extra seeds also 0 fail) | tested |
| Anonymity of the loan | not claimed: the stablecoin leg is public and the keeper sees the price it signs | not claimed |
| On-chain enforcement of who signs a payout | not claimed: any 2 of 3 keys can spend | not claimed |
| Review of the loan rules | logic pass and coupled-state pass over all 11 handlers in `src/loan.mjs`: 2 bugs fixed with tests (`test/audit/self-review.test.mjs`), 2 limits documented below; request links checked against zero, negative, oversized and script-like codes | reviewed by us; outside audit of the FROST crates or this code not done |

## What this does not hide or stop

- **The stablecoin leg is public.** Principal and repayment cross chains and are visible there.
- **Policy is software, not chain law.** Any 2 of the 3 keys can spend. Keeper + lender together can take the collateral. Who signs each payout is enforced by `src/loan.mjs`, not by Zcash.
- **The price is the keeper's reading.** Median of at least two keyless sources (CoinGecko, Gemini and Bitfinex read live on 2026-10-25 and agree within 3%; Coinbase and Kraken parsers tested only against sample replies), signed with ed25519, not verified on-chain.
- **The FROST crates are unaudited** and the demo tool is marked "not for production". The vault key comes from an experimental Orchard call (`unstable-frost`, zcash/orchard#475) that is unmerged. Its reviewer marked it temporary and incompatible with ZIP 2005 quantum recoverability, and warned that future wallets might not support such keys, so the funds could become inaccessible. It is why Trove stays on test networks and off mainnet.
- **Our own review of the loan rules (2026-10-28).** A line-by-line logic pass and a coupled-state pass over every handler in `src/loan.mjs` found two bugs, both fixed with tests in `test/audit/self-review.test.mjs`: the price check judged the agreed collateral while a default paid out the whole vault, and a stray deposit arriving after a closed refund had no way back. Two limits stay: a price drop inside the pay window refuses `loanPaid` after the lender has already sent dollars off-chain, and extra ZEC sent to a vault after the lock needs a manual 2-of-3 signing to return.
- **Event time is supplied by the driver.** The rules trust it to come from a trusted clock or block time.
- Fixed in the rules and unit-tested, not re-run on chain: late or short deposits are refunded in full (`refundDeposit`), over-locked collateral is returned in full, duplicate loan ids are refused by `LoanBook` (findings A2, A3, A9).
- A7 (a lender holding back a newer price and submitting an older one still inside `maxPriceAge`): a default is now a two-step event. The lender declares it, then the keeper's `keeperCosign` step takes its own newer signed reading, refuses a price default if that reading puts the loan back under the liquidation line, and stores the split at the keeper's price. Payouts are only accepted after that step. Tested in `test/loan.test.mjs` and run on chain in lifecycle B. It is the keeper's rule, not something the chain enforces; a keeper that colludes with the lender defeats it.
- Still open: a payment above what the loan needs is flagged as a refund owed (`excess` effect), but the refund itself is a manual step on the other chain; one shared vault wallet serves every loan on regtest.

## How a loan works

1. The borrower enters ZEC and a dollar amount. The page makes a request link that holds only those two numbers.
2. A lender opens the link, checks the terms, and funds the dollar side. The ZEC is locked in a shielded vault that needs two of three keys (borrower, lender, keeper).
3. The policy fixes who gets paid. Repaid: borrower and lender. Defaulted or liquidated: lender and keeper. Aborted or refunded: borrower and keeper.

The website covers step 1, the terms check in step 2, and the lock: `#/lock/<code>` shows a QR code and a ZIP 321 payment link to the shared testnet vault, so the borrower pays from their own wallet. Funding and payouts are not on the site yet: in the regtest and testnet runs they ran from `scripts/lifecycle.mjs` and `spike-scripts/` (see Verify it yourself). The dollar side is a USDC transfer the lender sends from their own wallet with the loan id as a memo; `scripts/check-payment.mjs` confirms it landed before the loan counts as funded. Whoever runs the checker must keep one list of counted signatures across all loans and both directions, so one transfer cannot fund two loans.

## What each key can do

- **Borrower:** repay and get the ZEC back, or refund an unfunded request.
- **Lender:** with the keeper, take the ZEC after a default or liquidation.
- **Keeper:** signs the price and co-signs defaults and refunds. It cannot move funds alone.

## What the chain shows

The vault release is shielded. Only transaction fees are visible; `site/gate1-viewer-fields.json` lists the fields a viewer sees. The dollar payment on the other chain and the keeper's price reading are public.

## Verify it yourself

```
npm test                         # 122 pass, 0 fail
node scripts/check-payment.mjs --sig 3LMZwcSasdL9Qa65LawYVRfwXK9KA47gLyL8F6dqz8bUZYPbC7foQgF3pnZCgKCr7Ju5cC1mP3pPkxHUYNgcYnxF \
  --from FMbu8WyM9RrFYDBqSLHDZZjWHit4dfzCeseXx22AWQx4 --to 8A8mfYzzFY4xgpE32FoM7TpVY7SCShejHWMp6g9yowo5 \
  --loan trove-L1 --min 5000000   # counts: loanPaid, 5000000 base units at 1793178761
node scripts/backtest.mjs        # table of liquidation rates; worst day -26.1%
node scripts/qr-roundtrip.mjs    # ok=302 bad=0 (needs zbarimg: brew install zbar)
```

Chain runs need the local regtest stack (zebrad, zainod, frost-zcash-demo built under `spike/`, which is not committed); see `spike-scripts/gate2-setup.sh` then `node scripts/lifecycle.mjs A`. Expected: A ends `closed_repaid` with the borrower +99990000 zat, B ends `closed_defaulted` (lender +93328625, borrower +6641375), C ends `closed_aborted` with the borrower +99990000, D (deposit after the funding window) is refused by the rules, then refunded to the borrower +99990000 (`closed_aborted`). Those are the numbers from the 2026-10-25 runs on a freshly built chain (lifecycle B stalled once on a local tool, then passed on rerun).

## Project layout

```
trove/
├── src/       loan rules, BigInt money maths, signed keeper price, dollar payment check
├── scripts/   lifecycle.mjs (regtest runs A, B, C, D), backtest.mjs, check-payment.mjs (Solana devnet)
├── site/      the app: Borrow, Loans, Lend, Limits (static, no build step)
├── test/      unit and random-sequence stress tests; fixtures/ holds the real devnet USDC payment
├── docs/      MAINNET.md (what must be true before real funds), what a chain viewer sees
├── spike-scripts/  regtest and testnet setup, signer build, forged-signature check
└── brand/     logo exports
```
