# Reporting Logic

> **Revision note:** §1–§7 (All Bookings, Monthly Performance, Summary, portfolio/owner rollups, booking-data Reconciliation, drill-down, Excel export) are unchanged in their calculation logic, with one addition threaded through §1–§3: every villa-listing query now filters by `management_start_date`/`management_end_date` (§2a below), since villas are now dynamic, UI-managed master data (`DATA_MODEL.md` §1) rather than an assumed-fixed list. §8 onward is new: Road to Target, Channel Performance, Settlement Reconciliation, Bank Reconciliation, the Reconciliation Dashboard, and the Accounting Handoff view are all **Day-7 launch scope**; Expense Reporting, Aasha/Solio P&L, Owner Statement, and Owner Payout (§13–§16) are **Phase 2, Days 8–14**.
>
> **Correction (Jane's confirmed rules, this revision):** §2a previously filtered the Monthly Performance villa column set by `active = true` **and** management-date-window overlap. That conjunction was wrong for any *historical* reporting period — a villa Aasha no longer manages must still appear correctly in a report for a month it *did* manage, purely because its `management_start_date`/`management_end_date` window overlaps that reported period. `active` now governs only *current-config, forward-looking* surfaces (villa pickers/dropdowns for new data entry, the Configuration page's default list) — it must never be used to filter a historical report. §8 (Road to Target) is also corrected: the portfolio target is an **explicit, independently-configured `revenue_targets` row** (currently IDR 1,500,000,000/month for the 33-villa portfolio — 26 Aasha + 7 Balinest), never derived by summing villa-level targets, and the Day-7 field list and the "no speculative forecasting" instruction below are new.
>
> **Final consistency correction (this revision):** §2b's occupancy-window bracket is restated as inclusive on both ends, `[management_start_date, management_end_date]`, matching `DATA_MODEL.md`; §1's Gross Revenue field now cites the renamed `daily_revenue.commercial_revenue_basis_amount`; §5 (Reconciliation) adds that `MISSING_PAYMENT_RULE` is blocking, not informational, and excludes an affected reservation from finalized totals; and §9 (Channel Performance) is downgraded from Day-7-critical to **Day-7 optional** — the first report to defer if OTA Settlement or Bank Reconciliation is at risk.
>
> **Revision note (v0.6 — confirmed nightly allocation regimes):** §1's All Bookings financial columns are corrected — they must show a computed figure (blending actual Room Revenue Breakdown nights with the query-time Estimated Remaining Night Rate for the rest, `FINANCIAL_LOGIC.md` §7a) as soon as a reservation's Booking/Arrival Report total is known, not only once Room Revenue Breakdown exists. §5 (Reconciliation) and §6 (Drill-down) are updated for the two new exception types (`ROOM_REVENUE_TOTAL_MISMATCH`, and `MANUAL_REVENUE_OVERRIDE_PENDING`'s extended meaning for Direct/Individual/Travel-Agent reservations) and for showing estimated vs. actual nights distinctly in the per-reservation breakdown.
>
> **Revision note (v0.7 — new requirement, documentation only, not implemented in Day 3):** New §13a defines a flexible **Accounting / Revenue Breakdown reporting area** (Property Daily Revenue, Property Period Summary, Owner Revenue Report, and a standalone Reservation-level nightly breakdown), built entirely on the existing nightly allocation engine (`FINANCIAL_LOGIC.md` §7a, `daily_revenue`) — no new or duplicated financial calculation path. §1 (All Bookings) is extended with owner and reconciliation-state filters to match. This is a requirements addition for future scheduling (candidate Day 4+, alongside the Accounting Handoff view, §13) — it does not change or delay the Day 3 revenue-allocation correction, and nothing in this revision note authorizes starting Day 4 work.
>
> **Revision note (v0.8 — UX/data corrections, implemented within the current day):** §6's drill-down now requires a compact booking-summary header and a Print action for the individual reservation record (visual spec in `DESIGN_SYSTEM.md` §9a); §8's Pickup definition is corrected to anchor "new booking" on `reservations.booking_date` (Created Date), never an import timestamp or arrival date — a requirement for when Road to Target/Pickup is built, not yet implemented. No calculation logic already in production changes.

Defines the calculation and query shape behind every reporting page. All aggregation is server/database-side (indexed queries against `reservations` and `daily_revenue`), per the performance requirements — the browser never recomputes portfolio-wide totals from raw rows.

## 1. All Bookings (reservation ledger)

Replaces the `All Bookings` sheet. One row per reservation (not per stay-date — that grain lives in `daily_revenue` and is reachable via drill-down, §6).

Columns (per the brief's explicit list, mapped to `DATA_MODEL.md` fields):

| Column | Source |
|---|---|
| Reservation Number | `reservations.reservation_number` |
| Guest Name | `reservations.guest_name` |
| Villa | `reservations.villa_id` → `villas.name` |
| Room / Unit | `reservations.room_number` |
| Booking Date | `reservations.booking_date` |
| Arrival Date | `reservations.arrival_date` |
| Departure Date | `reservations.departure_date` |
| Nights | `reservations.nights` |
| Channel | `reservations.channel_id` → `channels.display_name` |
| Reservation Status | `reservations.status` (+ link to `reservation_status_history` for detail) |
| Gross Revenue | **`[CORRECTED — v0.6]`** `SUM` across every stay-date of: the actual `daily_revenue.commercial_revenue_basis_amount` where an actual Room Revenue Breakdown row exists, plus the query-time Estimated Remaining Night Rate for every stay-date that doesn't (`FINANCIAL_LOGIC.md` §7a) — never just `reservations.final_gross_revenue` shown flat, and never blank before Room Revenue Breakdown exists. Financial figures must be computable from the Booking/Arrival Report total immediately. |
| Commission | Same actual-plus-estimated blend as Gross Revenue, `SUM(daily_revenue.commission)` for actual nights plus the computed commission on each estimated night's amount |
| VAT on Commission | Same blend, for `commission_vat` |
| PB1 | Same blend, for `pb1` |
| Net Revenue | Same blend, for `net_revenue` |
| Manual Revenue Adjustment | `revenue_overrides.manual_revenue` when present |
| Final Net Revenue | net revenue recomputed using the approved override where one exists, else the standard net revenue |
| Source | `reservations.portfolio` (AASHA / BALINEST) |

Requirements:
- **Search/filter**: by reservation number, guest name, villa(s) (multi-select), owner (`villas.owner_id`, once assigned), channel, reservation status, date range (arrival/departure/stay overlap), source/portfolio, and reconciliation state (`[NEW — v0.7]` open/none, and which `reconciliation_exceptions` type, per §5). Filtering must translate to indexed WHERE clauses, not client-side array filtering of the whole table.
- **Pagination or virtualization** is required once the ledger exceeds a page-worth of rows (per performance requirements) — do not load all reservations into the browser at once.
- Cancelled reservations remain visible here (filterable, not hidden) — this is the ledger, and cancelled history must remain available for reporting.
- `[NEW — v0.7]` Drill-down from any row goes to the same per-reservation nightly breakdown defined in §6, which is also exposed as its own standalone, filterable/exportable report — see §13a's "Reservation-level nightly breakdown" view. Same query, two entry points; not two implementations.

## 2. Monthly Performance

Replaces the `Aug '26` / `Sept '26` / ... sheets — **one page, one month selector** (`< July 2026 | August 2026 | September 2026 >`), not per-month hardcoded pages.

### 2a. The matrix

Rows = each calendar date in the selected month. Columns = each villa whose `management_start_date`/`management_end_date` window overlaps the selected month (grouped by portfolio: Aasha columns, Balinest columns, matching the legacy sheet's left/right split — worth preserving as a visual grouping even though the underlying query is portfolio-agnostic). **`[CORRECTED — Jane's confirmed rule]` This is a management-date-window test only — it does *not* also require `active = true`.** A villa's `active` flag reflects its *current* management status and is the correct filter for forward-looking, current-config surfaces (a villa picker for a brand-new booking, the Configuration page's default villa list); it must never gate a historical report. Concretely: a villa that ended its management agreement last month (`active = false` now) must still show correctly, with its real occupancy and revenue, in a Monthly Performance view for a month while it was still managed — the month selector's period is what determines inclusion, not today's `active` value. `[NEW]` This column set is computed fresh from `villas` on every render — never a fixed/cached villa list — so a villa added in Configuration this morning appears in this afternoon's matrix with no code change and no deployment. `[NEW]` For a date before a villa's `management_start_date` (or after its `management_end_date`), that villa contributes 0 to both the occupancy numerator *and denominator* for that date — it should not appear as "0% occupied" (which would read as a missed booking) for a period before Aasha even managed it (or after management ended); render such cells visibly distinct (e.g. blank/greyed, not a bolded zero).

For each villa × date cell, two numbers matter (shown together or toggleable — the legacy sheet keeps them as two separate stacked matrices, occupancy and revenue):

**Occupied nights** (0 or more, since a "villa" can represent multiple physical units — see `villas.unit_count`):
```sql
COUNT(reservations)
WHERE villa_id = :villa
  AND arrival_date <= :date
  AND departure_date > :date
  AND status != duplicate   -- dedup guard, see below
  AND status = ACTIVE (not cancelled)
```
This mirrors the legacy `COUNTIFS('All Bookings', villa, arrival<=date, departure>date, not-duplicate, not-cancelled)` — note it counts at the **reservation** grain (arrival/departure range), not from `daily_revenue`, because occupancy should reflect the current booking position even for nights whose Room Revenue Breakdown hasn't been imported yet (e.g. future dates).

**Net revenue for the date**:
```sql
SUM(daily_revenue.net_revenue)
WHERE villa_id = :villa AND stay_date = :date
```
This mirrors the legacy `SUMIFS('ROOM REV', date, villa)` — deliberately sourced from the **daily** grain, not from the reservation-level total, because the whole point of the daily breakdown import is that nightly rates vary (PriceLabs). Confirm this only applies to dates that already have a Room Revenue Breakdown imported; for future/not-yet-imported dates, the cell should show as "not yet available," not zero (the legacy sheet handles this with `IF(date <= today, computed, blank)` — preserve that distinction so an empty future cell doesn't read as "no revenue expected").

### 2b. Per-villa monthly rollups (bottom of the matrix, or a summary row)

- **Room nights sold** = `SUM(occupied nights)` across the month for that villa.
- **Occupancy %** = `room nights sold / (unit_count × managed_days_in_month)`, where `managed_days_in_month` is the count of days in the selected month that fall within `[management_start_date, management_end_date]` — **`[CORRECTED]`** both ends inclusive (`management_start_date` = first managed night, `management_end_date` = last managed night) — for a villa managed the whole month this is just `days_in_month` as before; for a villa onboarded mid-month it is only the days from onboarding (inclusive of the start date itself), so occupancy % is never artificially depressed by days Aasha wasn't yet responsible for the villa.
- **ARR** = `SUM(net revenue for month) / room nights sold`.
- **Monthly net revenue** = `SUM(net revenue)` across the month for that villa.

### 2c. Drill-down (see §6) must be reachable from every cell — this replaces the black-box numbers in the current pivot sheets.

### 2d. Do not build this as a chart-only view

The brief is explicit: "Do not replace it with only charts... I need to be able to inspect each villa and each date." The matrix/table *is* the primary UI; charts, if added, are supplementary.

### 2e. Performance

Changing the month selector should feel instant. This means: one indexed query per matrix (occupancy) and one per matrix (revenue), parameterized by month and portfolio, not 26 villas × 31 dates = 800+ individual queries. Prefer a single grouped query (`GROUP BY villa_id, stay_date`) over per-cell queries, with the UI pivoting the already-fetched rows into the grid client-side (this is fine — it's a small, bounded result set per month, not a full-history scan).

## 3. Summary

Replaces the `Summary` sheet's core reporting function (explicitly excluding the sales-target/bonus-tier calculator, flagged out-of-scope in `DATA_MODEL.md` §7 pending confirmation).

Shows, **by month (current month through year-end) and by portfolio** (Aasha, Balinest, combined):
- Revenue (net)
- Occupancy %
- ARR
- Room Nights Sold

This is a monthly rollup of the same `daily_revenue` + `reservations` aggregations used in Monthly Performance, just summed across all villas in a portfolio per month rather than shown per-villa-per-date. It should be derivable from the same underlying queries/rollup logic — do not build a separate, divergent calculation path for Summary vs. Monthly Performance; both must agree by construction; if profiling later shows the Summary page needs a precomputed month-level rollup table, add that as a materialized rollup fed by the same source-of-truth query, not a re-implementation.

## 4. Portfolio / owner rollups

Once `owners` and `villas.owner_id` exist (per `DATA_MODEL.md` §1, flagged `NEEDS CONFIRMATION` pending Jane supplying the mapping), the same aggregation pattern (group by `owner_id` instead of / in addition to `villa_id`) produces owner-level reporting combining Aasha and Balinest villas. Do not build owner reporting as a one-off — it should reuse the villa/date aggregation, just with a different grouping key.

## 5. Reconciliation

Surfaces `reconciliation_exceptions` (see `DATA_MODEL.md` §6) as an actionable queue: filterable by type/status, each entry linking to the underlying reservation/daily-revenue row it concerns, with an approve/resolve/ignore action and a notes field. This is the page that makes the system's data problems *visible* instead of silently absorbed the way the legacy workbook's inline `#N/A`/`Check` columns do today.

`PRICE_CHECK_MISMATCH` specifically should default to a non-blocking/informational severity (it's frequently just dynamic pricing working as intended) — see `FINANCIAL_LOGIC.md` §10 item 8; do not let it flood the queue with false positives, but do not suppress it either without Jane's confirmation.

**`[NEW — confirmed rule]`** `MISSING_PAYMENT_RULE`, by contrast, is **blocking, not informational** (`DATA_MODEL.md` §8/§4): a reservation with this exception open has no resolved `channel_payment_rules` row, so its Expected Settlement/commission/VAT/PB1/Net Revenue are incomplete. Every report that aggregates these figures (All Bookings, Monthly Performance, Summary, Road to Target, Settlement Reconciliation) must exclude such a reservation from its finalized totals — or visibly flag the total as provisional — rather than silently including a guessed number. There is no default financial model to fall back on here.

**`[NEW — v0.6]`** `ROOM_REVENUE_TOTAL_MISMATCH` (`FINANCIAL_LOGIC.md` §7a-A, `DATA_MODEL.md` §8): every stay-date for the reservation now has an actual Room Revenue Breakdown row, but they don't sum to the Booking/Arrival Report total. Informational for reporting purposes — the reservation's figures are still shown (using the actual per-night data), but the discrepancy itself must surface here for Jane to resolve; the authoritative total is never silently replaced by the actual sum.

**`[NEW — v0.6]`** `MANUAL_REVENUE_OVERRIDE_PENDING` now also covers any Direct/Individual/Travel-Agent reservation with no *approved* override yet (`FINANCIAL_LOGIC.md` §7a-B) — its figures use the same temporary system-value estimate as an OTA booking (so it isn't blank), but the exception marks them as unconfirmed and worth reviewing, since the system-reported total for these channels isn't trusted by default.

## 6. Drill-down (applies to every revenue number, everywhere)

Every displayed revenue figure — a Monthly Performance cell, a Summary total, an All Bookings row's Net Revenue — must be traceable to its constituent `daily_revenue` rows. The drill-down view for a given villa+date (or a given reservation) shows:

- Guest name
- Reservation number
- Channel
- Arrival / Departure
- Daily gross revenue
- Commission
- VAT on Commission
- PB1
- Net revenue

This is a straightforward query against `daily_revenue` (joined to `reservations`/`channels`) filtered by the villa+date or reservation being inspected — it should not require a different code path than the aggregation queries above; it's the same source rows, just unaggregated. This directly satisfies "avoid black-box report numbers."

**`[NEW — v0.6]`** A reservation-level drill-down must show **every** stay-date, not only the ones with an actual `daily_revenue` row — a stay-date without one yet is computed and shown using the query-time Estimated Remaining Night Rate (`FINANCIAL_LOGIC.md` §7a), visually distinguished from an actual night (consistent with Monthly Performance's and Road to Target's existing actual-vs-estimated treatment, `§2a`/`§8`), never presented as if it were confirmed.

**`[NEW — v0.8]`** The reservation-level drill-down must open with a compact booking-summary header — Reservation Number, Guest, Channel, Villa, Arrival, Departure, Status — above the nightly breakdown, not just the reservation number; and must offer a Print action producing a standalone view of that summary plus the nightly breakdown only (no manual-override form or app chrome), suitable as a guest/reservation financial record. This is the same drill-down defined above with a required header/print treatment — not a second view or a new calculation. Full visual spec (panel width, layout) in `DESIGN_SYSTEM.md` §9a.

## 7. Excel export

At minimum: All Bookings, Monthly Performance, Summary. Requirements:
- Real numeric cells, real date cells, real percentage-formatted cells, real tables — not a rendered image/screenshot of the web page.
- Should be structured so it can resemble the legacy workbook's layout where that's useful for Jane's existing habits/downstream use (e.g. the villa × date matrix shape for Monthly Performance), generated server-side from the same aggregation queries that power the on-screen views (do not maintain a separate "export calculation" path — export the same numbers the screen shows, formatted for a spreadsheet).
- `[NEW]` If Excel export formatting becomes a Day-7 blocker, ship correct, real (non-string) tabular data first and defer visual fidelity to the legacy workbook's exact layout — a plain but correct exported table beats a launch delay for styling.

## 8. `[NEW — Day-7 critical]` Road to Target

First, four terms that must not be confused, per the explicit instruction — used consistently across this section and the UI:

| Term | Definition |
|---|---|
| **Actual (Recognized) Revenue** | `SUM(daily_revenue.net_revenue)` for stay-dates that have already occurred (≤ "today") and have an imported Room Revenue Breakdown — the same figure Monthly Performance shows for past dates. |
| **Currently Booked Revenue** | Actual Recognized Revenue **plus** the `final_gross_revenue`-derived net revenue of `ACTIVE` reservations whose stay dates fall in the target month but haven't happened yet (future dates within the month, using the reservation-level system/override revenue since no daily breakdown exists yet for future dates), computed using the query-time-only `ESTIMATED_BOOKED` allocation logic in `DATA_MODEL.md` §9 (spreading a future reservation's revenue evenly across its stay nights for display purposes, without ever writing an `ESTIMATED_BOOKED` row into `daily_revenue` itself). This is "everything on the books for this month right now," mixing realized (`ACTUAL_ROOM_REVENUE`) and not-yet-realized (`ESTIMATED_BOOKED`) nights — it is *not* the same as Actual Recognized Revenue, and the UI must label it distinctly (e.g. a visually distinct treatment for estimated cells, consistent with Monthly Performance's future-date handling in §2a). |
| **Forecast Revenue** | **`[DEFERRED past Day 7 — Jane's confirmed rule]`** Any projection that adds a modeled pickup assumption on top of Currently Booked Revenue (e.g. "remaining nights × trailing ARR") is explicitly **out of scope for the Day-7 launch** — do not build speculative forecasting logic under Day-7 deadline pressure. The Day-7 Road to Target view uses only Actual Recognized Revenue, Currently Booked Revenue, and Target Revenue (see the confirmed field list below); a modeled Forecast Revenue is a Days-8–14-or-later candidate, to be built only once Jane has seen and approved a specific methodology — never shipped by default. |
| **Target Revenue** | From `revenue_targets` — an **explicit, independently-configured figure**, at both the portfolio grain (`villa_id IS NULL`) and, where entered, the villa grain. Purely configuration, never hardcoded, and — confirmed this revision — **never derived** from either past performance or from summing villa-level targets (see Portfolio rollup below). |

### `revenue_targets`-driven calculation (villa grain)

```
Achievement %                = Currently Booked Revenue / Target Revenue
Gap to Target                 = Target Revenue − Currently Booked Revenue
Remaining Days                = days from "today" to end of month (inclusive/exclusive per villa's own calendar — be consistent)
Remaining Available Room Nights = (unit_count × Remaining Days) − (room-nights already booked for those remaining dates)
Required Revenue per Remaining Day = Gap to Target / Remaining Days
Required ARR on Remaining RN  = Gap to Target / Remaining Available Room Nights   (guard divide-by-zero: fully booked remainder ⇒ "target already secured" or "target unreachable," not a crash or an infinite number)
Pickup                        = net new booked revenue (new bookings − cancellations) since a reference point (e.g. yesterday, or since the last time this view was checked) — mirrors the legacy sheet's "PICKUP AASHA" block (new bookings, cancellations, net, accumulation, road-to-target columns), generalized to be villa/portfolio-agnostic and driven by live queries instead of a fixed sheet layout. `[NEW — v0.8]` "New bookings since a reference point" means `reservations.booking_date` (Created Date, `IMPORT_LOGIC.md` §1) falls after that reference point — never the import/upload timestamp and never the arrival date. This is a requirement for when Pickup is built (Road to Target, not yet started); it does not change anything already implemented.
```

### Portfolio rollup

**`[CORRECTED — Jane's confirmed rule]`** Portfolio Target Revenue is an **explicit, independently-entered `revenue_targets` row** (`villa_id IS NULL`) — currently **IDR 1,500,000,000/month** for the current 33-villa portfolio (26 Aasha + 7 Balinest) — and is **never derived** by summing villa-level targets. This reverses the earlier default (sum-of-villa-targets, with a portfolio override as the rare exception); the confirmed model is the opposite: the portfolio figure is the primary, deliberately-set number, and villa-level `revenue_targets` rows (`villa_id` populated) remain independently and separately configurable for villa-level Achievement/Gap reporting — the two are not required to reconcile to each other, since Jane may set a portfolio target without having finished allocating it down to every villa, or may deliberately set villa targets that sum to more or less than the portfolio figure. Portfolio-level Achievement/Gap use the same formulas as above, computed against the portfolio's own `revenue_targets` row and the portfolio-wide Currently Booked Revenue — never as a sum of villa-level Achievement/Gap figures.

### Day-7 confirmed field list (Jane's confirmed rule — build exactly this, no more, no less)

**Portfolio level:**
- Portfolio Target (from the explicit `revenue_targets` row, `villa_id IS NULL`)
- Currently Booked Revenue
- Achievement %
- Gap to Target
- Average Required Pickup per Remaining Day (i.e. `Required Revenue per Remaining Day` above)
- Remaining Available Room Nights
- Required ARR on Remaining RN

**Villa level:** the same seven fields, computed against that villa's own `revenue_targets` row where one exists (villas without an individually-configured target show Currently Booked Revenue/Achievement/etc. only where a target is present — do not fabricate a per-villa target by dividing the portfolio figure).

No other Road-to-Target field (in particular, no Forecast Revenue, no pickup trend chart, no bonus-tier calculator) is in Day-7 scope; see the Forecast Revenue row above and `PRODUCT_SPEC.md` §8 for what's deferred.

### Grain, source, filters, drill-down

- **Grain**: villa × month (rolled up to portfolio × month).
- **Source tables**: `revenue_targets`, `reservations`, `daily_revenue`.
- **Filters**: month selector (current + future months, per the explicit "support current month and future month targets" requirement); portfolio/villa scope.
- **Drill-down**: a villa's Gap/Achievement figures link through to that villa's slice of All Bookings/Monthly Performance for the month, so "why is this villa behind" is always one click from the number.

### Dashboard layout (per the brief's suggested hierarchy)

```
Month selector

Portfolio:  [ Revenue ] [ Target ] [ Achievement ] [ Gap ]

Villa Performance
Villa        Target     Revenue     Achievement    Gap     OCC     ARR
Amani 1      ...
Amani 2      ...
Bracha       ...
```

This is one of the main daily-use screens — dense, sortable/filterable by villa, no chart-only substitute for the table.

## 9. `[NEW — Day-7 OPTIONAL, first deferrable report — Jane's confirmed rule]` Channel Performance

Useful, but **not launch-critical**. If OTA Settlement (§10) or Bank Reconciliation (§11) work is at risk on Day 4/5, this is the first report to cut from Day 7 and pick up in Days 8–14 — it duplicates no other page's calculation logic, so deferring it costs nothing but the page itself.

- **Grain**: channel × month (drillable to channel × villa × month).
- **Source**: `reservations` + `daily_revenue`, grouped by `channel_id`.
- **Calculation**: revenue, commission, room-nights, ARR, and reservation count per channel, for the selected period.
- **Filters**: date range, villa, portfolio.
- **Drill-down**: click a channel row → All Bookings filtered to that channel/period.
- **Status**: none — this is a pure performance view, not a reconciliation queue.

## 10. `[NEW — Day-7 critical]` Settlement Reconciliation

- **Grain**: OTA settlement batch (drillable to line, drillable to reservation).
- **Source tables**: `ota_settlement_batches`, `ota_settlement_lines`, `settlement_reservation_allocations`, joined to `reservations.expected_settlement_amount`.
- **Calculation**: for each batch, `Expected` (sum of allocated reservations' `expected_settlement_amount`) vs. `Settled` (`net_settlement_amount`) vs. `Variance` (Settlement Variance, `FINANCIAL_LOGIC.md` §8).
- **Status**: `PENDING` (no allocations yet) / `PARTIALLY_SETTLED` / `SETTLED` (variance within an acceptable tolerance — a configurable small tolerance, e.g. rounding, not a business rule to invent freely; default zero-tolerance until Jane says otherwise) / `VARIANCE` (allocated but doesn't reconcile) / `NEEDS_REVIEW` (ambiguous allocation).
- **Filters**: channel, date range, status.
- **Drill-down**: batch → its lines → each line's allocated reservation(s) → that reservation's full financial breakdown (§6, unchanged drill-down mechanism).
- Exact-reference, exact-amount cases may resolve to `SETTLED` without manual confirmation; anything else requires a human look, per the explicit "do not silently force a match" instruction.

## 11. `[NEW — Day-7 critical]` Bank Reconciliation

Answers: **did the OTA settlement actually arrive in the bank?** Distinct from Settlement Reconciliation (§10), which only asks whether the OTA's own report matches expectations.

- **Grain**: bank transaction (drillable to its allocated settlement batch/line(s)).
- **Source tables**: `bank_transactions`, `settlement_bank_allocations`, `ota_settlement_batches`.
- **Display columns**: OTA / Channel, Settlement Reference, Settlement Date, Expected Settlement, OTA Settlement Amount, Bank Received, Difference, Status.
- **Status** (a report-level computed label, combining settlement and bank state — not a new stored column, consistent with the multi-dimensional status principle in `DATA_MODEL.md` §11): `AWAITING_SETTLEMENT` (no OTA settlement data yet for this expected receivable) / `AWAITING_BANK` (settlement recorded, no bank transaction allocated yet) / `MATCHED` (settlement and bank both reconcile within tolerance) / `PARTIAL` (a portion allocated/received) / `VARIANCE` (allocated but doesn't reconcile) / `UNMATCHED` (a bank transaction with no plausible settlement counterpart, or vice versa) / `NEEDS_REVIEW` (ambiguous candidate matches).
- **Filters**: bank account, date range, status, channel.
- **Matching (v1, deterministic only — no fuzzy/ML matching)**: suggest candidate matches ranked by (1) exact payout/reference number match, (2) exact amount match, (3) channel + date-proximity + amount-tolerance match, (4) description/text similarity — in that priority order. **Auto-resolve to `MATCHED` only for an unambiguous exact-reference-and-amount case.** Every other case is presented as a ranked suggestion with a confidence indicator for manual confirmation (`settlement_bank_allocations.confirmed_by`/`confirmed_at`) — never silently committed. This is explicitly a v1/Day-7 simplification; sophisticated fuzzy or ML-based matching is post-MVP.
- **Drill-down**: a bank transaction → its allocated settlement batch/line(s) → the underlying reservation(s) → full financial breakdown.
- Supports one-to-many and many-to-one via `settlement_bank_allocations` — never assume 1 settlement = 1 bank transaction (a bulk OTA payout covering many bookings is the common case, not the exception).

## 12. `[NEW — Day-7 critical]` Reconciliation Dashboard

A single at-a-glance view of open exceptions across the whole revenue-to-cash chain, replacing/extending the booking-only Reconciliation queue from v0.1 with counts spanning every stage:

```
Booking Issues                 4
Revenue Issues                 2
Awaiting OTA Settlement        17
Settlement Variances           3
Unmatched Bank Transactions    5
```

- **Source**: `reconciliation_exceptions` (booking/revenue issues, unchanged from v0.1) `UNION` computed counts from `ota_settlement_batches`/`lines` in a non-terminal status `UNION` `bank_transactions` with `reconciliation_status != MATCHED`.
- **Behavior**: every count is a link to the underlying filtered list (Reconciliation queue, Settlement Reconciliation, or Bank Reconciliation, pre-filtered to the relevant status) — this dashboard is a navigation aid over the other three pages' data, not a fifth place that independently stores exception state.

## 13. `[NEW — Day-7 critical]` Accounting Handoff view

A single exportable view spanning the whole chain, for however Jane's own bookkeeping consumes this data:

```
Revenue Recognized | Expected Receivable | OTA Settlement | Cash Received | Difference | Reconciliation Status
```

filtered by date, OTA/channel, villa, settlement, and status. This is a read/query view over the same tables as §8–§12 above (`daily_revenue`, `reservations`, `ota_settlement_*`, `bank_transactions`) — it introduces no new calculation, only a wide, exportable projection of numbers already computed elsewhere, consistent with "avoid having multiple pages independently calculate the same financial measure." Excel export of this view follows the same real-cells requirement as §7.

## 13a. `[NEW — v0.7, requirement only, candidate Day 4+, not implemented in Day 3]` Accounting / Revenue Breakdown Reporting Area

A flexible reporting area for however Jane's own accounting/bookkeeping consumes this data — distinct from, but adjacent to, the single wide Accounting Handoff view (§13). Where §13 is one exportable projection of the revenue-to-cash chain, this area is a set of four accountant-facing views over the **same nightly allocation engine** the rest of the platform already uses (`FINANCIAL_LOGIC.md` §7a, `daily_revenue`, `reservations`). This introduces **no new calculation logic anywhere** — every figure here is the identical actual-plus-estimated blend that All Bookings (§1), Monthly Performance (§2), and Accounting Handoff (§13) already compute, from the same source tables and the same allocation function. If a number in this area ever disagrees with All Bookings or Monthly Performance for the same reservation/stay-date, that is a bug to fix, not a legitimate "accounting adjustment" — there is exactly one calculation path, reused everywhere.

**Live refresh, no snapshot step.** Every view queries `daily_revenue`/`reservations` (or the same rollup query Monthly Performance/Summary use, §3) at render/export time. A Booking/Arrival Report import, a Room Revenue Breakdown import, or a manual override being approved must be reflected the next time any of these four views is loaded or exported — there is no separate accounting batch, snapshot, or precomputed ledger sitting between the source data and this reporting area.

**Allocation rules governing every figure here (restated from `FINANCIAL_LOGIC.md` §7a, not reimplemented):**
- **OTA bookings**: the Booking/Arrival Report Total Revenue is the authoritative reservation total from the moment it's known. Room Revenue Breakdown only ever progressively clarifies the *nightly* allocation (via the Remaining Revenue / unresolved-nights estimate) — it never changes the reservation total. A `ROOM_REVENUE_TOTAL_MISMATCH` reservation still shows its actual per-night data here, with the discrepancy flagged (§5), never a silently substituted total.
- **Direct/Individual/Travel Agent bookings with an approved manual override**: the approved manual revenue is the authoritative total, evenly split per stay night. Room Revenue Breakdown must **not** override this allocation in any view in this area, including Property Daily Revenue and the Owner Revenue Report — the same precedence rule as everywhere else in the platform.
- Any reservation with an open `MISSING_PAYMENT_RULE` exception is incomplete, not final (§5) — excluded from finalized subtotals/totals in every view below, or visibly flagged as provisional, exactly as in All Bookings/Monthly Performance. No view in this area computes a different, more permissive rule.

### Required views

**1. Property Daily Revenue** — one row per stay-date for a given villa (or set of villas), accountant-style columns:

| Column | Source |
|---|---|
| Date | `daily_revenue.stay_date` (or the estimated stay-date for a not-yet-actual night, §6) |
| Guest | `reservations.guest_name` |
| Check-in / Check-out | `reservations.arrival_date` / `departure_date` |
| Nights | `reservations.nights` |
| Channel | `channels.display_name` |
| Commercial Revenue Basis | actual `daily_revenue.commercial_revenue_basis_amount`, or the estimated per-night amount where no actual row exists yet (§7a) |
| Commission | actual or computed-on-estimate, per §7a |
| VAT | actual or computed-on-estimate |
| PB1 | actual or computed-on-estimate |
| Net Revenue | actual or computed-on-estimate |
| Allocation Status | `Actual` / `Estimated` (same distinction as the drill-down, §6), plus any open reconciliation exception for the reservation (`MISSING_PAYMENT_RULE`, `ROOM_REVENUE_TOTAL_MISMATCH`, `MANUAL_REVENUE_OVERRIDE_PENDING`) shown inline, not hidden behind a separate page |

Grain: villa × stay-date × reservation (a villa with overlapping bookings across units shows one row per reservation-night, not a collapsed villa-day total — that rollup is Property Period Summary, below).

**2. Property Period Summary** — one villa (or villa selection) rolled up to the selected period (month, or a custom date range), reusing the exact Monthly Performance/Summary aggregation (§2/§3): room nights sold, occupancy %, ARR, gross revenue, commission, VAT, PB1, net revenue, count of nights still `Estimated`, count of reservations with an open blocking exception. Do not build a second period-rollup query — this is the same `GROUP BY villa_id, stay_date` aggregation as §2a, re-presented with accounting-style columns and totals.

**3. Owner Revenue Report** — across every villa belonging to one owner (`villas.owner_id` → `owners`, `DATA_MODEL.md` §1), for a selected period: per-villa subtotal (same columns as Property Period Summary) plus an owner-level grand total. A villa with no `owner_id` assigned does not appear in any owner's report (it is not silently attributed to a default owner). Reuses the villa/date aggregation with `owner_id` as an additional grouping key, per the same principle already stated for portfolio/owner rollups in §4 — do not build owner reporting as a one-off calculation.

**4. Reservation-level nightly breakdown** — the exact per-reservation night list already defined as the All Bookings drill-down (§6: stay date, actual/estimated status, gross, commission, VAT, service charge extraction, PB1, net, per night), exposed here as its own standalone, filterable, exportable report rather than only reachable by opening one reservation at a time. Same query as §6's drill-down — a list view over many reservations' worth of nights at once, not a new calculation.

### Common filters (all four views)

Date / month / custom period; portfolio (Aasha / Balinest); owner; villa(s) (multi-select); channel; reservation status; `revenue_type` (`STAY` / `CANCELLATION_FEE` / `NO_SHOW` / `REFUND` / `ADJUSTMENT`, `DATA_MODEL.md` §2); and an actual-vs-estimated allocation filter (show only actual nights, only estimated nights, or both — useful for an accountant who wants to see exactly what's still provisional before closing a period).

### Exports

- CSV/XLSX with real numeric and date cells (same requirement as §7 — no rendered-image or string-formatted numbers).
- A printable/PDF report rendering, for handing a page directly to Jane's accountant.
- Every export reflects the filters currently applied on screen — never a full unfiltered dump while filters are active. Generated server-side from the same aggregation queries powering the on-screen view, per §7's existing "do not maintain a separate export calculation path" rule.

### Scope note

This section defines calculation and view requirements only. It does not commit this work to a specific day — see `PRODUCT_SPEC.md` §5/§7/§8 for where it sits in navigation and required outputs, and `IMPLEMENTATION_PLAN.md` for eventual day sequencing. It is explicitly **not** part of the Day 3 revenue-allocation correction and must not be started until a later day is scheduled for it.

## 14. `[NEW — Phase 2, Days 8–14]` Expense Reporting

- **Grain**: expense (drillable via `expense_allocations` to villa/business-unit shares).
- **Source**: `expenses`, `expense_allocations`, `expense_categories`, `vendors`.
- **Calculation**: totals by category, villa, business unit, and period; `paid_by`/`borne_by` breakdowns.
- **Filters**: date/posting-month range, villa, business unit, category, `paid_by`, `borne_by`, approval/payment status.
- **Drill-down**: an expense row → its attachments (`expense_attachments`) and vendor detail.
- **Status**: `approval_status` / `payment_status` as stored on `expenses` (no separate computed status needed here, unlike the settlement/bank layers, since there's no multi-table reconciliation happening).

## 15. `[NEW — Phase 2]` Aasha P&L and Solio P&L

- **Grain**: month × business unit.
- **Aasha P&L source**: management fee revenue (`SUM(owner_statement_lines.amount)` where `line_type = MANAGEMENT_FEE`, by month) + any other Aasha revenue (config/manual for now — the legacy workbook has no other-Aasha-revenue concept to reverse-engineer, so this is new and should start simple) − Aasha operating expenses (`SUM(expenses.total_amount)` where `borne_by = AASHA`, allocated per `expense_allocations` where relevant, by month).
- **Solio P&L source**: Solio service revenue (from `management_agreements.solio_package_id` charges, once that's a real structured concept — see `FINANCIAL_LOGIC.md` §10's `NEEDS CONFIRMATION` on Solio's charging structure) − Solio direct costs/operating expenses (`borne_by = SOLIO`).
- **Explicitly not built**: a general ledger or statutory accounting output — this is management P&L only, per `PRODUCT_SPEC.md` §8.
- **Drill-down**: every P&L line → its constituent expense/revenue rows.

## 16. `[NEW — Phase 2]` Owner Statement and Owner Payout

- **Grain**: villa × owner × month (statement); owner × payout batch, potentially spanning several statements (payout).
- **Source**: `owner_statements`, `owner_statement_lines`, `management_agreements`, `expenses`/`expense_allocations` (`borne_by = OWNER`), `statement_adjustments`, `owner_payouts`, `owner_payout_statements`.
- **Calculation**: the configurable waterfall in `FINANCIAL_LOGIC.md` §11, computed per villa's `management_agreements` row — never a fixed universal formula.
- **Status (statement)**: `DRAFT` / `REVIEWED` / `APPROVED` / `PAID`. **Status (payout)**: `DRAFT` / `APPROVED` / `PAID`. Once a statement is `APPROVED` or `PAID`, or its `accounting_periods` row is `CLOSED`, corrections go through `statement_adjustments` posted into a later open period — never a silent rewrite (`DATA_MODEL.md` §10).
- **Drill-down**: every statement line → its source (a specific expense, the management-fee calculation inputs, an adjustment's reason).
- **Filters**: owner, villa, period, status.

