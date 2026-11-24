// Official bank logos (assets/banks/, provenance in assets/banks/README.md).
// Mapped by stable bank ID — never by display name. Paths are resolved
// relative to this module, so they work from index.html, tests/ and a GitHub
// Pages subdirectory alike.

export const BANK_LOGOS = Object.freeze({
  khan: 'khan.svg',
  tdb: 'tdb.png',
  golomt: 'golomt.png',
  xac: 'xac.png',
  state: 'state.png',
  capitron: 'capitron.png',
  bogd: 'bogd.png',
  arig: 'arig.png',
  mbank: 'mbank.png',
  transbank: 'transbank.png',
  chinggis: 'chinggis.png',
  nibank: 'nibank.png',
});

export const LOGO_SIZES = Object.freeze([20, 24, 40]);

/** URL of a bank's logo, or null when none is stored for that ID. */
export function bankLogoUrl(bankId) {
  const file = Object.prototype.hasOwnProperty.call(BANK_LOGOS, bankId) ? BANK_LOGOS[bankId] : null;
  return file ? new URL(`../assets/banks/${file}`, import.meta.url).href : null;
}

/** Two-letter text monogram for the fallback («Худалдаа хөгжлийн банк» → «ХХ», «ХасБанк» → «Х»). */
export function bankMonogram(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter((w) => w && !/^банк$/i.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]).join('');
  return (letters || String(name ?? '?').trim()[0] || '?').toUpperCase();
}

function fallback(bank) {
  const span = document.createElement('span');
  span.className = 'bank-logo__fallback';
  span.textContent = bankMonogram(bank.name);
  span.setAttribute('aria-hidden', 'true');
  return span;
}

/**
 * Logo element for a bank: an <img> on a neutral plate, or a text monogram
 * when no logo exists or the file fails to load. `size` is 20, 24 or 40 px.
 */
export function bankLogo(bank, { size = 24, eager = false } = {}) {
  const box = document.createElement('span');
  box.className = `bank-logo bank-logo--${LOGO_SIZES.includes(size) ? size : 24}`;
  box.dataset.bankId = bank.id;
  const url = bankLogoUrl(bank.id);
  if (!url) {
    box.classList.add('bank-logo--fallback');
    box.title = bank.name;
    box.append(fallback(bank));
    return box;
  }
  const img = document.createElement('img');
  img.src = url;
  img.alt = `Лого: ${bank.name}`;
  img.width = size;
  img.height = size;
  img.decoding = 'async';
  img.loading = eager ? 'eager' : 'lazy';
  img.addEventListener('error', () => {
    box.classList.add('bank-logo--fallback');
    box.title = bank.name;
    img.replaceWith(fallback(bank));
  }, { once: true });
  box.append(img);
  return box;
}
