"""Week 4 cleaning pipeline: data/raw/rates_raw.csv -> data/clean/.

Run from the project root:  python src/clean_rates.py
Verify that data/clean/ is up to date:  python src/clean_rates.py --check
Standard library only (Python 3.11+). Deterministic: running it again on the
same inputs produces byte-identical outputs. data/raw/ is never modified.

Outputs (data/clean/):
  rates_long_clean.csv  one row per unique published rate, parsed and classified
  rates_clean.csv       wide table for the course: bank, m3, m6, m12, m24, ...
  cleaning_log.csv      what changed, why, and how many rows were affected
  missing_values.csv    missing-value count and percent per raw column
  source_check.csv      cross-check against data/deposits.json + random sample
"""

from __future__ import annotations

import csv
import json
import random
import tempfile
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "rates_raw.csv"
RECHECKS = ROOT / "data" / "raw" / "rechecks.csv"
DATASET = ROOT / "data" / "deposits.json"
OUT = ROOT / "data" / "clean"

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

def main(out_dir: Path = OUT) -> int:
    OUT = out_dir  # noqa: N806 — local override (used by --check)
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
    print(f"raw rows: {n_raw}; after dedupe: {len(rows)}; dropped: {len(dropped)}")
    print("status:", dict(sorted(counts.items())))
    print(f"wide rows: {len(wide_rows)}; json mismatches: {mismatches}; rechecks: {len(rechecks)}")
    return 0


def check() -> int:
    """Regenerate into a temporary folder and compare with data/clean/ byte by byte."""
    with tempfile.TemporaryDirectory() as tmp:
        main(Path(tmp))
        produced = sorted(Path(tmp).glob("*.csv"))
        stale = [f.name for f in produced
                 if not (OUT / f.name).exists() or (OUT / f.name).read_bytes() != f.read_bytes()]
    if stale:
        print("data/clean/ is out of date:", ", ".join(stale), "- run: python src/clean_rates.py")
        return 1
    print(f"OK: data/clean/ matches a fresh run ({len(produced)} files)")
    return 0


if __name__ == "__main__":
    sys.exit(check() if "--check" in sys.argv[1:] else main())
