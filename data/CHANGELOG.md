# Data changelog

Every change to a dataset file is recorded here: before/after, evidence URL, date and reviewer (DATA_SOURCES.md, step 6).

## 2026-11-11 — Phase 4B (final data audit): 3 corrections, all with official evidence
Every bank page was re-read on 2026-11-11; full evidence in `data/VERIFICATION_LOG.md` (Phase 4B addendum). Reviewer: Claude (human review pending).
- **Ариг банк** (`arig-ordinary`): 3 → 13 `day_interval` rates; added 30–59 9.0%, 60–89 9.5%, 90–179 10.7%, 180–209 11.2%, 210–239 11.6%, 240–269 11.8%, 270–299 12.0%, 300–329 12.2%, 330–364 12.4%, 720–749 14.4% (existing 365–389 14.0%, 390–539 14.2%, 540–719 14.3% unchanged and confirmed); `min_principal_mnt` null → 10,000; `source_url` → product detail page https://www.arigbank.mn/mn/product/19/44?subId=43. Payout still `unknown`.
- **Тээвэр хөгжлийн банк** (`transbank-ordinary-long`): `needs_verification` → `verified`; rates unchanged (14.00%). The page states that «Бодит хүү» 14.75% applies only if the customer re-deposits the received interest the same day; otherwise the nominal rate applies — so the product is simple interest paid quarterly. Still not ranked (quarterly payout unsupported).
- **Худалдаа хөгжлийн банк** (`tdb-ordinary-online`, 24 months): rate-level `verified` → `needs_verification` (12.70% annual vs 1.006% monthly row on the same page — same rule as ҮХОБ). Branch 36-month rate gets a note: minimum «300,000,000₮-өөс дээш».
- Unchanged, re-read: Богд (`needs_verification`), ҮХОБ 12–24 m (`needs_verification`, image table sha256 71b7ae6b…c38), Тээвэр 1–2 m (`needs_verification`), М банк (boundary note extended). All other rates re-matched one by one.
- Code: `js/ranking.js` checks unsupported payout after the term match (grouping fix, no rate change); `js/chartdata.js` interim accrual per convention (D16).


## 2026-11-11 — Phase 4A (QA, CSV export): no data change
- `data/deposits.json` and `data/deposits.demo.json` are **unchanged**.
- Roster reconciled with the Bank of Mongolia licence register (https://www.mongolbank.mn/mn/p/1463): 12 = 12. Evidence in `data/VERIFICATION_LOG.md` (Phase 4A addendum) and `DATA_SOURCES.md`.

## 2026-11-11 — Phase 3 (charts, rate matrix): no data change
- `data/deposits.json` and `data/deposits.demo.json` are **unchanged**: no rate, status, source, date, tax or inflation value was edited.
- The new charts and the 1–24 month rate matrix read the same records. Published units are shown as printed; unverified (`needs_verification`) and excluded records stay visible with their status and are not plotted on the eligible-rate curve or ranked (Тээвэр 12–24 m quarterly, ҮХОБ 12–24 m, Тээвэр 1–2 m, Богд, ХасБанк, Чингис хаан).
- New vendored asset (not data): `vendor/chartjs-4.4.1/chart.umd.js` — provenance and checksums in `vendor/README.md`.

## 2026-11-11 — `deposits.json` created (Phase 2, VERIFIED dataset)
- **New file:** `data/deposits.json`, `dataset_status: "verified"`, `snapshot_at: 2026-11-11`. The app now loads this file (`js/config.js` `DATA_URL`). `deposits.demo.json` is unchanged and kept for tests/reference.
- **Evidence:** every bank's official page, read on 2026-11-11 — full values, URLs and reasons in `data/VERIFICATION_LOG.md`.
- **Before → after per bank:**
  - ХААН банк: demo (screenshot) → `verified`; same 8 MNT rates confirmed on the live page; payout `at_maturity`, channel `any`.
  - Худалдаа хөгжлийн банк: no products → 2 `verified` products (online 8 terms, branch 9 terms), min 10,000 ₮, `at_maturity`.
  - Голомт банк: no products → `verified`, 8 terms, min 10,000 ₮, payout unknown.
  - ХасБанк: no products → `excluded` (`compound_interest`).
  - Төрийн банк: no products → `verified`, 7 day intervals + 730 days, min 10,000 ₮, payout unknown.
  - Капитрон банк: no products → `verified`, 14 month terms, min 10,000 ₮, `at_maturity`.
  - Богд банк: no products → `needs_verification` (interest type and payout not stated); 10 day-interval rates stored.
  - Ариг банк: no products → `verified`, 3 day intervals (365–719 days); min and payout not stated.
  - М банк: no products → `verified`, 13 month intervals + `amount_bonus_tiers`; channel `online`.
  - Тээвэр хөгжлийн банк: no products → short product (3–11 m `verified`, 1–2 m `needs_verification`) + long product 12–24 m `needs_verification` (quarterly payout, effective 14.75%).
  - Чингис хаан банк: no products → `excluded` (`restricted_customer_group`, foreign citizens).
  - ҮХОБ: no products → 1–11 m `verified`; 12, 13–18, 19–24 m `needs_verification` (monthly/annual mismatch).
- **Tax block:** 10%, ХХОАТ law 16.1.4, 21.2.4, 25.2 — https://legalinfo.mn/mn/detail/14410 (verified 2026-11-11).
- **Inflation:** 12.9% demo scenario → **13.4%** ҮСХ CPI y/y for 2026-10, `kind: "historical_observed"`, source table URL recorded, `published_at: null` (not shown).
- **Schema additions:** `month_interval` term unit, `amount_bonus_tiers`, `status_note`, `evidence_note`, `tax`, `inflation.observed_at` (see `DATA_SOURCES.md`).
- Generated from a transcription script and checked by `tests/tests.html` (P2-7). Reviewer: — (pending the user's review).

## 2026-11-11 — `deposits.demo.json` created (DEMO)
- **Status:** `dataset_status: "demo"`. Not verified data; must not be presented as live offers.
- **ХААН банк — Энгийн хугацаатай хадгаламж:** 30d 7.20%; 60d 7.80%; 90d 9.00%; 180d 9.60%; 9m 10.20%; 365d 12.00%; 18m 12.00%; 24m 12.40%; min 20,000 MNT. All `verification_status: "demo"`.
  - Evidence: user-supplied official page link and screenshot — https://www.khanbank.com/personal/product/detail/personal-regular-term-deposit/
  - Not yet done: live page revisit, observation timestamp, channel, day-count convention, payout frequency (all recorded as `unknown`/`null`).
- **Other 11 banks:** no products entered; each carries a research note from DATA_SOURCES.md and appears under «Мэдээлэл дутуу».
- **Inflation:** 12.9% as `kind: "demo_scenario"` (CALCULATION_RULES.md example value), not an NSO CPI observation.
- Reviewer: — (pending human verification).
