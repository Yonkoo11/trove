# References

## uniswap.org (DeFi)
Signature device: one real swap card, centred under a one-line headline, is the whole first screen; the nav (Trade, Explore, Pool, Portfolio) is the only other structure.
Measured 1440 (design/measure/ref-1/summary.json): 4 sizes carry 80% of text (14-24px); 7 text colours; radii top 3 carry 66%; spacing 98% on 2px; most-used transition 200ms; primary CTA in first viewport: yes; smallest body text 12px.
What it does with the core object: the quote form is the page. Sell and Buy fields, then one big button, with the price detail shown before the user confirms.
Take: the core object as one real form card in the first viewport, numbers computing as the user types, preview before confirm.
Leave: token icons, the pink accent, a swap's two-field shape. A loan needs a ticket with more rows (cost, liquidation, who signs).

## wise.com (Consumer fintech)
Signature device: a working calculator inside the first screen shows exactly what is sent, the fee and the rate, as live numbers.
Measured 1440 (design/measure/ref-2/summary.json): 3 sizes carry 80% of text (16-20px); 2 text colours; radii top 3 carry 88%; spacing 77% on 2px; most-used transition 300ms; primary CTA in first viewport: yes; no horizontal scroll at 390.
What it does with the core object: the user types an amount and the page itself prints the fee, the exchange rate and what arrives, before any sign-in.
Take: print the cost lines under the input as plain sentences with numbers ("you repay", "liquidated if ZEC falls to") so the user can trust the quote before acting.
Leave: the lime ground, weight-900 all-caps display type and pill buttons. The ground and type are Wise's brand, not ours.

## kamino.finance (extra "Uses today", not a gate reference)
Measured 1440 (design/measure/ref-3/summary.json): 2 sizes carry 80% (12, 14px); 3 text colours; radii top 3 carry 84%; spacing 73% on 2px; no horizontal scroll at 390.
What the eyes saw: dark app, top nav (Swap, Earn, Borrow, Multiply, Liquidity, Portfolio), a dense table with APY, deposits, profile and a View or Deposit button on every row.
Take: a table of loans with state, amounts and one action per row, for the Loans page.
Leave: dark navy ground, featured vault cards, APY marketing.

Gap to our build: the build in site/index.html is a single judge-facing explainer; it is replaced, not compared. The new build must land at 5 sizes or fewer, 16px reading text at 1280x720, a working form on screen one, and no sideways scroll at 390.
