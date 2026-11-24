# Vendored libraries (D12 — no CDN)

| Library | Version | File | Source | Integrity check |
|---|---|---|---|---|
| Chart.js | 4.4.1 (MIT, `LICENSE.md`) | `chartjs-4.4.1/chart.umd.js` | npm registry tarball `https://registry.npmjs.org/chart.js/-/chart.js-4.4.1.tgz`, file `package/dist/chart.umd.js` | tarball sha1 `ac5dc0e69a7758909158a96fe80ce43b3bb96a9f` and sha512 `C74QN1bx…P534Dg==` matched the registry's `dist.shasum` / `dist.integrity` on 2026-11-11; `chart.umd.js` sha256 `74401d738dd3e03ee5dfb3b6841210fe2c4ead8a960c4011ca4ba0b78a9fd8f3` |

Loaded by `index.html` as a classic script (`window.Chart`). The app must keep working (tables, figures) if this file fails to load; the chart areas then show an error state.
Do not edit vendored files; replace the whole folder to upgrade and record the new checksums here.
