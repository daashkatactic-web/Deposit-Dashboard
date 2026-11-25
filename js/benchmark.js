// Teacher's benchmark (week 4): net12 = 10 000 000 × (m12 / 100) × 0.9 for every bank in the
// Sheets table, reconciled with the Sheets `net12` formula column. Deliberately independent of
// the dashboard engine (calc.js / ranking.js): no eligibility, exclusions, compound, tiered or
// extra-day interest, no day count, no inflation. It is a check of the data, not a bank payout.

import { roundHalfAwayFromZero } from './format.js';
import { NUMBER_RE, rateValue } from './sheets.js';

export const BENCHMARK = Object.freeze({ principal: 10_000_000, months: 12, taxRate: 0.1, term: 'm12' });

export function benchmarkRows(records) {
  return records.map((rec) => {
    const r = rateValue(rec[BENCHMARK.term]);
    const gross = r == null ? null : BENCHMARK.principal * (r / 100);
    const tax = gross == null ? null : gross * BENCHMARK.taxRate;
    const net = r == null ? null : BENCHMARK.principal * (r / 100) * 0.9; // the task's formula, verbatim
    const sheets = NUMBER_RE.test(rec.net12 ?? '') ? Number(rec.net12) : null;
    // Whole tugriks on both sides, half-up (D10); the raw difference is kept as well.
    const diff = net != null && sheets != null ? roundHalfAwayFromZero(net) - roundHalfAwayFromZero(sheets) : null;
    const rawDiff = net != null && sheets != null ? net - sheets : null;
    return { bankId: rec.bank_id, bank: rec.bank, rate: r, gross, tax, net, sheets, diff, rawDiff, pass: diff == null ? null : diff === 0 };
  });
}

/** PASS only when every bank was compared and every difference is 0 ₮. */
export function benchmarkSummary(rows, expectedBanks) {
  const compared = rows.filter((x) => x.pass !== null);
  const diffs = compared.map((x) => Math.abs(x.diff));
  const failed = rows.filter((x) => x.pass === false).length;
  const complete = rows.length === expectedBanks && compared.length === rows.length;
  return {
    banks: rows.length,
    compared: compared.length,
    matched: rows.filter((x) => x.pass === true).length,
    failed,
    maxDiff: diffs.length ? Math.max(...diffs) : null,
    pass: failed > 0 ? false : complete ? true : null,
  };
}
