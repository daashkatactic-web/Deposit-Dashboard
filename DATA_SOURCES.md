# DATA_SOURCES — evidence register and update process

## Scope and data status
Research roster of 12 Mongolian commercial banks (verify roster directly with the Bank of Mongolia at final data freeze). **This file is not a completed verified rate database.** Bank rates previously mentioned in discussion include unverified/incompletely cross-checked values; they MUST NOT be promoted into live JSON from those summaries alone.

**Phase 2 status (2026-11-11):** every official page below was opened and read on 2026-11-11; values are in `data/deposits.json` and the per-bank evidence is in `data/VERIFICATION_LOG.md`. **Phase 4A roster reconciliation (2026-11-11):** the Bank of Mongolia page «Банкны үйл ажиллагаа эрхлэх зөвшөөрөл» (https://www.mongolbank.mn/mn/p/1463, read 2026-11-11) lists exactly 12 licensed banks — ХААН, Худалдаа хөгжлийн, Голомт, Хас, Төрийн, Тээвэр хөгжлийн, Ариг, Чингис хаан, Капитрон, Үндэсний хөрөнгө оруулалтын, Богд, М банк — the same 12 as this roster (none missing, none extra). The page shows no «last updated» date, so the reconciliation is valid as of the reading date only. The same page restricts Чингис хаан банк's deposit licence to «Зөвхөн гадаадын харьяат иргэд, байгууллагад мөнгөн хадгаламжийн үйлчилгээ үзүүлэх», which independently supports its D9 exclusion. Banks under forced liquidation are listed separately (https://www.mongolbank.mn/mn/p/2300: Зоос, Хадгаламж, Капитал) and are out of scope.

| Bank | Official source | Status in `data/deposits.json` |
| --- | --- | --- |
| ХААН банк | https://www.khanbank.com/personal/product/detail/personal-regular-term-deposit/ | `verified` |
| Худалдаа хөгжлийн банк | https://www.tdbm.mn/mn/retail/savings/hugatsaatai/hugatsaatai-hadgalamj | `verified` (online and branch); Phase 4B: online 24 m `needs_verification` (monthly 1.006% ≠ annual 12.70%); «300,000,000₮-өөс дээш» = 36 m column only |
| Голомт банк | https://www.golomtbank.com/retail/savings/415 | `verified` (payout not stated) |
| ХасБанк | https://xacbank.mn/savings/hugatsaatai-hadgalamj | `excluded` — compound interest stated on page |
| Төрийн банк | https://www.statebank.mn/personal/product/10011 | `verified` (day intervals; payout not stated) |
| Капитрон банк | capitronbank.mn «Энгийн хугацаатай хадгаламж» page (full URL in JSON) | `verified` |
| Богд банк | https://www.bogdbank.com/product/detail/18 | `needs_verification` — simple vs compound and payout not stated |
| Ариг банк | https://www.arigbank.mn/mn/product/19/44?subId=43 («НӨХЦӨЛ» tab; summary page …/19?subId=43) | `verified` — Phase 4B: 13 day intervals 30–749 days, min 10,000 ₮; payout not stated |
| М банк | https://www.m-bank.mn/retail/savings | `verified` (month intervals + amount bonus tiers; payout not stated) |
| Тээвэр хөгжлийн банк | https://transbank.mn/citizens/deposit-account-services/term-deposit/term-deposit-savings-citizen | 3–11 m `verified`; 1–2 m `needs_verification` («хүртэл»); 12–24 m `verified` since Phase 4B (simple 14.00%, quarterly payout — not ranked, engine does not support quarterly) |
| Чингис хаан банк | https://www.ckbank.mn/product/11 | `excluded` — term deposit for foreign citizens only |
| Үндэсний хөрөнгө оруулалтын банк | https://www.nibank.mn/mn/retailsaving | 1–11 m `verified`; 12–24 m `needs_verification` (monthly/annual rate mismatch) |

Additional authority sources:
- Bank of Mongolia: https://www.mongolbank.mn/ (licensed-bank roster: https://www.mongolbank.mn/mn/p/1463)
- National Statistics Office (official CPI): https://www.1212.mn/ (record exact report or API endpoint, reference period, published date, annual y/y rate)
- Mongolian laws official register: https://legalinfo.mn/ (verify applicable interest-income withholding provisions, tax rate and effective dates prior to publishing)

## Data schema proposal (JSON)
Use versioned JSON with metadata and records, e.g.:
```json
{
  "schema_version": 1,
  "dataset_status": "demo",
  "snapshot_at": null,
  "inflation": {"annual_percent": null, "observed_period": null, "published_at": null, "source_url": null, "kind": "historical_observed"},
  "banks": [{"id": "khan", "name": "ХААН банк", "official_url": "https://www.khanbank.com/personal/product/detail/personal-regular-term-deposit/"}],
  "products": [{"id": "khan-ordinary", "bank_id": "khan", "name": "Энгийн хугацаатай хадгаламж", "currency": "MNT", "interest_type": "simple", "channel": "unknown", "customer_restriction": null, "min_principal_mnt": null, "max_principal_mnt": null, "day_count_convention": "unknown", "day_count_source_url": null, "payout_frequency": "unknown", "payment_schedule_rule": null, "rate_tiers": [], "verified_at": null, "source_url": "https://www.khanbank.com/personal/product/detail/personal-regular-term-deposit/", "verification_status": "needs_verification", "exclusion_reason": null, "rates": []}]
}
```
Rate entries must include: `source_term_value`, `source_term_unit` (`days`/`months`), day interval if any, `annual_percent`, `effective_at` if published, `observed_at`, `source_url`, `verification_status`, `min_amount_mnt`, `max_amount_mnt` if tiered, product/channel requirement and any non-standard accrual/payout rules. Do not merge demo and verified arrays; programmatically filter by status.

Status values (D12): `verification_status` ∈ `demo`, `needs_verification`, `verified`, `excluded`; `dataset_status` ∈ `demo`, `verified`. `excluded` requires an `exclusion_reason` (e.g. `compound_interest`, `restricted_customer_group`, `non_mnt`, `not_fixed_term`).

Convention and payout fields (D5, D6): `day_count_convention` is `ACT/365`, `ACT/366`, `ACT/ACT`, `30/360`, `month_fraction`, another documented value, or `unknown`; a known value needs `day_count_source_url`. `unknown` leads to labelled ACT/365 illustrative estimates only. `payout_frequency` is `at_maturity`, `monthly`, another documented frequency, or `unknown`; `payment_schedule_rule` records the bank's documented payment dates if published. `customer_restriction` is `null` for the general public, otherwise the restricted group (excluded from ranking, D9).

Phase 2 fields (approved D14 P2-A/P2-B in `CLAUDE.md`): `source_term_unit` may also be `month_interval` (with `interval` in months) or `day_interval` (with `interval` in days); `interval` is required for both. A product may carry `amount_bonus_tiers` (only bonuses the page states apply automatically by amount). `status_note` on a product or rate gives the visible reason for `needs_verification` or `excluded`; `evidence_note` records what was read and what was not applied. The dataset carries a `tax` block (rate, legal basis, source URL, verified date) and `inflation.observed_at`.

Terms are stored **as printed** by the bank (`days`, `months`, or a day/month interval with its bounds). The D1 chip-to-day mapping (`CALCULATION_RULES.md`) is applied at runtime, never written into the data as if the bank had published it.

Dataset mode (D2): the top-level `dataset_status` (`demo` or `verified`) decides which records are rankable. A `demo` dataset may be ranked in the UI only under the DEMO banner; values in a demo dataset — including the ХААН банк figures from the user-supplied screenshot — must keep `verification_status: "demo"` until reverified per the workflow below.

## Evidence and review workflow
1. Find each bank's official **ordinary fixed-term MNT** product page (not third-party aggregator as final authority).
2. Record URL, title, full product subtype, channel, amount tier, term as printed, interest rate, payout, day-count, earliest published/effective date if shown, and date/time personally checked. Save a screenshot/PDF as local evidence when lawful/practical.
3. Review whether product truly uses simple interest and whether it is open to the general public; record compound and restricted-group products as `excluded` with the reason. Record the payout frequency and the officially documented day-count convention with its source; if no convention is published, record `unknown` (do not assume one).
4. Cross-check user-shared screenshots against their exact **official page** and preserve cited page URL; a screenshot is supporting evidence, not the source URL.
5. Store manually approved, versioned JSON only. Automatic extraction in future only creates candidate diffs; require human confirmation before publishing.
6. Track every update/change in `data/CHANGELOG.md` with before/after, evidence URL, date and reviewer.
7. If page inaccessible or data ambiguous, keep marked `needs_verification`; do NOT invent or backfill missing rates from old examples.
8. Freshness (D11): a record whose `observed_at` is more than 30 days before today is flagged «Шинэчлэх шаардлагатай» in the UI (status unchanged). The reviewer should recheck it; if the recheck fails or is ambiguous, set `needs_verification`.

## Academic disclosure
Show data snapshot date, per-bank verified time and accessible links; clearly distinguish published nominal rate, modelled tax, modelled inflation and exact payout only where the product calculation rules support it. The project does not provide personal financial advice.
