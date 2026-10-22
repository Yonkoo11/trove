# Build brief: Trove, the borrow app

Every number here is a decision. Where a value is given, use it exactly. Where copy is given, use it verbatim. Read the whole brief before writing a line.

## Direction

Chosen: A, Loan ticket. Reference move: uniswap.org's one real form card as the first screen with the preview before the button, plus wise.com's cost lines as plain sentences under the input.

Layout: top nav (name, Borrow, Loans, Lend, Limits) then, on Borrow, the loan ticket form on the left and the "what the chain shows" stub panel on the right; below, the plain-language cost sentences; Loans is a table with a stub line per row; footer with the verify commands.

Headline (verbatim, h1 on Borrow): Borrow dollars against your ZEC, with the collateral held in a shielded vault.

Product name is one constant, NAME in site/app.js, value "Trove". The owner may change it; no other file hard-codes it.

## Tokens

- Ground #F4F5F7, paper #FFFFFF, ink #12151A, muted #5E6670, accent #F4B728 (primary button only, ink text on it), rule #D9DCE1. Text colours in use: ink, muted, red #B42318 and green #067647 for loan state only, always with a word beside them.
- Type sizes 12, 14, 16, 24, 40px. Body and cost sentences 16px/24px weight 400. Labels, nav, table text 14px/20px. Inputs 16px. Headline h1 24px/32px weight 500. The result number 40px/48px weight 500. Stub text 12px/16px. Nothing else.
- One family: Geist variable, WOFF2 inside site/fonts/, `font-display: swap`, system-ui fallback. tabular-nums on every number.
- Radius 6px controls, 12px panels, 2px stub. Spacing step 4px (halves of 2px allowed), gaps 8, 16, 24, 48px.
- Curve cubic-bezier(0.22,1,0.36,1). Interaction 200ms. Entrance 400ms once on the ticket (opacity 0 to 1, 4px rise). Loops: none. Numbers update without animation.
- One shadow recipe: 0 1px 2px rgba(18,21,26,0.08) on panels. Stub: white paper, dotted leader between key and value, torn top edge made with a 2px dashed rule.
- No `transition: all`. Reduced motion: blanket rule, animation none, transitions 1ms, scroll-behavior auto.

## Screens

Hash routes, no framework: #/borrow (default), #/loans, #/loan/:id, #/lend, #/limits. Each screen has empty, loading, populated and error states as in design/surfaces.md. A banner on every screen: "Regtest, no real funds."

- Borrow: left, ticket form (ZEC amount input, term select 30 days fixed, button "Request this loan"). Live lines from src/money.mjs and src/defaults.mjs: you can borrow up to, loan to value, liquidation price, interest at 10% APR, total to repay. Right, stub panel "What the chain shows" with fee 10,000 zat, transparent in 0, transparent out 0, Ironwood actions 2, and the list of public fields from site/gate1-viewer-fields.json. Price: try a live read, else the last stored close, labelled with its date.
- Loans: table of the three regtest runs with state, signers, paid amounts and a stub line each.
- Loan: state timeline, who signs each ending, what a public viewer sees and what stays public. Unknown id shows "No such loan" and a link back.
- Lend: what the lender funds, earns, and cannot sign alone.
- Limits: the honesty table from README, the back-test (336 loans, 11% liquidated, 0 bad debt), the verify commands. No stub on this screen.

## Copy

Amounts verbatim: repay borrower +99,990,000 zat; default lender +93,328,625 and borrower +6,641,375 zat; abort borrower +99,990,000 zat. Limits verbatim from README "What this does not hide or stop". Never the word anonymous. Say what is hidden (amounts and addresses on the lock) and what is not (the stablecoin leg, the keeper's price, any 2 of 3 keys can spend).

## Deviations

- Plain HTML, CSS and ES modules instead of the skill default Svelte + Vite: src/money.mjs and src/defaults.mjs run unchanged in the browser through site/lib/ copies, a test checks the copies are byte-identical to src/, and the published folder stays small with no build step.
- Geist is served from site/fonts/, not a CDN, so there is no third-party request.
- One third-party request: a CoinGecko price read from the browser, best effort, ignored if outside 0.1x to 10x the stored close; the stored close is the labelled fallback.

## Output contract

Files: site/index.html, site/app.css, site/app.js, site/lib/*.mjs, site/fonts/*.woff2, site/gate1-viewer-fields.json. No framework, no build step, no analytics, no screenshots, no third-party URL except the one CoinGecko price read named in Deviations. Do not add a section, testimonial, logo strip or metric that is not in the repo.

## Setup

- Geist variable WOFF2 from the Geist font package on npm (5 minutes), copied into site/fonts/. No keys, accounts or env vars.

## Failure modes

- The word anonymous anywhere.
- A privacy claim without the field list next to it.
- Limits hidden below small print or missing from the nav.
- A raw hex outside :root.
- Sideways scroll at 390px.
- Content hidden if script fails: the entrance only animates, content is visible by default.

## Acceptance

- [ ] Layout line and headline above equal direction.md.
- [ ] bash ~/System/scripts/brief-check.sh design/build-brief.md prints decides.
- [ ] bash ~/.claude/skills/design/scripts/design-check.sh . http://localhost:5173 exits 0.
- [ ] Primary button fully inside the first viewport at 1440x900, 390x844 and 1280x720.
- [ ] Main reading text 16px; inputs 16px; smallest text 12px.
- [ ] node --test test/ passes, including the site/lib copies matching src/.
- [ ] grep -ci anonymous site/index.html site/app.js prints 0.
- [ ] Not one word of copy, one colour or one URL differs from this brief.
