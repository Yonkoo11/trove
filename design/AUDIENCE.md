# Audience

Who exactly: A ZEC holder who wants dollars against their coins without selling or exposing them, and the lender who funds that one loan; the product screen is theirs, and a Zecathon judge is the second reader of the same screen.
Uses today 1: Kamino ZEC-collateral borrowing on Solana, https://kamino.finance
Uses today 2: Uniswap, selling ZEC and holding dollars, https://app.uniswap.org
Must trust before acting: What the loan costs and when they get liquidated (numbers update as they type), who can move the vault, and what the chain shows; proof is the live loan ticket next to the real lock-transaction fields and a "not hidden" list.
Data on screen: Collateral in ZEC, max dollars borrowable, LTV, liquidation price, interest and total to repay, term; per loan its state, who signs each ending, and what a public viewer sees (fee 10000 zat, 0 transparent in/out, 2 Ironwood actions); what stays public (stablecoin leg, keeper price).
Density row: DeFi
Density reason: The user is quoting and comparing a loan (numbers, a table of loans, a form) like a Morpho or Kamino user, so the first screen is the working borrow form with live numbers, as Uniswap puts the swap form there.
Device: laptop, because a Zecathon judge opens the live link or watches a 1280x720 video; the phone is checked but secondary.
Artifact type: product app, the borrower prices and requests a loan on the first screen.
Brand origin: none, there is no existing mark or palette for Shielded Lend.
Anchor asset: site/gate1-viewer-fields.json
Anchor rung: 1 found in the product, the real field list of the regtest lock transaction (docs/gate1-viewer-fields.json), printed as a receipt
Anchor provenance: produced by running a lender+keeper signed spend on the local regtest chain on 2026-10-20 and reading the transaction as a public viewer; file copied from docs/gate1-viewer-fields.json; no image, the receipt is set in type.
