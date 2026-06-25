import psycopg2
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

def inspect_db():
    conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
    cur = conn.cursor()
    
    print("--- TABLES ---")
    cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    tables = cur.fetchall()
    for t in tables:
        print(t[0])
        cur.execute(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t[0]}'")
        print("  Cols:", cur.fetchall())
        cur.execute(f"SELECT * FROM {t[0]} LIMIT 2")
        print("  Sample:", cur.fetchall())
        print()

inspect_db()
