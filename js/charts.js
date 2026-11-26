// Phase 3 — Chart.js configuration and rendering. Data comes from chartdata.js;
// this module only maps it to Chart.js and to accessible HTML around the
// canvases. Chart.js is the vendored UMD build (window.Chart, D12).

import { formatDateMN, addDays, addMonthsClamp, diffDays } from './dates.js';
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
  // Per-bar horizontal gradient from the zero line to the bar end; recomputed on every update/resize.
  const GRAD_TOP = ['#2DD4BF', '#30DF8E'];
  const GRAD_REST = ['#2ABFC3', '#165958'];
  const fill = (ctx) => {
    const it = items[ctx.dataIndex];
    if (!it) return teal;
    if (it.netReturnPercent < 0) return negative;
    const [from, to] = it.isTop ? GRAD_TOP : GRAD_REST;
    const xScale = ctx.chart.scales?.x;
    if (!xScale || !Number.isFinite(it.netReturnPercent)) return from;
    const x0 = xScale.getPixelForValue(0);
    const x1 = xScale.getPixelForValue(it.netReturnPercent);
    if (!Number.isFinite(x0) || !Number.isFinite(x1) || Math.abs(x1 - x0) < 1) return from;
    const g = ctx.chart.ctx.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, from);
    g.addColorStop(1, to);
    return g;
  };

  upsert('ranking', canvas, {
    type: 'bar',
    data: {
      labels: items.map((it) => it.label),
      datasets: [{
        label: 'Цэвэр өгөөж (татварын дараа, хугацааны нийт), %',
        data: values,
        backgroundColor: fill,
        hoverBackgroundColor: fill,
        // Selected bank: a thin light outline that leaves the gradient fill visible.
        borderColor: items.map((it) => (it.isSelected ? 'rgba(241, 245, 249, 0.85)' : 'transparent')),
        borderWidth: items.map((it) => (it.isSelected ? 1 : 0)),
        borderSkipped: 'start',
        borderRadius: 9,
        barThickness: 18,
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
              demo || null, // status label: 'DEMO өгөгдөл' / research (D18) / null
            ].filter(Boolean),
          },
        },
      },
    },
    plugins: [valueLabelPlugin],
  });

  const summary = items.map((it) => `№${it.rank} ${it.label} ${it.display}`).join('; ');
  canvas.setAttribute('aria-label', `${demo ? `${demo}. ` : ''}Цэвэр өгөөжийн эхний ${items.length} банкны хэвтээ баганан график: ${summary}.`);
  const captionText = 'Цэвэр өгөөж = цэвэр хүүгийн орлого ÷ үндсэн мөнгө (10% татварын дараа, хугацааны нийт). Баганыг дарж банкаа сонгоно.';
  caption.textContent = 'Цэвэр өгөөж = цэвэр хүү ÷ үндсэн мөнгө · баганыг дарж сонгоно';
  caption.title = captionText;
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
  if (p.research) lines.push('Судлаачийн нягталсан мэдээлэл');
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
  canvas.setAttribute('aria-label', `${curve.mode === 'demo' ? 'DEMO. ' : curve.mode === 'research' ? 'Судлаачийн нягталсан мэдээлэл. ' : ''}Хугацаа ба жилийн нэрлэсэн хүүгийн шугаман график. ${desc}.`);
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
    `${entry.flags.demo ? 'DEMO. ' : entry.flags.research ? 'Судлаач нягталсан. ' : ''}${entry.bank.name}, ${entry.match.months} сар: үндсэн мөнгө ${formatMNT(o.principal)}-өөс `
    + `хугацааны эцэст авах нийт мөнгө ${formatMNT(growth.final.nominal)} хүртэл.`);

  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  setBoxMessage(box, null);
  applyDefaults();

  const axisMNT = (v) => `${(v / 1e6).toFixed(Math.abs(v) < 1e7 ? 2 : 1)} сая ₮`;
  const lastIndex = pts.length - 1;
  const ticks = growthTicks(entry, pts[lastIndex].days);
  const tickLabel = new Map(ticks.map((t) => [t.days, t.label]));
  const tickDays = new Set(ticks.map((t) => t.days));
  // Markers on the plotted points that fall on a tick (real sample dates), the end point larger.
  const radius = pts.map((p, i) => (i === lastIndex ? 5.5 : tickDays.has(p.days) ? 3.5 : 0));

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
        pointRadius: radius,
        pointHoverRadius: 5,
        pointBackgroundColor: pts.map((_p, i) => (i === lastIndex ? green : '#ECFDF5')),
        pointBorderColor: green,
        pointBorderWidth: pts.map((_p, i) => (i === lastIndex ? 3 : 2)),
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
          // Ticks are set to real sample dates (month anniversaries / weeks), not relabelled positions.
          afterBuildTicks: (axis) => { axis.ticks = ticks.map((t) => ({ value: t.days })); },
          ticks: {
            autoSkip: false,
            maxRotation: 0,
            callback: (v) => tickLabel.get(v) ?? '',
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
      layout: { padding: { top: 30, right: 10 } },
      plugins: {
        legend: { display: false },
        endLabel: { text: formatMNT(growth.final.nominal), fg: green, bg: 'rgba(52, 211, 153, 0.16)', textColor: '#ECFDF5' },
        tooltip: {
          callbacks: {
            title: (items) => {
              const p = pts[items[0].dataIndex];
              const date = formatDateMN(p?.date ?? addDays(o.startDate, items[0].parsed.x));
              return p ? `${date} · ${p.days} хоног` : date;
            },
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

/** Small green pill with the final total above the last point, clamped inside the chart area. */
const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.text) return;
    const meta = chart.getDatasetMeta(0);
    const last = meta?.data?.[meta.data.length - 1];
    if (!last || meta.hidden) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = `700 12px ${window.Chart.defaults.font.family}`;
    const w = ctx.measureText(opts.text).width + 14;
    const h = 20;
    const x = Math.min(Math.max(last.x - w + 6, chartArea.left), chartArea.right - w);
    const y = Math.max(last.y - h - 10, 2);
    ctx.fillStyle = opts.bg;
    ctx.strokeStyle = opts.fg;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = opts.textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.text, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  },
};

/** Month step of the growth-chart axis per selected term (1 month → weekly ticks). */
const GROWTH_TICK_STEP = { 3: 1, 6: 2, 9: 3, 12: 3, 18: 3, 24: 6 };

/**
 * Axis ticks on real dates: calendar-month anniversaries of the start date (the
 * same dates as the plotted samples), or every 7 days for a 1-month term. The last
 * tick is the maturity date; a day-based term is labelled with its day count.
 * Exported for tests.
 */
export function growthTicks(entry, maturityDays) {
  const o = entry.offer;
  const months = entry.match.months;
  const byMonths = entry.match.term_basis === 'months';
  // A day-based term is called «N сар» only when its maturity falls on the N-month anniversary.
  const onAnniversary = diffDays(o.startDate, addMonthsClamp(o.startDate, months)) === maturityDays;
  const endLabel = byMonths || onAnniversary ? `${months} сар` : `${maturityDays} хоног`;
  const ticks = [{ days: 0, label: 'Эхлэл' }];
  const step = GROWTH_TICK_STEP[months];
  if (step) {
    for (let k = step; k < months; k += step) {
      const d = diffDays(o.startDate, addMonthsClamp(o.startDate, k));
      if (d > 0 && d < maturityDays) ticks.push({ days: d, label: `${k} сар` });
    }
  } else {
    for (let d = 7; d < maturityDays - 3; d += 7) ticks.push({ days: d, label: `${d} хоног` });
  }
  ticks.push({ days: maturityDays, label: endLabel });
  return ticks;
}

export function showLoading(boxes) {
  boxes.forEach((box) => setBoxMessage(box, 'Ачаалж байна…', 'Өгөгдлийг уншиж байна.'));
}

export function showError(boxes, message) {
  boxes.forEach((box) => setBoxMessage(box, 'Өгөгдөл ачаалж чадсангүй', message));
}
