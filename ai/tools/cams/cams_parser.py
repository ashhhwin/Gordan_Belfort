#!/usr/bin/env python3
"""
cams_extractor.py
=================
Importable module to extract the mutual fund holdings table from a
CAMS Consolidated Account Summary PDF and return it as a list of dicts
or save it as a CSV.

Requirements:
    pip install pdfplumber

── As a module ────────────────────────────────────────────────────────────────
    from cams_extractor import extract_cams_table, save_csv

    # Returns a list of dicts, one per holding
    records = extract_cams_table("ashwin.pdf")

    # Optionally save to CSV
    save_csv(records, "portfolio.csv")

── As a script ────────────────────────────────────────────────────────────────
    python cams_extractor.py input.pdf
    python cams_extractor.py input.pdf output.csv
"""

import sys
import csv
import re
from pathlib import Path
from collections import defaultdict

try:
    import pdfplumber
except ImportError:
    sys.exit("pdfplumber is required.  Run:  pip install pdfplumber")


# ── Internal constants ────────────────────────────────────────────────────────

# Column x-coordinate boundaries (PDF points, tuned for CAMS layout)
_COL_BOUNDS = {
    "folio":        (0,    75),
    "isin":         (75,   125),
    "scheme":       (125,  278),  
    "cost":         (278,  341),
    "units":        (341,  383),
    "nav_date":     (383,  435),
    "nav":          (435,  490),
    "market_value": (490,  535),  
    "registrar":    (535,  999),
}

_ISIN_RE   = re.compile(r"^INF[A-Z0-9]{7,}$")
_MERGED_RE = re.compile(r"^(.+?)(INF[A-Z0-9]{7,})$")

_HEADER_PATTERNS = (
    "Consolidated", "As on 2", "Folio No.", "Scheme Name",
    "Unit Balance", "NAV Date", "Cost Value", "(INR)",
    "Page ", "Email Id", "Mobile:", "Tamil Nadu", "Chennai",
    "kodambakkam", "CAMSCASWS", "Version:", "Live-",
    "Loads and Fees", "Total ",
)

_WATERMARK_PATTERNS = ("CAMSCASWS", "Version:", "Live-", "eviL", "noisreV")

# CSV column order and mapping to internal keys
HEADERS = [
    "Folio No.", "ISIN", "Scheme Name",
    "Cost Value (INR)", "Unit Balance", "NAV Date",
    "NAV (INR)", "Market Value (INR)", "Registrar",
]
_KEY_MAP = dict(zip(HEADERS, [
    "folio", "isin", "scheme", "cost", "units",
    "nav_date", "nav", "market_value", "registrar",
]))


# ── Private helpers ───────────────────────────────────────────────────────────

def _col_for(x):
    for col, (lo, hi) in _COL_BOUNDS.items():
        if lo <= x < hi:
            return col
    return None


def _group_into_lines(words, y_tol=2.0):
    if not words:
        return []
    sorted_words = sorted(words, key=lambda w: (round(w["top"] / y_tol), w["x0"]))
    lines, cur_y, cur = [], None, []
    for w in sorted_words:
        y = round(w["top"] / y_tol)
        if cur_y is None or y != cur_y:
            if cur:
                lines.append(cur)
            cur, cur_y = [w], y
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return lines


def _line_to_cols(line):
    row = defaultdict(list)
    for w in line:
        c = _col_for(w["x0"])
        if c:
            row[c].append(w["text"])
    return dict(row)


def _clean_num(words):
    return " ".join(words).replace(",", "") if words else ""


def _is_header_line(text):
    return any(p in text for p in _HEADER_PATTERNS)


def _is_watermark_line(line):
    flat = " ".join(w["text"] for w in line)
    return any(p in flat for p in _WATERMARK_PATTERNS)


def _detect_anchor(cols):
    """Return (folio, isin) if this line starts a new fund record, else None."""
    folio_str = " ".join(cols.get("folio", [])).strip()
    isin_str  = " ".join(cols.get("isin",  [])).strip()

    if _ISIN_RE.match(isin_str):
        return folio_str, isin_str

    if folio_str and not isin_str:
        m = _MERGED_RE.match(folio_str)
        if m:
            return m.group(1), m.group(2)

    return None


def _page_has_table(page):
    text = page.extract_text() or ""
    return "Loads and Fees" not in text[:600]


def _parse_lines(all_lines):
    records = []
    current = None

    for line in all_lines:
        cols   = _line_to_cols(line)
        anchor = _detect_anchor(cols)

        if anchor:
            if current:
                records.append(current)
            folio, isin = anchor
            current = {
                "folio":        folio,
                "isin":         isin,
                "scheme":       " ".join(cols.get("scheme", [])),
                "cost":         _clean_num(cols.get("cost",         [])),
                "units":        _clean_num(cols.get("units",        [])),
                "nav_date":     " ".join(cols.get("nav_date",       [])),
                "nav":          " ".join(cols.get("nav",            [])),
                "market_value": _clean_num(cols.get("market_value", [])),
                "registrar":    " ".join(cols.get("registrar",      [])),
            }

        else:
            if current is None:
                continue

            full_text = " ".join(w["text"] for w in line)
            if _is_header_line(full_text):
                continue

            scheme_words = cols.get("scheme", [])
            if scheme_words:
                extra = " ".join(scheme_words).strip()
                current["scheme"] = (current["scheme"] + " " + extra).strip()

            for col in ("cost", "units", "market_value"):
                if not current[col] and cols.get(col):
                    current[col] = _clean_num(cols[col])
            for col in ("nav_date", "nav", "registrar"):
                if not current[col] and cols.get(col):
                    current[col] = " ".join(cols[col])

    if current:
        records.append(current)

    return records


# ── Public API ────────────────────────────────────────────────────────────────

def extract_cams_table(pdf_path: str) -> list:
    """
    Parse a CAMS CAS PDF and return the holdings table as a list of dicts.

    Each dict has these keys:
        folio, isin, scheme, cost, units, nav_date, nav, market_value, registrar

    Parameters
    ----------
    pdf_path : str or Path
        Path to the CAMS PDF file.

    Returns
    -------
    list[dict]
        One dict per mutual fund holding. Empty list if nothing was found.

    Example
    -------
        records = extract_cams_table("ashwin.pdf")
        for r in records:
            print(r["scheme"], r["market_value"])
    """
    all_lines = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        for page in pdf.pages:
            if not _page_has_table(page):
                continue
            raw_lines = _group_into_lines(page.extract_words())
            filtered  = [l for l in raw_lines if not _is_watermark_line(l)]
            all_lines.extend(filtered)

    return _parse_lines(all_lines)


def save_csv(records: list, csv_path: str) -> None:
    """
    Write a list of holding dicts (from extract_cams_table) to a CSV file.

    Parameters
    ----------
    records  : list[dict]  — output of extract_cams_table()
    csv_path : str or Path — destination CSV file path

    Example
    -------
        records = extract_cams_table("ashwin.pdf")
        save_csv(records, "portfolio.csv")
    """
    with open(str(csv_path), "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=HEADERS)
        writer.writeheader()
        for rec in records:
            writer.writerow({h: rec.get(_KEY_MAP[h], "") for h in HEADERS})


# ── CLI entry point ───────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print("Usage: python cams_extractor.py <input.pdf> [output.csv]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    if not Path(pdf_path).exists():
        sys.exit(f"File not found: {pdf_path}")

    csv_path = (
        sys.argv[2] if len(sys.argv) > 2
        else str(Path(pdf_path).with_suffix(".csv"))
    )

    print(f"Reading:  {pdf_path}")
    records = extract_cams_table(pdf_path)

    if not records:
        sys.exit(
            "No records found.\n"
            "The PDF may be scanned, password-protected, or have an unexpected layout."
        )

    save_csv(records, csv_path)
    print(f"Saved:    {csv_path}")
    print(f"Holdings: {len(records)}")


if __name__ == "__main__":
    main()