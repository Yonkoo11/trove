# Direction

Audience row: DeFi
Reference 1: uniswap.org
Reference 2: wise.com

## Direction A: Loan ticket

The first screen is a working borrow form: the user types how much ZEC to lock and the page prints the dollars they can borrow, the loan-to-value, the ZEC price at which the vault is liquidated, the interest and the total to repay, all computed in the browser from the same rules the tests run. A tear-off stub at the bottom of the ticket lists what a public viewer of the lock transaction sees (fee 10,000 zat, 0 transparent inputs and outputs, 2 Ironwood actions), and the same stub repeats on every loan row and the loan page. The anchor is the real field list from the Gate 1 run, printed as that stub in the receipt treatment, so the proof sits inside the product instead of beside it.
Tokens: sizes 12, 14, 16, 24, 40px; headline weight 500 at 24px, big result number 40px weight 500; one family (Geist, variable); ground #F4F5F7, paper #FFFFFF, ink #12151A, muted #5E6670; accent #F4B728 on the primary button with ink text; radius 6px controls, 12px panels, 2px stub; spacing 4px step; curve cubic-bezier(0.22,1,0.36,1); interaction 200ms; entrance 400ms once; loops none.
Reference: uniswap.org, the one real form card as the first screen with the preview before the button.
Fits: AUDIENCE "the product screen is theirs" and "live loan ticket numbers (cost, liquidation)"; JUDGE "Sponsor screen" receipt of the real lock transaction fields.

## Direction B: Loan desk

The first screen is a dense table of loans in the manner of Kamino and Morpho: every row is a loan with its state, collateral, borrowed amount, LTV, the signers who can end it and a View button, with filters above. A borrow action opens a side drawer with the form. It reads like a market a lender browses, and the anchor stub shows only inside the drawer and the row detail. It suits a lender comparing many offers, which this product does not have: there are three regtest runs and no market, so the table would be padded to look like activity.
Tokens: sizes 12, 13, 14, 16, 20px; weight 500; one family; dark ground #0F1729, ink #E8ECF4, muted #8C97AD; accent #4C8DFF; radius 6px and 8px; spacing 4px step; curve cubic-bezier(0.22,1,0.36,1); interaction 160ms; entrance none; loops none.
Reference: wise.com is not used here; the move is from the Kamino measurement, a per-row action in a dense table.
Fits: AUDIENCE "Data on screen" per loan state; fails JUDGE "First 60 seconds" because the sponsor proof is hidden behind a click.

## Direction C: Quote first

The first screen is a large calculator on a coloured ground in the manner of Wise: one big amount field, a plain-sentence result ("You get $X. You repay $Y on 21 Nov. We liquidate if ZEC falls to $Z.") and one button, with the stub folded into a "what the chain shows" disclosure under the sentence. It is the clearest for a first-time borrower and the lowest density, but a lender and a judge need the signers and the privacy fields on screen at once, and the disclosure hides them. The anchor sits in the disclosure only.
Tokens: sizes 16, 20, 32, 56px; weight 500 headline; one family; ground #EAF2E3, ink #0E1F0F, muted #4C5F4D; accent #1F7A3D; radius 999px buttons, 16px panels; spacing 4px step; curve cubic-bezier(0.22,1,0.36,1); interaction 200ms; entrance 400ms; loops none.
Reference: wise.com, the live cost lines printed as sentences under the input.
Fits: AUDIENCE "Must trust before acting" for the borrower; weak on JUDGE "Sponsor screen" because the receipt is collapsed.

## Pick

Chosen: A
Why: The Density row is DeFi, and the user in AUDIENCE is a ZEC holder who "quotes and compares a loan" before signing, so screen one must be the working form with live numbers, as Uniswap does. The JUDGE criterion "Does it actually preserve privacy, or does it only look like it does?" is answered by the stub next to the numbers, visible on the first screen at 1280x720, not behind a click. A takes Wise's plain cost lines into the ticket as well, so the borrower trust need is met without losing the proof.
Lost: B lost because AUDIENCE "Data on screen" is a single loan ticket, not a market, and a table of three regtest runs reads as fake activity and hides the sponsor proof behind a click. C lost because the JUDGE "Sponsor screen" requires the receipt of the real lock fields on screen one and C collapses it into a disclosure, and its green ground and display type are Wise's brand.

## Contract

Signature device: the loan ticket with a tear-off stub printing what a public viewer of the lock transaction sees; the Loans rows, the loan page and the lender view each carry the same stub, and the Limits page is the one screen that does not, because it lists what the chain does not hide.
Motion: one curve cubic-bezier(0.22,1,0.36,1); interactions 200ms; one entrance of 400ms on the ticket, played once; no loops. Numbers update without animation because users retype them often.
Ground: light, because the user compares quotes in daylight like a Uniswap or Wise user and a light ground keeps the 12px stub legible at 1280x720 on video; a single ground avoids doubling the surface.
Limits: a Limits page linked in the top nav and a one-line "regtest, no real funds" banner on every screen, set in the same type size as the ticket rows.
Layout: top nav (name, Borrow, Loans, Lend, Limits) then, on Borrow, the loan ticket form on the left and the "what the chain shows" stub panel on the right; below, the plain-language cost sentences; Loans is a table with a stub line per row; footer with the verify commands.

## Headline

Option 1: Borrow dollars against your ZEC, with the collateral held in a shielded vault.
Option 2: A two-party ZEC loan where the vault shows a public viewer only the fee.
Option 3: Lock ZEC, get dollars, repay later, and see exactly what the chain shows.
Picked: 1
Picked by: model
Headline: picked by model, needs owner
Brief hash: 3198a1ab9505567d
