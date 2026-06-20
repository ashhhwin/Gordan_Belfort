import os
import io
import polars as pl
from google.cloud import storage
from google.oauth2 import service_account
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '../../.env'))

# =========================
# CONFIGURATION
# =========================
BUCKET = "historical_data_evoke"
PREFIX = "Download_daily_data/"
KEY_PATH = os.path.join(os.path.dirname(__file__), "../../secrets/tonal-nucleus-464617-n2-3af9df63532c.json")

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "stock_pilot")
DB_USER = os.getenv("DB_USER", "ashwinram")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

SCHEMA = "market"

# Must match Postgres table column order exactly
ORDERED_COLS = [
    "trade_date", "symbol", "company_name", "type", "sector", "industry",
    "market_cap", "beta", "p_open", "p_high", "p_low", "p_close",
    "volume", "prev_close", "p_50d_ma", "p_200d_ma", "v_14d_ma", "v_50d_ma",
    "options", "f52w_high", "f52w_h_date", "f52w_low", "f52w_l_date",
    "close_open", "open_close", "high_close", "low_close", "close_close",
    "shares_out", "shares_float", "short_ratio", "short_percent_float",
    "earnings_date", "shares_insiders", "shares_institutions"
]

RENAME_MAP = {
    "Trade_Date": "trade_date",
    "Symbol": "symbol",
    "Company_Name": "company_name",
    "Type": "type",
    "Sector": "sector",
    "Industry": "industry",
    "Market_Cap": "market_cap",
    "Beta": "beta",
    "P_Open": "p_open",
    "P_High": "p_high",
    "P_Low": "p_low",
    "P_Close": "p_close",
    "Volume": "volume",
    "Prev_Close": "prev_close",
    "P_50D_MA": "p_50d_ma",
    "P_200D_MA": "p_200d_ma",
    "V_14D_MA": "v_14d_ma",
    "V_50D_MA": "v_50d_ma",
    "Options": "options",
    "F52W_High": "f52w_high",
    "F52W_H_DATE": "f52w_h_date",
    "F52W_Low": "f52w_low",
    "F52W_L_DATE": "f52w_l_date",
    "Close_Open": "close_open",
    "Open_Close": "open_close",
    "High_Close": "high_close",
    "Low_Close": "low_close",
    "Close_Close": "close_close",
    "Shares_Out": "shares_out",
    "Shares_Float": "shares_float",
    "Short_Ratio": "short_ratio",
    "Short_Percent_Float": "short_percent_float",
    "Earnings_Date": "earnings_date",
    "Shares_Insiders": "shares_insiders",
    "Shares_Institutions": "shares_institutions"
}

# All Excel error strings treated as NULL
EXCEL_ERRORS = ["#DIV/0!", "#N/A", "#VALUE!", "#REF!", "#NAME?", "#NUM!", "#NULL!", "#ERROR!"]
NULL_VALUES  = ["", "N/A", "n/a", "NULL", "null"] + EXCEL_ERRORS

# =========================
# GCS AUTHENTICATION
# =========================
credentials = service_account.Credentials.from_service_account_file(KEY_PATH)
gcs_client = storage.Client(credentials=credentials, project=credentials.project_id)

# =========================
# POSTGRES CONNECTION
# =========================
conn = psycopg2.connect(
    host=DB_HOST,
    dbname=DB_NAME,
    user=DB_USER,
    password=DB_PASSWORD
)
cursor = conn.cursor()
cursor.execute(f"SET search_path TO {SCHEMA};")
cursor.execute("SET datestyle = 'ISO, MDY';")   # Dates arrive as M/D/YY
conn.commit()

# =========================
# GCS FUNCTIONS
# =========================
def list_gcs_files():
    bucket = gcs_client.bucket(BUCKET)
    blobs = gcs_client.list_blobs(bucket, prefix=PREFIX)
    return sorted([b.name for b in blobs if b.name.endswith(".csv")])

def processed_files():
    cursor.execute("SELECT file_name FROM market.processed_files WHERE pipeline = 'market_data'")
    return {r[0] for r in cursor.fetchall()}

def download_blob(blob_name):
    bucket = gcs_client.bucket(BUCKET)
    blob = bucket.blob(blob_name)
    return blob.download_as_bytes()

# =========================
# DATA LOADING — no type casting, everything as raw strings
# =========================
def parse_csv(data: bytes) -> pl.DataFrame:
    df = pl.read_csv(
        io.BytesIO(data),
        infer_schema=False,      # All columns stay as plain strings
        ignore_errors=True,
        null_values=NULL_VALUES  # Covers blanks + all Excel error tokens
    )

    # Rename only columns that exist
    rename = {k: v for k, v in RENAME_MAP.items() if k in df.columns}
    df = df.rename(rename)

    # Volume comes as "1521840.0" — strip decimal so Postgres BIGINT accepts it
    if "volume" in df.columns:
        df = df.with_columns(
            pl.col("volume").str.replace(r"\.0+$", "")
        )

    # Keep only the columns Postgres expects, in the right order
    existing = [c for c in ORDERED_COLS if c in df.columns]
    df = df.select(existing)

    return df

# =========================
# POSTGRES INGESTION
# =========================
def copy_to_postgres(df: pl.DataFrame):
    buf = io.StringIO()
    df.write_csv(buf, null_value="")   # Empty string → NULL in Postgres COPY
    buf.seek(0)

    cols = ", ".join(df.columns)
    cursor.copy_expert(
        f"""
        COPY market.market_data ({cols})
        FROM STDIN
        WITH CSV HEADER
        """,
        buf
    )
    conn.commit()

def mark_processed(file_name: str):
    cursor.execute(
        "INSERT INTO market.processed_files (pipeline, file_name) VALUES (%s, %s) ON CONFLICT DO NOTHING",
        ("market_data", file_name)
    )
    conn.commit()

# =========================
# MAIN PIPELINE
# =========================
def run():
    gcs_files = list_gcs_files()
    done      = processed_files()
    todo      = [f for f in gcs_files if f not in done]

    print(f"Total files in bucket : {len(gcs_files)}")
    print(f"Already processed     : {len(done)}")
    print(f"Files to ingest       : {len(todo)}")
    print("-" * 45)

    succeeded  = []
    failed     = []
    total_rows = 0

    for file in todo:
        short = file.split("/")[-1]
        try:
            data = download_blob(file)
            df   = parse_csv(data)
            copy_to_postgres(df)
            mark_processed(file)
            succeeded.append(short)
            total_rows += len(df)
            print(f"  ✓ {short}")
        except Exception as e:
            conn.rollback()
            failed.append((short, str(e)))
            print(f"  ✗ {short}  →  {e}")

    print("-" * 45)
    print(f"Done: {len(succeeded)} succeeded  |  {len(failed)} failed  |  {total_rows:,} rows ingested")

    cursor.close()
    conn.close()

# =========================
# ENTRY POINT
# =========================
import gc

if __name__ == "__main__":
    run()
    gc.collect()