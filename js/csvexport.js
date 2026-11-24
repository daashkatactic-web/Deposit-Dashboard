// CSV export (Phase 4A). Builds files from the same evaluated ranking and rate
// matrix that the dashboard renders — never from separate calculations.
// Pure string builders + one small DOM helper (downloadCSV).
//
// Format: UTF-8 with BOM (Excel opens Mongolian text correctly), comma
// delimiter, CRLF line ends, RFC 4180 quoting, dot decimal separator.
// MNT values are the displayed whole tugriks (half-up, D10); percentages are
// the displayed two-decimal values, so the file matches the screen.

import { TAX_RATE, TERM_DAY_MAP } from './config.js';
import { formatMNT, formatPercent, formatPercentFromFraction } from './format.js';
import { parseObservedDate, toISO } from './dates.js';
import { CATEGORY, freshness } from './ranking.js';

export const BOM = '﻿';
const EOL = '\r\n';

// ---------------------------------------------------------------- primitives

/**
 * One CSV field. Numbers are written as-is; text is quoted when it contains a
 * delimiter, quote or line break. Text that a spreadsheet would treat as a
 * formula (=, +, -, @, tab, CR at the start) is prefixed with an apostrophe —
 * except plain signed numbers such as "-0.71".
 */
export function csvField(value) {
  if (value == null) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  if (typeof value === 'boolean') return value ? 'тийм' : 'үгүй';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Full CSV text with BOM. `rows` are arrays aligned with `headers`. */
export function toCSV(headers, rows) {
  const lines = [headers, ...rows].map((r) => r.map(csvField).join(','));
  return BOM + lines.join(EOL) + EOL;
}

// Displayed values as plain numbers (true minus → ASCII hyphen for spreadsheets).
const asNumber = (text) => (text === '—' ? null : Number(text.replace('−', '-').replace(/[%₮,\s+]/g, '')));
const mnt = (v) => asNumber(formatMNT(v));
const pct = (v) => asNumber(formatPercent(v));
const pctFraction = (f) => asNumber(formatPercentFromFraction(f));
const isoOrBlank = (d) => (d ? toISO(d) : null);
const observedISO = (value) => isoOrBlank(parseObservedDate(value));

// ---------------------------------------------------------------- shared labels

const CATEGORY_TEXT = {
  [CATEGORY.CONDITIONS]: 'Шаардлага хангахгүй',
  [CATEGORY.MISSING]: 'Баталгаажаагүй / мэдээлэл дутуу',
  [CATEGORY.NO_PRODUCT]: 'Энэ хугацаанд санал зарлаагүй',
};
const VERIFICATION_TEXT = {
  verified: 'verified (баталгаажсан)',
  needs_verification: 'needs_verification (баталгаажаагүй)',
  excluded: 'excluded (хасагдсан)',
  demo: 'demo (DEMO)',
};
const MATCH_TEXT = {
  exact: 'Яг сараар зарласан',
  month_range: 'Сарын интервал',
  mapped: '≈ тааруулсан (D1)',
};
const PAYOUT_TEXT = {
  at_maturity: 'Хугацааны эцэст',
  monthly: 'Сар бүр',
  quarterly: 'Улирал бүр',
  unknown: 'Тодорхойгүй',
};
const CHANNEL_TEXT = { online: 'Онлайн', branch: 'Салбар', any: 'Онлайн ба салбар', unknown: 'Суваг тодорхойгүй' };
const channel = (c) => CHANNEL_TEXT[c] ?? c ?? CHANNEL_TEXT.unknown;
const verification = (s) => VERIFICATION_TEXT[s] ?? s ?? '';

function entryFlags(entry) {
  const f = entry.flags;
  return [
    f.demo && 'DEMO',
    f.mapped && `≈ тааруулсан (${entry.sourceTerm} → ${entry.match.months} сар)`,
    f.monthRange && 'Сарын интервал',
    f.amountBonus && `+${entry.offer.bonusPercent}% дүнгийн нэмэгдэл`,
    f.illustrative && 'Жишээ тооцоо (ACT/365)',
    f.payoutAssumed && 'Хүү олгох хэлбэр тодорхойгүй — хугацааны эцэст гэж тооцсон',
    f.scheduleIllustrative && 'Төлбөрийн огноо жишээ',
    f.stale && 'Шинэчлэх шаардлагатай',
    entry.tieHidden && 'Бүхэлчлэлийн түвшинд тэнцүү',
  ].filter(Boolean).join('; ');
}

// ---------------------------------------------------------------- 1. ranking

export const RANKING_HEADERS = Object.freeze([
  'Өгөгдлийн горим', 'Хадгаламжийн дүн (₮)', 'Сонгосон хугацаа (сар)', 'Инфляцийн сценари (%)', 'Эхлэх огноо',
  'Эрэмбэ', 'Эрэмбийн төлөв', 'Шалтгаан', 'Банкны ID', 'Банк', 'Бүтээгдэхүүн', 'Суваг', 'Баталгаажуулалтын төлөв',
  'Банкны зарласан хугацаа', 'Хугацаа тааруулалт', 'Тооцсон хоног', 'Дуусах огноо',
  'Үндсэн хүү (%)', 'Дүнгийн нэмэгдэл (%)', 'Жилийн нэрлэсэн хүү (%)',
  'Хүү татвараас өмнө (₮)', `Хүүгийн татвар ${Math.round(TAX_RATE * 100)}% (₮)`, 'Нийт цэвэр хүү (₮)',
  'Хугацааны эцэст буцаан олгох үндсэн дүн (₮)', 'Хугацааны явцад авах хүү (₮)', 'Хугацааны эцэст олгох хүү (₮)',
  'Нийт нэрлэсэн орлого (₮)', 'Өнөөгийн худалдан авах чадвар (₮)', 'Бодит ашиг / алдагдал (₮)',
  'Бодит өгөөж, хугацааны нийт (%)', 'Бодит өгөөж, жилд шилжүүлсэн (%)',
  'Хүү олгох хэлбэр', 'Хүү олгох хэлбэрийг таамагласан', 'Тооцооны арга', 'Тэмдэглэгээ',
  'Эх сурвалж (URL)', 'Ажигласан огноо', 'Хуучирсан (>30 хоног)',
]);

/**
 * Ranked banks (in displayed order) followed by every non-ranked bank with its
 * category and reasons — all 12 banks appear exactly once.
 * `inputs` are the scenario inputs passed to evaluateDataset.
 */
export function rankingCSVRows(result, inputs) {
  const scenario = [
    result.mode === 'demo' ? 'DEMO' : 'Баталгаажсан',
    Number.isFinite(inputs.principal) ? inputs.principal : null,
    inputs.months,
    pct(inputs.inflation * 100),
    isoOrBlank(inputs.startDate),
  ];
  const ranked = result.ranked.map((e) => {
    const o = e.offer;
    return [
      ...scenario,
      e.rank, result.mode === 'demo' ? 'Эрэмбэлэгдсэн (DEMO)' : 'Эрэмбэлэгдсэн', '',
      e.bank.id, e.bank.name, e.product.name, channel(e.product.channel), verification(e.product.verification_status),
      e.sourceTerm, MATCH_TEXT[e.match.match_type] ?? e.match.match_type,
      o.eligibleDays, isoOrBlank(o.maturityDate),
      pct(o.baseAnnualPercent), pct(o.bonusPercent), pct(o.annualPercent),
      mnt(o.grossInterest), mnt(o.tax), mnt(o.totalNetInterest),
      mnt(o.principalAtMaturity), mnt(o.interimNetInterest), mnt(o.finalNetInterest),
      mnt(o.totalNominalProceeds), mnt(o.todayValue), mnt(o.realGainLoss),
      pctFraction(o.realReturn), pctFraction(o.realAnnualized),
      PAYOUT_TEXT[o.payout] ?? o.payout, o.payoutAssumed,
      o.calc_status === 'bank_convention' ? `${o.convention} (банкны)` : 'ACT/365 (жишээ тооцоо)',
      entryFlags(e),
      e.sourceUrl ?? '', observedISO(e.observedAt) ?? 'тодорхойгүй', e.flags.stale,
    ];
  });

  const nonRanked = result.nonRanked.map((n) => {
    const products = n.products ?? [];
    const sources = [...new Set(products.map((p) => p.source_url).filter(Boolean))];
    const observed = [...new Set(products.map((p) => observedISO(p.verified_at)).filter(Boolean))];
    const stale = products.length > 0 && inputs.today
      ? products.some((p) => freshness(p.verified_at, inputs.today).stale) : null;
    const row = Array(RANKING_HEADERS.length).fill(null);
    scenario.forEach((v, i) => { row[i] = v; });
    row[5] = '';
    row[6] = CATEGORY_TEXT[n.category] ?? n.category;
    row[7] = n.reasons.join('; ');
    row[8] = n.bank.id;
    row[9] = n.bank.name;
    row[10] = products.map((p) => p.name).join('; ');
    row[11] = [...new Set(products.map((p) => channel(p.channel)))].join('; ');
    row[12] = [...new Set(products.map((p) => verification(p.verification_status)))].join('; ');
    row[35] = sources.length ? sources.join(' ') : (n.bank.official_url ?? '');
    row[36] = observed.join('; ') || (products.length ? 'тодорхойгүй' : '');
    row[37] = stale;
    return row;
  });
  return [...ranked, ...nonRanked];
}

export function rankingCSV(result, inputs) {
  return toCSV(RANKING_HEADERS, rankingCSVRows(result, inputs));
}

// ---------------------------------------------------------------- 2. rate matrix

const ROW_STATE_TEXT = {
  verified: 'Баталгаажсан',
  partial: 'Хэсэгчлэн баталгаажсан',
  unverified: 'Баталгаажаагүй',
  excluded: 'Хасагдсан',
  demo: 'DEMO',
  absent: 'Мэдээлэл алга',
};
const CELL_STATE_TEXT = {
  verified: 'баталгаажсан',
  unverified: 'баталгаажаагүй',
  excluded: 'хасагдсан',
  demo: 'DEMO',
  absent: 'саналгүй',
};
const EXCLUSION_TEXT = {
  compound_interest: 'нийлмэл хүүтэй',
  restricted_customer_group: 'тусгай бүлэгт зориулсан',
  non_mnt: 'төгрөгийн бус',
  not_fixed_term: 'хугацаатай биш',
};

export function matrixHeaders(months) {
  return [
    'Өгөгдлийн горим', 'Банкны ID', 'Банк', 'Бүтээгдэхүүний ID', 'Бүтээгдэхүүн', 'Суваг',
    'Мөрийн төлөв', 'Хассан шалтгаан', 'Баталгаажуулалтын төлөв',
    ...months.flatMap((m) => [`${m} сар хүү (%)`, `${m} сар төлөв`]),
    'Бусад зарласан хугацаа (анхны нэгжээр)', 'Дүнгийн нэмэгдэл', 'Тэмдэглэл',
    'Эх сурвалж (URL)', 'Шалгасан огноо', 'Хуучирсан (>30 хоног)',
  ];
}

/** Value + status text for one matrix cell (published base rate, no bonus). */
export function matrixCellFields(c) {
  if (c.state === 'absent') return [null, CELL_STATE_TEXT.absent];
  const value = c.minPercent === c.maxPercent
    ? pct(c.minPercent)
    : `${formatPercent(c.minPercent).replace('%', '')}–${formatPercent(c.maxPercent).replace('%', '')}`;
  const status = [
    CELL_STATE_TEXT[c.state] ?? c.state,
    c.matchType === 'mapped' && `≈ тааруулсан: банк «${c.sourceTerm}» (D1: ${c.months} сар = ${c.mappedDays ?? TERM_DAY_MAP[c.months]} өдөр)`,
    c.matchType === 'month_range' && `сарын интервал «${c.sourceTerm}»`,
    c.matchType === 'exact' && `зарласан: ${c.sourceTerm}`,
    c.amountTiers && 'дүнгийн шатлалаар ялгаатай',
    c.note,
  ].filter(Boolean).join('; ');
  return [value, status];
}

export function matrixCSVRows(matrix, today) {
  return matrix.rows.map((r) => {
    const reason = r.exclusionReason ? EXCLUSION_TEXT[r.exclusionReason] ?? r.exclusionReason : '';
    const other = r.otherTerms
      .map((t) => `${t.label}: ${formatPercent(t.percent)}${t.state !== 'verified' ? ` (${CELL_STATE_TEXT[t.state] ?? t.state})` : ''}`)
      .join('; ');
    const bonus = r.bonusTiers
      ? r.bonusTiers.map((t) => `+${formatPercent(t.bonus_percent)} (${t.min_amount_mnt ?? 0}–${t.max_amount_mnt ?? '∞'} ₮)`).join('; ')
      : '';
    return [
      matrix.mode === 'demo' ? 'DEMO' : 'Баталгаажсан',
      r.bank.id, r.bank.name, r.product?.id ?? '', r.product?.name ?? 'Бүтээгдэхүүн оруулаагүй',
      r.product ? channel(r.product.channel) : '',
      ROW_STATE_TEXT[r.state] ?? r.state, reason, r.product ? verification(r.product.verification_status) : '',
      ...r.cells.flatMap(matrixCellFields),
      other, bonus, r.note ?? '',
      r.sourceUrl ?? r.bank.official_url ?? '',
      r.observedAt ? observedISO(r.observedAt) ?? 'тодорхойгүй' : '',
      r.product && today ? freshness(r.observedAt, today).stale : null,
    ];
  });
}

export function matrixCSV(matrix, today) {
  return toCSV(matrixHeaders(matrix.months), matrixCSVRows(matrix, today));
}

// ---------------------------------------------------------------- file names & download

export function csvFileName(kind, { mode, months, today }) {
  const prefix = mode === 'demo' ? 'DEMO_' : '';
  const date = today ? toISO(today) : 'undated';
  return kind === 'ranking'
    ? `${prefix}deposit-ranking_${months}m_${date}.csv`
    : `${prefix}deposit-rate-matrix_1-24m_${date}.csv`;
}

/** UTF-8 Blob of the CSV text (the BOM is part of `text`, so bytes start EF BB BF). */
export const csvBlob = (text) => new Blob([text], { type: 'text/csv;charset=utf-8' });

/** Triggers a browser download of `text` (already BOM-prefixed). */
export function downloadCSV(fileName, text) {
  const blob = csvBlob(text);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return blob;
}
