# References

## uniswap.org (DeFi)
Signature device: the working swap form is the hero, one card centred under a one-line headline, ringed by blurred token icons.
Measured 1440 (design/measure/ref-1/summary.json): 4 sizes carry 80% of text (14-24px); 7 text colours; radii top 3 carry 63%; spacing 98% on 2px; most-used transition 200ms; primary CTA in first viewport: yes. Judge frame 1280x720: main reading text 24px, smallest body text 12px, smallest number 14px. At 390 it scrolls sideways (hScroll true), a miss we avoid.
What it does with the core object: the thing the user came for (a quote and a button) is the first and only card on screen one, in real DOM text.
Take: the core object as one real, centred card in the first viewport, no hero image.
Leave: floating token icons and pink accent; our proof is a transaction, not a token list.

## chit.tools (DeFi)
Signature device: a jagged tear splits the two-part headline and reappears on card edges, a product noun used at three scales.
Measured 1440 (design/measure/ref-2/summary.json): 12 sizes carry 80% of text (11-49px), over budget; 10 text colours; radii top 3 carry 98%; spacing 100% on 2px; most-used transition 150ms; primary CTA in first viewport: yes. Judge frame: main reading text 15px, smallest body text 11px, smallest number 11.5px, under the 16px bar.
What it does with the core object: states its boundary in the hero ("Private, not anonymous" as a caption), then keeps a "Read the boundary" button next to the main CTA.
Take: a limits link beside the primary action on screen one.
Leave: near-black ground with a neon orange, caps captions, 11px text. Both are on the RULEBOOK section 8 list and fail the judge-frame size.

Gap to our build: no build exists yet, so nothing to compare. Phase 3 must land at 4-5 sizes, 16px reading at 1280x720, and no sideways scroll at 390.
