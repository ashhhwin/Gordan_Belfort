import os
from datetime import datetime
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", "..", "..", "secrets", ".env"))

CONFIG = {
    "stat_type":     os.getenv("CAMS_STAT_TYPE", "Summary"),
    "as_on_date":    os.getenv("CAMS_AS_ON_DATE", ""),
    "folio_listing": os.getenv("CAMS_FOLIO_LISTING", "without_zero"),
    "email":         os.getenv("CAMS_EMAIL"),
    "pan":           os.getenv("CAMS_PAN", ""),
    "password":      os.getenv("CAMS_PASSWORD"),
    "headless":      os.getenv("CAMS_HEADLESS", "true").lower() == "true",
    "output_dir":    os.getenv("CAMS_OUTPUT_DIR", "./cams-statements"),
}
 
URL = "https://www.camsonline.com/Investors/Statements/Consolidated-Account-Statement"
 
FOLIO_VALUE = {
    "with_zero":    "N",
    "without_zero": "Y",
    "transacted":   "YT",
}
 
 
def log(msg):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)
 
 
def validate_config(cfg):
    if not cfg.get("email"):
        raise ValueError("CAMS_EMAIL is not set in secrets/.env")
    if not cfg.get("password"):
        raise ValueError("CAMS_PASSWORD is not set in secrets/.env")
 
 
def dismiss_disclaimer(page):
    try:
        page.wait_for_selector('text=Disclaimer', timeout=10000)
    except PlaywrightTimeoutError:
        return
 
    log("Disclaimer modal detected.")
    page.locator('input[type="radio"][value="ACCEPT"]').click(force=True)
    page.wait_for_timeout(1000)
 
    page.locator('input[type="button"][value="PROCEED"]').click(force=True)
    log("Disclaimer accepted.")
 
    page.wait_for_selector('mat-dialog-container', state='hidden', timeout=8000)
    page.wait_for_timeout(1500)
 
 
def fill_cas_form(page, cfg):
    log("Loading page...")
    page.goto(URL, wait_until="load", timeout=60000)
    page.wait_for_timeout(2000)
 
    dismiss_disclaimer(page)
 
    page.wait_for_selector('input[type="radio"]', timeout=15000)
    page.wait_for_timeout(1500)
 
    stat_val = "summary" if cfg["stat_type"] == "Summary" else "detailed"
    page.locator(f'input[type="radio"][value="{stat_val}"]').click(force=True)
    page.wait_for_timeout(1000)
 
    if cfg["stat_type"] == "Summary" and cfg["as_on_date"]:
        date_field = page.locator('input[type="text"]').first
        date_field.triple_click()
        date_field.fill(cfg["as_on_date"])
        page.wait_for_timeout(800)
 
    folio_val = FOLIO_VALUE.get(cfg["folio_listing"], "Y")
    page.locator(f'input[type="radio"][value="{folio_val}"]').click(force=True)
    page.wait_for_timeout(1000)
 
    page.locator('input[placeholder="Email"]').fill(cfg["email"])
    page.wait_for_timeout(500)
 
    if cfg["pan"]:
        page.locator('input[placeholder="PAN"]').fill(cfg["pan"].upper())
        page.wait_for_timeout(500)
 
    page.locator('input[placeholder="Password"]').fill(cfg["password"])
    page.wait_for_timeout(400)
    page.locator('input[placeholder="Confirm Password"]').fill(cfg["password"])
    page.wait_for_timeout(800)
 
    log("Submitting form...")
    page.locator('button:has-text("Submit")').click()
    page.wait_for_timeout(5000)
    log("Done. Statement will be sent to your email.")
 
 
def main():
    validate_config(CONFIG)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=CONFIG["headless"])
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()
        try:
            fill_cas_form(page, CONFIG)
        except Exception as e:
            os.makedirs(CONFIG["output_dir"], exist_ok=True)
            page.screenshot(path=os.path.join(CONFIG["output_dir"], "error.png"), full_page=True)
            log(f"ERROR: {e}")
            raise
        finally:
            browser.close()
 
 
if __name__ == "__main__":
    main()