// D18 — builds the dashboard dataset from the Google Sheets research table.
// Rates come only from Sheets (live or its local fallback copy); data/deposits.json is used as
// the catalogue: banks, logos, tax, inflation and product conditions, linked by bank_id.
// Old deposits.json rates are never copied, so old and new rates are never mixed.

import { TERM_DAY_MAP } from './config.js';
import { termCandidates } from './calc.js';
import { SHEETS_RATE_COLUMNS, SHEETS_TERMS, rateValue } from './sheets.js';

/**
 * Cells that must not be ranked although Sheets has a number, because the bank's condition
 * cannot be modelled in this phase (no guessed algorithm). The rate stays visible.
 */
export const SHEETS_RATE_HOLDS = Object.freeze({
  'bogd.m12': 'Дүнгээс хамаарсан шаталсан хүү (Sheets note: 2 сая хүртэл 13%, түүнээс дээш 13.5%) — шаталсан хүүг энэ шатанд тооцоогүй',
});

// Product conditions copied from the linked deposits.json product. Rates and amount bonus
// tiers are never copied (D14 P2-B bonuses must be re-confirmed for the new rates).
const CONDITION_FIELDS = [
  'currency', 'interest_type', 'customer_restriction', 'min_principal_mnt', 'max_principal_mnt',
  'day_count_convention', 'day_count_source_url', 'payout_frequency', 'payment_schedule_rule',
];

const normUrl = (u) => (u ?? '').trim().replace(/\/+$/, '');

/** Note text «m3 ≈ тааруулсан (90 хоног → …)» marks a day-published term mapped via D1. */
export function isMappedTerm(note, term) {
  return new RegExp(`(^|[^a-z0-9])${term} ≈ тааруулсан`).test(note ?? '');
}

function pickLinkedProduct(catalogProducts, rec, months) {
  const candidates = catalogProducts.filter((p) => p.verification_status !== 'excluded'
    && normUrl(p.source_url) === normUrl(rec.source)
    && termCandidates(p.rates, months) != null);
  return candidates.find((p) => p.channel === rec.channel) ?? candidates[0] ?? null;
}

function sheetsRate(rec, term, months, value) {
  const mapped = isMappedTerm(rec.note, term) && TERM_DAY_MAP[months] != null;
  const hold = SHEETS_RATE_HOLDS[`${rec.bank_id}.${term}`];
  return {
    source_term_unit: mapped ? 'days' : 'months',
    source_term_value: mapped ? TERM_DAY_MAP[months] : months,
    annual_percent: value,
    verification_status: hold ? 'needs_verification' : 'research',
    status_note: hold ?? null,
    sheets_term: term,
  };
}

function baseProduct(rec, overrides) {
  return {
    bank_id: rec.bank_id,
    currency: 'MNT',
    interest_type: 'simple',
    channel: rec.channel || 'unknown',
    customer_restriction: null,
    min_principal_mnt: null,
    max_principal_mnt: null,
    day_count_convention: 'unknown',
    day_count_source_url: null,
    payout_frequency: 'unknown',
    payment_schedule_rule: null,
    verified_at: rec.checked || null,
    source_url: rec.source || null,
    verification_status: 'research',
    exclusion_reason: null,
    status_note: null,
    sheets_note: rec.note || null,
    conditions_from: null,
    ...overrides,
  };
}

/**
 * @param catalog  data/deposits.json (validated)
 * @param sheets   result of loadSheetsData (records + source)
 * @returns dataset for evaluateDataset, with dataset_status 'research'
 */
export function buildResearchDataset(catalog, sheets) {
  const byBank = new Map(sheets.records.map((r) => [r.bank_id, r]));
  const products = [];
  const links = [];

  for (const bank of catalog.banks) {
    const rec = byBank.get(bank.id);
    if (!rec) continue; // bank stays visible as «мэдээлэл дутуу» (no products)
    const catalogProducts = catalog.products.filter((p) => p.bank_id === bank.id);
    const numericTerms = SHEETS_RATE_COLUMNS
      .map((term, i) => ({ term, months: SHEETS_TERMS[i], value: rateValue(rec[term]) }))
      .filter((t) => t.value != null);

    // Banks excluded by approved rules (D9 restricted group, D15-5 compound interest) stay
    // excluded; their Sheets rates are kept only for display and the benchmark table.
    if (catalogProducts.length > 0 && catalogProducts.every((p) => p.verification_status === 'excluded')) {
      const ex = catalogProducts[0];
      products.push(baseProduct(rec, {
        id: `${ex.id}-sheets`,
        name: ex.name,
        ...Object.fromEntries(CONDITION_FIELDS.filter((f) => f in ex).map((f) => [f, ex[f]])),
        verification_status: 'excluded',
        exclusion_reason: ex.exclusion_reason,
        status_note: ex.status_note ?? null,
        conditions_from: ex.id,
        rates: numericTerms.map((t) => ({ ...sheetsRate(rec, t.term, t.months, t.value), verification_status: 'excluded', status_note: null })),
      }));
      links.push({ bankId: bank.id, terms: numericTerms.map((t) => t.term), productId: ex.id, excluded: true });
      continue;
    }

    const groups = new Map();
    for (const t of numericTerms) {
      const linked = pickLinkedProduct(catalogProducts, rec, t.months);
      const key = linked?.id ?? '';
      if (!groups.has(key)) groups.set(key, { linked, terms: [] });
      groups.get(key).terms.push(t);
    }
    for (const { linked, terms } of groups.values()) {
      products.push(baseProduct(rec, {
        id: `${linked?.id ?? `${bank.id}-research`}-sheets`,
        name: linked?.name ?? 'Хугацаатай хадгаламж (судалгааны хүснэгт)',
        ...(linked ? Object.fromEntries(CONDITION_FIELDS.filter((f) => f in linked).map((f) => [f, linked[f]])) : {}),
        conditions_from: linked?.id ?? null,
        rates: terms.map((t) => sheetsRate(rec, t.term, t.months, t.value)),
      }));
      links.push({ bankId: bank.id, terms: terms.map((t) => t.term), productId: linked?.id ?? null, excluded: false });
    }
  }

  const checkedDates = sheets.records.map((r) => r.checked).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const catalogIds = new Set(catalog.banks.map((b) => b.id));
  return {
    schema_version: 1,
    dataset_status: 'research',
    snapshot_at: checkedDates[checkedDates.length - 1] ?? null,
    dataset_note: 'Хүүг судлаачийн Google Sheets `clean` хүснэгтээс авсан (D18). Банкны албан хуудастай файлаар баталгаажуулаагүй утгууд орсон.',
    tax: catalog.tax,
    inflation: catalog.inflation,
    banks: catalog.banks,
    products,
    research: {
      source: sheets.source,
      url: sheets.url,
      error: sheets.error,
      terms: [...SHEETS_TERMS],
      links,
      unknownBanks: sheets.records.map((r) => r.bank_id).filter((id) => !catalogIds.has(id)),
      missingBanks: catalog.banks.map((b) => b.id).filter((id) => !byBank.has(id)),
    },
  };
}
