// Pure calculation engine (CALCULATION_RULES.md). No DOM access, no rounding.

import {
  TERM_DAY_MAP, TAX_RATE, INFLATION_YEAR_DAYS, KNOWN_CONVENTIONS, ILLUSTRATIVE_CONVENTION,
} from './config.js';
import { addDays, addMonthsClamp, diffDays, isLeapYear, makeDate, sameDate } from './dates.js';

// ---------------------------------------------------------------- term matching (D1)

function amountFits(rate, principal) {
  const min = rate.min_amount_mnt ?? 0;
  const max = rate.max_amount_mnt ?? Infinity;
  return principal >= min && principal <= max;
}

function inInterval(value, iv) {
  if (!iv || !Number.isFinite(iv.min)) return false;
  const lowerOk = iv.min_inclusive === false ? value > iv.min : value >= iv.min;
  const max = iv.max ?? Infinity;
  const upperOk = iv.max_inclusive === false ? value < max : value <= max;
  return lowerOk && upperOk;
}

/**
 * Finds the rate for chip `months`: exact month → published month interval
 * (D14 P2-A) → mapped days → mapped day interval → no offer.
 * Never falls back to a nearest term or interpolates.
 */
export function matchTerm(rates, months, principal) {
  const found = termCandidates(rates, months);
  if (!found) return { status: 'no_term' };
  const fitting = found.candidates.filter((r) => amountFits(r, principal));
  if (fitting.length === 0) return { status: 'amount_out_of_tier' };
  const rate = fitting.reduce((a, b) => (b.annual_percent > a.annual_percent ? b : a));
  return {
    status: 'ok',
    rate,
    match_type: found.match_type,
    term_basis: found.term_basis,
    months,
    termDays: found.term_basis === 'days' ? found.mappedDays : null,
  };
}

/**
 * The first lookup stage with published rates for `months` and all of its
 * candidate rates, before any amount filter (used by matchTerm and the rate
 * matrix). Day terms are reached only through TERM_DAY_MAP (D1), so months
 * outside the table never match a day-denominated rate.
 */
export function termCandidates(rates, months) {
  const mappedDays = TERM_DAY_MAP[months];
  const stages = [
    { match_type: 'exact', term_basis: 'months',
      test: (r) => r.source_term_unit === 'months' && r.source_term_value === months },
    { match_type: 'month_range', term_basis: 'months',
      test: (r) => r.source_term_unit === 'month_interval' && inInterval(months, r.interval) },
    { match_type: 'mapped', term_basis: 'days',
      test: (r) => r.source_term_unit === 'days' && r.source_term_value === mappedDays },
    { match_type: 'mapped', term_basis: 'days',
      test: (r) => r.source_term_unit === 'day_interval' && inInterval(mappedDays, r.interval) },
  ];
  for (const stage of stages) {
    if (stage.term_basis === 'days' && mappedDays == null) continue;
    const candidates = (rates ?? []).filter(stage.test);
    if (candidates.length > 0) {
      return { match_type: stage.match_type, term_basis: stage.term_basis, mappedDays, candidates };
    }
  }
  return null;
}

export function sourceTermLabel(rate) {
  if (rate.source_term_unit === 'months') return `${rate.source_term_value} сар`;
  if (rate.source_term_unit === 'days') return `${rate.source_term_value} өдөр`;
  if (rate.source_term_unit === 'day_interval' && rate.interval) {
    const max = rate.interval.max ?? '∞';
    return `${rate.interval.min}–${max} өдөр`;
  }
  if (rate.source_term_unit === 'month_interval' && rate.interval) {
    const iv = rate.interval;
    const min = iv.min_inclusive === false ? `${iv.min} сар 1 өдөр` : `${iv.min}`;
    return `${min}–${iv.max ?? '∞'} сар`;
  }
  return '—';
}

/**
 * Published amount-based rate bonus (e.g. М банк «Нэмэлт хүү»), in percentage
 * points. Only tiers that apply automatically by deposit amount belong here;
 * discretionary or customer-tier bonuses are never applied.
 */
export function amountBonusPercent(product, principal) {
  const tiers = product?.amount_bonus_tiers;
  if (!Array.isArray(tiers)) return 0;
  const tier = tiers.find((t) => amountFits(t, principal));
  return tier ? tier.bonus_percent : 0;
}

// ---------------------------------------------------------------- conventions (D5)

/** Bank convention only when known AND officially sourced; otherwise illustrative ACT/365. */
export function resolveConvention(product) {
  const conv = product.day_count_convention;
  if (KNOWN_CONVENTIONS.includes(conv) && product.day_count_source_url) {
    return { convention: conv, calc_status: 'bank_convention' };
  }
  return { convention: ILLUSTRATIVE_CONVENTION, calc_status: 'illustrative' };
}

function actActFraction(from, to) {
  let fraction = 0;
  let cursor = from;
  while (cursor < to) {
    const year = cursor.getUTCFullYear();
    const nextYear = makeDate(year + 1, 1, 1);
    const end = nextYear < to ? nextYear : to;
    fraction += diffDays(cursor, end) / (isLeapYear(year) ? 366 : 365);
    cursor = end;
  }
  return fraction;
}

function thirty360Fraction(from, to) { // 30E/360
  const d1 = Math.min(from.getUTCDate(), 30);
  const d2 = Math.min(to.getUTCDate(), 30);
  return (360 * (to.getUTCFullYear() - from.getUTCFullYear())
    + 30 * (to.getUTCMonth() - from.getUTCMonth()) + (d2 - d1)) / 360;
}

export function yearFraction(convention, from, to) {
  switch (convention) {
    case 'ACT/365': return diffDays(from, to) / 365;
    case 'ACT/366': return diffDays(from, to) / 366;
    case 'ACT/ACT': return actActFraction(from, to);
    case '30/360': return thirty360Fraction(from, to);
    default: throw new Error(`Unsupported day-count convention: ${convention}`);
  }
}

// ---------------------------------------------------------------- payouts (D6)

export function resolvePayout(product) {
  const f = product.payout_frequency;
  if (f === 'at_maturity' || f === 'monthly') return { payout: f, assumed: false, supported: true };
  if (f == null || f === 'unknown') return { payout: 'at_maturity', assumed: true, supported: true };
  return { payout: f, assumed: false, supported: false };
}

function buildPeriods(start, maturity, payout) {
  if (payout === 'at_maturity') return [{ from: start, to: maturity }];
  const periods = [];
  let prev = start;
  for (let k = 1; ; k += 1) {
    const d = addMonthsClamp(start, k);
    if (d >= maturity) break;
    periods.push({ from: prev, to: d, monthIndex: k });
    prev = d;
  }
  const k = periods.length + 1;
  periods.push({ from: prev, to: maturity, monthIndex: sameDate(addMonthsClamp(start, k), maturity) ? k : null });
  return periods;
}

// ---------------------------------------------------------------- inflation (D7, D8)

export function isValidInflation(q) {
  return Number.isFinite(q) && q > -1;
}

// ---------------------------------------------------------------- offer

/**
 * Computes one offer. `match` comes from matchTerm; `q` is the annual
 * inflation scenario as a decimal. Interim payouts are never reinvested.
 */
export function computeOffer({ principal, match, product, startDate, q, taxRate = TAX_RATE, bonusPercent = 0 }) {
  if (!(Number.isFinite(principal) && principal > 0)) throw new RangeError('principal must be > 0');
  if (!isValidInflation(q)) throw new RangeError('inflation must be finite and > -100%');
  const baseR = match.rate.annual_percent;
  if (!(Number.isFinite(baseR) && baseR >= 0)) throw new RangeError('annual_percent must be finite and >= 0');
  if (!(Number.isFinite(bonusPercent) && bonusPercent >= 0)) throw new RangeError('bonusPercent must be finite and >= 0');
  const R = baseR + bonusPercent;

  const byMonths = match.term_basis === 'months';
  const maturityDate = byMonths ? addMonthsClamp(startDate, match.months) : addDays(startDate, match.termDays);
  const eligibleDays = diffDays(startDate, maturityDate);
  const T = byMonths ? match.months / 12 : match.termDays / INFLATION_YEAR_DAYS;

  let { convention, calc_status } = resolveConvention(product);
  if (convention === 'month_fraction' && !byMonths) {
    // A month-fraction rule cannot be applied to a day-denominated term.
    convention = ILLUSTRATIVE_CONVENTION;
    calc_status = 'illustrative';
  }

  const { payout, assumed: payoutAssumed } = resolvePayout(product);
  const periods = buildPeriods(startDate, maturityDate, payout);
  const scheduleIllustrative = payout === 'monthly' && !product.payment_schedule_rule;

  const payments = periods.map((p) => {
    let fraction;
    if (convention === 'month_fraction') {
      fraction = payout === 'at_maturity' ? match.months / 12 : 1 / 12;
    } else {
      fraction = yearFraction(convention, p.from, p.to);
    }
    const gross = principal * (R / 100) * fraction;
    const tax = gross * taxRate;
    const net = gross - tax;
    let t;
    if (byMonths) t = sameDate(p.to, maturityDate) ? T : p.monthIndex / 12;
    else t = diffDays(startDate, p.to) / INFLATION_YEAR_DAYS;
    return { date: p.to, gross, tax, net, t };
  });

  const sum = (key, filter = () => true) => payments.filter(filter).reduce((acc, p) => acc + p[key], 0);
  const grossInterest = sum('gross');
  const taxTotal = sum('tax');
  const totalNetInterest = sum('net');
  const interimNetInterest = sum('net', (p) => p.date < maturityDate);
  const finalNetInterest = sum('net', (p) => sameDate(p.date, maturityDate));

  const deflator = (t) => (1 + q) ** t;
  const todayValue = payments.reduce((acc, p) => acc + p.net / deflator(p.t), 0) + principal / deflator(T);
  const realReturn = todayValue / principal - 1;

  return {
    startDate,
    maturityDate,
    eligibleDays,
    T,
    convention,
    calc_status,
    payout,
    payoutAssumed,
    scheduleIllustrative,
    payments,
    annualPercent: R,
    baseAnnualPercent: baseR,
    bonusPercent,
    principal,
    grossInterest,
    tax: taxTotal,
    totalNetInterest,
    interimNetInterest,
    finalNetInterest,
    principalAtMaturity: principal,
    amountPaidAtMaturity: principal + finalNetInterest,
    totalNominalProceeds: principal + totalNetInterest,
    nominalReturn: totalNetInterest / principal,
    todayValue,
    realGainLoss: todayValue - principal,
    realReturn,
    realAnnualized: T > 0 ? (1 + realReturn) ** (1 / T) - 1 : NaN,
    inflation: q,
  };
}
