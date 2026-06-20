import os
import io
import polars as pl
from google.cloud import storage
from google.oauth2 import service_account
import psycopg2
from psycopg2 import pool, extras
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

# =========================
# CONFIGURATION
# =========================
BUCKET     = "historical_data_evoke"
BASE_PATH  = "market_data/daily"
KEY_PATH   = os.getenv("GCP_SERVICE_ACCOUNT_KEY_PATH")

if not KEY_PATH:
    raise ValueError("GCP_SERVICE_ACCOUNT_KEY_PATH is not set in the environment.")

DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_NAME     = os.getenv("DB_NAME", "stock_pilot")
DB_USER     = os.getenv("DB_USER", "ashwinram")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
SCHEMA      = "market"

MAX_WORKERS = 10

# =========================
# FILE → TABLE CONFIG
# =========================
FILE_CONFIGS = {
    "revenue_estimates_quarterly.csv": {
        "table":       "market.revenue_estimates",
        "pipeline":    "revenue_estimates",
        "frequency":   "quarterly",
        "ordered_cols": [
            "ticker", "api_run_date", "frequency", "number_analysts",
            "period", "quarter", "revenue_avg", "revenue_high", "revenue_low", "year"
        ],
        "rename_map": {
            "ticker":         "ticker",
            "api_run_date":   "api_run_date",
            "numberAnalysts": "number_analysts",
            "period":         "period",
            "quarter":        "quarter",
            "revenueAvg":     "revenue_avg",
            "revenueHigh":    "revenue_high",
            "revenueLow":     "revenue_low",
            "year":           "year"
        }
    },
    "revenue_estimates_annual.csv": {
        "table":       "market.revenue_estimates",
        "pipeline":    "revenue_estimates",
        "frequency":   "annual",
        "ordered_cols": [
            "ticker", "api_run_date", "frequency", "number_analysts",
            "period", "quarter", "revenue_avg", "revenue_high", "revenue_low", "year"
        ],
        "rename_map": {
            "ticker":         "ticker",
            "api_run_date":   "api_run_date",
            "numberAnalysts": "number_analysts",
            "period":         "period",
            "quarter":        "quarter",
            "revenueAvg":     "revenue_avg",
            "revenueHigh":    "revenue_high",
            "revenueLow":     "revenue_low",
            "year":           "year"
        }
    },
    "eps_estimates_quarterly.csv": {
        "table":       "market.eps_estimates",
        "pipeline":    "eps_estimates",
        "frequency":   "quarterly",
        "ordered_cols": [
            "ticker", "api_run_date", "frequency", "eps_avg", "eps_high",
            "eps_low", "number_analysts", "period", "quarter", "year"
        ],
        "rename_map": {
            "ticker":         "ticker",
            "api_run_date":   "api_run_date",
            "epsAvg":         "eps_avg",
            "epsHigh":        "eps_high",
            "epsLow":         "eps_low",
            "numberAnalysts": "number_analysts",
            "period":         "period",
            "quarter":        "quarter",
            "year":           "year"
        }
    },
    "eps_estimates_annual.csv": {
        "table":       "market.eps_estimates",
        "pipeline":    "eps_estimates",
        "frequency":   "annual",
        "ordered_cols": [
            "ticker", "api_run_date", "frequency", "eps_avg", "eps_high",
            "eps_low", "number_analysts", "period", "quarter", "year"
        ],
        "rename_map": {
            "ticker":         "ticker",
            "api_run_date":   "api_run_date",
            "epsAvg":         "eps_avg",
            "epsHigh":        "eps_high",
            "epsLow":         "eps_low",
            "numberAnalysts": "number_analysts",
            "period":         "period",
            "quarter":        "quarter",
            "year":           "year"
        }
    }
}

EXCEL_ERRORS = ["#DIV/0!", "#N/A", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#NULL!", "#ERROR!"]
NULL_VALUES  = ["", "N/A", "n/a", "NULL", "null"] + EXCEL_ERRORS

# =========================
# GCS AUTHENTICATION — shared, thread-safe
# =========================
credentials = service_account.Credentials.from_service_account_file(KEY_PATH)
gcs_client  = storage.Client(credentials=credentials, project=credentials.project_id)

# =========================
# POSTGRES CONNECTION POOL
# =========================
db_pool = pool.ThreadedConnectionPool(
    minconn=2,
    maxconn=MAX_WORKERS + 2,
    host=DB_HOST, dbname=DB_NAME,
    user=DB_USER, password=DB_PASSWORD
)

def get_conn():
    conn = db_pool.getconn()
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute(f"SET search_path TO {SCHEMA};")
    cur.execute("SET datestyle = 'ISO, MDY';")
    conn.commit()
    return conn

# =========================
# GCS DISCOVERY
# =========================
def discover_files():
    blobs = gcs_client.list_blobs(BUCKET, prefix=BASE_PATH)
    files = []
    for blob in blobs:
        fname = blob.name.split("/")[-1]
        if fname in FILE_CONFIGS:
            files.append((blob.name, fname))
    return sorted(files)

def processed_files():
    conn = get_conn()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT file_name FROM market.processed_files WHERE pipeline IN ('revenue_estimates', 'eps_estimates')"
        )
        return {r[0] for r in cur.fetchall()}
    finally:
        db_pool.putconn(conn)

# =========================
# DATA LOADING
# download_as_bytes() is faster than blob.open() for small CSVs
# =========================
def parse_csv(blob_name: str, cfg: dict) -> pl.DataFrame:
    data = gcs_client.bucket(BUCKET).blob(blob_name).download_as_bytes()
    df = pl.read_csv(
        io.BytesIO(data),
        infer_schema=False,
        ignore_errors=True,
        null_values=NULL_VALUES
    )

    rename = {k: v for k, v in cfg["rename_map"].items() if k in df.columns}
    df = df.rename(rename)
    df = df.with_columns(pl.lit(cfg["frequency"]).alias("frequency"))

    existing = [c for c in cfg["ordered_cols"] if c in df.columns]
    df = df.select(existing)

    df = df.unique(subset=["ticker", "api_run_date", "period", "frequency"], keep="last")
    return df

# =========================
# POSTGRES INGESTION
# Rows sorted by conflict key so all threads acquire locks in the same
# order — eliminates deadlock cycles between concurrent upserts.
# Retry up to 3 times on deadlock in case it still occurs.
# =========================
def upsert_to_postgres(conn, df: pl.DataFrame, table: str):
    import time
    cur  = conn.cursor()
    cols = df.columns

    conflict_keys = ["ticker", "api_run_date", "period", "frequency"]
    update_cols   = [c for c in cols if c not in conflict_keys]
    update_clause = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)

    # Sort by conflict key — consistent lock ordering prevents deadlocks
    sort_cols = [c for c in conflict_keys if c in df.columns]
    df = df.sort(sort_cols)

    rows = [
        tuple(None if v is None else v for v in row)
        for row in df.iter_rows()
    ]

    sql = f"""
        INSERT INTO {table} ({", ".join(cols)})
        VALUES %s
        ON CONFLICT (ticker, api_run_date, period, frequency)
        DO UPDATE SET {update_clause}
    """

    for attempt in range(3):
        try:
            extras.execute_values(cur, sql, rows, page_size=500)
            conn.commit()
            return
        except psycopg2.errors.DeadlockDetected:
            conn.rollback()
            if attempt == 2:
                raise
            time.sleep(0.5 * (attempt + 1))

def mark_processed(conn, file_name: str, pipeline: str):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO market.processed_files (pipeline, file_name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        (pipeline, file_name)
    )
    conn.commit()

# =========================
# PER-FILE WORKER
# =========================
print_lock = threading.Lock()

def process_file(blob_name: str, fname: str) -> dict:
    cfg   = FILE_CONFIGS[fname]
    short = blob_name.replace(BASE_PATH + "/", "")
    conn  = get_conn()
    try:
        df = parse_csv(blob_name, cfg)
        upsert_to_postgres(conn, df, cfg["table"])
        mark_processed(conn, blob_name, cfg["pipeline"])
        with print_lock:
            print(f"  ✓ {short}")
        return {"status": "ok", "rows": len(df)}
    except Exception as e:
        conn.rollback()
        with print_lock:
            print(f"  ✗ {short}  →  {e}")
        return {"status": "fail", "error": str(e), "file": short}
    finally:
        db_pool.putconn(conn)

# =========================
# MAIN PIPELINE
# =========================
def run():
    all_files = discover_files()
    done      = processed_files()
    todo      = [(blob, fname) for blob, fname in all_files if blob not in done]

    print(f"Total files found     : {len(all_files)}")
    print(f"Already processed     : {len(all_files) - len(todo)}")
    print(f"Files to ingest       : {len(todo)}")
    print(f"Workers               : {MAX_WORKERS}")
    print("-" * 55)

    succeeded  = 0
    failed     = []
    total_rows = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(process_file, blob, fname): (blob, fname)
            for blob, fname in todo
        }
        for future in as_completed(futures):
            result = future.result()
            if result["status"] == "ok":
                succeeded  += 1
                total_rows += result["rows"]
            else:
                failed.append(result["file"])

    print("-" * 55)
    print(f"Done: {succeeded} succeeded  |  {len(failed)} failed  |  {total_rows:,} rows ingested")
    if failed:
        print("\nFailed files:")
        for f in failed:
            print(f"  ✗ {f}")

    db_pool.closeall()

# =========================
# ENTRY POINT
# =========================
if __name__ == "__main__":
    run()