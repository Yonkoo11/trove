# Mainnet

Trove has run on regtest and, once, on public Zcash testnet (26 Oct 2026). It has not run on mainnet and should not yet. This page says why, what was checked, and what has to be true before a first real-money test.

## Blockers

| Blocker | Why it matters | Status |
|---|---|---|
| Vault key call is unmerged (zcash/orchard#475, draft) | The vault key comes from an experimental Orchard call its reviewer says will be removed and is incompatible with ZIP 2005 recoverability. Funds in a vault could become unrecoverable. | open, outside our control |
| NU7 on mainnet activates at block 3,543,405 (about 5 Nov 2026) | Payouts use a signer patched for the NU7 branch ID. Tested on testnet only, with the testnet ID 0x77190ad9. A mainnet payout is untested. | wait for activation, then re-test |
| No outside audit | The FROST crates and this code are unaudited. | not done |
| No funds cap in code | A bug could lose more than a test amount. | not built |
| No emergency stop | No way to halt new locks if something is wrong. | not built |
| Keeper is one party | A single keeper signs prices and co-signs defaults. | by design, stated in the README |

## Checked so far

| What | How | Result |
|---|---|---|
| Loan rules | `npm test` | 55 pass, 0 fail |
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
3. A hard cap in code: one loan, a few dollars of ZEC.
4. An emergency stop that refuses new locks.
5. A written decision on the amount.

Until then Trove is a test build with no real funds.
