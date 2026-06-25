import os
import json
import io
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

# =========================
# CONFIGURATION
# =========================
BUCKET   = "historical_data_evoke"
BLOB     = "market_data/earnings_calendar.json"
KEY_PATH = os.getenv("GCP_SERVICE_ACCOUNT_KEY_PATH")

if not KEY_PATH:
    raise ValueError("GCP_SERVICE_ACCOUNT_KEY_PATH is not set in the environment.")

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_NAME     = os.getenv("DB_NAME", "stock_pilot")
DB_USER     = os.getenv("DB_USER", "ashwinram")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# =========================
# GCS AUTHENTICATION
# =========================
from google.cloud import storage
from google.oauth2 import service_account

credentials = service_account.Credentials.from_service_account_file(KEY_PATH)
gcs_client  = storage.Client(credentials=credentials, project=credentials.project_id)

# =========================
# POSTGRES CONNECTION
# =========================
conn = psycopg2.connect(
    host=DB_HOST, dbname=DB_NAME,
    user=DB_USER, password=DB_PASSWORD
)
cursor = conn.cursor()
cursor.execute("SET search_path TO market;")
cursor.execute("SET datestyle = 'ISO, MDY';")
conn.commit()

# =========================
# LOAD + FLATTEN JSON
# Structure: { "YYYY-MM-DD": [ {earnings record}, ... ], ... }
# =========================
def load_json() -> list[dict]:
    blob = gcs_client.bucket(BUCKET).blob(BLOB)
    with blob.open("rb") as f:
        data = json.load(f)

    rows = []
    for date_key, records in data.items():
        for r in records:
            rows.append({
                "date":             r.get("date"),
                "symbol":           r.get("symbol"),
                "hour":             r.get("hour") or None,   # "" → NULL
                "quarter":          r.get("quarter"),
                "year":             r.get("year"),
                "eps_actual":       r.get("epsActual"),
                "eps_estimate":     r.get("epsEstimate"),
                "revenue_actual":   r.get("revenueActual"),
                "revenue_estimate": r.get("revenueEstimate"),
            })
    return rows

# =========================
# INGEST — upsert on (date, symbol)
# =========================
def ingest(rows: list[dict]):
    upsert_sql = """
        INSERT INTO market.earnings_calendar (
            date, symbol, hour, quarter, year,
            eps_actual, eps_estimate, revenue_actual, revenue_estimate
        )
        VALUES (
            %(date)s, %(symbol)s, %(hour)s, %(quarter)s, %(year)s,
            %(eps_actual)s, %(eps_estimate)s, %(revenue_actual)s, %(revenue_estimate)s
        )
        ON CONFLICT (date, symbol)
        DO UPDATE SET
            hour             = EXCLUDED.hour,
            quarter          = EXCLUDED.quarter,
            year             = EXCLUDED.year,
            eps_actual       = EXCLUDED.eps_actual,
            eps_estimate     = EXCLUDED.eps_estimate,
            revenue_actual   = EXCLUDED.revenue_actual,
            revenue_estimate = EXCLUDED.revenue_estimate;
    """
    cursor.executemany(upsert_sql, rows)
    conn.commit()

# =========================
# MAIN
# =========================
def run():
    print(f"Streaming: {BLOB}")
    rows = load_json()
    total   = len(rows)
    unique  = len({(r["date"], r["symbol"]) for r in rows})
    dupes   = total - unique
    print(f"Records in JSON      : {total:,}")
    print(f"Unique (date+symbol) : {unique:,}")
    print(f"Duplicates skipped   : {dupes:,}")
    ingest(rows)
    cursor.execute("SELECT COUNT(*) FROM market.earnings_calendar")
    db_count = cursor.fetchone()[0]
    print(f"Rows in table        : {db_count:,}")
    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()

import sys; sys.exit(0)
