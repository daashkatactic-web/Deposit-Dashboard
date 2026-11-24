# Verification log — Phase 2 (2026-11-11)

Each official page was opened in a browser and read by Claude on **2026-11-11**. No aggregator was used as a source. Figures below are transcribed as printed. Human reviewer: — (pending the user's review).

Common to all banks:
- **Day-count convention:** none of the pages states one → `day_count_convention: "unknown"` → every result is an illustrative ACT/365 estimate («Жишээ тооцоо (ACT/365)», D5).
- **Discretionary bonuses** («…салбарын / холбогдох нэгжийн зөвшөөрлөөр … хүртэл нэмж болно») and customer-tier bonuses are **not** applied.
- Effective dates of the rates are not printed on any page → `effective_at: null`.

## 1. ХААН банк — `verified`
- URL: https://www.khanbank.com/personal/product/detail/personal-regular-term-deposit/
- Product: Энгийн хугацаатай хадгаламж. Page: «1-24 сар хүртэлх хугацаагаар, хүүгээ хугацааны эцэст тооцуулан авах» → payout `at_maturity` (quarterly only by mutual agreement — not modelled).
- MNT rates (min balance 20,000 ₮): 30 хоног 7.20%; 60 хоног 7.80%; 90 хоног 9.00%; 180 хоног 9.60%; 9 сар 10.20%; 365 хоног 12.00%; 18 сар 12.00%; 24 сар 12.40%. Early-termination rate 2.4%.
- Channel: internet bank/app and branch (`any`). Matches the user's Phase 1 screenshot exactly.
- Not applied: up to +3% for deposits above 100,000,000 ₮ «банкны холбогдох салбар нэгжийн зөвшөөрлөөр».

## 2. Худалдаа хөгжлийн банк — `verified` (2 products)
- URL: https://www.tdbm.mn/mn/retail/savings/hugatsaatai/hugatsaatai-hadgalamj
- Page: «тодорхой хугацааны эцэст өндөр хүү тооцуулж авах» → `at_maturity`. Min balance 10,000 ₮.
- Online: 1 сар 7.80%; 2 сар 8.40%; 3 сар 9.60%; 6 сар 10.20%; 9 сар 10.50%; 12 сар 12.30%; 18 сар 12.30%; 24 сар 12.70%.
- Branch: 7.70%; 8.30%; 9.50%; 10.10%; 10.40%; 12.20%; 12.20%; 12.60%; 36 сар 12.70%.
- Unresolved: a line «300,000,000₮-өөс дээш» appears under the minimum balance without explanation; not modelled. Not applied: up to +3.0% by approval (50m UB / 20m rural).
- Note: the monthly-rate row on the page (e.g. 0.65%) is informational; annual rates are used.

## 3. Голомт банк — `verified`
- URL: https://www.golomtbank.com/retail/savings/415
- MNT (min 10,000 ₮): 1 сар 7.40%; 2 сар 8.00%; 3 сар 9.20%; 6 сар 9.80%; 9 сар 10.30%; 12 сар 12.10%; 18 сар 12.10%; 24 сар 12.50%.
- Payout frequency and channel not stated → `unknown` (modelled at maturity, labelled). Not applied: up to +4.5% by approval.

## 4. ХасБанк — `excluded` (compound_interest)
- URL: https://xacbank.mn/savings/hugatsaatai-hadgalamj
- Page: «Хүүг нийлмэл аргаар буюу хүүнээс хүү боддог»; announced 9.0%–12.0%, effective 9.38%–12.68%; 3–24 сар; min 20,000 ₮.
- The savings overview page (https://xacbank.mn/mn/savings) lists no simple-interest ordinary term deposit. Bank stays visible with this reason.

## 5. Төрийн банк — `verified`
- URL: https://www.statebank.mn/personal/product/10011 («Нөхцөл» tab)
- MNT (min 10,000 ₮): 30–59 хоног 7.50%; 60–89 8.10%; 90–179 9.30%; 180–269 9.80%; 270–364 10.40%; 365–539 12.20%; 540–729 12.20%; 730 хоног 12.30%.
- Payout and channel not stated → `unknown`. Not applied: up to +3.50% for 100m (UB) / 50m (rural) by approval.

## 6. Капитрон банк — `verified`
- URL: capitronbank.mn → Хадгаламж → Хугацаат хадгаламж → «Энгийн хугацаатай хадгаламж» (exact encoded URL stored in JSON).
- Page: «хугацааны эцэст хуримтлагдсан хүүгээ авах» → `at_maturity`. Min 10,000 ₮.
- MNT: 1 сар 8.40%; 2 9.00%; 3 9.80%; 4 10.00%; 5 10.20%; 6 10.50%; 7 10.80%; 8 11.00%; 9 11.60%; 10 12.00%; 11 12.40%; 12 13.20%; 18 13.40%; 24 13.60%. Early termination 2.50%.

## 7. Богд банк — `needs_verification`
- URL: https://www.bogdbank.com/product/detail/18 («Бүтээгдэхүүний нөхцөл» tab)
- MNT (min 10,000 ₮): 7–13 хоног 6.50%; 14–29 7.00%; 30–59 8.00%; 60–89 8.50%; 90–179 9.50%; 180–269 10.80%; 270–364 11.50%; 365–545 12.50%; 546–729 12.70%; 730–1094 13.00%.
- Reason not verified: the page does not say whether interest is simple or compound, and the «Хүү олгох хугацаа» field is empty. Rates are stored but not ranked. Not applied: 0.1%–2.8% promotional bonus by amount.

## 8. Ариг банк — `verified`
- URL: https://www.arigbank.mn/mn/product/19?subId=43
- «Энгийн хугацаатай хадгаламж» MNT: 365–389 хоног 14.0%; 390–539 хоног 14.2%; 540–719 хоног 14.3%. No rates for shorter terms or for 730 days (chips 1–9 and 24 → «саналгүй»).
- Unresolved: minimum balance, payout frequency and channel are not stated (the featured panel shows a note about the minimum).

## 9. М банк — `verified`
- URL: https://www.m-bank.mn/retail/savings (digital deposit opened in the app → channel `online`)
- MNT (min 10,000 ₮): 1 сар – 2 сар 8.0%; 2 сар 1 хоног – 3 сар 8.5%; …3 сар 1 хоног – 4 сар 9.5%; – 5 сар 10.0%; – 6 сар 10.3%; – 7 сар 10.7%; – 8 сар 11.0%; – 9 сар 11.2%; – 10 сар 11.5%; – 11 сар 11.5%; – 12 сар 12.0%; 12 сар 1 хоног – 18 сар 12.5%; 18 сар 1 хоног – 24 сар 12.7%; 24 сар 1 хоног – 24 сар 30 хоног 13.0% (not stored — no chip falls in it).
- «Нэмэлт хүү» by amount (applied, P2-B): 20,000,000–49,999,999 ₮ +0.15%; 50,000,000–99,999,999 ₮ +0.30%; «₮100,000,000-с дээш» +0.5% (interpreted as ≥ 100,000,000 ₮ — assumption).
- Not applied: Pro/Max/Ultra/Prestige tier bonus (0.1–0.3%) and up to +4% for high balances. Payout not stated → `unknown`.

## 10. Тээвэр хөгжлийн банк — split
- URL: https://transbank.mn/citizens/deposit-account-services/term-deposit/term-deposit-savings-citizen (min 10,000 ₮)
- 1 сар and 2 сар: «10.50% хүртэл» → `needs_verification` (an upper bound, not a fixed rate).
- 3 – 6 сар 11.00%; 7 – 9 сар 11.50%; 10 – 11 сар 12.00% → `verified`; page: «1-11 сарын хугацаатай хадгаламжид хугацааны төгсгөлд» → `at_maturity`.
- 12 сар, 13 – 18 сар, 19 – 24 сар: nominal 14.00%, «Бодит хүү» 14.75%; «12–24 сарын хугацаатай хадгаламжид улирал бүр» interest paid → `needs_verification`: 14.75% equals quarterly compounding of 14% (1.035⁴ − 1), so the interest method must be confirmed; quarterly payout is also not supported by the engine.

## 11. Чингис хаан банк — `excluded` (restricted_customer_group)
- URL: https://www.ckbank.mn/product/11 — «Хадгаламжийн данс /Гадаад иргэдийн/».
- The personal «Дансны үйлчилгээ» menu (https://www.ckbank.mn/product/4) has no other term deposit; this one is for foreign citizens (min 1,000,000 ₮). Rates recorded for reference: 1 сар 5.80%; 2 сар 6.40%; 3-5 сар 7.20%; 6-8 сар 9.00%; 9-11 сар 9.80%; 12 сар 11.20%; 18 сараас дээш 11.20%.

## 12. Үндэсний хөрөнгө оруулалтын банк — split
- URL: https://www.nibank.mn/mn/retailsaving («Нөхцөл:» table; min 20,000 ₮)
- MNT annual: 1 сар 7.0%; 2 7.0%; 3 8.0%; 4 10.0%; 5 10.0%; 6 10.0%; 7 11.0%; 8 11.0%; 9 11.0%; 10 11.5%; 11 11.5% → `verified`.
- 12 сар 12.0%; 13-18 сар 12.0%; 19-24 сар 12.0% → `needs_verification`: the page's monthly-rate column shows 0.96% for these rows (≈ 11.5% a year), which contradicts 12.0%.
- The page's PDF link (https://www.nibank.mn/files/orgsavingfile.pdf) concerns organisation savings and was not used. Payout and channel not stated.

## Tax — verified
- Source: Хувь хүний орлогын албан татварын тухай хууль (2019-03-22), https://legalinfo.mn/mn/detail/14410
- 9.1.4: interest income is capital income; 16.1.4: taxed on the gross amount; 21.2.4: 10%; 25.2: the bank withholds each time it calculates interest on a deposit. 22.1 (exemptions) has no exemption for bank-deposit interest (22.1.5 concerns government / Development Bank bonds).
- Monitoring: 21.1 was rewritten by the law of 2026-06-26, effective 2027-01-01 (progressive bands for 21.1 income); 21.2.4 was not changed by it. Recheck before any term that matures after 2027-01-01 is presented as final.

## Inflation — verified observation
- Source: ҮСХ, «Хэрэглээний үнийн улсын индексийн өөрчлөлт, бүлгээр, өмнөх оны мөн үетэй харьцуулснаар», base 2023=100, Ерөнхий индекс — https://www.1212.mn/mn/statcate/table-view/Economy%2C%20environment/Consumer%20Price%20Index/DT_NSO_0600_010V1.px
- 2026-10: **13.4%** y/y (2026-09: 12.9%). The 1212.mn home dashboard shows the same 13.4% dated 2026-10-31. Publication date is not shown in the table → `published_at: null`.
- Used as the default scenario only (historical observation, not a forecast).

## Phase 4A addendum (2026-11-11) — roster and link check, no data change
- **Bank of Mongolia roster:** https://www.mongolbank.mn/mn/p/1463 («Банкны үйл ажиллагаа эрхлэх зөвшөөрөл»), read 2026-11-11. Section 1 lists 12 banks with licence certificates: ХААН банк (1991.12.05), Худалдаа хөгжлийн банк (1993.05.29), Голомт банк (1995.03.06), Хас банк (2001.12.27), Төрийн банк (2009.11.23), Тээвэр хөгжлийн банк (1997.01.22), Ариг банк (1997.10.21), Чингис хаан банк (2003.10.31), Капитрон банк (2001.11.12), Үндэсний хөрөнгө оруулалтын банк (2001.11.20), Богд банк (2014.12.17), М банк (2022.02.09). This equals the project roster of 12.
- Section 2 of the same page: Чингис хаан банк's deposit permission reads «Зөвхөн гадаадын харьяат иргэд, байгууллагад мөнгөн хадгаламжийн үйлчилгээ үзүүлэх» — consistent with `exclusion_reason: restricted_customer_group`.
- The page has no publication/update date; treat the reconciliation as of 2026-11-11.
- **Links:** all 12 bank source URLs and the legalinfo.mn, 1212.mn and mongolbank.mn references returned HTTP 200 on 2026-11-11. This confirms reachability only; the rates were **not** re-read in Phase 4A, so no figure was changed.

## Phase 4B addendum (2026-11-11) — final data audit
Every official page was re-read on 2026-11-11 (static HTML via HTTP, JavaScript-rendered pages in Chrome). Each stored MNT rate was matched against the page in order.

**Transcription re-check — all stored rates match:** ХААН (8), ХХБ online (8) and branch (9), Голомт (8), Төрийн (8), Капитрон (14), Богд (10), М банк (13), Тээвэр (8), Чингис хаан (7), ҮХОБ (14, from the image `https://www.nibank.mn/images/retail/rtsavingt.png`, sha256 `71b7ae6b4a2e21ce9e5443af582f61d4830461912405ee72bd9bf31ccd691c38`), Ариг (3 → see below). ХасБанк: still «нийлмэл» (9.0%–12.0% announced, 9.38%–12.68% effective).

### The six outstanding cases
1. **Богд банк — unresolved, stays `needs_verification`.** The «Бүтээгдэхүүний нөхцөл» tab still does not say simple or compound; the comparison row «Хүү олгох хугацаа» is still empty. The bank's separate «Урьдчилсан хүүт» product and its «Хүүгээс хүү тооцох» calculator do not settle this product. Rates re-confirmed.
2. **Тээвэр хөгжлийн банк.**
   - 1 and 2 сар: still «10.50% хүртэл» (upper bound) → stays `needs_verification`.
   - 12–24 сар: **resolved** → `verified`. Page text: «Харилцагч Та өөрийн харилцах дансанд хүлээн авсан хүүгээ тухайн өдрөө хадгаламжийн данс руугаа буцаан орлогодсоноор “Бодит хүү”-гээр өгөөж хүртэх боломжтой болно. Хэрэв … буцаан орлогодохгүй тохиолдолд “Нэрлэсэн хүү”-ээр өгөөж тооцогдоно.» → simple interest at 14.00% nominal, paid quarterly to the current account; 14.75% requires the customer's own reinvestment and is not modelled (D6, D15). Not ranked: the engine does not support quarterly payout (supporting it would need a new decision).
3. **Үндэсний хөрөнгө оруулалтын банк — unresolved.** The conditions table is an image; it still shows 12 сар / 13–18 / 19–24 сар «Жилийн хүү 12.0%» with «Сарын хүү 0.96%» (≈ 11.52% a year). The 1–11 сар rows are consistent (e.g. 7.0% / 0.58%). 12–24 сар stays `needs_verification`.
4. **Ариг банк — minimum resolved, payout unresolved.** The product detail page https://www.arigbank.mn/mn/product/19/44?subId=43 has a «НӨХЦӨЛ» table: 30–59 хоног 9.0%; 60–89 9.5%; 90–179 10.7%; 180–209 11.2%; 210–239 11.6%; 240–269 11.8%; 270–299 12.0%; 300–329 12.2%; 330–364 12.4%; 365–389 14.0%; 390–539 14.2%; 540–719 14.3%; 720–749 14.4%; «Дансны доод үлдэгдэл 10,000 төгрөг»; «Гэрээ цуцалсан тохиолдолд олгох хүү 2.5%» (the FAQ on the same page says 4% — conflict noted, not used). The summary page shows only 365–719 days; the three overlapping rates are identical. Payout frequency and channel are still not stated → `unknown`, modelled at maturity with the label.
5. **Худалдаа хөгжлийн банк — 300M resolved, new issue found.** The HTML table has 11 columns (Хугацаа, Үйлчилгээ авах суваг, 1, 2, 3, 6, 9, 12, 18, 24, 36 сар). The «Доод үлдэгдэл» row is `10,000 ₮` with `colspan="9"` (channel … 24 сар) and `300,000,000₮-өөс дээш` in the last (36 сар) cell → the 300M minimum belongs to the 36-month (branch) term, outside the 1–24 month scope. New: the monthly-rate row shows online 24 сар **1.006%** (≈ 12.07% a year) against annual **12.70%**; branch 24 сар 1.05% ↔ 12.60% is consistent. Online 24 сар → `needs_verification` (same rule as ҮХОБ); the branch 12.60% now represents ХХБ at 24 сар.
6. **М банк — documented assumption, unchanged.** Mongolian «₮100,000,000-с дээш», English «More than ₮100,000,000». The tier before it ends at ₮99,999,999, so ≥ 100,000,000 is kept; only a deposit of exactly 100,000,000 ₮ depends on this reading. Payout still not stated.

### Other references
- **Tax:** legalinfo.mn/mn/detail/14410 re-read: 16.1.4 gross interest; 21.2.4 «… орлогын дүнд 10 хувиар» unchanged; the 21.1 amendment of 2026-06-26 takes effect 2027-01-01 and does not change 21.2.4.
- **Inflation:** 1212.mn dashboard «2026-10-31 Инфляцын түвшин 13.4%» — unchanged; no newer month published.
- **Links:** all 12 bank pages, the Ариг detail page, legalinfo.mn, 1212.mn and mongolbank.mn were reachable on 2026-11-11.
