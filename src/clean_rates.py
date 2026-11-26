"""Week 4 cleaning pipeline.

Two versions, both rebuilt from immutable inputs on every run:

  v1 (2026-11-16)  data/raw/rates_raw.csv (+ rechecks.csv, deposits.json)
                   -> data/clean/archive/v1_2026-11-16/   (kept for comparison)
  v2 (2026-11-25)  data/snapshots/sheets_clean_2026-11-25.csv — dated snapshot of the
                   published Google Sheets `clean` sheet (research update 2026-11-24/25)
                   -> data/clean/                         (current version)

Run from the project root:
  python src/clean_rates.py                 rebuild data/clean/ (v1 archive + v2)
  python src/clean_rates.py --check         rebuild into a temp folder, compare byte by byte
  python src/clean_rates.py --compare-live  fetch the published Sheets CSV and compare it
                                            record by record with data/clean/rates_clean.csv
  python src/clean_rates.py --fetch         download the published CSV into a new dated
                                            snapshot (never overwrites an existing one)

Standard library only (Python 3.11+). Deterministic: the same inputs give byte-identical
outputs. data/raw/ and data/snapshots/ are never modified by a rebuild.

Outputs (data/clean/, v2):
  rates_clean.csv       11 columns, one row per bank (= the Sheets snapshot, validated)
  rates_long_clean.csv  one row per bank x term (48), with the v1 value next to the v2 value
  cleaning_log.csv      date,column,issue,change,affected_rows — v1 entries kept, v2 appended
  missing_values.csv    missing count and percent per column + all rate cells
  source_check.csv      every v2 rate cell: (a) automated file evidence vs the documented
                        2026-11-11/16 research (raw rows) and (b) the researcher's manual
                        check of the official bank pages (RESEARCHER_CHECK), kept separate
  quality_checks.csv    data-quality checks with PASS / FAIL / NOT VERIFIED
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
import tempfile
import re
import sys
import urllib.request
from collections import Counter
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rates_raw.csv"
RECHECKS = ROOT / "data" / "raw" / "rechecks.csv"
DATASET = ROOT / "data" / "deposits.json"
OUT = ROOT / "data" / "clean"
ARCHIVE_V1 = Path("archive") / "v1_2026-11-16"   # relative to the output folder

# v2: dated snapshot of the published Google Sheets `clean` sheet (11 columns, incl. net12)
SHEETS_CSV_URL = ("https://docs.google.com/spreadsheets/d/e/2PACX-1vTmSW8jXWfIZKkptcJ0a3gzRiO7GX5B1jyhVGsYFvMhD4cjrV17Ml8sJY1wPA5NCN9-Ji4REejMIVJx"
                  "/pub?gid=1160753732&single=true&output=csv")
SNAPSHOT = ROOT / "data" / "snapshots" / "sheets_clean_2026-11-25.csv"
V2_DATE = "2026-11-25"             # log date of the v2 rules
V2_COLUMNS = ["bank_id", "bank", "channel", "m3", "m6", "m12", "m24", "source", "checked", "note", "net12"]
V2_CHANNELS = ("any", "online", "branch", "unknown")
NET12_PRINCIPAL, NET12_KEEP = Decimal(10_000_000), Decimal("0.9")   # net12 = 10 000 000 × m12/100 × 0.9
EXPECTED_V2 = {"banks": 12, "columns": 11, "rate_cells": 48, "numeric": 46, "empty": 2, "net12": 12}
LOG_COLUMNS = ["date", "column", "issue", "change", "affected_rows"]

# Researcher's manual verification (D19), recorded on the researcher's own statement of
# 2026-11-26: every rate in the Sheets `clean` sheet was checked by hand on the banks' official
# pages on 2026-11-24..25 and documented with screenshots (kept by the researcher, not in this
# repo). It is stored next to — never merged into — the automated file evidence (`result`).
# A cell counts as researcher-verified only for the value in SNAPSHOT and a `checked` date
# inside the window; anything else is NEEDS_RECHECK.
RESEARCHER_CHECK = {
    "recorded": "2026-11-26",
    "from": "2026-11-24",
    "to": "2026-11-25",
    "method": "Судлаач банкны албан ёсны вэб хуудаснаас гараар нягталж дэлгэцийн зургаар баримтжуулсан "
              "(дэлгэцийн зураг судлаачид хадгалагдана; репод ороогүй)",
}

RULES_DATE = "2026-11-16"          # date the cleaning rules were set (log date)
RATE_MIN, RATE_MAX = 0.0, 30.0     # plausibility range from the course guide
SAMPLE_SEED, SAMPLE_SIZE = 20261116, 10
WIDE_TERMS = (3, 6, 12, 24)        # columns m3, m6, m12, m24
TERM_DAY_MAP = {1: 30, 3: 90, 6: 180, 9: 270, 12: 365, 18: 545, 24: 730}  # D1 (js/config.js)

# Channel rule (one rule for every bank): prefer the branch rate; a bank that
# publishes a single channel ("any", online-only, or not stated) uses it.
CHANNEL_PREFERENCE = ("branch", "any", "unknown", "online")

BANK_ALIASES = {  # spelling variants -> bank_id (canonical names come from deposits.json)
    "хаан банк": "khan", "khan bank": "khan",
    "худалдаа хөгжлийн банк": "tdb", "ххб": "tdb", "tdb": "tdb",
    "голомт банк": "golomt",
    "хасбанк": "xac", "хас банк": "xac", "xacbank": "xac",
    "төрийн банк": "state",
    "капитрон банк": "capitron",
    "богд банк": "bogd",
    "ариг банк": "arig",
    "м банк": "mbank", "m bank": "mbank",
    "тээвэр хөгжлийн банк": "transbank",
    "чингис хаан банк": "chinggis",
    "үндэсний хөрөнгө оруулалтын банк": "nibank", "үхоб": "nibank",
}
CHANNEL_MAP = {
    "интернэт банк/апп ба салбар": "any",
    "онлайн": "online", "апп (дижитал)": "online",
    "салбар": "branch",
    "": "unknown",
}
PAYOUT_MAP = {
    "хугацааны эцэст": "at_maturity", "хугацааны төгсгөлд": "at_maturity",
    "улирал бүр": "quarterly", "сар бүр": "monthly",
    "": "unknown",
}

DASH = r"\s*[–\-]\s*"
TERM_PATTERNS = [  # (regex, builder) — first match wins
    (re.compile(rf"^(\d+){DASH}(\d+)\s*хоног$"), lambda a, b: ("day_interval", a, b, True, True)),
    (re.compile(r"^(\d+)\s*хоног$"), lambda a: ("days", a, a, True, True)),
    (re.compile(rf"^(\d+)\s*сар\s*1\s*хоног{DASH}(\d+)\s*сар\s*(\d+)\s*хоног$"), lambda a, b, c: ("other", a, b, False, True)),
    (re.compile(rf"^(\d+)\s*сар\s*1\s*хоног{DASH}(\d+)\s*сар$"), lambda a, b: ("month_interval", a, b, False, True)),
    (re.compile(rf"^(\d+)\s*сар{DASH}(\d+)\s*сар$"), lambda a, b: ("month_interval", a, b, True, True)),
    (re.compile(rf"^(\d+){DASH}(\d+)\s*сар$"), lambda a, b: ("month_interval", a, b, True, True)),
    (re.compile(r"^(\d+)\s*сараас\s*дээш$"), lambda a: ("month_interval", a, None, False, True)),
    (re.compile(r"^(\d+)\s*сар$"), lambda a: ("months", a, a, True, True)),
]

RAW_COLUMNS = ["row_id", "bank_raw", "product_ref", "product_raw", "channel_raw", "term_raw",
               "rate_raw", "min_balance_raw", "payout_raw", "remark_raw", "source_url", "observed_at"]


# ------------------------------------------------------------------ helpers

def read_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, header: list[str], rows: list[dict], forbid_commas: bool = False) -> None:
    if forbid_commas:  # the course's naive split(",") reader must not break
        for r in rows:
            for k in header:
                if "," in str(r.get(k, "")):
                    raise ValueError(f"{path.name}: comma in {k!r}: {r.get(k)!r}")
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=header, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def fmt_num(x) -> str:
    if x is None or x == "":
        return ""
    return f"{x:g}" if isinstance(x, float) else str(x)


def parse_rate(text: str) -> tuple[float | None, str, str]:
    """'7.20%' -> 7.2; '12,1%' -> 12.1; '10.50% хүртэл' -> 10.5 (upper_bound);
    '9.0%–12.0%' -> None (range). Returns (value, qualifier, problem)."""
    s = text.strip()
    if not s:
        return None, "", "хоосон"
    s = re.sub(r"(\d),(\d)", r"\1.\2", s)
    if re.fullmatch(r"[\d.]+\s*%\s*[–\-]\s*[\d.]+\s*%", s):
        return None, "range", "хүүг муж хэлбэрээр зарласан"
    qualifier = ""
    if s.endswith("хүртэл"):
        qualifier, s = "upper_bound", s[: -len("хүртэл")].strip()
    m = re.fullmatch(r"([\d.]+)\s*%?", s)
    if not m:
        return None, qualifier, f"тоо болгож чадсангүй: {text!r}"
    return float(m.group(1)), qualifier, ""


def parse_term(text: str):
    s = " ".join(text.split())
    for rx, build in TERM_PATTERNS:
        m = rx.match(s)
        if m:
            unit, lo, hi, lo_inc, hi_inc = build(*[int(g) for g in m.groups()])
            return {"unit": unit, "min": lo, "max": hi, "min_inc": lo_inc, "max_inc": hi_inc}
    return None


def parse_amount(text: str) -> int | None:
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else None


def in_interval(v, t) -> bool:
    lo_ok = v >= t["min"] if t["min_inc"] else v > t["min"]
    hi = t["max"] if t["max"] is not None else float("inf")
    hi_ok = v <= hi if t["max_inc"] else v < hi
    return lo_ok and hi_ok


def match_term(rows: list[dict], months: int):
    """Same order as js/calc.js termCandidates: exact months -> month interval
    -> D1-mapped days -> D1-mapped day interval. No interpolation."""
    days = TERM_DAY_MAP.get(months)
    stages = [
        ("exact", lambda t: t["unit"] == "months" and t["min"] == months),
        ("month_range", lambda t: t["unit"] == "month_interval" and in_interval(months, t)),
        ("mapped", lambda t: days is not None and t["unit"] == "days" and t["min"] == days),
        ("mapped", lambda t: days is not None and t["unit"] == "day_interval" and in_interval(days, t)),
    ]
    for match_type, test in stages:
        hits = [r for r in rows if r["_term"] and test(r["_term"])]
        if hits:
            return match_type, hits
    return None, []


def term_label(t) -> str:
    if t is None:
        return ""
    if t["unit"] == "months":
        return f"{t['min']} сар"
    if t["unit"] == "days":
        return f"{t['min']} хоног"
    unit = "хоног" if t["unit"] == "day_interval" else "сар"
    lo = f"{t['min']}" if t["min_inc"] else f">{t['min']}"
    hi = "∞" if t["max"] is None else f"{t['max']}"
    return f"{lo}–{hi} {unit}"


# ------------------------------------------------------------------ pipeline

def build_v1(out_dir: Path) -> dict:
    """The 2026-11-16 pipeline, unchanged in logic: raw -> out_dir (v1 archive)."""
    OUT = out_dir  # noqa: N806 — local override
    raw = read_csv(RAW)
    if list(raw[0].keys()) != RAW_COLUMNS:
        raise SystemExit(f"Unexpected raw header: {list(raw[0].keys())}")
    dataset = json.loads(DATASET.read_text(encoding="utf-8"))
    banks = {b["id"]: b for b in dataset["banks"]}
    products = {p["id"]: p for p in dataset["products"]}
    rechecks = read_csv(RECHECKS) if RECHECKS.exists() else []

    log: list[dict] = []

    def note(column, issue, change, n):
        log.append({"date": RULES_DATE, "step": len(log) + 1, "column": column, "issue": issue,
                    "change": change, "rows_affected": n})

    rows = [dict(r) for r in raw]  # work on a copy; raw stays untouched
    n_raw = len(rows)

    # 2. Missing values (measured on raw, before any change) -------------------
    missing = []
    for col in RAW_COLUMNS:
        n = sum(1 for r in rows if not r[col].strip())
        missing.append({"column": col, "missing": n, "missing_pct": f"{100 * n / n_raw:.1f}"})

    # 4. Naming: bank names, channels -------------------------------------------
    renamed = 0
    for r in rows:
        bank_id = BANK_ALIASES.get(r["bank_raw"].strip().lower())
        if bank_id is None:
            raise SystemExit(f"row {r['row_id']}: unknown bank name {r['bank_raw']!r} — add an alias")
        r["bank_id"] = bank_id
        r["bank"] = banks[bank_id]["name"]
        renamed += r["bank"] != r["bank_raw"]
    note("bank", "Банкны нэрийн бичлэгийг албан жагсаалттай тулгах", "Нэг нэрд нэгтгэв (BANK_ALIASES)", renamed)

    ch_changed = 0
    for r in rows:
        key = r["channel_raw"].strip().lower()
        if key not in CHANNEL_MAP:
            raise SystemExit(f"row {r['row_id']}: unknown channel {r['channel_raw']!r}")
        r["channel"] = CHANNEL_MAP[key]
        ch_changed += 1
    note("channel", "Сувгийг чөлөөт текстээр бичсэн",
         "any / online / branch / unknown ангилалд оруулав; хоосныг unknown (тодорхойгүй)", ch_changed)

    # 1. Duplicates ---------------------------------------------------------------
    seen: dict[tuple, dict] = {}
    deduped, dropped = [], []
    for r in rows:
        key = (r["product_ref"], r["channel"], " ".join(r["term_raw"].split()), r["rate_raw"].strip())
        if key in seen:
            keep = seen[key]
            filled = lambda x: sum(1 for c in RAW_COLUMNS if x[c].strip())
            if filled(r) > filled(keep):  # keep the more complete row
                deduped[deduped.index(keep)] = r
                seen[key] = r
                dropped.append(keep)
            else:
                dropped.append(r)
        else:
            seen[key] = r
            deduped.append(r)
    rows = deduped
    note("bank+product+channel+term+rate", "Ижил хүү хоёр хуудсанд давхар бичигдсэн (" +
         "; ".join(f"мөр {d['row_id']}" for d in dropped) + ")",
         "Илүү бүрэн мөрийг (доод үлдэгдэлтэй нөхцлийн хүснэгт) үлдээж давхардлыг хасав", len(dropped))

    # 3. Format: rates, terms, amounts, dates ------------------------------------
    pct_fixed = upper = ranges = 0
    for r in rows:
        value, qualifier, problem = parse_rate(r["rate_raw"])
        r["rate_percent"], r["rate_qualifier"], r["_rate_problem"] = value, qualifier, problem
        pct_fixed += value is not None
        upper += qualifier == "upper_bound"
        ranges += qualifier == "range"
    note("rate", "Хүүг «7.20%» текстээр бичсэн", "Тоо болгов (% тэмдэг хасаж, таслалыг цэг болгов)", pct_fixed)
    note("rate", "«10.50% хүртэл» — дээд хязгаар, тогтмол хүү биш",
         "Тоог 10.5 болгож rate_qualifier=upper_bound; note-д тэмдэглэв", upper)
    note("rate", "Хүүг муж хэлбэрээр зарласан («9.0%–12.0%»)", "rate_percent хоосон; rate_qualifier=range", ranges)

    unparsed = 0
    for r in rows:
        r["_term"] = parse_term(r["term_raw"])
        unparsed += r["_term"] is None
    note("term", "Хугацааг 8 янзаар бичсэн («30 хоног», «30–59 хоног», «3-5 сар», «2 сар 1 хоног – 3 сар», «18 сараас дээш» …)",
         "term_unit, term_min, term_max, min_inclusive, max_inclusive болгон задлав; хоног↔сарыг тэнцүүлээгүй (D14 P2-A)",
         len(rows) - unparsed)
    if unparsed:
        raise SystemExit(f"{unparsed} term(s) could not be parsed")

    amt_missing = 0
    for r in rows:
        r["min_balance_mnt"] = parse_amount(r["min_balance_raw"])
        amt_missing += r["min_balance_mnt"] is None
    note("min_balance", "Доод үлдэгдлийг «20,000 ₮», «Дансны доод үлдэгдэл 10,000 төгрөг» гэх мэтээр бичсэн",
         "Бүхэл тоо (₮) болгов; бичигдээгүйг хоосон (тодорхойгүй) үлдээв", len(rows) - amt_missing)

    bad_dates = [r for r in rows if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", r["observed_at"].strip())]
    note("observed_at", "Огнооны хэлбэр шалгах (YYYY-MM-DD)", "Өөрчлөх шаардлагагүй", len(bad_dates))
    if bad_dates:
        raise SystemExit("non-ISO observed_at")

    # 5. Impossible values ----------------------------------------------------------
    implausible = [r for r in rows if r["rate_percent"] is not None and not RATE_MIN <= r["rate_percent"] <= RATE_MAX]
    bad_iv = [r for r in rows if r["_term"]["max"] is not None and r["_term"]["max"] < r["_term"]["min"]]
    note("rate", f"Хүү {RATE_MIN:g}–{RATE_MAX:g}%-иас гадуур", "Илрүүлэх (засахгүй)", len(implausible))
    note("term", "Хугацааны муж буруу (max < min)", "Илрүүлэх (засахгүй)", len(bad_iv))
    if implausible or bad_iv:
        raise SystemExit("implausible values found — inspect before continuing")

    # 6. Categories: payout, status -------------------------------------------------
    for r in rows:
        key = r["payout_raw"].strip().lower()
        if key not in PAYOUT_MAP:
            raise SystemExit(f"row {r['row_id']}: unknown payout {r['payout_raw']!r}")
        r["payout"] = PAYOUT_MAP[key]
    note("payout", "Хүү олгох хугацааг чөлөөт текстээр бичсэн / бичээгүй",
         "at_maturity / quarterly / unknown ангилалд оруулав; хоосныг unknown (тодорхойгүй)", len(rows))

    json_rates = {}
    for pid, p in products.items():
        for jr in p["rates"]:
            unit = jr["source_term_unit"]
            if unit in ("months", "days"):
                k = (pid, unit, jr["source_term_value"], jr["source_term_value"])
            else:
                iv = jr["interval"]
                k = (pid, unit, iv["min"], iv["max"])
            json_rates[k] = jr

    for r in rows:
        p = products[r["product_ref"]]
        t = r["_term"]
        jr = json_rates.get((r["product_ref"], t["unit"], t["min"], t["max"]))
        r["_json_rate"] = jr
        r["interest_type"] = p["interest_type"]
        reasons = []
        if p["verification_status"] == "excluded":
            status = "excluded"
            reasons.append({"compound_interest": "нийлмэл хүү", "restricted_customer_group": "тусгай бүлэг (гадаад иргэд)"}
                           .get(p["exclusion_reason"], p["exclusion_reason"]))
        elif p["verification_status"] == "needs_verification":
            status = "needs_verification"
            reasons.append("бүтээгдэхүүний нөхцөл бүрэн биш (энгийн/нийлмэл тодорхойгүй)")
        elif jr is not None and jr.get("verification_status") == "needs_verification":
            status = "needs_verification"
            reasons.append("upper_bound хүү" if r["rate_qualifier"] == "upper_bound" else "сарын ба жилийн хүү зөрсөн")
        elif r["payout"] == "quarterly":
            status = "unsupported_payout"
            reasons.append("улирал бүр олгодог — тооцооны хөдөлгүүр дэмжээгүй")
        else:
            status = "usable"
        r["status"] = status
        r["_reasons"] = reasons
    note("status", "Хүү бүрийн ашиглах боломжийг ангилах (deposits.json-ийн баталгаажуулалтаар)",
         "usable / needs_verification / excluded / unsupported_payout", len(rows))

    # Channel rule: one rule for every bank ---------------------------------------
    by_bank: dict[str, set] = {}
    for r in rows:
        by_bank.setdefault(r["bank_id"], set()).add(r["channel"])
    chosen = {b: next(c for c in CHANNEL_PREFERENCE if c in chs) for b, chs in by_bank.items()}
    not_chosen = 0
    for r in rows:
        r["channel_selected"] = r["channel"] == chosen[r["bank_id"]]
        if not r["channel_selected"]:
            not_chosen += 1
            if r["status"] == "usable":
                r["status"] = "channel_not_selected"
            r["_reasons"].append(f"сувгийн дүрмээр {chosen[r['bank_id']]} сонгосон")
    note("channel", "Нэг банк онлайн ба салбарын хоёр хүүтэй (ХХБ)",
         "Бүх банканд нэг дүрэм: салбарын хүү; ганц суваг зарласан бол түүнийг. Онлайн мөрүүдийг ашиглахгүй гэж тэмдэглэв",
         not_chosen)

    # 7. Source check: every rate vs deposits.json + random sample ----------------
    checks = []
    mismatches = 0
    for r in rows:
        jr = r["_json_rate"]
        if jr is None:
            result = "JSON-д хадгалаагүй" + (" (хассан бүтээгдэхүүн)" if r["status"] == "excluded"
                                             else " (1–24 сарын чипэд хамаарахгүй)")
        elif r["rate_percent"] is None:
            result = "харьцуулах тоо байхгүй"
        elif abs(jr["annual_percent"] - r["rate_percent"]) < 1e-9:
            result = "тэнцүү"
        else:
            result = f"ЗӨРҮҮ: JSON {jr['annual_percent']}"
            mismatches += 1
        checks.append({"kind": "json_crosscheck", "row_id": r["row_id"], "bank": r["bank"],
                       "term": r["term_raw"], "rate_percent": fmt_num(r["rate_percent"]),
                       "result": result, "source_url": r["source_url"]})
    note("rate", "Цэвэр хүүг баталгаажуулсан deposits.json-той бүгдийг тулгах", "Зөрүү илрүүлэх", mismatches)
    if mismatches:
        raise SystemExit(f"{mismatches} rate(s) differ from deposits.json")

    def live_result(r):
        """Result of re-reading this row on the bank page (rechecks.csv), if done."""
        for rc in rechecks:
            if rc["row_id"] == r["row_id"]:
                return f"{rc['checked_at']} вэбээр: {rc['result']}"
        return "deposits.json-той тэнцүү; вэбээр дахин уншаагүй"

    usable_pool = [r for r in rows if r["rate_percent"] is not None]
    sample = random.Random(SAMPLE_SEED).sample(usable_pool, SAMPLE_SIZE)
    for r in sorted(sample, key=lambda x: int(x["row_id"])):
        checks.append({"kind": "random_sample", "row_id": r["row_id"], "bank": r["bank"],
                       "term": r["term_raw"], "rate_percent": fmt_num(r["rate_percent"]),
                       "result": live_result(r),
                       "source_url": r["source_url"]})
    note("(бүгд)", f"Санамсаргүй {SAMPLE_SIZE} мөрийг эх сурвалжтай дахин харьцуулах (seed {SAMPLE_SEED})",
         "source_check.csv-д жагсаав", SAMPLE_SIZE)

    # Re-checks against the live bank pages (top/bottom 3 of m12) ------------------
    recheck_by_bank: dict[str, str] = {}
    for rc in rechecks:
        bank_id = BANK_ALIASES[rc["bank_raw"].strip().lower()]
        if rc["result"].startswith("тэнцүү"):  # only a successful re-read refreshes `checked`
            recheck_by_bank[bank_id] = max(recheck_by_bank.get(bank_id, ""), rc["checked_at"])
        checks.append({"kind": "live_recheck", "row_id": "", "bank": banks[bank_id]["name"],
                       "term": rc["term_raw"], "rate_percent": rc["rate_seen_raw"],
                       "result": rc["result"], "source_url": rc["page_url"]})
    if rechecks:
        ok = sum(rc["result"].startswith("тэнцүү") for rc in rechecks)
        note("checked", f"Хүүг банкны вэбтэй дахин тулгах ({len(rechecks)} мөр; {ok} тэнцүү; "
             f"{len(rechecks) - ok} уншиж чадаагүй)",
             "Амжилттай тулгасан банкны checked огноог шинэчлэв", len(recheck_by_bank))

    # ------------------------------------------------------------------ outputs
    OUT.mkdir(parents=True, exist_ok=True)

    long_header = ["row_id", "bank_id", "bank", "product_id", "product", "channel", "channel_selected",
                   "term_label", "term_unit", "term_min", "term_max", "min_inclusive", "max_inclusive",
                   "rate_percent", "rate_qualifier", "status", "interest_type", "payout", "min_balance_mnt",
                   "source", "checked", "note"]
    long_rows = []
    for r in rows:
        t = r["_term"]
        notes = list(r["_reasons"])
        if r["_rate_problem"]:
            notes.append(r["_rate_problem"])
        if r["rate_qualifier"] == "upper_bound":
            notes.append("хүртэл (дээд хязгаар)")
        long_rows.append({
            "row_id": r["row_id"], "bank_id": r["bank_id"], "bank": r["bank"], "product_id": r["product_ref"],
            "product": r["product_raw"], "channel": r["channel"], "channel_selected": int(r["channel_selected"]),
            "term_label": term_label(t), "term_unit": t["unit"], "term_min": t["min"],
            "term_max": "" if t["max"] is None else t["max"],
            "min_inclusive": int(t["min_inc"]), "max_inclusive": int(t["max_inc"]),
            "rate_percent": fmt_num(r["rate_percent"]), "rate_qualifier": r["rate_qualifier"],
            "status": r["status"], "interest_type": r["interest_type"], "payout": r["payout"],
            "min_balance_mnt": fmt_num(r["min_balance_mnt"]), "source": r["source_url"],
            "checked": recheck_by_bank.get(r["bank_id"], r["observed_at"]),
            "note": "; ".join(n.replace(",", "") for n in notes),
        })
    write_csv(OUT / "rates_long_clean.csv", long_header, long_rows)

    wide_header = ["bank_id", "bank", "channel", "m3", "m6", "m12", "m24", "source", "checked", "note"]
    wide_rows = []
    for bank_id in banks:  # roster order from deposits.json
        bank_rows = [r for r in rows if r["bank_id"] == bank_id and r["channel_selected"]]
        row = {"bank_id": bank_id, "bank": banks[bank_id]["name"], "channel": chosen[bank_id]}
        notes, sources = [], []
        for m in WIDE_TERMS:
            match_type, hits = match_term(bank_rows, m)
            col = f"m{m}"
            if not hits:
                row[col] = ""
                if any(r["status"] == "excluded" for r in bank_rows):
                    continue
                notes.append(f"{col}: зарлаагүй")
                continue
            usable = [h for h in hits if h["status"] == "usable"]
            if not usable:
                row[col] = ""
                if hits[0]["status"] != "excluded":
                    notes.append(f"{col}: {hits[0]['status']}")
                continue
            best = max(usable, key=lambda h: h["rate_percent"])
            row[col] = fmt_num(best["rate_percent"])
            sources.append(best["source_url"])
            if match_type == "mapped":
                notes.append(f"{col} ≈ тааруулсан ({TERM_DAY_MAP[m]} хоног → {term_label(best['_term'])})")
            elif match_type == "month_range":
                notes.append(f"{col} мужаас ({term_label(best['_term'])})")
        statuses = {r["status"] for r in bank_rows}
        if "excluded" in statuses:
            notes.insert(0, "хассан: " + "; ".join(sorted({x for r in bank_rows for x in r["_reasons"][:1]})))
        payouts = {r["payout"] for r in bank_rows if r["status"] == "usable"}
        if payouts == {"unknown"}:
            notes.append("олголт тодорхойгүй → хугацааны эцэст гэж тооцно (Жишээ)")
        if bank_id == "mbank":
            notes.append("дүнгийн нэмэгдэл 20 саяас дээш (+0.15…0.5)")
        row["source"] = sources[0] if sources else (bank_rows[0]["source_url"] if bank_rows else "")
        row["checked"] = recheck_by_bank.get(bank_id, max(r["observed_at"] for r in bank_rows))
        row["note"] = "; ".join(n.replace(",", "") for n in notes)
        wide_rows.append(row)
    write_csv(OUT / "rates_clean.csv", wide_header, wide_rows, forbid_commas=True)

    note("m3/m6/m12/m24", "Хугацааг 4 баганад (m3, m6, m12, m24) нэгтгэх",
         "D1 хүснэгтээр (90/180/365/730 хоног) тааруулсныг «≈ тааруулсан» гэж note-д бичив; зарлаагүй/ашиглах боломжгүйг хоосон (0 биш)",
         len(wide_rows))

    write_csv(OUT / "cleaning_log.csv", ["date", "step", "column", "issue", "change", "rows_affected"], log)
    write_csv(OUT / "missing_values.csv", ["column", "missing", "missing_pct"], missing)
    write_csv(OUT / "source_check.csv",
              ["kind", "row_id", "bank", "term", "rate_percent", "result", "source_url"], checks)

    counts = Counter(r["status"] for r in rows)
    print(f"v1 raw rows: {n_raw}; after dedupe: {len(rows)}; dropped: {len(dropped)}")
    print("v1 status:", dict(sorted(counts.items())))
    print(f"v1 wide rows: {len(wide_rows)}; json mismatches: {mismatches}; rechecks: {len(rechecks)}")
    return {"rows": rows, "wide": wide_rows, "log": log, "rechecks": rechecks}


# ------------------------------------------------------------------ v2 (Google Sheets snapshot)

NUM_RE = re.compile(r"^\d+(\.\d+)?$")
INT_RE = re.compile(r"^\d+$")
V2_TERMS = ["m3", "m6", "m12", "m24"]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_table(path: Path) -> tuple[list[str], list[list[str]]]:
    """RFC 4180 read (quoted commas, "" escapes); empty fields stay ''."""
    with path.open(encoding="utf-8", newline="") as f:
        table = [row for row in csv.reader(f) if row]
    return table[0], table[1:]


def net12_of(m12: str) -> int:
    """10 000 000 × m12/100 × 0.9, exact decimal arithmetic, half-up to whole ₮ (D10)."""
    return int((NET12_PRINCIPAL * Decimal(m12) / 100 * NET12_KEEP).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def pct(n: int, total: int) -> str:
    return f"{100 * n / total:.2f}" if total else ""


def evidence_for(bank_id: str, months: int, value: str, channel: str, v1_rows: list[dict], rechecked: set) -> dict:
    """Is this v2 value documented in the 2026-11-11/16 research (data/raw/rates_raw.csv)?
    Same term-matching order as the v1 pipeline (exact month -> month range -> D1 days -> day range),
    per channel. PASS only for the same value in the same channel; nothing is inferred."""
    if value == "":
        return {"result": "EMPTY", "evidence": "хоосон нүд — шалгах утга алга", "rows": ""}
    v = float(value)
    bank_rows = [r for r in v1_rows if r["bank_id"] == bank_id and r["rate_percent"] is not None]
    hits = []
    for ch in sorted({r["channel"] for r in bank_rows}):
        match_type, found = match_term([r for r in bank_rows if r["channel"] == ch], months)
        hits += [(match_type, h) for h in found]
    equal = [(t, h) for t, h in hits if abs(h["rate_percent"] - v) < 1e-9]
    same = [(t, h) for t, h in equal if h["channel"] == channel]

    def cite(items):
        return "; ".join(
            f"мөр {h['row_id']} ({h['observed_at']}, {h['channel']}, {h['term_raw']}, {fmt_num(h['rate_percent'])}%"
            + (", ≈ тааруулсан" if t == "mapped" else "") + (", вэбээр дахин тулгасан" if h["row_id"] in rechecked else "") + ")"
            for t, h in items)

    if same:
        return {"result": "PASS", "rows": " ".join(h["row_id"] for _t, h in same),
                "evidence": "rates_raw.csv-д ижил суваг, ижил хүү: " + cite(same)}
    if equal:
        return {"result": "PARTIAL", "rows": " ".join(h["row_id"] for _t, h in equal),
                "evidence": f"хүү тэнцүү, суваг өөр (v2: {channel}): " + cite(equal)}
    # Rates published only as a range («9.0%–12.0%») have no number; show them as printed.
    for ch in sorted({r["channel"] for r in v1_rows if r["bank_id"] == bank_id}):
        _t, found = match_term([r for r in v1_rows if r["bank_id"] == bank_id and r["channel"] == ch
                                and r["rate_percent"] is None], months)
        hits += [("range", h) for h in found]
    seen = ", ".join(sorted({(f"{fmt_num(h['rate_percent'])}%" if h["rate_percent"] is not None
                              else f"муж {h['rate_raw'].strip()}") + f" ({h['channel']})" for _t, h in hits})) or "тохирох хугацаа алга"
    return {"result": "NOT VERIFIED", "rows": "",
            "evidence": f"өмнөх судалгаанд энэ утга байхгүй (тэр хугацааны raw хүү: {seen}); "
                        "шинэ утгын нотолгоо нь зөвхөн Sheets-ийн source/checked — файлаар баталгаажуулаагүй"}


def build_v2(out_dir: Path, v1: dict) -> int:
    head, body = read_table(SNAPSHOT)
    snapshot_hash = sha256(SNAPSHOT)
    roster = [b["id"] for b in json.loads(DATASET.read_text(encoding="utf-8"))["banks"]]
    width_bad = [i + 2 for i, r in enumerate(body) if len(r) != len(head)]
    rows = [dict(zip(head, r)) for r in body]
    for r in rows:
        for k in head:
            r[k] = r[k].strip()
    rechecked = {rc["row_id"] for rc in v1["rechecks"] if rc["result"].startswith("тэнцүү")}
    old = {w["bank_id"]: w for w in v1["wide"]}
    new = {r["bank_id"]: r for r in rows}

    # ---- quality checks (results are only what was actually computed) ------------------
    quality: list[dict] = []

    def qc(check, ok, detail):
        quality.append({"check": check, "result": "PASS" if ok is True else "FAIL" if ok is False else "NOT VERIFIED",
                        "detail": detail})

    qc("Баганын нэршил ба дараалал (11)", head == V2_COLUMNS, f"{len(head)}: {' '.join(head)}")
    qc("Мөр бүр 11 талбартай", not width_bad, f"зөрсөн мөр: {width_bad}" if width_bad else f"{len(body)} мөр × {len(head)}")
    ids = [r.get("bank_id", "") for r in rows]
    dups = sorted({i for i in ids if ids.count(i) > 1})
    qc("Давхардсан bank_id", not dups, f"давхардал {len(dups)}" + (f": {dups}" if dups else ""))
    qc("12 банк, жагсаалт deposits.json-той ижил", sorted(ids) == sorted(roster) and len(ids) == EXPECTED_V2["banks"],
       f"{len(ids)} банк; дутуу {sorted(set(roster) - set(ids))}; илүү {sorted(set(ids) - set(roster))}")
    cells = [(r["bank_id"], t, r.get(t, "")) for r in rows for t in V2_TERMS]
    numeric = [c for c in cells if NUM_RE.match(c[2])]
    empty = [c for c in cells if c[2] == ""]
    invalid = [c for c in cells if c[2] and not NUM_RE.match(c[2])]
    qc("Хүүгийн нүд 48 / тоон 46 / хоосон 2",
       (len(cells), len(numeric), len(empty)) == (EXPECTED_V2["rate_cells"], EXPECTED_V2["numeric"], EXPECTED_V2["empty"]),
       f"{len(cells)} нүд, {len(numeric)} тоон, {len(empty)} хоосон ({' '.join(f'{b}.{t}' for b, t, _ in empty)}); "
       f"бүрдэлт {pct(len(numeric), len(cells))}%")
    qc("Хүүгийн төрөл: тоо (цэгтэй аравтын) эсвэл хоосон", not invalid, f"буруу {len(invalid)}" + (f": {invalid}" if invalid else ""))
    out_range = [c for c in numeric if not RATE_MIN <= float(c[2]) <= RATE_MAX]
    qc(f"Хүүгийн муж {RATE_MIN:g}–{RATE_MAX:g}%", not out_range, f"мужаас гадуур {len(out_range)}" + (f": {out_range}" if out_range else ""))
    bad_ch = [(r["bank_id"], r["channel"]) for r in rows if r["channel"] not in V2_CHANNELS]
    qc(f"channel ∈ {{{', '.join(V2_CHANNELS)}}}", not bad_ch,
       "; ".join(f"{k}: {v}" for k, v in sorted(Counter(r["channel"] for r in rows).items())) + (f"; буруу {bad_ch}" if bad_ch else ""))
    bad_id = [r["bank_id"] for r in rows if not re.fullmatch(r"[a-z]+", r["bank_id"])]
    qc("bank_id: жижиг латин үсэг", not bad_id, f"буруу {bad_id}" if bad_id else "бүгд зөв")

    def iso_ok(s):
        try:
            return date.fromisoformat(s).isoformat() == s
        except ValueError:
            return False
    bad_dates = [r["bank_id"] for r in rows if not iso_ok(r["checked"])]
    qc("checked: хүчинтэй огноо YYYY-MM-DD", not bad_dates, f"буруу {bad_dates}" if bad_dates else
       f"{min(r['checked'] for r in rows)} … {max(r['checked'] for r in rows)}")
    bad_src = [r["bank_id"] for r in rows if not re.fullmatch(r"https://[^\s,]+", r["source"])]
    qc("source: https холбоос", not bad_src, f"буруу {bad_src}" if bad_src else "12/12 https")
    bad_net = [r["bank_id"] for r in rows if not INT_RE.match(r.get("net12", ""))]
    qc("net12: 12 бүхэл тоон утга", not bad_net and len(rows) == EXPECTED_V2["net12"], f"тоон бус/хоосон {bad_net}" if bad_net else "12/12")
    net_diff = [(r["bank_id"], r["net12"], net12_of(r["m12"])) for r in rows
                if INT_RE.match(r.get("net12", "")) and NUM_RE.match(r["m12"]) and int(r["net12"]) != net12_of(r["m12"])]
    max_diff = max((abs(int(a) - b) for _i, a, b in net_diff), default=0)
    qc("net12 = 10 000 000 × m12/100 × 0.9 (Decimal, half-up)", not net_diff and not bad_net,
       f"тулгалт {len(rows) - len(net_diff)}/{len(rows)}; хамгийн их зөрүү {max_diff} ₮")

    # ---- source evidence (prior documented research) ----------------------------------
    checks, long_rows = [], []
    for r in rows:
        for t in V2_TERMS:
            months = int(t[1:])
            ev = evidence_for(r["bank_id"], months, r[t], r["channel"], v1["rows"], rechecked)
            prev = old.get(r["bank_id"], {}).get(t, "")
            in_window = RESEARCHER_CHECK["from"] <= r["checked"] <= RESEARCHER_CHECK["to"]
            researcher = "EMPTY" if r[t] == "" else "VERIFIED_BY_RESEARCHER" if in_window else "NEEDS_RECHECK"
            checks.append({"bank_id": r["bank_id"], "bank": r["bank"], "term": t, "v2_rate_percent": r[t],
                           "v2_channel": r["channel"], "result": ev["result"], "raw_row_ids": ev["rows"],
                           "evidence": ev["evidence"], "v1_rate_percent": prev, "source_url": r["source"],
                           "checked": r["checked"], "researcher_status": researcher,
                           "researcher_checked": r["checked"] if r[t] else "",
                           "researcher_method": RESEARCHER_CHECK["method"] if r[t] else ""})
            change = ("empty_both" if prev == "" and r[t] == "" else "filled" if prev == "" else
                      "emptied" if r[t] == "" else "unchanged" if float(prev) == float(r[t]) else "updated")
            long_rows.append({"bank_id": r["bank_id"], "bank": r["bank"], "channel": r["channel"], "term": t,
                              "term_months": months, "rate_percent": r[t], "value_status": "numeric" if r[t] else "empty",
                              "v1_channel": old.get(r["bank_id"], {}).get("channel", ""), "v1_rate_percent": prev,
                              "change_vs_v1": change, "source_evidence": ev["result"], "source": r["source"],
                              "checked": r["checked"]})
    ev_count = Counter(c["result"] for c in checks)
    qc("Эх сурвалжтай тулгалт (өмнөх судалгааны баримт)", True if ev_count["PASS"] == len(numeric) else None,
       f"PASS {ev_count['PASS']}, PARTIAL {ev_count['PARTIAL']}, NOT VERIFIED {ev_count['NOT VERIFIED']}, "
       f"EMPTY {ev_count['EMPTY']} (тоон {len(numeric)} нүднээс)")
    rs_count = Counter(c["researcher_status"] for c in checks)
    qc("Судлаачийн гараар нягталсан утга (тусдаа бүртгэл)",
       True if rs_count["VERIFIED_BY_RESEARCHER"] == len(numeric) else None,
       f"VERIFIED_BY_RESEARCHER {rs_count['VERIFIED_BY_RESEARCHER']}, NEEDS_RECHECK {rs_count['NEEDS_RECHECK']}, "
       f"EMPTY {rs_count['EMPTY']} (тоон {len(numeric)} нүднээс; {RESEARCHER_CHECK['from']}…{RESEARCHER_CHECK['to']}); "
       f"автомат файл-нотолгооны үр дүнг өөрчлөөгүй")

    # ---- cleaning log: v1 entries kept, v2 entries computed from the real v1 -> v2 diff -
    log = [{"date": e["date"], "column": e["column"], "issue": e["issue"], "change": e["change"],
            "affected_rows": e["rows_affected"]} for e in v1["log"]]

    def add(column, issue, change, n):
        log.append({"date": V2_DATE, "column": column, "issue": issue, "change": change, "affected_rows": n})

    banks_both = [b for b in roster if b in old and b in new]
    name = {b: new[b]["bank"] for b in banks_both}

    def diff_cells(b):
        return [(t, old[b][t], new[b][t]) for t in V2_TERMS
                if not (old[b][t] == new[b][t] or (old[b][t] and new[b][t] and float(old[b][t]) == float(new[b][t])))]

    def show(b):
        return ", ".join(f"{t} {o or '—'}→{n or '—'}" for t, o, n in diff_cells(b)) or "хүү өөрчлөгдөөгүй"

    add("(бүх файл)", f"Шинэ судалгааны хувилбар: Google Sheets clean хуудасны нийтэлсэн CSV, checked "
        f"{min(r['checked'] for r in rows)}…{max(r['checked'] for r in rows)}",
        f"Snapshot {SNAPSHOT.relative_to(ROOT).as_posix()} (sha256 {snapshot_hash[:16]}…)-оос v2 үүсгэв; "
        f"v1 гаралтыг data/clean/{ARCHIVE_V1.as_posix()}/-д хадгалав; data/raw/ өөрчлөгдөөгүй", len(rows))
    online = [b for b in banks_both if new[b]["channel"] == "online" and old[b]["channel"] != "online"]
    add("channel", "Онлайн хадгаламжийн хүүг сонгосон: " + "; ".join(f"{name[b]} {old[b]['channel']}→online" for b in online),
        "v1-ийн «салбарын хүү» сувгийн дүрмийг орлож судалгаанд сонгосон онлайн бүтээгдэхүүний хүүг бүртгэв", len(online))
    other_ch = [b for b in banks_both if new[b]["channel"] != old[b]["channel"] and b not in online]
    add("channel", "Сувгийн бусад ангиллын өөрчлөлт: " + ("; ".join(f"{name[b]} {old[b]['channel']}→{new[b]['channel']}"
        for b in other_ch) or "байхгүй"), "Судалгааны хувилбарын ангиллыг авав (any = суваг хамаарахгүй)", len(other_ch))
    updated = [b for b in banks_both if any(o and n for _t, o, n in diff_cells(b))]
    n_upd = sum(1 for b in banks_both for _t, o, n in diff_cells(b) if o and n)
    add("m3/m6/m12/m24", f"Хүүгийн тоон утгын шинэчлэлт ({n_upd} нүд): " + "; ".join(
        f"{name[b]} " + ", ".join(f"{t} {o}→{n}" for t, o, n in diff_cells(b) if o and n) for b in updated),
        "Шинэ судалгааны утгаар сольсон (тоон хэлбэр, цэгтэй аравтын)", len(updated))
    nominal = [b for b in banks_both if new[b]["note"] != old[b]["note"]
               and ("нэрлэсэн" in new[b]["note"] or "үр ашигт" in new[b]["note"])]
    add("note / m12 / m24", "Нэрлэсэн болон үр ашигт хүүг ялгасан: " + ", ".join(name[b] for b in nominal),
        "Бүх нүдэнд жилийн нэрлэсэн хүүг бүртгэнэ; үр ашигт хүүг тооцоонд ашиглахгүй, note-д тэмдэглэнэ", len(nominal))
    specific = [
        ("xac", "m3/m6/m12/m24", "ХасБанкны нэрлэсэн хүү: v1-д нийлмэл хүүтэй гэж хассан (хоосон)",
         "Жилийн нэрлэсэн хүүг бүртгэв; note «Нийлмэл хүүтэй» хэвээр. Зөвхөн энгийн хүүгийн жишиг тооцоонд — dashboard-ийн D15(5) хасалт хэвээр"),
        ("bogd", "m3/m6/m12/note", "Богд банкны шаталсан хүү (note: 2 сая хүртэл 13%, дээш 13.5%)",
         "m12-д 13%-ийг бүртгэв, шатлалыг note-д; 10 сая ₮-д дээд шат хамаарах эсэхийг баталгаажуулаагүй"),
        ("mbank", "note", "М банкны нэмэлт нэг хоногийн нөхцөл («сонгосон хугацаанд 1 хоног нэмж»)",
         "Нэмэлт хоногийг хүү ба net12-д тооцоогүй; note-д тэмдэглэв"),
        ("capitron", "m3/m6/m12/m24", "Капитрон банкны нэмэгдүүлсэн хүү (нэмэгдэл 1 нэгж хувь багтсан)",
         "Нэмэгдэл хүүгийн нөхцөл хангагдсан гэж үзэж бүртгэсэн хүүнд багтаав; note-д тэмдэглэв"),
        ("transbank", "m12/m24", "Тээвэр хөгжлийн банкны нэрлэсэн хүү (v1-д улирал бүр олгодог тул хоосон; 14.75% үр ашигт)",
         "12 ба 24 сарын нэрлэсэн 14%-ийг бүртгэв; 14.75%-ийг ашиглаагүй"),
    ]
    for b, col, issue, change in specific:
        changed = b in banks_both and (diff_cells(b) or new[b]["note"] != old[b]["note"])
        add(col, f"{issue}: {show(b) if b in banks_both else 'мөр алга'}", change, int(bool(changed)))
    empties_changed = [b for b in banks_both if [t for t in V2_TERMS if not old[b][t]] != [t for t in V2_TERMS if not new[b][t]]]
    v1_empty = sum(1 for b in banks_both for t in V2_TERMS if not old[b][t])
    add("m3/m6/m12/m24", f"Хоосон хүүгийн нүд {v1_empty} → {len(empty)} ({' '.join(f'{b}.{t}' for b, t, _ in empty)})",
        "Хоосныг 0 болгоогүй; шалтгааныг note-д («24 сарын хүүгийн мэдээлэл байхгүй»)", len(empties_changed))
    src = [b for b in banks_both if new[b]["source"] != old[b]["source"]]
    add("source", "Эх сурвалжийн холбоос өөрчлөгдсөн: " + ", ".join(name[b] for b in src),
        "Судалгаанд ашигласан бүтээгдэхүүний хуудсаар солив (https)", len(src))
    chk = [b for b in banks_both if new[b]["checked"] != old[b]["checked"]]
    add("checked", f"Шалгасан огноо {min(old[b]['checked'] for b in chk)}…{max(old[b]['checked'] for b in chk)} → "
        f"{min(new[b]['checked'] for b in chk)}…{max(new[b]['checked'] for b in chk)}" if chk else "Шалгасан огноо өөрчлөгдөөгүй",
        "Судлаачийн шалгасан огноог авав", len(chk))
    notes = [b for b in banks_both if new[b]["note"] != old[b]["note"]]
    add("note", "note баганын өөрчлөлт (" + ", ".join(b for b in notes) + ")",
        "Шинэ тайлбарыг авав; note таслал/хашилт агуулж болно (RFC 4180) — v1-ийн «таслалгүй» дүрэм хүчингүй", len(notes))
    add("net12", "net12 тооцооллын багана нэмэгдсэн (Sheets томьёо, 11 дэх багана)",
        f"net12 = 10 000 000 × m12/100 × 0.9 (10% татварын дараах энгийн нэрлэсэн жишиг); скрипт Decimal half-up-аар "
        f"дахин бодож тулгав — {len(rows) - len(net_diff)}/{len(rows)} тэнцүү, хамгийн их зөрүү {max_diff} ₮", len(rows))
    add("bank_id", "Давхардсан bank_id шалгах", "Илрүүлэх (засахгүй)", len(dups))
    add("m3/m6/m12/m24", f"Хүү {RATE_MIN:g}–{RATE_MAX:g}%-иас гадуур", "Илрүүлэх (засахгүй)", len(out_range))
    add("channel", f"channel ангилал {'/'.join(V2_CHANNELS)}-аас гадуур", "Илрүүлэх (засахгүй)", len(bad_ch))
    log.append({"date": RESEARCHER_CHECK["recorded"], "column": "m3/m6/m12/m24",
                "issue": f"Судлаачийн гараар нягталсан төлөвийг бүртгэх ({RESEARCHER_CHECK['from']}…{RESEARCHER_CHECK['to']}; "
                         f"{RESEARCHER_CHECK['method']})",
                "change": "source_check.csv-д researcher_status / researcher_checked / researcher_method багана нэмэв; "
                          "автомат файл-нотолгооны result баганыг өөрчлөөгүй (PASS болгоогүй); "
                          "snapshot-оос өөрчлөгдсөн утгыг dashboard «Дахин нягтлах шаардлагатай» гэж тэмдэглэнэ",
                "affected_rows": rs_count["VERIFIED_BY_RESEARCHER"]})

    # ---- outputs -----------------------------------------------------------------------
    out_dir.mkdir(parents=True, exist_ok=True)
    write_csv(out_dir / "rates_clean.csv", V2_COLUMNS, rows)
    write_csv(out_dir / "rates_long_clean.csv",
              ["bank_id", "bank", "channel", "term", "term_months", "rate_percent", "value_status", "v1_channel",
               "v1_rate_percent", "change_vs_v1", "source_evidence", "source", "checked"], long_rows)
    write_csv(out_dir / "cleaning_log.csv", LOG_COLUMNS, log)
    missing = [{"column": c, "total": len(rows), "missing": sum(1 for r in rows if not r.get(c)),
                "missing_pct": pct(sum(1 for r in rows if not r.get(c)), len(rows))} for c in V2_COLUMNS]
    missing.append({"column": "m3+m6+m12+m24", "total": len(cells), "missing": len(empty), "missing_pct": pct(len(empty), len(cells))})
    write_csv(out_dir / "missing_values.csv", ["column", "total", "missing", "missing_pct"], missing)
    write_csv(out_dir / "source_check.csv",
              ["bank_id", "bank", "term", "v2_rate_percent", "v2_channel", "result", "raw_row_ids", "evidence",
               "v1_rate_percent", "source_url", "checked", "researcher_status", "researcher_checked",
               "researcher_method"], checks)
    write_csv(out_dir / "quality_checks.csv", ["check", "result", "detail"], quality)

    v2_entries = sum(1 for e in log if e["date"] == V2_DATE)
    print(f"v2 snapshot: {SNAPSHOT.name} sha256 {snapshot_hash}")
    print(f"v2 rows: {len(rows)}; columns: {len(head)}; rate cells {len(cells)}, numeric {len(numeric)}, empty {len(empty)}")
    print(f"v2 log entries: {v2_entries} new + {len(log) - v2_entries} kept; evidence: {dict(sorted(ev_count.items()))}; "
          f"researcher: {dict(sorted(rs_count.items()))}")
    for q in quality:
        print(f"  {q['result']:<12} {q['check']} — {q['detail']}")
    return 1 if any(q["result"] == "FAIL" for q in quality) else 0


# ------------------------------------------------------------------ entry points

def main(out_dir: Path = OUT) -> int:
    v1 = build_v1(out_dir / ARCHIVE_V1)
    return build_v2(out_dir, v1)


# Files the website reads or that document the cleaning; they are published and must exist.
# Everything else in data/clean/ is regenerated by this script and kept out of git
# (.gitignore): rates_long_clean.csv, missing_values.csv, quality_checks.csv, archive/.
PUBLISHED = ("rates_clean.csv", "source_check.csv", "cleaning_log.csv")


def check() -> int:
    """Regenerate into a temporary folder and compare with data/clean/ byte by byte.

    Published files must exist and match. Optional (gitignored) files are compared when
    present and reported as skipped when absent, e.g. in a fresh clone.
    """
    with tempfile.TemporaryDirectory() as tmp:
        main(Path(tmp))
        produced = sorted(p.relative_to(tmp) for p in Path(tmp).rglob("*.csv"))
        stale, skipped, compared = [], [], 0
        for p in produced:
            target = OUT / p
            if not target.exists():
                (stale if p.as_posix() in PUBLISHED else skipped).append(p.as_posix())
                continue
            compared += 1
            if target.read_bytes() != (Path(tmp) / p).read_bytes():
                stale.append(p.as_posix())
    if stale:
        print("data/clean/ is out of date:", ", ".join(stale), "- run: python src/clean_rates.py")
        return 1
    note = f"; not present, skipped (optional, regenerate with python src/clean_rates.py): {', '.join(skipped)}" if skipped else ""
    print(f"OK: data/clean/ matches a fresh run ({compared} of {len(produced)} files compared{note})")
    return 0


def fetch_live() -> bytes:
    with urllib.request.urlopen(SHEETS_CSV_URL, timeout=30) as resp:  # follows the 307 to googleusercontent
        if resp.status != 200:
            raise SystemExit(f"HTTP {resp.status}")
        return resp.read()


def compare_live() -> int:
    """Fetch the published Sheets CSV and compare it record by record with data/clean/rates_clean.csv."""
    live = fetch_live()
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp) / "live.csv"
        f.write_bytes(live)
        live_head, live_rows = read_table(f)
    head, rows = read_table(OUT / "rates_clean.csv")
    print(f"live: {len(live)} bytes, sha256 {hashlib.sha256(live).hexdigest()}; snapshot sha256 {sha256(SNAPSHOT)}")
    diffs = [] if live_head == head else [f"header: {live_head} != {head}"]
    for i in range(max(len(rows), len(live_rows))):
        a = rows[i] if i < len(rows) else None
        b = live_rows[i] if i < len(live_rows) else None
        if a != b:
            diffs.append(f"row {i + 2}: local {a} != live {b}")
    if diffs:
        print(f"DIFFERENT: {len(diffs)} difference(s)")
        print("\n".join(diffs))
        return 1
    print(f"MATCH: header + {len(rows)} rows × {len(head)} columns identical (local data/clean/rates_clean.csv = Google Sheets)")
    return 0


def fetch_snapshot() -> int:
    path = SNAPSHOT.parent / f"sheets_clean_{date.today().isoformat()}.csv"
    if path.exists():
        print(f"{path.relative_to(ROOT)} already exists — not overwritten (snapshots are immutable)")
        return 1
    data = fetch_live()
    path.write_bytes(data)
    print(f"saved {path.relative_to(ROOT)} ({len(data)} bytes, sha256 {hashlib.sha256(data).hexdigest()}); "
          "set SNAPSHOT in src/clean_rates.py to use it")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--check" in args:
        sys.exit(check())
    if "--compare-live" in args:
        sys.exit(compare_live())
    if "--fetch" in args:
        sys.exit(fetch_snapshot())
    sys.exit(main())
