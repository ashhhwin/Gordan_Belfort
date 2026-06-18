#!/usr/bin/env python3
"""
cams_statement.py
=================
Request a CAMS Consolidated Account Statement (CAS) via the CAMS website.
Designed to be called multiple times — e.g. for multiple family members,
with and without PAN.

Requirements:
    pip install playwright python-dotenv
    playwright install chromium

── As a module ────────────────────────────────────────────────────────────────
    from cams_statement import request_cas, request_cas_for_family

    # Single request
    request_cas(email="john@example.com", password="secret", pan="ABCDE1234F")

    # Batch — all family members, with and without PAN
    FAMILY = [
        {"email": "dad@example.com",   "password": "pass1", "pan": "AAAAA0001A"},
        {"email": "mom@example.com",   "password": "pass2", "pan": "BBBBB0002B"},
        {"email": "son@example.com",   "password": "pass3", "pan": "CCCCC0003C"},
        {"email": "daughter@example.com", "password": "pass4", "pan": "DDDDD0004D"},
    ]
    request_cas_for_family(FAMILY)

── As a script ────────────────────────────────────────────────────────────────
    python cams_statement.py
    (reads credentials from secrets/.env, runs for a single account)
"""

import os
import time
from datetime import datetime
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_result

load_dotenv(dotenv_path=os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")))

# ── Constants ─────────────────────────────────────────────────────────────────

URL = "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"

FOLIO_VALUE = {
    "with_zero":    "N",
    "without_zero": "Y",
    "transacted":   "YT",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log(email, msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] [{email}] {msg}", flush=True)


def _dismiss_disclaimer(page, email):
    try:
        page.wait_for_selector("text=Disclaimer", timeout=10000)
    except PlaywrightTimeoutError:
        return

    _log(email, "Disclaimer modal detected.")
    page.locator('input[type="radio"][value="ACCEPT"]').click(force=True)
    page.wait_for_timeout(1000)
    page.locator('input[type="button"][value="PROCEED"]').click(force=True)
    _log(email, "Disclaimer accepted.")
    page.wait_for_selector("mat-dialog-container", state="hidden", timeout=8000)
    page.wait_for_timeout(1500)


def _fill_and_submit(page, email, password, pan, stat_type, as_on_date, folio_listing):
    _log(email, "Loading page...")
    page.goto(URL, wait_until="load", timeout=60000)
    page.wait_for_timeout(2000)

    _dismiss_disclaimer(page, email)

    page.wait_for_selector('input[type="radio"]', timeout=15000)
    page.wait_for_timeout(1500)

    stat_val = "summary" if stat_type == "Summary" else "detailed"
    page.locator(f'input[type="radio"][value="{stat_val}"]').click(force=True)
    page.wait_for_timeout(1000)

    if stat_type == "Summary" and as_on_date:
        date_field = page.locator('input[type="text"]').first
        date_field.triple_click()
        date_field.fill(as_on_date)
        page.wait_for_timeout(800)

    folio_val = FOLIO_VALUE.get(folio_listing, "Y")
    page.locator(f'input[type="radio"][value="{folio_val}"]').click(force=True)
    page.wait_for_timeout(1000)

    page.locator('input[placeholder="Email"]').fill(email)
    page.wait_for_timeout(500)

    if pan:
        page.locator('input[placeholder="PAN"]').fill(pan.upper())
        page.wait_for_timeout(500)

    page.locator('input[placeholder="Password"]').fill(password)
    page.wait_for_timeout(400)
    page.locator('input[placeholder="Confirm Password"]').fill(password)
    page.wait_for_timeout(800)

    _log(email, "Submitting form...")
    page.locator('button:has-text("Submit")').click()
    page.wait_for_timeout(5000)
    _log(email, "Done. Statement will be sent to your email.")


# ── Public API ────────────────────────────────────────────────────────────────

def request_cas(
    email:          str,
    password:       str,
    pan:            str  = "",
    stat_type:      str  = "Summary",
    as_on_date:     str  = "",
    folio_listing:  str  = "without_zero",
    headless:       bool = False,
    output_dir:     str  = None,
) -> bool:
    """
    Request a CAMS CAS PDF for a single account. The statement is emailed
    by CAMS to the provided email address.

    Parameters
    ----------
    email          : Registered CAMS email address.
    password       : CAMS password (used to encrypt the PDF).
    pan            : PAN number (optional — omit to get folio-based statement).
    stat_type      : "Summary" or "Detailed".
    as_on_date     : Date string "DD-MMM-YYYY" (Summary only, e.g. "20-Mar-2026").
    folio_listing  : "without_zero" | "with_zero" | "transacted".
    headless       : Run browser in headless mode (default True).
    output_dir     : Directory to save error screenshots if something goes wrong.

    Returns
    -------
    bool : True on success, False if all retries failed.

    Example
    -------
        request_cas("john@example.com", "secret", pan="ABCDE1234F")
        request_cas("john@example.com", "secret")          # without PAN
    """
    if output_dir is None:
        output_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "database", "data", "raw", "cams", "errors"))

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10), retry=retry_if_result(lambda r: r is False))
    def _do_request():
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            page    = context.new_page()
            try:
                _fill_and_submit(
                    page, email, password, pan,
                    stat_type, as_on_date, folio_listing,
                )
                return True
            except Exception as e:
                os.makedirs(output_dir, exist_ok=True)
                screenshot = os.path.join(output_dir, f"error_{email.split('@')[0]}_{'pan' if pan else 'nopan'}.png")
                page.screenshot(path=screenshot, full_page=True)
                _log(email, f"ERROR: {e}  (screenshot: {screenshot})")
                return False
            finally:
                browser.close()

    try:
        return _do_request()
    except Exception:
        return False


def request_cas_for_family(
    members:        list,
    delay_seconds:  int  = 5,
    headless:       bool = False,
    output_dir:     str  = None,
    **shared_kwargs,
) -> dict:
    """
    Request CAS statements for multiple family members.
    Each member is run twice — once with PAN, once without.

    Parameters
    ----------
    members : list of dicts, each with:
                  email     (required)
                  password  (required)
                  pan       (required for the PAN run)

              Optional per-member overrides (same names as request_cas):
                  stat_type, as_on_date, folio_listing

    delay_seconds  : Seconds to wait between each request (default 5).
    headless       : Passed to every request_cas call.
    output_dir     : Passed to every request_cas call.
    **shared_kwargs: Any other request_cas keyword args applied to all members
                     (e.g. stat_type="Detailed", as_on_date="20-Mar-2026").

    Returns
    -------
    dict : { "email_with_pan": bool, "email_without_pan": bool, ... }
           True = success, False = error.

    Example
    -------
        FAMILY = [
            {"email": "dad@example.com",      "password": "pass1", "pan": "AAAAA0001A"},
            {"email": "mom@example.com",      "password": "pass2", "pan": "BBBBB0002B"},
            {"email": "son@example.com",      "password": "pass3", "pan": "CCCCC0003C"},
            {"email": "daughter@example.com", "password": "pass4", "pan": "DDDDD0004D"},
        ]
        results = request_cas_for_family(FAMILY)
    """
    results = {}

    for member in members:
        email    = member["email"]
        password = member["password"]
        pan      = member.get("pan", "")

        # Per-member overrides take priority over shared_kwargs
        kwargs = {**shared_kwargs, **{
            k: member[k]
            for k in ("stat_type", "as_on_date", "folio_listing")
            if k in member
        }}

        # Run 1: with PAN
        if pan:
            key = f"{email}_with_pan"
            _log(email, f"--- Run: WITH PAN ({pan}) ---")
            results[key] = request_cas(
                email=email, password=password, pan=pan,
                headless=headless, output_dir=output_dir, **kwargs,
            )
            time.sleep(delay_seconds)

        # Run 2: without PAN
        key = f"{email}_without_pan"
        _log(email, "--- Run: WITHOUT PAN ---")
        results[key] = request_cas(
            email=email, password=password, pan="",
            headless=headless, output_dir=output_dir, **kwargs,
        )

        # Pause between members (skip after last one)
        if member is not members[-1]:
            time.sleep(delay_seconds)

    # Summary
    print("\n── Results ──────────────────────────────────")
    for key, ok in results.items():
        status = "OK" if ok else "FAILED"
        print(f"  {status:6s}  {key}")
    print()

    return results


# ── CLI entry point ───────────────────────────────────────────────────────────

def main():
    cfg = {
        "email":         os.getenv("CAMS_EMAIL"),
        "password":      os.getenv("CAMS_PASSWORD"),
        "pan":           os.getenv("CAMS_PAN", ""),
        "stat_type":     os.getenv("CAMS_STAT_TYPE", "Summary"),
        "as_on_date":    os.getenv("CAMS_AS_ON_DATE", ""),
        "folio_listing": os.getenv("CAMS_FOLIO_LISTING", "without_zero"),
        "headless":      os.getenv("CAMS_HEADLESS", "false").lower() == "true",
        "output_dir":    os.getenv("CAMS_OUTPUT_DIR", None),
    }
    if not cfg["email"] or not cfg["password"]:
        raise ValueError("CAMS_EMAIL and CAMS_PASSWORD must be set in secrets/.env")

    request_cas(**cfg)


if __name__ == "__main__":
    main()