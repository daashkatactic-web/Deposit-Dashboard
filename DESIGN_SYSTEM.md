# DESIGN_SYSTEM — Dark Finance

## Visual direction
Use the user's approved dark navy financial analytics composition (not a generic landing page). Dense enough for a desktop academic demo but clean, premium and readable.

## Tokens
- Page background: `#0B1220`
- Cards/panels: `#172338`
- Input background: `#101B2C`
- Card border/divider: `#2A3B51`
- Primary teal: `#2DD4BF`
- Primary interactive dark teal: `#0F766E`
- Secondary chart blue: `#60A5FA`
- Positive profit/return: `#5EEAD4`
- Negative return/tax: `#FB7185`
- Warning/uncertain: `#FBBF24`
- Main text: `#F8FAFC`
- Muted text: `#94A3B8`
- Top selected-bank feature background: subtle deep-teal/green (`#12332F` / `#123D3C`) with border `#23635D`.

## Layout
- Max desktop width around 1500px with 16–24px gutters; no cramped panels.
- First screen: title and data timestamp; **left sidebar inputs 32–35%**, **right featured bank 65–68%**. Top summary is NOT under calculator.
- Sidebar: manual MNT input + synchronised horizontal slider; visible term-chip grid (1/3/6/9/12/18/24); dated inflation slider + manual field; 10% tax informational label; collapsed «Нэмэлт тохиргоо» section (D4) containing the deposit start date field (default today). No gross/net/final output in left panel.
- Right featured panel: selected bank identity, rate, gross, tax in red, net in green, final amount prominent, real purchasing power, real MNT gain/loss, real percent, product, start → maturity date with day count, data date and direct official source link.
- Payout breakdown block in the featured panel (D6), four labelled rows using existing tokens: «Хугацааны эцэст буцаан олгох үндсэн дүн», «Хугацааны явцад авах хүү», «Нийт цэвэр хүү», «Нийт нэрлэсэн орлого». For at-maturity products the «явцад авах хүү» row shows 0 ₮ with the note «Хүүг хугацааны эцэст олгоно». For monthly payout products show payment count and frequency (e.g. «12 удаа, сар бүр»); the prominent final figure is total nominal proceeds, never labelled as a single maturity payment.
- Below: entire bank ranking; two aligned charts; rate matrix; sources/methodology footer.
- Default best bank gets #1 highlight. When user selects another bank, highlight selected card but preserve #1 rank in leaderboard.

## Components and interactions
- Card radius 12–16px; modest shadows; subtle borders; no excess gradients.
- Amount input must be editable by keyboard and numeric; slider should show endpoints and a capped-range hint if typed amount >100m.
- Term buttons clearly visible, selection teal with high contrast; unavailable term does not become fictional value.
- Mapped term badge (D1): wherever a rate comes from the fixed day mapping, show an amber (`#FBBF24`) «≈ тааруулсан» badge with text, plus the printed source term (e.g. «365 өдөр → 12 сар») in a tooltip/caption; never colour-only. Applies to featured panel, ranking rows, rate-matrix cells and chart tooltips.
- Status badges, all amber (`#FBBF24`) text badges, never colour-only: «Жишээ тооцоо (ACT/365)» when the bank convention is unknown (D5); «Шинэчлэх шаардлагатай» when data is older than 30 days (D11). Excluded products show their reason as text («Нийлмэл хүүтэй», «Тусгай бүлэгт зориулсан», …) in the non-ranked section.
- Inflation control (D8): slider −5% … +25% with a visible 0% tick, endpoints labelled, plus manual field; when the value is negative show the text label «Дефляци». A manual value outside the slider range keeps the thumb at the end and shows a hint, like the amount slider.
- «Нэмэлт тохиргоо» (D4): a disclosure control (`<details>`/button with `aria-expanded`), collapsed by default, keyboard operable, using input tokens. Start date uses a native date input with a Mongolian label «Хадгаламж эхлэх огноо», a «Өнөөдөр» reset action, and an amber inline note when an invalid value fell back to today. When the date differs from today, show a small summary under the collapsed header so the changed setting is not hidden.
- Banks clickable via accessible table rows or explicit select buttons; keyboard activation supported.
- Charts with legible axes/tooltips, unobtrusive grids, legends. Show units and distinction between nominal annual % and term-specific real %.
- Selected growth chart: net accrual trajectory vs principal vs today's-value purchasing-power series; distinguish an *illustrative projected balance* from paid-out sums. For periodic-payout products (D6), principal stays flat and interest already paid is a separate cumulative «Авсан хүү» series (e.g. stepped line in secondary blue `#60A5FA`); it is never stacked onto the balance as if reinvested.
- Table: sticky header where feasible; desktop can show several columns; mobile horizontal scroll with preserved accessible labels.
- DEMO banner highly visible when demo sources are loaded. In demo mode (D2) the ranking section heading and every ranked row also carry a «DEMO» tag, so a screenshot of the ranking alone cannot be mistaken for verified data. Missing source/verification states in amber, not hidden.
- All interface text Mongolian; use sensible Mongolian money formatting (`22,000,000 ₮`), minus sign for losses and % with two decimals where useful. MNT shown as whole tugriks, half-up rounded (D10); the methodology note states that independently rounded figures may differ by ±1 ₮.
- These additions use only the existing tokens and components above; the Dark Finance palette and layout are unchanged.

### Phase 3 charts and rate matrix (2026-11-11)
- **Ranking bars:** horizontal bars of the selected-term real return; positive `--positive` with ▲ and signed value, negative `--negative` with ▼ (never colour only). #1 bar has a teal outline and teal label; the selected bank a white outline and «●». Clicking a bar selects the bank (same as the table's «Сонгох» button, which remains the keyboard path).
- **Chart series palette** (term curve only; one fixed colour per bank in dataset order, chosen for contrast on `--card`): `#2DD4BF`, `#60A5FA`, `#FBBF24`, `#F472B6`, `#A78BFA`, `#FB923C`, `#A3E635`, `#38BDF8`, `#E879F9`, `#34D399`, `#FDE047`, `#CBD5E1`. Point shape also encodes the match type: ● published month, ◆ month interval, ▲ «≈ тааруулсан» (amber outline). Lines are dashed connectors only; a missing term is a gap.
- **Growth chart:** principal `--muted` solid; total nominal proceeds `--teal` dashed (modelled accrual) with ● at payment dates; cumulative paid-out interest `--blue` stepped on a separate right axis; purchasing power `#A78BFA`. HTML legend and a data table (in a `<details>`) accompany the canvas.
- **Rate matrix:** sticky bank column; verified value in `--text`, unverified in `--warn` with the word «баталгаажаагүй», excluded struck through in `--muted` with «хасагдсан», absent «—» (screen-reader text «саналгүй»). The selected term column header uses the teal chip style.
- Chart canvases carry `role="img"` and a generated `aria-label` summary; checkboxes act as the accessible legend of the term curve.

### Bank logos (2026-11-11)
- Official logos only, stored in `assets/banks/` (provenance in `assets/banks/README.md`), mapped by bank ID through `js/banklogos.js` (`bankLogo()`).
- Sizes: featured panel 40×40, ranking table and non-ranked list 24×24, rate matrix 20×20. Each logo sits on a small neutral light plate (`--text`, radius 5–8px) with `object-fit: contain`. Logos are never stretched, cropped or recoloured, and the bank name always stays as visible text next to the logo.
- Missing or broken file: a monogram tile (`--input` background, `--muted` letters) replaces it.
- No logos inside Chart.js canvases. The term-curve checkboxes keep only the colour swatch, because adding logos there did not improve readability.

### Realignment to the original approved mock-up (2026-11-13)
- Page order: header (brand icon + title, «Мэдээлэл шинэчлэгдсэн» pill) → two columns: **left** = calculator panel (inputs only) + static «Тооцооллын тухай» explanation card; **right** = featured bank card → ranking bars + growth chart side by side → full ranking table. Below, full width: non-ranked groups, term curve, rate matrix, methodology.
- Featured card: amber «№1 Бодит өгөөжтэй банк» ribbon (teal outline «Сонгосон банк · эрэмбэ №n» otherwise), icon rows for principal / gross / tax / net, KPI pair (annual rate, real return) and a highlighted total box. The D6 payout breakdown, inflation-adjusted metrics, dates, notes and source stay below in two columns.
- Ranking table: gold/silver/bronze rank medals (`--warn`, `#CBD5E1`, `#FB923C`), red tax column, green net column, tinted real-return pill with ▲/▼; status badges sit under the bank name.
- Range inputs: teal fill up to the thumb, white thumb with teal ring. Term chips in 3 columns; the selected chip glows teal.

## Responsiveness and accessibility
- Under ~900px, stack calculator then featured panel, then charts; on phones stack charts vertically.
- Use >=14px body text for typical UI, sufficiently large tap targets (~44px), visible keyboard focus, contrast at least WCAG AA when practical, non-color-only positive/negative indicators.
- Avoid decorative image assets or fabricated bank logos; use text names or verified assets.
