// Phase 3 — Chart.js configuration and rendering. Data comes from chartdata.js;
// this module only maps it to Chart.js and to accessible HTML around the
// canvases. Chart.js is the vendored UMD build (window.Chart, D12).

import { formatDateMN, addDays } from './dates.js';
import { formatMNT, formatPercent } from './format.js';
import { MATCH_TEXT, POINT_STYLE } from './chartdata.js';
import { el } from './ui.js';

const instances = new Map();

export const chartsAvailable = () => typeof window !== 'undefined' && typeof window.Chart === 'function';

function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

let defaultsApplied = false;
function applyDefaults() {
  if (defaultsApplied) return;
  const { Chart } = window;
  Chart.defaults.color = token('--muted', '#94A3B8');
  Chart.defaults.borderColor = 'rgba(42, 59, 81, 0.7)';
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.maintainAspectRatio = false;
  Chart.defaults.responsive = true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) Chart.defaults.animation = false;
  else Chart.defaults.animation.duration = 250;
  Chart.defaults.plugins.tooltip.backgroundColor = '#0B1220';
  Chart.defaults.plugins.tooltip.borderColor = token('--border', '#2A3B51');
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.titleColor = token('--text', '#F8FAFC');
  Chart.defaults.plugins.tooltip.bodyColor = token('--text', '#F8FAFC');
  Chart.defaults.plugins.tooltip.padding = 10;
  defaultsApplied = true;
}

/** Shows a message instead of the canvas (loading, empty, Chart.js missing). */
function setBoxMessage(box, title, text) {
  let msg = box.querySelector('.chart-message');
  if (!title) { if (msg) msg.remove(); box.classList.remove('has-message'); return; }
  if (!msg) { msg = el('div', { class: 'chart-message empty-state' }); box.append(msg); }
  msg.replaceChildren(el('strong', { text: title }), text ?? '');
  box.classList.add('has-message');
}

function upsert(key, canvas, config) {
  const existing = instances.get(key);
  if (existing && existing.canvas === canvas && existing.config.type === config.type) {
    existing.data = config.data;
    existing.options = config.options;
    existing.update();
    return existing;
  }
  existing?.destroy();
  const chart = new window.Chart(canvas, config);
  instances.set(key, chart);
  return chart;
}

function destroy(key) {
  instances.get(key)?.destroy();
  instances.delete(key);
}

/** Re-measures a chart (e.g. after its collapsed section was opened). */
export function resizeChart(key) {
  const chart = instances.get(key);
  if (chart) { chart.resize(); chart.update('none'); }
}

export const NOT_AVAILABLE_TEXT = 'Chart.js (vendor/chartjs-4.4.1) ачаалагдсангүй. Хүснэгт ба тооцооны мэдээлэл хэвээр ажиллана.';

// ---------------------------------------------------------------- 1. ranking bars

/** Draws each bar's net return at the bar end (inside the bar when it would not fit). */
const valueLabelPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const items = opts?.items;
    if (!items) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.textBaseline = 'middle';
    const area = chart.chartArea;
    meta.data.forEach((bar, i) => {
      const it = items[i];
      if (!it) return;
      ctx.font = `${it.isTop ? 700 : 600} 12px ${window.Chart.defaults.font.family}`;
      const text = it.display;
      const w = ctx.measureText(text).width;
      const negative = it.netReturnPercent < 0;
      const colour = negative ? opts.negative : it.isTop ? opts.top : opts.text;
      const fitsOutside = negative ? bar.x - 6 - w >= area.left : bar.x + 6 + w <= area.right;
      if (fitsOutside) {
        ctx.fillStyle = colour;
        ctx.textAlign = negative ? 'right' : 'left';
        ctx.fillText(text, bar.x + (negative ? -6 : 6), bar.y);
      } else {
        ctx.fillStyle = opts.inside;
        ctx.textAlign = negative ? 'left' : 'right';
        ctx.fillText(text, bar.x + (negative ? 6 : -6), bar.y);
      }
    });
    ctx.restore();
  },
};

/**
 * D17 top-5 bars: net return after tax for the selected term (independent of
 * inflation). #1 bright green, others teal; x axis starts at zero.
 */
export function renderRankingChart({ box, canvas, caption }, items, { onSelect, demo }) {
  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  if (items.length === 0) {
    destroy('ranking');
    setBoxMessage(box, 'Эрэмбэлэх санал алга', 'Энэ нөхцөлд шаардлага хангасан банк алга — хуурамч ялагч харуулахгүй.');
    canvas.setAttribute('aria-label', 'Цэвэр өгөөжийн эрэмбийн график: эрэмбэлэх санал алга.');
    caption.textContent = '';
    return;
  }
  setBoxMessage(box, null);
  applyDefaults();

  const positive = token('--positive', '#34D399');
  const negative = token('--negative', '#FB7185');
  const teal = token('--teal', '#2DD4BF');
  const text = token('--text', '#F1F5F9');
  const values = items.map((it) => it.netReturnPercent);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = (max - min || 1) * 0.22;
  const colours = items.map((it) => (it.netReturnPercent < 0 ? negative : it.isTop ? positive : teal));

  upsert('ranking', canvas, {
    type: 'bar',
    data: {
      labels: items.map((it) => it.label),
      datasets: [{
        label: 'Цэвэр өгөөж (татварын дараа, хугацааны нийт), %',
        data: values,
        backgroundColor: colours,
        hoverBackgroundColor: colours,
        borderColor: items.map((it) => (it.isSelected ? text : 'transparent')),
        borderWidth: items.map((it) => (it.isSelected ? 1.5 : 0)),
        borderSkipped: false,
        borderRadius: 4,
        barPercentage: 0.66,
        categoryPercentage: 0.9,
      }],
    },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: 4, left: 0 } },
      onClick: (_evt, elements) => { if (elements.length > 0) onSelect(items[elements[0].index].bankId); },
      onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
      scales: {
        x: {
          min: min < 0 ? min - pad : 0,
          max: max > 0 ? max + pad : 0.5,
          title: { display: false },
          ticks: { display: false },
          grid: { drawTicks: false, color: (c) => (c.tick.value === 0 ? 'rgba(148, 163, 184, 0.35)' : 'transparent') },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            autoSkip: false,
            callback(value) {
              const label = this.getLabelForValue(value);
              if (box.clientWidth >= 400 || label.length <= 16) return label;
              const words = label.split(' ');
              const half = Math.ceil(words.length / 2);
              return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
            },
            color: (c) => (items[c.index]?.isTop || items[c.index]?.isSelected ? text : '#CBD5E1'),
            font: (c) => ({ size: 13, weight: items[c.index]?.isTop || items[c.index]?.isSelected ? '700' : '500' }),
          },
        },
      },
      plugins: {
        legend: { display: false },
        valueLabels: { items, top: positive, text, negative, inside: token('--bg', '#0B1220') },
        tooltip: {
          callbacks: {
            title: (c) => items[c[0].dataIndex].label,
            label: (c) => `Цэвэр өгөөж: ${items[c.dataIndex].display}`,
            afterLabel: (c) => [
              items[c.dataIndex].isSelected ? 'Сонгосон банк' : null,
              demo ? 'DEMO өгөгдөл' : null,
            ].filter(Boolean),
          },
        },
      },
    },
    plugins: [valueLabelPlugin],
  });

  const summary = items.map((it) => `№${it.rank} ${it.label} ${it.display}`).join('; ');
  canvas.setAttribute('aria-label', `${demo ? 'DEMO. ' : ''}Цэвэр өгөөжийн эхний ${items.length} банкны хэвтээ баганан график: ${summary}.`);
  caption.textContent = 'Цэвэр өгөөж = цэвэр хүүгийн орлого ÷ үндсэн мөнгө (10% татварын дараа, хугацааны нийт). Баганыг дарж банкаа сонгоно.';
}

// ---------------------------------------------------------------- 2. term curve

const CHANNEL = { online: 'онлайн', branch: 'салбар', any: 'онлайн ба салбар' };

function pointNote(p) {
  if (!p) return [];
  const lines = [];
  if (p.matchType === 'mapped') lines.push(`≈ тааруулсан: банк «${p.sourceTerm}» гэж зарласан → ${p.months} сар (${p.mappedDays} өдөр)`);
  else if (p.matchType === 'month_range') lines.push(`Сарын интервал: «${p.sourceTerm}»`);
  else lines.push(`Зарласан хугацаа: ${p.sourceTerm}`);
  if (p.bonusPercent > 0) lines.push(`Үндсэн ${formatPercent(p.basePercent)} + дүнгийн нэмэгдэл ${formatPercent(p.bonusPercent)}`);
  lines.push(`${p.productName}${CHANNEL[p.channel] ? ` · ${CHANNEL[p.channel]}` : ''}`);
  if (p.demo) lines.push('DEMO өгөгдөл');
  return lines;
}

export function renderTermCurve({ box, canvas, togglesEl, notesEl }, curve, visibleIds, { onToggle, onReset }) {
  // Toggles are plain checkboxes (keyboard accessible); they double as the legend.
  togglesEl.replaceChildren(
    ...curve.series.map((s) => {
      const id = `curve-toggle-${s.bankId}`;
      const shown = visibleIds.includes(s.bankId);
      const count = s.points.filter(Boolean).length;
      return el('label', { class: 'toggle', for: id },
        el('input', { type: 'checkbox', id, checked: shown, onchange: (e) => onToggle(s.bankId, e.target.checked) }),
        el('span', { class: 'toggle__swatch', style: `background:${s.color}`, 'aria-hidden': 'true' }),
        el('span', { text: s.label }),
        el('span', { class: 'toggle__meta', text: `${count}/${curve.chips.length}` }));
    }),
    el('button', { type: 'button', class: 'btn btn--ghost btn--small', onclick: onReset }, 'Шилдэг 5'),
  );

  const visible = curve.series.filter((s) => visibleIds.includes(s.bankId));
  const missing = curve.withoutPoints.map((b) => b.label).join(', ');
  notesEl.replaceChildren(
    el('li', {}, el('strong', { text: 'Тэмдэглэгээ: ' }), '● зарласан сар · ◆ сарын интервал (', el('em', { text: MATCH_TEXT.month_range }), ') · ▲ ', el('em', { text: MATCH_TEXT.mapped }), ' (өдрөөр зарласан хугацааг D1 хүснэгтээр тааруулсан).'),
    el('li', { text: 'Зөвхөн баталгаажсан, шаардлага хангасан, зарлагдсан хүү. Санал зарлаагүй хугацаанд цэг байхгүй (завсар үлдэнэ) — хүүг таамаглаж нөхөхгүй. Цэгүүдийг холбосон шугам нь харьцуулалтад зориулсан бөгөөд завсрын хугацааны хүү биш.' }),
    el('li', { text: 'Жилийн нэрлэсэн хүү (татвар, инфляцаас өмнө). Оруулсан дүнд хамаарах автомат дүнгийн нэмэгдэл орсон.' }),
    missing && el('li', { text: `Графикт цэггүй банк (баталгаажсан, шаардлага хангасан хүү алга): ${missing}. Шалтгааныг «Эрэмбэд ороогүй банкууд» болон хүүгийн хүснэгтээс харна уу.` }),
  );

  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  if (curve.series.length === 0 || visible.length === 0) {
    destroy('curve');
    setBoxMessage(box, curve.series.length === 0 ? 'Харуулах хүү алга' : 'Банк сонгоогүй',
      curve.series.length === 0 ? 'Энэ нөхцөлд баталгаажсан, шаардлага хангасан хүү алга.' : 'Дээрх жагсаалтаас банк сонгоно уу.');
    canvas.setAttribute('aria-label', 'Хугацаа ба жилийн хүүгийн график: харуулах өгөгдөл алга.');
    return;
  }
  setBoxMessage(box, null);
  applyDefaults();

  upsert('curve', canvas, {
    type: 'line',
    data: {
      labels: curve.chips.map((m) => `${m} сар`),
      datasets: visible.map((s) => ({
        label: s.label,
        data: s.points.map((p) => (p ? p.percent : null)),
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        borderDash: [6, 4],
        spanGaps: false,
        tension: 0,
        pointStyle: s.points.map((p) => (p ? POINT_STYLE[p.matchType] ?? 'circle' : 'circle')),
        pointRadius: s.points.map((p) => (p ? (p.matchType === 'exact' ? 4 : 6) : 0)),
        pointHoverRadius: 8,
        pointBorderColor: s.points.map((p) => (p && p.matchType !== 'exact' ? '#FBBF24' : s.color)),
        pointBorderWidth: s.points.map((p) => (p && p.matchType !== 'exact' ? 2 : 1)),
      })),
    },
    options: {
      interaction: { mode: 'nearest', intersect: true },
      scales: {
        x: { title: { display: true, text: 'Хугацаа (сарын товч)' }, grid: { display: false } },
        y: {
          title: { display: true, text: 'Жилийн нэрлэсэн хүү, %' },
          ticks: { callback: (v) => formatPercent(v, { decimals: 1 }) },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${formatPercent(c.parsed.y)}`,
            afterLabel: (c) => pointNote(visible[c.datasetIndex].points[c.dataIndex]),
          },
        },
      },
    },
  });

  const desc = visible.map((s) => {
    const pts = s.points.map((p, i) => `${curve.chips[i]} сар ${p ? formatPercent(p.percent) + (p.matchType === 'mapped' ? ' (≈ тааруулсан)' : p.matchType === 'month_range' ? ' (интервал)' : '') : 'саналгүй'}`);
    return `${s.label}: ${pts.join(', ')}`;
  }).join('. ');
  canvas.setAttribute('aria-label', `${curve.mode === 'demo' ? 'DEMO. ' : ''}Хугацаа ба жилийн нэрлэсэн хүүгийн шугаман график. ${desc}.`);
}

// ---------------------------------------------------------------- 3. growth

/**
 * Single-line growth of the selected deposit: principal at the start, total
 * nominal proceeds at maturity (principal + net interest, never reinvested).
 * Interim points are the modelled accrual of net interest (D16), not payouts.
 * Values come from prepareGrowthSeries (same engine as the ranking).
 */
export function renderGrowthChart({ box, canvas, titleEl, notesEl, tableEl }, entry, growth, { showInflation = false } = {}) {
  if (!entry) {
    destroy('growth');
    titleEl.textContent = 'Хадгаламжийн өсөлт';
    setBoxMessage(box, 'Сонгосон банк алга', 'Эрэмбэлэх санал гарвал сонгосон банкны өсөлт энд харагдана.');
    canvas.setAttribute('aria-label', 'Хадгаламжийн өсөлтийн график: сонгосон банк алга.');
    notesEl.replaceChildren(); tableEl.replaceChildren();
    return;
  }
  titleEl.textContent = `Хадгаламжийн өсөлт (${entry.bank.name}, ${entry.match.months} сар)`;
  const o = entry.offer;
  const pts = growth.points;
  const periodic = growth.interimPayments > 0;
  const green = token('--positive', '#34D399');

  notesEl.replaceChildren(...[
    'Эхний цэг — үндсэн мөнгө; сүүлийн цэг — хугацааны эцэст авах нийт мөнгө (үндсэн мөнгө + цэвэр хүүгийн орлого).',
    'Завсрын цэгүүд нь татварын дараах хүүгийн загварчилсан хуримтлал бөгөөд тухайн өдөр олгогдох мөнгө биш.',
    periodic
      ? `Хүүг ${growth.interimPayments + 1} удаа (сар бүр) олгоно; олгосон хүү хадгаламжид нэмэгдэхгүй, нийлмэл болохгүй.`
      : 'Хүүг хугацааны эцэст нэг удаа олгоно.',
    growth.payoutAssumed && 'Хүү олгох хэлбэр тодорхойгүй — хугацааны эцэст олгоно гэж жишээ байдлаар загварчилсан.',
    growth.illustrative && 'Жишээ тооцоо (ACT/365): банкны тооцоолсон яг дүн биш.',
  ].filter(Boolean).map((t) => el('li', { text: t })));

  // Accessible data table (non-visual alternative to the chart).
  const shown = pts.length > 14 ? pts.filter((p, i) => p.isPayment || i === 0 || i % Math.ceil(pts.length / 12) === 0) : pts;
  const heads = ['Огноо', 'Үндсэн мөнгө', 'Авсан хүү', 'Хуримтлагдсан (загвар)', 'Нийт'];
  if (showInflation) heads.push('Худалдан авах чадвар');
  tableEl.replaceChildren(el('table', { class: 'mini-table' },
    el('caption', { class: 'sr-only', text: `${entry.bank.name} — хадгаламжийн өсөлтийн өгөгдөл` }),
    el('thead', {}, el('tr', {}, heads.map((h, i) => el('th', { scope: 'col', class: i > 0 ? 'num' : '', text: h })))),
    el('tbody', {}, shown.map((p) => el('tr', {},
      el('td', { text: `${formatDateMN(p.date)}${p.isPayment ? ' ●' : ''}` }),
      el('td', { class: 'num', text: formatMNT(p.principal) }),
      el('td', { class: 'num', text: formatMNT(p.paidCumulative) }),
      el('td', { class: 'num', text: formatMNT(p.accruedUnpaid) }),
      el('td', { class: 'num', text: formatMNT(p.nominal) }),
      showInflation && el('td', { class: 'num', text: formatMNT(p.purchasingPower) }))))));

  canvas.setAttribute('aria-label',
    `${entry.flags.demo ? 'DEMO. ' : ''}${entry.bank.name}, ${entry.match.months} сар: үндсэн мөнгө ${formatMNT(o.principal)}-өөс `
    + `хугацааны эцэст авах нийт мөнгө ${formatMNT(growth.final.nominal)} хүртэл.`);

  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  setBoxMessage(box, null);
  applyDefaults();

  const narrow = box.clientWidth < 520;
  const axisMNT = (v) => `${(v / 1e6).toFixed(Math.abs(v) < 1e7 ? 2 : 1)} сая ₮`;
  const lastIndex = pts.length - 1;
  const totalDays = pts[lastIndex].days || 1;
  const monthsAt = (days) => Math.round((days / totalDays) * entry.match.months);

  upsert('growth', canvas, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Нийт мөнгө',
        data: pts.map((p) => ({ x: p.days, y: p.nominal })),
        borderColor: green,
        borderWidth: 2.5,
        tension: 0.25,
        fill: 'start',
        backgroundColor: (ctx) => {
          const area = ctx.chart.chartArea;
          if (!area) return 'rgba(52, 211, 153, 0.12)';
          const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, 'rgba(52, 211, 153, 0.32)');
          g.addColorStop(1, 'rgba(52, 211, 153, 0.02)');
          return g;
        },
        pointRadius: pts.map((_p, i) => (i === 0 || i === lastIndex ? 4 : 0)),
        pointHoverRadius: 5,
        pointBackgroundColor: green,
        pointBorderColor: token('--bg', '#0B1220'),
        pointBorderWidth: 1.5,
      }],
    },
    options: {
      parsing: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: pts[lastIndex].days,
          ticks: {
            maxTicksLimit: narrow ? 4 : 7,
            maxRotation: 0,
            callback: (v) => (v === 0 ? 'Эхлэл' : `${monthsAt(v)} сар`),
          },
          grid: { display: false },
        },
        y: {
          position: 'left',
          ticks: { callback: axisMNT, maxTicksLimit: 5 },
          grid: { color: 'rgba(41, 59, 80, 0.55)' },
          border: { display: false },
        },
      },
      layout: { padding: { top: 30, right: 6 } },
      plugins: {
        legend: { display: false },
        endLabel: { text: formatMNT(growth.final.nominal), fg: green },
        tooltip: {
          callbacks: {
            title: (items) => formatDateMN(pts[items[0].dataIndex]?.date ?? addDays(o.startDate, items[0].parsed.x)),
            label: (c) => `Нийт: ${formatMNT(c.parsed.y)}`,
            footer: (items) => {
              const i = items[0].dataIndex;
              const p = pts[i];
              if (!p) return '';
              if (i === 0) return 'Үндсэн мөнгө';
              if (p.isMaturity) return 'Хугацааны эцэст авах нийт мөнгө';
              return 'Загварчилсан хуримтлал (олгогдоогүй)';
            },
          },
        },
      },
    },
    plugins: [endLabelPlugin],
  });
}

/** Bold value label with the final total above the last point. */
const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.text) return;
    const meta = chart.getDatasetMeta(0);
    const last = meta?.data?.[meta.data.length - 1];
    if (!last || meta.hidden) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = `700 13px ${window.Chart.defaults.font.family}`;
    const w = ctx.measureText(opts.text).width;
    const x = Math.min(Math.max(last.x - w, chartArea.left), chartArea.right - w);
    const y = Math.max(last.y - 14, 10);
    ctx.fillStyle = opts.fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.text, x, y);
    ctx.restore();
  },
};

export function showLoading(boxes) {
  boxes.forEach((box) => setBoxMessage(box, 'Ачаалж байна…', 'Өгөгдлийг уншиж байна.'));
}

export function showError(boxes, message) {
  boxes.forEach((box) => setBoxMessage(box, 'Өгөгдөл ачаалж чадсангүй', message));
}
