import os
import sys
import datetime
import psycopg2
from psycopg2.extras import execute_values
from ib_insync import IB
from dotenv import load_dotenv
import uuid

def main():
    # Load environment variables from .env if present
    load_dotenv()
    
    # DB configuration
    db_host = os.environ.get("DB_HOST", "localhost")
    db_port = os.environ.get("DB_PORT", "5432")
    db_name = os.environ.get("DB_NAME", "stock_pilot")
    db_user = os.environ.get("DB_USER", "ashwinram")
    db_password = os.environ.get("DB_PASSWORD", "")
    
    # IBKR configuration (configurable for running on different servers)
    ib_host = os.environ.get("IBKR_HOST", "127.0.0.1")
    ib_port = int(os.environ.get("IBKR_PORT", 4001))
    ib_client_id = int(os.environ.get("IBKR_CLIENT_ID", 10)) # unique client id for cron
    
    print(f"[{datetime.datetime.now()}] Starting daily portfolio ingestion...")
    print(f"[{datetime.datetime.now()}] Connecting to IBKR on {ib_host}:{ib_port}...")
    
    # 1. Connect to IBKR
    ib = IB()
    try:
        ib.connect(ib_host, ib_port, clientId=ib_client_id)
    except Exception as e:
        print(f"[{datetime.datetime.now()}] CRITICAL: Failed to connect to IBKR: {e}")
        sys.exit(1)
        
    print(f"[{datetime.datetime.now()}] Fetching portfolio holdings...")
    portfolio_items = ib.portfolio()
    ib.disconnect()
    
    if not portfolio_items:
        print(f"[{datetime.datetime.now()}] No portfolio items found or API is unavailable. Exiting.")
        sys.exit(0)
        
    # 2. Connect to PostgreSQL
    print(f"[{datetime.datetime.now()}] Connecting to PostgreSQL ({db_name} on {db_host})...")
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_password
        )
        # Enable autocommit or we will commit manually
        conn.autocommit = False 
        cursor = conn.cursor()
    except Exception as e:
        print(f"[{datetime.datetime.now()}] CRITICAL: Failed to connect to PostgreSQL: {e}")
        sys.exit(1)
        
    # 3. Fetch default user_id for the holdings table
    cursor.execute("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
    user_row = cursor.fetchone()
    if not user_row:
        print(f"[{datetime.datetime.now()}] CRITICAL: No users found in database to attach holdings to.")
        sys.exit(1)
    user_id = user_row[0]

    # 4. Prepare data for Upsert into `holdings` table
    today = datetime.date.today()
    records = []
    
    for item in portfolio_items:
        # Default to 0.0 if any numeric field is None
        position = item.position or 0.0
        market_price = item.marketPrice or 0.0
        average_cost = item.averageCost or 0.0
        symbol = item.contract.symbol
        name = item.contract.localSymbol or symbol
        
        # Generate stable UUID for upsert based on symbol and user_id to prevent duplicates
        # We use a custom namespace to avoid collisions
        NAMESPACE_STOCK_PILOT = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
        holding_id = str(uuid.uuid5(NAMESPACE_STOCK_PILOT, f"{user_id}_{symbol}"))
        
        records.append((
            holding_id,
            user_id,
            'US_EQUITY', # asset_class
            symbol,
            name,
            'IBKR', # sector
            position,
            average_cost,
            market_price,
            today, # buy_date
            datetime.datetime.now() # updated_at
        ))
        
    print(f"[{datetime.datetime.now()}] Prepared {len(records)} records for date {today}.")

    # 5. UPSERT into PostgreSQL `holdings` table
    upsert_query = """
        INSERT INTO holdings (
            id, user_id, asset_class, symbol, name, sector, qty, avg_buy, cmp, buy_date, updated_at
        ) VALUES %s
        ON CONFLICT (id) DO UPDATE SET
            qty = EXCLUDED.qty,
            avg_buy = EXCLUDED.avg_buy,
            cmp = EXCLUDED.cmp,
            updated_at = EXCLUDED.updated_at;
    """
    
    try:
        execute_values(cursor, upsert_query, records)
        conn.commit()
        print(f"[{datetime.datetime.now()}] Successfully upserted {len(records)} records into holdings.")
    except Exception as e:
        conn.rollback()
        print(f"[{datetime.datetime.now()}] ERROR: Failed to upsert records into database: {e}")
        sys.exit(1)
    finally:
        cursor.close()
        conn.close()
        
    print(f"[{datetime.datetime.now()}] Daily portfolio ingestion complete.")

if __name__ == "__main__":
    main()
