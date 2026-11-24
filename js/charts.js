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

export const NOT_AVAILABLE_TEXT = 'Chart.js (vendor/chartjs-4.4.1) ачаалагдсангүй. Хүснэгт ба тооцооны мэдээлэл хэвээр ажиллана.';

// ---------------------------------------------------------------- 1. ranking bars

/** Draws each bar's signed value with ▲/▼ so the sign is not shown by colour only. */
const valueLabelPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart, _args, opts) {
    const items = opts?.items;
    if (!items) return;
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    ctx.save();
    ctx.font = `600 12px ${window.Chart.defaults.font.family}`;
    ctx.textBaseline = 'middle';
    const area = chart.chartArea;
    meta.data.forEach((bar, i) => {
      const it = items[i];
      if (!it) return;
      const arrow = it.sign === 'positive' ? '▲ ' : it.sign === 'negative' ? '▼ ' : '';
      const text = arrow + it.display;
      const w = ctx.measureText(text).width;
      const negative = it.realReturnPercent < 0;
      const colour = negative ? opts.negative : it.sign === 'positive' ? opts.positive : opts.muted;
      // Outside the bar end when it fits inside the plot area, otherwise inside the bar.
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

export function renderRankingChart({ box, canvas, caption }, items, { onSelect, demo }) {
  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  if (items.length === 0) {
    destroy('ranking');
    setBoxMessage(box, 'Эрэмбэлэх санал алга', 'Энэ нөхцөлд шаардлага хангасан банк алга — хуурамч ялагч харуулахгүй.');
    canvas.setAttribute('aria-label', 'Бодит өгөөжийн эрэмбийн график: эрэмбэлэх санал алга.');
    caption.textContent = '';
    return;
  }
  setBoxMessage(box, null);
  applyDefaults();
  box.style.height = `${Math.max(200, items.length * 44 + 56)}px`;

  const positive = token('--positive', '#5EEAD4');
  const negative = token('--negative', '#FB7185');
  const muted = token('--muted', '#94A3B8');
  const teal = token('--teal', '#2DD4BF');
  const text = token('--text', '#F8FAFC');
  const tealDark = token('--teal-dark', '#0F766E');
  // Horizontal gradient along each bar (dark teal → teal → light teal for gains; red for losses).
  const fill = (ctx) => {
    const it = items[ctx.dataIndex];
    if (!it) return muted;
    const area = ctx.chart.chartArea;
    if (!area || it.sign === 'zero' || (it.sign !== 'positive' && it.sign !== 'negative')) return muted;
    const g = ctx.chart.ctx.createLinearGradient(area.left, 0, area.right, 0);
    if (it.sign === 'positive') {
      g.addColorStop(0, tealDark); g.addColorStop(0.55, teal); g.addColorStop(1, positive);
    } else {
      g.addColorStop(0, negative); g.addColorStop(1, '#9F1239');
    }
    return g;
  };
  const values = items.map((it) => it.realReturnPercent);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = (max - min || 1) * 0.28;

  upsert('ranking', canvas, {
    type: 'bar',
    data: {
      labels: items.map((it) => `${it.label}${it.isSelected ? ' ●' : ''}`),
      datasets: [{
        label: 'Бодит өгөөж (хугацааны нийт), %',
        data: values,
        backgroundColor: fill,
        borderColor: items.map((it) => (it.isSelected ? text : it.isTop ? positive : 'transparent')),
        borderWidth: items.map((it) => (it.isSelected || it.isTop ? 2 : 0)),
        borderSkipped: false,
        borderRadius: 999,
        barPercentage: 0.62,
        categoryPercentage: 0.9,
      }],
    },
    options: {
      indexAxis: 'y',
      layout: { padding: { right: 8, left: 4 } },
      onClick: (_evt, elements) => { if (elements.length > 0) onSelect(items[elements[0].index].bankId); },
      onHover: (evt, elements) => { evt.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default'; },
      scales: {
        x: {
          min: min < 0 ? min - pad : 0,
          max: max > 0 ? max + pad : 0.5,
          title: { display: true, text: 'Хугацааны нийт бодит өгөөж, % (татвар, инфляцийн дараа)' },
          ticks: { callback: (v) => formatPercent(v, { signed: true, decimals: 1 }) },
          grid: { color: (c) => (c.tick.value === 0 ? 'rgba(148, 163, 184, 0.6)' : 'rgba(42, 59, 81, 0.35)') },
          border: { display: false },
        },
        y: {
          grid: { display: false },
          border: { display: false },
          ticks: {
            autoSkip: false,
            // Long bank names wrap onto two lines on narrow screens instead of being cut off.
            callback(value) {
              const label = this.getLabelForValue(value);
              if (box.clientWidth >= 400 || label.length <= 16) return label;
              const words = label.split(' ');
              const half = Math.ceil(words.length / 2);
              return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
            },
            color: (c) => (items[c.index]?.isSelected || items[c.index]?.isTop ? text : '#CBD5E1'),
            font: (c) => ({ size: 13, weight: items[c.index]?.isTop || items[c.index]?.isSelected ? '700' : '500' }),
          },
        },
      },
      plugins: {
        legend: { display: false },
        valueLabels: { items, positive, negative, muted, inside: token('--bg', '#0B1220') },
        tooltip: {
          callbacks: {
            title: (c) => `#${items[c[0].dataIndex].rank} ${items[c[0].dataIndex].label}`,
            label: (c) => `Бодит өгөөж: ${items[c.dataIndex].display}`,
            afterLabel: (c) => [
              items[c.dataIndex].isTop ? 'Хамгийн өндөр бодит өгөөж (#1)' : null,
              items[c.dataIndex].isSelected ? 'Сонгосон банк' : null,
              demo ? 'DEMO өгөгдөл' : null,
              'Дарж сонгоно уу',
            ].filter(Boolean),
          },
        },
      },
    },
    plugins: [valueLabelPlugin],
  });

  const summary = items.map((it) => `#${it.rank} ${it.label} ${it.display}`).join('; ');
  canvas.setAttribute('aria-label', `${demo ? 'DEMO. ' : ''}Бодит өгөөжийн эрэмбийн хэвтээ баганан график, ${items.length} банк: ${summary}.`);
  caption.textContent = 'Эрэмбийн дарааллаар. ▲ — бодит ашиг, ▼ — инфляцид алдагдал. Ногоон хүрээ — №1 банк, цагаан хүрээ ба ● — сонгосон банк. Баганыг дарж, эсвэл доорх хүснэгтийн «Сонгох» товчоор банкаа сонгоно.';
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

export function renderGrowthChart({ box, canvas, titleEl, legendEl, notesEl, tableEl }, entry, growth) {
  if (!entry) {
    destroy('growth');
    titleEl.textContent = 'Хадгаламжийн өсөлт';
    setBoxMessage(box, 'Сонгосон банк алга', 'Эрэмбэлэх санал гарвал сонгосон банкны өсөлт энд харагдана.');
    canvas.setAttribute('aria-label', 'Хадгаламжийн өсөлтийн график: сонгосон банк алга.');
    legendEl.replaceChildren(); notesEl.replaceChildren(); tableEl.replaceChildren();
    return;
  }
  titleEl.textContent = `Хадгаламжийн өсөлт (${entry.bank.name}, ${entry.match.months} сар)`;
  const o = entry.offer;
  const pts = growth.points;
  const periodic = growth.interimPayments > 0;

  const teal = token('--teal', '#2DD4BF');
  const blue = token('--blue', '#60A5FA');
  const muted = token('--muted', '#94A3B8');
  const violet = '#A78BFA';

  const legend = [
    { color: muted, dash: false, text: 'Үндсэн дүн (хадгаламжийн үлдэгдэл — хүү нэмэгдэхгүй)' },
    { color: teal, dash: true, text: 'Нийт нэрлэсэн орлого = үндсэн дүн + авсан хүү + хуримтлагдсан хүү (тасархай = загварчилсан, олгогдоогүй)' },
    { color: blue, dash: false, step: true, text: 'Авсан хүү, хуримтлагдсан (татварын дараа, баруун тэнхлэг) — бодит олголт' },
    { color: violet, dash: false, text: 'Өнөөгийн худалдан авах чадвар (инфляцид тохируулсан)' },
  ];
  legendEl.replaceChildren(...legend.map((l) => el('li', {},
    el('span', { class: `legend-line${l.dash ? ' legend-line--dash' : ''}${l.step ? ' legend-line--step' : ''}`, style: `--c:${l.color}`, 'aria-hidden': 'true' }),
    l.text)));

  notesEl.replaceChildren(...[
    periodic
      ? `Хүүг ${growth.interimPayments + 1} удаа (сар бүр) олгоно. Олгосон хүү хадгаламжид нэмэгдэхгүй, нийлмэл болохгүй — үндсэн дүн тогтмол хэвээр.`
      : 'Хүүг хугацааны эцэст нэг удаа олгоно. Түүнээс өмнөх өсөлт нь загварчилсан хуримтлал бөгөөд олгогдсон мөнгө биш.',
    growth.payoutAssumed && 'Хүү олгох хэлбэр тодорхойгүй — хугацааны эцэст олгоно гэж жишээ байдлаар загварчилсан.',
    growth.illustrative && 'Жишээ тооцоо (ACT/365): банкны тооцоолсон яг дүн биш.',
    '● цэг — хүү олгох огноо (бодит олголт). Хугацааны эцсийн утга нь дээрх самбарын «Нийт нэрлэсэн орлого», «Өнөөгийн худалдан авах чадвар»-тай тэнцэнэ.',
  ].filter(Boolean).map((t) => el('li', { text: t })));

  // Accessible data table (also the non-visual alternative to the chart).
  const shown = pts.length > 14 ? pts.filter((p, i) => p.isPayment || i === 0 || i % Math.ceil(pts.length / 12) === 0) : pts;
  tableEl.replaceChildren(el('table', { class: 'mini-table' },
    el('caption', { class: 'sr-only', text: `${entry.bank.name} — хадгаламжийн өсөлтийн өгөгдөл` }),
    el('thead', {}, el('tr', {}, ['Огноо', 'Үндсэн дүн', 'Авсан хүү', 'Хуримтлагдсан (загвар)', 'Нийт нэрлэсэн', 'Худалдан авах чадвар']
      .map((h, i) => el('th', { scope: 'col', class: i > 0 ? 'num' : '', text: h })))),
    el('tbody', {}, shown.map((p) => el('tr', {},
      el('td', { text: `${formatDateMN(p.date)}${p.isPayment ? ' ●' : ''}` }),
      el('td', { class: 'num', text: formatMNT(p.principal) }),
      el('td', { class: 'num', text: formatMNT(p.paidCumulative) }),
      el('td', { class: 'num', text: formatMNT(p.accruedUnpaid) }),
      el('td', { class: 'num', text: formatMNT(p.nominal) }),
      el('td', { class: 'num', text: formatMNT(p.purchasingPower) }))))));

  canvas.setAttribute('aria-label',
    `${entry.flags.demo ? 'DEMO. ' : ''}${entry.bank.name}, ${entry.match.months} сар: үндсэн дүн ${formatMNT(o.principal)} тогтмол; `
    + `нийт нэрлэсэн орлого ${formatMNT(growth.final.nominal)} хүртэл; авсан хүү ${formatMNT(growth.final.paidCumulative)}; `
    + `өнөөгийн худалдан авах чадвар ${formatMNT(growth.final.purchasingPower)}.`);

  if (!chartsAvailable()) { setBoxMessage(box, 'График ачаалагдсангүй', NOT_AVAILABLE_TEXT); return; }
  setBoxMessage(box, null);
  applyDefaults();

  const xy = (key) => pts.map((p) => ({ x: p.days, y: p[key] }));
  // Narrow screens: axis ticks in millions (tick labels only; values and tooltips stay whole ₮).
  const narrow = box.clientWidth < 520;
  const axisMNT = (v) => (narrow ? `${(v / 1e6).toFixed(Math.abs(v) < 1e7 ? 2 : 1)} сая` : formatMNT(v));
  const paymentRadius = pts.map((p) => (p.isPayment ? 4 : 0));
  const dateAt = (days) => formatDateMN(addDays(o.startDate, days));

  upsert('growth', canvas, {
    type: 'line',
    data: {
      datasets: [
        { label: 'Үндсэн дүн', data: xy('principal'), borderColor: muted, backgroundColor: muted, borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
        {
          label: 'Нийт нэрлэсэн орлого', data: xy('nominal'), borderColor: teal, borderWidth: 2.5,
          // Soft area under the line (visual only); dashed: between payment dates the value includes modelled accrual.
          fill: 'start',
          backgroundColor: (ctx) => {
            const area = ctx.chart.chartArea;
            if (!area) return 'rgba(45, 212, 191, 0.12)';
            const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
            g.addColorStop(0, 'rgba(45, 212, 191, 0.30)');
            g.addColorStop(1, 'rgba(45, 212, 191, 0.02)');
            return g;
          },
          pointBackgroundColor: teal, pointBorderColor: token('--bg', '#0B1220'), pointBorderWidth: 1.5,
          pointRadius: paymentRadius, pointHoverRadius: 6, yAxisID: 'y', borderDash: [6, 4],
        },
        {
          label: 'Авсан хүү (хуримтлагдсан)', data: xy('paidCumulative'), borderColor: blue, backgroundColor: blue, borderWidth: 2,
          stepped: 'before', pointRadius: paymentRadius, pointHoverRadius: 6, yAxisID: 'y2',
        },
        { label: 'Өнөөгийн худалдан авах чадвар', data: xy('purchasingPower'), borderColor: violet, backgroundColor: violet, borderWidth: 2, pointRadius: 0, yAxisID: 'y' },
      ],
    },
    options: {
      parsing: true,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'linear',
          min: 0,
          max: pts[pts.length - 1].days,
          title: { display: !narrow, text: `Огноо (эхлэх ${formatDateMN(o.startDate)} → дуусах ${formatDateMN(o.maturityDate)}, ${o.eligibleDays} хоног)` },
          ticks: { maxTicksLimit: narrow ? 4 : 7, maxRotation: 0, callback: (v) => dateAt(v) },
          grid: { display: false },
        },
        y: {
          position: 'left',
          title: { display: !narrow, text: 'Үндсэн дүн ба орлого, ₮' },
          ticks: { callback: axisMNT },
        },
        y2: {
          position: 'right',
          beginAtZero: true,
          title: { display: !narrow, text: 'Авсан хүү, ₮', color: blue },
          ticks: { color: blue, callback: axisMNT },
          grid: { drawOnChartArea: false },
        },
      },
      layout: { padding: { top: 30 } },
      plugins: {
        legend: { display: false },
        endLabel: { text: formatMNT(growth.final.nominal), bg: teal, fg: token('--bg', '#0B1220') },
        tooltip: {
          callbacks: {
            title: (items) => dateAt(items[0].parsed.x),
            label: (c) => `${c.dataset.label}: ${formatMNT(c.parsed.y)}`,
            footer: (items) => {
              const p = pts[items[0].dataIndex];
              if (!p) return '';
              if (p.isMaturity) return 'Хугацааны эцэс: үндсэн дүн ба эцсийн хүү олгоно';
              if (p.isPayment) return 'Хүү олгох огноо (бодит олголт)';
              return p.modelled ? 'Загварчилсан хуримтлал — олгогдоогүй' : '';
            },
          },
        },
      },
    },
    plugins: [endLabelPlugin],
  });
}

/** Callout pill with the final total nominal proceeds above the last point (dataset 1). */
const endLabelPlugin = {
  id: 'endLabel',
  afterDatasetsDraw(chart, _args, opts) {
    if (!opts?.text) return;
    const meta = chart.getDatasetMeta(1);
    const last = meta?.data?.[meta.data.length - 1];
    if (!last || meta.hidden) return;
    const { ctx, chartArea } = chart;
    ctx.save();
    ctx.font = `700 12px ${window.Chart.defaults.font.family}`;
    const w = ctx.measureText(opts.text).width + 16;
    const h = 22;
    const x = Math.min(Math.max(last.x - w / 2, chartArea.left), chartArea.right - w);
    const y = Math.max(last.y - h - 10, 2);
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.fillStyle = opts.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.text, x + w / 2, y + h / 2 + 0.5);
    ctx.restore();
  },
};

export function showLoading(boxes) {
  boxes.forEach((box) => setBoxMessage(box, 'Ачаалж байна…', 'Өгөгдлийг уншиж байна.'));
}

export function showError(boxes, message) {
  boxes.forEach((box) => setBoxMessage(box, 'Өгөгдөл ачаалж чадсангүй', message));
}
