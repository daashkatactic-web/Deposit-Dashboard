// RFC 4180 CSV parser for the week 4 experiment (no dependencies).
// Handles quoted fields with commas, escaped quotes (""), line breaks inside quotes,
// CRLF / LF line endings, a UTF-8 BOM and a trailing newline. Empty fields stay ''.

/**
 * @param {string} text
 * @returns {{ head: string[], rows: string[][], quotedFields: number }}
 */
export function parseCSV(text) {
  const src = text.replace(/^﻿/, '');
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let quotedFields = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      inQuotes = true;
      quotedFields += 1;
    } else if (ch === ',') {
      row.push(field); field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      records.push(row); row = [];
    } else field += ch;
  }
  if (inQuotes) throw new Error('CSV: хаагаагүй хашилт (")');
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ''));
  const [head = [], ...rows] = nonEmpty;
  return { head: head.map((h) => h.trim()), rows, quotedFields };
}

/** Small self-test run by the page; returns a list of failed case names. */
export function parserSelfTest() {
  const cases = [
    ['хашилт доторх таслал', 'a,b\n1,"x, y"\n', [['1', 'x, y']]],
    ['давхар хашилт ("")', 'a,b\n1,"say ""hi"""\n', [['1', 'say "hi"']]],
    ['CRLF ба BOM', '﻿a,b\r\n1,2\r\n', [['1', '2']]],
    ['хоосон талбар хоосон хэвээр', 'a,b,c\n1,,3\n', [['1', '', '3']]],
    ['хашилт доторх мөр шилжилт', 'a,b\n1,"x\ny"\n', [['1', 'x\ny']]],
  ];
  return cases.filter(([, input, expected]) => JSON.stringify(parseCSV(input).rows) !== JSON.stringify(expected))
    .map(([name]) => name);
}
