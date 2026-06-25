import psycopg2
import sys
import os

def main():
    try:
        conn = psycopg2.connect(
            dbname="stock_pilot",
            user=os.environ.get("USER", "postgres"),
            host="localhost",
            port=5432
        )
        cur = conn.cursor()
        
        cur.execute("""
            SELECT DISTINCT symbol, asset_class FROM holdings 
            WHERE symbol NOT IN (SELECT indmoney_name FROM symbol_mappings)
        """)
        rows = cur.fetchall()
        
        for indmoney_name, asset_class in rows:
            # We won't try to guess NSE tickers for Mutual Funds
            if asset_class == 'MF' or 'Fund' in indmoney_name or 'Plan' in indmoney_name:
                cur.execute("""
                    INSERT INTO symbol_mappings (indmoney_name, asset_class, match_method)
                    VALUES (%s, %s, 'manual')
                    ON CONFLICT DO NOTHING
                """, (indmoney_name, 'MF'))
            else:
                # Basic insertion without ticker, so it exists in mappings
                cur.execute("""
                    INSERT INTO symbol_mappings (indmoney_name, asset_class, match_method)
                    VALUES (%s, %s, 'manual')
                    ON CONFLICT DO NOTHING
                """, (indmoney_name, asset_class))
        
        conn.commit()
        print(f"Mapped {len(rows)} remaining holdings.")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
