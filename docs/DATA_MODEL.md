# Data Model

> **Revision history:** v0.1 established the reservation/revenue core (villas, channels, reservations, `daily_revenue`). v0.2 added the settlement/bank/expense/owner-finance layer. v0.3 added `villa_code`, management-effective dates, and settlement/bank idempotency detail for the 7-day launch. v0.4 incorporated Jane's confirmed business rules: Bracha's legacy tax treatment is retired to an effective-dated historical profile; commission is superseded by a channel-**and-villa**-resolvable `channel_payment_rules` model; PB1 is confirmed never withheld by any OTA; the portfolio revenue target is an explicit configurable value, not derived from villa targets; a permanent baseline/Arrival-Report import type is added; cancellation/no-show revenue is decoupled from occupied-night status; and future/estimated daily revenue is kept explicitly distinct from actual daily revenue. **v0.5 (this revision — final consistency pass)**: the Bracha legacy→standard cutover date is confirmed as **2026-08-01** and Bracha's Booking.com commission rate is confirmed at **18%** (§1/§4); an unresolved `channel_payment_rules` lookup now has **no silent fallback** — it raises `MISSING_PAYMENT_RULE` and the affected calculation is incomplete/not final, never a guessed default (§4/§8); `daily_revenue.gross_revenue` is renamed to `daily_revenue.commercial_revenue_basis_amount` throughout, since the stored amount may be either gross or already-net depending on `source_amount_basis` (§2); management dates are reconfirmed as inclusive on both ends everywhere they're used; and the Direct/TA override daily-allocation rule is stated as settled, with no remaining "open question" framing. This file remains **self-contained** — every table referenced elsewhere is fully defined here, not deferred to an earlier revision's text. **v0.6 (this revision — confirmed nightly allocation regimes):** `daily_revenue.reservation_id` is now nullable (`DAILY_REVENUE_WITHOUT_BOOKING`); `commission`/`commission_vat`/`pb1`/`net_revenue` are now nullable, since a correctly-computed `0` and "not yet computed" (`MISSING_PAYMENT_RULE`) need to be distinguishable; a new `service_charge_extraction` column keeps the retired Bracha legacy deduction separately traceable from ordinary channel commission; and a new `ROOM_REVENUE_TOTAL_MISMATCH` reconciliation exception type is added (§8) — see `FINANCIAL_LOGIC.md` §7a for the confirmed rule these changes implement.
>
> **v0.8 (this revision — Booking Date correction):** §2's `booking_date` field description is corrected. It remains schema-nullable (Baseline/Arrival Report Snapshot and Balinest/Guesty genuinely have no creation-date source column to supply it), but for the New Bookings (VHP) import path it is required data — `Created Date` from that source file — and once stored, a later import/update for the same reservation must never overwrite a known `booking_date` with a null it doesn't itself carry. No schema/column change; this is an import-write-path correction (`IMPORT_LOGIC.md` §1/§11).

Grain discipline (unchanged since v0.1): the reporting engine's finest grain is `Reservation × Villa × Stay Date`. Everything else — settlement, bank, expenses, owner finance — links back to that grain via foreign keys or allocation tables, never via free-text villa/owner/channel names repeated across financial tables.

## 1. Villas, owners, and portfolio structure

### `villas`

Villas are dynamic, UI-managed master data. **No page, calculation, report column, or import may hardcode a villa name or a fixed villa list.** Current portfolio: **26 Aasha + 7 Balinest = 33 villas**, with more expected — this count is configuration, entered once, never assumed by code.

| Field | Type | Notes |
|---|---|---|
| id | uuid/pk | surrogate key for all foreign keys |
| villa_code | text, unique, **immutable once assigned** | short, human-assigned stable identifier (e.g. `AMN1`, `BRC1`), used in mapping/import configuration instead of the display name. Villa names may change; `villa_code` and `id` never do — write-once, enforced at the application layer. |
| name | text | display name, e.g. `Bracha 1BD`, `Casa Amani 1` — not relied upon as a key anywhere |
| portfolio | enum(`AASHA`,`BALINEST`) | |
| unit_count | int | occupancy % denominator |
| owner_id | fk → owners.id, nullable | |
| active | boolean | soft on/off switch for **current** configuration surfaces (dropdowns, new-import mapping) — independent of the management-date window below. **Historical reporting does not filter on `active`** — see §11 "Villa visibility rules." |
| management_start_date | date | first managed date/night, **inclusive**. Governs occupancy-denominator and reporting inclusion for the period a villa is actually under management. |
| management_end_date | date, nullable | last managed date/night, **inclusive**; null = still under management |
| business_unit_id | fk → business_units.id, nullable | for villa-level cost-center rollups, Phase 2 |
| villa_group_id | fk → villa_groups.id, nullable | optional grouping used by `channel_payment_rules` (§4) to target a set of villas at once (e.g. "Bracha") without one rule row per villa; a villa may also be targeted individually regardless of group membership |

### `villa_groups` / `villa_group_members` `[NEW]`

Lets a payment/commission/tax rule target a named set of villas (e.g. "Bracha") in one place instead of one row per villa.

**`villa_groups`**: `id`, `name` (e.g. `Bracha`), `notes`.
**`villa_group_members`**: `villa_group_id` fk, `villa_id` fk — a villa may belong to at most one group in the common case, but the join table doesn't structurally forbid more than one if a future need arises.

### `villa_tax_profiles`

Generalizes villa-specific tax/PB1 treatment so it is never hardcoded by villa name string in application code.

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| name | text | e.g. `standard`, `bracha_legacy_21pct` |
| pb1_applicable | boolean | `true` for the current `standard` profile (applies to all villas, Bracha included, per the confirmed rule — see `FINANCIAL_LOGIC.md` §3); `false` only in the retired `bracha_legacy_21pct` historical profile |
| service_charge_extraction_pct | decimal, nullable | `0.21` only in `bracha_legacy_21pct`; null/unused in `standard` |
| notes | text | |

### `villa_tax_profile_assignments` `[NEW — replaces a static `villas.tax_profile_id`]`

Tax-profile assignment is now **effective-dated**, not a single static field on `villas`, specifically so the retired Bracha legacy profile can still be selected when generating a report for a historical period, while every current/future period uses the standard profile automatically.

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| villa_id | fk → villas.id | |
| tax_profile_id | fk → villa_tax_profiles.id | |
| effective_from | date | |
| effective_to | date, nullable | null = current/ongoing |
| notes | text | |

Resolution: for a given villa and stay-date, the applicable profile is the row whose `[effective_from, effective_to]` (inclusive of both ends) contains that date. **Confirmed cutover date: 2026-08-01.** Every villa, Bracha included, is assigned `standard` effective from `2026-08-01` onward. Bracha's villas additionally carry one `bracha_legacy_21pct` row with `effective_to = 2026-07-31`, covering every stay date up to and including that day, so a historical-period report still reproduces the old workbook's numbers exactly for stay dates before the cutover. This date is no longer `NEEDS CONFIRMATION` — seed it directly, no default/placeholder logic required.

### `owners`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| name | text | |
| contact_email, contact_phone | text, nullable | for eventual statement delivery — manual send in v1, no owner portal |
| default_bank_account_ref | text, nullable | free-text payout reference until/unless a full external-bank-account model is needed — **NEEDS CONFIRMATION** whether the owner's *receiving* bank account needs first-class modeling (the `bank_accounts` table in §6 models Aasha's own accounts, not owners') |
| notes | text | |

### `[NEW]` Villa onboarding workflow (Configuration → Villas)

A single Add Villa / Edit Villa form (not a wizard): name, `villa_code` (assigned once, locked), portfolio, owner, unit count, `management_start_date`/`end_date`, villa group (if applicable), VHP room-number/room-type mappings (`room_villa_mapping`, §2), channel/payment/tax rules (`channel_payment_rules` + `villa_tax_profile_assignments`) where they need a villa-specific override, and a revenue target (`revenue_targets`, §9) once that module exists. Saving a villa makes it immediately selectable everywhere villas are listed — every such surface queries `villas` at render/report time, never a cached or hardcoded list. New-villa onboarding order, per the confirmed workflow: (1) create villa, (2) set `management_start_date`, (3) assign owner, (4) configure room mapping, (5) configure channel/payment/tax rules, (6) configure monthly target, (7) import a Baseline/Arrival Report snapshot for any existing forward bookings (§10), (8) begin normal daily movement imports.

## 2. Reservation ledger (Aasha / VHP)

### `channels`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| raw_name | text | as it appears in the source export (e.g. `AGODA`, `[STAAH BRACHA], T&T`) |
| display_name | text | normalized name (e.g. `BOOKING.COM`) |
| channel_type | enum(`OTA`,`TRAVEL_AGENT`,`DIRECT`) | |
| active | boolean | |

An unmapped `raw_name` raises `UNKNOWN_CHANNEL` in reconciliation (§8), never defaults silently.

### `room_villa_mapping`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| portfolio | enum(`AASHA`,`BALINEST`) | |
| match_type | enum(`ROOM_NUMBER`,`ROOM_TYPE`,`LISTING`) | which raw field this row matches on |
| raw_value | text | e.g. `101`, `1BRS`, or a Guesty listing name |
| villa_id | fk → villas.id | |
| priority | int | room-number match wins over room-type fallback |

An unmapped `raw_value` raises `UNKNOWN_VILLA`, never defaults to `#N/A` silently.

### `reservations`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| reservation_number | text, unique per portfolio | primary matching key |
| portfolio | enum(`AASHA`,`BALINEST`) | |
| channel_id | fk → channels.id | |
| villa_id | fk → villas.id, nullable | nullable + reconciliation flag if unresolved |
| room_number, room_type | text | |
| guest_name | text | |
| booking_date | date, nullable | `[CORRECTED — v0.8]` **Required data for the New Bookings (VHP) import path** — populated from that source file's `Created Date` column (`IMPORT_LOGIC.md` §1); this is the reservation's creation date, and future Pickup/booking-velocity reporting (`REPORTING_LOGIC.md` §8) must anchor on it. Column stays nullable at the schema level because Baseline/Arrival Report Snapshot and Balinest/Guesty exports genuinely carry no creation-date column to source it from (§10/§5 respectively) — but once a reservation has a known `booking_date`, a later import/update for the same reservation must never blank it out just because that later source doesn't supply one; preserve the existing value instead of overwriting with null. |
| arrival_date, departure_date | date | |
| nights | int | |
| adults, children | int | |
| status | enum(`ACTIVE`,`CANCELLED`) | current state; audit trail in `reservation_status_history` |
| system_gross_revenue | numeric | from VHP rate data — **may be gross or already-net-of-OTA-commission depending on channel**; see `source_amount_basis` in `channel_payment_rules` (§4). Never itself relabeled — the platform tracks which basis it is, rather than assuming |
| manual_revenue_override | numeric, nullable | see `revenue_overrides`, §3 |
| override_status | enum(`NONE`,`PENDING`,`APPROVED`,`REJECTED`) | |
| final_gross_revenue | numeric, derived | override if `APPROVED`, else `system_gross_revenue` |
| `[NEW]` expected_settlement_amount | numeric, nullable | computed from the applicable `channel_payment_rules` row (§4/§5) — **not** copied from net revenue. Stored/refreshed whenever the reservation's `daily_revenue` changes, since it's the left-hand side of every settlement/bank variance comparison and must be fast to query. **`[CORRECTED]`** Null/unset whenever no `channel_payment_rules` row resolves for this reservation — a `MISSING_PAYMENT_RULE` exception is open in that case (§8/§4), and this field must never be populated with a guessed value in the meantime. |
| `[NEW]` expected_settlement_rule_id | fk → channel_payment_rules.id | which rule produced the above, for traceability |
| source_file_import_id | fk → imports.id | |
| created_at, updated_at | | |

Indexes: unique(`portfolio`,`reservation_number`); (`villa_id`,`arrival_date`,`departure_date`); (`status`).

### `reservation_status_history`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| reservation_id | fk → reservations.id | |
| status | enum(`ACTIVE`,`CANCELLED`) | |
| effective_at | timestamptz | |
| reason | text, nullable | |
| source_import_id | fk → imports.id | |
| created_at | | |

### `daily_revenue`

The authoritative **actual** daily grain: Reservation × Villa × Stay Date.

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| reservation_id | fk → reservations.id, **nullable `[NEW]`** | null for a Room Revenue row whose reservation number doesn't match anything yet (`DAILY_REVENUE_WITHOUT_BOOKING`, §8) — `villa_id` is still resolved independently via `room_villa_mapping` so the row remains usable |
| villa_id | fk → villas.id | denormalized for query performance |
| stay_date | date | |
| room_number | text | as of this import |
| `[NEW]` revenue_type | enum(`STAY`,`CANCELLATION_FEE`,`NO_SHOW`,`REFUND`,`ADJUSTMENT`) | default `STAY`. **Confirmed: a cancelled reservation may still carry recognized revenue** — a `CANCELLATION_FEE`/`NO_SHOW` row is not zeroed just because `reservations.status = CANCELLED`. Occupancy counts only ever come from the reservation's status/date-range (§11), never from this field, so revenue and occupancy stay fully decoupled. |
| `[NEW]` revenue_source_status | enum(`ACTUAL_ROOM_REVENUE`,`ESTIMATED_BOOKED`) | `ACTUAL_ROOM_REVENUE` for rows from a real Room Revenue Breakdown import; `ESTIMATED_BOOKED` never appears as a *stored* row here — estimated future-night figures are computed at query time for Road to Target (§9) and explicitly labeled there, precisely so an estimate can never silently sit in this table and be mistaken for, or overwritten as, an actual. See §9 "Future booked revenue" for how the two are combined without mixing. |
| `[RENAMED]` commercial_revenue_basis_amount | numeric | the nightly amount this reservation's channel actually reports — **gross or already-net, depending on `source_amount_basis`** (`channel_payment_rules`, §4). Previously named `gross_revenue`; renamed because that name implied the figure is always pre-deduction, which is false for `NET_AFTER_OTA_DEDUCTIONS` channels (Agoda, Airbnb, Trip.com, Tiket.com, etc.) — `source_amount_basis` is what actually defines what this amount represents, this field is just the number. |
| commission | numeric, **nullable `[v0.6]`** | computed; `0` (not merely absent) when `source_amount_basis = NET_AFTER_OTA_DEDUCTIONS`, since there's nothing left to deduct; **`null`** specifically means "not yet computed" (`MISSING_PAYMENT_RULE` open for this reservation) — distinct from a correctly-computed `0`, which the original `NOT NULL DEFAULT 0` couldn't represent (`CLAUDE.md` rule 20). Stores commission + `payment_service_fee` combined — `channel_payment_rules` keeps the two rates separately configured/drillable, so nothing is lost by combining them here. |
| commission_vat | numeric, nullable `[v0.6]` | computed ("VAT on OTA Commercial Deductions"); same null-means-incomplete convention as `commission` |
| `[NEW — v0.6]` service_charge_extraction | numeric, nullable | the retired Bracha legacy profile's 21%-inclusive extraction (`amount − amount/(1+service_charge_extraction_pct)`, `FINANCIAL_LOGIC.md` §3) — its own column rather than folded into `commission`, since it's a villa-tax-profile deduction, not a channel deduction; collapsing them would misrepresent an OTA's actual commission line when drilling down |
| pb1 | numeric, nullable `[v0.6]` | computed; same null-means-incomplete convention |
| net_revenue | numeric, nullable `[v0.6]` | derived: `commercial_revenue_basis_amount − commission − commission_vat − service_charge_extraction − pb1`; same null-means-incomplete convention |
| source_import_id | fk → imports.id | |
| created_at, updated_at | | |

Unique constraint: (`reservation_id`, `stay_date`, `revenue_type`) — allows a `STAY` row and, separately, a `CANCELLATION_FEE` row to coexist for the same reservation/date if that's ever how a fee is posted, while still preventing duplicate `STAY` rows on re-upload. Indexes: (`villa_id`, `stay_date`); (`stay_date`).

## 3. Manual revenue override (Direct / Travel Agent)

### `revenue_overrides`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| reservation_id | fk → reservations.id, unique | |
| system_revenue | numeric | copied at creation, never mutated — the original system value is never destroyed |
| manual_revenue | numeric | |
| final_revenue | numeric | |
| status | enum(`PENDING`,`APPROVED`,`REJECTED`) | |
| notes | text | |
| created_by, approved_by, created_at, approved_at | | |

**Confirmed daily allocation rule** (`FINANCIAL_LOGIC.md` §7): `daily_revenue` rows for an approved override are generated as an **even split** — `approved_manual_revenue / stay_nights` — one `STAY`-type row per night. This is a deliberate business rule (Direct/TA bookings use flat agreed rates, not dynamic nightly pricing), not a fallback — do not scale by any nightly proportion.

## 4. Channel payment rules `[REVISED — replaces the earlier `channel_commission_rules` / `channel_settlement_rules` pair with one unified, villa-resolvable model]`

Settlement and commission behavior are confirmed to vary by **channel and villa/property/payment setup together**, not by channel alone (the clearest case: Bracha's Booking.com behavior differs from every other Booking.com property). One table now drives both the Net Revenue deduction calculation and the Expected Settlement calculation, resolved by channel + optional villa/villa-group + effective date, with more specific rules overriding more general ones.

### `channel_payment_rules`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| channel_id | fk → channels.id | |
| villa_id | fk → villas.id, nullable | a villa-specific override |
| villa_group_id | fk → villa_groups.id, nullable | a group-level override (e.g. all Bracha villas at once) |
| `source_amount_basis` | enum(`GROSS_BEFORE_OTA_DEDUCTIONS`,`NET_AFTER_OTA_DEDUCTIONS`) | whether this channel's PMS/System Revenue figure is the guest's gross payment or already net of the OTA's own commission — the flag that resolves the old "why is commission 0% for some channels" question explicitly, per channel, rather than via a magic rate |
| `payment_model` | enum(`NET_REMITTANCE`,`GROSS_REMITTANCE_INVOICE_LATER`) | see `FINANCIAL_LOGIC.md` §4 |
| commission_rate | numeric, nullable | meaningful only when `source_amount_basis = GROSS_BEFORE_OTA_DEDUCTIONS` |
| payment_service_fee_rate | numeric, nullable | e.g. Booking.com's confirmed 2.3% — kept as its own line, distinct from commission, so a settlement line can be drilled down to match a real OTA statement's own line items |
| commission_vat_rate | numeric, default 0.11 | applied to the **sum** of commission + payment service fee (confirmed via the real Booking.com example, `FINANCIAL_LOGIC.md` §2) |
| `pb1_withheld_by_ota` | boolean, **default `false`** | confirmed: no OTA withholds PB1; PB1 is Aasha's own separate remittance to local government and never reduces Expected Settlement, regardless of payment model |
| effective_from | date | |
| effective_to | date, nullable | |
| priority | int, default 0 | tie-break when more than one rule could otherwise match (villa-specific beats group beats channel-default by construction of the resolution query; `priority` only matters among rules at the same specificity level) |
| notes | text | |

**Resolution order** for a given reservation (channel_id, villa_id, booking/stay date): the most specific matching, currently-effective row wins — villa-specific > villa-group > channel-wide default (`villa_id IS NULL AND villa_group_id IS NULL`). **`[CORRECTED — no silent fallback]`** A reservation whose channel+villa+date combination has no matching rule at all must **not** be assumed to be `NET_REMITTANCE`/`NET_AFTER_OTA_DEDUCTIONS` or any other default model. It raises `MISSING_PAYMENT_RULE` (§8) and every calculation downstream of it — `expected_settlement_amount`, `daily_revenue.commission`/`commission_vat`/`pb1`/`net_revenue` for that reservation's stay-dates — is left unset/flagged and treated as **incomplete, not final**, until a rule is configured and the calculation is (re)run. This is a hard stop, not a display nicety: an incomplete reservation must not appear in Monthly Performance/Summary/Road to Target/Settlement Reconciliation totals as if it had a real, confirmed number. The four confirmed seed rows below exist precisely so this gap doesn't appear for every reservation on day one — they are real configured rules, not a fallback.

### Confirmed seed data (`FINANCIAL_LOGIC.md` §6 — the values, not just the model, are now known for these)

| Channel | Villa scope | `source_amount_basis` | `payment_model` | commission_rate | payment_service_fee_rate | pb1_withheld_by_ota |
|---|---|---|---|---|---|---|
| BOOKING.COM | `villa_group = Bracha`, `effective_from = 2026-08-01` | `GROSS_BEFORE_OTA_DEDUCTIONS` | `GROSS_REMITTANCE_INVOICE_LATER` | **18% (confirmed)** | — | `false` |
| BOOKING.COM | default (all other villas) | `GROSS_BEFORE_OTA_DEDUCTIONS` | `NET_REMITTANCE` | 15% | 2.3% | `false` |
| EXPEDIA | default (all villas) | `GROSS_BEFORE_OTA_DEDUCTIONS` | `GROSS_REMITTANCE_INVOICE_LATER` | 15% | — | `false` |
| AGODA, AIRBNB, TRIP.COM, TIKET.COM, and travel agents generally | default | `NET_AFTER_OTA_DEDUCTIONS` | `NET_REMITTANCE` | 0 (not applicable — already net) | — | `false` |

All four rows use `commission_vat_rate = 0.11` (the field default). **`[CORRECTED]`** A channel/villa combination **not** covered by one of these four rows (or a future confirmed addition) has **no fallback row and no assumed shape** — see the resolution-order paragraph above: it raises `MISSING_PAYMENT_RULE` and its financial figures stay incomplete/not final until a rule is configured. Do not seed a catch-all "default to already-net" row to paper over a gap; a genuinely new channel/villa combination is exactly the case this exception exists to surface (`FINANCIAL_LOGIC.md` §10 item 16 remains open — the full villa×channel matrix beyond these four rows still needs Jane's input).

## 5. Imports / uploads (audit trail)

### `imports`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| import_type | enum(`BASELINE_RESERVATION_SNAPSHOT`,`NEW_BOOKINGS`,`CANCELLATIONS`,`ROOM_REVENUE`,`CHANGE_LOG`,`BALINEST_SNAPSHOT`,`OTA_SETTLEMENT`,`BANK_MUTATION`,`EXPENSE`) | `[NEW]` `BASELINE_RESERVATION_SNAPSHOT` added this revision, §10 |
| filename | text | |
| uploaded_at | timestamptz | |
| row_count, new_count, updated_count, ignored_count, unmatched_count, error_count | int | |
| status | enum(`PENDING_REVIEW`,`COMMITTED`,`FAILED`) | |
| raw_file_ref | text/blob ref | |
| created_by | | |

### `import_row_errors`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| import_id | fk → imports.id | |
| row_number | int | |
| raw_data | jsonb | |
| error_type, message | text | |

## 6. Bank reconciliation

### `bank_accounts`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| bank_name | text | **BCA is the confirmed first bank reconciliation source** — modeled as data, not assumed in code, so a second bank/account is just another row |
| account_name | text | |
| account_number_masked | text | masked/last-4 only |
| currency | text | |
| business_unit_id | fk → business_units.id, nullable | |
| notes | text | |

### `bank_imports`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| bank_account_id | fk → bank_accounts.id | |
| import_id | fk → imports.id | |
| statement_period_start, statement_period_end | date | |
| imported_at | timestamptz | |

### `bank_transactions`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| bank_account_id | fk → bank_accounts.id | |
| transaction_date | date | |
| value_date | date, nullable | |
| description | text | raw statement text — for BCA, this is confirmed to contain useful matching signal (e.g. "Booking.com" appearing directly in the description of a real sample transaction) |
| reference | text, nullable | strongest available match signal when present |
| debit, credit | numeric, nullable | |
| amount | numeric | signed, derived from debit/credit |
| running_balance | numeric, nullable | |
| source_import_id | fk → imports.id | |
| reconciliation_status | enum(`UNMATCHED`,`PARTIALLY_MATCHED`,`MATCHED`,`NEEDS_REVIEW`) | this row's own matching state |
| external_line_ref | text, nullable | a bank-provided line/sequence number, when available — the strongest dedup key |
| dedupe_hash | text, generated | deterministic hash of `(bank_account_id, transaction_date, amount, description, reference)`, used when `external_line_ref` is absent |

**Idempotency (mandatory):** unique constraint on `(bank_account_id, external_line_ref)` when available, else `(bank_account_id, dedupe_hash)`. Re-importing a statement period matches existing rows on this key and counts them `ignored`, never re-inserting. **Ingestion preference order**, per the confirmed BCA guidance: structured CSV/XLSX export first; a machine-readable PDF/text export second; manual entry as the last-resort fallback. OCR of a bank statement screenshot is explicitly **not** an acceptable production ingestion method if any structured export exists — confirm the real BCA export format before finalizing the parser (`IMPORT_LOGIC.md` §9). The exact dedup-key robustness for BCA specifically remains `NEEDS CONFIRMATION` (`FINANCIAL_LOGIC.md` §10 item 13) until a real export is tested against it.

### `settlement_bank_allocations`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| bank_transaction_id | fk → bank_transactions.id | |
| settlement_batch_id | fk → ota_settlement_batches.id, nullable | |
| settlement_line_id | fk → ota_settlement_lines.id, nullable | |
| allocated_amount | numeric | |
| match_method | enum(`EXACT_AMOUNT`,`REFERENCE_MATCH`,`AMOUNT_AND_DATE_PROXIMITY`,`MANUAL`) | matching signal priority, confirmed: reference (if available) → exact amount → channel + date proximity + amount tolerance → description/text |
| match_confidence | numeric, nullable | advisory only |
| confirmed_by, confirmed_at | | **required for anything short of an unambiguous exact-reference-and-amount match** — never silently auto-committed |

## 7. OTA settlement

Models "what the OTA itself says it paid," with many-to-many allocation to reservations (never a hardcoded one-to-one FK). Built as **one generic settlement-import framework with per-channel format adapters/column mappings** — not three separate architectures for Airbnb/Booking.com/Expedia. Day-7 priority order for format automation: **1. Airbnb, 2. Booking.com, 3. Expedia** (Airbnb's `NET_REMITTANCE`/already-net model needs no deduction math on the platform side, making it the most tractable to automate first — `FINANCIAL_LOGIC.md` §6). If all three cannot be fully automated in time, every channel must still support manual entry through the same underlying tables, and correctness/reconciliation take priority over automation coverage.

### `ota_settlement_batches`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| channel_id | fk → channels.id | |
| source_import_id | fk → imports.id | |
| batch_reference | text, nullable | the OTA's own payout/settlement reference |
| batch_date | date | |
| gross_settlement_amount | numeric | |
| adjustment_amount | numeric | sum of correction/fee/refund lines |
| net_settlement_amount | numeric | `gross_settlement_amount + adjustment_amount` — the actual amount the OTA reports paying |
| currency | text | default IDR |
| status | enum(`PENDING`,`PARTIALLY_SETTLED`,`SETTLED`,`VARIANCE`,`NEEDS_REVIEW`) | derived from comparing allocated reservations' `expected_settlement_amount` against `net_settlement_amount`; stored for fast filtering, refreshed on allocation change |
| `[NEW]` dedupe_hash | text, generated, nullable | deterministic hash of stable batch fields (channel, date, gross amount, currency), used only when `batch_reference` is absent |
| notes | text | |

**Idempotency (mandatory):** unique constraint on `(channel_id, batch_reference)` when a reference exists; else `(channel_id, dedupe_hash)`. Re-uploading the same settlement report must not duplicate batches.

### `ota_settlement_lines`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| batch_id | fk → ota_settlement_batches.id | |
| line_type | enum(`BOOKING_PAYOUT`,`ADJUSTMENT`,`REFUND`,`CORRECTION`,`FEE`,`OTHER`) | |
| raw_reservation_reference | text, nullable | as printed by the OTA — may not exactly match VHP's `reservation_number` format |
| description | text | |
| amount | numeric | signed |
| matched_status | enum(`UNMATCHED`,`MATCHED`,`PARTIALLY_MATCHED`) | |
| `[NEW]` external_line_ref | text, nullable | a line-level reference/sequence number if the export provides one |
| `[NEW]` dedupe_hash | text, generated, nullable | deterministic hash of `(batch_id, raw_reservation_reference, amount, description)`, used when `external_line_ref` is absent |
| notes | text | |

**Idempotency (mandatory):** unique constraint on `(batch_id, external_line_ref)` when available, else `(batch_id, dedupe_hash)`. Unmatched lines are never discarded — always queryable with `matched_status = UNMATCHED`.

### `settlement_reservation_allocations`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| settlement_line_id | fk → ota_settlement_lines.id | |
| reservation_id | fk → reservations.id | |
| allocated_amount | numeric | |
| allocation_method | enum(`EXACT_MATCH`,`AMOUNT_MATCH`,`MANUAL`) | |
| confirmed_by, confirmed_at | | required for anything short of an unambiguous exact match |

## 8. Booking-data reconciliation

### `reconciliation_exceptions`

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| type | enum | see list below |
| reservation_id | fk → reservations.id, nullable | |
| daily_revenue_id | fk → daily_revenue.id, nullable | |
| detected_at | timestamptz | |
| status | enum(`OPEN`,`RESOLVED`,`IGNORED`) | |
| resolved_by, resolved_at, resolution_notes | | |
| detail | jsonb | |

Types: `BOOKING_WITHOUT_DAILY_REVENUE`, `DAILY_REVENUE_WITHOUT_BOOKING`, `ROOM_CHANGE_DETECTED`, `ARRIVAL_DEPARTURE_MISMATCH`, `DUPLICATE_RESERVATION`, `UNKNOWN_VILLA`, `UNKNOWN_CHANNEL`, `[NEW]` `MISSING_PAYMENT_RULE` (a channel+villa+date combination with no matching `channel_payment_rules` row — **`[CORRECTED]`** this type is **blocking, not informational**: while open, the affected reservation's Expected Settlement/commission/VAT/PB1/Net Revenue are incomplete and must be excluded from finalized totals rather than shown with a guessed value), `MANUAL_REVENUE_OVERRIDE_PENDING` (**`[v0.6]`** now also raised for any Direct/Individual/Travel-Agent reservation with no *approved* `revenue_overrides` row — its figures use the same temporary system-value estimate as an OTA booking, but stay flagged for review rather than treated as final, `FINANCIAL_LOGIC.md` §7a-B), `[NEW — v0.6]` `ROOM_REVENUE_TOTAL_MISMATCH` (an OTA — or unconfirmed Direct/Individual/Travel-Agent — reservation whose Room Revenue Breakdown is fully known for every stay-date, but doesn't sum to the reservation's authoritative Booking/Arrival Report total within a small rounding tolerance; the authoritative total is never silently replaced by the actual sum, `FINANCIAL_LOGIC.md` §7a-A), `AMBIGUOUS_CHANGE_LOG_EVENT`, `PRICE_CHECK_MISMATCH` (informational-severity by default — still `NEEDS CONFIRMATION`, `FINANCIAL_LOGIC.md` §10 item 8), `BALINEST_MANAGEMENT_FEE_UNRESOLVED`.

This table covers **booking-data** reconciliation only — distinct from settlement/bank reconciliation (§6–§7), which live in their own tables and their own status fields, per the explicit instruction never to collapse these into one generic status (§11 below formalizes the multi-dimensional view).

## 9. Revenue targets and future/estimated revenue `[NEW]`

### `revenue_targets`

**Confirmed: the portfolio target is an explicit configurable value (currently IDR 1,500,000,000/month for the current 33-villa portfolio), never derived as the sum of villa-level targets.** Villa-level targets remain individually configurable, and their sum may legitimately differ from the portfolio figure — both are stored, neither is computed from the other.

| Field | Type | Notes |
|---|---|---|
| id | pk | |
| villa_id | fk → villas.id, **nullable** | **null = an explicit portfolio-level target row** for that year/month — this is the authoritative portfolio number (e.g. 1,500,000,000), entered directly, not summed |
| year, month | int | |
| revenue_target | numeric | |
| occupancy_target, arr_target | numeric, nullable | |
| notes | text | e.g. "IDR 50,000,000/villa is a planning benchmark, not the source of this figure" on the portfolio row, so a future reader doesn't assume the number was computed |

Road to Target (`REPORTING_LOGIC.md` §8) reads **both** the portfolio row and the villa rows independently — it must never fall back to summing villa targets as a substitute for a missing portfolio row, and never overwrite a villa row to force the sum to match the portfolio row.

### Future booked revenue and estimated daily allocation `[NEW; extended v0.6]`

Cross-month bookings must not have their entire reservation revenue assigned to a single month, and a future stay-date without an actual Room Revenue Breakdown yet must not simply be left blank or, worse, guessed and written into `daily_revenue` as if it were real. Resolution:

**`[v0.6]`** The same query-time-only principle below now also governs the *general* case of a stay-date with no actual Room Revenue Breakdown yet, confirmed and precisely specified in `FINANCIAL_LOGIC.md` §7a — not only the forward-looking Road to Target case this section originally described. For an OTA reservation (or an unconfirmed Direct/Individual/Travel-Agent one), any stay-date without an actual Room Revenue row uses `Remaining Revenue / nights still unresolved` as its estimated amount, recomputed every time a new actual night arrives; this estimate is used to compute that night's commission/VAT/PB1/Net Revenue for reservation-level aggregates (`reservations.expected_settlement_amount`) and for display, but — like `ESTIMATED_BOOKED` below — is never written into `daily_revenue` as a stored row.

- For a future `stay_date` that already has an actual `daily_revenue` row (`revenue_source_status = ACTUAL_ROOM_REVENUE`), use it — actual data always wins.
- For a future `stay_date` with **no** actual row yet, an **estimated** nightly figure is computed **at query time** (for Road to Target and any other forward-looking commercial report only): `reservation.final_gross_revenue / reservation.nights`, evenly spread across the reservation's remaining nights. This estimate is **never written into `daily_revenue`** — it exists only as a query-time projection, explicitly labeled `ESTIMATED_BOOKED` wherever it's shown, so it can never be mistaken for, or silently overwrite, an actual figure.
- When an actual Room Revenue Breakdown for that date is later imported, it simply becomes the new `daily_revenue` row for that date, and the query-time estimate for that specific night naturally stops being produced (since the "no actual row yet" condition is no longer true) — no explicit "supersede" step is needed because the estimate was never persisted in the first place.
- **Evaluated and rejected for v1**: a persisted `booked_daily_revenue`/projection table. Given the dataset's small size (thousands of rows), a stored projection table would need its own invalidation logic every time a reservation or an actual `daily_revenue` row changes, for no query-performance benefit at this scale — the query-time COALESCE-style approach avoids that whole class of staleness bug. Revisit only if profiling later shows this specific query is a bottleneck.

## 10. Baseline / Arrival Report snapshot `[NEW — permanent import type]`

A permanent import type (`imports.import_type = BASELINE_RESERVATION_SNAPSHOT`), not a one-time migration hack, needed for: initial system migration, onboarding a newly acquired villa that already has forward reservations on the books, and rebuilding/validating the forward booking position if ever needed.

Logic (deliberately mirrors the Balinest snapshot philosophy, applied here to Aasha's own baseline rather than to an ongoing incremental feed):
- Upsert `reservations` by `reservation_number` — never duplicate an existing reservation.
- **Do not infer cancellation purely because an existing reservation is absent from the baseline file** — same principle as Balinest snapshots (§ Balinest, unchanged from earlier revisions), because a baseline snapshot is a point-in-time position, not a guaranteed-complete diff source.
- Preserve history (`reservation_status_history` unaffected unless the file explicitly reports a status change).
- After a baseline is established for a villa/portfolio, ordinary `NEW_BOOKINGS`/`CANCELLATIONS` imports resume as the normal incremental movement feed — the baseline import is a foundation-laying step, not a replacement for daily imports.

No new table is required — this import type writes into the existing `reservations`/`reservation_status_history` tables via the same upsert mechanism as `NEW_BOOKINGS` (`IMPORT_LOGIC.md` §1), just sourced from a different file/report and permitted at any time (not only "day one"), per the confirmed onboarding workflow (§1 above).

## 11. Villa visibility rules `[NEW — clarifies and corrects the prior revision's occupancy-window note]`

Two different rules apply depending on context — **do not conflate them**:

- **Current configuration/dropdowns** (mapping targets, new-import villa resolution, "add to this month's target" pickers): filter `villas.active = true`.
- **Historical reporting** (Monthly Performance or Summary for a past month, any drill-down into an old period): **include a villa whenever the reporting period overlaps its `[management_start_date, management_end_date]` window (inclusive of both ends) — regardless of the villa's current `active` flag.** A villa that is `active = false` today (fully offboarded) must still appear correctly in a report for a month it was actually managed. Do not hide a historically-managed villa from old reports merely because it's inactive today — this was an error in the prior revision's phrasing and is corrected here.

For the occupancy-percentage denominator specifically: a villa contributes to a given month's occupancy/room-nights-available denominator only for the days within that month that fall inside its (inclusive) management window — see `REPORTING_LOGIC.md` §2 for the exact per-day calculation.

## 12. Reservation-level reconciliation status

Four independent dimensions per reservation, each derived from its own source of truth, never collapsed into one generic status:

| Dimension | Derived from |
|---|---|
| Booking Data status | open `reconciliation_exceptions` rows for the reservation |
| Revenue Calculation status | `daily_revenue` rows covering the full stay range, computed |
| OTA Settlement status | `SUM(settlement_reservation_allocations.allocated_amount)` vs. `reservations.expected_settlement_amount` — `PENDING`/`PARTIAL`/`RECEIVED` |
| Bank Receipt status | via allocated settlement line(s)/batch(es)' own `settlement_bank_allocations` — `PENDING`/`PARTIAL`/`MATCHED` |

Computed at query time (small dataset, no need to materialize for the MVP). A derived, display-only **Accounting Status** (e.g. `CLEARED` when all four are fully reconciled) may summarize these, but is never a substitute for or independently-stored duplicate of them.

## 13. Business units, management agreements, owner finance `[Phase 2, Days 8–14 — unchanged from prior revision]`

`business_units`, `management_agreements`, `owner_statements`, `owner_statement_lines`, `statement_adjustments`, `owner_payouts`, `owner_payout_statements`, `accounting_periods` are unchanged from the prior revision (fields, semantics, and the immutable-once-approved/paid rule via `statement_adjustments`). None of the confirmed rules in this revision touch Phase 2 — repeated by reference to avoid drift; see the prior revision's text for the full field lists, which remain current.

## 14. Expenses `[Phase 2, Days 8–14 — unchanged from prior revision]`

`vendors`, `expense_categories`, `expenses` (with `paid_by`/`borne_by` kept distinct), `expense_allocations`, `expense_attachments` are unchanged from the prior revision.

## 15. Performance & aggregation support

Unchanged principle: indexed queries directly against `daily_revenue`, `expenses`/`expense_allocations`, `bank_transactions`, and the settlement tables for on-demand aggregation; no full-history scans; no client-side recomputation of portfolio-wide totals; each domain's page fetches only the aggregated slice it needs (no monolithic frontend state spanning reservations/revenue/settlement/bank/expenses at once).

Recommended indexes: `ota_settlement_lines(batch_id)`; `settlement_reservation_allocations(reservation_id)`, `(settlement_line_id)`; `bank_transactions(bank_account_id, transaction_date)`; `settlement_bank_allocations(bank_transaction_id)`, `(settlement_batch_id)`; `expenses(villa_id, posting_month)`, `(business_unit_id, posting_month)`; `expense_allocations(expense_id)`; `owner_statements(villa_id, period_year, period_month)`; `owner_statement_lines(owner_statement_id)`; `villas(management_start_date, management_end_date)`, `(active)`; `channel_payment_rules(channel_id, villa_id, villa_group_id, effective_from)`; `revenue_targets(villa_id, year, month)`.

If profiling later shows a need, add narrow rollup tables rather than optimizing prematurely.
