# Claude Code — Deposit Dashboard project rules

## Project mission
Build a single-page, Mongolian-language term-deposit comparison dashboard for a first-semester master's course presentation. Follow the accepted scope, data safeguards, calculations and Dark Finance interface described in these files.

## Required reading order (every substantial task)
1. `CLAUDE.md` (this file)
2. `PROJECT_SPEC.md`
3. `CALCULATION_RULES.md` whenever touching calculations, sorting, dates or eligibility
4. `DESIGN_SYSTEM.md` whenever touching UI
5. `DATA_SOURCES.md` whenever touching rates, banks or inflation

If requirements conflict, stop and report the exact conflict; do not silently invent a solution. Preserve existing functionality and appearance unless a requested change explicitly supersedes these rules.

## Non-negotiable scope
- Exactly the 12 banks in the approved research roster, but the roster must be reconciled with the latest official Bank of Mongolia list before publicly calling it complete.
- Only retail MNT **ordinary/simple-interest fixed-term deposit** products, whether interest is paid at maturity or periodically (D6). Exclude compound-interest-specific deposits, products restricted to special customer groups (D9) and other types from eligible ranking; preserve excluded bank names with explanation.
- User can enter principal manually **and** change it with a synchronized range slider; term selection uses visible chips (1, 3, 6, 9, 12, 18, 24 months), matched to day-based bank terms only through the approved fixed term-mapping table (decision D1); inflation editable and sourced as default, slider range −5% … +25% (configurable, deflation allowed, D8); deposit start date defaults to today and is changeable in a collapsible «Нэмэлт тохиргоо» section (decision D4); results update immediately, no Calculate button.
- The left-hand panel is **inputs only** (including «Нэмэлт тохиргоо»). The top-right panel shows the selected bank's detailed calculation: principal, rate, gross interest, withholding tax in MNT, net interest, payout structure (principal returned at maturity, interest received during the term, total net interest, total nominal proceeds — D6), purchasing power today, real gain/loss in MNT, real return percentage, start/maturity dates and day count, calculation-convention status (bank convention vs «Жишээ тооцоо (ACT/365)», D5), and source link/date.
- Show all banks: in verified mode rank only eligible, verified offers by descending net return after tax (D17), one entry per bank (D14 P2-C); in demo mode demo offers may be ranked only under a prominent DEMO banner (decision D2); keep unranked banks visible in the three D14 (P2-D) groups with specific reasons.
- Default top-right panel to best eligible bank; clicking an eligible bank selects it without overriding the global ranking. If the selected bank becomes ineligible, select the highest-ranked eligible bank, or show the empty state when none remains (D15).
- Preserve approved Dark Finance visual language and responsive one-page layout.

## Technical constraints
- Static GitHub Pages-compatible architecture: HTML, CSS, Vanilla JavaScript (ES modules), Chart.js (a pinned copy stored locally in `vendor/`, no CDN — D12), JSON data files. Project Markdown documents live in the project root. No backend, database, Node/npm (neither build nor test tooling), PHP, React, Vue, or external credentials in browser code.
- Tests run **in the browser only** (decision D3): a `tests/tests.html` page loaded through the local static HTTP server imports the same calculation modules the app uses and shows pass/fail per case. No Node test runner.
- During development a local static HTTP server may be used to load JSON via fetch. Do not claim `file://` works reliably for fetch.
- Build/test locally first. No deployment or remote edits without express authorization.
- Keep data, calculation logic, UI rendering and chart configuration in separate modules. Escape/safely render all dynamic text. Accessible labels, keyboard navigation, responsive charts and contrast.
- Do not scrape bank websites or auto-publish unreviewed rate changes during MVP. Hybrid update = manual curated JSON now; later an optional offline/import workflow may propose changes for human review.
- Do not fabricate live bank offers, effective dates, source verification dates, inflation readings, legal exceptions or test success. Demo data MUST be explicit and must never mingle as verified live data; a demo ranking (D2) must never be presented as a verified ranking.
- Rates must be specific to bank/product/term/channel/amount eligibility; no guessed interpolation for missing months. Published term ranges keep their exact units and endpoints (D14 P2-A). Day-based terms are matched to month chips **only** via the fixed mapping table in `CALCULATION_RULES.md` (D1), and every mapped match is visibly labelled «≈ тааруулсан»; no other day↔month conversion. Only documented automatic amount bonuses are applied (D14 P2-B).
- Never alter tax rate, day-count convention, interpolation, or product eligibility silently. Document assumptions visibly in UI.
- Use each bank's officially documented day-count and interest convention. Unknown convention → ACT/365 illustrative estimate only, always labelled, never presented as a bank-calculated maturity value (D5). Unknown payout frequency → modelled at maturity only as a labelled illustrative estimate (D15).
- Keep full internal precision; round only for display, half-up to whole ₮ (D10).

## Workflow and quality gate
Before editing: inspect project structure and source data, describe change scope. After editing: run relevant checks (browser math unit tests in `tests/tests.html`, JSON validation, cross-browser/manual checks when available), verify earlier behavior, update `reports/PROJECT_REPORT.md` with completed changes, tests actually run, limitations and next steps. If checks cannot run, state that explicitly. Do not overwrite or delete unrelated files.

## Phase ordering
0. Project docs and data verification protocol.
1. Local static scaffold + demo dashboard (prominently marked DEMO).
2. Calculation tests and verified data ingestion.
3. Charts, full rates matrix, sources/limitations and accessibility tests.
4. Academic validation/reporting and optional GitHub Pages deployment only upon request.

## Approved decisions log
User-approved on 2026-11-10. These supersede any earlier wording they contradict.
- **D1 — Term mapping (Z1):** month chips map to day-based bank terms by a fixed table: 1m=30d, 3m=90d, 6m=180d, 9m=270d, 12m=365d, 18m=545d, 24m=730d. Month-denominated source terms are used directly. Mapped matches are labelled «≈ тааруулсан». Details: `CALCULATION_RULES.md`.
- **D2 — Demo ranking (Z2):** in demo mode, demo offers are ranked under a prominent DEMO banner; in verified mode only verified offers are ranked. Demo and verified records are never ranked together.
- **D3 — Testing:** browser-only tests via `tests/tests.html` on the local static server; no Node.
- **D4 — Deposit start date:** defaults to today (browser local date); user can change it in the collapsed «Нэмэлт тохиргоо» section of the left panel.

Approved on 2026-11-10 (second review):
- **D5 — Interest convention:** use each bank's officially documented day-count/interest convention. If unknown, ACT/365 may be used only as a clearly labelled illustrative estimate («Жишээ тооцоо»), never as a verified bank-calculated maturity value.
- **D6 — Periodic (monthly) payouts:** simple-interest deposits paying monthly are **included**. Show separately: principal returned at maturity, interest received during the term, total net interest, total nominal proceeds. Never imply monthly interest is paid at maturity, compounded or reinvested.
- **D7 — Inflation time convention:** month-based terms use `T = m/12`; day-based (exact or mapped) terms use `T = days/365`; each cash flow is deflated at its own date. Details in `CALCULATION_RULES.md`.
- **D8 — Negative inflation:** allowed (deflation). Slider range −5% … +25%, configurable; valid domain `q > −100%`, finite.
- **D9 — Restricted customer groups:** products limited to special groups are excluded from the general ranking with a visible reason.
- **D10 — Rounding:** full internal precision; display MNT rounded to whole tugriks, half-up (sign-symmetric, half away from zero); tested at half-unit boundaries.
- **D11 — Freshness:** data observed more than 30 days ago is flagged «Шинэчлэх шаардлагатай».
- **D13 — Confirmed interpretations (2026-11-11):** (a) half-up = sign-symmetric, half away from zero (−2.5 → −3); (b) each cash flow is deflated at its own payment date; (c) offers with unknown convention may be ranked, labelled «Жишээ тооцоо (ACT/365)»; (d) data older than 30 days stays rankable and is only flagged; (e) D1 step 3 — a mapped day count inside a published day interval uses that interval's rate.
Approved on 2026-11-11 (Phase 2 finalization):
- **D14 — Phase 2 data rules:**
  - (P2-A) Officially published term ranges are accepted and stored with their exact published units and endpoints (`day_interval` in days, `month_interval` in months). Days and calendar months are never equated except by the D1/Z1 table (reconciled: Z1 stays the single approved project mapping, always labelled «≈ тааруулсан»). Any other or ambiguous day↔month equivalence is treated as unverified.
  - (P2-B) Only publicly documented, automatic amount-based bonuses are applied; discretionary and customer-tier bonuses are excluded.
  - (P2-C) Per bank, the most favorable eligible verified product is ranked; each bank is ranked once; product name, channel and rate components (base + bonus) are shown.
  - (P2-D) Every bank is shown; unranked banks are grouped as eligibility failure («Шаардлага хангахгүй»), missing verification («Баталгаажаагүй / мэдээлэл дутуу») or unavailable term («Энэ хугацаанд санал зарлаагүй»), each with an explanation.
- **D15 — Resolved open items:** (1) if the selected bank becomes ineligible, select the highest-ranked eligible bank, or show the empty state; (2) month-end clamping for illustrative dates unless official bank terms say otherwise; (3) start date defaults to today, editable (confirms D4); (4) unknown payout frequency may be modelled at maturity only as a prominently labelled illustrative estimate; (5) compound interest is never calculated for compound-interest products — they are excluded; (6) official sources, verification dates and every unverified status are preserved; (7) an illustrative estimate is never presented as an exact bank payout; (8) day-based term mapping reconciled with Z1 as in D14 (P2-A).
Recorded on 2026-11-11 (Phase 4B):
- **D16 — Interim accrual convention:** the growth chart's modelled interim accrual follows the offer's interest convention (`month_fraction` → elapsed months / period months; other conventions → their year fraction). Payments, maturity values, ranking and CSV figures are unchanged. Origin: the Phase 4B task asked for convention-consistent interim accrual; asked to choose, the user gave no preference, so the requested behaviour was implemented and documented here and in `CALCULATION_RULES.md`. Revert by restoring the day proportion if the user decides otherwise.
Recorded on 2026-11-24 (UI/UX redesign, user specification):
- **D17 — Ranking by net return; optional inflation:** banks are ranked by net return after tax (`totalNetInterest / principal`, whole term, full precision; also used to pick each bank's best product, P2-C), not by real return. Inflation is off by default («Инфляц тооцох» checkbox, separate UI state); when on, the real metrics appear only in the selected bank's card and never change the ranking, charts, net return or final amount. Supersedes the real-return ranking wording in this file, `PROJECT_SPEC.md` and `CALCULATION_RULES.md`. Calculation engine, tax, conventions, term mapping, bonuses and eligibility are unchanged. Details: `UI_REDESIGN_REPORT.md`.
- **D12 — Statuses and assets:** `verification_status` ∈ `demo`, `needs_verification`, `verified`, `excluded`; Chart.js stored locally in `vendor/`; project Markdown documents in the project root.

Respond to the user in Mongolian; use English internally for code identifiers where useful.
