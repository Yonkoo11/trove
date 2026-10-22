# Build brief: Shielded Lend, one page

Every number here is a decision. Where a value is given, use it exactly. Where copy is given, use it verbatim. Read the whole brief before writing a line.

## Direction

Chosen: A, Lock receipt. Reference move: uniswap.org's one real card in the first viewport, plus a limits link beside the main button.

Layout: first screen has the lock receipt on the left and the party columns (borrower, lender, keeper, public viewer) on the right with the primary button "Verify it yourself" and the link "Read the limits" under the headline; then the three loan endings, what stays public, the back-test, the limits, the verify block, and the footer.

Headline (verbatim, h1): ZEC collateral goes into a shielded vault, and a public viewer of the lock transaction sees the fee and encrypted fields.

## Tokens

- Ground #F3F4F1, paper #FFFFFF, ink #15171A, muted #5B6168, accent #0B6B52, rule #D9DCD6. Text colours in use: ink, muted, accent, paper (on the button only).
- Type sizes 14, 16, 20, 32, 56px. Body weight 400 at 16px/24px. Headline and h2 weight 450 at 32px/40px. h3 weight 450 at 20px/24px. Receipt text mono 14px/24px. The 56px/56px figure is the fee only, 32px/40px under 900px width.
- Families: system-ui sans and ui-monospace. No web fonts.
- Radius 2px receipt, 6px buttons, 12px panels. Spacing step 4px, gaps 16, 24, 48px, section padding 64px.
- Curve cubic-bezier(0.22,1,0.36,1). Interaction 200ms. Entrance 600ms. Loops: none.
- Receipt: white paper, rotate(-1deg) on the first-screen receipt only, one shadow 0 8px 24px rgba(21,23,26,0.10), dotted leader between key and value, tabular-nums on every value.

## Entrance table

Head 0ms, rows 60, 120, 180, 240, 300, 360ms, total 420ms, each 600ms, opacity 0 to 1 and 4px rise. Content is visible without script. Reduced motion: no animation, transitions 1ms.

## Copy

Verbatim from site/index.html: the three party cards, the receipt fields, the three endings with amounts 99,990,000 / 93,328,625 and 6,641,375 / 99,990,000 zat, the public list, the back-test (336 loans, 11%, 0 bad debt), the seven limits, and the verify block. Buttons: "Verify it yourself" (primary), "Read the limits" (link beside it).

## Deviations

- Motion table is CSS only, no script, so a background tab never shows a blank page.
- No dark theme: one light ground, see direction Ground.

## Output contract

Files: site/index.html (inline CSS, no script), site/gate1-viewer-fields.json. No frameworks, no build step, no images, no fonts, no analytics, no third-party URLs. Do not add a section, a testimonial, a logo strip or a metric that is not in the repo.

## Failure modes

- The word anonymous appearing anywhere. Say what is hidden and what is not.
- A privacy claim without the field list next to it.
- Limits moved below the verify block or shrunk to small print.
- A raw hex outside :root.
- Sideways scroll at 390px.

## Acceptance

- Layout line and headline above equal direction.md.
- bash ~/System/scripts/brief-check.sh design/build-brief.md prints decides.
- bash ~/.claude/skills/design/scripts/design-check.sh . http://localhost:5173 exits 0.
- Primary button fully inside the first viewport at 1440x900, 390x844 and 1280x720.
- Main reading text at least 16px at 1280x720.
- grep -ci anonymous site/index.html prints 0.
- Not one word of copy, one colour or one URL differs from this brief.
