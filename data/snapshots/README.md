# data/snapshots — судалгааны огноотой snapshot (гараар засахгүй)

Google Sheets-ийн `clean` хуудасны нийтэлсэн CSV-г татаж, яг ирсэн байтаар нь хадгалсан хуулбарууд. Цэвэрлэгээний v2 нь (`src/clean_rates.py`) эдгээрээс үүснэ. Snapshot-ийг хэзээ ч дарж бичихгүй. Шинэ судалгаа хийх бүрт шинэ огноотой файл нэмнэ.

| Файл | Татсан | Хэмжээ | sha256 | Агуулга |
|---|---|---|---|---|
| `sheets_clean_2026-11-25.csv` | 2026-11-25 14:36 UTC, `curl` (HTTP 307 → 200, `text/csv; charset=utf-8`) | 3 702 байт | `d6e57fdc238349bbe8fdb4e3266acf9753a9f21344bd4d57f346d3607f1b8e1b` | 12 банк × 11 багана (`net12` орсон). Судлаачийн шалгасан огноо (`checked`) 2026-11-24…25. CRLF мөрийн төгсгөлтэй, файлын төгсгөлд шинэ мөргүй (Sheets-ийн гаралт). |

- **Эх сурвалж:** `https://docs.google.com/spreadsheets/d/e/2PACX-1vTmSW8jXWfIZKkptcJ0a3gzRiO7GX5B1jyhVGsYFvMhD4cjrV17Ml8sJY1wPA5NCN9-Ji4REejMIVJx/pub?gid=1160753732&single=true&output=csv`
- **Байтыг хадгалах:** `.gitattributes`-д `data/snapshots/*.csv -text` дүрэм бий. Иймээс git мөрийн төгсгөлийг (CRLF) өөрчлөхгүй бөгөөд sha256 тогтвортой хэвээр үлдэнэ. Энэ хэш `data/clean/cleaning_log.csv`-д бичигдсэн.
- **Шинэ snapshot татах:** `python src/clean_rates.py --fetch`. Скрипт өнөөдрийн огноотой шинэ файл үүсгэнэ, байгаа файлыг дарж бичихгүй. Дараа нь `src/clean_rates.py`-ийн `SNAPSHOT` тогтмолыг шинэ файл руу зааж өөрчилнө.
- **Sheets-тэй тулгах:** `python src/clean_rates.py --compare-live`.
- **Хязгаарлалт:** Sheets дээрх хүүгийн утгуудыг судлаач гараар оруулсан. Эдгээрийг өмнөх судалгааны баримттай (`data/raw/rates_raw.csv`) тулгасан үр дүн `data/clean/source_check.csv`-д бий. Судлаач энэ snapshot-ийн бүх хүүг 2026-11-24…25-нд банкны албан хуудаснаас гараар нягталж, дэлгэцийн зургаар баримтжуулсан (D19; `source_check.csv`-ийн `researcher_*` баганууд). Дэлгэцийн зураг судлаачид хадгалагдана, энэ репод байхгүй. Иймээс автомат файл-нотолгоо (`result`) өөрчлөгдөөгүй. Энэ snapshot нь нягталсан утгын жишиг: Sheets дээрх утга үүнээс өөрчлөгдвөл dashboard «Дахин нягтлах шаардлагатай» гэж тэмдэглэнэ.
