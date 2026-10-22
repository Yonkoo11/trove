# Audience

Who exactly: A ZEC holder who wants a dollar loan without selling or exposing the coins, and the private lender or desk on the other side of that one loan; the page is read first by a Zecathon judge deciding if the privacy claim is true.
Uses today 1: Kamino ZEC-collateral borrowing on Solana, https://kamino.finance
Uses today 2: Selling ZEC on an exchange or a swap, https://app.uniswap.org
Must trust before acting: That the chain really shows nothing about the collateral, and that the page also says what it does not hide; proof on screen is the real field list of a real regtest transaction next to the loan outcomes.
Data on screen: What the chain shows for the lock transaction (fee 10000 zat, transparent in/out 0/0, 2 Ironwood actions, public fields); the three loan endings with signers and paid amounts (repay 99,990,000 zat borrower; default lender 93,328,625 and borrower 6,641,375; abort 99,990,000 borrower); what stays public (stablecoin leg, keeper reading); the back-test (11% liquidated, 0 bad debt).
Density row: DeFi
Density reason: The reader is checking what will happen to money before trusting it, so the page puts the real transaction fields and payouts on screen one, as uniswap.org puts the swap form there, and shows risks next to them.
Device: laptop, because a Zecathon judge opens the live link or watches a 1280x720 video; the phone is checked but secondary.
Brand origin: none, there is no existing mark or palette for Shielded Lend.
Anchor asset: site/gate1-viewer-fields.json
Anchor rung: 1 found in the product, the real field list of the regtest lock transaction (docs/gate1-viewer-fields.json), printed as a receipt
Anchor provenance: produced by running a lender+keeper signed spend on the local regtest chain on 2026-10-20 and reading the transaction as a public viewer; file copied from docs/gate1-viewer-fields.json; no image, the receipt is set in type.
