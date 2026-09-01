# AASHA Villa Management Platform — Product Specification

Status: v0.5 — **final consistency correction pass** (documentation stage, no application code written yet)
Owner: Jane (Aasha Management)
Source material: `Aasha Revenue Report 20260823 copy.xlsx` (the "legacy workbook"), original business narrative (2026-08-30), design reference screenshot, the platform-expansion brief, the 7-day launch revision, Jane's confirmed business rules, and this final consistency correction.

This document is part of a documentation set that is authoritative for the build. See `CLAUDE.md` at the project root for the rules governing how these documents are to be used.

> **Revision note (v0.2):** Everything in v0.1 (the AASHA Revenue Portal — reservations, daily revenue, commission/VAT/PB1, Monthly Performance, Summary, reconciliation of *booking data*) is preserved below and remains correct. This revision wraps it inside a larger platform and adds three new domains (settlement/bank reconciliation, expenses, finance/owner reporting) that consume the same core data. Sections carried over unchanged from v0.1 are marked `[CARRIED OVER]`; new material is marked `[NEW]`.
>
> **Revision note (v0.3 — supersedes v0.2's timeline):** The build now targets a **7-day live production launch** covering Booking → Revenue → Expected Settlement → OTA Settlement → Bank Reconciliation, with Expenses/P&L/Owner Payout moved to a Days 8–14 Phase 2. §8 below and `IMPLEMENTATION_PLAN.md` reflect this; the four-domain architecture and end-to-end traceability principle (§2–§3) are unchanged — only the sequencing and launch scope changed, not the target architecture.
>
> **Revision note (v0.4 — Jane's confirmed business rules):** Several `NEEDS CONFIRMATION` items from prior revisions are now resolved (see `FINANCIAL_LOGIC.md` §10 for the full resolved/still-open register). Most visibly: the current managed portfolio is **26 Aasha villas + 7 Balinest villas = 33 villas total**, and the portfolio revenue target is an **explicit, independently-configured figure — IDR 1,500,000,000/month** — never derived by summing villa-level targets; Bracha's legacy 21%-service-charge/PB1-exemption treatment is **retired** going forward (standard calculation applies) and preserved only as an effective-dated historical profile; OTA settlement/commission behavior is resolved by **channel and, where needed, villa/villa-group**, via `channel_payment_rules`, not by channel alone; the confirmed OTA settlement priority order is **Airbnb → Booking.com → Expedia**; and a permanent Baseline/Arrival Report import type now exists for both initial migration and new-villa onboarding. §5, §6, §7, §8, and §10 below reflect these.
>
> **Revision note (v0.5 — final consistency correction):** The Bracha cutover date is confirmed as **2026-08-01** and Bracha's Booking.com rate as **18%** (both fully resolved, no longer open — §8 below); an unresolved `channel_payment_rules` lookup has **no silent fallback** — it raises `MISSING_PAYMENT_RULE` and the affected calculation is incomplete/not final, never guessed; management dates are reconfirmed inclusive on both ends everywhere; the Direct/TA override rule is stated with no residual "open question" wording; the `daily_revenue.gross_revenue` field is renamed `commercial_revenue_basis_amount`; and Channel Performance is marked Day-7 **optional** — the first report to defer if OTA Settlement or Bank Reconciliation is at risk.
>
> **Revision note (v0.6 — new requirement, documentation only):** §5 (Navigation) and §7 (Required outputs) add a new **Accounting / Revenue Breakdown reporting area** (Property Daily Revenue, Property Period Summary, Owner Revenue Report, Reservation-level nightly breakdown — full spec in `REPORTING_LOGIC.md` §13a), built on the same nightly allocation engine as every other report, no duplicated calculation path. It is a candidate for **Day 4 or later**, alongside the existing Day-7 Accounting Handoff view (§8, §13 in `REPORTING_LOGIC.md`) — not Day-7-critical, and exact day placement is left to `IMPLEMENTATION_PLAN.md`'s next sequencing pass. This revision adds the requirement only; nothing here authorizes starting the work before it is scheduled.

## 1. Why this exists `[CARRIED OVER, extended]`

Aasha Management runs **26 villas** in Seminyak, plus **7 Balinest villas** Jane also tracks for shared-owner commercial reporting — a **33-villa portfolio** overall, and the basis for the confirmed portfolio revenue target (§7). The booking/revenue data flow is:

```
PriceLabs (dynamic pricing) → STAAH (channel manager) → OTAs → STAAH → VHP Cloud (PMS)
```

The original problem was a manual Excel revenue-reporting workflow. That problem still exists and is still Phase 1 of this build. But the *operational* reality is bigger than revenue reporting: revenue recognized on paper is not the same as money in the bank, villas incur real expenses that different parties economically bear, and owners need a statement and a payout at the end of it all. `[NEW]` The end state, per Jane's direction, is:

```
Sales Target → Booking → Revenue → OTA Receivable → Settlement → Bank Receipt → Expenses → P&L → Owner Payout
```

AASHA Villa Management Platform is the single system that carries a dollar (rupiah) of villa revenue through that entire chain, on shared master data, so every number at the end is traceable back to the reservation and stay-date that produced it.

## 2. Product definition `[NEW — supersedes the v0.1 "single product" framing, does not change v0.1's internal logic]`

**This is a villa commercial, revenue reconciliation, operational expense, finance, and owner reporting platform**, built around four connected domains that share one core of master data (villas, owners, channels, commission rules) rather than existing as separate disconnected applications:

### A. Commercial / Sales `[CARRIED OVER from v0.1, renamed as a domain]`
Reservations, daily revenue, occupancy, ARR, revenue performance, revenue targets, road to target, channel performance.

### B. Revenue Reconciliation & Settlement `[NEW]`
Expected OTA receivable, OTA settlement, actual money received, bank mutation reconciliation, settlement discrepancies, accounting reconciliation. This is the layer that answers "did we actually get paid what we were owed?" — a question the legacy workbook and v0.1 of this spec never addressed; both stopped at *recognized* revenue.

### C. Operations & Expenses `[NEW]`
Aasha expenses, Solio expenses, owner-borne villa expenses, maintenance expenses, operational expenses.

### D. Finance & Owner Reporting `[NEW]`
Aasha P&L, Solio P&L, villa financial result, management fee, owner expenses, owner payout, owner statements.

## 3. End-to-end financial traceability `[NEW — the platform's central design requirement]`

```
Reservation
   ↓
Daily room revenue
   ↓
Gross booking revenue
   ↓
Commission / VAT / PB1
   ↓
Expected OTA receivable
   ↓
OTA settlement
   ↓
Bank receipt
   ↓
Revenue reconciliation
   ↓
Accounting
   ↓
Villa income
   ↓
Villa expenses
   ↓
Management fee / service charges
   ↓
Owner payout
```

No calculation anywhere in the platform is allowed to be an island. Every financial amount that matters must eventually carry: source, date, villa, reservation (where applicable), channel (where applicable), amount, calculation basis, reconciliation status, and audit history. This requirement is threaded through `DATA_MODEL.md` (allocation/junction tables instead of collapsed one-to-one links or JSON blobs), `FINANCIAL_LOGIC.md` (revenue, receivable, settlement, and cash receipt kept as distinct concepts even when their amounts coincide), and `REPORTING_LOGIC.md` (every report defines its drill-down explicitly).

## 4. Two portfolios: Aasha and Balinest `[CARRIED OVER]`

Unchanged from v0.1 — see §5 of the original spec, preserved: Aasha (VHP, incremental matching) vs. Balinest (Guesty, snapshot-replacement). Balinest's place in the *finance* domains (expenses/P&L/owner payout) is **out of scope for the two-week MVP** — Balinest involvement in this revision is limited to what v0.1 already covers (commercial reporting for owner-shared villas). Extending settlement/expense/payout tracking to Balinest is a natural post-MVP step once the Aasha version is proven, not a Phase 1–6 deliverable — see `IMPLEMENTATION_PLAN.md`.

## 5. Navigation `[NEW — revises v0.1 §6]`

```
OVERVIEW
  Dashboard                              Day 7

COMMERCIAL
  Monthly Performance                    Day 7
  Road to Target                         Day 7 (core fields; forecast may slip)
  All Bookings                           Day 7
  Channel Performance                    Day 7 (OPTIONAL — first deferrable report if OTA Settlement/Bank Reconciliation is at risk)

RECONCILIATION
  Booking Reconciliation                 Day 7 (carried over from v0.1)
  OTA Settlement                         Day 7
  Bank Reconciliation                    Day 7

ACCOUNTING                               `[NEW — candidate Day 4+, not yet scheduled]`
  Property Daily Revenue
  Property Period Summary
  Owner Revenue Report
  Reservation Nightly Breakdown

OPERATIONS
  Expenses                               Phase 2 (Days 8–10)

FINANCE
  P&L                                    Phase 2 (Days 13–14)
  Owner Statements                       Phase 2 (Days 11–12)
  Owner Payout                           Phase 2 (Days 11–12)

DATA
  Daily Upload                           Day 7
  Settlement Upload                      Day 7
  Bank Mutation Upload                   Day 7
  Import History                         Day 7

CONFIGURATION
  Villas                                 Day 1 (foundational — see §8)
  Owners                                 Day 1
  Villa Mapping                          Day 1–2
  Channel Payment Rules                  Day 1, extended Day 5 (channel + villa/group payment-model rules, replaces the earlier separate "commission rules"/"settlement rules" split)
  Revenue Targets                        Day 1 (explicit portfolio target) + Day 4 (villa-level targets, Road to Target UI)
  Expense Categories                     Phase 2
  Management Agreements                  Phase 2
  Settings                               Day 1
```

This is a conceptual map, not a page-creation mandate. Several conceptual items collapse into one page during implementation where that's cleaner (e.g., a single Reconciliation page with tabs for Booking/Settlement/Bank, rather than three separate routes, is an acceptable simplification). **Do not create a page merely because there is a menu item above** — build the page when its data exists and is usable, per the phased plan in `IMPLEMENTATION_PLAN.md`. Avoid unnecessary navigation complexity; this is still meant to feel dense and operational, not like an enterprise suite with dozens of thin screens.

## 6. Glossary `[CARRIED OVER, extended]`

Existing terms (ARR, RN, PB1, VAT, SOB, STAAH, VHP, Guesty, Direct/TA, System/Manual/Final Revenue, Reconciliation) are unchanged from v0.1 — see `FINANCIAL_LOGIC.md` for the formulas. New terms introduced by the platform-expansion and 7-day-launch revisions:

| Term | Meaning |
|---|---|
| Expected Receivable / Expected Settlement | The amount the platform calculates the OTA *should* pay Aasha for a reservation (or set of reservations) given its `channel_payment_rules`, before any OTA settlement report or bank receipt is checked against it. See `FINANCIAL_LOGIC.md` §5. |
| OTA Settlement | What the OTA *itself* reports having paid (or being about to pay), from an uploaded settlement/payout report — may bundle many reservations and net adjustments into one payout. |
| Bank Receipt / Bank Mutation | The actual transaction that lands in Aasha's bank account, from an uploaded bank statement. |
| Settlement Variance | Difference between Expected Receivable and OTA Settlement. |
| Bank Variance | Difference between OTA Settlement and Bank Receipt. |
| `paid_by` | Which economic entity (AASHA / SOLIO / OWNER) physically disbursed cash for an expense. |
| `borne_by` | Which economic entity ultimately absorbs the cost of an expense — may differ from `paid_by`. |
| Aasha | The villa management / commercial / guest-facing business entity. |
| Solio | The villa operational-services entity (housekeeping, engineering, maintenance, pool/garden and related service packages). |
| Management Fee | Aasha's contractual fee, charged to an owner, for managing their villa — rate and calculation basis are configurable per villa/contract (`management_agreements`). |
| Owner Statement | A periodic (monthly) statement to a villa owner showing revenue, deductions, expenses, and net payout for their villa(s). |
| Owner Payout | The actual disbursement (and its approval/payment lifecycle) corresponding to one or more owner statements. |
| Accounting Period | A month treated as open (editable) or closed (locked, requiring adjustments rather than edits) for finance purposes. |
| Business unit | AASHA or SOLIO, used to segment expenses/revenue for their respective P&Ls. Not the same as "owner" — owner-borne costs are attributed to a villa/owner, not a business unit. |

`[NEW — Jane's confirmed rules, this revision]` The financial vocabulary below (`FINANCIAL_LOGIC.md` §1 has the full definitions) makes explicit several distinctions that were previously blurred together as "revenue":

| Term | Meaning |
|---|---|
| Guest Gross Revenue | The full amount the guest paid for the stay, before any OTA deduction. |
| PMS / System Revenue | The revenue figure VHP itself reports for a reservation — which, depending on the channel's `source_amount_basis`, may already be net of the OTA's own commission (most channels) or may still be gross (Booking.com, Expedia). |
| `source_amount_basis` | A `channel_payment_rules` flag: `GROSS_BEFORE_OTA_DEDUCTIONS` (the PMS figure needs commission/fee/VAT deducted to reach Net Revenue) or `NET_AFTER_OTA_DEDUCTIONS` (the PMS figure already is Net Revenue). |
| OTA Commercial Deductions | Commission, payment service fee, and VAT on both — the amounts an OTA deducts before remitting, where applicable. |
| Net Revenue | Aasha's actual recognized revenue after all applicable OTA Commercial Deductions and PB1 — the number that flows into Monthly Performance/Summary/Road to Target. |
| Expected Settlement | What the platform expects to receive from the OTA, computed from the confirmed `payment_model` (`NET_REMITTANCE` or `GROSS_REMITTANCE_INVOICE_LATER`) — **not** always the same figure as Net Revenue (see `FINANCIAL_LOGIC.md` §5/§11 for why). |
| OTA Reported Settlement | What an uploaded OTA settlement/payout report actually shows for a batch/line. |
| Bank Received | What actually lands in the bank, from a bank mutation import. |
| PB1 | Aasha's own separate remittance to local (Bali) government, calculated from the commercial revenue basis — confirmed, this revision, to **never** be withheld or remitted by any OTA on Aasha's behalf, for any channel; it must never reduce Expected Settlement. |

## 7. Required outputs `[CARRIED OVER §3, extended]`

The original seven outputs (All Bookings, daily revenue, Monthly Performance, ARR, Portfolio Summary, Reconciliation, Excel export) remain required and unchanged in their own logic. Added by this revision:

8. **Road to Target** — villa and portfolio revenue-target tracking with achievement %, gap, forecast, and pickup (§ below and `REPORTING_LOGIC.md`).
9. **Channel Performance** — revenue/commission/occupancy by channel. **`[Confirmed rule]`** Day-7 optional — the first report to defer to Days 8–14 if OTA Settlement or Bank Reconciliation work is at risk.
10. **OTA Settlement Reconciliation** — expected vs. OTA-reported vs. bank-received, with variance and status.
11. **Bank Reconciliation** — bank transactions matched (or not) to settlements.
12. **Expense Reporting** — Aasha/Solio/Owner-borne expenses by category, villa, and period.
13. **Aasha P&L** and **Solio P&L**.
14. **Owner Statement** and **Owner Payout**, per villa/owner/period.
15. **`[NEW]`** **Accounting / Revenue Breakdown reporting area** — Property Daily Revenue, Property Period Summary, Owner Revenue Report, and a standalone Reservation-level nightly breakdown, all reusing the same nightly allocation engine and source tables as items 1–11 above, no separate calculation path (`REPORTING_LOGIC.md` §13a). Candidate for Day 4 or later; not Day-7-critical.

## 8. Day-7 production launch vs. Days 8–14 Phase 2 `[REVISED — supersedes the earlier "two-week MVP" framing; see `IMPLEMENTATION_PLAN.md` for the day-by-day sequence]`

### Must work by end of Day 7 (live, deployed, in production)
- Live hosted URL, connected to the production database, with basic internal auth, reproducible migrations, and basic backup awareness — deployed incrementally starting **Day 1**, not held until the end
- Dynamic, UI-managed villa/owner/channel/payment-rule/tax-profile/bank-account master data — **no hardcoded villas anywhere**; villas addable from the UI (with an immutable `villa_code`, and `management_start_date`/`management_end_date` respected by occupancy/reporting, with historical reports including a villa whenever the reported period overlaps that window regardless of the villa's *current* `active` status) and immediately usable everywhere. Villa onboarding includes seeding the villa's existing forward bookings via the permanent Baseline/Arrival Report Snapshot import (`IMPORT_LOGIC.md` §11), the same mechanism used for the initial 33-villa data migration.
- Baseline/Arrival Report Snapshot import (initial migration + reusable new-villa onboarding step), Bookings import, Cancellation import, Room Revenue import (largely unchanged from v0.1); Reservation Change Log automation may fall back to manual review if not reliable by Day 7
- All Bookings ledger (search, filter, server-side pagination, drill-down, financial breakdown), including reservations whose recognized revenue survives cancellation/no-show (`revenue_type` decoupled from `reservations.status` — confirmed this revision)
- Commission / VAT / PB1 revenue calculations, resolved by **channel and, where needed, villa/villa-group** via `channel_payment_rules` (confirmed this revision, including the Bracha legacy→standard cutover date, **2026-08-01**, and Bracha's Booking.com rate, **18%** — the full villa×channel rule matrix beyond the four confirmed combinations remains to be finalized on **Day 1**, not discovered later; any unresolved combination raises `MISSING_PAYMENT_RULE` rather than defaulting silently)
- Monthly Performance, Summary (kept simple — no target/bonus-tier calculator)
- Road to Target (villa + explicit portfolio target — confirmed IDR 1,500,000,000/month for the 33-villa portfolio, never derived from villa-level targets), current month, using the confirmed Day-7 field list (Portfolio/Villa Target, Currently Booked Revenue, Achievement %, Gap to Target, Average Required Pickup per Remaining Day, Remaining Available Room Nights, Required ARR on Remaining RN) — modeled/speculative Forecast Revenue is explicitly deferred, not a Day-7 field
- **Expected Settlement** as a concept distinct from Net Revenue, computed via `channel_payment_rules`' confirmed `payment_model` (`NET_REMITTANCE` / `GROSS_REMITTANCE_INVOICE_LATER`)
- **OTA Settlement**: generic import framework with format adapters, built and tested in the confirmed priority order **Airbnb → Booking.com → Expedia**, batch/line/allocation model (many-to-many, never one-to-one) with mandatory batch- and line-level idempotency, expected-vs-settled variance and status
- **Bank Mutation import**, for **BCA** (confirmed first bank-reconciliation source), with a real idempotency strategy (no duplicate transactions on re-upload) and a strong preference for structured CSV/XLSX exports over OCR
- **Bank Reconciliation**: settlement-to-bank matching (deterministic suggestions, manual confirmation for anything ambiguous), variance visibility, one-to-many/many-to-one allocation
- Reconciliation Dashboard spanning booking/revenue/settlement/bank exception counts, each linking through to the underlying items
- Accounting Handoff view (Revenue Recognized / Expected Receivable / OTA Settlement / Cash Received / Difference / Status, filterable, exportable)
- Excel export of the core reports if feasible without threatening the Day-7 date — correct tabular data takes priority over exact legacy-workbook styling if a choice must be made

### Moves to Days 8–14 Phase 2 (post-launch, not Day-7 blockers)
- **`[NEW]`** Accounting / Revenue Breakdown reporting area (Property Daily Revenue, Property Period Summary, Owner Revenue Report, Reservation-level nightly breakdown — `REPORTING_LOGIC.md` §13a) — a candidate for Day 4 (it depends only on the same `daily_revenue`/`reservations` queries Monthly Performance already uses, so it could land as early as Day 4 if that day has room) but not a Day-7 launch blocker either way; exact placement is `IMPLEMENTATION_PLAN.md`'s call, not committed by this spec revision
- Expense recording, `paid_by`/`borne_by` classification, expense allocation, vendors, expense categories (Days 8–10)
- Management agreements (configurable fee %/basis per villa/contract), management fee calculation, owner statements, owner payouts (Days 11–12)
- Aasha P&L, Solio P&L, owner-facing statement export, Excel export refinements for the Phase 2 reports (Days 13–14)
- Balinest inclusion in settlement/expense/owner-finance tracking (stays commercial-reporting-only through at least Day 14)

### Deferred beyond both (post-MVP, no committed date)
- Automatic API integrations with PriceLabs / STAAH / VHP / Guesty / OTA extranets (file-upload only by design; the import framework is built so an API can replace a file feed later without redesigning the accounting model — `IMPORT_LOGIC.md` §8)
- Sophisticated fuzzy/ML bank matching (Day 7 ships deterministic suggestion + manual confirmation only)
- Modeled revenue forecasting beyond a simple, clearly-labeled projection
- Owner portal (external self-service access) — statements are produced for Jane to send manually
- Multi-level approval workflows — single-step approval throughout
- Statutory accounting / general ledger — this platform is management accounting and reconciliation; statutory bookkeeping stays in whatever system/accountant Jane already uses
- Extensive mobile optimization (desktop-first)
- Advanced charts/BI beyond the dense tabular views this spec calls for
- AI-driven insights

## 9. Out of scope (unchanged from v0.1, extended)

All of v0.1 §8 stands. Additionally out of scope for this platform at any stage without a separate decision: replacing Jane's actual bank/accounting software, and building a full enterprise audit/workflow framework (see `CLAUDE.md` §"Auditability" for the deliberately limited scope of what's tracked).

## 10. Success criteria `[CARRIED OVER §9, extended]`

**Day 7**: the platform is live in production, and for a representative sample of real reservations, Jane can trace Booking → Revenue → Expected Settlement → OTA Settlement → Bank Receipt end to end on screen, with every variance (settlement or bank) visibly explained rather than hidden — this is the Day-7 acceptance test, not a demo of individual pages in isolation. The commercial-reporting figures (All Bookings, Monthly Performance, Summary) reconcile against the legacy workbook for a sample period, with every intentional deviation from `FINANCIAL_LOGIC.md` §10 explicitly resolved and confirmed by Jane, not silently "improved."

**Days 8–14**: for the settlement/expense/finance domains, since there is no legacy system to reconcile against, success means every number produced by Expenses, P&L, or Owner Statement can be traced, on screen, back to the specific reservation, expense record, or agreement that produced it, and Jane confirms the calculation logic behind at least one full worked example per domain before it's considered validated (Day 14).
