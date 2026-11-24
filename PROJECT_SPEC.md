# PROJECT_SPEC — Master's term deposit dashboard

## Objective
Design and validate a single-page responsive interactive dashboard that compares ordinary/simple-interest MNT fixed-term deposit offers among Mongolia's commercial banks using sourced published rates, interest-income tax and inflation-adjusted purchasing-power calculations.

## Audience and delivery
- Primary: lecturer assessing a first-semester master's project; secondary: prospective depositors.
- Delivery: local browser demo, then optional GitHub Pages public static deployment.
- Architecture: static HTML, CSS, Vanilla JavaScript (ES modules), Chart.js and JSON data files; no backend, no Node/npm build or test tooling (see `CLAUDE.md`).
- User interface: Mongolian. Academic output: methodology, at least 5 independently checked calculations, usability trials with 3–5 people, Lighthouse checks where available, limitations and presentation.

## Scope
- Research roster: 12 commercial banks listed in `DATA_SOURCES.md`; validate official roster near the final data freeze.
- Retail ordinary fixed-term MNT deposits only, with interest paid at maturity or periodically (monthly payouts included, D6). No special compound-interest product and no product restricted to special customer groups (D9) in the general ranking; both are listed with reasons.
- Compare bank-announced terms available within 1–24 months. UI quick-choice buttons: 1, 3, 6, 9, 12, 18, 24 months; term matching uses source terms as printed plus the approved fixed day mapping (D1: 30/90/180/270/365/545/730 days) defined in `CALCULATION_RULES.md`, with mapped matches visibly labelled.
- Important (D14 P2-C): one bank can have multiple eligible products or channels; choose the most favorable eligible rankable offer (verified, or demo in demo mode — D2) per bank for the user's principal/term, disclosing its exact product, channel and rate components (base rate + automatic bonus). Rank each bank once.
- Online vs branch, minimum balance, rate tiers, customer eligibility, deposit payout method and term-day conventions must be captured. Calculations use each bank's officially documented convention; unknown conventions give labelled ACT/365 illustrative estimates only (D5).
- Default inflation from a dated, explicitly sourced NSO CPI observation; editable scenario input; future inflation is a scenario, not a guaranteed forecast.
- Interest-income withholding tax: 10%, verified 2026-11-11 in the Personal Income Tax Law (legalinfo.mn/mn/detail/14410, arts. 9.1.4, 16.1.4, 21.2.4, 25.2); show tax amount in MNT. Recheck before presenting terms maturing after 2027-01-01 (art. 21.1 amendment).
- Bonuses (D14 P2-B): only publicly documented automatic amount-based bonuses are applied; discretionary and customer-tier bonuses are excluded.

## Interaction contract
1. Principal: text/number input allows user-specified valid amounts; slider 0–100,000,000 MNT, increments 500,000 MNT; entering >100m remains valid if product permits it, and the slider thumb visually caps at max while preserving the typed number. Show when manual amount exceeds slider range. Never silently clamp typed valid value.
2. Term: 1/3/6/9/12/18/24 visible buttons. On change, recompute eligibility and ranking, not only a selected bank's forecast. Matching follows D1 and D14 (exact month → published month range → mapped days → mapped day interval → «саналгүй»).
2a. Deposit start date (D4, D15): defaults to today; optional editable date, changeable in a collapsed «Нэмэлт тохиргоо» section of the left panel. Changes recompute day counts, maturity dates and results instantly; invalid input falls back to today with a visible note.
3. Inflation (D8): sourced default value, date displayed, editable slider/input. Slider range −5% … +25% (configuration constants, not hard-coded in markup); negative values model deflation and are labelled «Дефляци». A valid manual scenario beyond the slider (finite, > −100%) is allowed without conflating it with the last published CPI; invalid input shows a message and is not silently clamped.
4. All values update instantly; debounced only if needed for rendering, not a submit button.
5. Initial top-right details = #1 eligible bank. Selecting a ranked bank updates only selected details and growth chart. If the selected bank becomes ineligible, the highest-ranked eligible bank is selected, or the empty state is shown when none remains (D15). Selected bank may differ from #1; prominently label **Сонгосон банк** rather than inaccurately calling it #1.
6. Ranking: descending real return for common principal, term and inflation scenario. Tie-break by total net MNT interest then name; indicate true ties where rounding hides a difference.
7. Dataset mode (D2): with a demo dataset, demo offers are ranked under a prominent DEMO banner; with a verified dataset, only verified offers are ranked. Never mix the two.
8. Show all banks (D14 P2-D): eligible banks are ranked; every other bank appears once in a separate section, grouped as «Шаардлага хангахгүй» (eligibility failure: excluded product type, restricted customer group, amount limits, unsupported payout), «Баталгаажаагүй / мэдээлэл дутуу» (missing verification) or «Энэ хугацаанд санал зарлаагүй» (unavailable term), each with a specific explanation. No fabricated ranking, no missing-bank disappearance.

## Information hierarchy (desktop)
A. Header: project name, source snapshot date, inflation reference date and DEMO/verified indicator.
B. Left sidebar (~32%): amount input and slider; term chips; inflation control; fixed tax label; collapsed «Нэмэлт тохиргоо» with deposit start date (no financial output in left panel).
C. Top right (~68%): featured selected-bank summary, including all tax and real-purchasing-power metrics, payout structure (D6: principal returned at maturity, interest received during the term, total net interest, total nominal proceeds), start/maturity dates and day count, «≈ тааруулсан» label when the term is mapped, «Жишээ тооцоо (ACT/365)» label when the bank convention is unknown (D5), «Шинэчлэх шаардлагатай» when data is older than 30 days (D11), and product/source conditions.
D. Full-width all-bank ranking (bar chart/table) with clickable rows.
E. Two side-by-side charts: term-versus-annual-interest curve (up to 5 prominent banks by default, others toggleable); selected-bank maturity growth including principal and real purchasing-power value. Partial monthly trajectories must be labelled modelled accrual, not paid cash flows; for periodic-payout products, interest already paid out is shown as a separate cumulative "received" series, never added onto the deposit balance or compounded (D6).
F. Full rates matrix 1–24m: missing entries shown as em-dash or 'саналгүй', no linear interpolations.
G. Methodology, official sources with direct clickable URLs, last verified dates, limitations, export CSV if feasible.

## Acceptance criteria
- Every displayed rate has source URL, product identifier, channel and verification date; demo values visibly labelled.
- A typed principal and slider stay synchronized; term chips and inflation changes recompute results automatically.
- The selected bank detail includes gross interest, 10% tax (assuming rule verified for scenario), net interest, the D6 payout breakdown, today's purchasing power, real MNT gain/loss and real % return. Illustrative (ACT/365) results are never worded as bank-calculated maturity values (D5).
- MNT values display as whole tugriks rounded half-up from full-precision internal values (D10); rounding tests pass at half-unit boundaries.
- In verified mode only verified, eligible simple-interest products appear in the ranking; in demo mode the ranking contains only demo records and is visibly marked DEMO (D2). All 12 banks appear somewhere with explanatory status.
- No fake bank values, no unsupported terms, no stale-inflation-as-future-certainty. Every mapped term (D1) is labelled «≈ тааруулсан»; every month-range match is labelled «Сарын интервал»; every assumed payout is labelled «Хүү олгох хэлбэр тодорхойгүй». An illustrative estimate is never presented as an exact bank payout (D15).
- Unit tests, run in the browser via `tests/tests.html` (D3): >=5 manual comparison cases including normal 12m, subannual term, inflation loss, missing term, amount-threshold exclusion (plus day-count, term-mapping, start-date and invalid input tests; full list in `CALCULATION_RULES.md`).
- Mobile layout stacks sidebar and summary, keeps tables horizontally scrollable without clipping or unreadable 8px text.
- Source and assumption notes are accessible during class demonstration.

## Resolved items (2026-11-11)
Moved to the decisions log in `CLAUDE.md`: selection fallback, month-end clamping, start date, unknown payout and Phase 2 rules P2-A…D (D14, D15). Z1/D1 was reconciled with P2-A: Z1 remains the only approved day↔month equivalence.

## Open items (not yet approved — do not implement as final)
Until approved, any use must be visibly labelled as a provisional assumption.
- Allowed start-date range (past dates? far-future dates?). Provisional: any valid calendar date 1900–2200.
- Local static server tool: Python `http.server` is used in development (`.claude/launch.json`); must not introduce Node into the project. Confirm for the final submission.
- Quarterly payout (Тээвэр 12–24 m) is not supported by the engine; those records stay `needs_verification` until the bank's method is confirmed.

Data items to resolve with banks (not specification decisions) are listed in `data/VERIFICATION_LOG.md` and `reports/PROJECT_REPORT.md`.

## Out of scope
Login, admin CMS, MySQL, automated live scraping, paid subscriptions, individual depositor data, investment recommendations, cloud backend. These can be considered after academic defense.
