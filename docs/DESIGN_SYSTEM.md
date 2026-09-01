# Design System

Visual reference: the attached "Confidency OS — Pricing Engine" dashboard screenshot. **Reference for visual language only** — layout density, typography hierarchy, color restraint, table treatment. None of its commerce content (pricing rules, product tables) is relevant; only its *shape* is.

## 1. Design intent

> Excel efficiency + modern SaaS usability. This is an internal commercial reporting tool, not a marketing website.

Concretely: clean, minimalist, information-dense, desktop-first, light theme, subtle violet accent, white content surfaces on a very light neutral app background, thin gray borders, little-to-no shadow, compact tables, consistent spacing, clear typographic hierarchy.

Explicitly avoid: gradients, 3D, decorative illustrations, floating graphics, animated counters, oversized cards, large empty areas, excessive shadow, glassmorphism, marketing-site styling.

## 2. Color tokens

Sampled from the reference screenshot and mapped to the nearest standard Tailwind values (recommended: use Tailwind's built-in `violet` scale directly rather than custom hex values, for maintainability with shadcn/ui's theming conventions).

| Token | Value | Reference sample | Usage |
|---|---|---|---|
| `--background` | `#FAFAFA` (near-white, neutral-50) | sidebar / app background sampled at #FAFAFA | app shell background |
| `--surface` | `#FFFFFF` | content/card background sampled at #FFFFFF | cards, table surfaces, panels |
| `--border` | `neutral-200` (~`#E5E5E5`) | thin lines separating table rows/header | all dividers, card outlines — 1px, never a shadow substitute |
| `--accent` | `violet-600` (`#7C3AED`) | button/logo purple sampled ~`#7B5DF9`–`#9079F5` | primary buttons, active nav item, active toggle, links |
| `--accent-subtle` | `violet-100` (`#EDE9FE`) | light badge backgrounds (e.g. "Storewide" pill) | filter chips, subtle badges, selected-row tint |
| `--text-primary` | `neutral-900` (~`#0D0D0D`) | headings sampled ~`#0D0D0D` | headings, primary data values |
| `--text-secondary` | `neutral-500` | labels, table headers, secondary metadata | |
| `--positive` | `emerald-700` (~`#197A52` sampled) | "+2.1%", upward trend indicators | occupancy/revenue increases |
| `--negative` | `red-600` | downward trend, error states | vs.-suggested decreases, validation errors |
| `--warning` | `amber-500` | reconciliation "needs review" badges | open exceptions |

Do not introduce additional accent hues beyond violet + the semantic positive/negative/warning set above — the reference deliberately uses color sparingly (most of the UI is neutral gray/white, with violet reserved for primary actions and active state, and green/red reserved for directional deltas).

## 3. Layout

- **Persistent left sidebar** (as in the reference): grouped nav sections with small-caps or uppercase section labels (`COMMAND`, `COMMERCE`, `FINANCE`, `PLATFORM` in the reference → here: `OVERVIEW`/`COMMERCIAL`/`RECONCILIATION`/`OPERATIONS`/`FINANCE`/`DATA`/`CONFIGURATION`, matching `PRODUCT_SPEC.md` §5's navigation map `[CORRECTED — the section grouping is and always has been implemented; an earlier draft of this line incorrectly described it as a flat list]`). Active item gets a filled dark/violet-tinted background with an icon, matching the reference's "Pricing Engine" active state. `[NEW]` Collapsible — see §3a.
- **Top bar per page**: breadcrumb-style small label above an `<h1>` page title (reference: small tag "Pricing Engine" above the large "Pricing Engine" heading) plus right-aligned page-level actions (e.g. "Sync", "Report", primary CTA button in violet).
- **Content is a grid of white cards on the light neutral background**, thin border, no or near-zero shadow, generous but not excessive internal padding, small border-radius (6–8px, not the heavily rounded "SaaS marketing" look).
- **Desktop-first**: no responsive/mobile optimization required for v1 (per brief — desktop-first, information-dense); do not spend effort on a mobile layout.

## 3a. `[NEW]` Collapsible sidebar

The sidebar has two width states, toggled by one explicit, always-visible control in the sidebar's own header (not tucked into a menu) — an icon button using a panel-style icon (collapse/expand), not a bare chevron alone, so its purpose reads clearly at a glance.

- **Expanded** (default, ~16rem): section labels, page names, and each item's icon are all shown, exactly as in §3.
- **Collapsed** (narrow icon rail, ~4rem): only icons remain, centered; section labels are hidden entirely (no truncated/rotated text) — a slim divider gap between sections is enough grouping cues at this width.
- **Active-page highlight** uses the identical violet-filled treatment in both states — the same element, same class logic, just with its label hidden when collapsed, never a second "collapsed-mode" highlight style to keep in sync.
- **Tooltips on hover, collapsed only**: every icon (including disabled roadmap placeholders, which show their label plus the "Day N"/"Phase 2" note) exposes its full label via the native title-attribute tooltip — no dedicated tooltip component/dependency needed for this, consistent with the precedent set for the All Bookings Guest-cell tooltip.
- **Main content reflow is automatic, not computed**: the sidebar and main content are the only two children of one flex row: the sidebar's width is the only thing that changes, and `flex-1` on the main content already claims whatever width that frees up — no JS/CSS coordination between the two is needed or should be added. The page-content wrapper's own max-width is a generous ceiling (wide enough that collapsing visibly grants more room on real laptop/desktop screens) rather than the sidebar-oblivious fixed cap used before this addition.
- **Preference persistence**: the collapsed/expanded choice is a per-browser `localStorage` preference (not a server-side/account setting) — it survives a refresh, and applying it on load must not itself count as a user-visible "animation" (no slide-open-then-shut flash for a returning collapsed-preferring user).
- **Transitions stay subtle and functional**: a short width transition on manual toggle only (no motion on initial load), no easing flourishes, no icon-rotation or fade choreography — this is a state change, not a moment to showcase motion design, consistent with §1's "explicitly avoid... animated counters" instruction generalized to navigation.

## 4. Tables (this is the most important component — most pages are tables)

- Compact row height — the reference's Pricing Rules and Product Price Table rows are dense (roughly 48–56px), not the airy ~72px rows common in consumer SaaS.
- Column headers: small, uppercase-or-sentence-case, `--text-secondary`, with a single thin bottom border — no shaded header background.
- Numeric columns right-aligned; text columns left-aligned; a secondary line under a primary label is acceptable for compound cells (reference: product name + SKU stacked; here: e.g. Guest Name + Reservation Number, or Villa + Room).
- Status/delta indicators as small inline icon+color+value (reference: green up-arrow + percentage), not full badges, when space is tight; full pill badges (reference: "Storewide", "Collection", "Product" scope tags) reserved for categorical fields like reconciliation type or channel.
- Row-level actions as a trailing "…" overflow menu (reference pattern) rather than multiple visible icon buttons per row, to keep density high.
- Pagination controls at the bottom, minimal (page numbers + prev/next), matching the reference's "Showing 1–08 of 64 · 1 2 3 4 … 8".
- `[EVALUATED, Day 4 — AG Grid rejected]` CLAUDE.md's stack note approved AG Grid for Monthly Performance specifically "if evaluation confirms it's warranted." Evaluated at build time: the matrix tops out around 33 villas × 31 dates (~1,000 cells), well within plain-HTML-table territory, and the "frozen headers/columns" requirement is fully met with the same `position: sticky` technique already used for All Bookings' pinned columns (§9a) — no virtualization or cell-level editing is needed. Given that, AG Grid would be a substantial dependency (bundle size, its own styling system to reconcile with §1–§2's restraint) for no capability this dataset actually needs — built as a shadcn `Table` instead, per CLAUDE.md rule 16 ("do not install unnecessary dependencies"). Revisit only if the villa count or per-cell interaction needs grow well beyond this.

## 5. Cards / stat tiles

- Reference's "Quick Stats" tiles: label + icon top row, large numeric value, small delta/context line below (e.g. "+1 this week"). Use this pattern for Overview KPIs and Summary headline numbers.
- No large empty areas inside a card — if a stat tile has nothing else to show, keep it small rather than padding it out.

## 6. Typography

- One sans-serif system/UI font stack (the reference uses a standard system sans; no custom display font needed for an internal tool).
- Hierarchy: page title (~20–24px, semibold) → card/section title (~14–16px, medium) → table header (~12–13px, medium, secondary color) → table body (~13–14px, regular) → micro/meta text (~11–12px, secondary color).
- Numbers that matter (revenue, ARR) get slightly heavier weight than surrounding text even at the same size, so scanning a dense table for the important column stays easy.

## 7. Components (shadcn/ui mapping)

| Need | Component |
|---|---|
| Nav, page shell | custom layout + shadcn `NavigationMenu`/sidebar primitives |
| Buttons | shadcn `Button` (`default` = violet filled for primary actions, `outline` for secondary like "Sync"/"Report") |
| Toggles (rule active/inactive) | shadcn `Switch`, violet when on |
| Filter chips / scope tags | shadcn `Badge` |
| Tables | shadcn `Table` for all tables, including the Monthly Performance matrix — AG Grid evaluated and rejected for it, see §4 |
| Month selector | shadcn `Select` or a compact prev/next + label control, per the brief's example `< July 2026 | August 2026 | September 2026 >` |
| Upload | shadcn `Card` + native file input + a preview `Table` before commit |
| Drill-down | shadcn `Dialog` or `Sheet` (side panel) triggered from a table cell/row |
| Forms (config pages) | shadcn `Form` + `Input`/`Select` |

## 8. States

- **Empty states**: plain, short text + optional icon, no illustration — e.g. "No reconciliation items open."
- **Loading**: skeleton rows matching the eventual table shape, not a full-page spinner, for pages that are mostly tables.
- **Errors**: inline, specific (e.g. "Row 42: reservation number missing"), never a generic toast alone for import errors — the user needs to act on specifics.

## 9. `[NEW]` Reconciliation & settlement status components

Added for the Day-7 settlement/bank reconciliation pages; everything else in this document is unchanged.

- **Status badges**: one small `Badge` component with a fixed color mapping reused everywhere a reconciliation status appears (Settlement Reconciliation, Bank Reconciliation, the Reconciliation Dashboard, `DATA_MODEL.md` §11's multi-dimensional reservation status): neutral gray for `PENDING`/`AWAITING_*`, `--accent-subtle` violet-tinted for an in-progress/`PARTIAL*` state, `--positive` green for `SETTLED`/`MATCHED`/`RECONCILED`, `--warning` amber for `VARIANCE`/`NEEDS_REVIEW`, `--negative` red reserved for a hard `UNMATCHED`/error state. Keep the mapping identical across every page — a status badge should mean the same color everywhere in the app.
- **Reconciliation Dashboard tiles**: same stat-tile pattern as Overview's Quick Stats (`§5` above) — label, a single large count, and the whole tile is a link to the filtered underlying list. No icons needed beyond the existing minimal style; the number is the point.
- **Match-confidence indicator** (Bank Reconciliation's suggested matches): a short inline label ("Exact reference match" / "Amount + date match" / "Possible match") rather than a numeric score or progress bar — this stays legible and consistent with the "avoid decorative visualization" principle, and it's more actionable for Jane than a bare percentage.
- **Villa onboarding form** (Configuration → Villas → Add/Edit): a single shadcn `Form` in a `Dialog` or dedicated page, not a multi-step wizard — one scrollable form with the fields listed in `DATA_MODEL.md` §1's onboarding workflow, matching the density and label style of the rest of Configuration.

## 9a. `[NEW]` All Bookings frozen columns, drill-down panel, and print

- **Frozen/pinned columns**: All Bookings pins Reservation #, Guest, Channel, and Villa to the left edge while the remaining columns (Arrival, Departure, Status, financial figures, actions) scroll horizontally beneath them. Practical, fixed pixel widths — not auto-sized to content — keep the table dense and prevent one unusually long value from widening the pinned section or shifting the sticky offsets: Reservation # ~120px, Guest ~240px, Channel ~170px, Villa ~280px. A thin right border after Villa marks the boundary between the pinned and scrolling regions.
- **Guest cell**: single line, `overflow: hidden` + ellipsis (Tailwind `truncate`), never wraps to a second line. The full guest name is available via the native title-attribute tooltip on hover — no separate tooltip component needed for this.
- **Reservation detail panel** (the `Sheet` drill-down, §7 above): significantly wider than a typical form drawer — `sm:max-w-4xl`, not `sm:max-w-sm`/`2xl` — so the nightly financial breakdown table (8 columns) is fully visible without horizontal scrolling inside the panel. The header leads with a compact, OTA-style booking summary grid (Reservation #, Guest, Channel, Villa, Arrival, Departure, Status), not just the reservation number, with the nightly breakdown below it and the Manual Revenue Override section preserved beneath that (`REPORTING_LOGIC.md` §6).
- **Print**: a Print action in the panel header produces a standalone view of the booking summary + nightly breakdown only (no manual-override form, no app chrome/sidebar/overlay) — suitable to hand to a guest or keep as a reservation financial record. Implemented via a scoped `@media print` rule (a `visibility: hidden` on everything, `visibility: visible` + `position: fixed` on the printable region) rather than a new page/route or an added PDF-generation dependency — do not add a PDF library for this; the browser's own print-to-PDF covers the "printable/PDF" requirement.

## 9b. `[NEW]` AASHA wordmark

Jane supplied the real brand mark (`public/aasha-logo-wordmark.png` — a tightly-cropped, transparent-background horizontal wordmark; `public/aasha-logo-mark.png` — the full icon+wordmark lockup on a white background, better suited to a square/stacked placement than a header bar) in place of the plain-text "AASHA / Villa Management" placeholder used until now.

- **Sidebar header**: the wordmark replaces the two-line text block in the expanded state (§3a) — collapsed state still shows no branding mark, just the toggle control, since the lockup's proportions don't crop cleanly to an icon-only rail without further asset work.
- **Reservation print record** (§9a): the wordmark appears at the top of the drill-down panel, inside `#reservation-print-area` (so it prints as a letterhead), above the booking-summary grid.
- Rendered via `next/image` with explicit `width`/`height` and `className="h-* w-auto"` to preserve aspect ratio — inside a flex-column container (`SheetHeader` uses `flex flex-col`, which stretches children to the cross-axis width by default), pair this with `self-start` or the image silently stretches to fill the header's full width. Watch for this same trap anywhere else the wordmark is placed inside a column flex container.

## 10. What "premium but understated" means here, concretely

The reference achieves this almost entirely through restraint: one accent color used sparingly, thin borders instead of shadows for separation, no decorative gradients or icons-as-illustration, and dense-but-aligned spacing. Replicate that restraint rather than any specific visual flourish from the reference.
