// App wiring: state, input handling and re-render. Calculation lives in
// calc.js/ranking.js, rendering in ui.js.

import { AMOUNT_SLIDER, DATA_URL, DEFAULTS, INFLATION_SLIDER, TERM_CHIPS } from './config.js';
import { isValidInflation } from './calc.js';
import { formatDateMN, parseISODate, resolveStartDate, todayISO } from './dates.js';
import { formatMNT, parseAmountInput, parsePercentInput } from './format.js';
import { loadDataset } from './data.js';
import { evaluateDataset, resolveSelection } from './ranking.js';
import {
  el, renderDemoBanner, renderFeatured, renderHeader, renderMatrix, renderMethodology, renderNonRanked, renderRanking,
} from './ui.js';
import {
  defaultCurveBanks, prepareGrowthSeries, prepareRankingChart, prepareRateMatrix, prepareTermCurve,
} from './chartdata.js';
import {
  renderGrowthChart, renderRankingChart, renderTermCurve, showError, showLoading,
} from './charts.js';
import { csvFileName, downloadCSV, matrixCSV, rankingCSV } from './csvexport.js';

const $ = (id) => document.getElementById(id);

const chartBoxes = () => [$('ranking-chart-box'), $('curve-chart-box'), $('growth-chart-box')];

/** Visual only: teal fill of a range track up to the thumb (CSS var --fill). */
function syncRangeFill(slider) {
  const min = Number(slider.min);
  const max = Number(slider.max);
  const v = Number(slider.value);
  const pct = max > min ? ((v - min) / (max - min)) * 100 : 0;
  slider.style.setProperty('--fill', `${Math.min(100, Math.max(0, pct))}%`);
}

/** Visual only: place the ₮ sign right after the typed amount, as in the approved mock-up. */
const measureCtx = document.createElement('canvas').getContext('2d');
function syncAmountUnit() {
  const input = $('amount-input');
  const unit = $('amount-unit');
  const cs = getComputedStyle(input);
  measureCtx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const textW = measureCtx.measureText(input.value).width;
  const left = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + textW + 8;
  unit.hidden = input.value.trim() === '';
  unit.style.left = `${Math.min(left, input.offsetWidth - 64)}px`;
}

const state = {
  dataset: null,
  principal: DEFAULTS.principal,
  principalValid: true,
  months: DEFAULTS.months,
  inflationPercent: 0,
  startDateISO: todayISO(),
  selectedBankId: null,
  curveBankIds: null, // null = default (top 5 of the current ranking); array once the user toggles
  matrix: null,
};

// ---------------------------------------------------------------- render

function render() {
  if (!state.dataset) return;
  const today = parseISODate(todayISO());
  const start = resolveStartDate(state.startDateISO).date;
  const inputs = {
    principal: state.principalValid ? state.principal : 0,
    months: state.months,
    startDate: start,
    inflation: state.inflationPercent / 100,
    today,
  };
  const result = evaluateDataset(state.dataset, inputs);
  state.selectedBankId = resolveSelection(state.selectedBankId, result.ranked);
  const selected = result.ranked.find((e) => e.bank.id === state.selectedBankId) ?? null;

  const select = (bankId, { focus = true } = {}) => {
    state.selectedBankId = bankId;
    render();
    if (focus) $('featured').focus({ preventScroll: false });
  };

  syncRangeFill($('amount-slider'));
  syncRangeFill($('inflation-slider'));
  syncAmountUnit();
  $('bars-title').textContent = `Банкнуудын бодит өгөөж (${state.months} сар)`;
  $('bars-demo').hidden = result.mode !== 'demo';

  renderFeatured($('featured'), selected, state);
  // Phase 4A: the export uses exactly this evaluated result (what is on screen).
  const exportRanking = () => downloadCSV(
    csvFileName('ranking', { mode: result.mode, months: inputs.months, today }),
    rankingCSV(result, inputs),
  );
  renderRanking({ head: $('ranking-head'), body: $('ranking') }, result, state, select, { onExport: exportRanking });
  renderRankingChart(
    { box: $('ranking-chart-box'), canvas: $('ranking-chart'), caption: $('ranking-chart-caption') },
    prepareRankingChart(result, state.selectedBankId),
    { onSelect: select, demo: result.mode === 'demo' },
  );
  renderNonRanked($('nonranked'), result);

  // Term curve: same eligibility engine at every chip; never interpolated.
  const curve = prepareTermCurve(state.dataset, inputs);
  const available = new Set(curve.series.map((s) => s.bankId));
  const visibleIds = state.curveBankIds
    ? state.curveBankIds.filter((id) => available.has(id))
    : defaultCurveBanks(curve, result.ranked.map((e) => e.bank.id));
  renderTermCurve(
    { box: $('curve-chart-box'), canvas: $('curve-chart'), togglesEl: $('curve-toggles'), notesEl: $('curve-notes') },
    curve, visibleIds,
    {
      onToggle: (bankId, checked) => {
        const current = new Set(visibleIds);
        if (checked) current.add(bankId); else current.delete(bankId);
        state.curveBankIds = curve.series.map((s) => s.bankId).filter((id) => current.has(id));
        render();
        document.getElementById(`curve-toggle-${bankId}`)?.focus();
      },
      onReset: () => { state.curveBankIds = null; render(); },
    },
  );

  renderGrowthChart(
    {
      box: $('growth-chart-box'), canvas: $('growth-chart'), titleEl: $('growth-title'),
      legendEl: $('growth-legend'), notesEl: $('growth-notes'), tableEl: $('growth-table'),
    },
    selected, selected ? prepareGrowthSeries(selected) : null,
  );

  if (state.matrix && state.matrixMonths !== state.months) {
    renderMatrix($('matrix'), state.matrix, state, { onExport: exportMatrix });
    state.matrixMonths = state.months;
  }
}

function exportMatrix() {
  const today = parseISODate(todayISO());
  downloadCSV(csvFileName('matrix', { mode: state.matrix.mode, today }), matrixCSV(state.matrix, today));
}

// ---------------------------------------------------------------- amount

function setupAmount() {
  const input = $('amount-input');
  const slider = $('amount-slider');
  Object.assign(slider, { min: AMOUNT_SLIDER.min, max: AMOUNT_SLIDER.max, step: AMOUNT_SLIDER.step });
  $('amount-min-label').textContent = formatMNT(AMOUNT_SLIDER.min);
  $('amount-max-label').textContent = formatMNT(AMOUNT_SLIDER.max);

  const syncHint = () => {
    const hint = $('amount-hint');
    const over = state.principalValid && state.principal > AMOUNT_SLIDER.max;
    hint.hidden = !over;
    hint.textContent = over ? 'Гулсагчийн дээд хязгаараас их дүн — оруулсан дүнгээр тооцоолж байна.' : '';
  };
  const showError = (msg) => {
    $('amount-error').hidden = !msg;
    $('amount-error').textContent = msg ?? '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  input.value = formatMNT(state.principal).replace(' ₮', '');
  slider.value = String(Math.min(state.principal, AMOUNT_SLIDER.max));
  syncRangeFill(slider);
  syncHint();

  input.addEventListener('input', () => {
    const { value, error } = parseAmountInput(input.value);
    if (error) {
      state.principalValid = false;
      showError(error === 'empty' ? 'Хадгаламжийн дүнгээ оруулна уу.' : 'Зөвхөн эерэг бүхэл тоо (төгрөг) оруулна уу.');
    } else {
      state.principal = value;
      state.principalValid = value > 0;
      showError(value > 0 ? null : 'Дүн 0-ээс их байх ёстой.');
      slider.value = String(Math.min(value, AMOUNT_SLIDER.max)); // thumb caps; typed value kept
    }
    syncHint();
    render();
  });
  input.addEventListener('blur', () => {
    if (state.principalValid) input.value = formatMNT(state.principal).replace(' ₮', '');
    syncAmountUnit();
  });
  input.addEventListener('input', syncAmountUnit); // also while the value is invalid (render skips)
  window.addEventListener('resize', syncAmountUnit);
  document.fonts?.ready.then(syncAmountUnit);
  syncAmountUnit();
  slider.addEventListener('input', () => {
    state.principal = Number(slider.value);
    state.principalValid = state.principal > 0;
    input.value = formatMNT(state.principal).replace(' ₮', '');
    showError(state.principalValid ? null : 'Дүн 0-ээс их байх ёстой.');
    syncHint();
    render();
  });
}

// ---------------------------------------------------------------- term chips

function setupTerms() {
  const group = $('term-chips');
  const chips = TERM_CHIPS.map((m) => el('button', {
    type: 'button', class: 'chip', 'aria-pressed': m === state.months ? 'true' : 'false',
    onclick: () => {
      state.months = m;
      chips.forEach((c, i) => c.setAttribute('aria-pressed', TERM_CHIPS[i] === m ? 'true' : 'false'));
      render();
    },
  }, `${m} сар`));
  group.replaceChildren(...chips);
}

// ---------------------------------------------------------------- inflation

function setupInflation(dataset) {
  const slider = $('inflation-slider');
  const input = $('inflation-input');
  Object.assign(slider, { min: INFLATION_SLIDER.min, max: INFLATION_SLIDER.max, step: INFLATION_SLIDER.step });
  $('inflation-min-label').textContent = `${INFLATION_SLIDER.min}%`.replace('-', '−');
  $('inflation-max-label').textContent = `${INFLATION_SLIDER.max}%`;
  // Place the 0% tick at its true position on the configurable range (visual only).
  const zeroPct = ((0 - INFLATION_SLIDER.min) / (INFLATION_SLIDER.max - INFLATION_SLIDER.min)) * 100;
  $('inflation-zero-label').style.left = `${zeroPct}%`;
  $('inflation-zero-label').hidden = !(zeroPct > 0 && zeroPct < 100);

  const infl = dataset.inflation ?? {};
  const defaultPct = Number.isFinite(infl.annual_percent) ? infl.annual_percent : 0;
  state.inflationPercent = defaultPct;
  $('inflation-note').textContent = infl.kind === 'historical_observed'
    ? `Анхдагч утга: ${defaultPct}% — ҮСХ, ${infl.observed_period ?? ''}. Түүхэн ажиглалт, ирээдүйн таамаглал биш.`
    : `Анхдагч утга: ${defaultPct}% — жишээ сценари, ҮСХ-ны албан CPI биш.`;

  const sync = () => {
    const v = state.inflationPercent;
    $('inflation-deflation').hidden = !(v < 0);
    const outside = v < INFLATION_SLIDER.min || v > INFLATION_SLIDER.max;
    $('inflation-hint').hidden = !outside;
    $('inflation-hint').textContent = outside ? 'Гулсагчийн хүрээнээс гадуурх гараар оруулсан сценари.' : '';
  };
  const showError = (msg) => {
    $('inflation-error').hidden = !msg;
    $('inflation-error').textContent = msg ?? '';
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  };

  slider.value = String(defaultPct);
  input.value = String(defaultPct);
  sync();

  slider.addEventListener('input', () => {
    state.inflationPercent = Number(slider.value);
    input.value = slider.value;
    showError(null);
    sync();
    render();
  });
  input.addEventListener('input', () => {
    const { value, error } = parsePercentInput(input.value);
    if (error || !isValidInflation(value / 100)) {
      showError('−100%-аас их бодит тоо оруулна уу. Өмнөх хүчинтэй утгаар тооцоолж байна.');
      return; // never clamp silently; keep last valid value
    }
    showError(null);
    state.inflationPercent = value;
    slider.value = String(Math.min(Math.max(value, INFLATION_SLIDER.min), INFLATION_SLIDER.max));
    sync();
    render();
  });
}

// ---------------------------------------------------------------- start date (D4)

function setupStartDate() {
  const input = $('start-date');
  const note = $('start-date-note');
  const summary = $('advanced-summary');
  input.value = state.startDateISO;

  const apply = (value) => {
    const { date, fallback } = resolveStartDate(value);
    state.startDateISO = fallback ? todayISO() : value;
    note.hidden = !fallback;
    note.textContent = fallback ? 'Огноо хоосон эсвэл буруу тул өнөөдрийн огноогоор тооцоолж байна.' : '';
    const isToday = state.startDateISO === todayISO();
    summary.textContent = isToday ? '' : `· эхлэх огноо ${formatDateMN(date)}`;
    render();
  };

  input.addEventListener('change', () => apply(input.value));
  $('start-date-today').addEventListener('click', () => {
    input.value = todayISO();
    apply(input.value);
  });
}

// ---------------------------------------------------------------- boot

async function init() {
  setupTerms();
  setupAmount();
  setupStartDate();
  showLoading(chartBoxes());
  try {
    const dataset = await loadDataset(DATA_URL);
    state.dataset = dataset;
    state.matrix = prepareRateMatrix(dataset);
    setupInflation(dataset);
    renderHeader($('header-meta'), dataset);
    renderDemoBanner($('demo-banner'), dataset);
    renderMethodology($('methodology'), dataset);
    render();
  } catch (err) {
    const box = $('load-error');
    box.hidden = false;
    box.textContent = err.message;
    const failed = (title) => el('div', { class: 'empty-state', role: 'alert' },
      el('strong', { text: 'Өгөгдөл ачаалж чадсангүй' }), `${title}: ${err.message}`);
    $('featured').replaceChildren(el('h2', { id: 'featured-title', class: 'panel__title', text: 'Сонгосон банк' }), failed('Тооцоо'));
    $('matrix').replaceChildren(el('h2', { id: 'matrix-title', text: 'Хүүгийн бүрэн хүснэгт · 1–24 сар' }), failed('Хүснэгт'));
    showError(chartBoxes(), err.message);
  }
}

init();
