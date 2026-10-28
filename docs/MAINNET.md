# Mainnet

Trove has run on regtest and, once, on public Zcash testnet (26 Oct 2026). It has not run on mainnet and should not yet. This page says why, what was checked, and what has to be true before a first real-money test.

## Blockers

| Blocker | Why it matters | Status |
|---|---|---|
| Vault key call is unmerged (zcash/orchard#475, draft) | The vault key comes from an experimental Orchard call its reviewer says will be removed and is incompatible with ZIP 2005 recoverability. Funds in a vault could become unrecoverable. | open, outside our control |
| NU7 on mainnet activates at block 3,543,405 (about 5 Nov 2026) | Payouts use a signer patched for the NU7 branch ID. Tested on testnet only, with the testnet ID 0x77190ad9. A mainnet payout is untested. | wait for activation, then re-test |
| No outside audit | The FROST crates and this code are unaudited. | not done |
| Funds cap is opt-in | A bug could lose more than a test amount. The loan rules refuse a lock over the cap (`test/mainnet-guards.test.mjs`), and `scripts/lifecycle.mjs` checks `TROVE_MAX_COLLATERAL_ZAT` / `TROVE_MAX_PRINCIPAL` before any funds move. With neither set there is no cap. A junk value stops the run. | wired and tested (refusals run 28 Oct 2026); a mainnet run must set both |
| Emergency stop is a setting, not a switch on a running service | `TROVE_PAUSED=1` makes `scripts/lifecycle.mjs` refuse a new lock before any funds move; loans already locked can still finish. There is no running service to pause yet. | wired and tested (refusal run 28 Oct 2026) |
| Keeper is one party | A single keeper signs prices and co-signs defaults. | by design, stated in the README |

## Checked so far

| What | How | Result |
|---|---|---|
| Loan rules, pause, cap and payment checks | `npm test` | 127 pass, 0 fail |
| Malformed payment data | 27 bad inputs plus 2000 random balance strings | refused, never a crash or an overpay |
| Lock and three payouts, 2-of-3 | public testnet, 26 Oct 2026 | ran (4 txids in the README) |
| One signer alone cannot sign | testnet run | no signature produced |
| Overdraw refused | testnet stress pass: ask 0.5 from a 0.25 vault | refused (by the wallet's balance check, not by Trove's rules) |
| Back-test | 336 thirty-day loans | 11% liquidated, 0 bad debt (daily closes only) |

## Not checked

- Any mainnet transaction.
- A payout under NU7 with the mainnet branch ID.
- The keeper against live prices on a deployed machine.
- Explorer confirmation of the testnet txids.

## Conditions for a first real-money test (all required)

1. orchard#475 merged, or Trove moved off the experimental call.
2. NU7 active on mainnet and the signer rebuilt for the mainnet branch ID.
3. The funds cap set on every run (`TROVE_MAX_COLLATERAL_ZAT`, `TROVE_MAX_PRINCIPAL`): one loan, a few dollars of ZEC. The cap exists in code; a run without it is not allowed.
4. The emergency stop (`TROVE_PAUSED=1`) checked on the machine that runs the loans before the first lock.
5. A written decision on the amount.

Until then Trove is a test build with no real funds.
