// Display rounding and Mongolian formatting (D10). Rounding is applied only
// here, for display; calculation modules never round.

const MINUS = '−';

/**
 * Half-up rounding to an integer, sign-symmetric (half away from zero):
 * 2.5 → 3, −2.5 → −3. Works on the exact binary value, so a number such as
 * 0.49999999999999994 (just below one half) rounds down.
 */
export function roundHalfAwayFromZero(x) {
  if (!Number.isFinite(x)) return NaN;
  const a = Math.abs(x);
  let r = Math.floor(a);
  if (a - r >= 0.5) r += 1; // a - floor(a) is exact for doubles
  const result = x < 0 ? -r : r;
  return result === 0 ? 0 : result; // avoid −0
}

function groupThousands(nonNegativeInteger) {
  return String(nonNegativeInteger).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 22000000 → "22,000,000 ₮"; losses use a true minus sign. */
export function formatMNT(value, { signed = false } = {}) {
  const r = roundHalfAwayFromZero(value);
  if (Number.isNaN(r)) return '—';
  const sign = r < 0 ? MINUS : signed && r > 0 ? '+' : '';
  return `${sign}${groupThousands(Math.abs(r))} ₮`;
}

/** Formats a fraction (0.0123) as a percentage string ("1.23%"). */
export function formatPercentFromFraction(fraction, { signed = false, decimals = 2 } = {}) {
  if (!Number.isFinite(fraction)) return '—';
  return formatScaledPercent(fraction, 10 ** (decimals + 2), decimals, signed);
}

/** Formats a value already in percent (12.4) as "12.40%". */
export function formatPercent(percent, { signed = false, decimals = 2 } = {}) {
  if (!Number.isFinite(percent)) return '—';
  return formatScaledPercent(percent, 10 ** decimals, decimals, signed);
}

function formatScaledPercent(source, scaleBy, decimals, signed) {
  // A single multiplication before rounding keeps boundary cases predictable.
  const units = roundHalfAwayFromZero(source * scaleBy);
  const sign = units < 0 ? MINUS : signed && units > 0 ? '+' : '';
  const abs = Math.abs(units);
  const intPart = Math.floor(abs / 10 ** decimals);
  const frac = String(abs % 10 ** decimals).padStart(decimals, '0');
  return decimals > 0 ? `${sign}${intPart}.${frac}%` : `${sign}${intPart}%`;
}

/** Parses a typed MNT amount ("22,000,000", "22 000 000 ₮"). Whole tugriks only. */
export function parseAmountInput(text) {
  const cleaned = String(text ?? '').replace(/[\s,₮]/g, '');
  if (cleaned === '') return { value: null, error: 'empty' };
  if (!/^\d+$/.test(cleaned)) return { value: null, error: 'invalid' };
  const value = Number(cleaned);
  if (!Number.isSafeInteger(value)) return { value: null, error: 'invalid' };
  return { value, error: null };
}

/** Parses a typed percentage; accepts comma decimals and a true minus sign. */
export function parsePercentInput(text) {
  const cleaned = String(text ?? '').trim().replace(MINUS, '-').replace(',', '.').replace('%', '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return { value: null, error: 'invalid' };
  return { value: Number(cleaned), error: null };
}
