// D18 — Google Sheets research table: loading (live → local fallback), structural checks and
// per-cell source evidence. Pure parsing/checking plus fetch; no DOM access.
// The 13 checks are the same as the week 4 experiment (experiments/week4.js).

import { parseCSV, parserSelfTest } from './csv.js';

export const SHEETS_COLUMNS = Object.freeze(['bank_id', 'bank', 'channel', 'm3', 'm6', 'm12', 'm24', 'source', 'checked', 'note', 'net12']);
export const SHEETS_RATE_COLUMNS = Object.freeze(['m3', 'm6', 'm12', 'm24']);
export const SHEETS_TERMS = Object.freeze(SHEETS_RATE_COLUMNS.map((c) => Number(c.slice(1))));
// Expected shape of the published `clean` sheet (week 4 task): 12 × 4 = 48 rate cells.
export const SHEETS_EXPECTED = Object.freeze({ banks: 12, rateCells: 48, numeric: 46, empty: 2 });
export const NUMBER_RE = /^-?\d+(\.\d+)?$/;

/** A rate cell as a number, or null when empty / not a number (never 0 for a gap). */
export function rateValue(text) {
  const v = (text ?? '').trim();
  return v !== '' && NUMBER_RE.test(v) && Number.isFinite(Number(v)) ? Number(v) : null;
}

/** Parses CSV text into trimmed records keyed by header (empty fields stay ''). */
export function recordsFromText(text) {
  const { head, rows, quotedFields } = parseCSV(text);
  const records = rows.map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
  return { head, rows, records, quotedFields };
}

/**
 * Structural and value checks; each item is { name, pass, detail } with pass true / false /
 * null (null = could not be verified, never counted as PASS). Nothing is coerced.
 */
export function checkSheetsTable({ head, rows, records, quotedFields }, expected = SHEETS_EXPECTED) {
  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  const selfTest = parserSelfTest();
  add('CSV parser өөрийн тест (хашилт, таслал, "", CRLF, хоосон)', selfTest.length === 0,
    selfTest.length ? `унасан: ${selfTest.join(', ')}` : '5/5 тохиолдол зөв');
  add('11 багана, нэр ба дараалал (net12 орсон)', JSON.stringify(head) === JSON.stringify(SHEETS_COLUMNS),
    `олдсон ${head.length}: ${head.join(', ')}`);
  const badWidth = rows.map((r, i) => [i + 2, r.length]).filter(([, n]) => n !== head.length);
  add('Мөр бүр баганын тоотой ижил талбартай', badWidth.length === 0,
    badWidth.length ? `зөрсөн мөр: ${badWidth.map(([l, n]) => `${l}-р мөр (${n})`).join(', ')}` : `${rows.length} мөр × ${head.length}`);
  add(`${expected.banks} банкны мөр`, records.length === expected.banks, `${records.length} мөр`);
  const ids = records.map((r) => r.bank_id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  add('bank_id давхардалгүй, хоосон биш', dup.length === 0 && ids.every(Boolean), dup.length ? `давхардсан: ${dup.join(', ')}` : 'бүгд өвөрмөц');

  let numeric = 0;
  const empty = [];
  const invalid = [];
  for (const rec of records) {
    for (const c of SHEETS_RATE_COLUMNS) {
      const v = rec[c] ?? '';
      if (v === '') empty.push(`${rec.bank_id}.${c}`);
      else if (rateValue(v) != null) numeric += 1;
      else invalid.push(`${rec.bank_id}.${c}="${v}"`);
    }
  }
  const cells = records.length * SHEETS_RATE_COLUMNS.length;
  add(`${expected.rateCells} хүүгийн нүд`, cells === expected.rateCells, `${cells} нүд`);
  add(`${expected.numeric} тоон утга`, numeric === expected.numeric, `${numeric} тоон`);
  add(`${expected.empty} хоосон утга (0 болгоогүй)`, empty.length === expected.empty, `${empty.length} хоосон: ${empty.join(', ') || '—'}`);
  add('Тоон бус / буруу хүүгийн утга байхгүй', invalid.length === 0, invalid.length ? invalid.join(', ') : '0');

  const hasNet = head.includes('net12');
  const netBad = records.filter((r) => !NUMBER_RE.test(r.net12 ?? '')).map((r) => r.bank_id);
  add('net12: 12 банк бүгд тоон утгатай', !hasNet ? false : netBad.length === 0,
    !hasNet ? 'net12 багана алга' : netBad.length ? `тоон бус/хоосон: ${netBad.join(', ')}` : `${records.length} тоон утга`);

  const commaNotes = records.filter((r) => (r.note || '').includes(',')).length;
  add('Таслалтай note зөв задарсан', commaNotes === 0 ? null : badWidth.length === 0 && quotedFields >= commaNotes,
    `хашилттай талбар ${quotedFields}, таслалтай note ${commaNotes}`);
  const badDates = records.filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.checked || '')).map((r) => r.bank_id);
  add('checked = YYYY-MM-DD', badDates.length === 0, badDates.length ? `буруу: ${badDates.join(', ')}` : 'бүгд зөв');
  const badSrc = records.filter((r) => !/^https:\/\//.test(r.source || '')).map((r) => r.bank_id);
  add('source = https холбоос', badSrc.length === 0, badSrc.length ? `буруу: ${badSrc.join(', ')}` : 'бүгд https');

  const completeness = cells > 0 ? numeric / cells : NaN;
  return { checks, numeric, empty, invalid, cells, completeness, duplicates: dup };
}

/** Only Google Sheets "publish to web" CSV links are accepted as the live source. */
export function isSheetsCsvUrl(candidate) {
  let parsed;
  try { parsed = new URL(candidate); } catch { return false; }
  return parsed.protocol === 'https:' && parsed.hostname === 'docs.google.com'
    && parsed.pathname.includes('/pub') && parsed.searchParams.get('output') === 'csv';
}

async function fetchText(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * Live Google Sheets first; on any failure (network, HTTP, invalid link, wrong header) the
 * local `data/clean/rates_clean.csv`. Returns which one was used — never mixed.
 * Throws only when both fail.
 */
export async function loadSheetsData({ sheetsUrl, fallbackUrl, fetchImpl = fetch }) {
  let liveError = null;
  if (sheetsUrl && isSheetsCsvUrl(sheetsUrl)) {
    try {
      const parsed = recordsFromText(await fetchText(sheetsUrl, fetchImpl));
      if (JSON.stringify(parsed.head) !== JSON.stringify(SHEETS_COLUMNS)) {
        throw new Error(`баганын бүтэц өөр (${parsed.head.length} багана)`);
      }
      return { source: 'live', url: sheetsUrl, error: null, ...parsed, ...checkSheetsTable(parsed) };
    } catch (e) {
      liveError = e.message || String(e);
    }
  } else {
    liveError = sheetsUrl ? 'Google Sheets холбоос буруу хэлбэртэй (…/pub?…&output=csv)' : 'Google Sheets холбоос тохируулаагүй';
  }
  let text;
  try {
    text = await fetchText(fallbackUrl, fetchImpl);
  } catch (e) {
    throw new Error(`Google Sheets (${liveError}) болон локал нөөц файл (${fallbackUrl}: ${e.message}) хоёулаа ачаалагдсангүй.`);
  }
  const parsed = recordsFromText(text);
  return { source: 'fallback', url: fallbackUrl, error: liveError, ...parsed, ...checkSheetsTable(parsed) };
}

/**
 * Source evidence per cell from data/clean/source_check.csv (written by src/clean_rates.py).
 * An entry applies only when its recorded value equals the value now loaded; otherwise the
 * cell is NOT VERIFIED («snapshot-оос өөр»). Missing file → every numeric cell NOT VERIFIED.
 */
export function evidenceFor(records, sourceCheckRecords) {
  const byKey = new Map((sourceCheckRecords ?? []).map((r) => [`${r.bank_id}.${r.term}`, r]));
  const cells = [];
  for (const rec of records) {
    for (const term of SHEETS_RATE_COLUMNS) {
      const value = rateValue(rec[term]);
      const row = byKey.get(`${rec.bank_id}.${term}`);
      let result;
      let note;
      if (value == null) {
        result = 'EMPTY';
        note = 'хоосон нүд — шалгах утга алга';
      } else if (!row) {
        result = 'NOT VERIFIED';
        note = 'source_check.csv-д бүртгэл алга';
      } else if (rateValue(row.v2_rate_percent) !== value) {
        result = 'NOT VERIFIED';
        note = `ачаалсан утга (${value}) snapshot-ийн утгаас (${row.v2_rate_percent || 'хоосон'}) өөр — дахин тулгаагүй`;
      } else {
        result = row.result;
        note = row.evidence;
      }
      cells.push({ bankId: rec.bank_id, term, months: Number(term.slice(1)), value, result, note });
    }
  }
  return cells;
}

export function evidenceCounts(cells) {
  const counts = { PASS: 0, PARTIAL: 0, 'NOT VERIFIED': 0, EMPTY: 0 };
  cells.forEach((c) => { counts[c.result] = (counts[c.result] ?? 0) + 1; });
  return counts;
}

/** Optional CSV (source evidence): returns records, or null when it cannot be read. */
export async function loadOptionalCSV(url, fetchImpl = fetch) {
  try {
    return recordsFromText(await fetchText(url, fetchImpl)).records;
  } catch {
    return null;
  }
}
