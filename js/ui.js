// DOM rendering. All dynamic text goes through textContent (never innerHTML).

import { TERM_DAY_MAP, TAX_RATE, FRESHNESS_DAYS } from './config.js';
import { formatDateMN, parseObservedDate } from './dates.js';
import { formatMNT, formatPercent, formatPercentFromFraction } from './format.js';
import { CATEGORY } from './ranking.js';
import { bankLogo } from './banklogos.js';

/** Logo + bank name on one aligned row (name stays the text label). */
const bankName = (bank, size, nameNode) => el(size >= 40 ? 'div' : 'span', { class: `bank-name bank-name--${size}` },
  bankLogo(bank, { size, eager: size >= 40 }), nameNode);

// ---------------------------------------------------------------- helpers

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

// Decorative stroke icons (aria-hidden); text labels always accompany them.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICON_PATHS = {
  coins: ['M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z', 'M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6', 'M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'],
  percent: ['M19 5 5 19', 'M6.5 4a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z', 'M17.5 15a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z'],
  receipt: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h5'],
  trend: ['M3 3v18h18', 'M7 15l4-4 3 3 6-7'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0z', 'M17 5h3v2a3 3 0 0 1-3 3', 'M7 5H4v2a3 3 0 0 0 3 3'],
  calendar: ['M4 5h16v16H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  bank: ['M3 10 12 4l9 6', 'M5 10v8', 'M9.5 10v8', 'M14.5 10v8', 'M19 10v8', 'M3 21h18', 'M4 18h16'],
  info: ['M12 2.5a9.5 9.5 0 1 0 0 19 9.5 9.5 0 0 0 0-19z', 'M12 11v6', 'M12 7.5h.01'],
};

export function icon(name, cls = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', cls);
  for (const d of ICON_PATHS[name] ?? []) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/** Only http(s) links are rendered as anchors. */
function safeLink(url, label) {
  try {
    const u = new URL(url);
    if (u.protocol === 'https:' || u.protocol === 'http:') {
      return el('a', { href: u.href, target: '_blank', rel: 'noopener noreferrer' }, label);
    }
  } catch { /* fall through */ }
  return el('span', {}, label);
}

/** «CSV татах» action placed at the end of a section heading (Phase 4A). */
const exportButton = (label, onExport) => onExport && el('button', {
  type: 'button', class: 'btn btn--ghost section__action', 'aria-label': label, onclick: onExport,
}, 'CSV татах');

/** D18: the chosen chip has no column in the Sheets table (1, 9, 18 сар) — never filled from old rates. */
const researchGap = (state) => {
  const r = state.dataset?.dataset_status === 'research' ? state.dataset.research : null;
  return Boolean(r && !r.terms.includes(state.months));
};

const badge = (text, variant = 'warn', title) => el('span', { class: `badge badge--${variant}`, title }, text);

const signClass = (v) => (v > 0 ? 'is-positive' : v < 0 ? 'is-negative' : '');
const signArrow = (v) => (v > 0 ? '▲ ' : v < 0 ? '▼ ' : '');

const CHANNEL_TEXT = { online: 'Онлайн', branch: 'Салбар', any: 'Онлайн ба салбар', unknown: 'Суваг тодорхойгүй' };
const channelText = (c) => CHANNEL_TEXT[c] ?? c ?? CHANNEL_TEXT.unknown;

// P2-C: show rate components when an automatic amount bonus applies.
const rateComponents = (o) => (o.bonusPercent > 0
  ? `${formatPercent(o.baseAnnualPercent)} + ${formatPercent(o.bonusPercent)} · `
  : '');

function observedText(observedAt) {
  const d = parseObservedDate(observedAt);
  return d ? formatDateMN(d) : 'тодорхойгүй';
}

export function entryBadges(entry) {
  const f = entry.flags;
  return [
    f.demo && badge('DEMO', 'demo'),
    f.research && (entry.evidence?.researcher === 'VERIFIED'
      ? badge('Судлаач нягталсан', 'teal', entry.evidence.researcherNote ?? 'Судлаач банкны албан ёсны эх сурвалжаас нягталсан (D19)')
      : badge('Дахин нягтлах шаардлагатай', 'warn', entry.evidence?.researcherNote ?? 'Судлаачийн нягталтын бүртгэл алга (D19)')),
    entry.evidence && entry.evidence.result !== 'PASS' && badge(`Автомат нотолгоо: ${entry.evidence.result}`, 'warn', `Файл-нотолгооны автомат шалгалт (rates_raw.csv-тэй тулгасан), судлаачийн нягталтаас тусдаа: ${entry.evidence.note ?? ''}`),
    f.mapped && badge('≈ тааруулсан', 'warn', `${entry.sourceTerm} → ${entry.match.months} сар`),
    f.monthRange && badge('Сарын интервал', 'warn', `${entry.sourceTerm} → ${entry.match.months} сар`),
    f.amountBonus && badge(`+${entry.offer.bonusPercent}% дүнгийн нэмэгдэл`, 'warn', 'Банкны зарласан дүнгийн шатлалын нэмэлт хүү'),
    f.illustrative && badge('Жишээ тооцоо (ACT/365)', 'warn', 'Банкны хүү тооцох арга тодорхойгүй'),
    f.payoutAssumed && badge('Хүү олгох хэлбэр тодорхойгүй', 'warn', 'Хугацааны эцэст олгоно гэж жишээ байдлаар тооцсон'),
    f.stale && badge('Шинэчлэх шаардлагатай', 'warn', f.observedUnknown ? 'Ажигласан огноо тодорхойгүй' : `${FRESHNESS_DAYS} хоногоос хуучин`),
  ].filter(Boolean);
}

// ---------------------------------------------------------------- header & banner

const STATUS_TEXT = { verified: 'Баталгаажсан', demo: 'DEMO', needs_verification: 'Баталгаажуулалт шаардлагатай', research: 'Судлаач нягталсан' };
const SOURCE_TEXT = { live: 'Google Sheets (live)', fallback: 'Локал нөөц CSV (fallback)' };

/**
 * Header pill: data update date and verification status, both read from the
 * dataset (never hard-coded). Status counts banks with at least one verified
 * product. Inflation is not shown in the header.
 */
export function renderHeader(container, dataset) {
  const snapshot = parseObservedDate(dataset.snapshot_at);
  const isDemo = dataset.dataset_status === 'demo';
  if (dataset.dataset_status === 'research') {
    // D18/D19: the researcher's manual check is the status; any value changed since the verified
    // snapshot is flagged for re-checking. The source (live / fallback) is always named.
    const src = SOURCE_TEXT[dataset.research?.source] ?? 'тодорхойгүй';
    const rs = dataset.research?.researcher;
    const allChecked = Boolean(rs) && rs.VERIFIED > 0 && rs.RECHECK === 0;
    const items = [
      ['Мэдээлэл шалгасан:', snapshot ? formatDateMN(snapshot) : 'тодорхойгүй', 'header-pill__main'],
      ['Төлөв:', allChecked ? `Судлаач нягталсан · ${src}` : `Судлаач нягталсан, ${rs?.RECHECK ?? '?'} утга дахин нягтлах · ${src}`,
        allChecked ? 'is-ok' : 'is-warn'],
    ];
    const range = rs?.from ? `${rs.from}${rs.to && rs.to !== rs.from ? `…${rs.to}` : ''}` : 'тодорхойгүй';
    container.closest('.header-pill')?.setAttribute('title',
      `Судлаач банкны албан ёсны эх сурвалжаас гараар нягталсан: ${range} · ${rs?.VERIFIED ?? 0} утга нягталсан, ${rs?.RECHECK ?? 0} дахин нягтлах · Эх үүсвэр: ${src}`);
    container.replaceChildren(
      ...items.map(([k, v, cls]) => el('div', { class: `header-pill__item ${cls}`.trim() }, el('dt', { text: k }), el('dd', { text: v }))));
    return;
  }
  const verifiedBanks = new Set((dataset.products ?? [])
    .filter((p) => p.verification_status === 'verified')
    .map((p) => p.bank_id));
  const status = STATUS_TEXT[dataset.dataset_status] ?? dataset.dataset_status ?? 'тодорхойгүй';
  const items = [
    ['Мэдээлэл шинэчлэгдсэн:', snapshot ? formatDateMN(snapshot) : 'тодорхойгүй', 'header-pill__main'],
    ['Төлөв:', isDemo ? 'DEMO' : `${status} · ${verifiedBanks.size}/${dataset.banks.length} банк`, isDemo ? 'is-warn' : 'is-ok'],
  ];
  container.closest('.header-pill')?.setAttribute('title',
    `Банкны хүүгийн мэдээлэл: ${items[0][1]} · ${isDemo ? 'DEMO өгөгдөл' : `Баталгаажсан бүтээгдэхүүнтэй банк: ${verifiedBanks.size}/${dataset.banks.length}`}`);
  container.replaceChildren(
    ...items.map(([k, v, cls]) => el('div', { class: `header-pill__item ${cls}`.trim() }, el('dt', { text: k }), el('dd', { text: v }))));
}

export function renderDemoBanner(container, dataset) {
  if (dataset.dataset_status === 'research') {
    // D18/D19: permanent information banner (teal). Live vs fallback and values to re-check stay visible.
    const r = dataset.research ?? {};
    const rs = r.researcher;
    container.hidden = false;
    container.classList.add('demo-banner--info');
    container.replaceChildren(
      badge('НЯГТАЛСАН', 'teal'),
      el('div', {},
        el('strong', { text: 'Судлаачийн нягталсан мэдээлэл. ' }),
        'Банкуудын албан ёсны эх сурвалжаас нягталсан хадгаламжийн хүүгийн мэдээлэл. ',
        r.source === 'live'
          ? 'Эх үүсвэр: Google Sheets.'
          : el('strong', { class: 'banner-fallback', text: `Эх үүсвэр: локал нөөц файл ${r.url ?? ''} (fallback) — Google Sheets-ээс татаж чадсангүй${r.error ? ` (${r.error})` : ''}.` }),
        rs && rs.RECHECK > 0 && el('strong', { class: 'banner-recheck',
          text: ` ${rs.RECHECK} утга нягталсан snapshot-оос өөрчлөгдсөн эсвэл нягталтын бүртгэлгүй — дахин нягтлах шаардлагатай (${rs.recheck.join(', ')}).` })),
    );
    return;
  }
  container.classList.remove('demo-banner--info');
  if (dataset.dataset_status !== 'demo') { container.hidden = true; return; }
  container.hidden = false;
  container.replaceChildren(
    badge('DEMO', 'demo'),
    el('div', {},
      el('strong', { text: 'DEMO өгөгдөл. ' }),
      'Энэ самбарт харагдаж буй хүү, эрэмбэ баталгаажаагүй бөгөөд санхүүгийн шийдвэр гаргахад зориулагдаагүй. ',
      dataset.dataset_note ?? ''),
  );
}

// ---------------------------------------------------------------- featured panel

function flowRow(label, value, { sub, total = false } = {}) {
  return el('div', { class: `flow__row${total ? ' flow__row--total' : ''}` },
    el('dt', {}, label, sub && el('span', { class: 'flow__sub', text: sub })),
    el('dd', { text: value }));
}

/** Short visible labels of the assumptions behind the selected offer (never colour-only). */
function assumptionLabels(entry) {
  const f = entry.flags;
  return [
    f.demo && 'DEMO',
    f.research && (entry.evidence?.researcher === 'VERIFIED' ? 'Судлаач нягталсан' : 'Дахин нягтлах шаардлагатай'),
    f.mapped && '≈ тааруулсан',
    f.monthRange && 'Сарын интервал',
    f.amountBonus && `+${formatPercent(entry.offer.bonusPercent)} дүнгийн нэмэгдэл`,
    f.illustrative && 'Жишээ тооцоо (ACT/365)',
    f.payoutAssumed && 'Хүү олгох хэлбэр тодорхойгүй',
    f.stale && 'Шинэчлэх шаардлагатай',
  ].filter(Boolean);
}

/**
 * Hero card of the selected bank. Main view: identity, principal / gross / tax
 * / net, annual rate, net return after tax and the final amount. Inflation
 * results appear only when the user enabled inflation (`state.inflationEnabled`).
 * Cash flows (D6), assumptions, dates and the official source are kept in the
 * collapsed «Нөхцөл ба эх сурвалж» section.
 */
export function renderFeatured(container, entry, state) {
  if (!entry) {
    container.replaceChildren(
      el('h2', { id: 'featured-title', class: 'panel__title', text: 'Сонгосон банк' }),
      el('div', { class: 'empty-state' },
        el('strong', { text: !state.principalValid ? 'Хадгаламжийн дүнгээ оруулна уу'
          : researchGap(state) ? 'Энэ хугацаанд Sheets-д хүү бүртгэгдээгүй' : 'Эрэмбэлэх санал алга' }),
        state.principalValid
          ? researchGap(state)
            ? `Google Sheets-ийн судалгааны хүснэгтэд ${state.months} сарын хүү байхгүй (зөвхөн ${state.dataset.research.terms.join(', ')} сар). Хуучин хүүгээр нөхөхгүй.`
            : 'Сонгосон хугацаа, дүнгийн нөхцөлд тохирох санал олдсонгүй. Доорх «Эрэмбэд ороогүй банкууд» хэсгээс шалтгааныг харна уу.'
          : 'Дүн 0 эсвэл буруу үед өгөөж тооцох боломжгүй.'),
    );
    return;
  }

  const o = entry.offer;
  const isTop = entry.rank === 1;
  const monthly = o.payout === 'monthly';
  const interimCount = o.payments.filter((p) => p.date < o.maturityDate).length;
  const periodic = interimCount > 0;
  const showInflation = Boolean(state.inflationEnabled);

  const notes = [];
  if (entry.flags.demo) notes.push('DEMO өгөгдөл — хүүг албан хуудаснаас дахин шалгаагүй.');
  if (entry.flags.research) {
    notes.push(entry.evidence?.researcher === 'VERIFIED'
      ? `Судлаачийн нягталсан мэдээлэл (D18, D19): хүүг Google Sheets-ийн clean хуудаснаас авсан; ${entry.evidence.researcherNote}.`
      : `Дахин нягтлах шаардлагатай (D19): ${entry.evidence?.researcherNote ?? 'судлаачийн нягталтын бүртгэл алга'}.`);
    if (entry.evidence) notes.push(`Автомат файл-нотолгоо (${entry.match.months} сар, судлаачийн нягталтаас тусдаа): ${entry.evidence.result} — ${entry.evidence.note}`);
    notes.push(entry.product.conditions_from
      ? 'Бүтээгдэхүүний нөхцөл (доод дүн, хүү олгох хэлбэр) нь ижил эх сурвалжийн холбоостой deposits.json бүтээгдэхүүнээс авсан.'
      : 'Sheets-ийн эх сурвалж deposits.json-ийн бүтээгдэхүүнтэй таарахгүй тул нөхцөлийг тодорхойгүй гэж үзсэн (доод дүн, хүү олгох хэлбэр).');
    if (entry.product.sheets_note) notes.push(`Судлаачийн тэмдэглэл: ${entry.product.sheets_note}`);
  }
  if (entry.flags.mapped) notes.push(`Банк «${entry.sourceTerm}» гэж зарласан; тогтсон хүснэгтээр ${entry.match.months} сар (${TERM_DAY_MAP[entry.match.months]} өдөр) гэж тааруулсан (≈ тааруулсан).`);
  if (entry.flags.monthRange) notes.push(`Банк «${entry.sourceTerm}» хугацааны интервалд нэг хүү зарласан; ${entry.match.months} сар энэ интервалд багтана.`);
  if (entry.flags.amountBonus) notes.push(`Үндсэн хүү ${formatPercent(o.baseAnnualPercent)} + дүнгийн шатлалын нэмэгдэл ${formatPercent(o.bonusPercent)} (банкны хуудсанд зарласнаар). Харилцагчийн түвшин, тохиролцоот нэмэгдлийг тооцоогүй.`);
  if (entry.flags.illustrative) notes.push('Жишээ тооцоо (ACT/365): банкны хүү тооцох арга тодорхойгүй тул ACT/365-аар тооцсон. Банкны бодит төлбөрөөс зөрж болно.');
  if (entry.product.min_principal_mnt == null && !entry.flags.demo && !entry.flags.research) notes.push('Банк доод үлдэгдлийг хуудсандаа заагаагүй — дүнгийн нөхцөлийг банкнаас тодруулна уу.');
  if (o.payoutAssumed) notes.push('Хүү олгох хэлбэр тодорхойгүй — хүүг хугацааны эцэст нэг удаа олгоно гэж тооцсон.');
  if (monthly) notes.push('Сар бүр олгосон хүүг дахин хадгаламжид оруулахгүй, нийлмэл болгохгүй гэж тооцсон.');
  if (o.scheduleIllustrative) notes.push('Сар бүрийн төлбөрийн огноог жишээ байдлаар тооцсон.');
  if (entry.flags.stale) notes.push(entry.flags.observedUnknown ? 'Мэдээллийг ажигласан огноо тодорхойгүй — шинэчлэх шаардлагатай.' : `Мэдээлэл ${FRESHNESS_DAYS} хоногоос хуучин — шинэчлэх шаардлагатай.`);
  if (showInflation && o.inflation < 0) notes.push('Дефляцийн сценари: үнийн түвшин буурна гэж үзсэн.');
  if (entry.tieHidden) notes.push('Цэвэр өгөөж нь өөр банктай бүхэлчлэлийн түвшинд тэнцүү харагдаж байна.');

  const termText = entry.match.term_basis === 'days'
    ? `${entry.match.months} сар (${entry.match.termDays} өдөр)`
    : `${entry.match.months} сар`;

  const featRow = (iconName, label, value, cls = '') => el('div', { class: 'feat-row' },
    el('dt', {}, icon(iconName, 'feat-row__icon'), el('span', { text: label })),
    el('dd', { class: cls, text: value }));
  const kpi = (label, value, note, cls = '') => el('div', { class: 'kpi' },
    el('span', { class: 'kpi__label', text: label }),
    el('span', { class: `kpi__value ${cls}`.trim(), text: value }),
    note && el('span', { class: 'kpi__note', text: note }));
  const labels = assumptionLabels(entry);

  const inflationBlock = showInflation && el('div', { class: 'feat-infl', role: 'group', 'aria-label': 'Инфляцид тохируулсан үзүүлэлт' },
    el('div', { class: 'feat-infl__item' },
      el('span', { class: 'feat-infl__label', text: 'Жилийн инфляц' }),
      el('span', { class: 'feat-infl__value', text: formatPercent(o.inflation * 100) })),
    el('div', { class: 'feat-infl__item' },
      el('span', { class: 'feat-infl__label', text: 'Өнөөгийн худалдан авах чадвар' }),
      el('span', { class: 'feat-infl__value', text: formatMNT(o.todayValue) })),
    el('div', { class: 'feat-infl__item' },
      el('span', { class: 'feat-infl__label', text: 'Бодит ашиг / алдагдал' }),
      el('span', { class: `feat-infl__value ${signClass(o.realGainLoss)}`.trim(), text: signArrow(o.realGainLoss) + formatMNT(o.realGainLoss, { signed: true }) })),
    el('div', { class: 'feat-infl__item' },
      el('span', { class: 'feat-infl__label', text: 'Бодит өгөөж' }),
      el('span', { class: `feat-infl__value ${signClass(o.realReturn)}`.trim(), text: signArrow(o.realReturn) + formatPercentFromFraction(o.realReturn, { signed: true }) })));

  container.replaceChildren(
    el('div', { class: `feat-hero${showInflation ? ' feat-hero--infl' : ''}` },
      el('div', { class: 'feat-main' },
        isTop
          ? el('p', { class: 'feat-ribbon' }, icon('trophy', 'feat-ribbon__icon'), '№1 Хамгийн ашигтай банк')
          : el('p', { class: 'feat-ribbon feat-ribbon--selected' }, `Сонгосон банк · эрэмбэ №${entry.rank}`),
        bankName(entry.bank, 40, el('div', { class: 'feat-name' },
          el('h2', { id: 'featured-title', class: 'featured__bank', text: entry.bank.name }),
          el('p', { class: 'featured__product', text: `${entry.product.name} · ${channelText(entry.product.channel)} · ${termText}` }))),
        el('dl', { class: 'feat-list' },
          featRow('coins', 'Үндсэн мөнгө', formatMNT(o.principal)),
          featRow('percent', 'Хүүгийн нийт орлого', formatMNT(o.grossInterest)),
          featRow('receipt', `Суутгах татвар (${Math.round(TAX_RATE * 100)}%)`, formatMNT(-o.tax), 'is-negative'),
          featRow('trend', 'Цэвэр хүүгийн орлого', formatMNT(o.totalNetInterest, { signed: true }), 'is-positive')),
        labels.length > 0 && el('p', { class: 'feat-assume', title: notes.join(' ') },
          el('span', { class: 'feat-assume__icon', 'aria-hidden': 'true', text: '!' }),
          el('span', { text: labels.join(' · ') }),
          el('span', { class: 'sr-only', text: ' — дэлгэрэнгүйг «Нөхцөл ба эх сурвалж» хэсгээс харна уу.' }))),
      el('div', { class: 'feat-side' },
        el('div', { class: 'kpis' },
          kpi('Жилийн хүү', formatPercent(o.annualPercent), `Нэрлэсэн · ${rateComponents(o)}${entry.sourceTerm}`),
          kpi('Татварын дараах цэвэр өгөөж', entry.displayNetReturn,
            `Хугацааны нийт · ${entry.match.months} сар`, 'is-positive')),
        el('div', { class: 'feat-total' },
          el('p', { class: 'feat-total__label', text: periodic ? 'Хугацааны турш авах нийт мөнгө' : 'Хугацааны эцэст авах нийт мөнгө' }),
          el('p', { class: 'feat-total__value', text: formatMNT(o.totalNominalProceeds) }),
          el('p', {
            class: 'feat-total__sub',
            text: periodic
              ? `Хүүг ${interimCount + 1} удаа олгоно, үндсэн мөнгийг хугацааны эцэст`
              : 'Үндсэн мөнгө + цэвэр хүүгийн орлого',
          })),
        inflationBlock)),

    el('details', {
      class: 'feat-more', open: featDetailsOpen || null,
      ontoggle: (e) => { featDetailsOpen = e.currentTarget.open; },
    },
    el('summary', {},
      el('span', { class: 'feat-more__title', text: 'Нөхцөл ба эх сурвалж' }),
      el('span', { class: 'featured__dates' },
        icon('calendar', 'featured__dates-icon'),
        el('span', {},
          formatDateMN(o.startDate), ' → ', formatDateMN(o.maturityDate), ` · ${o.eligibleDays} хоног`))),
    el('div', { class: 'feat-more__body' },
      el('div', { class: 'feat-details' },
        el('div', {},
          el('h3', { class: 'block-title', text: 'Мөнгөн урсгал' }),
          el('dl', { class: 'flow' },
            flowRow('Хугацааны эцэст буцаан олгох үндсэн дүн', formatMNT(o.principalAtMaturity)),
            flowRow('Хугацааны явцад авах хүү', formatMNT(o.interimNetInterest), {
              sub: monthly ? `${interimCount} удаа, сар бүр (татварын дараа)` : 'Хүүг хугацааны эцэст олгоно',
            }),
            flowRow('Хугацааны эцэст олгох хүү', formatMNT(o.finalNetInterest)),
            flowRow('Нийт цэвэр хүү', formatMNT(o.totalNetInterest)),
            flowRow('Нийт нэрлэсэн орлого', formatMNT(o.totalNominalProceeds), {
              total: true, sub: 'Үндсэн дүн + нийт цэвэр хүү, дахин хөрөнгө оруулалтгүй',
            }))),
        el('div', {},
          el('h3', { class: 'block-title', text: 'Бүтээгдэхүүн ба тооцоо' }),
          el('dl', { class: 'flow' },
            flowRow('Бүтээгдэхүүн', entry.product.name),
            flowRow('Суваг', channelText(entry.product.channel)),
            flowRow('Банкны зарласан хугацаа', entry.sourceTerm, { sub: entry.flags.mapped ? `≈ тааруулсан → ${entry.match.months} сар` : null }),
            flowRow('Хүү олгох хэлбэр', monthly ? 'Сар бүр' : 'Хугацааны эцэст', { sub: o.payoutAssumed ? 'Тодорхойгүй — жишээ таамаглал' : null }),
            flowRow('Тооцооны арга', o.calc_status === 'bank_convention' ? `${o.convention} (банкны)` : 'Жишээ тооцоо (ACT/365)'),
            flowRow('Эхлэх → дуусах', `${formatDateMN(o.startDate)} → ${formatDateMN(o.maturityDate)}`, { sub: `${o.eligibleDays} хоног` }),
            showInflation && flowRow('Бодит өгөөж (жилд шилжүүлсэн)', formatPercentFromFraction(o.realAnnualized, { signed: true }))))),

      labels.length > 0 && el('div', { class: 'badges' }, entryBadges(entry)),
      notes.length > 0 && el('ul', { class: 'notes' }, notes.map((n) => el('li', { text: n }))),

      el('p', { class: 'source-line' },
        el('span', {}, 'Эх сурвалж: ', entry.sourceUrl ? safeLink(entry.sourceUrl, 'Банкны албан хуудас') : 'байхгүй'),
        el('span', { text: `Ажигласан огноо: ${observedText(entry.observedAt)}` })))),
  );
}

/** Open/closed state of «Нөхцөл ба эх сурвалж», kept across re-renders (collapsed by default). */
let featDetailsOpen = false;

// ---------------------------------------------------------------- ranking

/** `slots.head` receives the heading, `slots.body` the table. */
export function renderRanking(slots, result, state, onSelect, { onExport } = {}) {
  const isDemo = result.mode === 'demo';
  slots.head.replaceChildren(el('div', { class: 'section__head' },
    el('h2', { id: 'ranking-title', class: 'title-with-icon' }, icon('bank', 'title-icon'),
      el('span', { text: `Бүх банкны цэвэр өгөөжийн эрэмбэ (${result.ranked.length} банк)` })),
    isDemo && badge('DEMO', 'demo'),
    result.mode === 'research' && badge('Судлаач нягталсан', 'teal', 'Судлаачийн нягталсан мэдээлэл (D18, D19)'),
    el('span', { class: 'section__sub', text: `Татварын дараах цэвэр өгөөжөөр буурахаар · ${state.months} сар · ${formatMNT(state.principal)}` }),
    exportButton('CSV татах — банкуудын эрэмбэ, одоогийн сценари', onExport)));
  const container = slots.body;

  if (result.ranked.length === 0) {
    container.replaceChildren(el('div', { class: 'empty-state' },
      el('strong', { text: researchGap(state) ? 'Энэ хугацаанд Sheets-д хүү бүртгэгдээгүй' : 'Эрэмбэлэх санал алга' }),
      'Хуурамч ялагч гаргахгүйн тулд эрэмбийг хоосон үлдээв. Доорх «Эрэмбэд ороогүй банкууд» хэсгээс шалтгааныг харна уу.'));
    return;
  }

  const usedMarks = new Set();
  const rows = result.ranked.map((entry) => {
    const o = entry.offer;
    const selected = entry.bank.id === state.selectedBankId;
    const marks = rowMarks(entry);
    marks.forEach((m) => usedMarks.add(m.key));
    const product = `${entry.product.name} · ${channelText(entry.product.channel)}`;
    const rateTitle = `${rateComponents(o)}${entry.sourceTerm}`.replace(/ · $/, '');
    const markText = marks.map((m) => m.full).join('; ');
    // The bank name is the select control (keyboard path); a click anywhere on the row also selects.
    const selectBtn = el('button', {
      type: 'button', class: 'bank-select', 'aria-pressed': selected ? 'true' : 'false',
      title: selected ? 'Сонгосон банк' : 'Дарж дэлгэрэнгүйг харах',
      onclick: (e) => { e.stopPropagation(); onSelect(entry.bank.id); },
    }, bankName(entry.bank, 24, el('strong', { text: entry.bank.name })),
    el('span', { class: 'sr-only', text: selected ? ' (сонгосон)' : ' — сонгох' }));
    const rankCls = entry.rank <= 3 ? ` rank-row--${entry.rank}` : '';
    return el('tr', { class: `rank-row${rankCls}${selected ? ' is-selected' : ''}`, onclick: () => onSelect(entry.bank.id) },
      el('td', { class: 'rank-cell', text: String(entry.rank) }),
      el('td', { class: 'bank-cell', title: markText ? `${product} · ${markText}` : product },
        el('span', { class: 'bank-line' },
          selectBtn,
          marks.length > 0 && el('span', { class: 'marks' }, marks.map((m) => el('span', { class: `mark mark--${m.key}`, title: m.full },
            el('span', { 'aria-hidden': 'true', text: m.short }),
            el('span', { class: 'sr-only', text: ` ${m.full}` }))))),
        el('span', { class: 'sr-only', text: ` ${product}` })),
      el('td', { class: 'num', title: `Жилийн нэрлэсэн хүү ${formatPercent(o.annualPercent)} · ${rateTitle}` },
        formatPercent(o.annualPercent),
        el('span', { class: 'sr-only', text: ` (${rateTitle})` })),
      el('td', { class: 'num', text: formatMNT(o.grossInterest) }),
      el('td', { class: 'num is-negative', text: formatMNT(-o.tax) }),
      el('td', { class: 'num is-positive', text: formatMNT(o.totalNetInterest) }),
      el('td', { class: 'num num--strong', text: formatMNT(o.totalNominalProceeds) }),
      el('td', { class: 'num is-positive num--strong' },
        entry.displayNetReturn,
        entry.tieHidden && el('span', { class: 'sr-only', text: ' (бүхэлчилсэн түвшинд тэнцүү)' }),
        entry.tieHidden && el('span', { class: 'tie-mark', title: 'Бүхэлчилсэн түвшинд өөр банктай тэнцүү', 'aria-hidden': 'true', text: '=' })));
  });

  const taxHead = `Суутгах татвар (${Math.round(TAX_RATE * 100)}%)`;
  const legend = MARKS.filter((m) => usedMarks.has(m.key));
  container.replaceChildren(
    el('div', { class: 'table-wrap table-wrap--ranking' },
      el('table', { class: 'rank-table' },
        el('caption', { class: 'sr-only', text: 'Бүх банкны татварын дараах цэвэр өгөөжийн эрэмбэ' }),
        el('colgroup', {}, ['c-rank', 'c-bank', 'c-rate', 'c-money', 'c-money', 'c-money', 'c-money', 'c-real'].map((c) => el('col', { class: c }))),
        el('thead', {}, el('tr', {},
          ['№', 'Банкны нэр', 'Жилийн хүү', 'Хүүгийн нийт орлого', taxHead, 'Цэвэр хүүгийн орлого', 'Эцэст авах мөнгө', 'Цэвэр өгөөж']
            .map((h, i) => el('th', {
              scope: 'col',
              class: i >= 2 ? 'num' : '',
              title: i === 6 ? 'Үндсэн мөнгө + цэвэр хүүгийн орлого (дахин хөрөнгө оруулалтгүй)'
                : i === 7 ? 'Цэвэр хүүгийн орлого ÷ үндсэн мөнгө, хугацааны нийт (10% татварын дараа)' : null,
              text: h,
            })))),
        el('tbody', {}, rows))),
    legend.length > 0 && el('ul', { class: 'mark-legend', 'aria-label': 'Тэмдэглэгээний тайлбар' },
      legend.map((m) => el('li', {}, el('span', { class: `mark mark--${m.key}`, 'aria-hidden': 'true', text: m.short }), m.legend))),
  );
}

// Compact ranking-table markers. Short text is never colour-only; the full approved wording
// («≈ тааруулсан», «Жишээ тооцоо (ACT/365)», …) is in the tooltip, screen-reader text and legend.
const MARKS = [
  { key: 'demo', short: 'DEMO', legend: 'DEMO өгөгдөл — баталгаажаагүй' },
  { key: 'recheck', short: 'ДН', legend: 'Дахин нягтлах шаардлагатай — хүү судлаачийн нягталсан snapshot-оос өөрчлөгдсөн' },
  { key: 'evidence', short: 'ЭХ?', legend: 'Автомат файл-нотолгоо дутуу — PARTIAL эсвэл NOT VERIFIED (source_check.csv; судлаачийн нягталтаас тусдаа)' },
  { key: 'mapped', short: '≈', legend: '≈ тааруулсан — өдрөөр зарласан хугацааг D1 хүснэгтээр сартай тааруулсан' },
  { key: 'range', short: 'И', legend: 'Сарын интервал — банк хугацааны интервалд нэг хүү зарласан' },
  { key: 'bonus', short: '+%', legend: 'Дүнгийн шатлалын нэмэгдэл хүү орсон' },
  { key: 'act', short: 'ACT', legend: 'Жишээ тооцоо (ACT/365) — банкны хүү тооцох арга тодорхойгүй' },
  { key: 'payout', short: 'Ө', legend: 'Хүү олгох хэлбэр тодорхойгүй — хугацааны эцэст олгоно гэж тооцсон' },
  { key: 'stale', short: '!', legend: 'Шинэчлэх шаардлагатай — мэдээлэл хуучирсан' },
];

function rowMarks(entry) {
  const f = entry.flags;
  const get = (key) => MARKS.find((m) => m.key === key);
  const with_ = (key, full) => ({ ...get(key), full: full ?? get(key).legend });
  return [
    f.demo && with_('demo'),
    f.research && entry.evidence?.researcher !== 'VERIFIED' && with_('recheck', `Дахин нягтлах шаардлагатай: ${entry.evidence?.researcherNote ?? ''}`),
    entry.evidence && entry.evidence.result !== 'PASS' && with_('evidence', `Автомат файл-нотолгоо: ${entry.evidence.result}`),
    f.mapped && with_('mapped', `≈ тааруулсан: ${entry.sourceTerm} → ${entry.match.months} сар`),
    f.monthRange && with_('range', `Сарын интервал: ${entry.sourceTerm} → ${entry.match.months} сар`),
    f.amountBonus && with_('bonus', `Үндсэн ${formatPercent(entry.offer.baseAnnualPercent)} + дүнгийн нэмэгдэл ${formatPercent(entry.offer.bonusPercent)}`),
    f.illustrative && with_('act', 'Жишээ тооцоо (ACT/365)'),
    f.payoutAssumed && with_('payout', 'Хүү олгох хэлбэр тодорхойгүй'),
    f.stale && with_('stale', 'Шинэчлэх шаардлагатай'),
  ].filter(Boolean);
}

// ---------------------------------------------------------------- non-ranked

// P2-D (approved): eligibility failure / missing verification / unavailable term.
const GROUPS = [
  [CATEGORY.CONDITIONS, 'Шаардлага хангахгүй'],
  [CATEGORY.MISSING, 'Баталгаажаагүй / мэдээлэл дутуу'],
  [CATEGORY.NO_PRODUCT, 'Энэ хугацаанд санал зарлаагүй'],
];

export function renderNonRanked(container, result) {
  const head = el('div', { class: 'section__head' },
    el('h2', { id: 'nonranked-title', class: 'sr-only', text: 'Эрэмбэд ороогүй банкууд' }),
    el('span', { class: 'section__sub', text: `${result.nonRanked.length} банк · шалтгаантай` }));
  const groups = GROUPS.map(([cat, title]) => {
    const items = result.nonRanked.filter((n) => n.category === cat);
    return el('section', { class: 'group', 'aria-label': title },
      el('h3', {}, title, el('span', { class: 'badge badge--warn', text: String(items.length) })),
      items.length === 0
        ? el('p', { class: 'group__empty', text: 'Байхгүй' })
        : el('ul', {}, items.map((n) => el('li', {},
          bankName(n.bank, 24, el('strong', { text: n.bank.name })),
          n.reasons.map((r) => el('span', { text: r })),
          n.bank.official_url && el('span', {}, safeLink(n.bank.official_url, 'Албан хуудас'))))));
  });
  container.replaceChildren(head, el('div', { class: 'groups' }, groups));
}

// ---------------------------------------------------------------- rate matrix (Phase 3)

const ROW_STATE_TEXT = {
  verified: 'Баталгаажсан',
  partial: 'Хэсэгчлэн баталгаажсан',
  unverified: 'Баталгаажаагүй',
  excluded: 'Хасагдсан',
  demo: 'DEMO',
  research: 'Судлаач нягталсан',
  research_partial: 'Судлаач нягталсан, хэсэг нь баталгаажуулалт хүлээж буй',
  absent: 'Мэдээлэл алга',
};
const EXCLUSION_REASON_TEXT = {
  compound_interest: 'нийлмэл хүүтэй',
  restricted_customer_group: 'тусгай бүлэгт зориулсан',
  non_mnt: 'төгрөгийн бус',
  not_fixed_term: 'хугацаатай биш',
};
const CELL_TAG = { unverified: 'баталгаажаагүй', excluded: 'хасагдсан', demo: 'DEMO' };

function matrixCell(c, currentMonths, chips, best, rankState = 'verified') {
  const isBest = c.state === rankState && Number.isFinite(best) && c.maxPercent === best;
  const cls = ['num', 'mx-cell', `mx-cell--${c.state}`, c.months === currentMonths ? 'is-current' : '', chips.includes(c.months) ? 'is-chip' : '', isBest ? 'is-best' : '']
    .filter(Boolean).join(' ');
  if (c.state === 'absent') {
    return el('td', { class: cls, title: `${c.months} сар: санал зарлаагүй` },
      el('span', { 'aria-hidden': 'true', text: '—' }), el('span', { class: 'sr-only', text: 'саналгүй' }));
  }
  const value = c.minPercent === c.maxPercent
    ? formatPercent(c.minPercent)
    : `${formatPercent(c.minPercent)}–${formatPercent(c.maxPercent)}`;
  const tags = [
    c.matchType === 'mapped' && `≈ ${c.sourceTerm}`,
    c.matchType === 'month_range' && 'интервал',
    c.amountTiers && 'дүнгээр',
    CELL_TAG[c.state],
  ].filter(Boolean);
  const title = [
    `${c.months} сар: ${value}`,
    c.matchType === 'mapped' ? `≈ тааруулсан — банк «${c.sourceTerm}» гэж зарласан (D1: ${c.months} сар = ${c.mappedDays} өдөр)` : `Зарласан хугацаа: ${c.sourceTerm}`,
    ROW_STATE_TEXT[c.state],
    isBest && (rankState === 'research' ? 'хамгийн өндөр хүү (судлаач нягталсан) энэ хугацаанд' : 'хамгийн өндөр баталгаажсан хүү энэ хугацаанд'),
    c.note,
  ].filter(Boolean).join(' · ');
  return el('td', { class: cls, title },
    el('span', { class: 'mx-value', text: value }),
    tags.map((t) => el('span', { class: 'mx-tag', text: t })));
}

export function renderMatrix(container, matrix, state, { onExport } = {}) {
  const head = el('div', { class: 'section__head' },
    el('h2', { id: 'matrix-title', text: 'Хүүгийн бүрэн хүснэгт · 1–24 сар' }),
    matrix.mode === 'demo' && badge('DEMO', 'demo'),
    matrix.mode === 'research' && badge('Судлаач нягталсан', 'teal', 'Судлаачийн нягталсан мэдээлэл (D18, D19)'),
    el('span', { class: 'section__sub', text: `${new Set(matrix.rows.map((r) => r.bank.id)).size} банк · ${matrix.rows.length} мөр · банкны зарласан жилийн үндсэн хүү` }),
    exportButton('CSV татах — хүүгийн бүрэн хүснэгт, 1–24 сар', onExport));

  // D18: in research mode the rankable cells are the Sheets research rates.
  const rankState = matrix.mode === 'research' ? 'research' : 'verified';
  const legend = el('ul', { class: 'mx-legend' },
    rankState === 'research'
      ? el('li', {}, el('span', { class: 'mx-chip mx-cell--research', text: '12.00%' }), 'судлаачийн нягталсан мэдээлэл (Google Sheets) — эрэмбэд орно')
      : el('li', {}, el('span', { class: 'mx-chip mx-cell--verified', text: '12.00%' }), 'баталгаажсан'),
    el('li', {}, el('span', { class: 'mx-chip mx-cell--unverified', text: '12.00% баталгаажаагүй' }), 'эрэмбэд орохгүй'),
    el('li', {}, el('span', { class: 'mx-chip mx-cell--excluded', text: '5.80% хасагдсан' }), 'хамрах хүрээнээс гадуур'),
    el('li', {}, el('span', { class: 'mx-chip mx-cell--absent', text: '—' }), 'санал зарлаагүй (таамаглахгүй)'),
    el('li', {}, el('span', { class: 'mx-chip', text: '≈ 365 өдөр' }), 'өдрөөр зарласан хугацааг D1 хүснэгтээр тааруулсан (1, 3, 6, 9, 12, 18, 24 сар л)'),
    el('li', {}, el('span', { class: 'mx-chip', text: 'интервал' }), 'банк сарын интервалд нэг хүү зарласан'),
    el('li', {}, el('span', { class: `mx-chip mx-cell--${rankState} is-best`, text: '14.00%' }),
      rankState === 'research' ? 'тухайн хугацааны хамгийн өндөр судалгааны хүү' : 'тухайн хугацааны хамгийн өндөр баталгаажсан хүү'));

  // Highest verified published rate per month column (bold green); never 0% for gaps.
  const bestByMonth = new Map(matrix.months.map((m) => {
    const vals = matrix.rows.flatMap((r) => r.cells.filter((c) => c.months === m && c.state === rankState).map((c) => c.maxPercent))
      .filter(Number.isFinite);
    return [m, vals.length ? Math.max(...vals) : NaN];
  }));
  const rows = matrix.rows.map((r) => {
    const reason = r.exclusionReason ? EXCLUSION_REASON_TEXT[r.exclusionReason] ?? r.exclusionReason : null;
    const statusText = ROW_STATE_TEXT[r.state] + (reason ? ` — ${reason}` : '');
    const notes = [
      r.note,
      r.product == null && r.note,
      r.bonusTiers && `Дүнгийн нэмэгдэл (тооцоонд дүнгээр нэмэгдэнэ): ${r.bonusTiers.map((t) => `+${formatPercent(t.bonus_percent)}`).join(', ')}`,
    ].filter(Boolean);
    return el('tr', { class: `mx-row mx-row--${r.state}` },
      el('th', { scope: 'row', class: 'mx-bank' },
        bankName(r.bank, 20, el('strong', { text: r.bank.name })),
        el('span', { class: 'cell-sub', text: r.product ? `${r.product.name} · ${channelText(r.product.channel)}` : 'Бүтээгдэхүүн оруулаагүй' })),
      el('td', { class: 'mx-status' },
        el('span', { class: `badge badge--${r.state === 'verified' ? 'teal' : 'warn'}`, text: statusText }),
        [...new Set(notes)].map((n) => el('span', { class: 'cell-sub', text: n }))),
      r.cells.map((c) => matrixCell(c, state.months, matrix.chips, bestByMonth.get(c.months), rankState)),
      el('td', { class: 'mx-other' }, r.otherTerms.length === 0
        ? el('span', { class: 'cell-sub', text: '—' })
        : r.otherTerms.map((t) => el('span', { class: 'cell-sub' }, `${t.label}: ${formatPercent(t.percent)}${CELL_TAG[t.state] ? ` (${CELL_TAG[t.state]})` : ''}`))),
      el('td', { class: 'mx-source' },
        r.sourceUrl ? safeLink(r.sourceUrl, 'Албан хуудас') : el('span', { text: 'байхгүй' }),
        r.observedAt && el('span', { class: 'cell-sub', text: `Шалгасан: ${observedText(r.observedAt)}` })));
  });

  container.replaceChildren(head, legend,
    el('div', { class: 'table-wrap table-wrap--matrix', tabindex: '0', role: 'region', 'aria-labelledby': 'matrix-title' },
      el('table', { class: 'matrix' },
        el('caption', { class: 'sr-only', text: 'Банк бүрийн 1–24 сарын зарласан жилийн хүү, баталгаажуулалтын төлөв, эх сурвалж' }),
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col', class: 'mx-bank', text: 'Банк / бүтээгдэхүүн' }),
          el('th', { scope: 'col', text: 'Төлөв' }),
          matrix.months.map((m) => el('th', {
            scope: 'col',
            class: ['num', matrix.chips.includes(m) ? 'is-chip' : '', m === state.months ? 'is-current' : ''].filter(Boolean).join(' '),
            'aria-current': m === state.months ? 'true' : null,
          }, `${m}`, el('span', { class: 'sr-only', text: ' сар' }))),
          el('th', { scope: 'col', text: 'Бусад зарласан хугацаа (анхны нэгжээр)' }),
          el('th', { scope: 'col', text: 'Эх сурвалж' }))),
        el('tbody', {}, rows))),
    el('p', { class: 'field__hint', text: 'Тодруулга: баганын гарчиг нь сар. Тод гарчиг — самбарын хугацааны товч, тодруулсан багана — одоо сонгосон хугацаа. Өдрөөр зарласан хүүг зөвхөн D1 хүснэгтийн сарын баганад «≈» тэмдэгтэй харуулна; бусад өдрийн хугацааг сар руу хөрвүүлэхгүй, «Бусад зарласан хугацаа» баганад анхны нэгжээр нь үлдээв. Нүдэн дээр хулганаа барьж дэлгэрэнгүйг харна.' }),
  );
}

// ---------------------------------------------------------------- methodology

export function renderMethodology(container, dataset) {
  const li = (strong, text) => el('li', {}, el('strong', { text: strong }), ` ${text}`);
  container.replaceChildren(
    el('h2', { id: 'methodology-title', text: 'Аргачлал, таамаглал, эх сурвалж' }),
    el('div', { class: 'method-grid' },
      el('div', {},
        el('h3', { text: 'Тооцоо' }),
        el('ul', { class: 'method-list' },
          li('Энгийн хүү:', 'хүүг үндсэн дүнд тооцно, нийлмэл болгохгүй. Сар бүр олгосон хүүг дахин хадгаламжид оруулахгүй.'),
          li('Хүү тооцох арга:', 'банкны албан ёсоор зарласан аргыг ашиглана. Тодорхойгүй бол ACT/365-аар «Жишээ тооцоо» гэж шошголно — банкны тооцоолсон төлбөр биш.'),
          li('Татвар:', dataset.tax?.legal_basis
            ? `${dataset.tax.rate_percent}% — ${dataset.tax.legal_basis}. Хүүгийн нийт дүнд ногдуулж, банк суутгана. Үндсэн дүнд татвар ногдохгүй.`
            : '10% — ажлын таамаглал; хуулийн эцсийн шалгалт хийгдээгүй. Үндсэн дүнд татвар ногдохгүй.'),
          li('Сарын интервал:', 'банк «3–6 сар» гэх мэт сарын интервалд нэг хүү зарласан бол тухайн интервалд багтах сарыг шууд ашиглана (өдөр рүү хөрвүүлэхгүй).'),
          li('Нэмэгдэл хүү:', 'зөвхөн дүнгээс хамаарч автоматаар олгогдох, банкны хуудсанд зарласан нэмэгдлийг тооцно. Тохиролцоот, харилцагчийн түвшний нэмэгдлийг тооцохгүй.'),
          li('Хугацаа тааруулах:', '1 сар=30, 3=90, 6=180, 9=270, 12=365, 18=545, 24=730 өдөр. Тааруулсан бол «≈ тааруулсан». Зарлагдаагүй хугацааг таамаглахгүй.'),
          li('Сарын сүүл:', 'сарын сүүлийн өдрөөс эхэлсэн бол дуусах огноог тухайн сарын сүүлийн өдөр болгоно (батлагдсан дүрэм; банк өөрөөр заагаагүй үед).'))),
      el('div', {},
        el('h3', { text: 'Инфляци ба бүхэлчлэл' }),
        el('ul', { class: 'method-list' },
          li('Инфляци:', 'жилийн тогтмол сценари. Сараар зарласан хугацаанд T = сар/12, өдрөөр зарласан хугацаанд T = өдөр/365. Мөнгөн урсгал бүрийг өөрийн огноогоор тохируулна.'),
          li('Сценари:', 'түүхэн ажиглалт эсвэл гараар оруулсан утга — ирээдүйн таамаглал биш. Сөрөг утга нь дефляци.'),
          li('Бүхэлчлэл:', 'дотоод тооцоо бүрэн нарийвчлалтай; зөвхөн дэлгэцэнд бүхэл төгрөг рүү (0.5 → дээш) бүхэлчилнэ. Бүхэлчилсэн дүнгүүд ±1 ₮ зөрж болно.'),
          li('Хуучирсан мэдээлэл:', `${FRESHNESS_DAYS} хоногоос хуучин эсвэл огноогүй мэдээлэлд «Шинэчлэх шаардлагатай» тэмдэг гарна.`))),
      el('div', {},
        el('h3', { text: 'Эх сурвалж' }),
        el('ul', { class: 'method-list' },
          dataset.banks.filter((b) => b.official_url).map((b) => el('li', {}, safeLink(b.official_url, b.name))),
          dataset.research && el('li', {}, safeLink(dataset.research.source === 'live' ? dataset.research.url : 'https://docs.google.com/', 'Google Sheets — судалгааны хүснэгт (clean)'), dataset.research.source === 'live' ? '' : ' (одоо локал нөөц файлаар)'),
          el('li', {}, safeLink('https://www.mongolbank.mn/mn/p/1463', 'Монголбанк — банкуудын жагсаалт')),
          el('li', {}, safeLink(dataset.inflation?.source_url || 'https://www.1212.mn/', 'ҮСХ — албан CPI')),
          el('li', {}, safeLink(dataset.tax?.source_url || 'https://legalinfo.mn/', 'Хувь хүний орлогын албан татварын тухай хууль'))))),
    el('p', { class: 'disclaimer', text: 'Энэ самбар нь магистрын хичээлийн судалгааны төсөл бөгөөд санхүүгийн зөвлөгөө биш. Бодит нөхцөлийг банкнаас шууд лавлана уу.' }),
  );
}

// ---------------------------------------------------------------- data quality (D18)

const QSTATUS = {
  true: { text: 'PASS', cls: 'q-pass' },
  false: { text: 'FAIL', cls: 'q-fail' },
  null: { text: 'NOT VERIFIED', cls: 'q-warn' },
};
const qBadge = (pass, text) => {
  const s = QSTATUS[String(pass)];
  return el('span', { class: `q-status ${s.cls}`, text: text ?? s.text });
};
const moneyOrDash = (v) => (v == null ? '—' : formatMNT(v));

/**
 * «Өгөгдлийн чанар ба баталгаажуулалт»: the data source and three separate statuses —
 * CSV checks, calculation reconciliation (teacher benchmark) and source evidence. Source
 * NOT VERIFIED is never merged with a CSV or calculation PASS. `q` comes from app.js.
 */
export function renderQuality(container, q) {
  const live = q.source === 'live';
  const csvFailed = q.checks.filter((c) => c.pass !== true);
  const csvPass = csvFailed.length === 0 ? true : q.checks.some((c) => c.pass === false) ? false : null;
  // Reconciliation counts as PASS only against the live Google Sheets table.
  const reconPass = q.bench.pass === true && !live ? null : q.bench.pass;
  const ev = q.evidenceCounts;
  const evPass = q.numeric > 0 && ev.PASS === q.numeric ? true : null; // never PASS while any value lacks evidence
  const rs = q.researcher; // D19: researcher's manual check — a separate record, never merged into evPass
  const rsAll = q.numeric > 0 && rs.VERIFIED === q.numeric;
  const recheckRows = q.evidence.filter((c) => c.researcher === 'RECHECK');

  const stat = (label, value, sub) => el('div', { class: 'q-stat' },
    el('span', { class: 'q-stat__label', text: label }),
    el('span', { class: 'q-stat__value', text: value }),
    sub && el('span', { class: 'q-stat__sub', text: sub }));

  const statusCard = (title, pass, detail) => el('div', { class: 'q-card' },
    el('div', { class: 'q-card__head' }, el('h3', { text: title }), qBadge(pass)),
    el('p', { class: 'q-card__detail', text: detail }));

  const checksTable = el('table', { class: 'mini-table q-table' },
    el('caption', { class: 'sr-only', text: 'CSV бүтэц ба утгын шалгалт' }),
    el('thead', {}, el('tr', {}, ['№', 'Шалгалт', 'Үр дүн', 'Тайлбар'].map((h) => el('th', { scope: 'col', text: h })))),
    el('tbody', {}, q.checks.map((c, i) => el('tr', {},
      el('td', { class: 'num', text: String(i + 1) }), el('td', { text: c.name }),
      el('td', {}, qBadge(c.pass)), el('td', { class: 'q-detail', text: c.detail })))));

  const evidenceRows = q.evidence.filter((c) => c.result !== 'PASS');
  const benchTable = el('table', { class: 'mini-table q-table' },
    el('caption', { class: 'sr-only', text: 'Багшийн жишиг тооцоо: 10 000 000 ₮, 12 сар, 10% татвар' }),
    el('thead', {}, el('tr', {},
      ['Банк', '12 сарын хүү', 'Нийт хүү', 'Татвар 10%', 'Цэвэр хүү (JS)', 'Sheets net12', 'Зөрүү', 'Үр дүн', 'Самбарын тооцоо (12 сар)']
        .map((h, i) => el('th', { scope: 'col', class: i >= 1 && i <= 6 ? 'num' : '', text: h })))),
    el('tbody', {}, q.benchRows.map((r) => el('tr', {},
      el('td', { text: r.bank || r.bankId }),
      el('td', { class: 'num', text: r.rate == null ? '—' : formatPercent(r.rate) }),
      el('td', { class: 'num', text: moneyOrDash(r.gross) }),
      el('td', { class: 'num', text: moneyOrDash(r.tax == null ? null : -r.tax) }),
      el('td', { class: 'num', text: moneyOrDash(r.net) }),
      el('td', { class: 'num', text: moneyOrDash(r.sheets) }),
      el('td', { class: 'num', text: r.diff == null ? '—' : `${r.diff} ₮` }),
      el('td', {}, r.pass === true && !live ? qBadge(null, 'fallback') : qBadge(r.pass)),
      el('td', { class: 'q-detail', text: q.dashboardStatus.get(r.bankId) ?? '—' })))));

  container.replaceChildren(
    el('h2', { id: 'quality-title', class: 'sr-only', text: 'Өгөгдлийн чанар ба баталгаажуулалт' }),
    el('div', { class: `q-source ${live ? 'is-live' : 'is-fallback'}` },
      el('strong', { text: live ? 'Эх үүсвэр: Google Sheets (live)' : 'Эх үүсвэр: локал нөөц файл (fallback)' }),
      el('span', {}, live ? 'Нийтэлсэн CSV-г хуудас нээх бүрт шууд уншина. ' : `Google Sheets-ээс татаж чадсангүй (${q.error ?? 'алдаа'}). `,
        el('code', { text: q.url }))),
    el('div', { class: 'q-stats' },
      stat('Банк', `${q.banks}`, `хүлээгдэж буй ${q.expected.banks}`),
      stat('Багана', `${q.columns}`, 'net12 орсон'),
      stat('Хүүгийн бүрдэлт', formatPercentFromFraction(q.completeness), `${q.numeric} тоон / ${q.cells} нүд · ${q.empty.length} хоосон`),
      stat('Давхардал', `${q.duplicates.length}`, 'bank_id'),
      stat('Хамгийн их зөрүү', q.bench.maxDiff == null ? '—' : `${q.bench.maxDiff} ₮`, `${q.bench.matched}/${q.bench.banks} банк тулсан`)),
    el('div', { class: 'q-cards' },
      statusCard('CSV шалгалт', csvPass, `${q.checks.length - csvFailed.length}/${q.checks.length} шалгалт тэнцсэн. Хоосон хүүг 0 болгоогүй: ${q.empty.join(', ') || '—'}.`),
      statusCard('Тооцооны тулгалт (JS ↔ Sheets net12)', reconPass,
        live ? `${q.bench.matched}/${q.bench.banks} банк, хамгийн их зөрүү ${q.bench.maxDiff ?? '—'} ₮ (бүхэл төгрөгөөр, half-up).`
          : `Локал нөөц файлын net12-той ${q.bench.matched}/${q.bench.banks} тулсан — live Google Sheets-тэй тулгаагүй тул PASS гэж тэмдэглэхгүй.`),
      el('div', { class: 'q-card' },
        el('div', { class: 'q-card__head' }, el('h3', { text: 'Судлаачийн гараар нягталсан' }),
          el('span', { class: `q-status ${rsAll ? 'q-pass' : 'q-warn'}`, text: rsAll ? 'НЯГТАЛСАН' : 'ДАХИН НЯГТЛАХ' })),
        el('p', { class: 'q-card__detail', text: `Нягталсан ${rs.VERIFIED} · Дахин нягтлах ${rs.RECHECK} · Хоосон ${rs.EMPTY}. Судлаач банкны албан ёсны вэб хуудаснаас ${rs.from ?? '—'}…${rs.to ?? '—'}-нд гараар нягталж, дэлгэцийн зургаар баримтжуулсан (зураг судлаачид хадгалагдана). Нягталсан snapshot-оос өөрчлөгдсөн утга автоматаар «Дахин нягтлах» болно.` })),
      statusCard('Автомат файл-нотолгоо (rates_raw.csv)', evPass,
        `PASS ${ev.PASS} · PARTIAL ${ev.PARTIAL} · NOT VERIFIED ${ev['NOT VERIFIED']} · EMPTY ${ev.EMPTY}. Тоон ${q.numeric} утгын ${ev.PASS} нь өмнөх судалгааны баримттай (rates_raw.csv) суваг, хүүгээрээ таарсан.${q.evidenceMissing ? ' source_check.csv уншигдсангүй.' : ''}`)),
    el('p', { class: 'q-note', text: 'Эдгээр дөрвөн төлөвийг тусад нь харуулна. CSV ба тооцоо PASS байх нь хүүг банкны албан хуудастай тулгасан гэсэн үг биш. Судлаачийн гараар нягталсан төлөв нь автомат файл-нотолгооны үр дүнг өөрчлөхгүй: автомат шалгалт нь зөвхөн репод байгаа өмнөх баримттай (rates_raw.csv) тулгадаг.' }),
    recheckRows.length > 0 && el('details', { class: 'q-more', open: '' },
      el('summary', { text: `Дахин нягтлах шаардлагатай утга (${recheckRows.length})` }),
      el('ul', { class: 'q-evidence' }, recheckRows.map((c) => el('li', {},
        qBadge(null, 'ДАХИН НЯГТЛАХ'),
        el('strong', { text: ` ${c.bankId}.${c.term}` }),
        el('span', { text: ` ${formatPercent(c.value)} — ${c.researcherNote}` }))))),
    el('details', { class: 'q-more' },
      el('summary', { text: `CSV шалгалт (${q.checks.length})` }),
      el('div', { class: 'table-wrap table-wrap--mini' }, checksTable)),
    el('details', { class: 'q-more', id: 'benchmark-details' },
      el('summary', { text: 'Багшийн жишиг тооцоо: 10 000 000 ₮ · 12 сар · 10% татвар' }),
      el('p', { class: 'q-note', text: 'Цэвэр хүү = 10 000 000 × (m12 / 100) × 0.9. Энэ нь өгөгдлийн жишиг шалгалт бөгөөд самбарын тооцооноос тусдаа: эрэмбийн нөхцөл, хасалт, нийлмэл/шаталсан хүү, нэмэлт хоног, хоног тоолох арга, инфляцийг тооцохгүй. Тиймээс эрэмбээс хасагдсан банкууд (ХасБанк, Чингис хаан банк) ч энд бодогдоно. «Самбарын тооцоо» багана нь тухайн банк 12 сарын эрэмбэд хэрхэн орсныг харуулна.' }),
      el('div', { class: 'table-wrap table-wrap--mini' }, benchTable)),
    el('details', { class: 'q-more' },
      el('summary', { text: `Автомат файл-нотолгоо дутуу нүд (${evidenceRows.length})` }),
      el('ul', { class: 'q-evidence' }, evidenceRows.map((c) => el('li', {},
        qBadge(null, c.result),
        el('strong', { text: ` ${c.bankId}.${c.term}` }),
        el('span', { text: ` ${c.value == null ? 'хоосон' : formatPercent(c.value)} — ${c.note}` }))))),
  );
}
