from playwright.sync_api import sync_playwright
from datetime import date
from imap_tools import MailBox
from dotenv import load_dotenv
import os
import time
import re
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Load secrets from project root
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(os.path.normpath(env_path))

PHONE        = os.getenv("INDMONEY_PHONE")
PIN          = os.getenv("INDMONEY_PIN")
EMAIL        = os.getenv("GMAIL_EMAIL")
APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
HEADLESS     = str(os.getenv("INDMONEY_HEADLESS", "False")).lower() == "true"

URL = "https://www.indmoney.com/widget/page?page=reportsDetailPage&report_type=holdings_report"


@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=10))
def get_otp(timeout=120):
    start = time.time()
    with MailBox("imap.gmail.com").login(EMAIL, APP_PASSWORD) as mailbox:
        while True:
            if time.time() - start > timeout:
                raise Exception("OTP not received within timeout")
            print("Checking Gmail for OTP...")
            for msg in mailbox.fetch(reverse=True, limit=30):
                if "INDmoney" not in (msg.subject or ""):
                    continue
                content = (msg.text or "") + (msg.html or "")
                for code in re.findall(r"\b\d{6}\b", content):
                    if code != "000000":
                        print(f"OTP found: {code}")
                        return code
            print("No OTP yet, retrying in 5s...")
            time.sleep(5)


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def download_indmoney_report():
    project_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
    save_dir     = os.path.join(project_root, "database", "data", "raw", "indmoney")
    os.makedirs(save_dir, exist_ok=True)
    save_path    = os.path.join(save_dir, "latest.xlsx")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        context = browser.new_context(accept_downloads=True)
        page    = context.new_page()

        # Step 1: Open page
        print("Opening INDmoney...")
        page.goto(URL)
        time.sleep(2)

        # Step 2: Enter phone and trigger login
        print("Entering phone number...")
        page.get_by_placeholder("Enter 10 digits mobile number").fill(PHONE)
        time.sleep(1)
        page.locator("text=Sign up / Login").first.click()
        print("Waiting for OTP email...")
        time.sleep(6)

        # Step 3: Get OTP and fill — auto-submits
        otp = get_otp()
        print(f"Entering OTP: {otp}")
        page.fill("input[name='otp']", otp)

        # Step 4: Wait for MPIN page
        page.wait_for_url("**/journey/2fa**", timeout=20000)
        print("On MPIN page, entering PIN...")
        time.sleep(1)

        # Step 5: Enter PIN — auto-submits
        for selector in ["input[type='password']", "input[type='tel']", "input[type='number']", "input[type='text']"]:
            try:
                loc = page.locator(selector).first
                if loc.is_visible(timeout=2000):
                    loc.click()
                    loc.fill(PIN)
                    print(f"PIN entered via {selector}")
                    break
            except Exception:
                continue

        # Step 6: Wait for holdings report page
        page.wait_for_url("**/widget/page**", timeout=20000)
        print("On holdings report page")
        try:
            page.wait_for_selector("input[placeholder='DD/MM/YYYY']", timeout=15000)
        except Exception as e:
            print("Failed to find date input. Dumping HTML to debug.html...")
            with open("debug.html", "w") as f:
                f.write(page.content())
            page.screenshot(path="debug.png")
            raise e
        time.sleep(1)

        # Step 7: Set today's date
        today = date.today().strftime("%d/%m/%Y")
        print(f"Setting date to: {today}")
        
        # Click and fill the masked text input
        date_input = page.locator("input[placeholder='DD/MM/YYYY']")
        date_input.click()
        # Some inputs with masks behave better with type() instead of fill()
        # We will use type with a small delay to simulate typing
        date_input.fill("")
        date_input.type(today, delay=100)
        
        time.sleep(1)

        # Step 8: Download
        print("Downloading report...")
        with page.expect_download() as download_info:
            page.get_by_role("button", name="Download").click()

        download = download_info.value
        download.save_as(save_path)
        time.sleep(3)
        print(f"Raw file saved to: {save_path}")

        browser.close()

    return save_path


import gc

if __name__ == "__main__":
    download_indmoney_report()
    gc.collect()