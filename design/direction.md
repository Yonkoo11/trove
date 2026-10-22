# Direction

Audience row: DeFi
Reference 1: uniswap.org
Reference 2: chit.tools

## Direction A: Lock receipt

Screen one is one narrow receipt set on a pale ground: the real field list of the regtest lock transaction (txid, height 117, version 6, transparent in and out 0/0, 2 Ironwood actions, fee 10000 zat, and the public fields of each action) printed as dotted-leader lines in monospace. Beside it sits a plain column listing what the borrower, lender and keeper each can do with the vault. The signature device is the receipt, from the noun in the product (a lock receipt); the anchor file site/gate1-viewer-fields.json is rendered as the receipt itself, white paper on a grey-green ground, 1 degree tilt, one soft shadow, ink taken from the file's own hex-string text, no image.
Tokens: type 14/16/20/32/56px; body weight 400, headline weight 450; families system-ui sans and ui-monospace; ground #F3F4F1, paper #FFFFFF, ink #15171A, muted #5B6168, accent #0B6B52; radius 2px receipt, 6px buttons, 12px panels; spacing step 4px; curve cubic-bezier(0.22,1,0.36,1); interaction 200ms; entrance 600ms
Reference: uniswap.org; the core object as one real centred card in the first viewport, no hero image.
Fits: AUDIENCE "proof on screen is the real field list of a real regtest transaction" and JUDGE sponsor screen "the receipt panel on screen one".

## Direction B: Three endings ledger

Screen one is a horizontal timeline of one loan with the three real endings (repaid, defaulted, aborted) as three rows, each with who signed and the amounts paid in zat, and the lock transaction fields pushed below the fold as a smaller table. The signature device is the ledger row, from the noun loan; the anchor asset appears as a collapsed block under the timeline. Dark ground #101214 with a single mint accent #5CE1B0, which reads fast on video.
Tokens: type 14/16/20/28/48px; body weight 400, headline weight 400; families system-ui sans and ui-monospace; ground #101214, ink #ECEFF1, muted #8A9399, accent #5CE1B0; radius 4px rows, 8px buttons; spacing step 4px; curve cubic-bezier(0.22,1,0.36,1); interaction 150ms; entrance 400ms
Reference: chit.tools; the boundary link sitting beside the main action.
Fits: AUDIENCE "the three loan endings with signers and paid amounts" and JUDGE "three real loan endings paid out correctly".

## Direction C: Redacted agreement

Screen one is a loan agreement document with bars blacked out over the borrower, amount and collateral fields, to dramatise what the chain does not show. The signature device is the redaction bar, from the noun "shielded"; the anchor asset is shown as the unredacted list underneath, revealed on click. Near-black ground with a white document and a red accent for the bars.
Tokens: type 14/16/24/40/64px; body weight 400, headline weight 500; families system-ui sans and ui-monospace; ground #0E0E10, paper #F7F7F5, ink #111111, accent #D6362B; radius 2px; spacing step 4px; curve cubic-bezier(0.22,1,0.36,1); interaction 200ms; entrance 500ms
Reference: chit.tools; one device (a visual split between hidden and shown) reused across sections.
Fits: AUDIENCE "what the chain shows vs what each party sees" and JUDGE "Does it actually preserve privacy".

## Pick

Chosen: A
Why: The Density row is DeFi, so the reader checks what happens to money before trusting it, and AUDIENCE says the proof is "the real field list of a real regtest transaction". The criterion asks "Does it actually preserve privacy, or does it only look like it does?", so the page has to show data a judge can check against the chain, not a picture of secrecy. A puts that data on screen one in real DOM text on a light ground that survives a 1280x720 video. It also takes uniswap.org's one real card and gives the limits their own section and a link beside the main button.
Lost: B lost because the loan endings are not the privacy proof and push the lock fields below the fold, against the JUDGE sponsor screen line. C lost because blacked-out bars are exactly what only looks like privacy, with no data behind them, against the Privacy criterion and the "real fields" line.

## Contract

Signature device: the receipt, dotted-leader lines of real values in monospace on white paper, used for the lock transaction, each loan ending, the still-public list, the back-test and the verify commands, so every section is one receipt.
Motion: one curve cubic-bezier(0.22,1,0.36,1); interaction 200ms; the one entrance is the lock receipt printing in line by line over 600ms; loops: none.
Ground: light, because the reader is checking money and the page reads on a laptop and in a 720p video, and a receipt is paper.
Limits: a section named "What this does not hide or stop" in the same type size as the features, placed before the final call to action, plus a link to it beside the primary button on screen one.
Layout: first screen has the lock receipt on the left and the party columns (borrower, lender, keeper, public viewer) on the right with the primary button "Verify it yourself" and the link "Read the limits" under the headline; then the three loan endings, what stays public, the back-test, the limits, the verify block, and the footer.

## Headline

Option 1: ZEC collateral goes into a shielded vault, and a public viewer of the lock transaction sees the fee and encrypted fields.
Option 2: Fixed-term dollar loans against ZEC, with the collateral held in a shielded vault that needs two of three signers to open.
Option 3: These are the real fields a public viewer reads from a Shielded Lend lock transaction, and what each party can do instead.
Picked: 1
Picked by: model
Headline: picked by model, needs owner
Brief hash: 35a4b68c5518eb48
