// Week 4 first experiment (course guide, Topic 1).
// Reads the clean rate table, prints it, and compares three ways of computing
// the 12-month net income on 10,000,000 ₮.

import { computeOffer } from '../js/calc.js';
import { parseISODate } from '../js/dates.js';
import { formatMNT, roundHalfAwayFromZero } from '../js/format.js';

// Paste the Google Sheets "Publish to web → CSV" link of the `clean` sheet here.
// Empty → the local copy produced by scripts/clean_rates.py is used.
const SHEETS_CSV_URL = '';
const LOCAL_CSV_URL = '../data/clean/rates_clean.csv';

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

async function loadCSV() {
  const url = SHEETS_CSV_URL || LOCAL_CSV_URL;
  const text = await (await fetch(url, { cache: 'no-store' })).text();
  // Course guide, step 3: simple split. Safe because the clean table has no commas inside fields.
  const [head, ...rows] = text.trim().split('\n').map((r) => r.replace(/\r$/, '').split(','));
  console.log(head, rows.length); // банкны тоо зөв гарах ёстой (12)
  const records = rows.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
  return { url, head, records, fromSheets: Boolean(SHEETS_CSV_URL) };
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
  const { url, head, records, fromSheets } = await loadCSV();
  $('data-source').textContent = `${fromSheets ? 'Google Sheets (нийтэлсэн CSV)' : 'локал data/clean/rates_clean.csv'} — ${records.length} банк`;

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
