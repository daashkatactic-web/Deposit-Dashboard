// Dataset loading and structural validation (DATA_SOURCES.md schema).

import { DATASET_STATUSES, VERIFICATION_STATUSES } from './config.js';

const TERM_UNITS = ['days', 'months', 'day_interval', 'month_interval'];
const INTERVAL_UNITS = ['day_interval', 'month_interval'];

export function validateDataset(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Өгөгдлийн файл хоосон эсвэл буруу бүтэцтэй.'];
  if (data.schema_version !== 1) errors.push('schema_version нь 1 байх ёстой.');
  if (!DATASET_STATUSES.includes(data.dataset_status)) errors.push(`dataset_status нь ${DATASET_STATUSES.join(', ')}-ийн аль нэг байх ёстой.`);
  if (!Array.isArray(data.banks) || data.banks.length === 0) errors.push('banks жагсаалт хоосон байна.');
  if (!Array.isArray(data.products)) errors.push('products жагсаалт байхгүй.');
  if (errors.length) return errors;

  const bankIds = new Set();
  for (const b of data.banks) {
    if (!b.id || !b.name) errors.push('Банк бүр id ба name-тэй байх ёстой.');
    if (bankIds.has(b.id)) errors.push(`Давхардсан банк: ${b.id}`);
    bankIds.add(b.id);
  }
  for (const p of data.products) {
    const where = `Бүтээгдэхүүн ${p.id ?? '?'}`;
    if (!bankIds.has(p.bank_id)) errors.push(`${where}: үл мэдэгдэх bank_id.`);
    if (!VERIFICATION_STATUSES.includes(p.verification_status)) errors.push(`${where}: verification_status буруу.`);
    if (p.verification_status === 'excluded' && !p.exclusion_reason) errors.push(`${where}: excluded бол exclusion_reason заавал.`);
    if (p.amount_bonus_tiers != null) {
      const okTiers = Array.isArray(p.amount_bonus_tiers) && p.amount_bonus_tiers.every((t) => Number.isFinite(t.bonus_percent)
        && t.bonus_percent >= 0 && Number.isFinite(t.min_amount_mnt ?? 0));
      if (!okTiers) errors.push(`${where}: amount_bonus_tiers буруу.`);
    }
    if (!Array.isArray(p.rates)) { errors.push(`${where}: rates жагсаалт байхгүй.`); continue; }
    for (const r of p.rates) {
      if (!TERM_UNITS.includes(r.source_term_unit)) errors.push(`${where}: source_term_unit буруу.`);
      if (INTERVAL_UNITS.includes(r.source_term_unit) && !Number.isFinite(r.interval?.min)) {
        errors.push(`${where}: интервалын хүүд interval.min заавал.`);
      }
      if (!Number.isFinite(r.annual_percent) || r.annual_percent < 0) errors.push(`${where}: annual_percent буруу.`);
      if (r.verification_status && !VERIFICATION_STATUSES.includes(r.verification_status)) {
        errors.push(`${where}: хүүгийн verification_status буруу.`);
      }
    }
  }
  return errors;
}

export async function loadDataset(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new Error('Өгөгдлийн файлыг ачаалж чадсангүй. Хуудсыг локал HTTP сервероор нээнэ үү (file:// хаягаар fetch найдвартай ажиллахгүй).');
  }
  if (!response.ok) throw new Error(`Өгөгдлийн файл олдсонгүй (${response.status}).`);
  const data = await response.json();
  const errors = validateDataset(data);
  if (errors.length) throw new Error(`Өгөгдлийн файл шалгалтад тэнцсэнгүй: ${errors.join(' ')}`);
  return data;
}
