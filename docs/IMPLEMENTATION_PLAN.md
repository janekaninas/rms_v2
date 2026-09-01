# Implementation Plan

> **Revision note:** This supersedes the original 12-milestone plan with a **7-day production launch** critical path (Booking → Revenue → Expected Settlement → OTA Settlement → Bank Reconciliation, live and deployed) followed by a **Days 8–14 Phase 2** covering expenses, management fee, owner statements/payout, and P&L. The financial logic, data model, import logic, and reporting logic this plan builds against are documented in the correspondingly-revised `FINANCIAL_LOGIC.md`, `DATA_MODEL.md`, `IMPORT_LOGIC.md`, and `REPORTING_LOGIC.md` — this file sequences the work, it does not redefine what any of it means.
>
> **This revision incorporates Jane's confirmed business rules**, most visibly: most of the Day-1 financial blockers below are now resolved (see `FINANCIAL_LOGIC.md` §10) rather than open; Day 2 adds the permanent Baseline/Arrival Report import; Day 3 explicitly calls out the confirmed Direct/TA even-split and cancellation/no-show revenue treatment; Day 4 adds the confirmed explicit portfolio target and the query-time `ESTIMATED_BOOKED` future-revenue allocation, with speculative forecasting explicitly out of Day-7 scope; Day 5's settlement priority order is corrected to **Airbnb → Booking.com → Expedia** (previously assumed Booking.com-first) and idempotency is called out explicitly; Day 6 names **BCA** as the confirmed first bank source.
>
> **Final consistency correction (this revision):** the Bracha cutover date (**2026-08-01**) and Bracha's Booking.com rate (**18%**) are now fully confirmed and applied directly in Day 1/3, with no remaining "raise with Jane" framing; an unresolved `channel_payment_rules` lookup is stated explicitly (Day 3) as raising `MISSING_PAYMENT_RULE` with no default fallback; Day 4 adds Channel Performance as **Day-7 optional**, the first item to cut if Day 5/6 is at risk; and the Direct/TA override wording no longer calls the allocation rule an "open question."
>
> **New candidate, not yet scheduled (this revision):** `PRODUCT_SPEC.md` §7/§8 and `REPORTING_LOGIC.md` §13a now document a requirement for an **Accounting / Revenue Breakdown reporting area** (Property Daily Revenue, Property Period Summary, Owner Revenue Report, Reservation-level nightly breakdown). It reuses the Day-4 Monthly Performance/Summary aggregation and the Day-3 allocation engine with no new calculation logic, which makes Day 4 (once that day's committed scope below is done) or later a natural place for it — but it is **not added to Day 4's committed scope by this note**; it is a documented, unscheduled candidate until Jane confirms when to build it. This is a documentation-only addition and does not change or delay Day 3.

## Ground rules for this plan

- **Deployment is not a final task — it starts Day 1.** A live production URL, connected to the production database, exists by end of Day 1, and every subsequent day's completed feature is verified in the hosted environment, not only locally.
- **Villas are never hardcoded**, anywhere, starting Day 1 — every page/report/import iterates over the `villas` table (`DATA_MODEL.md` §1). **`[CORRECTED]`** Current-config surfaces (dropdowns, the Configuration page) filter by `active`; historical reports filter independently by `management_start_date`/`management_end_date` window overlap with the reported period, **never** by `active` (`REPORTING_LOGIC.md` §2a) — do not conflate the two filters.
- **Financial-logic blockers are surfaced on Day 1, not discovered mid-week.** Most of the `FINANCIAL_LOGIC.md` §10 register items that affect Expected Settlement are now **resolved** by Jane's confirmed rules (see `FINANCIAL_LOGIC.md` §10's "Resolved by Jane's confirmation" list) — Day 1 is now about **applying** those confirmed rules to schema/config (the `channel_payment_rules` seed data, `villa_tax_profile_assignments`, the retired Bracha cutover date) rather than extracting the answers from Jane. The still-open items (§10's "still open" and "new items opened by this revision" lists, e.g. the exact Bracha cutover date, the full villa×channel `channel_payment_rules` matrix beyond the four confirmed combinations, real OTA/BCA file formats) must still be raised with Jane before Day 3's financial engine and Day 5's settlement work are built against an unconfirmed assumption.
- **Do not defer**: correct financial calculations, idempotent imports (now including settlement-batch/line-level idempotency, not just bank transactions), transaction auditability, new-villa configurability, effective management dates, the settlement allocation model (many-to-many via junction tables), bank reconciliation, production deployment, the explicit non-derived portfolio revenue target.
- **Do defer past Day 7 if needed**: **Channel Performance is the first report to cut** if OTA Settlement (Day 5) or Bank Reconciliation (Day 6) is at risk (`REPORTING_LOGIC.md` §9, confirmed Day-7-optional) — after that: speculative/modeled forecasting (Forecast Revenue — `REPORTING_LOGIC.md` §8, not a Day-7 field at all), advanced charts, an owner portal, mobile optimization, any OTA/PMS API integration, AI insights, automated fuzzy/ML reconciliation, multi-level approval workflows, pixel-perfect Excel formatting, animation polish, and every OTA settlement parser beyond the three confirmed Day-7 priority channels (Airbnb, Booking.com, Expedia).

## Day 1 — Foundation + production deployment

- Apply Jane's confirmed rules to schema/config rather than re-deriving them: seed `channel_payment_rules` with the four confirmed combinations (Bracha–Booking.com at 18% commission effective 2026-08-01, other-Booking.com, Expedia, other-OTAs-default — `DATA_MODEL.md` §4); set up the retired-Bracha-legacy-profile as an effective-dated `villa_tax_profile_assignments` row using the **confirmed cutover date, 2026-08-01** (`bracha_legacy_21pct` effective through 2026-07-31 inclusive, `standard` effective from 2026-08-01) — no default/placeholder date needed; create the explicit portfolio `revenue_targets` row (IDR 1,500,000,000/month, `villa_id IS NULL`) alongside the 33-villa (26 Aasha + 7 Balinest) master data. Raise the still-open `FINANCIAL_LOGIC.md` §10 items with Jane today (the full villa×channel `channel_payment_rules` matrix beyond the four confirmed rows; real OTA/BCA file formats) — these do not need to be *fully* resolved to start coding the foundation, but must not still be open by the time Day 3's financial engine is built. Confirm the `MISSING_PAYMENT_RULE` exception (no silent fallback for an unresolved channel/villa combination) is understood by whoever builds the financial engine before Day 3, since it changes how "unconfigured" is handled compared to earlier drafts of this plan.
- Next.js / TypeScript / Tailwind / shadcn/ui project shell; global layout and design tokens per `DESIGN_SYSTEM.md`.
- Supabase/PostgreSQL schema: villas (with immutable `villa_code`, `management_start_date`/`end_date`, `villa_group_id`), `villa_groups`/`villa_group_members`, owners, channels, `channel_payment_rules` (replacing the earlier separate `channel_commission_rules`/`channel_settlement_rules` design), `villa_tax_profiles`, `villa_tax_profile_assignments`, `room_villa_mapping`, `reservations` (including `expected_settlement_amount`/`expected_settlement_rule_id`), `reservation_status_history`, `daily_revenue` (including `revenue_type` and `revenue_source_status`), `revenue_overrides`, `revenue_targets`, `imports` (with `import_type` including the new `BASELINE_RESERVATION_SNAPSHOT`), `import_row_errors`, `reconciliation_exceptions` (including the new `MISSING_PAYMENT_RULE` type), `settings` — the full Day-7-relevant subset of `DATA_MODEL.md` (settlement/bank tables can be migrated now or on Day 5 — whichever fits the day better; do not block Day 1 on modeling tables not needed until Day 5).
- Basic authentication sufficient for internal single-operator use (not a multi-role system).
- Reproducible migrations (a migration tool/workflow in place from day one, not ad hoc schema edits).
- **First production deployment happens today**, even with an empty/seed database — the goal is proving the deploy pipeline works before anything depends on it.
- Villa/channel/master-data configuration pages, including the Add Villa / Edit Villa workflow (`DATA_MODEL.md` §1) — a new villa created here must be immediately visible in mapping dropdowns (there is not yet a Monthly Performance or Road to Target page to show it in yet, but the underlying query pattern should already be villa-list-driven, not hardcoded, from this first page onward).
- **End-of-day outcome: a live URL, a connected production database, working navigation, and real master data — a villa can be added through the UI and it persists in production.**

## Day 2 — Reservations

- **`[NEW]`** Baseline / Arrival Report Snapshot import (`IMPORT_LOGIC.md` §11) — the permanent `BASELINE_RESERVATION_SNAPSHOT` import type, built and run first thing today to seed the platform with every currently-in-house reservation for the 33-villa portfolio (the initial data migration), using the same reservations/`reservation_status_history` upsert mechanism as every other import, with no auto-cancel-by-omission. This is also the mechanism future new-villa onboarding will reuse (`DATA_MODEL.md` §1 villa onboarding step 7) — build it as a real, reusable import type today, not a throwaway one-off migration script.
- Bookings import and Cancellations import (`IMPORT_LOGIC.md` §1–§2), parse→validate→preview→commit, bulk upsert, against the production database.
- Villa/channel mapping resolution wired to the Day-1 configuration tables.
- All Bookings basic ledger (reservation fields only — revenue columns come Day 3): search, filter, server-side pagination.
- Idempotency tests: re-uploading the same Baseline/Bookings/Cancellations file produces zero unwanted duplicates and correct new/updated/unmatched counts.
- Deploy and verify in production.
- **End-of-day outcome: real Aasha reservation data (baseline + new bookings + cancellations) lives in the production database and is visible in All Bookings.**

## Day 3 — Revenue

- Room Revenue Breakdown import (`IMPORT_LOGIC.md` §3), reservation×stay-date grain, update-without-duplication.
- Financial engine (`FINANCIAL_LOGIC.md` §1–§6): commission via `channel_payment_rules` (`source_amount_basis`/`payment_model`), VAT, PB1 (confirmed formula unchanged, confirmed never withheld by any OTA), net revenue — built against the confirmed standard Gross→Commission→VAT→PB1→Net calculation, with the retired Bracha legacy profile (21% service-charge extraction + PB1 exemption) applied only for stay dates before **2026-08-01** via `villa_tax_profile_assignments`, never as the default for 2026-08-01 onward. **`[CORRECTED]`** Where no `channel_payment_rules` row resolves for a reservation, do not compute its commission/VAT/PB1/net using an assumed default — raise `MISSING_PAYMENT_RULE` and leave those figures incomplete/not final (`FINANCIAL_LOGIC.md` §5).
- **`[NEW — confirmed rule]`** Direct/TA manual override: implement the confirmed even-split allocation, `approved_manual_revenue / stay_nights` (`FINANCIAL_LOGIC.md` §7), as one clearly named, testable rule.
- **`[NEW — confirmed rule]`** Cancellation/no-show revenue: implement `revenue_type` (`STAY`/`CANCELLATION_FEE`/`NO_SHOW`/`REFUND`/`ADJUSTMENT`) on `daily_revenue` and the explicit decoupling of reservation status from revenue recognition (`FINANCIAL_LOGIC.md` §8/`DATA_MODEL.md` §2) — a cancelled reservation is not automatically zero net revenue.
- Daily revenue now populates All Bookings' financial columns (Gross Revenue, Commission, VAT, PB1, Net Revenue) and reservation drill-down.
- Validate calculated figures against the legacy Excel workbook for a sample period, for both the standard and the retired Bracha-legacy villa tax profiles, and against the confirmed real Booking.com worked example (`FINANCIAL_LOGIC.md` §2/§11).
- Deploy and verify in production.
- **End-of-day outcome: trustworthy, drillable reservation revenue in production.**

## Day 4 — Commercial reporting

- Monthly Performance: villa × date matrix, occupancy, room nights sold, ARR, net revenue, drill-down (`REPORTING_LOGIC.md` §2) — villa columns computed dynamically from `villas`, filtered by **management-date-window overlap with the reported month only** (`[CORRECTED]` — not `active`, which is a current-config filter, never a historical-reporting filter), never hardcoded.
- Summary: revenue, occupancy, ARR, room nights sold, current month through year-end, kept simple (no target/bonus-tier calculator — out of scope, `DATA_MODEL.md` §7).
- Road to Target (`REPORTING_LOGIC.md` §8): the confirmed Day-7 field list only — Portfolio Target (the explicit IDR 1,500,000,000/month `revenue_targets` row, never derived from villa targets), Currently Booked Revenue, Achievement %, Gap to Target, Average Required Pickup per Remaining Day, Remaining Available Room Nights, Required ARR on Remaining RN, at both portfolio and villa grain.
- **`[NEW — confirmed rule]`** Future/estimated daily revenue allocation: compute `ESTIMATED_BOOKED` figures for forward stay-dates at **query time only** (never persisted into `daily_revenue` — `DATA_MODEL.md` §9), feeding Currently Booked Revenue without touching actuals.
- **`[OPTIONAL — confirmed rule]`** Channel Performance (`REPORTING_LOGIC.md` §9): useful but not launch-critical — build it here if Monthly Performance/Summary/Road to Target left room today, but it is the **first item to cut** from Day 7 if this day (or Day 5/6) is at risk. Deferring it to Days 8–14 costs nothing else, since it introduces no new calculation logic of its own.
- **`[DO NOT BUILD — confirmed rule]`** Forecast Revenue / speculative pickup-modeled projections are explicitly out of Day-7 scope (`REPORTING_LOGIC.md` §8) — do not build this even as a "simple" version under deadline pressure; it is a Days-8–14-or-later candidate pending a methodology Jane approves.
- Deploy and verify in production.
- **End-of-day outcome: the Excel reporting workflow is substantially replaced for daily commercial use.**

## Day 5 — OTA Settlement

- `ota_settlement_batches` / `ota_settlement_lines` / `settlement_reservation_allocations` schema (if not already migrated Day 1), settlement behavior resolved via `channel_payment_rules` (`DATA_MODEL.md` §4) rather than a separate settlement-rules table.
- Generic settlement-import framework with per-channel column mapping and format adapters (`IMPORT_LOGIC.md` §8), built once and configured per channel.
- **`[CORRECTED — confirmed priority order]`** Build and test channels in this order: **1. Airbnb** (net remittance, PMS figure already net — fastest path to an end-to-end proof of the pipeline), **2. Booking.com** (exercises the confirmed commission/payment-service-fee/VAT deduction formula against the real worked example, split by Bracha vs. non-Bracha `channel_payment_rules`), **3. Expedia** (gross remittance, invoiced later — confirm the "Amount to be paid = IDR 0" settlement-file behavior against a real export). This reverses the earlier Booking.com-first assumption. If time runs short, Airbnb complete + Booking.com in progress is an acceptable Day-5 outcome; Expedia can slip to Days 8–14 before the other two would.
- **`[NEW — mandatory]`** Settlement/line-level idempotency: batches matched by `(channel_id, batch_reference)` or a deterministic hash; lines matched by `external_line_reference` or a per-line hash (`DATA_MODEL.md` §7/`IMPORT_LOGIC.md` §8) — re-uploading a settlement file must never duplicate a batch or line.
- Reservation matching/allocation, with unmatched lines surfaced, never discarded; a line resolving to a villa/channel with no matching `channel_payment_rules` row raises `MISSING_PAYMENT_RULE`, never a silent default.
- Expected-vs-settled comparison and status (`PENDING`/`PARTIALLY_SETTLED`/`SETTLED`/`VARIANCE`/`NEEDS_REVIEW`) on the Settlement Reconciliation page (`REPORTING_LOGIC.md` §10).
- Deploy and verify in production.
- **End-of-day outcome: revenue is reconciled against real OTA payout data for at least Airbnb, ideally also Booking.com.**

## Day 6 — Bank

- `bank_accounts` / `bank_imports` / `bank_transactions` / `settlement_bank_allocations` schema (if not already migrated).
- **`[CORRECTED — confirmed source]`** Bank mutation import (`IMPORT_LOGIC.md` §9) for **BCA**, the confirmed first bank-reconciliation source, with the mandatory idempotency strategy (`external_line_ref` or `dedupe_hash` unique constraint, `DATA_MODEL.md` §6/§8) — get a real BCA export sample as early in the day as possible (a structured CSV/XLSX export is strongly preferred over OCR; a machine-readable PDF/text export is an acceptable fallback; OCR is explicitly not a Day-7 path), since the dedup approach depends on what fields it actually carries.
- Settlement-to-bank matching: deterministic suggestions (reference → exact amount → channel+date-proximity+tolerance → description), auto-resolve only unambiguous exact matches, manual confirmation UI for everything else (`REPORTING_LOGIC.md` §11).
- Variance handling and the combined status set (`AWAITING_SETTLEMENT`/`AWAITING_BANK`/`MATCHED`/`PARTIAL`/`VARIANCE`/`UNMATCHED`/`NEEDS_REVIEW`).
- Deploy and verify in production.
- **End-of-day outcome: OTA payouts are traceable to actual bank receipts, with variances visible, in production.**

## Day 7 — Production hardening + launch

- End-to-end test of the full chain for real data: Booking → Daily Revenue → Expected Settlement → OTA Settlement → Bank Receipt, including the Reconciliation Dashboard (`REPORTING_LOGIC.md` §12) and Accounting Handoff view (§13).
- Compare a sample of results against known accounting examples Jane can verify by hand.
- Performance profiling: Monthly Performance and Road to Target month-changes feel instant; imports remain bulk/no-per-row; no full-dataset client-side recompute.
- Auth/permissions sanity check (still single-operator scope — just confirm no unintended open access).
- Import error handling review across all Day-7 import types (Baseline/Arrival Report Snapshot, Bookings, Cancellations, Room Revenue, OTA Settlement, Bank Mutation).
- Reconciliation exception testing: deliberately create a duplicate, an unknown villa, an unmatched settlement line, an unmatched bank transaction, and confirm each surfaces correctly rather than being silently absorbed.
- Production deployment verification (fresh deploy from a clean checkout works, not just "the currently-running instance happens to work").
- Backup/export: confirm the database has automated backups and that a manual export of core tables is possible if ever needed — this is basic backup *awareness*, not a disaster-recovery program.
- Fix launch-blocking defects found above; **non-blocking polish items get logged for Days 8–14, not fixed under launch-day time pressure.**
- **End-of-day outcome: live production v1 — Booking through Bank Reconciliation, real data, real URL.**

## Days 8–14 — Phase 2 (post-launch)

Once the production revenue-to-bank chain is live and in daily use, continue with the domains deferred from Day 7 (`PRODUCT_SPEC.md` §8):

### Days 8–10 — Expenses
- `vendors`, `expense_categories` (seeded, editable), `expenses`, `expense_allocations`, `expense_attachments` (`DATA_MODEL.md` §9).
- Expense entry (manual first; import per `IMPORT_LOGIC.md` §10 if time allows).
- `paid_by` / `borne_by` classification, kept as two distinct fields throughout, never collapsed.
- Expense allocation across villas/business units where an expense genuinely spans more than one.
- Expense Reporting page (`REPORTING_LOGIC.md` §14).

### Days 11–12 — Management fee + owner statements/payout
- `business_units`, `management_agreements` — configured per villa/owner as real contracts are confirmed (`FINANCIAL_LOGIC.md` §10), not defaulted to one portfolio-wide rate.
- `owner_statements` / `owner_statement_lines` / `statement_adjustments` / `accounting_periods`.
- Owner statement calculation per the configurable waterfall (`FINANCIAL_LOGIC.md` §11) — a villa without a confirmed management agreement does not get a guessed statement.
- `owner_payouts` / `owner_payout_statements`, with the `DRAFT → REVIEWED/APPROVED → PAID` lifecycle and the adjustment-not-rewrite rule for anything already approved/paid.

### Days 13–14 — Management finance + refinement
- Aasha P&L and Solio P&L (`REPORTING_LOGIC.md` §15).
- Owner-facing statement view/export.
- Excel export improvements for the Phase 2 reports (Expense Reporting, P&L, Owner Statement) if not already covered.
- General refinement pass on anything logged as non-blocking during Day 7 hardening.
- Balinest inclusion in settlement/expense/owner-finance tracking remains a candidate for **beyond** Day 14, not a Day 8–14 commitment — only take it on if the Aasha version of Phase 2 is solid with time to spare.

## Sequencing notes

- Day 3 (financial engine) is now largely unblocked by Jane's confirmed rules (standard Gross→Commission→VAT→PB1→Net for all villas including Bracha from 2026-08-01 onward; PB1 never withheld by any OTA; `channel_payment_rules` resolves the channel+villa-specific behavior, including the confirmed Bracha cutover date and 18% rate) — but the remaining open item, the full villa×channel payment-rule matrix beyond the four confirmed combinations, is still a hard prerequisite for Day 3, not a nice-to-have; guessing it (rather than raising `MISSING_PAYMENT_RULE` for what isn't yet configured) would be exactly the invented-business-rule risk `CLAUDE.md` prohibits, and it would propagate into every Day 5/6 settlement variance calculation.
- Day 5 (OTA Settlement) and Day 6 (Bank) are sequential by necessity — bank matching needs settlement batches to match against — but the schema for both can be migrated together on Day 1 if convenient, since neither's *data model* depends on the other being built first, only the *matching workflow* does.
- If Day 7 arrives with a genuine choice between "finish Bank Reconciliation's manual-match UI" and "polish Road to Target's forecast," the bank reconciliation work wins — it is explicitly in the do-not-defer list, Road to Target's forecast explicitly is not.
- Milestone-style verification still applies within this schedule even though it's day-boxed rather than milestone-boxed: don't start Day (N+1)'s work with Day N's import/calculation still silently broken. A day that slips should be flagged to Jane immediately (per `PRODUCT_SPEC.md`'s unattended-operation-adjacent principle of surfacing blockers rather than quietly falling behind), not absorbed by quietly cutting scope from a later day without saying so.
