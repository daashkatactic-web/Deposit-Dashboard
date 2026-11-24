// Eligibility, per-bank best offer and ranking (CALCULATION_RULES.md
// "Eligibility and ranking"). Pure functions; no DOM access.

import { FRESHNESS_DAYS } from './config.js';
import { amountBonusPercent, computeOffer, matchTerm, resolvePayout, sourceTermLabel } from './calc.js';
import { diffDays, parseObservedDate } from './dates.js';
import { formatPercentFromFraction } from './format.js';

export const CATEGORY = Object.freeze({
  // P2-D (approved): eligibility failure / missing verification / unavailable term.
  CONDITIONS: 'conditions',    // «Шаардлага хангахгүй» — product type, customer group, amount
  MISSING: 'missing',          // «Баталгаажаагүй / мэдээлэл дутуу»
  NO_PRODUCT: 'no_product',    // «Энэ хугацаанд санал зарлаагүй»
});

const EXCLUSION_TEXT = {
  compound_interest: 'Нийлмэл хүүтэй бүтээгдэхүүн — хамрах хүрээнд ороогүй',
  restricted_customer_group: 'Тусгай бүлэгт зориулсан бүтээгдэхүүн',
  non_mnt: 'Төгрөгийн бус бүтээгдэхүүн',
  not_fixed_term: 'Хугацаатай хадгаламж биш',
};

/** D11 — stale when older than FRESHNESS_DAYS, or when the observation date is unknown. */
export function freshness(observedAt, today) {
  const observed = parseObservedDate(observedAt);
  if (!observed) return { stale: true, unknown: true, ageDays: null };
  const ageDays = diffDays(observed, today);
  return { stale: ageDays > FRESHNESS_DAYS, unknown: false, ageDays };
}

const fail = (category, reason) => ({ ok: false, category, reason });
const withNote = (text, note) => (note ? `${text}: ${note}` : text);

export function evaluateProduct(product, ctx) {
  const { mode, principal, months, startDate, inflation, today } = ctx;

  if (product.verification_status === 'excluded') {
    return fail(CATEGORY.CONDITIONS, withNote(EXCLUSION_TEXT[product.exclusion_reason] ?? 'Хамрах хүрээнээс хассан', product.status_note));
  }
  if (product.interest_type !== 'simple') return fail(CATEGORY.CONDITIONS, EXCLUSION_TEXT.compound_interest);
  if (product.currency !== 'MNT') return fail(CATEGORY.CONDITIONS, EXCLUSION_TEXT.non_mnt);
  if (product.customer_restriction) {
    return fail(CATEGORY.CONDITIONS, `${EXCLUSION_TEXT.restricted_customer_group} (${product.customer_restriction})`);
  }
  if (product.verification_status === 'needs_verification') {
    return fail(CATEGORY.MISSING, withNote('Мэдээллийг албан эх сурвалжаас бүрэн баталгаажуулаагүй', product.status_note));
  }
  if (product.verification_status !== mode) {
    return fail(CATEGORY.MISSING, mode === 'demo'
      ? 'DEMO горимд зөвхөн демо өгөгдөл эрэмбэлэгдэнэ'
      : 'Баталгаажаагүй (демо) өгөгдөл — эрэмбэд оруулахгүй');
  }
  if (!product.source_url) return fail(CATEGORY.MISSING, 'Албан эх сурвалжийн холбоос байхгүй');

  if (!(Number.isFinite(principal) && principal > 0)) return fail(CATEGORY.CONDITIONS, 'Хадгаламжийн дүн оруулаагүй');
  if (product.min_principal_mnt != null && principal < product.min_principal_mnt) {
    return fail(CATEGORY.CONDITIONS, `Доод дүн ${product.min_principal_mnt.toLocaleString('en-US')} ₮-өөс бага`);
  }
  if (product.max_principal_mnt != null && principal > product.max_principal_mnt) {
    return fail(CATEGORY.CONDITIONS, `Дээд дүн ${product.max_principal_mnt.toLocaleString('en-US')} ₮-өөс их`);
  }

  const match = matchTerm(product.rates, months, principal);
  if (match.status === 'no_term') return fail(CATEGORY.NO_PRODUCT, `${months} сарын хугацаанд санал зарлаагүй`);
  // Checked after the term match (Phase 4B): a product whose unsupported payout only
  // applies to other terms must not move the bank into «Шаардлага хангахгүй».
  if (!resolvePayout(product).supported) return fail(CATEGORY.CONDITIONS, 'Хүү олгох хэлбэрийг одоогоор дэмжээгүй');
  if (match.status === 'amount_out_of_tier') return fail(CATEGORY.CONDITIONS, 'Дүн нь хүүгийн шатлалд багтахгүй');

  const rate = match.rate;
  if (rate.verification_status && rate.verification_status !== mode) {
    return fail(CATEGORY.MISSING, withNote(`${months} сарын хүүг баталгаажуулаагүй`, rate.status_note));
  }
  const sourceUrl = rate.source_url ?? product.source_url;
  const observedAt = rate.observed_at ?? product.verified_at ?? null;

  const bonusPercent = amountBonusPercent(product, principal);
  const offer = computeOffer({ principal, match, product, startDate, q: inflation, bonusPercent });
  const fresh = freshness(observedAt, today);

  return {
    ok: true,
    product,
    rate,
    match,
    offer,
    sourceUrl,
    observedAt,
    sourceTerm: sourceTermLabel(rate),
    flags: {
      demo: mode === 'demo',
      mapped: match.match_type === 'mapped',
      monthRange: match.match_type === 'month_range',
      amountBonus: bonusPercent > 0,
      illustrative: offer.calc_status === 'illustrative',
      payoutAssumed: offer.payoutAssumed,
      scheduleIllustrative: offer.scheduleIllustrative,
      stale: fresh.stale,
      observedUnknown: fresh.unknown,
    },
  };
}

export function compareEntries(a, b) {
  return (b.offer.realReturn - a.offer.realReturn)
    || (b.offer.totalNetInterest - a.offer.totalNetInterest)
    || a.bank.name.localeCompare(b.bank.name, 'mn');
}

// P2-D: a bank is listed once, under the first category that applies to any of
// its products (an unverified term outranks «term not offered»).
const CATEGORY_PRIORITY = [CATEGORY.CONDITIONS, CATEGORY.MISSING, CATEGORY.NO_PRODUCT];

/**
 * Evaluates every bank. Returns ranked entries (one per bank, best eligible
 * offer) and non-ranked banks with reasons. Every bank appears exactly once.
 */
export function evaluateDataset(dataset, inputs) {
  const mode = dataset.dataset_status;
  const ctx = { ...inputs, mode };
  const ranked = [];
  const nonRanked = [];

  for (const bank of dataset.banks) {
    const products = dataset.products.filter((p) => p.bank_id === bank.id);
    if (products.length === 0) {
      nonRanked.push({
        bank,
        category: CATEGORY.MISSING,
        reasons: [bank.research_note || 'Албан бүтээгдэхүүний мэдээлэл оруулаагүй'],
      });
      continue;
    }
    const results = products.map((p) => evaluateProduct(p, ctx));
    const eligible = results.filter((r) => r.ok).map((r) => ({ ...r, bank }));
    if (eligible.length > 0) {
      eligible.sort(compareEntries);
      ranked.push(eligible[0]);
    } else {
      const ordered = [...results].sort((a, b) => CATEGORY_PRIORITY.indexOf(a.category) - CATEGORY_PRIORITY.indexOf(b.category));
      const reasons = [...new Set(ordered.map((r) => `${r.reason}`))];
      const category = CATEGORY_PRIORITY.find((c) => results.some((r) => r.category === c));
      nonRanked.push({ bank, category, reasons, products });
    }
  }

  ranked.sort(compareEntries);
  ranked.forEach((entry, i) => {
    entry.rank = i + 1;
    entry.displayRealReturn = formatPercentFromFraction(entry.offer.realReturn, { signed: true });
  });
  // Indicate ties hidden by display rounding (PROJECT_SPEC interaction contract 6).
  for (let i = 1; i < ranked.length; i += 1) {
    if (ranked[i].displayRealReturn === ranked[i - 1].displayRealReturn) {
      ranked[i].tieHidden = true;
      ranked[i - 1].tieHidden = true;
    }
  }
  return { mode, ranked, nonRanked };
}

/**
 * Keeps the user's selection while it is still ranked; otherwise falls back to
 * #1, or null when nothing is ranked (approved rule D15).
 */
export function resolveSelection(selectedBankId, ranked) {
  if (selectedBankId && ranked.some((e) => e.bank.id === selectedBankId)) return selectedBankId;
  return ranked[0]?.bank.id ?? null;
}
