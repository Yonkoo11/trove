# Trove design system

Extracted from `site/app.css` as built. Every value below is in that file.

## Identity
A loan desk, not a brochure: light grey ground, white panels, near-black ink, one amber accent (#F4B728) used only on the primary button. The signature device is the loan stub, a small white slip with a dashed ink top edge and dotted leaders between label and value, printed with the fields the chain shows.

Mark: a portrait loan ticket in amber on an ink rounded square, two punch notches and a dashed perforation, the same ticket as the Borrow screen. Source in brand/final/logo.svg. Amber on the ground fails contrast, so the mark always sits on the ink tile.

## Tokens
- Colours: ground #F4F5F7, paper #FFFFFF, ink #12151A, muted #5E6670, accent #F4B728, rule #D9DCE1, red #B42318, green #067647.
- Type: Geist variable (woff2), 16px/24px body, 24px/32px headings at weight 500, 14px/20px labels, 12px/16px stub text, tabular numerals everywhere.
- Spacing: 4px step (4, 8, 12, 16, 24, 48); page width 1120px, 16px gutter.
- Radius by role: control 6px, panel 12px, stub 2px.
- Shadow: `0 1px 2px rgba(18,21,26,0.08)`.

## Craft
- Radius scale: 2px, 6px, 12px (CF-1).
- Surface steps: ground, then white panel (CF-2).
- Shadow philosophy: soft-elevation, `0 1px 2px rgba(18,21,26,0.08)` plus an inset 1px white highlight on panels.
- Hover: buttons `filter: brightness(0.95)`, nav links grey fill, inputs darker border; all inside `@media (hover: hover)`.
- Focus-visible: `2px solid var(--ink)`, offset 2px.

## Primitives
Button `.btn` (accent, full width) and `.btn.quiet` (white, 1px rule); input `.input` with `.unit`; panel `.panel`; stub `.stub`; badge `.tag` with `.good` and `.bad`; table collapses to labelled rows under 700px.

## Motion
Curve `cubic-bezier(0.22, 1, 0.36, 1)`; 200ms for hover and colour, 400ms for the one entrance (`rise`: 4px up fade-in on the ticket). No loops. `prefers-reduced-motion` turns animation off and transitions to 1ms.
