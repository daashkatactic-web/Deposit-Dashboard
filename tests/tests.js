// Browser-only test suite (D3). Imports the same modules the app uses.
// Numbering follows CALCULATION_RULES.md "Minimum tests".

import { computeOffer, matchTerm, resolveConvention, isValidInflation } from '../js/calc.js';
import { evaluateDataset, freshness, netReturnOf, resolveSelection } from '../js/ranking.js';
import { addDays, addMonthsClamp, diffDays, makeDate, parseISODate, resolveStartDate, toISO } from '../js/dates.js';
import { formatMNT, formatPercentFromFraction, parseAmountInput, roundHalfAwayFromZero } from '../js/format.js';
import { validateDataset } from '../js/data.js';
import { termCandidates } from '../js/calc.js';
import {
  defaultCurveBanks, prepareGrowthSeries, prepareRankingChart, prepareRateMatrix, prepareTermCurve, POINT_STYLE,
} from '../js/chartdata.js';
import { renderFeatured, renderMatrix, renderNonRanked, renderRanking } from '../js/ui.js';
import { growthTicks } from '../js/charts.js';
import { BANK_LOGOS, bankLogo, bankLogoUrl, bankMonogram } from '../js/banklogos.js';
import {
  BOM, RANKING_HEADERS, csvBlob, csvField, csvFileName, matrixCSV, matrixHeaders, rankingCSV, toCSV,
} from '../js/csvexport.js';
import { parserSelfTest } from '../js/csv.js';
import { checkSheetsTable, evidenceCounts, evidenceFor, loadSheetsData, rateValue, recordsFromText } from '../js/sheets.js';
import { buildResearchDataset, isMappedTerm } from '../js/sheetsdataset.js';
import { benchmarkRows, benchmarkSummary } from '../js/benchmark.js';

// ---------------------------------------------------------------- harness

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (e) { results.push({ name, ok: false, message: e.message }); }
}
function eq(actual, expected, label = '') {
  if (actual !== expected) throw new Error(`${label} хүлээсэн ${JSON.stringify(expected)}, гарсан ${JSON.stringify(actual)}`);
}
function close(actual, expected, tol, label = '') {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error(`${label} хүлээсэн ≈${expected} (±${tol}), гарсан ${actual}`);
}
function ok(cond, label) { if (!cond) throw new Error(label); }
function throws(fn, label) {
  try { fn(); } catch { return; }
  throw new Error(`${label}: алдаа шидэх ёстой байсан`);
}

// ---------------------------------------------------------------- fixtures

const SRC = 'https://example.test/official';
const D = (iso) => parseISODate(iso);
const TODAY = D('2026-11-11');

function rate(value, unit, annual, extra = {}) {
  return { source_term_value: value, source_term_unit: unit, annual_percent: annual, verification_status: 'verified', observed_at: '2026-11-10', ...extra };
}
function product(overrides = {}) {
  return {
    id: 'p', bank_id: 'b', name: 'Test product', currency: 'MNT', interest_type: 'simple', channel: 'any',
    customer_restriction: null, min_principal_mnt: null, max_principal_mnt: null,
    day_count_convention: 'month_fraction', day_count_source_url: SRC,
    payout_frequency: 'at_maturity', payment_schedule_rule: null,
    source_url: SRC, verification_status: 'verified', exclusion_reason: null,
    rates: [rate(12, 'months', 14)],
    ...overrides,
  };
}
function offerFor(prod, { principal, months, start = '2026-01-01', q = 0 }) {
  const match = matchTerm(prod.rates, months, principal);
  if (match.status !== 'ok') throw new Error(`match: ${match.status}`);
  return computeOffer({ principal, match, product: prod, startDate: D(start), q });
}
function dataset(products, { mode = 'verified', banks } = {}) {
  return {
    schema_version: 1, dataset_status: mode,
    banks: banks ?? [...new Set(products.map((p) => p.bank_id))].map((id) => ({ id, name: `Банк ${id}` })),
    products,
  };
}
const inputs = (o = {}) => ({ principal: 22_000_000, months: 12, startDate: D('2026-01-01'), inflation: 0.129, today: TODAY, ...o });

// ---------------------------------------------------------------- tests

test('1. 22 сая / 12 сар / 14% / 10% татвар / 12.9% инфляци', () => {
  const o = offerFor(product(), { principal: 22_000_000, months: 12, q: 0.129 });
  close(o.grossInterest, 3_080_000, 1e-6, 'gross');
  close(o.tax, 308_000, 1e-6, 'tax');
  close(o.totalNetInterest, 2_772_000, 1e-6, 'net');
  close(o.amountPaidAtMaturity, 24_772_000, 1e-6, 'maturity');
  close(o.todayValue, 21_941_541.19, 0.01, 'today value');
  close(o.realGainLoss, -58_458.81, 0.01, 'real gain');
  close(o.realReturn, -0.0026572, 1e-6, 'real return');
  eq(formatMNT(o.todayValue), '21,941,541 ₮', 'display today');
  eq(formatMNT(o.realGainLoss), '−58,459 ₮', 'display gain');
  eq(formatPercentFromFraction(o.realReturn), '−0.27%', 'display %');
});

test('2. 10 сая / 6 сар / 12% сарын хувь', () => {
  const o = offerFor(product({ rates: [rate(6, 'months', 12)] }), { principal: 10_000_000, months: 6 });
  close(o.grossInterest, 600_000, 1e-6, 'gross');
  close(o.tax, 60_000, 1e-6, 'tax');
  close(o.totalNetInterest, 540_000, 1e-6, 'net');
});

test('3. Инфляци цэвэр өгөөжөөс их бол бодит өгөөж сөрөг', () => {
  const o = offerFor(product({ rates: [rate(12, 'months', 5)] }), { principal: 10_000_000, months: 12, q: 0.10 });
  ok(o.realReturn < 0 && o.realGainLoss < 0, 'бодит өгөөж сөрөг байх ёстой');
});

test('4. Зарлагдаагүй 9 сарыг interpolation хийхгүй', () => {
  const p = product({ rates: [rate(6, 'months', 10), rate(12, 'months', 12)] });
  eq(matchTerm(p.rates, 9, 1_000_000).status, 'no_term');
  const r = evaluateDataset(dataset([p]), inputs({ months: 9 }));
  eq(r.ranked.length, 0, 'ranked');
  eq(r.nonRanked[0].category, 'no_product', 'category');
});

test('5. Доод дүн оруулсан дүнгээс их бол хасна', () => {
  const r = evaluateDataset(dataset([product({ min_principal_mnt: 50_000_000 })]), inputs());
  eq(r.ranked.length, 0);
  eq(r.nonRanked[0].category, 'conditions');
});

test('6. 365 өдөр ба 12 сар, өндөр жил', () => {
  const act365 = { day_count_convention: 'ACT/365' };
  const days = offerFor(product({ ...act365, rates: [rate(365, 'days', 10)] }), { principal: 1_000_000, months: 12, start: '2028-01-01' });
  eq(toISO(days.maturityDate), '2028-12-31', '365d maturity');
  eq(days.eligibleDays, 365);
  close(days.grossInterest, 100_000, 1e-6, '365d gross');
  const months = offerFor(product({ ...act365, rates: [rate(12, 'months', 10)] }), { principal: 1_000_000, months: 12, start: '2028-01-01' });
  eq(toISO(months.maturityDate), '2029-01-01', '12m maturity');
  eq(months.eligibleDays, 366);
  close(months.grossInterest, 100_000 * 366 / 365, 1e-6, '12m ACT/365 gross');
  const actAct = offerFor(product({ day_count_convention: 'ACT/ACT', rates: [rate(12, 'months', 10)] }), { principal: 1_000_000, months: 12, start: '2028-01-01' });
  close(actAct.grossInterest, 100_000, 1e-6, 'ACT/ACT gross');
  const nonLeap = offerFor(product({ ...act365, rates: [rate(12, 'months', 10)] }), { principal: 1_000_000, months: 12, start: '2026-01-01' });
  eq(nonLeap.eligibleDays, 365, 'non-leap days');
});

test('7. Инфляци өөрчлөгдөхөд бодит үзүүлэлт өөрчлөгдөнө, эрэмбийн нөхцөл өөрчлөгдөхгүй', () => {
  const ds = dataset([product({ bank_id: 'a' }), product({ id: 'p2', bank_id: 'b', min_principal_mnt: 50_000_000 })]);
  const lo = evaluateDataset(ds, inputs({ inflation: 0.05 }));
  const hi = evaluateDataset(ds, inputs({ inflation: 0.20 }));
  eq(lo.ranked.map((e) => e.bank.id).join(), hi.ranked.map((e) => e.bank.id).join(), 'ranked set');
  ok(lo.ranked[0].offer.realReturn > hi.ranked[0].offer.realReturn, 'real return changes');
});

test('8. Verified горимд эх сурвалжгүй эсвэл demo санал эрэмбэд орохгүй', () => {
  const ds = dataset([
    product({ bank_id: 'a', verification_status: 'demo' }),
    product({ id: 'p2', bank_id: 'b', source_url: null }),
    product({ id: 'p3', bank_id: 'c' }),
  ]);
  const r = evaluateDataset(ds, inputs());
  eq(r.ranked.map((e) => e.bank.id).join(), 'c');
  eq(r.nonRanked.length, 2);
});

test('9. Сонгосон банк шаардлага хангахаа больвол #1 руу шилжинэ', () => {
  const ds = dataset([product({ bank_id: 'a', rates: [rate(12, 'months', 15)] }),
    product({ id: 'p2', bank_id: 'b', rates: [rate(12, 'months', 12)], min_principal_mnt: 30_000_000 })]);
  const big = evaluateDataset(ds, inputs({ principal: 40_000_000 }));
  eq(resolveSelection('b', big.ranked), 'b', 'still eligible');
  const small = evaluateDataset(ds, inputs({ principal: 10_000_000 }));
  eq(resolveSelection('b', small.ranked), 'a', 'reset to #1');
  eq(resolveSelection('b', []), null, 'empty');
});

test('10. D1: 365 өдөр → 12 сар mapped; 12 сар exact; хоёулаа бол exact', () => {
  eq(matchTerm([rate(365, 'days', 12)], 12, 1).match_type, 'mapped');
  eq(matchTerm([rate(12, 'months', 12)], 12, 1).match_type, 'exact');
  const both = matchTerm([rate(365, 'days', 13), rate(12, 'months', 12)], 12, 1);
  eq(both.match_type, 'exact', 'exact wins');
  eq(both.rate.annual_percent, 12);
});

test('11. D1: ойролцоо хугацаа руу шилжихгүй; интервал', () => {
  const only60 = [rate(60, 'days', 8)];
  eq(matchTerm(only60, 1, 1).status, 'no_term', 'chip 1');
  eq(matchTerm(only60, 3, 1).status, 'no_term', 'chip 3');
  const iv = [rate(null, 'day_interval', 9.5, { interval: { min: 91, max: 180 } })];
  eq(matchTerm(iv, 6, 1).match_type, 'mapped', 'interval inclusive');
  const ivExcl = [rate(null, 'day_interval', 9.5, { interval: { min: 91, max: 180, max_inclusive: false } })];
  eq(matchTerm(ivExcl, 6, 1).status, 'no_term', 'interval exclusive');
});

test('12. D2: demo горимд demo санал эрэмбэлэгдэнэ, verified-тэй холилдохгүй', () => {
  const ds = dataset([product({ bank_id: 'a', verification_status: 'demo', rates: [rate(12, 'months', 14, { verification_status: 'demo' })] }),
    product({ id: 'p2', bank_id: 'b' })], { mode: 'demo' });
  const r = evaluateDataset(ds, inputs());
  eq(r.ranked.map((e) => e.bank.id).join(), 'a');
  ok(r.ranked[0].flags.demo, 'demo flag');
  eq(r.nonRanked[0].bank.id, 'b');
});

test('13. D4: эхлэх огноо', () => {
  const fb = resolveStartDate('', '2026-11-11');
  ok(fb.fallback && toISO(fb.date) === '2026-11-11', 'empty → today');
  ok(resolveStartDate('2026-02-30', '2026-11-11').fallback, 'invalid → today');
  const given = resolveStartDate('2027-03-01', '2026-11-11');
  ok(!given.fallback && toISO(given.date) === '2027-03-01', 'valid date');
  const ds = dataset([product({ bank_id: 'a' }), product({ id: 'p2', bank_id: 'b', rates: [rate(365, 'days', 13)] })]);
  const r1 = evaluateDataset(ds, inputs({ startDate: D('2026-01-01') }));
  const r2 = evaluateDataset(ds, inputs({ startDate: D('2027-06-15') }));
  eq(r1.ranked.map((e) => e.bank.id).sort().join(), r2.ranked.map((e) => e.bank.id).sort().join(), 'membership');
  ok(r1.ranked[0].offer.maturityDate.getTime() !== r2.ranked[0].offer.maturityDate.getTime(), 'maturity changes');
});

test('14. D5: тодорхойгүй арга → ACT/365 жишээ; баталгаатай ACT/366', () => {
  eq(resolveConvention({ day_count_convention: 'unknown' }).calc_status, 'illustrative');
  eq(resolveConvention({ day_count_convention: 'ACT/366', day_count_source_url: null }).calc_status, 'illustrative', 'no source');
  const p = product({ day_count_convention: 'ACT/366', rates: [rate(365, 'days', 10)] });
  const o = offerFor(p, { principal: 1_000_000, months: 12 });
  eq(o.calc_status, 'bank_convention');
  close(o.grossInterest, 1_000_000 * 0.1 * 365 / 366, 1e-6, 'ACT/366');
  const u = offerFor(product({ day_count_convention: 'unknown', rates: [rate(365, 'days', 10)] }), { principal: 1_000_000, months: 12 });
  eq(u.calc_status, 'illustrative');
  eq(u.convention, 'ACT/365');
});

test('15. D6: сар бүр хүү олгох', () => {
  const p = product({ payout_frequency: 'monthly', rates: [rate(12, 'months', 12)] });
  const o = offerFor(p, { principal: 12_000_000, months: 12 });
  eq(o.payments.length, 12, 'payments');
  o.payments.forEach((x) => close(x.net, 108_000, 1e-6, 'net per month'));
  close(o.interimNetInterest, 1_188_000, 1e-6, 'interim');
  close(o.finalNetInterest, 108_000, 1e-6, 'final');
  close(o.totalNetInterest, 1_296_000, 1e-6, 'total net');
  close(o.amountPaidAtMaturity, 12_108_000, 1e-6, 'paid at maturity');
  close(o.totalNominalProceeds, 13_296_000, 1e-6, 'nominal proceeds');
});

test('16. D6/D7: q=0 үед тэнцүү; q>0 үед сар бүрийнх өндөр', () => {
  const monthly = product({ payout_frequency: 'monthly' });
  const atMat = product();
  const m0 = offerFor(monthly, { principal: 12_000_000, months: 12, q: 0 });
  const a0 = offerFor(atMat, { principal: 12_000_000, months: 12, q: 0 });
  close(m0.todayValue, a0.todayValue, 1e-6, 'q=0');
  const m1 = offerFor(monthly, { principal: 12_000_000, months: 12, q: 0.1 });
  const a1 = offerFor(atMat, { principal: 12_000_000, months: 12, q: 0.1 });
  ok(m1.todayValue > a1.todayValue, 'monthly higher with inflation');
});

test('17. D7: 18 сар T=1.5; 545 өдөр T=545/365', () => {
  eq(offerFor(product({ rates: [rate(18, 'months', 12)] }), { principal: 1e6, months: 18 }).T, 1.5);
  const d = offerFor(product({ day_count_convention: 'ACT/365', rates: [rate(545, 'days', 12)] }), { principal: 1e6, months: 18 });
  close(d.T, 545 / 365, 1e-12, 'days T');
});

test('18. D8: дефляци ба буруу инфляци', () => {
  const o = offerFor(product({ rates: [rate(12, 'months', 12)] }), { principal: 10_000_000, months: 12, q: -0.02 });
  close(o.amountPaidAtMaturity, 11_080_000, 1e-6, 'maturity');
  close(o.todayValue, 11_306_122.45, 0.01, 'today');
  close(o.realGainLoss, 1_306_122.45, 0.01, 'gain');
  eq(formatPercentFromFraction(o.realReturn), '13.06%');
  ok(!isValidInflation(-1) && !isValidInflation(NaN) && !isValidInflation(Infinity), 'invalid domain');
  throws(() => offerFor(product(), { principal: 1e6, months: 12, q: -1 }), 'q = -100%');
});

test('19. D10: бүхэлчлэлийн хил', () => {
  const cases = [[0.5, 1], [1.5, 2], [2.5, 3], [-0.5, -1], [-2.5, -3], [1_234_567.5, 1_234_568],
    [0.49999999999999994, 0], [21_941_541.19, 21_941_541], [-58_458.81, -58_459], [-0.4, 0]];
  for (const [x, want] of cases) eq(roundHalfAwayFromZero(x), want, `round(${x})`);
  eq(formatPercentFromFraction(-0.002657), '−0.27%', 'percent');
  eq(formatPercentFromFraction(0.00125), '0.13%', 'percent half');
  eq(formatMNT(-0.4), '0 ₮', 'no negative zero');
});

test('20. D10: ±1 ₮ зөрүү, дотоод утга бүхэлчлэгдэхгүй', () => {
  const o = offerFor(product({ rates: [rate(12, 'months', 10)] }), { principal: 1_000_005, months: 12 });
  eq(formatMNT(o.grossInterest), '100,001 ₮', 'gross');
  eq(formatMNT(o.tax), '10,000 ₮', 'tax');
  eq(formatMNT(o.totalNetInterest), '90,000 ₮', 'net');
  ok(!Number.isInteger(o.grossInterest), 'internal unrounded');
});

test('21. D9: тусгай бүлгийн бүтээгдэхүүн хасагдана', () => {
  const r = evaluateDataset(dataset([product({ customer_restriction: 'Тэтгэвэр авагч' })]), inputs());
  eq(r.ranked.length, 0);
  ok(r.nonRanked[0].reasons[0].includes('Тусгай бүлэгт зориулсан'), 'reason text');
});

test('22. D11: 30 хоногийн босго', () => {
  ok(freshness(toISO(addDays(TODAY, -31)), TODAY).stale, '31 days stale');
  ok(!freshness(toISO(addDays(TODAY, -30)), TODAY).stale, '30 days fresh');
  const u = freshness(null, TODAY);
  ok(u.stale && u.unknown, 'unknown');
});

// ---------------------------------------------------------------- extra

test('Нэмэлт: нийлмэл хүүтэй бүтээгдэхүүн хасагдана', () => {
  const r = evaluateDataset(dataset([product({ interest_type: 'compound' })]), inputs());
  eq(r.nonRanked[0].category, 'conditions', 'P2-D: шаардлага хангахгүй');
});

test('Нэмэлт: дүн 0 үед хуурамч ялагчгүй', () => {
  const r = evaluateDataset(dataset([product()]), inputs({ principal: 0 }));
  eq(r.ranked.length, 0);
  throws(() => offerFor(product(), { principal: 0, months: 12 }), 'P = 0');
});

test('Нэмэлт: дүн оруулах талбарын задлал', () => {
  eq(parseAmountInput('22,000,000').value, 22_000_000);
  eq(parseAmountInput('22 000 000 ₮').value, 22_000_000);
  eq(parseAmountInput('abc').error, 'invalid');
  eq(parseAmountInput('-5').error, 'invalid');
  eq(parseAmountInput('').error, 'empty');
});

test('Нэмэлт: сарын сүүл (түр дүрэм)', () => {
  eq(toISO(addMonthsClamp(makeDate(2026, 1, 31), 1)), '2026-02-28');
  eq(toISO(addMonthsClamp(makeDate(2028, 1, 31), 1)), '2028-02-29');
  eq(toISO(addMonthsClamp(makeDate(2026, 11, 30), 3)), '2027-02-28');
});

test('Нэмэлт: dataset бүтцийн шалгалт', () => {
  eq(validateDataset(dataset([product()])).length, 0, 'valid');
  ok(validateDataset({ schema_version: 2 }).length > 0, 'invalid');
});

// ---------------------------------------------------------------- Phase 2 engine extensions

const monIv = (min, max, annual, minIncl = true, extra = {}) => ({
  source_term_unit: 'month_interval', interval: { min, max, min_inclusive: minIncl, max_inclusive: true },
  annual_percent: annual, verification_status: 'verified', observed_at: '2026-11-10', ...extra,
});
const M_RATES = [monIv(1, 2, 8.0), monIv(2, 3, 8.5, false), monIv(11, 12, 12.0, false), monIv(12, 18, 12.5, false)];

test('P2-1. Сарын интервал: (2,3] → 3 сар; [1,2] → 1 сар; 12 нь (12,18]-д орохгүй', () => {
  const m3 = matchTerm(M_RATES, 3, 1e6);
  eq(m3.rate.annual_percent, 8.5, '3 сар'); eq(m3.match_type, 'month_range', 'type'); eq(m3.term_basis, 'months', 'basis');
  eq(matchTerm(M_RATES, 1, 1e6).rate.annual_percent, 8.0, '1 сар');
  eq(matchTerm(M_RATES, 12, 1e6).rate.annual_percent, 12.0, '12 сар');
  eq(matchTerm(M_RATES, 18, 1e6).rate.annual_percent, 12.5, '18 сар');
  eq(matchTerm(M_RATES, 24, 1e6).status, 'no_term', '24 сар интервалаас гадуур');
  eq(matchTerm(M_RATES, 6, 1e6).status, 'no_term', 'зарлаагүй 6 сар');
});

test('P2-2. Яг сарын хүү интервалаас түрүүлнэ; интервал нь өдөр рүү хөрвөхгүй (T = m/12)', () => {
  const rates = [rate(12, 'months', 11), monIv(10, 12, 13)];
  eq(matchTerm(rates, 12, 1e6).rate.annual_percent, 11, 'exact first');
  const p = product({ rates: [monIv(3, 6, 11)], day_count_convention: 'unknown', day_count_source_url: null });
  const o = offerFor(p, { principal: 10_000_000, months: 6 });
  eq(o.T, 0.5, 'T'); eq(toISO(o.maturityDate), '2026-07-01', 'maturity');
});

const BONUS = [
  { min_amount_mnt: 20_000_000, max_amount_mnt: 49_999_999, bonus_percent: 0.15 },
  { min_amount_mnt: 50_000_000, max_amount_mnt: 99_999_999, bonus_percent: 0.30 },
  { min_amount_mnt: 100_000_000, max_amount_mnt: null, bonus_percent: 0.5 },
];

test('P2-3. Дүнгийн шатлалын нэмэгдэл: хил дээрх утгууд', () => {
  const p = product({ amount_bonus_tiers: BONUS });
  const R = (principal) => evaluateDataset(dataset([p]), inputs({ principal })).ranked[0].offer.annualPercent;
  eq(R(19_999_999), 14, '< 20 сая');
  close(R(20_000_000), 14.15, 1e-12, '20 сая');
  close(R(49_999_999), 14.15, 1e-12, '49,999,999');
  close(R(50_000_000), 14.30, 1e-12, '50 сая');
  close(R(100_000_000), 14.5, 1e-12, '100 сая');
});

test('P2-4. Нэмэгдэлтэй тооцоо: 22 сая × 14.15% × 12/12; туг ба үндсэн хүү хадгалагдана', () => {
  const r = evaluateDataset(dataset([product({ amount_bonus_tiers: BONUS })]), inputs());
  const e = r.ranked[0];
  close(e.offer.grossInterest, 22_000_000 * 0.1415, 1e-6, 'gross');
  eq(e.offer.baseAnnualPercent, 14, 'base'); eq(e.offer.bonusPercent, 0.15, 'bonus');
  ok(e.flags.amountBonus, 'amountBonus flag');
  const plain = evaluateDataset(dataset([product()]), inputs()).ranked[0];
  ok(!plain.flags.amountBonus && plain.offer.bonusPercent === 0, 'нэмэгдэлгүй');
});

test('P2-5. Хугацааны түвшний needs_verification: эрэмбэд орохгүй, шалтгаан тайлбартай', () => {
  const p = product({ rates: [rate(1, 'months', 10.5, { verification_status: 'needs_verification', status_note: '«10.50% хүртэл»' }), monIv(3, 6, 11)] });
  const r1 = evaluateDataset(dataset([p]), inputs({ months: 1 }));
  eq(r1.ranked.length, 0, 'ranked');
  ok(r1.nonRanked[0].reasons[0].includes('«10.50% хүртэл»'), 'note shown');
  eq(evaluateDataset(dataset([p]), inputs({ months: 3 })).ranked.length, 1, '3 сар эрэмбэлэгдэнэ');
});

test('P2-6. Шалгалт: интервалын хүүд interval.min заавал', () => {
  const bad = product({ rates: [{ source_term_unit: 'month_interval', annual_percent: 10 }] });
  ok(validateDataset(dataset([bad])).length > 0, 'missing interval rejected');
  eq(validateDataset(dataset([product({ rates: [monIv(3, 6, 11)], amount_bonus_tiers: BONUS })])).length, 0, 'valid');
  ok(validateDataset(dataset([product({ amount_bonus_tiers: [{ bonus_percent: 'x' }] })])).length > 0, 'bad tiers');
});

// ---------------------------------------------------------------- Phase 3: charts, matrix, selection

function twoBankDataset() {
  return dataset([
    product({ id: 'pa', bank_id: 'a', rates: [rate(3, 'months', 9), rate(12, 'months', 14)] }),
    product({ id: 'pb', bank_id: 'b', min_principal_mnt: 20_000_000, rates: [rate(365, 'days', 15), rate(30, 'days', 8)] }),
    product({ id: 'pc', bank_id: 'c', verification_status: 'needs_verification', rates: [rate(12, 'months', 20)] }),
    product({ id: 'pd', bank_id: 'd', verification_status: 'excluded', exclusion_reason: 'compound_interest', interest_type: 'compound', rates: [rate(12, 'months', 18)] }),
  ], { banks: ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, name: `Банк ${id}` })) });
}

test('P3-1. Эрэмбийн график (D17): цэвэр өгөөжөөр, эхний 5, инфляцаас үл хамаарна, #1 ба сонгосон банк', () => {
  const ds = twoBankDataset();
  const loss = evaluateDataset(ds, inputs({ inflation: 0.20 }));
  const items = prepareRankingChart(loss, 'a');
  eq(items.map((i) => i.bankId).join(','), loss.ranked.map((e) => e.bank.id).join(','), 'эрэмбийн дараалал');
  eq(items.length, 2, 'зөвхөн эрэмбэлэгдсэн банк (c, d, e орохгүй)');
  ok(items.every((i) => i.sign === 'positive' && i.netReturnPercent > 0), 'цэвэр өгөөж эерэг (20% инфляцид ч)');
  eq(items.filter((i) => i.isTop).length, 1, 'нэг #1');
  eq(items[0].bankId, 'b', '#1 = b (15%)');
  eq(items.find((i) => i.isSelected).bankId, 'a', 'сонгосон банк a; #1 өөрчлөгдөхгүй');
  const low = prepareRankingChart(evaluateDataset(ds, inputs({ inflation: 0.02 })), null);
  eq(JSON.stringify(low.map((i) => [i.bankId, i.netReturnPercent])), JSON.stringify(items.map((i) => [i.bankId, i.netReturnPercent])), 'инфляц өөрчлөгдөхөд баганы утга ижил');
  const e0 = loss.ranked[0];
  close(items[0].netReturnPercent, e0.offer.totalNetInterest / e0.offer.principal * 100, 1e-12, 'бүхэлчлэлгүй утга = цэвэр хүү ÷ үндсэн');
  eq(prepareRankingChart(loss, null, { limit: 1 }).length, 1, 'limit');
});

test('P3-2. Хүүгийн муруй: зарлаагүй хугацаа null (интерполяцгүй), ≈ тааруулсан тэмдэг, баталгаажаагүй/хассан банк цэггүй', () => {
  const curve = prepareTermCurve(twoBankDataset(), inputs());
  const a = curve.series.find((s) => s.bankId === 'a');
  eq(a.points.map((p) => (p ? p.percent : null)).join(','), ',9,,,14,,', 'a: 3, 12 сар л');
  const b = curve.series.find((s) => s.bankId === 'b');
  eq(b.points[4].matchType, 'mapped', 'b 12 сар = 365 өдөр → mapped');
  eq(b.points[4].sourceTerm, '365 өдөр', 'анхны нэгж хадгалагдана');
  eq(b.points[4].mappedDays, 365, 'D1 өдөр');
  eq(POINT_STYLE[b.points[4].matchType], 'triangle', '≈ цэгийн хэлбэр');
  eq(b.points[1], null, 'b 3 сар (90 өдөр) зарлаагүй → null');
  eq(curve.withoutPoints.map((x) => x.bankId).sort().join(','), 'c,d,e', 'c баталгаажаагүй, d хассан, e мэдээлэлгүй');
  const small = prepareTermCurve(twoBankDataset(), inputs({ principal: 1_000_000 }));
  ok(!small.series.some((s) => s.bankId === 'b'), 'доод дүнгээс бага бол b цэггүй');
});

test('P3-3. Муруйн анхдагч банкууд: эрэмбийн эхний 5, дутвал хамгийн өндөр хүүгээр нөхнө', () => {
  const pts = (v) => [{ percent: v }, null];
  const curve = { series: ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id, i) => ({ bankId: id, points: pts(10 + i) })) };
  eq(defaultCurveBanks(curve, ['c', 'a', 'x']).join(','), 'c,a,g,f,e', 'эрэмбэ эхэнд, дараа нь хүүгээр');
  eq(defaultCurveBanks(curve, ['a', 'b', 'c', 'd', 'e', 'f']).length, 5, 'дээд тал нь 5');
});

test('P3-4. Өсөлтийн график (хугацааны эцэст): үндсэн дүн тогтмол, загварчилсан хуримтлал, эцсийн утга самбартай тэнцүү', () => {
  const ds = dataset([product({ rates: [rate(12, 'months', 14)] })]);
  const entry = evaluateDataset(ds, inputs({ startDate: D('2026-01-31'), inflation: 0.129 })).ranked[0];
  const g = prepareGrowthSeries(entry);
  const o = entry.offer;
  ok(g.points.every((p) => p.principal === 22_000_000), 'үндсэн дүн тогтмол');
  ok(g.points.slice(0, -1).every((p) => p.paidCumulative === 0), 'эцсээс өмнө олгосон хүү 0');
  ok(g.points.slice(1, -1).every((p) => p.modelled && p.accruedUnpaid > 0), 'завсрын цэг = загварчилсан');
  eq(g.interimPayments, 0, 'завсрын олголтгүй');
  eq(g.final.paidCumulative, o.totalNetInterest, 'эцэст авсан хүү = нийт цэвэр хүү');
  eq(g.final.nominal, o.totalNominalProceeds, 'эцсийн нэрлэсэн = Нийт нэрлэсэн орлого');
  close(g.final.purchasingPower, o.todayValue, 1e-6, 'эцсийн худалдан авах чадвар = самбар');
  ok(g.points.every((p, i) => i === 0 || p.nominal >= g.points[i - 1].nominal), 'нэрлэсэн утга буурахгүй');
  eq(g.points[1].date.toISOString().slice(0, 10), '2026-02-28', 'сарын сүүлийн дүрэм (D15)');
});

test('P3-5. Өсөлтийн график (сар бүр): олгосон хүү тусдаа, үндсэн дүнд нэмэгдэхгүй, нийлмэлгүй', () => {
  const prod = product({ payout_frequency: 'monthly', rates: [rate(12, 'months', 12)] });
  const ds = dataset([prod]);
  const entry = evaluateDataset(ds, inputs({ principal: 12_000_000, inflation: 0.05 })).ranked[0];
  const g = prepareGrowthSeries(entry);
  eq(g.interimPayments, 11, '11 завсрын олголт + эцсийн 1');
  ok(g.points.every((p) => p.principal === 12_000_000), 'үндсэн дүн тогтмол 12 сая');
  const payments = g.points.filter((p) => p.isPayment);
  eq(payments.length, 12, '12 олголтын цэг');
  payments.forEach((p, i) => close(p.paidCumulative, 108_000 * (i + 1), 1e-6, `олголт ${i + 1}`));
  ok(payments.every((p) => p.accruedUnpaid === 0), 'олголтын өдөр хуримтлал 0');
  close(g.final.nominal, 13_296_000, 1e-6, 'нийт нэрлэсэн = P + Σ цэвэр хүү (нийлмэлгүй)');
  close(g.final.purchasingPower, entry.offer.todayValue, 1e-6, 'урсгал бүрийг өөрийн огноогоор');
  ok(g.points.every((p) => p.nominal <= 12_000_000 + p.paidCumulative + 108_000 + 1e-6), 'хүү дахин хадгаламжид орохгүй');
});

test('P3-6. Хүүгийн хүснэгт: бүх банк, анхны нэгж, ≈ зөвхөн D1 сард, төлөв ялгагдана', () => {
  const ds = twoBankDataset();
  ds.products[0].rates.push(rate(60, 'days', 7.5));
  ds.products[0].rates[0].verification_status = 'needs_verification';
  const m = prepareRateMatrix(ds);
  eq(m.months.length, 24, '1–24 сар');
  eq(new Set(m.rows.map((r) => r.bank.id)).size, 5, 'бүх банк (бүтээгдэхүүнгүй e орно)');
  const a = m.rows.find((r) => r.bank.id === 'a');
  eq(a.cells[2].state, 'unverified', 'a 3 сар баталгаажаагүй');
  eq(a.cells[11].state, 'verified', 'a 12 сар баталгаажсан');
  eq(a.state, 'partial', 'мөр: хэсэгчлэн');
  eq(a.cells[1].state, 'absent', '60 өдөр → 2 сар руу хөрвөхгүй');
  eq(a.otherTerms.map((t) => t.label).join(), '60 өдөр', '60 өдөр анхны нэгжээр');
  const b = m.rows.find((r) => r.bank.id === 'b');
  eq(`${b.cells[11].matchType}|${b.cells[11].sourceTerm}|${b.cells[11].minPercent}`, 'mapped|365 өдөр|15', 'b 12 сар ≈ 365 өдөр');
  eq(b.cells[0].matchType, 'mapped', '30 өдөр → 1 сар (D1)');
  eq(b.cells[12].state, 'absent', '13 сар D1 хүснэгтэд байхгүй');
  eq(m.rows.find((r) => r.bank.id === 'c').cells[11].state, 'unverified', 'c needs_verification');
  eq(m.rows.find((r) => r.bank.id === 'd').cells[11].state, 'excluded', 'd хасагдсан');
  ok(m.rows.find((r) => r.bank.id === 'e').cells.every((c) => c.state === 'absent'), 'e мэдээлэлгүй');
  eq(termCandidates([rate(60, 'days', 7)], 2), null, 'termCandidates: 2 сар ≠ 60 өдөр');
});

test('P3-7. Сонгосон банк: сонголт → өсөлтийн график тухайн банкных; шаардлага хангахаа больвол #1 руу шилжинэ', () => {
  const ds = twoBankDataset();
  let r = evaluateDataset(ds, inputs({ principal: 22_000_000 }));
  let sel = resolveSelection('a', r.ranked);
  let entry = r.ranked.find((e) => e.bank.id === sel);
  eq(prepareGrowthSeries(entry).final.nominal, entry.offer.totalNominalProceeds, 'a-ийн өсөлт');
  eq(prepareRankingChart(r, sel).find((i) => i.isSelected).bankId, 'a', 'графикт a сонгогдсон');
  eq(prepareRankingChart(r, sel)[0].isTop && prepareRankingChart(r, sel)[0].bankId, 'b', '#1 b хэвээр');
  sel = resolveSelection('b', r.ranked);
  r = evaluateDataset(ds, inputs({ principal: 5_000_000 }));
  sel = resolveSelection(sel, r.ranked);
  eq(sel, 'a', 'b доод дүнгээс бага → a (#1)');
  entry = r.ranked.find((e) => e.bank.id === sel);
  eq(prepareGrowthSeries(entry).points[0].principal, 5_000_000, 'өсөлт шинэ дүнгээр');
  const none = evaluateDataset(ds, inputs({ principal: 0 }));
  eq(resolveSelection(sel, none.ranked), null, 'санал алга → хоосон төлөв');
  eq(prepareRankingChart(none, null).length, 0, 'хоосон график');
});

test('P3-8. Хүснэгтийн DOM: бүх банк, ≈ тэмдэг, «саналгүй» текст, зөвхөн https холбоос', () => {
  const ds = twoBankDataset();
  ds.products[1].source_url = 'javascript:alert(1)';
  const box = document.createElement('section');
  renderMatrix(box, prepareRateMatrix(ds), { months: 12 });
  eq(box.querySelectorAll('tbody tr').length, 5, '5 мөр');
  ok(box.querySelector('th.is-current')?.textContent.startsWith('12'), 'сонгосон хугацааны багана');
  ok([...box.querySelectorAll('.mx-tag')].some((t) => t.textContent === '≈ 365 өдөр'), '≈ тэмдэг текстээр');
  ok([...box.querySelectorAll('.sr-only')].some((t) => t.textContent === 'саналгүй'), 'хоосон нүд уншигдана');
  ok([...box.querySelectorAll('a')].every((a) => a.protocol === 'https:' || a.protocol === 'http:'), 'аюултай холбоос үүсэхгүй');
  ok(box.textContent.includes('Хасагдсан — нийлмэл хүүтэй'), 'хассан шалтгаан');
});


// ---------------------------------------------------------------- CSV export (Phase 4A)

/** Minimal RFC 4180 parser for the tests (handles quotes, "" and CRLF). */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i += 1; }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function csvTable(text) {
  const [headers, ...rows] = parseCSV(text.replace(/^﻿/, ''));
  const get = (row, h) => {
    const i = headers.indexOf(h);
    if (i < 0) throw new Error(`багана алга: ${h}`);
    return row[i];
  };
  return { headers, rows, get };
}
const shownMNT = (v) => String(roundHalfAwayFromZero(v));
const shownPct = (f) => String(Number(formatPercentFromFraction(f).replace('%', '').replace('−', '-')));

test('CSV-1. Талбарын кодчилол: BOM, CRLF, ишлэл, томьёоны халдлагаас хамгаалалт', () => {
  eq(toCSV(['a', 'b'], [[1, 'x']]), '﻿a,b\r\n1,x\r\n', 'BOM + CRLF');
  eq(BOM, '﻿', 'BOM тэмдэгт');
  eq(csvField('a,b'), '"a,b"', 'таслал');
  eq(csvField('say "hi"'), '"say ""hi"""', 'давхар ишлэл');
  eq(csvField('мөр\nшилжилт'), '"мөр\nшилжилт"', 'мөр шилжилт');
  eq(csvField('=SUM(A1)'), "'=SUM(A1)", 'томьёо =');
  eq(csvField('@cmd'), "'@cmd", 'томьёо @');
  eq(csvField('-cmd'), "'-cmd", 'томьёо -');
  eq(csvField('-0.71'), '-0.71', 'сөрөг тоо хэвээр');
  eq(csvField(-0.71), '-0.71', 'тоон утга');
  eq(`${csvField(null)}|${csvField(NaN)}|${csvField(true)}|${csvField(false)}`, '||тийм|үгүй', 'хоосон, NaN, логик');
  eq(csvField('ХААН банк'), 'ХААН банк', 'кирилл ишлэлгүй');
  const back = parseCSV(toCSV(['h'], [['a,"b"\r\nc']]).slice(1));
  eq(back[1][0], 'a,"b"\r\nc', 'буцааж уншихад ижил');
});

test('CSV-2. Эрэмбийн CSV: дэлгэцийн тооцоотой яг ижил, банк бүр нэг удаа, эх сурвалж/огноо/төлөв', () => {
  const ds = twoBankDataset();
  const inp = inputs();
  const result = evaluateDataset(ds, inp);
  const order = result.ranked.map((e) => e.bank.id).join();
  const t = csvTable(rankingCSV(result, inp));
  eq(result.ranked.map((e) => e.bank.id).join(), order, 'экспорт эрэмбийг өөрчлөхгүй');
  eq(t.headers.join('|'), RANKING_HEADERS.join('|'), 'гарчиг');
  eq(t.rows.length, 5, '5 банк');
  ok(t.rows.every((r) => r.length === RANKING_HEADERS.length), 'мөр бүр ижил баганатай');
  eq(t.rows.map((r) => t.get(r, 'Банкны ID')).join(), 'b,a,c,d,e', 'эрэмбэлэгдсэн → эрэмбэд ороогүй');
  result.ranked.forEach((e, i) => {
    const r = t.rows[i];
    const o = e.offer;
    eq(t.get(r, 'Эрэмбэ'), String(e.rank), `${e.bank.id} эрэмбэ`);
    eq(t.get(r, 'Хүү татвараас өмнө (₮)'), shownMNT(o.grossInterest), `${e.bank.id} gross`);
    eq(t.get(r, 'Хүүгийн татвар 10% (₮)'), shownMNT(o.tax), `${e.bank.id} tax`);
    eq(t.get(r, 'Нийт цэвэр хүү (₮)'), shownMNT(o.totalNetInterest), `${e.bank.id} net`);
    eq(t.get(r, 'Нийт нэрлэсэн орлого (₮)'), shownMNT(o.totalNominalProceeds), `${e.bank.id} proceeds`);
    eq(t.get(r, 'Өнөөгийн худалдан авах чадвар (₮)'), shownMNT(o.todayValue), `${e.bank.id} today value`);
    eq(t.get(r, 'Бодит ашиг / алдагдал (₮)'), shownMNT(o.realGainLoss), `${e.bank.id} real gain`);
    eq(t.get(r, 'Бодит өгөөж, хугацааны нийт (%)'), shownPct(o.realReturn), `${e.bank.id} real %`);
    eq(t.get(r, 'Эх сурвалж (URL)'), SRC, `${e.bank.id} url`);
    eq(t.get(r, 'Ажигласан огноо'), '2026-11-10', `${e.bank.id} огноо`);
    eq(t.get(r, 'Баталгаажуулалтын төлөв'), 'verified (баталгаажсан)', `${e.bank.id} төлөв`);
  });
  const b = t.rows[0];
  ok(t.get(b, 'Хугацаа тааруулалт').startsWith('≈ тааруулсан'), 'b ≈ тааруулсан');
  ok(t.get(b, 'Тэмдэглэгээ').includes('365 өдөр → 12 сар'), 'b тэмдэглэгээ');
  eq(t.get(b, 'Банкны зарласан хугацаа'), '365 өдөр', 'b зарласан хугацаа анхны нэгжээр');
  eq(t.get(b, 'Хугацааны явцад авах хүү (₮)'), '0', 'хугацааны эцэст олгох → явцад 0');
  eq(t.get(t.rows[2], 'Эрэмбийн төлөв'), 'Баталгаажаагүй / мэдээлэл дутуу', 'c');
  eq(t.get(t.rows[3], 'Эрэмбийн төлөв'), 'Шаардлага хангахгүй', 'd');
  ok(t.get(t.rows[3], 'Шалтгаан').includes('Нийлмэл'), 'd шалтгаан');
  eq(t.get(t.rows[3], 'Нийт цэвэр хүү (₮)'), '', 'эрэмбэд ороогүй банкинд зохиомол тоо байхгүй');
  eq(t.get(t.rows[4], 'Банк'), 'Банк e', 'бүтээгдэхүүнгүй банк орно');
  ok(t.rows.every((r) => t.get(r, 'Хадгаламжийн дүн (₮)') === '22000000' && t.get(r, 'Сонгосон хугацаа (сар)') === '12'
    && t.get(r, 'Инфляцийн сценари (%)') === '12.9' && t.get(r, 'Эхлэх огноо') === '2026-01-01'), 'сценарийн багана');

  const evil = twoBankDataset();
  evil.banks[0].name = '=HYPERLINK("http://x")';
  ok(rankingCSV(evaluateDataset(evil, inp), inp).includes(`"'=HYPERLINK(""http://x"")"`), 'томьёо идэвхжихгүй');

  const demo = dataset([product({ verification_status: 'demo', rates: [rate(12, 'months', 14, { verification_status: 'demo' })] })], { mode: 'demo' });
  const dt = csvTable(rankingCSV(evaluateDataset(demo, inp), inp));
  ok(dt.rows.every((r) => dt.get(r, 'Өгөгдлийн горим') === 'DEMO') && dt.get(dt.rows[0], 'Эрэмбийн төлөв') === 'Эрэмбэлэгдсэн (DEMO)', 'DEMO мөр бүрт');
  eq(csvFileName('ranking', { mode: 'demo', months: 12, today: TODAY }), 'DEMO_deposit-ranking_12m_2026-11-11.csv', 'DEMO файлын нэр');
  eq(csvFileName('matrix', { mode: 'verified', today: TODAY }), 'deposit-rate-matrix_1-24m_2026-11-11.csv', 'хүснэгтийн файлын нэр');
});

test('CSV-3. Хүүгийн хүснэгтийн CSV: 1–24 сар, нүд бүрийн төлөв, ≈ ба саналгүй текстээр, анхны нэгж', () => {
  const ds = twoBankDataset();
  ds.products[0].rates.push(rate(60, 'days', 7.5));
  ds.products[0].verified_at = '2026-09-01';
  const m = prepareRateMatrix(ds);
  const t = csvTable(matrixCSV(m, TODAY));
  eq(t.headers.length, 9 + 48 + 6, 'баганын тоо');
  eq(t.headers.join('|'), matrixHeaders(m.months).join('|'), 'гарчиг');
  eq(t.rows.length, 5, '5 мөр');
  ok(t.rows.every((r) => r.length === t.headers.length), 'мөр бүр ижил баганатай');
  const row = (id) => t.rows.find((r) => t.get(r, 'Банкны ID') === id);
  eq(t.get(row('a'), '12 сар хүү (%)'), '14', 'a 12 сар');
  ok(t.get(row('a'), '12 сар төлөв').startsWith('баталгаажсан; зарласан: 12 сар'), 'a 12 сар төлөв');
  eq(t.get(row('a'), '2 сар хүү (%)'), '', '60 өдөр → 2 сар руу хөрвөхгүй');
  eq(t.get(row('a'), '2 сар төлөв'), 'саналгүй', 'саналгүй текстээр');
  eq(t.get(row('a'), 'Бусад зарласан хугацаа (анхны нэгжээр)'), '60 өдөр: 7.50%', '60 өдөр анхны нэгжээр');
  eq(`${t.get(row('a'), 'Шалгасан огноо')}|${t.get(row('a'), 'Хуучирсан (>30 хоног)')}`, '2026-09-01|тийм', 'D11 хуучирсан');
  eq(t.get(row('b'), '12 сар хүү (%)'), '15', 'b 12 сар');
  ok(t.get(row('b'), '12 сар төлөв').includes('≈ тааруулсан: банк «365 өдөр» (D1: 12 сар = 365 өдөр)'), 'b ≈');
  eq(t.get(row('b'), '13 сар төлөв'), 'саналгүй', '13 сар D1-д байхгүй');
  ok(t.get(row('c'), '12 сар төлөв').startsWith('баталгаажаагүй'), 'c баталгаажаагүй');
  eq(`${t.get(row('d'), 'Мөрийн төлөв')}|${t.get(row('d'), 'Хассан шалтгаан')}`, 'Хасагдсан|нийлмэл хүүтэй', 'd хассан');
  ok(t.get(row('d'), '12 сар төлөв').startsWith('хасагдсан'), 'd нүд хасагдсан');
  eq(t.get(row('e'), 'Бүтээгдэхүүн'), 'Бүтээгдэхүүн оруулаагүй', 'e');
  eq(t.get(row('a'), 'Эх сурвалж (URL)'), SRC, 'эх сурвалж');
});


// ---------------------------------------------------------------- Phase 4B

test('D16-1. month_fraction: завсрын хуримтлал сараар (k/m); төлбөр ба эцсийн дүн өөрчлөгдөхгүй', () => {
  const ds = dataset([product({ rates: [rate(12, 'months', 14)] })]);
  const entry = evaluateDataset(ds, inputs({ startDate: D('2026-01-31'), inflation: 0.129 })).ranked[0];
  const o = entry.offer;
  eq(o.convention, 'month_fraction', 'арга');
  const g = prepareGrowthSeries(entry);
  const at = (k) => g.points.find((p) => p.date.getTime() === addMonthsClamp(D('2026-01-31'), k).getTime());
  close(at(1).accruedUnpaid, 2_772_000 / 12, 1e-6, '1 сар = 231,000 (өдрөөр бол 2,772,000×28/365 биш)');
  close(at(6).accruedUnpaid, 1_386_000, 1e-6, '6 сар = хагас');
  close(at(11).accruedUnpaid, 2_772_000 * 11 / 12, 1e-6, '11 сар');
  ok(g.points.slice(1, -1).every((p) => p.modelled && p.paidCumulative === 0), 'загварчилсан, олгоогүй');
  eq(o.payments.length, 1, 'нэг олголт');
  close(o.totalNetInterest, 2_772_000, 1e-6, 'эцсийн цэвэр хүү хэвээр');
  eq(g.final.nominal, o.totalNominalProceeds, 'эцсийн нэрлэсэн');
  close(g.final.purchasingPower, o.todayValue, 1e-6, 'эцсийн худалдан авах чадвар');

  const monthly = dataset([product({ payout_frequency: 'monthly', rates: [rate(12, 'months', 12)] })]);
  const em = evaluateDataset(monthly, inputs({ principal: 12_000_000, inflation: 0.05 })).ranked[0];
  const gm = prepareGrowthSeries(em);
  ok(gm.points.every((p) => p.accruedUnpaid === 0), 'сар бүр олгох: сарын цэгт хуримтлал 0');
  gm.points.filter((p) => p.isPayment).forEach((p, i) => close(p.paidCumulative, 108_000 * (i + 1), 1e-6, `олголт ${i + 1}`));
});

test('D16-2. ACT/365: завсрын хуримтлал хоногоор (өмнөхтэй ижил) — өдрөөр ба сараар зарласан хугацаа', () => {
  const dayProd = product({ day_count_convention: 'unknown', rates: [rate(365, 'days', 14)] });
  const e1 = evaluateDataset(dataset([dayProd]), inputs({ startDate: D('2026-11-11'), inflation: 0.134 })).ranked[0];
  eq(`${e1.offer.convention}|${e1.offer.calc_status}`, 'ACT/365|illustrative', 'жишээ ACT/365');
  const g1 = prepareGrowthSeries(e1);
  const p1 = g1.points.find((p) => toISO(p.date) === '2026-12-11');
  close(p1.accruedUnpaid, 2_772_000 * 30 / 365, 1e-6, '30 хоног');
  eq(g1.final.nominal, e1.offer.totalNominalProceeds, 'эцсийн дүн');

  const monthProd = product({ day_count_convention: 'unknown', rates: [rate(6, 'months', 9.8)] });
  const e2 = evaluateDataset(dataset([monthProd]), inputs({ months: 6, startDate: D('2026-11-11'), inflation: 0.134 })).ranked[0];
  const g2 = prepareGrowthSeries(e2);
  eq(e2.offer.eligibleDays, 181, '181 хоног');
  const p2 = g2.points.find((p) => toISO(p.date) === '2027-02-11');
  close(p2.accruedUnpaid, e2.offer.totalNetInterest * 92 / 181, 1e-6, 'ACT/365: 92/181 хоног (сараар биш)');
  close(g2.final.purchasingPower, e2.offer.todayValue, 1e-6, 'эцсийн утга');
});

test('D16-3. 30/360 ба ACT/366: тухайн аргын жилийн хувиар', () => {
  const p360 = product({ day_count_convention: '30/360', rates: [rate(12, 'months', 12)] });
  const e = evaluateDataset(dataset([p360]), inputs({ principal: 12_000_000, startDate: D('2026-01-15'), inflation: 0 })).ranked[0];
  eq(e.offer.convention, '30/360', 'арга');
  const g = prepareGrowthSeries(e);
  const feb = g.points.find((p) => toISO(p.date) === '2026-02-15');
  close(feb.accruedUnpaid, e.offer.totalNetInterest / 12, 1e-6, '30/360: 1 сар = 1/12');
  eq(g.final.nominal, e.offer.totalNominalProceeds, 'эцсийн дүн');
  const p366 = product({ day_count_convention: 'ACT/366', rates: [rate(12, 'months', 12)] });
  const e6 = evaluateDataset(dataset([p366]), inputs({ principal: 12_000_000, startDate: D('2026-01-15'), inflation: 0 })).ranked[0];
  const g6 = prepareGrowthSeries(e6);
  const f6 = g6.points.find((p) => toISO(p.date) === '2026-02-15');
  close(f6.accruedUnpaid, e6.offer.totalNetInterest * 31 / 365, 1e-6, 'ACT/366: хоногийн харьцаа');
});

// ---------------------------------------------------------------- bank logos

test('LOGO-1. Лого банкны ID-аар холбогдоно (нэрээр биш); мэдэгдээгүй ID → текст орлуулга', () => {
  const khan = bankLogo({ id: 'khan', name: 'ХААН банк' }, { size: 40, eager: true });
  const img = khan.querySelector('img');
  ok(img && img.getAttribute('src').endsWith('/assets/banks/khan.svg'), 'khan.svg');
  eq(img.alt, 'Лого: ХААН банк', 'alt текст');
  eq(`${img.width}x${img.height}|${img.loading}`, '40x40|eager', 'хэмжээ, ачаалалт');
  ok(khan.classList.contains('bank-logo--40'), '40px анги');
  const lazy = bankLogo({ id: 'golomt', name: 'Голомт банк' }, { size: 24 }).querySelector('img');
  eq(lazy.loading, 'lazy', 'жижиг лого lazy');
  const sameName = bankLogo({ id: 'unknown-id', name: 'ХААН банк' }, { size: 24 });
  ok(!sameName.querySelector('img') && sameName.classList.contains('bank-logo--fallback'), 'ижил нэртэй ч өөр ID → лого авахгүй');
  eq(sameName.textContent, 'Х', 'монограм');
  eq(bankLogoUrl('toString'), null, 'прототипийн нэр лого болохгүй');
  eq(bankMonogram('Худалдаа хөгжлийн банк'), 'ХХ', 'монограм 2 үсэг');
  eq(bankMonogram('ХасБанк'), 'Х', 'монограм 1 үг');
  eq(bankMonogram('М банк'), 'М', '«банк» үгийг алгасна');
});

test('LOGO-2. Хүснэгт ба эрэмбэд ороогүй хэсэгт мөр бүр зөв банкны логотой', () => {
  const ds = twoBankDataset();
  const box = document.createElement('section');
  renderMatrix(box, prepareRateMatrix(ds), { months: 12 });
  const rows = [...box.querySelectorAll('tbody tr')];
  ok(rows.every((tr) => tr.querySelector('th.mx-bank .bank-logo--20')), 'хүснэгт: 20px лого');
  ok(rows.every((tr, i) => tr.querySelector('.bank-logo').dataset.bankId === prepareRateMatrix(ds).rows[i].bank.id), 'мөрийн банк = логоны ID');
  const nr = document.createElement('section');
  renderNonRanked(nr, evaluateDataset(ds, inputs()));
  const items = [...nr.querySelectorAll('li')];
  ok(items.length === 3 && items.every((li) => li.querySelector('.bank-logo--24')), 'эрэмбэд ороогүй: 24px лого');
});

async function logoAssetCheck() {
  const name = 'LOGO-3. 12 банк бүгд хадгалагдсан албан логотой; файл бүр ачаалагдаж, зураг болж уншигдана; эвдэрвэл текст орлуулга';
  try {
    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    eq(data.banks.filter((b) => BANK_LOGOS[b.id]).length, 12, '12 банк логотой');
    eq(Object.keys(BANK_LOGOS).filter((id) => !data.banks.some((b) => b.id === id)).length, 0, 'илүү лого байхгүй');
    for (const b of data.banks) {
      const url = bankLogoUrl(b.id);
      ok(new URL(url).origin === location.origin, `${b.id}: дотоод файл`);
      const img = new Image();
      // load/error events (img.decode() can stall in a background tab)
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error(`${b.id}: зураг уншигдсангүй`));
        img.src = url;
      });
      ok(img.naturalWidth >= 32 && img.naturalHeight >= 32, `${b.id}: хамгийн багадаа 32px`);
    }
    const box = bankLogo({ id: 'khan', name: 'ХААН банк' }, { size: 24, eager: true });
    const failed = new Promise((resolve) => box.querySelector('img').addEventListener('error', () => setTimeout(resolve, 0)));
    box.querySelector('img').src = new URL('../assets/banks/__missing__.png', location.href).href;
    await failed;
    ok(!box.querySelector('img') && box.textContent === 'Х' && box.title === 'ХААН банк', 'эвдэрсэн зураг → монограм');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

// ---------------------------------------------------------------- verified dataset check (async)

async function verifiedDatasetCheck() {
  const name = 'P2-7. Баталгаажсан өгөгдөл: бүтэц, 12 банк, статус, эрэмбэ';
  try {
    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    eq(validateDataset(data).length, 0, 'valid');
    eq(data.dataset_status, 'verified', 'status');
    eq(data.banks.length, 12, 'banks');
    eq(data.inflation.kind, 'historical_observed', 'inflation kind');
    ok(data.products.every((p) => p.verification_status !== 'demo'), 'no demo product');
    ok(data.products.every((p) => p.source_url && p.verified_at), 'source + date on every product');
    ok(data.products.every((p) => p.rates.every((r) => r.observed_at)), 'observed_at on every rate');
    const today = D('2026-11-11');
    for (const months of [1, 3, 6, 9, 12, 18, 24]) {
      const r = evaluateDataset(data, inputs({ months, today, startDate: today, inflation: 0.134 }));
      eq(r.ranked.length + r.nonRanked.length, 12, `${months} сар: банк бүр нэг удаа`);
      ok(r.ranked.every((e) => e.product.verification_status === 'verified' && e.rate.verification_status === 'verified'), `${months} сар: зөвхөн verified`);
      ok(r.ranked.every((e) => e.flags.illustrative), `${months} сар: ACT/365 жишээ шошготой`);
    }
    const r12 = evaluateDataset(data, inputs({ today, startDate: today, inflation: 0.134 }));
    const nonIds = r12.nonRanked.map((n) => n.bank.id).sort().join(',');
    eq(nonIds, 'bogd,chinggis,nibank,transbank,xac', '12 сар: эрэмбэд ороогүй');
    const cat = (id) => r12.nonRanked.find((n) => n.bank.id === id).category;
    eq(`${cat('xac')},${cat('chinggis')},${cat('transbank')}`, 'conditions,conditions,conditions', 'P2-D: хасагдсан / улирлын олголт → шаардлага хангахгүй');
    eq(`${cat('bogd')},${cat('nibank')}`, 'missing,missing', 'P2-D: баталгаажаагүй');
    const tdb = r12.ranked.find((e) => e.bank.id === 'tdb');
    eq(tdb.product.channel, 'online', 'ХХБ онлайн санал сонгогдсон');
    const m = r12.ranked.find((e) => e.bank.id === 'mbank');
    close(m.offer.annualPercent, 12.15, 1e-12, 'М банк 22 сая: 12.0 + 0.15');
    const r6 = evaluateDataset(data, inputs({ months: 6, today, startDate: today, inflation: 0.134 }));
    eq(r6.ranked.find((e) => e.bank.id === 'transbank').offer.annualPercent, 11, 'Тээвэр 6 сар 11.00%');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
  await verifiedPhase3Check();
}

async function verifiedPhase3Check() {
  const name = 'P3-9. Баталгаажсан өгөгдөл: хүүгийн хүснэгт ба муруй (12 банк, төлөв, анхны нэгж, улирлын хүү эрэмбэгүй)';
  try {
    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    const m = prepareRateMatrix(data);
    eq(new Set(m.rows.map((r) => r.bank.id)).size, 12, '12 банк');
    eq(m.rows.length, 14, '14 мөр (ХХБ, Тээвэр 2 бүтээгдэхүүн)');
    const row = (pid) => m.rows.find((r) => r.product?.id === pid);
    const khan = row('khan-ordinary');
    eq(`${khan.cells[11].state}|${khan.cells[11].matchType}|${khan.cells[11].sourceTerm}|${khan.cells[11].minPercent}`, 'verified|mapped|365 өдөр|12', 'ХААН 12 сар ≈ 365 өдөр');
    eq(khan.cells[8].matchType, 'exact', 'ХААН 9 сар яг');
    eq(khan.cells[1].state, 'absent', 'ХААН 2 сар — 60 өдрийг сар руу хөрвүүлэхгүй');
    ok(khan.otherTerms.some((t) => t.label === '60 өдөр' && t.percent === 7.8), 'ХААН 60 өдөр анхны нэгжээр');
    eq(row('state-ordinary').cells[11].sourceTerm, '365–539 өдөр', 'Төрийн 12 сар интервал');
    eq(row('tdb-ordinary-branch').otherTerms.map((t) => t.label).join(), '36 сар', 'ХХБ 36 сар хүснэгтээс гадуур');
    eq(row('mbank-ordinary').cells[2].matchType, 'month_range', 'М банк 3 сар интервал');
    eq(row('mbank-ordinary').cells[2].minPercent, 8.5, 'М банк 3 сар үндсэн 8.5% (нэмэгдэлгүй)');
    ok(row('transbank-ordinary-long').cells.slice(11).every((c) => c.state === 'verified'), 'Тээвэр 12–24 сар баталгаажсан (улирлын олголт, эрэмбэгүй)');
    eq(row('transbank-ordinary-short').cells[0].state, 'unverified', 'Тээвэр 1 сар баталгаажаагүй');
    eq(row('nibank-ordinary').cells[11].state, 'unverified', 'ҮХОБ 12 сар баталгаажаагүй');
    eq(row('nibank-ordinary').cells[3].state, 'verified', 'ҮХОБ 4 сар баталгаажсан');
    eq(row('xac-term').state, 'excluded', 'ХасБанк хасагдсан');
    eq(row('chinggis-foreign').cells[0].state, 'excluded', 'Чингис хаан хасагдсан');
    eq(row('bogd-term').cells[11].state, 'unverified', 'Богд баталгаажаагүй');

    const curve = prepareTermCurve(data, inputs({ today: D('2026-11-11'), startDate: D('2026-11-11'), inflation: 0.134 }));
    eq(curve.withoutPoints.map((b) => b.bankId).sort().join(','), 'bogd,chinggis,xac', 'муруйд цэггүй банк');
    const tb = curve.series.find((s) => s.bankId === 'transbank').points.map((p) => (p ? p.percent : null));
    eq(tb.join(','), ',11,11,11.5,,,', 'Тээвэр: 1 сар (баталгаажаагүй), 12–24 сар (улирал) цэггүй');
    const nb = curve.series.find((s) => s.bankId === 'nibank').points.slice(4);
    ok(nb.every((p) => p === null), 'ҮХОБ 12–24 сар цэггүй');
    const arig = curve.series.find((s) => s.bankId === 'arig').points;
    eq(arig.map((p) => (p ? p.matchType : null)).join(','), 'mapped,mapped,mapped,mapped,mapped,mapped,mapped', 'Ариг бүх чип ≈ (30–749 хоног)');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

// ---------------------------------------------------------------- demo dataset check (async)

async function demoDatasetCheck() {
  try {
    const data = await fetch('../data/deposits.demo.json', { cache: 'no-store' }).then((r) => r.json());
    eq(validateDataset(data).length, 0, 'demo dataset valid');
    eq(data.banks.length, 12, 'banks');
    const r = evaluateDataset(data, inputs());
    eq(r.ranked.length + r.nonRanked.length, 12, 'every bank appears once');
    results.push({ name: 'Нэмэлт: demo өгөгдөл зөв, 12 банк бүгд харагдана', ok: true });
  } catch (e) {
    results.push({ name: 'Нэмэлт: demo өгөгдөл зөв, 12 банк бүгд харагдана', ok: false, message: e.message });
  }
}

async function csvAsyncCheck() {
  const name = 'CSV-4. Файл UTF-8 BOM байтаар (EF BB BF) эхэлж, монгол текст эвдрэлгүй; баталгаажсан өгөгдлийн хоёр экспорт';
  try {
    const ds = twoBankDataset();
    const text = rankingCSV(evaluateDataset(ds, inputs()), inputs());
    const bytes = new Uint8Array(await csvBlob(text).arrayBuffer());
    eq([...bytes.slice(0, 3)].map((x) => x.toString(16)).join(' '), 'ef bb bf', 'BOM байт');
    eq(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), text, 'UTF-8 буцааж задлахад ижил');

    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    const today = D('2026-11-11');
    const inp = inputs({ today, startDate: today, inflation: 0.134 });
    const result = evaluateDataset(data, inp);
    const t = csvTable(rankingCSV(result, inp));
    eq(t.rows.length, 12, '12 банк');
    eq(new Set(t.rows.map((r) => t.get(r, 'Банкны ID'))).size, 12, 'давхардалгүй');
    eq(t.rows.filter((r) => t.get(r, 'Эрэмбэ') !== '').length, result.ranked.length, 'эрэмбэлэгдсэн тоо');
    eq(t.get(t.rows[0], 'Банкны ID'), result.ranked[0].bank.id, '#1 ижил');
    const mb = t.rows.find((r) => t.get(r, 'Банкны ID') === 'mbank');
    eq(`${t.get(mb, 'Үндсэн хүү (%)')}|${t.get(mb, 'Дүнгийн нэмэгдэл (%)')}|${t.get(mb, 'Жилийн нэрлэсэн хүү (%)')}`, '12|0.15|12.15', 'М банк нэмэгдэл');
    const ranked = t.rows.filter((r) => t.get(r, 'Эрэмбэ') !== '');
    ok(ranked.every((r) => /^https:\/\//.test(t.get(r, 'Эх сурвалж (URL)'))), 'эрэмбэлэгдсэн бүр https эх сурвалжтай');
    ok(ranked.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(t.get(r, 'Ажигласан огноо'))), 'огноо ISO');
    ok(ranked.every((r) => t.get(r, 'Тооцооны арга') === 'ACT/365 (жишээ тооцоо)'), 'жишээ тооцооны шошго');
    ok(t.rows.filter((r) => t.get(r, 'Эрэмбэ') === '').every((r) => t.get(r, 'Шалтгаан') !== '' && t.get(r, 'Эх сурвалж (URL)') !== ''), 'эрэмбэд ороогүй бүр шалтгаан, холбоостой');
    const mt = csvTable(matrixCSV(prepareRateMatrix(data), today));
    eq(mt.rows.length, 14, '14 мөр');
    const khan = mt.rows.find((r) => mt.get(r, 'Бүтээгдэхүүний ID') === 'khan-ordinary');
    ok(mt.get(khan, '12 сар хүү (%)') === '12' && mt.get(khan, '12 сар төлөв').includes('≈'), 'ХААН 12 сар ≈ 365 өдөр');
    const tl = mt.rows.find((r) => mt.get(r, 'Бүтээгдэхүүний ID') === 'transbank-ordinary-long');
    ok(mt.get(tl, '12 сар төлөв').startsWith('баталгаажсан'), 'Тээвэр 12 сар баталгаажсан');
    const nb = mt.rows.find((r) => mt.get(r, 'Бүтээгдэхүүний ID') === 'nibank-ordinary');
    ok(mt.get(nb, '12 сар төлөв').startsWith('баталгаажаагүй'), 'ҮХОБ 12 сар баталгаажаагүй');
    ok(mt.rows.every((r) => mt.get(r, 'Эх сурвалж (URL)').startsWith('https://')), 'мөр бүр эх сурвалжтай');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

async function phase4bDataCheck() {
  const name = 'P4B-1. 4B шатны засвар: Ариг 30–749 хоног ба доод дүн, Тээвэр 12–24 сар улирлын (эрэмбэгүй), ХХБ 24 сар онлайн баталгаажаагүй';
  try {
    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    eq(validateDataset(data).length, 0, 'valid');
    const today = D('2026-11-11');
    const run = (months, principal = 22_000_000) => evaluateDataset(data, inputs({ months, principal, today, startDate: today, inflation: 0.134 }));
    const arig = data.products.find((p) => p.id === 'arig-ordinary');
    eq(`${arig.rates.length}|${arig.min_principal_mnt}`, '13|10000', 'Ариг 13 интервал, доод 10,000');
    const a1 = run(1).ranked.find((e) => e.bank.id === 'arig');
    eq(`${a1.offer.annualPercent}|${a1.sourceTerm}|${a1.flags.mapped}`, '9|30–59 өдөр|true', 'Ариг 1 сар ≈ 30–59 хоног 9.0%');
    eq(run(24).ranked.find((e) => e.bank.id === 'arig').offer.annualPercent, 14.4, 'Ариг 24 сар ≈ 720–749 хоног 14.4%');
    ok(!run(12, 9_999).ranked.some((e) => e.bank.id === 'arig'), 'Ариг 10,000-аас бага дүн эрэмбэгүй');
    const t12 = run(12).nonRanked.find((n) => n.bank.id === 'transbank');
    ok(t12.category === 'conditions' && t12.reasons.some((r) => r.includes('дэмжээгүй')), 'Тээвэр 12 сар: улирлын олголт → шаардлага хангахгүй');
    eq(run(1).nonRanked.find((n) => n.bank.id === 'transbank').category, 'missing', 'Тээвэр 1 сар: «хүртэл» хүү → баталгаажаагүй (улирлын бүтээгдэхүүн 1 сард хамаарахгүй)');
    eq(run(3).ranked.find((e) => e.bank.id === 'transbank').offer.annualPercent, 11, 'Тээвэр 3 сар эрэмбэлэгдэнэ');
    const tdb24 = run(24).ranked.find((e) => e.bank.id === 'tdb');
    eq(`${tdb24.product.channel}|${tdb24.offer.annualPercent}`, 'branch|12.6', 'ХХБ 24 сар: онлайн 12.70% баталгаажаагүй → салбар 12.60%');
    eq(run(12).ranked.find((e) => e.bank.id === 'tdb').offer.annualPercent, 12.3, 'ХХБ 12 сар онлайн хэвээр');
    ok(['bogd-term', 'nibank-ordinary'].every((id) => data.products.find((p) => p.id === id).verification_status !== 'verified'
      || data.products.find((p) => p.id === id).rates.some((r) => r.verification_status === 'needs_verification')), 'Богд, ҮХОБ баталгаажаагүй хэвээр');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

// ---------------------------------------------------------------- week 4 experiment (course guide)

// Course formula: net = P × r/100 × 0.9. The engine (ACT/365 illustrative,
// D5) must give the same whole-tugrik value for a 12-month term starting
// 2026-11-16 (365 days, no 29 Feb), whether the term is month- or day-based.
test('4-р долоо хоног: 10 сая × 14% × 12 сар = 1 260 000 ₮ (сараар, 2026-11-16)', () => {
  const prod = product({ day_count_convention: 'unknown', day_count_source_url: null });
  const o = offerFor(prod, { principal: 10_000_000, months: 12, start: '2026-11-16' });
  eq(o.eligibleDays, 365, 'хоног');
  eq(roundHalfAwayFromZero(o.totalNetInterest), 1_260_000, 'цэвэр хүү');
  eq(roundHalfAwayFromZero(o.totalNetInterest), roundHalfAwayFromZero(10_000_000 * 14 / 100 * 0.9), 'томьёотой');
});
test('4-р долоо хоног: 365 хоногоор тааруулсан 14% → 1 260 000 ₮', () => {
  const prod = product({ day_count_convention: 'unknown', day_count_source_url: null, rates: [rate(365, 'days', 14)] });
  const o = offerFor(prod, { principal: 10_000_000, months: 12, start: '2026-11-16' });
  eq(roundHalfAwayFromZero(o.totalNetInterest), 1_260_000, 'цэвэр хүү');
});
test('4-р долоо хоног: 29-р сарыг дамнасан 12 сар (366 хоног) томьёоноос зөрнө', () => {
  const prod = product({ day_count_convention: 'unknown', day_count_source_url: null });
  const o = offerFor(prod, { principal: 10_000_000, months: 12, start: '2027-03-01' });
  eq(o.eligibleDays, 366, 'хоног');
  eq(roundHalfAwayFromZero(o.totalNetInterest), 1_263_452, 'ACT/365 × 366 хоног');
});

// ---------------------------------------------------------------- UI redesign / D17 (2026-11-24)

test('D17-1. Эрэмбэ = татварын дараах цэвэр өгөөж (цэвэр хүү ÷ үндсэн), инфляцаас үл хамаарна', () => {
  // a: 14% at maturity; b: 13.9% monthly payout. With high inflation b has the higher real return
  // (earlier cash flows), but a has the higher net return → a ranks first under D17.
  const ds = dataset([
    product({ id: 'pa', bank_id: 'a', rates: [rate(12, 'months', 14)] }),
    product({ id: 'pb', bank_id: 'b', payout_frequency: 'monthly', rates: [rate(12, 'months', 13.9)] }),
  ]);
  const hi = evaluateDataset(ds, inputs({ inflation: 0.25 }));
  const lo = evaluateDataset(ds, inputs({ inflation: -0.02 }));
  const a = hi.ranked.find((e) => e.bank.id === 'a');
  const b = hi.ranked.find((e) => e.bank.id === 'b');
  ok(b.offer.realReturn > a.offer.realReturn, 'хяналт: b-ийн бодит өгөөж өндөр');
  eq(hi.ranked.map((e) => e.bank.id).join(), 'a,b', 'цэвэр өгөөжөөр a #1');
  eq(lo.ranked.map((e) => e.bank.id).join(), 'a,b', 'инфляц өөр ч дараалал ижил');
  close(a.netReturn, a.offer.totalNetInterest / a.offer.principal, 1e-15, 'netReturn = цэвэр хүү ÷ үндсэн');
  eq(a.displayNetReturn, formatPercentFromFraction(a.netReturn), 'дэлгэцийн утга');
  eq(netReturnOf(a.offer), a.netReturn, 'netReturnOf');
});

test('D17-2. Банк доторх хамгийн ашигтай бүтээгдэхүүнийг цэвэр өгөөжөөр сонгоно (P2-C)', () => {
  const ds = dataset([
    product({ id: 'p1', bank_id: 'a', rates: [rate(12, 'months', 13)] }),
    product({ id: 'p2', bank_id: 'a', payout_frequency: 'monthly', rates: [rate(12, 'months', 12.95)] }),
  ]);
  eq(evaluateDataset(ds, inputs({ inflation: 0.30 })).ranked[0].product.id, 'p1', 'өндөр инфляцид ч p1');
});

test('UI-1. Онцлох карт: №1 шошго, татварын дараах цэвэр өгөөж, инфляц сонголтоор', () => {
  const ds = twoBankDataset();
  const r = evaluateDataset(ds, inputs());
  const box = document.createElement('section');
  renderFeatured(box, r.ranked[0], { inflationEnabled: false, principalValid: true });
  ok(box.querySelector('.feat-ribbon').textContent.includes('№1 Хамгийн ашигтай банк'), '#1 шошго');
  ok(!box.querySelector('.feat-infl'), 'инфляц унтраалттай үед бодит үзүүлэлт харагдахгүй');
  ok([...box.querySelectorAll('.kpi__label')].map((k) => k.textContent).join('|') === 'Жилийн хүү|Татварын дараах цэвэр өгөөж', 'KPI');
  ok(box.textContent.includes(r.ranked[0].displayNetReturn), 'цэвэр өгөөж');
  ok(box.textContent.includes(formatMNT(r.ranked[0].offer.totalNominalProceeds)), 'эцсийн дүн');
  ok(!box.textContent.includes('Бодит өгөөж'), '«бодит өгөөж» гэж нэрлэхгүй');
  ok(box.querySelector('details.feat-more') && !box.querySelector('details.feat-more').open, 'нөхцөл ба эх сурвалж эвхэгдсэн');
  ok(box.querySelector('.feat-more a[href^="https:"]'), 'эх сурвалжийн холбоос хадгалагдсан');
  renderFeatured(box, r.ranked[0], { inflationEnabled: true, principalValid: true });
  const infl = box.querySelector('.feat-infl');
  ok(infl && infl.textContent.includes('Өнөөгийн худалдан авах чадвар') && infl.textContent.includes(formatMNT(r.ranked[0].offer.todayValue)), 'асаавал бодит үзүүлэлт');
  renderFeatured(box, r.ranked[1], { inflationEnabled: false, principalValid: true });
  ok(box.querySelector('.feat-ribbon').textContent.includes('эрэмбэ №2'), '№2 банк #1 шошгогүй');
  eq(box.querySelector('#featured-title').textContent, r.ranked[1].bank.name, 'банкны нэр холилдохгүй');
});

test('UI-2. Эрэмбийн хүснэгт: 8 багана, эхний 3 мөрийн өнгө, медальгүй, сонгосон мөр', () => {
  const ds = dataset(['a', 'b', 'c', 'd'].map((id, i) => product({ id: `p${id}`, bank_id: id, rates: [rate(12, 'months', 14 - i)] })));
  const r = evaluateDataset(ds, inputs());
  const head = document.createElement('div');
  const body = document.createElement('div');
  let picked = null;
  renderRanking({ head, body }, r, { months: 12, principal: 22_000_000, selectedBankId: 'c' }, (id) => { picked = id; });
  const ths = [...body.querySelectorAll('thead th')].map((t) => t.textContent);
  eq(ths.join('|'), '№|Банкны нэр|Жилийн хүү|Хүүгийн нийт орлого|Суутгах татвар (10%)|Цэвэр хүүгийн орлого|Эцэст авах мөнгө|Цэвэр өгөөж', 'гарчиг');
  const rows = [...body.querySelectorAll('tbody tr')];
  eq(rows.length, 4, 'бүх эрэмбэлэгдсэн банк');
  ok(rows[0].classList.contains('rank-row--1') && rows[1].classList.contains('rank-row--2') && rows[2].classList.contains('rank-row--3') && !/rank-row--/.test(rows[3].className), 'эрэмбийн өнгө');
  ok(!body.querySelector('.medal'), 'медальгүй');
  ok(rows[2].classList.contains('is-selected') && rows[2].classList.contains('rank-row--3'), 'сонгосон мөр эрэмбийн өнгөө хадгална');
  eq(rows[0].querySelector('td:last-child').textContent, r.ranked[0].displayNetReturn, 'цэвэр өгөөж');
  ok(rows[0].textContent.includes(formatMNT(r.ranked[0].offer.totalNominalProceeds)), 'бүтэн ₮ (сая биш)');
  rows[3].click();
  eq(picked, 'd', 'мөр дарж сонгоно');
  ok(rows.every((tr) => tr.querySelector('button.bank-select')), 'гарын товчлуураар сонгох боломж');
  ok(head.querySelector('h2').textContent.includes('цэвэр өгөөжийн эрэмбэ (4 банк)'), 'гарчиг тоотой');
});

test('UI-3. CSV: инфляц унтраалттай үед «тооцоогүй», бодит баганууд хоосон; цэвэр өгөөж дэлгэцтэй ижил', () => {
  const ds = twoBankDataset();
  const inp = inputs();
  const r = evaluateDataset(ds, inp);
  const parse = (csv) => csv.replace(BOM, '').split('\r\n').filter(Boolean).map((l) => l.split(','));
  const off = parse(rankingCSV(r, { ...inp, inflationEnabled: false }));
  const col = (name) => RANKING_HEADERS.indexOf(name);
  eq(off[1][col('Инфляцийн сценари (%)')], 'тооцоогүй', 'сценари');
  eq(off[1][col('Бодит өгөөж, хугацааны нийт (%)')], '', 'бодит өгөөж хоосон');
  eq(off[1][col('Өнөөгийн худалдан авах чадвар (₮)')], '', 'худалдан авах чадвар хоосон');
  eq(Number(off[1][col('Цэвэр өгөөж, татварын дараа, хугацааны нийт (%)')]), Number(r.ranked[0].displayNetReturn.replace('%', '')), 'цэвэр өгөөж (дэлгэцийн бүхэлчлэлтэй)');
  const on = parse(rankingCSV(r, inp));
  ok(on[1][col('Бодит өгөөж, хугацааны нийт (%)')] !== '', 'асаалттай үед бодит өгөөж');
  eq(off.length, on.length, 'мөрийн тоо ижил');
});

// Real data: 1 / 22 / 100 сая ₮ × бүх хугацаа.
async function redesignDataCheck() {
  const name = 'D17-3. Баталгаажсан өгөгдөл: 1/22/100 сая ₮ × 7 хугацаа — татвар, цэвэр хүү, эцсийн дүн, цэвэр өгөөж, эрэмбэ инфляцаас үл хамаарна';
  try {
    const data = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    const today = D('2026-11-11');
    for (const principal of [1_000_000, 22_000_000, 100_000_000]) {
      for (const months of [1, 3, 6, 9, 12, 18, 24]) {
        const tag = `${principal / 1e6} сая/${months} сар`;
        const r = evaluateDataset(data, inputs({ principal, months, today, startDate: today, inflation: 0.134 }));
        const r2 = evaluateDataset(data, inputs({ principal, months, today, startDate: today, inflation: 0.02 }));
        eq(r.ranked.map((e) => e.bank.id).join(), r2.ranked.map((e) => e.bank.id).join(), `${tag}: инфляц эрэмбэд нөлөөлөхгүй`);
        eq(r.ranked.length + r.nonRanked.length, 12, `${tag}: 12 банк`);
        ok(r.ranked.every((e) => e.product.verification_status === 'verified'), `${tag}: зөвхөн баталгаажсан`);
        r.ranked.forEach((e, i) => {
          const o = e.offer;
          close(o.tax, o.grossInterest * 0.10, 1e-6, `${tag} ${e.bank.id}: татвар 10%`);
          close(o.totalNetInterest, o.grossInterest - o.tax, 1e-6, `${tag} ${e.bank.id}: цэвэр = нийт − татвар`);
          close(o.totalNominalProceeds, principal + o.totalNetInterest, 1e-6, `${tag} ${e.bank.id}: эцсийн дүн`);
          close(e.netReturn, o.totalNetInterest / principal, 1e-15, `${tag} ${e.bank.id}: цэвэр өгөөж`);
          if (i > 0) ok(r.ranked[i - 1].netReturn >= e.netReturn, `${tag}: буурах дараалал`);
        });
        const chart = prepareRankingChart(r, null, { limit: 5 });
        eq(chart.length, Math.min(5, r.ranked.length), `${tag}: эхний 5 багана`);
      }
    }
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

test('POLISH-1. Өсөлтийн графикийн тэнхлэг: жигд хуваарь, бодит сарын ойн огноо, эцэст хугацааны төгсгөл', () => {
  const ds = dataset(['a'].map((id) => product({ id: 'pa', bank_id: id, rates: [1, 3, 6, 9, 12, 18, 24].map((m) => rate(m, 'months', 12)) })));
  const want = { 1: 'Эхлэл,7 хоног,14 хоног,21 хоног,1 сар', 3: 'Эхлэл,1 сар,2 сар,3 сар', 6: 'Эхлэл,2 сар,4 сар,6 сар', 9: 'Эхлэл,3 сар,6 сар,9 сар',
    12: 'Эхлэл,3 сар,6 сар,9 сар,12 сар', 18: 'Эхлэл,3 сар,6 сар,9 сар,12 сар,15 сар,18 сар', 24: 'Эхлэл,6 сар,12 сар,18 сар,24 сар' };
  for (const months of [1, 3, 6, 9, 12, 18, 24]) {
    const e = evaluateDataset(ds, inputs({ months, startDate: D('2026-01-31') })).ranked[0];
    const g = prepareGrowthSeries(e);
    const ticks = growthTicks(e, g.final.days);
    eq(ticks.map((t) => t.label).join(','), want[months], `${months} сар: шошго`);
    eq(ticks[ticks.length - 1].days, g.final.days, `${months} сар: эцсийн хуваарь = хугацааны төгсгөл`);
    for (const t of ticks.filter((x) => /сар$/.test(x.label) && x.days > 0 && x.days < g.final.days)) {
      const k = Number(t.label.split(' ')[0]);
      eq(t.days, diffDays(D('2026-01-31'), addMonthsClamp(D('2026-01-31'), k)), `${months} сар: ${k} сарын огноо бодит`);
      ok(g.points.some((p) => p.days === t.days), `${months} сар: ${k} сард графикийн цэг байна`);
    }
  }
  const mapped = evaluateDataset(dataset([product({ id: 'pm', bank_id: 'm', rates: [rate(545, 'days', 12)] })]), inputs({ months: 18, startDate: D('2026-01-15') })).ranked[0];
  const mg = prepareGrowthSeries(mapped);
  eq(growthTicks(mapped, mg.final.days).pop().label, '545 хоног', 'өдрөөр зарласан 545 хоног нь «18 сар» гэж нэрлэгдэхгүй');
});

// ---------------------------------------------------------------- D18 — Google Sheets research data

const D18_HEAD = 'bank_id,bank,channel,m3,m6,m12,m24,source,checked,note,net12';

test('D18-1. CSV parser: хашилттай таслал, "", CRLF+BOM, хоосон талбар хадгалагдана', () => {
  eq(parserSelfTest().length, 0, 'parser өөрийн тест');
  const { head, records } = recordsFromText(`﻿${D18_HEAD}\r\nx,X банк,any,9,,12,,https://x.test/,2026-11-24,"a, ""b""",1080000`);
  eq(head.length, 11, 'багана');
  eq(records[0].m6, '', 'хоосон нүд хоосон хэвээр (0 биш)');
  eq(records[0].note, 'a, "b"', 'хашилттай note');
  eq(rateValue(records[0].m6), null, 'хоосон хүү → null');
  eq(rateValue('12.5'), 12.5, 'тоон хүү');
  eq(rateValue('12,5'), null, 'таслалтай бичлэг тоо биш');
});

test('D18-2. 13 CSV шалгалт: зөв хүснэгт PASS, хоосон хүүг 0 гэж тоолохгүй, буруу утга FAIL', () => {
  const row = (id, m24 = '12') => `${id},${id} банк,any,9,10,12,${m24},https://${id}.test/,2026-11-24,"тэмдэглэл, таслал",1080000`;
  const ids = 'a b c d e f g h i j k l'.split(' ');
  const good = recordsFromText([D18_HEAD, ...ids.map((id, i) => row(id, i < 2 ? '' : '12'))].join('\n'));
  const res = checkSheetsTable(good);
  eq(res.checks.length, 13, '13 шалгалт');
  eq(res.checks.filter((c) => c.pass === true).length, 13, 'бүгд PASS');
  eq(res.numeric, 46, '46 тоон'); eq(res.empty.length, 2, '2 хоосон');
  close(res.completeness, 46 / 48, 1e-12, 'бүрдэлт');
  const bad = recordsFromText([D18_HEAD, ...ids.map((id, i) => row(i === 0 ? 'a' : id, i === 3 ? 'n/a' : '12'))].join('\n').replace(',b банк', ',b банк'));
  bad.records[1].bank_id = 'a';
  const r2 = checkSheetsTable(bad);
  ok(r2.checks.some((c) => c.pass === false && c.name.startsWith('Тоон бус')), 'тоон бус утга FAIL');
  ok(r2.checks.some((c) => c.pass === false && c.name.startsWith('bank_id')), 'давхардал FAIL');
});

test('D18-3. Багшийн жишиг: net12 = 10 сая × m12/100 × 0.9, зөрүүг бүхэл ₮-өөр; зөрүү/дутуу үед PASS биш', () => {
  const recs = [
    { bank_id: 'a', bank: 'A', m12: '14.2', net12: '1278000' },
    { bank_id: 'b', bank: 'B', m12: '12.2', net12: '1098001' },
  ];
  const rows = benchmarkRows(recs);
  close(rows[0].net, 1_278_000, 1e-6, 'a цэвэр'); eq(rows[0].diff, 0, 'a зөрүү'); eq(rows[0].pass, true, 'a PASS');
  eq(rows[1].diff, -1, 'b зөрүү −1 ₮'); eq(rows[1].pass, false, 'b FAIL');
  eq(benchmarkSummary(rows, 2).pass, false, 'зөрүүтэй бол нийт FAIL');
  eq(benchmarkSummary(rows.slice(0, 1), 2).pass, null, 'дутуу банктай бол NOT VERIFIED');
  eq(benchmarkSummary(rows.slice(0, 1), 1).pass, true, 'бүгд 0 ₮ бол PASS');
});

test('D18-4. Эх сурвалжийн нотолгоо: утга snapshot-оос өөр бол NOT VERIFIED; хоосон → EMPTY', () => {
  const recs = [{ bank_id: 'a', m3: '9', m6: '10', m12: '', m24: '12' }];
  const sc = [
    { bank_id: 'a', term: 'm3', v2_rate_percent: '9', result: 'PASS', evidence: 'ok' },
    { bank_id: 'a', term: 'm6', v2_rate_percent: '9.5', result: 'PASS', evidence: 'old' },
  ];
  const cells = evidenceFor(recs, sc);
  eq(cells.map((c) => c.result).join(), 'PASS,NOT VERIFIED,EMPTY,NOT VERIFIED', 'нүд бүр');
  const counts = evidenceCounts(cells);
  eq(counts.PASS, 1, 'PASS'); eq(counts['NOT VERIFIED'], 2, 'NOT VERIFIED'); eq(counts.EMPTY, 1, 'EMPTY');
  eq(evidenceFor(recs, null).filter((c) => c.result === 'PASS').length, 0, 'source_check алга → PASS байхгүй');
});

test('D18-5. Sheets → dataset: хуучин хүү холилдохгүй, нөхцөлийг ижил URL-аар холбоно, ≈ тааруулсан өдөр', () => {
  const catalog = {
    tax: {}, inflation: {},
    banks: [{ id: 'a', name: 'A' }, { id: 'x', name: 'X' }, { id: 'z', name: 'Z' }],
    products: [
      product({ id: 'a-old', bank_id: 'a', min_principal_mnt: 50000, payout_frequency: 'at_maturity', source_url: 'https://a.test/p/',
        amount_bonus_tiers: [{ min_amount_mnt: 0, bonus_percent: 1 }], rates: [rate(3, 'months', 1), rate(12, 'months', 1)] }),
      product({ id: 'x-old', bank_id: 'x', verification_status: 'excluded', exclusion_reason: 'compound_interest', rates: [] }),
    ],
  };
  const sheets = { source: 'live', url: 'u', error: null, records: [
    { bank_id: 'a', bank: 'A', channel: 'online', m3: '9', m6: '10', m12: '12', m24: '', source: 'https://a.test/p', checked: '2026-11-24', note: 'm12 ≈ тааруулсан (365 хоног)' },
    { bank_id: 'x', bank: 'X', channel: 'any', m3: '9', m6: '', m12: '11', m24: '', source: 'https://x.test/', checked: '2026-11-25', note: '' },
  ] };
  const ds = buildResearchDataset(catalog, sheets);
  eq(validateDataset(ds).length, 0, 'бүтэц хүчинтэй');
  eq(ds.dataset_status, 'research', 'горим'); eq(ds.snapshot_at, '2026-11-25', 'хамгийн сүүлийн checked');
  const aProducts = ds.products.filter((p) => p.bank_id === 'a');
  eq(aProducts.length, 2, 'a: холбогдсон (m3, m12) ба ерөнхий (m6) бүтээгдэхүүн');
  const linked = aProducts.find((p) => p.conditions_from === 'a-old');
  eq(linked.min_principal_mnt, 50000, 'доод дүн холбосон бүтээгдэхүүнээс');
  eq(linked.amount_bonus_tiers, undefined, 'нэмэгдлийн шатлал хуулагдахгүй');
  eq(linked.rates.map((r) => r.annual_percent).join(), '9,12', 'зөвхөн Sheets-ийн хүү');
  const m12 = linked.rates.find((r) => r.sheets_term === 'm12');
  eq(`${m12.source_term_unit}:${m12.source_term_value}`, 'days:365', 'note-ийн ≈ тааруулсан → D1 өдөр');
  const generic = aProducts.find((p) => p.conditions_from == null);
  eq(generic.payout_frequency, 'unknown', 'холбоогүй бол олголт тодорхойгүй');
  eq(generic.min_principal_mnt, null, 'холбоогүй бол доод дүн тодорхойгүй');
  const x = ds.products.find((p) => p.bank_id === 'x');
  eq(x.verification_status, 'excluded', 'хасагдсан банк хасагдсан хэвээр');
  eq(ds.products.some((p) => p.bank_id === 'z'), false, 'Sheets-д мөргүй банк бүтээгдэхүүнгүй');
  eq(isMappedTerm('m12 ≈ тааруулсан', 'm12') && !isMappedTerm('m12 ≈ тааруулсан', 'm3'), true, 'тааруулсан хугацаа танигдана');
});

async function d18DataCheck() {
  const name = 'D18-6. Бодит өгөгдөл (локал нөөц CSV + deposits.json): 12 банк, 46/2, 12/12 тулгалт 0 ₮, хасалт ба хүлээлгэсэн хүү, 1/9/18 сар хоосон';
  try {
    const catalog = await fetch('../data/deposits.json', { cache: 'no-store' }).then((r) => r.json());
    const sheets = await loadSheetsData({ sheetsUrl: '', fallbackUrl: '../data/clean/rates_clean.csv' });
    eq(sheets.source, 'fallback', 'холбоосгүй үед fallback');
    eq(sheets.head.length, 11, '11 багана'); eq(sheets.records.length, 12, '12 банк');
    eq(sheets.numeric, 46, '46 тоон'); eq(sheets.empty.join(), 'golomt.m24,bogd.m24', '2 хоосон');
    eq(sheets.checks.filter((c) => c.pass === true).length, 13, '13/13 CSV шалгалт');
    const bench = benchmarkSummary(benchmarkRows(sheets.records), 12);
    eq(bench.matched, 12, '12/12'); eq(bench.maxDiff, 0, 'max 0 ₮');
    const ds = buildResearchDataset(catalog, sheets);
    eq(validateDataset(ds).length, 0, 'dataset хүчинтэй');
    const run = (months, principal = 10_000_000) => evaluateDataset(ds, inputs({ months, principal, today: D('2026-11-25'), startDate: D('2026-11-25') }));
    const r12 = run(12);
    eq(r12.mode, 'research', 'горим research');
    eq(r12.ranked.length + r12.nonRanked.length, 12, '12 банк нэг удаа');
    const nr = new Map(r12.nonRanked.map((n) => [n.bank.id, n]));
    eq(nr.get('xac')?.category, 'conditions', 'ХасБанк хасагдсан (нийлмэл)');
    eq(nr.get('chinggis')?.category, 'conditions', 'Чингис хасагдсан (тусгай бүлэг)');
    eq(nr.get('transbank')?.category, 'conditions', 'Тээвэр 12 сар: улирлын олголт дэмжээгүй');
    eq(nr.get('transbank').reasons.length, 1, 'Тээвэр: «Sheets-д алга» гэх шалтгаан давхардахгүй');
    eq(nr.get('bogd')?.category, 'missing', 'Богд 12 сар: шаталсан хүү хүлээлгэсэн');
    ok(r12.ranked.every((e) => e.flags.research && e.product.verification_status === 'research'), 'зөвхөн судалгааны хүү эрэмбэлэгдэнэ');
    ok(r12.ranked.every((e) => e.offer.bonusPercent === 0), 'дүнгийн нэмэгдэл тооцохгүй (Sheets-д дахин нягтлаагүй)');
    eq(r12.ranked[0].bank.id, 'capitron', '12 сарын №1');
    ok(r12.ranked.find((e) => e.bank.id === 'khan').flags.mapped, 'ХААН 12 сар ≈ тааруулсан');
    for (const m of [1, 9, 18]) eq(run(m).ranked.length, 0, `${m} сар: эрэмбэ хоосон (хуучин хүүгээр нөхөхгүй)`);
    eq(run(3).ranked.some((e) => e.bank.id === 'transbank'), true, 'Тээвэр 3 сар эрэмбэлэгдэнэ');
    eq(run(3).ranked.some((e) => e.bank.id === 'bogd'), true, 'Богд 3 сар эрэмбэлэгдэнэ');
    eq(run(12).ranked.map((e) => e.bank.id).join(), evaluateDataset(ds, inputs({ months: 12, principal: 10_000_000, today: D('2026-11-25'), startDate: D('2026-11-25'), inflation: 0.2 })).ranked.map((e) => e.bank.id).join(), 'инфляц эрэмбэд нөлөөлөхгүй');
    const matrix = prepareRateMatrix(ds);
    eq(matrix.mode, 'research', 'хүснэгтийн горим');
    ok(matrix.rows.find((r) => r.bank.id === 'golomt').cells.find((c) => c.months === 24).state === 'absent', 'хоосон m24 → «—», 0 биш');
    eq(csvFileName('ranking', { mode: 'research', months: 12, today: D('2026-11-25') }).startsWith('RESEARCH_'), true, 'CSV файлын нэр');
    const bad = await loadSheetsData({ sheetsUrl: 'https://example.com/not-sheets.csv', fallbackUrl: '../data/clean/rates_clean.csv' });
    eq(bad.source, 'fallback', 'Sheets биш холбоос → fallback'); ok(bad.error, 'fallback шалтгаан бичигдэнэ');
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, message: e.message });
  }
}

// ---------------------------------------------------------------- report

function report() {
  const passed = results.filter((r) => r.ok).length;
  const summary = document.getElementById('summary');
  summary.textContent = `${passed} / ${results.length} тест амжилттай`;
  summary.className = passed === results.length ? 'pass' : 'fail';
  const list = document.getElementById('results');
  list.replaceChildren(...results.map((r) => {
    const li = document.createElement('li');
    li.className = r.ok ? 'pass' : 'fail';
    li.textContent = `${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ` — ${r.message}`}`;
    return li;
  }));
  window.__TEST_RESULTS__ = { passed, total: results.length, failed: results.filter((r) => !r.ok) };
  document.title = `${passed}/${results.length} — Тест`;
}

demoDatasetCheck().then(verifiedDatasetCheck).then(logoAssetCheck).then(csvAsyncCheck).then(phase4bDataCheck).then(redesignDataCheck).then(d18DataCheck).then(report);
