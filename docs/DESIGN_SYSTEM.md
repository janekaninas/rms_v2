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

- **Persistent left sidebar** (as in the reference): grouped nav sections with small-caps or uppercase section labels (`COMMAND`, `COMMERCE`, `FINANCE`, `PLATFORM` in the reference → here: no section grouping needed at v1's small page count, see `PRODUCT_SPEC.md` §6 navigation — a flat list is appropriate until the page count grows). Active item gets a filled dark/violet-tinted background with an icon, matching the reference's "Pricing Engine" active state.
- **Top bar per page**: breadcrumb-style small label above an `<h1>` page title (reference: small tag "Pricing Engine" above the large "Pricing Engine" heading) plus right-aligned page-level actions (e.g. "Sync", "Report", primary CTA button in violet).
- **Content is a grid of white cards on the light neutral background**, thin border, no or near-zero shadow, generous but not excessive internal padding, small border-radius (6–8px, not the heavily rounded "SaaS marketing" look).
- **Desktop-first**: no responsive/mobile optimization required for v1 (per brief — desktop-first, information-dense); do not spend effort on a mobile layout.

## 4. Tables (this is the most important component — most pages are tables)

- Compact row height — the reference's Pricing Rules and Product Price Table rows are dense (roughly 48–56px), not the airy ~72px rows common in consumer SaaS.
- Column headers: small, uppercase-or-sentence-case, `--text-secondary`, with a single thin bottom border — no shaded header background.
- Numeric columns right-aligned; text columns left-aligned; a secondary line under a primary label is acceptable for compound cells (reference: product name + SKU stacked; here: e.g. Guest Name + Reservation Number, or Villa + Room).
- Status/delta indicators as small inline icon+color+value (reference: green up-arrow + percentage), not full badges, when space is tight; full pill badges (reference: "Storewide", "Collection", "Product" scope tags) reserved for categorical fields like reconciliation type or channel.
- Row-level actions as a trailing "…" overflow menu (reference pattern) rather than multiple visible icon buttons per row, to keep density high.
- Pagination controls at the bottom, minimal (page numbers + prev/next), matching the reference's "Showing 1–08 of 64 · 1 2 3 4 … 8".
- This is exactly the component AG Grid is well-suited for on the Monthly Performance matrix specifically (villa × date grid with frozen headers/columns, cell-level drill-down) — see `IMPLEMENTATION_PLAN.md` / `TECHNICAL DIRECTION` for the evaluation note. Simpler tables (All Bookings, Import History) likely don't need AG Grid's overhead — a shadcn/ui `Table` + server-side pagination is sufficient and keeps the dependency footprint down ("do not install unnecessary dependencies").

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
| Tables | shadcn `Table` (All Bookings, Import History, Reconciliation, Villa Mapping, OTA/Channel Rules) + AG Grid specifically for the Monthly Performance matrix |
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

## 10. What "premium but understated" means here, concretely

The reference achieves this almost entirely through restraint: one accent color used sparingly, thin borders instead of shadows for separation, no decorative gradients or icons-as-illustration, and dense-but-aligned spacing. Replicate that restraint rather than any specific visual flourish from the reference.
