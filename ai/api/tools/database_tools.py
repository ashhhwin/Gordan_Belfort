"""
Database tools for the Gordan Belfort AI agent.
Provides read-only access to PostgreSQL holdings and market data.
"""

import json
from langchain_core.tools import tool
import psycopg2
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


def _get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
        user=PG_USER, password=PG_PASSWORD
    )


@tool
def get_portfolio_holdings() -> str:
    """
    Retrieve all active portfolio holdings with current market prices, quantities, 
    average buy price, P&L, and asset class. Returns a JSON array of holdings.
    Use this when the user asks about their portfolio, positions, or holdings.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT symbol, company_name, asset_class, exchange, qty, avg_buy, cmp, 
                   (cmp - avg_buy) * qty AS unrealized_pnl,
                   ROUND(((cmp - avg_buy) / NULLIF(avg_buy, 0)) * 100, 2) AS pnl_pct
            FROM holdings 
            WHERE qty > 0
            ORDER BY (cmp * qty) DESC
        """)
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        conn.close()
        return json.dumps(rows, default=str, indent=2)
    except Exception as e:
        return f"Database error: {e}"


@tool
def get_net_worth_summary() -> str:
    """
    Get an aggregated summary of the user's net worth: total assets, liabilities,
    net worth, and breakdown by asset class. Use this for portfolio overview questions.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("SELECT asset_class, cmp, avg_buy, qty FROM holdings")
        rows = cur.fetchall()
        cur.close()
        conn.close()

        total_assets = 0
        total_liabilities = 0
        breakdown = {}

        for asset_class, cmp, avg_buy, qty in rows:
            val = float(cmp or avg_buy or 0) * float(qty or 0)
            if asset_class == 'CREDIT_CARD':
                total_liabilities += abs(val)
            else:
                total_assets += val
            breakdown[asset_class] = breakdown.get(asset_class, 0) + val

        return json.dumps({
            "total_assets": round(total_assets, 2),
            "total_liabilities": round(total_liabilities, 2),
            "net_worth": round(total_assets - total_liabilities, 2),
            "breakdown_by_asset_class": {k: round(v, 2) for k, v in breakdown.items()}
        }, indent=2)
    except Exception as e:
        return f"Database error: {e}"


@tool
def query_market_data(symbol: str, days: int = 30) -> str:
    """
    Get historical OHLCV market data for a specific stock symbol.
    Returns the last N days of data. Use this for price history, trend analysis,
    or when you need raw market data for calculations.

    Args:
        symbol: The stock ticker symbol (e.g., 'RELIANCE', 'TCS', 'INFY')
        days: Number of trading days to fetch (default: 30, max: 365)
    """
    days = min(days, 365)
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, open, high, low, close, volume
            FROM market_data
            WHERE symbol = %s
            ORDER BY date DESC
            LIMIT %s
        """, (symbol.upper(), days))
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        conn.close()

        if not rows:
            return f"No market data found for symbol '{symbol}'. Check if the symbol is correct."
        return json.dumps(rows, default=str, indent=2)
    except Exception as e:
        return f"Database error: {e}"


@tool
def run_readonly_sql(query: str) -> str:
    """
    Execute a read-only SQL query against the financial database and return results.
    ONLY SELECT statements are allowed. Use this for custom data exploration.
    
    Available tables: holdings, market_data, features_daily, sync_jobs
    
    Args:
        query: A SELECT SQL query (no INSERT/UPDATE/DELETE allowed)
    """
    normalized = query.strip().upper()
    if not normalized.startswith("SELECT"):
        return "Error: Only SELECT queries are allowed for safety."

    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT"]
    for word in forbidden:
        if word in normalized:
            return f"Error: {word} operations are not permitted."

    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(query)
        cols = [desc[0] for desc in cur.description]
        rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        cur.close()
        conn.close()

        if len(rows) > 100:
            return json.dumps({
                "total_rows": len(rows),
                "showing_first_100": rows[:100],
                "note": "Result truncated. Refine your query with LIMIT or WHERE clauses."
            }, default=str, indent=2)
        return json.dumps(rows, default=str, indent=2)
    except Exception as e:
        return f"SQL execution error: {e}"


@tool
def get_asset_allocation() -> str:
    """
    Get current portfolio asset allocation as percentages by asset class.
    Returns breakdown suitable for pie charts or allocation analysis.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT asset_class, 
                   SUM(cmp * qty) as market_value
            FROM holdings
            WHERE qty > 0
            GROUP BY asset_class
            ORDER BY market_value DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        total = sum(float(r[1] or 0) for r in rows)
        allocation = [
            {
                "asset_class": r[0],
                "market_value": round(float(r[1] or 0), 2),
                "allocation_pct": round((float(r[1] or 0) / total * 100) if total > 0 else 0, 2)
            }
            for r in rows
        ]
        return json.dumps({"total_portfolio_value": round(total, 2), "allocation": allocation}, indent=2)
    except Exception as e:
        return f"Database error: {e}"
