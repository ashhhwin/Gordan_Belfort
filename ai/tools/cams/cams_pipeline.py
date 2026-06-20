#!/usr/bin/env python3
"""
cams_pipeline.py
================
End-to-end pipeline:
  1. Submit CAMS CAS requests for all family members (with PAN + without PAN)
  2. Poll Gmail (via IMAP) for the incoming CAMS email with PDF attachment
  3. Download and decrypt the password-protected PDF
  4. Parse the holdings table via cams_extractor
  5. Save a CSV per statement into the output folder

Requirements:
    pip install pdfplumber pikepdf playwright python-dotenv
    playwright install chromium

.env keys needed (in secrets/.env):
    # Gmail (single inbox — family members forward their CAMS emails here)
    GMAIL_EMAIL=you@gmail.com
    GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx

    # Family members
    CAMS_EMAIL_1=dad@example.com
    CAMS_PASSWORD_1=pass1
    CAMS_PAN_1=AAAAA0001A

    CAMS_EMAIL_2=mom@example.com
    CAMS_PASSWORD_2=pass2
    CAMS_PAN_2=BBBBB0002B

    # ...and so on

    # Optional shared settings
    CAMS_OUTPUT_DIR=./cams-statements
    CAMS_HEADLESS=true
    CAMS_STAT_TYPE=Summary
    CAMS_AS_ON_DATE=
    CAMS_FOLIO_LISTING=without_zero
    CAMS_POLL_TIMEOUT=300     # seconds to wait per email before giving up
    CAMS_POLL_INTERVAL=20     # seconds between inbox checks
"""

import os
import re
import time
import imaplib
import email
import email.policy
from datetime import datetime

import pikepdf
from dotenv import load_dotenv

from cams_statement  import request_cas
from cams_parser  import extract_cams_table, save_csv

# ── Load env ──────────────────────────────────────────────────────────────────

load_dotenv(dotenv_path=os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env")))

GMAIL_EMAIL      = os.getenv("GMAIL_EMAIL")
GMAIL_APP_PWD    = os.getenv("GMAIL_APP_PASSWORD")
OUTPUT_DIR       = os.getenv("CAMS_OUTPUT_DIR", os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "database", "data", "raw", "cams")))
CLEANED_DIR      = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "database", "data", "cleaned", "cams"))
HEADLESS         = os.getenv("CAMS_HEADLESS", "false").lower() == "true"
STAT_TYPE        = os.getenv("CAMS_STAT_TYPE", "Summary")
AS_ON_DATE       = os.getenv("CAMS_AS_ON_DATE", "")
FOLIO_LISTING    = os.getenv("CAMS_FOLIO_LISTING", "without_zero")
POLL_TIMEOUT     = int(os.getenv("CAMS_POLL_TIMEOUT", "300"))
POLL_INTERVAL    = int(os.getenv("CAMS_POLL_INTERVAL", "20"))

# CAMS sends statements from this address
CAMS_SENDER_PATTERN = re.compile(r"(camsonline|cams|kfintech)", re.IGNORECASE)


# ── Logging ───────────────────────────────────────────────────────────────────

def _log(label, msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [{label}] {msg}", flush=True)


# ── Step 1 — load family from env ─────────────────────────────────────────────

def load_family_from_env() -> list:
    """
    Read family members from numbered env vars:
        CAMS_EMAIL_1, CAMS_PASSWORD_1, CAMS_PAN_1
        CAMS_EMAIL_2, CAMS_PASSWORD_2, CAMS_PAN_2  ...
    Returns a list of dicts.
    """
    members = []
    i = 1
    while os.getenv(f"CAMS_EMAIL_{i}"):
        members.append({
            "email":    os.getenv(f"CAMS_EMAIL_{i}"),
            "password": os.getenv(f"CAMS_PASSWORD_{i}"),
            "pan":      os.getenv(f"CAMS_PAN_{i}", ""),
        })
        i += 1
    if not members:
        raise ValueError("No family members found. Set CAMS_EMAIL_1, CAMS_PASSWORD_1, etc. in .env")
    return members


# ── Step 2 — Gmail polling ────────────────────────────────────────────────────

def _imap_connect() -> imaplib.IMAP4_SSL:
    mail = imaplib.IMAP4_SSL("imap.gmail.com")
    mail.login(GMAIL_EMAIL, GMAIL_APP_PWD)
    mail.select("inbox")
    return mail


def _search_cams_emails_since(mail: imaplib.IMAP4_SSL, since_epoch: float) -> list:
    """Return UIDs of unread CAMS emails received after since_epoch."""
    # IMAP DATE search is day-granular; we refine by checking the exact timestamp below
    date_str = datetime.fromtimestamp(since_epoch).strftime("%d-%b-%Y")
    status, data = mail.search(None, f'(UNSEEN SINCE "{date_str}")')
    if status != "OK" or not data[0]:
        return []
    uids = data[0].split()
    # Filter to only those actually after since_epoch
    result = []
    for uid in uids:
        status, msg_data = mail.fetch(uid, "(BODY[HEADER.FIELDS (FROM DATE SUBJECT)])")
        if status != "OK":
            continue
        raw = msg_data[0][1]
        msg = email.message_from_bytes(raw, policy=email.policy.default)
        sender = msg.get("From", "")
        if not CAMS_SENDER_PATTERN.search(sender):
            continue
        # Parse the Date header
        date_tuple = email.utils.parsedate_tz(msg.get("Date", ""))
        if not date_tuple:
            continue
        msg_ts = email.utils.mktime_tz(date_tuple)
        if msg_ts >= since_epoch:
            result.append(uid)
    return result


def poll_for_cams_email(since_epoch: float, label: str) -> bytes | None:
    """
    Poll Gmail every POLL_INTERVAL seconds until a CAMS email with a PDF
    attachment arrives (or POLL_TIMEOUT is exceeded).

    Returns the raw bytes of the PDF attachment, or None on timeout.
    """
    deadline = time.time() + POLL_TIMEOUT
    attempt  = 0

    while time.time() < deadline:
        attempt += 1
        _log(label, f"Polling Gmail... (attempt {attempt})")
        try:
            mail = _imap_connect()
            uids = _search_cams_emails_since(mail, since_epoch)

            for uid in uids:
                status, msg_data = mail.fetch(uid, "(RFC822)")
                if status != "OK":
                    continue
                msg = email.message_from_bytes(msg_data[0][1], policy=email.policy.default)
                for part in msg.walk():
                    ct = part.get_content_type()
                    part.get_content_disposition() or ""
                    fname = part.get_filename() or ""
                    if ct == "application/pdf" or (fname.lower().endswith(".pdf")):
                        _log(label, f"Found attachment: {fname}")
                        # Mark as read so we don't pick it up again
                        mail.store(uid, "+FLAGS", "\\Seen")
                        mail.logout()
                        return part.get_payload(decode=True), fname

            mail.logout()
        except Exception as e:
            _log(label, f"IMAP error: {e}")

        remaining = int(deadline - time.time())
        if remaining > 0:
            _log(label, f"No email yet. Waiting {POLL_INTERVAL}s... ({remaining}s left)")
            time.sleep(POLL_INTERVAL)

    _log(label, "Timed out waiting for CAMS email.")
    return None, None


# ── Step 3 — decrypt PDF ──────────────────────────────────────────────────────

def decrypt_pdf(pdf_bytes: bytes, password: str, dest_path: str) -> bool:
    """
    Unlock a password-protected PDF and write the decrypted version to dest_path.
    Returns True on success.
    """
    try:
        with pikepdf.open(pdf_bytes if isinstance(pdf_bytes, str) else
                          __import__("io").BytesIO(pdf_bytes),
                          password=password) as pdf:
            pdf.save(dest_path)
        return True
    except pikepdf.PasswordError:
        return False


# ── Step 4 — full single-member run ──────────────────────────────────────────

def run_for_member(member: dict) -> dict:
    """
    Full pipeline for one member:
      - Submit CAS request (with PAN if available, always without PAN)
      - Wait for email, download PDF, decrypt, parse, save CSV
    Returns a summary dict of results.
    """
    email_addr = member["email"]
    password   = member["password"]
    pan        = member.get("pan", "")
    results    = {}

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    runs = []
    if pan:
        runs.append({"pan": pan,  "label": f"{email_addr}|with_pan"})
    runs.append(    {"pan": "",   "label": f"{email_addr}|no_pan"})

    for run in runs:
        run_pan   = run["pan"]
        label     = run["label"]
        pan_tag   = "with_pan" if run_pan else "no_pan"
        ts        = datetime.now().strftime("%Y%m%d_%H%M%S")
        base_name = f"{email_addr.split('@')[0]}_{pan_tag}_{ts}"

        _log(label, "Submitting CAMS request...")
        submit_time = time.time()

        ok = request_cas(
            email         = email_addr,
            password      = password,
            pan           = run_pan,
            stat_type     = STAT_TYPE,
            as_on_date    = AS_ON_DATE,
            folio_listing = FOLIO_LISTING,
            headless      = HEADLESS,
            output_dir    = OUTPUT_DIR,
        )

        if not ok:
            _log(label, "Form submission failed. Skipping.")
            results[pan_tag] = {"status": "submit_failed"}
            continue

        _log(label, "Submission successful. Waiting for email...")
        pdf_bytes, fname = poll_for_cams_email(since_epoch=submit_time, label=label)

        if not pdf_bytes:
            results[pan_tag] = {"status": "email_timeout"}
            continue

        # Save the raw (encrypted) PDF for reference
        raw_pdf_path = os.path.join(OUTPUT_DIR, f"{base_name}_raw.pdf")
        with open(raw_pdf_path, "wb") as f:
            f.write(pdf_bytes)
        _log(label, f"Saved raw PDF: {raw_pdf_path}")

        # Decrypt
        dec_pdf_path = os.path.join(OUTPUT_DIR, f"{base_name}.pdf")
        _log(label, "Decrypting PDF...")
        if not decrypt_pdf(pdf_bytes, password, dec_pdf_path):
            _log(label, "Decryption failed — wrong password?")
            results[pan_tag] = {"status": "decrypt_failed", "raw_pdf": raw_pdf_path}
            continue
        _log(label, f"Decrypted PDF saved: {dec_pdf_path}")

        # Parse
        _log(label, "Parsing holdings table...")
        records = extract_cams_table(dec_pdf_path)

        if not records:
            _log(label, "No records found in PDF.")
            results[pan_tag] = {"status": "parse_empty", "pdf": dec_pdf_path}
            continue

        os.makedirs(CLEANED_DIR, exist_ok=True)
        csv_path = os.path.join(CLEANED_DIR, f"{base_name}.csv")
        save_csv(records, csv_path)
        _log(label, f"CSV saved: {csv_path}  ({len(records)} holdings)")

        results[pan_tag] = {
            "status":   "ok",
            "holdings": len(records),
            "csv":      csv_path,
            "pdf":      dec_pdf_path,
        }

    return results


# ── Step 5 — run all members ──────────────────────────────────────────────────

def run_pipeline() -> dict:
    """
    Load all family members from .env and run the full pipeline for each.
    Returns a nested dict of results keyed by email.
    """
    if not GMAIL_EMAIL or not GMAIL_APP_PWD:
        raise ValueError("GMAIL_EMAIL and GMAIL_APP_PASSWORD must be set in secrets/.env")

    members    = load_family_from_env()
    all_results = {}

    _log("pipeline", f"Starting pipeline for {len(members)} member(s).")

    for i, member in enumerate(members, 1):
        _log("pipeline", f"── Member {i}/{len(members)}: {member['email']} ──")
        all_results[member["email"]] = run_for_member(member)

    # Print summary
    print("\n── Pipeline Summary " + "─" * 40)
    for email_addr, runs in all_results.items():
        for pan_tag, info in runs.items():
            status = info.get("status", "?")
            extra  = f"  →  {info['csv']}" if status == "ok" else ""
            print(f"  {status:15s}  {email_addr} [{pan_tag}]{extra}")
    print()

    return all_results


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_pipeline()