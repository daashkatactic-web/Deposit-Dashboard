# CALCULATION_RULES — Simple fixed-term MNT deposits

## Financial model boundaries
- Eligible: documented **ordinary, simple-interest fixed-term** retail deposits in MNT, whether interest is paid **at maturity** or **periodically (e.g. monthly)** (D6).
- Do NOT apply compound interest to these products. Monthly interest payout is not evidence of capitalization, and periodic payouts are **never** assumed to be reinvested. Exclude compound-interest-only deposit products from ranking (`verification_status = "excluded"`, reason shown).
- Exclude products restricted to special customer groups (pensioners, payroll clients, students, etc.) from the general ranking, with a visible reason «Тусгай бүлэгт зориулсан» (D9).
- Store term source as `days`, `months`, or day interval exactly as printed; a 365-day bank category is not universally identical to 12 calendar months. Matching to UI month chips follows **only** the fixed table below (D1). Avoid inventing 9m rate where not published.

## Term matching — approved decision D1
Fixed chip-to-day mapping table (`TERM_DAY_MAP`):

| Chip (months) | 1 | 3 | 6 | 9 | 12 | 18 | 24 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Mapped days | 30 | 90 | 180 | 270 | 365 | 545 | 730 |

For a selected chip `m`, a product's rate is looked up in this order:
1. **Exact month match:** the product publishes a term with `source_term_unit = months` and value `m` → use it (`match_type = "exact"`, `term_basis = "months"`).
1b. **Published month range (D14 P2-A):** the product publishes a `month_interval` containing `m` → use it (`match_type = "month_range"`, `term_basis = "months"`, label «Сарын интервал»). Details below.
2. **Mapped day match:** otherwise, the product publishes a term with `source_term_unit = days` equal to `TERM_DAY_MAP[m]` → use it (`match_type = "mapped"`, `term_basis = "days"`).
3. **Mapped day interval:** otherwise, the product publishes a day interval (as printed, with its own inclusive/exclusive bounds) that contains `TERM_DAY_MAP[m]` → use that interval's rate (`match_type = "mapped"`, `term_basis = "days"`).
4. Otherwise there is **no offer** for that chip («саналгүй»). Never fall back to the nearest term, never interpolate.

Every `mapped` result is labelled «≈ тааруулсан» wherever its rate or result is shown (featured panel, ranking, rate matrix, chart tooltip), with the source term as printed (e.g. «365 өдөр → 12 сар»). The mapping table is a documented project assumption, not a bank statement.

**Reconciliation of Z1/D1 with P2-A (D14, D15 item 8).** Published units and endpoints are kept exactly as printed. The Z1 table above is the **only** approved day↔month equivalence; it is a labelled project mapping, not a bank statement. No other conversion is made — e.g. a month range is never turned into days, a day interval never into months, and a mixed endpoint such as «2 сар 1 хоног» is read only as "after 2 calendar months" on the month scale. If deciding whether a chip falls inside a published range would need any other day↔month equivalence, the match is ambiguous and the record is treated as unverified (not ranked).

**Published month ranges — approved D14 (P2-A).** Several banks publish one rate for a month range (М банк «2 сар 1 хоног – 3 сар», Тээвэр «3 – 6 сар», ҮХОБ «13–18 сар», Чингис хаан «3-5 сар»). These are stored as printed with `source_term_unit = "month_interval"` and `interval = {min, max, min_inclusive, max_inclusive}` in months (e.g. «2 сар 1 хоног – 3 сар» → `{min: 2, min_inclusive: false, max: 3, max_inclusive: true}`). Lookup order becomes: 1 exact month → **1b month interval containing `m`** (`match_type = "month_range"`, `term_basis = "months"`, so `T = m/12` and maturity = `startDate + m months`) → 2 mapped days → 3 mapped day interval → 4 no offer. No day↔month conversion is involved, so the result is not «≈ тааруулсан»; it is labelled «Сарын интервал» with the printed range. Rationale: D1 says month-denominated source terms are used directly; a chip inside a published month range is such a term.

**Automatic amount bonus — approved D14 (P2-B).** A product may carry `amount_bonus_tiers` = `[{min_amount_mnt, max_amount_mnt, bonus_percent}]`. When the principal falls in a tier (inclusive bounds), `R = annual_percent + bonus_percent` for all calculations; the featured panel shows base rate and bonus separately and the row carries a «+x% дүнгийн нэмэгдэл» badge. Only bonuses that the bank's page states apply automatically by amount are stored (currently М банк). Discretionary bonuses («…зөвшөөрлөөр … хүртэл нэмж болно»), customer-tier bonuses (М банк Pro/Max/Ultra/Prestige) and promotional ranges (Богд 0.1%–2.8%) are **never** applied.

## Deposit start date and term dates — approved decision D4
- `startDate` is a calendar date (no time part) defaulting to the browser's local date of today; the user can change it in «Нэмэлт тохиргоо». An empty or invalid value falls back to today with a visible note.
- `term_basis = "days"`: `termDays` = source day count (exact) or `TERM_DAY_MAP[m]` (mapped); `maturityDate = startDate + termDays`.
- `term_basis = "months"`: `maturityDate = startDate + m calendar months`. Month-end rule (D15): if the target month is shorter, clamp to its last day (31 Jan + 1 month → 28/29 Feb); the same clamp is used for illustrative monthly payment dates, unless the bank's official terms specify otherwise.
- `eligibleDays = maturityDate − startDate` in calendar days.
- The start date is a modelling input: it changes day counts, maturity date, payment dates and leap-year effects only. It does **not** change which rate snapshot applies or a product's eligibility.

## Interest calculation conventions — approved correction D5
P = initial MNT principal (> 0); R = stated annual nominal percentage plus any automatic amount bonus (D14 P2-B); `taxRate` = 0.10 (verified, see Tax below).

1. **Bank-documented convention first.** Use the day-count, accrual and payout rules the bank officially documents for that product (ACT/365, ACT/366, ACT/ACT, 30/360, explicit month-fraction rule, per-payment rounding, etc.). The convention and its source are stored per product (`day_count_convention`, `day_count_source_url`).
   - Month-fraction rule (only when documented): `grossInterest = P * (R / 100) * (m / 12)`.
   - Day-count rule (as documented): `grossInterest = P * (R / 100) * (eligibleDays / basisDays)`, leap-year handling as the bank specifies.
2. **Unknown convention → illustrative ACT/365 only.** If no official convention is found, compute `grossInterest = P * (R / 100) * (eligibleDays / 365)` and set `calc_status = "illustrative"`. Every such figure is labelled «Жишээ тооцоо (ACT/365)». It must **never** be described as the bank-calculated or payable maturity amount. Such offers may appear in the ranking only with that label on the row and in the featured panel.
3. `calc_status = "bank_convention"` is allowed only when the product's convention is verified from an official source.

Tax: per payment, `taxMNT = grossInterest * taxRate`; `netInterest = grossInterest − taxMNT`. No tax on principal. The 10% rate was verified on 2026-11-11 in the Personal Income Tax Law (legalinfo.mn/mn/detail/14410: 16.1.4 gross interest is the taxable amount, 21.2.4 rate 10%, 25.2 the bank withholds each time it calculates interest; no deposit-interest exemption in 22.1). Recheck after the art. 21.1 amendment effective 2027-01-01; note per-product exceptions if documented.

## Payout structure and proceeds — approved correction D6
`payout_frequency` is stored per product as printed: `at_maturity`, `monthly`, or another documented frequency. Unknown frequency (D15): modelled as paid at maturity **only** as an illustrative estimate, labelled «Хүү олгох хэлбэр тодорхойгүй» on the row and in the featured panel; never presented as the bank's exact payout. Frequencies the engine does not support (e.g. quarterly) are not ranked. Compound interest is never calculated (D15): compound-interest products are excluded.

- **Payment schedule:** use the bank's documented payment dates. If the schedule is not documented, an illustrative schedule is used and labelled: periods follow calendar months from `startDate`, with a final (possibly short) period ending at `maturityDate`. Each period's interest uses the product's convention (D5) on that period's days (or `1/12` per month only under a documented month-fraction rule).
- For each payment `i` on date `d_i`: `gross_i`, `tax_i = gross_i * taxRate`, `net_i = gross_i − tax_i`.
- Required outputs (always computed and shown separately, never merged):
  - `principalAtMaturityMNT = P` — principal returned at maturity;
  - `interimNetInterestMNT = Σ net_i` for payments with `d_i < maturityDate` — interest received **during** the term (0 for `at_maturity`);
  - `finalNetInterestMNT` = net interest paid on `maturityDate`;
  - `totalNetInterestMNT = interimNetInterestMNT + finalNetInterestMNT`;
  - `amountPaidAtMaturityMNT = P + finalNetInterestMNT`;
  - `totalNominalProceedsMNT = P + totalNetInterestMNT` — total nominal economic proceeds, **without** any reinvestment or compounding of interim payments.
- For `at_maturity` products, `amountPaidAtMaturityMNT = totalNominalProceedsMNT = P + totalNetInterestMNT` (the former `maturityMNT`).
- Never display interim interest as if it were paid at maturity, and never add interest-on-interest.

## Inflation time convention and real values — approved corrections D7, D8
Constant annual compound price-level assumption with annual scenario rate `q` (decimal). Time in years `t` from `startDate` is measured by an explicitly documented convention that depends on the term basis:

| `term_basis` | Term length `T` | Cash-flow time `t_i` |
| --- | --- | --- |
| `months` (exact month or published month range) | `T = m / 12` | `t_i = (months elapsed at d_i) / 12`; a short final period adds `days / 365` |
| `days` (exact or mapped day term) | `T = termDays / 365` | `t_i = (d_i − startDate in days) / 365` |

The 365-day inflation year is a project convention, independent of the bank's interest day-count basis, and is shown in the methodology section. Because `T` can differ slightly between banks for one chip (e.g. 18 months → 1.5 vs 545 days → 1.4932), the featured panel shows the term length used.

- `deflator(t) = (1 + q)^t`.
- Valid domain (D8): `q > −1` and finite. Negative `q` (deflation) is allowed; `deflator(t) > 0` for all `t ≥ 0`, so every formula below stays defined. Inputs outside the domain are rejected with a visible message, never clamped silently.
- `todayValueMNT = Σ CF_i / deflator(t_i)`, where the cash flows are each `net_i` at `d_i` plus `P` at maturity. Each payment is deflated at its own date; no reinvestment is assumed.
- `realGainLossMNT = todayValueMNT − P`.
- `nominalReturnOverTerm = totalNetInterestMNT / P`.
- `realReturnOverTerm = todayValueMNT / P − 1`. For `at_maturity` this equals `((1 + nominalReturnOverTerm) / (1 + q)^T) − 1`.
- Display `realReturnOverTerm * 100%` as the **selected-term total return**. A *real annualized return*, if shown, is computed separately and labelled: `(1 + realReturnOverTerm)^(1/T) − 1` for `T > 0`. Never label a 3-month total return as annual.
- Inflation default comes from the NSO official dated annual CPI observation; it is a historical observation used as a scenario, not a forecast. When `q < 0`, label the scenario «Дефляци».

## Rounding and precision — approved decision D10
- All internal calculations keep full IEEE-754 double precision; no intermediate rounding. Exception: when a bank officially documents per-payment rounding and `calc_status = "bank_convention"`, apply exactly that rule at the documented step.
- Display only: MNT values rounded to whole tugriks using **half-up, sign-symmetric** rounding (half away from zero: 2.5 → 3, −2.5 → −3). Percentages displayed with two decimals by the same rule.
- Each displayed figure is rounded independently from its unrounded value; displayed components may differ from a displayed total by ±1 ₮, which the methodology note states.
- The rounding function must be correct at half-unit boundaries and must not turn values below .5 into ups because of floating-point artefacts (see tests).

## Example check — 12 months (month-fraction rule, paid at maturity)
P = 22,000,000; annual rate = 14%; 12 months; tax = 10%; annual inflation = 12.9%.
Gross = 3,080,000; tax = 308,000; net = 2,772,000; paid at maturity = 24,772,000.
Today's purchasing power = 24,772,000 / 1.129 ≈ 21,941,541.19 MNT (display 21,941,541 ₮).
Real gain/loss ≈ −58,458.81 MNT (display −58,459 ₮); real total return ≈ −0.2657% (display −0.27%).
This is a calculation illustration, NOT a verified named bank offer.

## Eligibility and ranking
- Validate positive principal, finite numbers, supported product/term, MNT currency, principal within min/max and rate tier, access/channel/eligibility, and customer-group restriction (D9).
- For each bank, select its highest *eligible* real-return verified product for the common principal/term/scenario/start date and rank the bank once (D14 P2-C); never compare an unsupported term.
- Unranked banks (D14 P2-D) are grouped, each bank once, by the first applicable category: «Шаардлага хангахгүй» (excluded product type, restricted group, amount limits, unsupported payout) → «Баталгаажаагүй / мэдээлэл дутуу» (`needs_verification`, demo in verified mode, missing source) → «Энэ хугацаанд санал зарлаагүй» (no published term for the chip). All reasons are listed.
- Selection (D15): if the selected bank becomes ineligible, select the highest-ranked eligible bank; if none remains, show the empty state.
- **Dataset mode (D2):** in `verified` mode only records with `verification_status = "verified"` are rankable. In `demo` mode only records with `verification_status = "demo"` are rankable, and the ranking is displayed under the DEMO banner. The two record sets are never ranked together; the mode comes from the loaded dataset's `dataset_status`.
- Records with `needs_verification` or `excluded` are never ranked; they are listed with their reason.
- Rank descending `realReturnOverTerm`. Because `T` and payout timing can differ between banks, this order can differ slightly from net nominal return; real results are the ranking basis and are displayed.
- Stale data (D11): a rankable record whose `observed_at` is more than 30 days before today keeps its rank but is flagged «Шинэчлэх шаардлагатай» in amber.
- If `P = 0` or no eligible products, show helpful empty/error state, not division by zero, fake % or a manufactured winner.
- Explain missing rates, excluded compound products, restricted-group products, online-only requirement, minimum balance exclusions, illustrative calculations and stale/unverified information.

## Minimum tests
Run in the browser via `tests/tests.html` on the local static server (D3); the page imports the app's own calculation modules. No Node.
1. 22m/12m/14%/10% tax/12.9% inflation reference example above, including displayed values.
2. 10m/6m/12% month-fraction check: gross 600,000; tax 60,000; net 540,000.
3. Negative real return when inflation exceeds net yield.
4. Unsupported nine-month offer must not be interpolated.
5. Product min deposit > entered principal must be excluded.
6. 365 days vs 12 calendar months and leap-year case, using explicit start dates (e.g. a period containing 29 February vs one that does not).
7. Changing inflation changes real metrics but not eligibility.
8. In verified mode, a missing-source or demo-only offer is excluded from the ranking.
9. Selected bank becomes ineligible after amount change: reset selection to best eligible.
10. D1 mapping: a product with only `365 days` matches chip 12 as `mapped` and is labelled; a product with `12 months` matches as `exact`; when both exist, `exact` wins.
11. D1 no fallback: a product with `60 days` only gives «саналгүй» for chips 1 and 3; a day interval containing 180 matches chip 6.
12. D2: in demo mode, demo offers are ranked and flagged as demo; verified and demo records are never ranked together.
13. D4: default start date is today; an invalid start date falls back to today; changing the start date changes maturity date/day count but not eligibility or ranking membership.
14. D5: a product with unknown convention gets `calc_status = "illustrative"`, uses ACT/365 and carries the «Жишээ тооцоо» label; a product with documented ACT/366 uses 366.
15. D6 monthly payout: P 12,000,000, 12%, 12 months, documented month-fraction rule, monthly payout, 10% tax → 12 payments of net 108,000; interim 1,188,000; final 108,000; total net 1,296,000; paid at maturity 12,108,000; total nominal proceeds 13,296,000. No compounding.
16. D6/D7: with q = 0 the monthly-payout and at-maturity versions of the same rate have equal `todayValueMNT`; with q > 0 the monthly-payout version has the higher `todayValueMNT`.
17. D7: an 18-month exact term uses T = 1.5; a 545-day mapped term uses T = 545/365.
18. D8 deflation: P 10,000,000, 12m, 12%, tax 10%, q = −2% → paid at maturity 11,080,000; today value ≈ 11,306,122.45; real gain ≈ 1,306,122.45; real return ≈ 13.06%. q = −100% or non-finite input is rejected with a message.
19. D10 rounding boundaries: 0.5 → 1; 1.5 → 2; 2.5 → 3; −0.5 → −1; −2.5 → −3; 1,234,567.5 → 1,234,568; 0.49999999999999994 → 0; 21,941,541.19 → 21,941,541; −58,458.81 → −58,459; percent −0.2657 → −0.27.
20. D10 ±1 ₮ case: P 1,000,005, 10%, 12 months, month-fraction → gross 100,000.5 (display 100,001), tax 10,000.05 (display 10,000), net 90,000.45 (display 90,000); internal values stay unrounded.
21. D9: a pensioner-only product is excluded from the ranking with the «Тусгай бүлэгт зориулсан» reason.
22. D11: a rankable record observed 31 days before today is flagged «Шинэчлэх шаардлагатай»; one observed 30 days before is not.

Phase 2 tests (D14), also in `tests/tests.html`:
- P2-1 month range: (2,3] → chip 3; [1,2] → chip 1; chip 12 is not inside (12,18]; chips outside every range → no offer.
- P2-2 an exact month beats a range; a range match uses `T = m/12` and calendar-month maturity.
- P2-3 / P2-4 amount bonus at tier boundaries (19,999,999 / 20,000,000 / 49,999,999 / 50,000,000 / 100,000,000) and the resulting gross interest; base rate and bonus kept separately.
- P2-5 a rate-level `needs_verification` record is not ranked and its reason is shown.
- P2-6 schema validation for intervals and bonus tiers.
- P2-7 verified dataset: every bank appears once at every chip, only verified records are ranked, all carry the ACT/365 label, and the P2-D groups match the verification log.

## Chart and matrix data (Phase 3)
Implemented in `js/chartdata.js` (pure; no new financial rule):
- **Ranking chart:** the ranked entries in ranking order; value = `realReturnOverTerm × 100` at full precision.
- **Term curve:** for each chip, the same `evaluateDataset` as the ranking; a bank's point is its ranked offer (eligible, rankable, R incl. automatic bonus). No ranked offer → `null` (gap), never interpolated. Match type (exact / month range / ≈ mapped) and the printed source term travel with every point.
- **Growth series** for the selected offer, at every calendar month from the start date, each payment date and maturity:
  - `principal = P` (flat; the deposit balance never includes interest);
  - `paidCumulative(s) = Σ net_i` for payments with `d_i ≤ s` (actual payouts);
  - `accruedUnpaid(s) = net_k × share_k(s)` for the open period `k` — a **modelled** accrual, labelled as not paid. **D16 (2026-11-11, Phase 4B):** `share_k` follows the offer's interest convention: `month_fraction` → elapsed whole months / months in the period (samples are month anniversaries; a sample that is not one falls back to the day proportion); ACT/365, ACT/366, ACT/ACT, 30/360 → `yearFraction(from_k, s)/yearFraction(from_k, d_k)` (for ACT/365 and ACT/366 this equals the former day proportion). It changes only interim chart points: payments, maturity values, ranking and CSV figures are unchanged. (Before D16 every convention used the day proportion `(s − from_k)/(d_k − from_k)`.)
  - `nominal(s) = P + paidCumulative + accruedUnpaid` (no reinvestment); at maturity it equals `totalNominalProceedsMNT`;
  - `purchasingPower(s) = Σ_{d_i ≤ s} net_i/(1+q)^{t_i} + (P + accruedUnpaid)/(1+q)^{t(s)}`, with `t` per D7; at maturity it equals `todayValueMNT`.
- **Rate matrix:** every bank × months 1–24 with the **published base rate** (bonus noted on the row, not added). Lookup uses the same stages as `matchTerm` without the amount filter; day terms reach a month column only through the D1 table (chip months), labelled «≈»; all other published day terms stay in their original unit in «Бусад зарласан хугацаа». Cell status: verified / unverified (`needs_verification` at product or rate level) / excluded / demo / absent.

Phase 3 tests (`tests/tests.html`): P3-1 ranking-chart order, sign and #1/selected flags; P3-2 curve gaps, mapped labels and banks without points; P3-3 default five banks; P3-4 at-maturity growth (flat principal, modelled accrual, final values equal the featured panel, month-end clamp); P3-5 monthly growth (12 × 108,000 paid separately, no compounding, total 13,296,000); P3-6 matrix states and original units; P3-7 selection → growth series and D15 fallback; P3-8 matrix DOM (text labels, safe links); P3-9 verified dataset matrix and curve (quarterly Тээвэр and unverified ҮХОБ terms have no point). Phase 4B: D16-1 … D16-3 interim accrual per convention (month_fraction, ACT/365 day- and month-based, 30/360), P4B-1 verified-data corrections.
