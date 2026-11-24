// Week 4 first experiment (course guide, Topic 1).
// Reads the clean rate table, prints it, and compares three ways of computing
// the 12-month net income on 10,000,000 ₮.

import { computeOffer } from '../js/calc.js';
import { parseISODate } from '../js/dates.js';
import { formatMNT, roundHalfAwayFromZero } from '../js/format.js';

// Google Sheets: File → Share → Publish to web → `clean` sheet → CSV. Paste the link here
// (or open the page with ?csv=<link> to try a link without editing the file).
// Empty → the local copy produced by src/clean_rates.py is used.
const SHEETS_CSV_URL = '';
const LOCAL_CSV_URL = '../data/clean/rates_clean.csv';
const EXPECTED_COLUMNS = ['bank_id', 'bank', 'channel', 'm3', 'm6', 'm12', 'm24', 'source', 'checked', 'note'];
const EXPECTED_BANKS = 12;

/** Only Google Sheets "publish to web" CSV links are accepted as an external source. */
function sheetsUrl() {
  const fromQuery = new URLSearchParams(window.location.search).get('csv');
  const candidate = (fromQuery || SHEETS_CSV_URL).trim();
  if (!candidate) return { url: '', origin: 'none' };
  let parsed;
  try { parsed = new URL(candidate); } catch { return { url: '', origin: 'invalid', value: candidate }; }
  const ok = parsed.protocol === 'https:' && parsed.hostname === 'docs.google.com'
    && parsed.pathname.includes('/pub') && parsed.searchParams.get('output') === 'csv';
  return ok ? { url: parsed.href, origin: fromQuery ? 'query' : 'constant' } : { url: '', origin: 'invalid', value: candidate };
}

const PRINCIPAL = 10_000_000;
const MONTHS = 12;
const START = '2026-11-16'; // 365 days to 2027-11-16 (no 29 February)

const $ = (id) => document.getElementById(id);

function cell(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}

function renderTable(table, caption, header, rows) {
  table.replaceChildren();
  if (caption) table.append(cell('caption', caption));
  const thead = document.createElement('thead');
  const tr = document.createElement('tr');
  header.forEach((h) => tr.append(cell('th', h)));
  thead.append(tr);
  const tbody = document.createElement('tbody');
  rows.forEach((r) => {
    const row = document.createElement('tr');
    r.forEach((c) => row.append(typeof c === 'object' ? cell('td', c.text, c.className) : cell('td', c)));
    tbody.append(row);
  });
  table.append(thead, tbody);
}

async function fetchText(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function parseCSV(text) {
  // Course guide, step 3: simple split. Safe because the clean table has no commas or quotes inside fields.
  const [head, ...rows] = text.trim().split('\n').map((r) => r.replace(/\r$/, '').split(','));
  return { head: head.map((h) => h.trim()), rows };
}

async function loadCSV() {
  const sheets = sheetsUrl();
  let sheetsNote;
  let source = { url: LOCAL_CSV_URL, fromSheets: false };
  let text;
  if (sheets.url) {
    try {
      text = await fetchText(sheets.url);
      source = { url: sheets.url, fromSheets: true };
      sheetsNote = { ok: true, text: 'Google Sheets холбоос: холбогдсон, нийтэлсэн CSV-г уншив.' };
    } catch (e) {
      sheetsNote = { ok: false, text: `Google Sheets холбоос: уншиж чадсангүй (${e.message}) — локал файлыг ашиглав.` };
    }
  } else if (sheets.origin === 'invalid') {
    sheetsNote = { ok: false, text: 'Google Sheets холбоос: буруу хэлбэртэй (…/pub?…&output=csv байх ёстой) — локал файлыг ашиглав.' };
  } else {
    sheetsNote = { ok: null, text: 'Google Sheets холбоос: оруулаагүй — бодит холболтын шалгалт хүлээгдэж байна. Локал файлыг ашиглав.' };
  }
  if (text == null) text = await fetchText(LOCAL_CSV_URL);

  const { head, rows } = parseCSV(text);
  console.log('Эх сурвалж:', source.url);
  console.log('Баганын нэрс:', head);
  console.log('Банкны мөрийн тоо:', rows.length); // 12 байх ёстой

  const problems = [];
  const missingCols = EXPECTED_COLUMNS.filter((c) => !head.includes(c));
  if (missingCols.length) problems.push(`дутуу багана: ${missingCols.join(', ')}`);
  if (rows.length !== EXPECTED_BANKS) problems.push(`банкны мөр ${rows.length} (${EXPECTED_BANKS} байх ёстой)`);
  if (text.includes('"')) problems.push('хашилт (") илэрсэн — энгийн split буруу задлах эрсдэлтэй');
  if (problems.length) console.warn('CSV шалгалт:', problems.join('; '));

  const records = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { url: source.url, head, records, fromSheets: source.fromSheets, sheetsNote, problems };
}

const num = (s) => (s === '' || s == null ? null : parseFloat(s));

function engineNet(rec) {
  const r = num(rec.m12);
  const mapped = /m12 ≈ тааруулсан/.test(rec.note);
  const match = mapped
    ? { rate: { annual_percent: r }, months: MONTHS, term_basis: 'days', termDays: 365 }
    : { rate: { annual_percent: r }, months: MONTHS, term_basis: 'months', termDays: null };
  const product = { day_count_convention: 'unknown', day_count_source_url: null, payout_frequency: 'at_maturity' };
  return computeOffer({ principal: PRINCIPAL, match, product, startDate: parseISODate(START), q: 0 });
}

async function main() {
  const { url, head, records, fromSheets, sheetsNote, problems } = await loadCSV();
  $('data-source').textContent = `${fromSheets ? 'Google Sheets (нийтэлсэн CSV)' : 'локал data/clean/rates_clean.csv'} — ${records.length} банк`
    + (problems.length ? ` — анхаар: ${problems.join('; ')}` : ` — ${head.length} багана, шалгалт тэнцсэн`);
  $('sheets-status').textContent = sheetsNote.text;
  $('sheets-status').className = sheetsNote.ok === true ? 'ok' : sheetsNote.ok === false ? 'bad' : 'warn';
  window.__WEEK4_SOURCE__ = { url, fromSheets, columns: head, rows: records.length, problems, sheets: sheetsNote };

  // 1. Plain HTML table of the clean data (guide: "Хүүг энгийн HTML хүснэгтээр").
  const shown = ['bank', 'm3', 'm6', 'm12', 'm24', 'checked', 'note'];
  renderTable($('rates-table'), '', ['Банк', '3 сар', '6 сар', '12 сар', '24 сар', 'Шалгасан', 'Тайлбар'],
    records.map((rec) => shown.map((k) => (k === 'note' ? { text: rec[k] || '', className: 'note' }
      : (k.startsWith('m') ? (rec[k] ? `${rec[k]}%` : '—') : rec[k])))));
  $('rates-foot').textContent = `Баганууд: ${head.join(', ')}. «—» = энэ хугацаанд ашиглах хүү байхгүй (0 биш); шалтгаан нь «Тайлбар»-т.`;

  // 2. Experiment: three computations of the 12-month net income.
  const rows = [];
  for (const rec of records) {
    const r = num(rec.m12);
    if (r == null) continue;
    const a = PRINCIPAL * r / 100 * 0.9;
    const offer = engineNet(rec);
    const b = offer.totalNetInterest;
    const c = num(rec.net12);
    rows.push({ bank: rec.bank, r, a, b, c, days: offer.eligibleDays, basis: /m12 ≈ тааруулсан/.test(rec.note) ? '≈ 365 хоног' : '12 сар' });
  }
  rows.sort((x, y) => y.a - x.a);
  console.table(rows.map(({ bank, r, a, b, c }) => ({ bank, r, A: a, B: b, C: c })));

  let allZero = true;
  const tableRows = rows.map((x) => {
    const dAB = roundHalfAwayFromZero(x.a) - roundHalfAwayFromZero(x.b);
    const dAC = x.c == null ? null : roundHalfAwayFromZero(x.a) - roundHalfAwayFromZero(x.c);
    if (dAB !== 0 || (dAC != null && dAC !== 0)) allZero = false;
    return [
      x.bank, `${x.r}%`, x.basis, String(x.days),
      formatMNT(x.a), formatMNT(x.b), x.c == null ? '—' : formatMNT(x.c),
      { text: String(dAB), className: dAB === 0 ? 'ok' : 'bad' },
      dAC == null ? '—' : { text: String(dAC), className: dAC === 0 ? 'ok' : 'bad' },
    ];
  });
  renderTable($('result-table'), '', ['Банк', '12 сарын хүү', 'Хугацаа', 'Хоног', 'A томьёо', 'B calc.js', 'C Sheets', 'A − B', 'A − C'], tableRows);
  const hasSheets = rows.some((x) => x.c != null);
  const top = rows[0];
  $('result-summary').className = allZero ? 'ok' : 'bad';
  $('result-summary').textContent = `${allZero ? '✓ Зөрүү 0' : '✗ Зөрүү илэрсэн'} — ${rows.length} банк, бүхэл ₮ хүртэл дугуйлж (half-up) харьцуулав.`
    + (hasSheets ? '' : ' C багана хоосон: Sheets-ийн net12 томьёог нэмж, CSV холбоосыг SHEETS_CSV_URL-д оруулна уу.')
    + ` Хамгийн өндөр: ${top.bank} ${formatMNT(top.a)}.`;
  window.__WEEK4__ = { allZero, rows, hasSheets };

  // 3. Bar chart.
  try {
    if (!window.Chart) throw new Error('Chart.js ачаалагдсангүй');
    new window.Chart($('chart'), {
      type: 'bar',
      data: {
        labels: rows.map((x) => x.bank),
        datasets: [{ label: 'Цэвэр орлого (₮)', data: rows.map((x) => roundHalfAwayFromZero(x.a)), backgroundColor: '#2DD4BF' }],
      },
      options: {
        indexAxis: 'y', maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => formatMNT(ctx.parsed.x) } } },
        scales: {
          x: { beginAtZero: true, ticks: { color: '#94A3B8', callback: (v) => `${(v / 1e6).toFixed(1)} сая` }, grid: { color: '#2A3B51' } },
          y: { ticks: { color: '#F8FAFC' }, grid: { display: false } },
        },
      },
    });
  } catch (e) {
    $('chart-error').textContent = `График: ${e.message}`;
  }

  const excluded = records.filter((rec) => num(rec.m12) == null).map((rec) => rec.bank);
  $('coverage').textContent = `Хамрах хүрээ: Монголбанкны жагсаалтын 12 банкнаас ${rows.length} банкны 12 сарын хүүг тооцов; `
    + `тооцоогүй ${excluded.length}: ${excluded.join(', ')} (шалтгааныг дээрх «Тайлбар»-аас үзнэ үү). `
    + `Цэвэр орлого = хүүгийн орлогоос 10% татвар суутгасны дараах дүн; инфляцыг тооцоогүй. Эх сурвалж: ${url}.`;
}

main().catch((e) => {
  $('data-source').textContent = `Алдаа: ${e.message}. Хуудсыг локал HTTP сервероор нээнэ үү (file:// биш).`;
  console.error(e);
});
