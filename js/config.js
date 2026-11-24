// Project-wide constants. Changing any of these changes documented behaviour —
// see CLAUDE.md decisions log (D1, D8, D10, D11) before editing.

export const TERM_CHIPS = Object.freeze([1, 3, 6, 9, 12, 18, 24]);

// D1 — fixed chip-to-day mapping table (project assumption, not a bank statement).
export const TERM_DAY_MAP = Object.freeze({ 1: 30, 3: 90, 6: 180, 9: 270, 12: 365, 18: 545, 24: 730 });

// Verified 2026-11-11: Personal Income Tax Law (legalinfo.mn/mn/detail/14410)
// arts. 16.1.4, 21.2.4, 25.2 — 10% of gross interest, withheld by the bank.
export const TAX_RATE = 0.10;

export const AMOUNT_SLIDER = Object.freeze({ min: 0, max: 100_000_000, step: 500_000 });

// D8 — configurable inflation slider range in percent; deflation allowed.
export const INFLATION_SLIDER = Object.freeze({ min: -5, max: 25, step: 0.1 });

// D11 — data observed more than this many days ago is flagged.
export const FRESHNESS_DAYS = 30;

// D7 — project inflation-year basis for day-based terms.
export const INFLATION_YEAR_DAYS = 365;

// D5 — conventions the engine can apply when officially documented.
export const KNOWN_CONVENTIONS = Object.freeze(['ACT/365', 'ACT/366', 'ACT/ACT', '30/360', 'month_fraction']);
export const ILLUSTRATIVE_CONVENTION = 'ACT/365';

export const VERIFICATION_STATUSES = Object.freeze(['demo', 'needs_verification', 'verified', 'excluded']);
export const DATASET_STATUSES = Object.freeze(['demo', 'verified']);

export const DEFAULTS = Object.freeze({ principal: 22_000_000, months: 12 });

// Phase 2: verified dataset. The Phase 1 demo file (data/deposits.demo.json)
// is kept for tests and as a reference; it is no longer loaded by the app.
export const DATA_URL = 'data/deposits.json';
export const DEMO_DATA_URL = 'data/deposits.demo.json';
