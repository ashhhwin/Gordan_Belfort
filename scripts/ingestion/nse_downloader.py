import os
import time
import json
import requests
from datetime import date
from tenacity import retry, stop_after_attempt, wait_exponential

ENDPOINTS = {
    "etf": "https://www.nseindia.com/api/etf",
    "indices": "https://www.nseindia.com/api/allIndices",
    "price_band_hitters": "https://www.nseindia.com/api/live-analysis-price-band-hitter",
    "volume_gainers": "https://www.nseindia.com/api/live-analysis-volume-gainers?mode=laVolumeGainer",
    "52week_high": "https://www.nseindia.com/api/live-analysis-data-52weekhighstock",
    "52week_low": "https://www.nseindia.com/api/live-analysis-data-52weeklowstock",
    "large_deals_bulk": "https://www.nseindia.com/api/snapshot-capital-market-largedeal?objName=BULK_DEALS_DATA&fileName=BULK",
    "large_deals_block": "https://www.nseindia.com/api/snapshot-capital-market-largedeal?objName=BLOCK_DEALS_DATA&fileName=BLOCK",
    "large_deals_short": "https://www.nseindia.com/api/snapshot-capital-market-largedeal?objName=SHORT_DEALS_DATA&fileName=SHORT",
    "advances_declines": "https://www.nseindia.com/api/live-analysis-advance",
    "stocks_traded": "https://www.nseindia.com/api/live-analysis-stocksTraded"
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Connection": "keep-alive"
}

project_root = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
save_dir = os.path.join(project_root, "database", "data", "raw", "nse")
os.makedirs(save_dir, exist_ok=True)

@retry(stop=stop_after_attempt(5), wait=wait_exponential(multiplier=1, min=2, max=10))
def fetch_endpoint(session, name, url):
    print(f"Fetching {name}...")
    res = session.get(url, timeout=15)
    res.raise_for_status()
    
    # Try parsing as JSON to ensure it's valid before saving
    data = res.json()
    
    file_path = os.path.join(save_dir, f"{name}.json")
    with open(file_path, "w") as f:
        json.dump(data, f)
    print(f"Saved {name} to {file_path}")

def main():
    print("Initializing session to grab NSE cookies...")
    session = requests.Session()
    session.headers.update(HEADERS)
    
    # NSE blocks direct API calls without a valid session cookie from the homepage
    session.get("https://www.nseindia.com", timeout=15)
    time.sleep(1)
    
    for name, url in ENDPOINTS.items():
        try:
            fetch_endpoint(session, name, url)
            time.sleep(2) # be nice to NSE servers
        except Exception as e:
            print(f"Failed to fetch {name}: {e}")
            raise e

if __name__ == "__main__":
    main()
