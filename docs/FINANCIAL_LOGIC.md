# Financial Logic

> **Revision note (v0.4 — confirmed business rules):** Jane has now confirmed several rules that were previously `NEEDS CONFIRMATION`. This revision resolves them explicitly rather than leaving the earlier register untouched: the Bracha 21%-service-charge/PB1-exemption treatment is **retired** as current logic (kept only as a historical, effective-dated profile for reconciling old periods); PB1 is confirmed **not** withheld by any OTA; Expected Settlement is now calculated from a **payment model** (per channel, optionally overridden per villa) rather than from Net Revenue; the "0% commission" treatment for Agoda/Airbnb/Tiket.com/Trip.com/etc. is confirmed **intentional** (their PMS figure already excludes OTA commission); the Direct/TA manual-override even-split rule is confirmed as-is; and cancelled reservations are confirmed able to still carry recognized revenue (cancellation fees/no-shows). §10 below is the updated master register — resolved items are marked `[RESOLVED]` with the confirmed rule and kept for history/traceability, not deleted; new open items are added, not guessed at.
>
> **Revision note (v0.5 — final consistency pass):** Two more §10 items are now resolved: the Bracha legacy→standard **cutover date is confirmed as 2026-08-01**, and Bracha's Booking.com **commission rate is confirmed at 18%** — both are stated plainly wherever they appear below, with no remaining "working assumption"/"NEEDS CONFIRMATION" framing (§3/§6/§10). The Direct/TA manual-override daily allocation is likewise restated as fully settled, with no residual "open question" wording (§7). §10 item 16 (an unresolved `channel_payment_rules` lookup) is corrected: there is **no silent fallback** to an assumed model — it raises `MISSING_PAYMENT_RULE` and the affected calculation is incomplete/not final (§5/§10). The `daily_revenue.gross_revenue` field is renamed to `daily_revenue.commercial_revenue_basis_amount` throughout (`DATA_MODEL.md` §2) to stop implying the stored figure is always pre-deduction.

This is the most sensitive document in the set. Per `CLAUDE.md`, nothing here is to be changed without Jane's explicit approval — including further "fixes." Formulas transcribed from the legacy workbook are still cited by sheet/cell where relevant, so the historical behavior remains checkable even where it's no longer the live rule.

## 1. Financial vocabulary `[REVISED]`

The word "Gross Revenue" was being used loosely for every amount coming out of VHP, even though some channels' PMS figures are already net of OTA commission. That ambiguity ends here — every revenue/settlement figure in the platform must know which of these it is:

| Term | Meaning |
|---|---|
| **Guest Gross Revenue** | What the guest actually paid the OTA/channel for the stay. Not always visible to Aasha — only reconstructable when the PMS figure is confirmed to be pre-OTA-deduction (see `source_amount_basis` below). Where it isn't available, **it is not invented** — the platform records the actual source amount and its known basis instead. |
| **PMS / System Revenue** | The revenue figure as it exists in VHP for a reservation — `reservations.system_gross_revenue`, unchanged plumbing from earlier revisions. Its meaning (gross or already-net) depends on the channel, see below. |
| **`source_amount_basis`** | A configured flag, per channel (optionally per villa), stating whether the PMS/System Revenue figure is `GROSS_BEFORE_OTA_DEDUCTIONS` or `NET_AFTER_OTA_DEDUCTIONS`. This is the single flag that resolves the old "why is commission 0% for some channels" ambiguity — see §2. |
| **OTA Commercial Deductions** | The combined commission + payment-service-fee (where applicable) an OTA takes before or alongside remitting funds — see §2. Replaces the vaguer "Commission" as the umbrella term when a channel has more than one deduction line. |
| **VAT on OTA Commercial Deductions** | 11%, applied to the *sum* of OTA Commercial Deductions (not to commission alone when a separate payment-service-fee line exists) — see §2's worked Booking.com example. |
| **PB1** | The regional accommodation tax, calculated from the commercial revenue basis — unchanged formula (§3) — but **confirmed not withheld by any OTA** (§5). |
| **Net Revenue** | Commercial Revenue Basis − OTA Commercial Deductions − VAT on those deductions − PB1. The management-reporting figure. **Not the same as Expected Settlement** — see §5. |
| **Expected Settlement / Expected Receivable** | The amount the platform expects to actually arrive from the channel, computed from the channel's (optionally villa-specific) **payment model** — §4–§5 — never simply copied from Net Revenue. |
| **OTA Reported Settlement** | What the OTA's own settlement/payout file says it paid — a real-world figure, may differ from Expected Settlement. |
| **Bank Received** | What actually lands in Aasha's bank account. |

## 2. Commission / OTA Commercial Deductions — the configurable rule engine `[REVISED]`

Commission is no longer modeled as a bare percentage keyed only by channel+villa-group. It is one part of a broader **payment rule** (`channel_payment_rules`, `DATA_MODEL.md` §7) resolved by **channel + optional villa/villa-group + effective date**, because payment mechanics are confirmed to vary not just by channel but by villa/property setup within the same channel (Booking.com is the clearest example — see §5).

### What the legacy workbook actually had (kept for history — see §10 item 1, `[RESOLVED]`)

`All Bookings!U2` / `ROOM REV!AY2` hardcoded commission by channel name and a Bracha villa-name check:

| Channel | Villa group | Commission % (legacy) |
|---|---|---|
| BOOKING.COM | Bracha (1BD/2BD/3BD) | 18% |
| BOOKING.COM | all other villas | 17.3% (= 15% + 2.3%) |
| EXPEDIA.COM | any villa | 15% |
| everything else | any villa | 0% in the ledger |

### What's now confirmed

**The "0% for Agoda/Airbnb/Tiket.com/Trip.com/travel agents" line is intentional, not a gap** (§7 item 5, `[RESOLVED]`): for these channels, `source_amount_basis = NET_AFTER_OTA_DEDUCTIONS` — the PMS/System Revenue figure Aasha receives from VHP is *already net of the OTA's commission*, because the OTA deducts its cut before the number ever reaches VHP. The platform must not deduct commission a second time for these channels. Their Net Revenue calculation is simply `System Revenue − PB1` (no commission/VAT line, because none is visible or applicable at Aasha's ledger level) — this is not "the channel is free," it's "the channel's cut already happened upstream and isn't Aasha's to calculate."

**The real Booking.com non-Bracha rate structure is confirmed correct** by an actual settlement document Jane provided:

```
Reservation Amount (Guest Gross Revenue, this channel/villa)    IDR 4,480,000
Commission (15%)                                                   (672,000)
Payment Service Fee (2.3%)                                         (103,040)
VAT on (Commission + Payment Service Fee), 11%                      (85,254)
--------------------------------------------------------------------------
Net payout                                                        3,619,706
```
`672,000 + 103,040 = 775,040`; `775,040 × 11% = 85,254.4 ≈ 85,254`; `4,480,000 − 775,040 − 85,254 = 3,619,706` — matches the actual bank credit exactly (see §6). This confirms the legacy "15% + 2.3%" combination was correct all along for **non-Bracha Booking.com properties**, and that VAT applies to the *combined* commission+fee amount, not commission alone — kept in the platform as two separately-configured, separately-drillable rate fields (`commission_rate`, `payment_service_fee_rate`) rather than one bundled magic number, so a settlement line's three deductions can be shown individually and matched against the real OTA statement line-for-line.

**Bracha's own Booking.com behavior is confirmed different** — not a different commission *rate*, but a different **payment model** entirely (gross remittance, invoiced separately) — see §4–§5.

## 3. PB1 `[UNCHANGED FORMULA — clarified scope]`

```
PB1 = Commercial_Revenue_Basis / 1.1 × 10%
```
Unchanged from earlier revisions — the `/1.1` strips an assumed 11%-inclusive VAT component before applying 10% PB1; this remains a Net Revenue (management-reporting) calculation only. **PB1 is confirmed to never reduce Expected Settlement** — see §5. `Commercial_Revenue_Basis` is the Guest Gross Revenue for a `GROSS_BEFORE_OTA_DEDUCTIONS` channel, or the already-net PMS/System Revenue for a `NET_AFTER_OTA_DEDUCTIONS` channel — either way, PB1 is Aasha's own tax obligation on the commercial revenue, calculated and remitted independently of what any OTA transfers.

### Bracha — retired historical treatment, current default `[RESOLVED — see §10 items 1/2/3/15/17]`

**Confirmed: Bracha villas no longer get a PB1 exemption or a 21%-inclusive service-charge extraction.** Going forward, Bracha follows the identical calculation as every other applicable villa:
```
Gross Revenue − OTA Commercial Deductions − VAT on those deductions − PB1 = Net Revenue
```
The legacy `ROOM REV!BB2` Bracha PB1 exemption and `ROOM REV!AX2` 21%-extraction (`Total − Total/1.21`) are **retired as live business logic**. They are preserved in this document, and in the data model as a distinct, effective-dated `villa_tax_profile` (`bracha_legacy_21pct`, `DATA_MODEL.md` §1), **only** so that a report reproducing a historical period can still replicate the number the legacy workbook would have shown for that period. **Confirmed cutover date: 2026-08-01.** For stay dates before 2026-08-01, the historical Bracha legacy profile applies where applicable; for stay dates on or after 2026-08-01, the standard calculation applies — the old 21% service-charge/tax treatment and the PB1 exemption no longer apply from that date onward. This is no longer a `NEEDS CONFIRMATION` item.

## 4. Payment models `[NEW]`

Settlement behavior is **not** classified by channel alone — it can vary by channel **and** villa/property/payment setup, resolved by `channel_payment_rules` (`DATA_MODEL.md` §7): `channel_id` + optional `villa_id`/`villa_group_id` + `effective_from`/`effective_to`, with a villa-specific rule overriding a channel-wide default. Two payment models are supported at minimum:

**A. `NET_REMITTANCE`** — the channel deducts its commission/fees before transferring the payout; the amount that arrives (and the amount the platform should *expect* to arrive) is already net of those deductions. Applies to: non-Bracha Booking.com (deductions modeled explicitly, §2/§6), and — in a degenerate sense — every `NET_AFTER_OTA_DEDUCTIONS`-basis channel (Agoda, Airbnb, Tiket.com, Trip.com, etc.), where the "remittance" is simply the PMS figure itself, no further deduction applied by the platform.

**B. `GROSS_REMITTANCE_INVOICE_LATER`** — the channel transfers the full gross booking revenue and separately invoices Aasha for commission/VAT/fees, rather than netting them out of the transfer. Applies to: Expedia (all villas, §7), and Bracha-specific Booking.com (§7). Commission/VAT under this model remain **Aasha payables** that reduce Net Revenue for management reporting, but they must **not** be deducted from Expected Settlement, because the channel isn't deducting them from what it actually transfers.

None of this is hardcoded in application/UI code by channel name — it is entirely data-driven through `channel_payment_rules`, so a channel's behavior (or one villa's exception within a channel) can be corrected or extended by editing configuration, never by editing a component.

## 5. Expected Settlement `[NEW — resolves §10 item 11]`

**Confirmed: PB1 is not withheld by any OTA. Aasha pays PB1 separately to the local government.** `channel_payment_rules`/`channel_settlement_rules`' `pb1_withheld_by_ota` flag **defaults to `false`** for every channel (superseding the earlier `NET_REVENUE`-basis default, which was wrong). PB1 is a Net Revenue deduction only — it never appears in the Expected Settlement calculation.

```
NET_REMITTANCE:
  Expected Settlement = PMS/System Revenue, if source_amount_basis = NET_AFTER_OTA_DEDUCTIONS  (already net; nothing further to deduct)
                       = Guest Gross Revenue − OTA Commercial Deductions − VAT on those deductions, if source_amount_basis = GROSS_BEFORE_OTA_DEDUCTIONS
                         (i.e., the same deductions used for Net Revenue, MINUS PB1 — PB1 is added back / never subtracted here)

GROSS_REMITTANCE_INVOICE_LATER:
  Expected Settlement = Guest Gross Revenue (= PMS/System Revenue for these channels)
                         subject to any explicit payout adjustment shown in real settlement data
```

Then, **separately, always**:
```
Net Revenue = Commercial Revenue Basis − OTA Commercial Deductions − VAT on those deductions − PB1
```//: computed regardless of payment model, for management reporting — Expected Settlement and Net Revenue are two different numbers derived from the same inputs, kept as two different stored/derived fields (`DATA_MODEL.md` §2/§7), never conflated because they happen to be equal for some channels.

This keeps Revenue / Expected Receivable / Settlement / Bank Receipt as four genuinely separate concepts (§8 below), exactly as required.

**`[CORRECTED — no silent fallback]`** Both formulas above depend on a `channel_payment_rules` row actually resolving for the reservation's channel + villa + date. **If none does, do not assume `NET_REMITTANCE` + `NET_AFTER_OTA_DEDUCTIONS` (or any other model) as a safe default.** Raise `MISSING_PAYMENT_RULE` (`DATA_MODEL.md` §8) and leave Expected Settlement — and every calculation that depends on it (Net Revenue, commission, VAT, PB1 for that reservation's stay-dates) — unset and marked incomplete/not final until a rule is configured. An assumed default here is exactly the kind of invented business rule that could silently overstate or understate Expected Settlement for a channel/villa combination nobody has actually looked at yet.

## 6. Confirmed channel-specific rules `[NEW]`

### Booking.com — Bracha villas (confirmed, effective 2026-08-01)
For stay dates on or after **2026-08-01**: `source_amount_basis = GROSS_BEFORE_OTA_DEDUCTIONS`, `payment_model = GROSS_REMITTANCE_INVOICE_LATER`, `commission_rate = 0.18` (**confirmed**, no longer a working assumption), `commission_vat_rate = 0.11`, `pb1_withheld_by_ota = false`. Expected Settlement = Gross Revenue — Booking.com transfers gross for this property/payment setup, and commission is invoiced separately, so commission, VAT on commission, and PB1 all reduce Net Revenue but do **not** reduce Expected Settlement. For stay dates before 2026-08-01, the retired Bracha legacy profile applies instead (§3).

### Booking.com — all other (non-Bracha) properties
`payment_model = NET_REMITTANCE`. `source_amount_basis = GROSS_BEFORE_OTA_DEDUCTIONS`. Expected Settlement = Gross Revenue − Commission (15%) − Payment Service Fee (2.3%) − VAT on (Commission+Fee) (11%) — i.e., identical to the Net Revenue calculation *minus the PB1 line* (PB1 is never part of a Booking.com deduction). Confirmed exactly against the real worked example in §2/§8. **The bank should reconcile to this settlement amount.**

### Expedia — all villas
`payment_model = GROSS_REMITTANCE_INVOICE_LATER`. `source_amount_basis = GROSS_BEFORE_OTA_DEDUCTIONS` (Expedia's PMS/system figure is the guest's gross reservation amount). Expected Settlement = Gross Revenue, subject to explicit payout adjustments if a real Expedia settlement file shows any. Commission and VAT on Expedia's commission are separate payables/invoices, reducing Net Revenue for management reporting but never subtracted from Expected Settlement. **Confirmed by a real Expedia invoice showing "Amount to be paid = IDR 0"** — i.e., the commercial settlement (commission invoice) is a wholly separate cash flow from the gross reservation revenue already paid to Aasha, exactly matching this model. Bank Reconciliation for Expedia compares the bank receipt against **gross** Expected Settlement, never against Net Revenue.

### Agoda, Airbnb, Trip.com, Tiket.com, and similar channels
`payment_model = NET_REMITTANCE` in the degenerate sense described in §4 (nothing further deducted by the platform). `source_amount_basis = NET_AFTER_OTA_DEDUCTIONS` — the PMS amount is already the commercial revenue received after the OTA's own commission. **This is confirmed intentional, not a gap** (§7 item 5, `[RESOLVED]`): these channels' commission has already happened before Aasha ever sees the number. Expected Settlement generally follows the OTA payout amount **before** Aasha's separate PB1 payment (i.e., Expected Settlement = PMS amount, unchanged; PB1 is deducted afterward, off-ledger from the OTA's perspective, purely for Aasha's own Net Revenue reporting and tax remittance).

**Airbnb is the Day-7 top-priority settlement format** (`IMPORT_LOGIC.md` §8, `IMPLEMENTATION_PLAN.md`) — its payment model per this section is the simple `NET_REMITTANCE`/`NET_AFTER_OTA_DEDUCTIONS` case, i.e., no deduction math needed on the platform side for Airbnb's Expected Settlement (it should simply equal the PMS/System Revenue), which makes it the most tractable channel to get fully automated first, ahead of Booking.com's three-line deduction and Expedia's separate-invoice model.

## 7. Manual Override (Direct / Travel Agent bookings) `[CONFIRMED — resolves §12/§14 old item]`

Unchanged mechanism from earlier revisions (System Revenue / Manual Revenue Override / Final Revenue, matched via the Direct-sheet-equivalent workflow). **Confirmed rule for daily allocation:**

```
Daily allocation for an approved override = approved_manual_revenue / stay_nights   (an even split across every stay night)
```

Reason: Direct/Travel Agent bookings use a flat agreed rate, not PriceLabs' dynamic nightly pricing, so an even split is the economically correct allocation — there is no "real" nightly variation being discarded, because none exists for these bookings. This applies going forward exactly as the legacy `ROOM REV!AT2` behavior already did.

## 8. Cancellation / no-show revenue `[NEW — resolves a gap the legacy workbook never modeled]`

**Confirmed: a cancelled reservation may still generate recognized revenue**, and reservation status and revenue status are explicitly separate concerns — never `IF (reservation.status = CANCELLED) THEN revenue = 0`.

`daily_revenue` rows carry a `revenue_type` (`DATA_MODEL.md` §2): `STAY`, `CANCELLATION_FEE`, `NO_SHOW`, `REFUND`, `ADJUSTMENT`. Occupancy (room-nights sold) is computed purely from the reservation's active status and arrival/departure range (`REPORTING_LOGIC.md` §2) — a cancellation removes occupied room-nights from that calculation, exactly as before. But it must **never** trigger deletion or zeroing of any `daily_revenue` row, and a confirmed cancellation-fee or no-show charge is recorded as its own `revenue_type = CANCELLATION_FEE`/`NO_SHOW` row and flows into Net Revenue and Expected Settlement exactly like a `STAY` row would — it simply isn't counted as an occupied room-night. This decouples "was the room occupied" from "did this reservation produce revenue," which the legacy workbook never had to model explicitly (it only ever zeroed cancelled bookings out of `Net Amount`, per the old `All Bookings!AA2` formula — that specific behavior is now confirmed **not** to be replicated going forward for any reservation that actually has a posted cancellation fee or no-show charge).

## 9. Balinest `[UNCHANGED — still open, see §11]`

Formula and both open questions (management fee never applied, `MIN(Fare,Payout)` base) are unchanged from the prior revision. Confirmed rules in this update are Aasha-specific (Bracha treatment, payment models, PB1-withheld-by-OTA) and are **not** assumed to also apply to Balinest, which is a different management company on a different PMS with potentially different commercial/tax arrangements with its property owners — do not port these Aasha confirmations onto Balinest without asking.

## 10. Conflicts & NEEDS CONFIRMATION register `[REVISED — resolved items marked, new items added, nothing deleted]`

### Resolved by Jane's confirmation (this revision)

1. **`[RESOLVED]`** Bracha PB1 exemption — retired going forward; standard PB1 calculation now applies to Bracha like every other applicable villa. Legacy behavior preserved only as an effective-dated historical profile (§3).
2. **`[RESOLVED]`** Bracha 21%-inclusive service-charge extraction — retired going forward, same historical-profile treatment as item 1.
3. **`[RESOLVED]`** Commission base netting inconsistency for Bracha via Booking.com (legacy) — moot going forward, since Bracha's confirmed current model is `GROSS_REMITTANCE_INVOICE_LATER` with commission invoiced separately, not netted from any base at all (§6).
4. **Balinest PB1 base (`Gross − Management Fee`)** — **still open**, not resolved by this revision (Balinest wasn't addressed — see §9 above and the new items below).
5. **`[RESOLVED]`** Commission = 0% for Agoda/Airbnb/Tiket.com/Trip.com/etc. — confirmed intentional; their `source_amount_basis = NET_AFTER_OTA_DEDUCTIONS` (§2, §6).
6. **Balinest management fee (15%, never applied)** — **still open**.
7. **`[RESOLVED]`** Manual-override daily allocation — confirmed even split, `approved_manual_revenue / stay_nights` (§7 above).
8. **`PRICE_CHECK_MISMATCH` severity** — **still open** (informational-only status not yet explicitly confirmed, though nothing suggests otherwise).
9. **Villa count discrepancy** — **superseded by new information**: the current portfolio is confirmed as 26 Aasha + 7 Balinest = 33 villas (`PRODUCT_SPEC.md`), not the ~26-total figure or the 22 observed in the sample workbook. The villa master list should be built from this confirmed count, not the historical sample data.
10. **Owner mapping** — **still open**.
11. **`[RESOLVED]`** PB1-withheld-by-OTA — confirmed **false** for every channel; PB1 never reduces Expected Settlement (§5).
12. **Settlement/refund/adjustment attribution** — **still open**, data-dependent on real OTA settlement files.
13. **Bank statement dedup key** — **still open**, data-dependent on the real BCA export format (`IMPORT_LOGIC.md` §9).
14. **Owner-facing settlement scope (Balinest excluded)** — **still open**, revisit at Phase 2.
15. **`[RESOLVED]`** Exact effective date for the Bracha legacy→standard cutover — confirmed as **2026-08-01** (§3). No default/placeholder logic needed.
17. **`[RESOLVED]`** Bracha's current Booking.com commission rate — confirmed at **18%** (§2/§6). No longer a working assumption.

### New items opened by this revision `[NEW]`

16. **Exact `channel_payment_rules` mapping for every villa+channel combination.** This revision confirms the *model and values* for Bracha-Booking.com, other-Booking.com, Expedia, and the "already-net" channel group — but has not enumerated every one of the 33 villas × however-many active channels. **`[CORRECTED — no silent fallback]`** Anything not yet confirmed is **not** given a default (previously this register suggested defaulting to "assume already-net, no further deduction" — that guidance is withdrawn). An unresolved combination raises `MISSING_PAYMENT_RULE` and its financial figures stay incomplete/not final until Jane confirms the specific rule (`DATA_MODEL.md` §4/§8).
18. **`booked_daily_revenue`/`ESTIMATED_BOOKED` estimation methodology approval.** The even-split-across-remaining-nights estimation for future, not-yet-actualized stay dates (`REPORTING_LOGIC.md` §8, `DATA_MODEL.md` §9) is a reasonable default per Jane's instruction, but the exact point at which an estimate is superseded by an actual `daily_revenue` row (same-day import cutoff, etc.) should be confirmed once real daily import timing is observed in production.
19. **Airbnb, Booking.com, Expedia settlement file formats.** Confirmed as the Day-7 priority order (§6), but the actual column layouts/mappings for the settlement-import framework (`IMPORT_LOGIC.md` §8) still need a real sample file per channel before the parser/mapping config can be finalized — do not guess a column layout from the worked examples in this document alone; those examples are amounts, not full file exports.

None of the above open items should be resolved by Claude Code inventing an answer during implementation. Where a day's work depends on one of these (noted in `IMPLEMENTATION_PLAN.md`), implementation should pause and surface the specific open question rather than guess and proceed. Items 16 and 19 are the most likely to actually block Day 5 work in practice — get real settlement files as early as possible.

## 11. `[NEW — Day-7 critical]` Revenue Recognition, Expected Receivable, Settlement, and Cash Receipt are four different things

These four concepts are tracked separately even when, in a given case, their amounts coincide. Collapsing them because "they're usually the same number" is exactly the shortcut this section exists to prevent.

| Concept | What it means | Where it lives |
|---|---|---|
| **Revenue Recognition** | The Net Revenue the platform calculates a reservation *should* generate, per §1–§9 above | `daily_revenue.net_revenue`, aggregated to `reservations` |
| **Expected Receivable / Expected Settlement** | What the platform expects the *channel* to actually pay Aasha, computed from the applicable `channel_payment_rules` row (§5) — **not** simply Net Revenue | `reservations.expected_settlement_amount` |
| **OTA Settlement** | What the OTA's own settlement/payout report says it paid or will pay — a real-world figure from a real-world file, which can legitimately differ from Expected Settlement | `ota_settlement_batches` / `ota_settlement_lines`, allocated via `settlement_reservation_allocations` |
| **Cash Receipt (Bank Receipt)** | What actually lands in Aasha's bank account | `bank_transactions`, allocated via `settlement_bank_allocations` |

Two independent variances follow directly from keeping these separate:

```
Settlement Variance = OTA Settlement (allocated) − Expected Settlement
Bank Variance        = Bank Receipt (allocated)   − OTA Settlement (allocated)
Total Variance        = Bank Receipt (allocated)   − Expected Settlement
```

### Worked example — non-Bracha Booking.com (now using the real confirmed figures from §2/§6, superseding the earlier illustrative example)

```
Reservation: (Booking.com, non-Bracha villa)

Guest Gross Revenue                  4,480,000
Commission (15%)                      (672,000)
Payment Service Fee (2.3%)            (103,040)
VAT on Commission+Fee (11%)            (85,254)
------------------------------------------------
Expected Settlement (NET_REMITTANCE)  3,619,706     ← matches real OTA statement AND real bank credit

PB1 (management reporting only, not part of the above)     — computed separately off Guest Gross Revenue, reduces Net Revenue, never reduces Expected Settlement
Net Revenue = Expected Settlement − PB1
```

### Worked example — Expedia (gross remittance, invoice-later)

```
Reservation: (Expedia, any villa)

Guest Gross Revenue = PMS/System Revenue = Expected Settlement    (full amount transferred)

Commission + VAT on commission     → separate payable/invoice, "Amount to be paid" on that invoice can be IDR 0
                                       if netted against other Expedia activity — does not change the fact
                                       that the bank receipt for THIS reservation's stay revenue is the gross amount

Net Revenue (management reporting) = Guest Gross Revenue − Commission − VAT on Commission − PB1
```

**Bank Reconciliation for Expedia compares the bank receipt against gross Expected Settlement, never against Net Revenue** — a variance here would mean Expedia paid something other than the full gross amount, which is the actual signal worth investigating for this channel; comparing against Net Revenue instead would manufacture a permanent, meaningless "variance" equal to the commission+PB1 amount every single time.

## 12. `[Phase 2, Days 8–14 — unchanged from prior revision]` Expense economics, management fee, owner payout waterfall

Unchanged: `paid_by`/`borne_by` kept distinct (never collapsed), management fee is per-villa/contract configuration (`NEEDS CONFIRMATION` per villa, item 16-style risk applies here too — don't default every villa to one fee/basis), and the owner payout waterfall is a configurable template, not a universal formula. See `DATA_MODEL.md` §10 for the schema and `REPORTING_LOGIC.md` §16 for how it's reported. None of the Bracha/PB1/payment-model confirmations above change these Phase 2 sections — they remain exactly as previously documented.
