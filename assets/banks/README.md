# Bank logos — provenance

All files were taken on 2026-11-11 from each bank's **own official website** (no logo APIs, no third-party sites, no CDNs) and stored here unchanged except where noted. They are not redrawn, cropped, recoloured or resized; the browser scales them with `object-fit: contain`. File names are the stable bank IDs from `data/deposits.json`.

The small UI slots (20–40 px) use each bank's official **square emblem** as published on its site (header emblem, favicon or app icon). Where the bank publishes no emblem at a usable size, its official full logo is used instead.

| Bank ID | Bank | File | Official source (as fetched) | Asset type | Processing |
|---|---|---|---|---|---|
| khan | ХААН банк | `khan.svg` (40×40 vector) | https://www.khanbank.com/personal/home/ — header logo, inline SVG `svg.mobile-header-logo` | header emblem | Saved byte-for-byte from the page DOM; SHA-256 `24c3f769…f0ef8a06` matched the live element |
| tdb | Худалдаа хөгжлийн банк | `tdb.png` (48×48) | https://www.tdbm.mn/themes/custom/tdbm/favicon.ico | site icon | Largest ICO frame saved as PNG (pixels unchanged). Full logos are on https://www.tdbm.mn/mn/logo-tatakh |
| golomt | Голомт банк | `golomt.png` (592×299) | https://www.golomtbank.com/wp-content/uploads/2026/05/Golomt-bank-logo.png (shown on the official logo page https://www.golomtbank.com/download-logo) | full vertical logo | Byte-identical copy. The site icon is only 16×16, so the full logo is used |
| xac | ХасБанк | `xac.png` (128×128) | https://xacbank.mn/favicon.png | site icon | Byte-identical copy |
| state | Төрийн банк | `state.png` (32×32) | https://www.statebank.mn/favicon.ico | site icon | Largest ICO frame saved as PNG (pixels unchanged). Low resolution; site logo is only 204×44 PNG |
| capitron | Капитрон банк | `capitron.png` (32×32) | https://www.capitronbank.mn/images/favicon.ico (identical to /favicon.ico) | site icon | Largest ICO frame saved as PNG (pixels unchanged). Low resolution |
| bogd | Богд банк | `bogd.png` (180×180) | https://www.bogdbank.com/assets/admin/images/apple-touch-icon.png | app icon | Byte-identical copy |
| arig | Ариг банк | `arig.png` (256×244) | https://www.arigbank.mn/favicon.ico | site icon | Largest ICO frame saved as PNG (pixels unchanged) |
| mbank | М банк | `mbank.png` (799×796) | https://www.m-bank.mn/favicon.ico (served as PNG data) | site icon | Byte-identical copy (extension corrected to .png) |
| transbank | Тээвэр хөгжлийн банк | `transbank.png` (41×40) | https://transbank.mn/favicon.ico (served as PNG data) | site icon | Byte-identical copy (extension corrected to .png) |
| chinggis | Чингис хаан банк | `chinggis.png` (128×128) | https://www.ckbank.mn/img/favicon.png | site icon | Byte-identical copy |
| nibank | Үндэсний хөрөнгө оруулалтын банк | `nibank.png` (48×48) | https://www.nibank.mn/images/favicon.ico | site icon | Largest ICO frame saved as PNG (pixels unchanged). Full logos: https://www.nibank.mn/files/logo.zip |

Display: every logo sits on a neutral light plate (`--text` token) so dark marks stay visible on the Dark Finance theme. A missing or broken file falls back to a text monogram; the bank name is always shown next to it.

Logos are the banks' trademarks, used only to identify each bank in this non-commercial academic comparison. Golomt and ХХБ ask on their logo pages that the logo be used properly according to their brand standards.
