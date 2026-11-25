// Phase 3 — chart and rate-matrix data preparation. Pure functions: no DOM,
// no Chart.js, no rounding (display rounding stays in format.js). Every value
// comes from the same engine as the ranking (calc.js / ranking.js).

import { TERM_CHIPS, TERM_DAY_MAP } from './config.js';
import { sourceTermLabel, termCandidates, yearFraction } from './calc.js';
import { addMonthsClamp, diffDays, sameDate } from './dates.js';
import { evaluateDataset } from './ranking.js';

/** Fixed per-bank series colours (DESIGN_SYSTEM.md «Chart series»), by dataset order. */
export const SERIES_COLORS = Object.freeze([
  '#2DD4BF', '#60A5FA', '#FBBF24', '#F472B6', '#A78BFA', '#FB923C',
  '#A3E635', '#38BDF8', '#E879F9', '#34D399', '#FDE047', '#CBD5E1',
]);

/** Non-colour marker of how a point's term was matched (D1, D14 P2-A). */
export const POINT_STYLE = Object.freeze({ exact: 'circle', month_range: 'rectRot', mapped: 'triangle' });

export const MATCH_TEXT = Object.freeze({
  exact: 'Зарласан сар',
  month_range: 'Сарын интервал',
  mapped: '≈ тааруулсан',
});

const signOf = (v) => (v > 0 ? 'positive' : v < 0 ? 'negative' : 'zero');

// ---------------------------------------------------------------- 1. ranking chart

/**
 * One bar per ranked bank, in ranking order (D17: descending net return after
 * tax). `limit` keeps only the first n ranks (the dashboard shows the top 5).
 * Values are independent of the inflation scenario.
 */
export function prepareRankingChart(result, selectedBankId, { limit = Infinity } = {}) {
  return result.ranked.slice(0, limit).map((e) => ({
    bankId: e.bank.id,
    label: e.bank.name,
    rank: e.rank,
    netReturnPercent: e.netReturn * 100, // full precision; rounded only for display
    display: e.displayNetReturn,
    sign: signOf(e.netReturn),
    isTop: e.rank === 1,
    isSelected: e.bank.id === selectedBankId,
    demo: Boolean(e.flags.demo),
    research: Boolean(e.flags.research),
  }));
}

// ---------------------------------------------------------------- 2. term curve

/**
 * For every chip, runs the same evaluation as the ranking and keeps the
 * ranked (eligible, rankable) offer of each bank. A chip without such an offer
 * is `null` — never interpolated. Banks with no point at any chip are listed
 * in `withoutPoints`.
 */
export function prepareTermCurve(dataset, inputs, chips = TERM_CHIPS) {
  const perChip = chips.map((months) => evaluateDataset(dataset, { ...inputs, months }));
  const series = [];
  const withoutPoints = [];
  dataset.banks.forEach((bank, index) => {
    const points = perChip.map((res, i) => {
      const e = res.ranked.find((r) => r.bank.id === bank.id);
      if (!e) return null;
      return {
        months: chips[i],
        percent: e.offer.annualPercent,
        basePercent: e.offer.baseAnnualPercent,
        bonusPercent: e.offer.bonusPercent,
        matchType: e.match.match_type,
        sourceTerm: e.sourceTerm,
        mappedDays: e.match.term_basis === 'days' ? e.match.termDays : null,
        productName: e.product.name,
        channel: e.product.channel,
        illustrative: e.flags.illustrative,
        demo: e.flags.demo,
        research: e.flags.research,
      };
    });
    if (points.some(Boolean)) {
      series.push({ bankId: bank.id, label: bank.name, color: SERIES_COLORS[index % SERIES_COLORS.length], points });
    } else {
      withoutPoints.push({ bankId: bank.id, label: bank.name });
    }
  });
  return { chips: [...chips], series, withoutPoints, mode: dataset.dataset_status };
}

/** Up to `n` banks: current ranking order first, then the highest published curve rate. */
export function defaultCurveBanks(curve, rankedIds, n = 5) {
  const available = new Set(curve.series.map((s) => s.bankId));
  const picked = rankedIds.filter((id) => available.has(id)).slice(0, n);
  if (picked.length < n) {
    const maxRate = (s) => Math.max(...s.points.filter(Boolean).map((p) => p.percent));
    const rest = curve.series.filter((s) => !picked.includes(s.bankId)).sort((a, b) => maxRate(b) - maxRate(a));
    for (const s of rest) { if (picked.length >= n) break; picked.push(s.bankId); }
  }
  return picked;
}

// ---------------------------------------------------------------- 3. growth chart

/**
 * Time series for the selected offer (D6, D7):
 * - `principal` stays flat (the deposit balance; interest is never added to it);
 * - `paidCumulative` = net interest actually paid out up to that date;
 * - `accruedUnpaid` = modelled accrual of the current period (not paid), following
 *   the offer's interest convention (D16): elapsed months / period months for
 *   `month_fraction`, the convention's year fraction for ACT/365, ACT/366,
 *   ACT/ACT and 30/360;
 * - `nominal` = principal + paid + accrued (no reinvestment);
 * - `purchasingPower` = each paid amount deflated at its own payment date plus
 *   (principal + accrued) deflated at the sample date. At maturity this equals
 *   offer.todayValue and `nominal` equals offer.totalNominalProceeds.
 */
export function prepareGrowthSeries(entry) {
  const o = entry.offer;
  const byMonths = entry.match.term_basis === 'months';
  const start = o.startDate;
  const maturity = o.maturityDate;
  const q = o.inflation;
  const deflator = (t) => (1 + q) ** t;

  const periods = o.payments.map((p, i) => ({ ...p, from: i === 0 ? start : o.payments[i - 1].date }));

  // Sample dates: every calendar month from the start, every payment date, maturity.
  const samples = [{ date: start, monthIndex: 0 }];
  for (let k = 1; ; k += 1) {
    const d = addMonthsClamp(start, k);
    if (d >= maturity) break;
    samples.push({ date: d, monthIndex: k });
  }
  samples.push({ date: maturity, monthIndex: null });
  for (const p of o.payments) {
    if (!samples.some((s) => sameDate(s.date, p.date))) samples.push({ date: p.date, monthIndex: null });
  }
  samples.sort((a, b) => a.date - b.date);

  // D16: share of a period's interest accrued by date `s`, per the offer's convention.
  const monthIndexOf = (d) => {
    if (sameDate(d, start)) return 0;
    if (sameDate(d, maturity)) return byMonths ? entry.match.months : null;
    return samples.find((x) => sameDate(x.date, d))?.monthIndex ?? null;
  };
  const accrualShare = (from, s, to) => {
    if (o.convention === 'month_fraction') {
      const [a, b, c] = [monthIndexOf(from), monthIndexOf(s), monthIndexOf(to)];
      if (a != null && b != null && c != null && c > a) return (b - a) / (c - a);
      return diffDays(from, s) / diffDays(from, to); // no month boundary: day-proportional fallback
    }
    return yearFraction(o.convention, from, s) / yearFraction(o.convention, from, to);
  };

  const points = samples.map(({ date, monthIndex }) => {
    const days = diffDays(start, date);
    const isMaturity = sameDate(date, maturity);
    let t;
    if (byMonths) t = isMaturity ? o.T : monthIndex != null ? monthIndex / 12 : days / 365;
    else t = days / 365;

    const paid = o.payments.filter((p) => p.date <= date);
    const paidCumulative = paid.reduce((acc, p) => acc + p.net, 0);
    const paidToday = paid.reduce((acc, p) => acc + p.net / deflator(p.t), 0);
    const current = periods.find((p) => p.from < date && date < p.date);
    const accruedUnpaid = current ? current.net * accrualShare(current.from, date, current.date) : 0;
    const isPayment = o.payments.some((p) => sameDate(p.date, date));
    return {
      date,
      days,
      t,
      principal: o.principal,
      paidCumulative,
      accruedUnpaid,
      nominal: o.principal + paidCumulative + accruedUnpaid,
      purchasingPower: paidToday + (o.principal + accruedUnpaid) / deflator(t),
      isPayment,
      isMaturity,
      modelled: accruedUnpaid > 0,
    };
  });

  return {
    points,
    payout: o.payout,
    payoutAssumed: o.payoutAssumed,
    interimPayments: o.payments.filter((p) => p.date < maturity).length,
    illustrative: o.calc_status === 'illustrative',
    final: points[points.length - 1],
  };
}

// ---------------------------------------------------------------- 4. rate matrix

export const MATRIX_MONTHS = Object.freeze(Array.from({ length: 24 }, (_, i) => i + 1));

/** Cell / row states shown in the matrix (text labels, never colour only). */
export const MATRIX_STATE = Object.freeze({
  VERIFIED: 'verified',
  UNVERIFIED: 'unverified',
  EXCLUDED: 'excluded',
  DEMO: 'demo',
  RESEARCH: 'research', // D18: Google Sheets research rate, ranked only in research mode
  ABSENT: 'absent',
});

function cellState(product, rate) {
  if (product.verification_status === 'excluded') return MATRIX_STATE.EXCLUDED;
  if (product.verification_status === 'demo') return MATRIX_STATE.DEMO;
  if (product.verification_status === 'research') {
    return (rate.verification_status ?? 'research') === 'research' ? MATRIX_STATE.RESEARCH : MATRIX_STATE.UNVERIFIED;
  }
  if (product.verification_status !== 'verified') return MATRIX_STATE.UNVERIFIED;
  const rs = rate.verification_status ?? 'verified';
  if (rs === 'verified') return MATRIX_STATE.VERIFIED;
  return rs === 'demo' ? MATRIX_STATE.DEMO : MATRIX_STATE.UNVERIFIED;
}

const STATE_ORDER = [MATRIX_STATE.VERIFIED, MATRIX_STATE.RESEARCH, MATRIX_STATE.DEMO, MATRIX_STATE.UNVERIFIED, MATRIX_STATE.EXCLUDED];

/**
 * All banks × months 1–24 with the **published base rate** as printed.
 * Day-denominated rates appear in a month column only through the D1 table
 * (chip months), labelled «≈ тааруулсан»; other published day terms are listed
 * in `otherTerms` with their original unit. Amount bonuses are not added here
 * (they depend on the principal) and are noted on the row instead.
 */
export function prepareRateMatrix(dataset, months = MATRIX_MONTHS) {
  const rows = [];
  for (const bank of dataset.banks) {
    const products = dataset.products.filter((p) => p.bank_id === bank.id);
    if (products.length === 0) {
      rows.push({
        bank, product: null, state: MATRIX_STATE.ABSENT,
        note: bank.research_note || 'Албан бүтээгдэхүүний мэдээлэл оруулаагүй',
        cells: months.map((m) => ({ months: m, state: MATRIX_STATE.ABSENT })),
        otherTerms: [],
      });
      continue;
    }
    for (const product of products) {
      const used = new Set();
      const cells = months.map((m) => {
        const found = termCandidates(product.rates, m);
        if (!found) return { months: m, state: MATRIX_STATE.ABSENT };
        found.candidates.forEach((r) => used.add(r));
        const percents = found.candidates.map((r) => r.annual_percent);
        const states = found.candidates.map((r) => cellState(product, r));
        const state = STATE_ORDER.slice().reverse().find((s) => states.includes(s)); // weakest status wins
        const notes = found.candidates.map((r) => r.status_note).filter(Boolean);
        return {
          months: m,
          state,
          minPercent: Math.min(...percents),
          maxPercent: Math.max(...percents),
          matchType: found.match_type,
          sourceTerm: [...new Set(found.candidates.map(sourceTermLabel))].join(', '),
          mappedDays: found.term_basis === 'days' ? TERM_DAY_MAP[m] : null,
          amountTiers: found.candidates.length > 1,
          note: notes[0] ?? null,
        };
      });
      const otherTerms = (product.rates ?? [])
        .filter((r) => !used.has(r))
        .map((r) => ({ label: sourceTermLabel(r), percent: r.annual_percent, state: cellState(product, r) }));
      const rowStates = (product.rates ?? []).map((r) => cellState(product, r));
      let state;
      if (product.verification_status === 'excluded') state = MATRIX_STATE.EXCLUDED;
      else if (rowStates.length === 0) state = MATRIX_STATE.ABSENT;
      else if (rowStates.every((s) => s === MATRIX_STATE.VERIFIED)) state = MATRIX_STATE.VERIFIED;
      else if (rowStates.every((s) => s === MATRIX_STATE.DEMO)) state = MATRIX_STATE.DEMO;
      else if (rowStates.every((s) => s === MATRIX_STATE.RESEARCH)) state = MATRIX_STATE.RESEARCH;
      else if (rowStates.includes(MATRIX_STATE.RESEARCH)) state = 'research_partial';
      else state = rowStates.includes(MATRIX_STATE.VERIFIED) ? 'partial' : MATRIX_STATE.UNVERIFIED;
      rows.push({
        bank,
        product,
        state,
        note: product.status_note ?? null,
        exclusionReason: product.exclusion_reason ?? null,
        bonusTiers: Array.isArray(product.amount_bonus_tiers) ? product.amount_bonus_tiers : null,
        sourceUrl: product.source_url ?? bank.official_url ?? null,
        observedAt: product.verified_at ?? null,
        cells,
        otherTerms,
      });
    }
  }
  return { months: [...months], chips: [...TERM_CHIPS], rows, mode: dataset.dataset_status };
}
