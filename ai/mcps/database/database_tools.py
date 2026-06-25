"""
Database MCP Tools — Real SQL against the stock_pilot PostgreSQL database.
All table names, column names, and SQL patterns are verified against the live DB.
See ai/knowledge/db_schema_kt.md for full schema reference.
"""

import json
import decimal
from datetime import date, datetime
from typing import Optional
import psycopg2
import psycopg2.extras
from langchain_core.tools import tool
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


# ── Connection Helper ──────────────────────────────────────────

def _get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
        user=PG_USER, password=PG_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor
    )


def _serialize(obj):
    """JSON serializer for Decimal/date/datetime from psycopg2."""
    if isinstance(obj, decimal.Decimal):
        return float(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")


def _rows_to_json(rows) -> str:
    return json.dumps([dict(r) for r in rows], default=_serialize, indent=2)


# ══════════════════════════════════════════════════════════════
#  IBKR Portfolio Tools
# ══════════════════════════════════════════════════════════════

@tool
def get_ibkr_portfolio() -> str:
    """
    Get the latest IBKR US portfolio snapshot with all positions and P&L.
    Returns: symbol (real US ticker), position (shares), market_price, market_value,
             average_cost, unrealized_pnl, realized_pnl, exchange, currency.
    Data is in USD. Use this for US stock analysis.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT symbol, sec_type, exchange, currency,
                   position, market_price, market_value,
                   average_cost, unrealized_pnl, realized_pnl,
                   date
            FROM ibkr_portfolio_holdings
            WHERE date = (SELECT MAX(date) FROM ibkr_portfolio_holdings)
            ORDER BY ABS(unrealized_pnl) DESC
        """)
        rows = cur.fetchall()
        cur.close(); conn.close()

        total_value = sum(float(r['market_value'] or 0) for r in rows)
        total_pnl = sum(float(r['unrealized_pnl'] or 0) for r in rows)
        winners = sum(1 for r in rows if float(r['unrealized_pnl'] or 0) > 0)
        losers = sum(1 for r in rows if float(r['unrealized_pnl'] or 0) < 0)

        return json.dumps({
            "summary": {
                "total_positions": len(rows),
                "total_market_value_usd": round(total_value, 2),
                "total_unrealized_pnl_usd": round(total_pnl, 2),
                "total_pnl_pct": round(total_pnl / (total_value - total_pnl) * 100, 2) if total_value > total_pnl else 0,
                "winning_positions": winners,
                "losing_positions": losers,
                "snapshot_date": str(rows[0]['date']) if rows else None,
            },
            "positions": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_india_holdings(asset_class: Optional[str] = None) -> str:
    """
    Get India portfolio holdings from IndMoney/CAMS sync.
    IMPORTANT: symbol column = full company name (e.g. 'Nestle India Ltd'), NOT NSE ticker.
    Use get_portfolio_summary() to get both portfolios combined.

    Args:
        asset_class: Filter by 'IND_EQUITY' | 'MF' | 'ETF' | 'BOND' | None (all)
    Returns: Holdings with market values in INR.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        query = """
            SELECT h.symbol, h.name, h.asset_class, h.sector,
                   h.qty, h.avg_buy, h.cmp,
                   h.qty * h.cmp AS market_value,
                   (h.cmp - h.avg_buy) * h.qty AS unrealized_pnl,
                   CASE WHEN h.avg_buy > 0
                        THEN (h.cmp - h.avg_buy) / h.avg_buy * 100
                        ELSE 0 END AS return_pct,
                   h.day_change, h.day_change_pct, h.buy_date,
                   sm.nse_symbol
            FROM holdings h
            LEFT JOIN symbol_mappings sm ON h.symbol = sm.indmoney_name
            WHERE h.qty > 0
        """
        params = []
        if asset_class:
            query += " AND h.asset_class = %s"
            params.append(asset_class)
        query += " ORDER BY h.qty * h.cmp DESC"

        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close(); conn.close()

        total_value = sum(float(r['market_value'] or 0) for r in rows)
        total_invested = sum(float(r['avg_buy'] or 0) * float(r['qty'] or 0) for r in rows)
        total_pnl = total_value - total_invested

        return json.dumps({
            "summary": {
                "total_holdings": len(rows),
                "total_market_value_inr": round(total_value, 2),
                "total_invested_inr": round(total_invested, 2),
                "total_unrealized_pnl_inr": round(total_pnl, 2),
                "overall_return_pct": round(total_pnl / total_invested * 100, 2) if total_invested > 0 else 0,
            },
            "holdings": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_portfolio_summary() -> str:
    """
    Get a combined overview of both the IBKR (US) and India portfolios.
    Shows total values, day P&L, top gainers, top losers across both portfolios.
    Useful for getting the full financial picture in one call.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()

        # IBKR summary
        cur.execute("""
            SELECT SUM(market_value) AS total_usd,
                   SUM(unrealized_pnl) AS pnl_usd,
                   COUNT(*) AS positions
            FROM ibkr_portfolio_holdings
            WHERE date = (SELECT MAX(date) FROM ibkr_portfolio_holdings)
        """)
        ibkr = dict(cur.fetchone() or {})

        # India summary by asset class
        cur.execute("""
            SELECT asset_class,
                   COUNT(*) AS count,
                   SUM(qty * cmp) AS market_value_inr,
                   SUM(qty * cmp) - SUM(avg_buy * qty) AS unrealized_pnl_inr
            FROM holdings WHERE qty > 0
            GROUP BY asset_class ORDER BY market_value_inr DESC
        """)
        india_by_class = [dict(r) for r in cur.fetchall()]
        total_india = sum(float(r['market_value_inr'] or 0) for r in india_by_class)

        # Top 5 India winners today
        cur.execute("""
            SELECT symbol, cmp, day_change_pct, qty * cmp AS value
            FROM holdings WHERE qty > 0 AND day_change_pct IS NOT NULL
            ORDER BY day_change_pct DESC LIMIT 5
        """)
        top_gainers = [dict(r) for r in cur.fetchall()]

        # Top 5 India losers today
        cur.execute("""
            SELECT symbol, cmp, day_change_pct, qty * cmp AS value
            FROM holdings WHERE qty > 0 AND day_change_pct IS NOT NULL
            ORDER BY day_change_pct ASC LIMIT 5
        """)
        top_losers = [dict(r) for r in cur.fetchall()]

        cur.close(); conn.close()

        return json.dumps({
            "ibkr_us_portfolio": {
                "total_market_value_usd": round(float(ibkr.get('total_usd') or 0), 2),
                "total_unrealized_pnl_usd": round(float(ibkr.get('pnl_usd') or 0), 2),
                "positions": int(ibkr.get('positions') or 0),
            },
            "india_portfolio": {
                "total_market_value_inr": round(total_india, 2),
                "breakdown_by_asset_class": india_by_class,
            },
            "today_top_gainers_india": top_gainers,
            "today_top_losers_india": top_losers,
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  NSE Market Data Tools
# ══════════════════════════════════════════════════════════════

@tool
def get_nse_stock_history(symbol: str, days: int = 60) -> str:
    """
    Get historical daily OHLCV data for an NSE stock.
    symbol: NSE ticker (e.g. 'TRENT', 'RELIANCE', 'NESTLEIND') — NOT company name.
            If you have a company name from the holdings table, join via symbol_mappings first.
    days: Number of trading days to retrieve (default: 60)
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, close_price, pchange, previous_close, volume, turnover, market_cap
            FROM nse_stocks_daily
            WHERE symbol = %s
            ORDER BY date DESC LIMIT %s
        """, (symbol.upper(), days))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows:
            return json.dumps({"error": f"No NSE data found for symbol '{symbol}'. Check spelling or use run_readonly_sql to verify."})

        return json.dumps({
            "symbol": symbol.upper(),
            "days_retrieved": len(rows),
            "date_range": {"from": str(rows[-1]['date']), "to": str(rows[0]['date'])},
            "latest": dict(rows[0]),
            "history": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_nse_index_data(index_name: str = "NIFTY 50", days: int = 30) -> str:
    """
    Get historical daily data for an NSE index.
    index_name options: 'NIFTY 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100',
                        'NIFTY BANK', 'NIFTY IT', 'NIFTY PHARMA', etc.
    Returns OHLC, % change, advances/declines breadth, PE ratio, PB ratio, dividend yield.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, index_name, open_val, high_val, low_val, close_val,
                   pchange, advances, declines,
                   advances::float / NULLIF(advances + declines, 0) * 100 AS breadth_pct,
                   pe, pb, dy
            FROM nse_indices_daily
            WHERE index_name = %s
            ORDER BY date DESC LIMIT %s
        """, (index_name, days))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows:
            # Try to show available indices
            conn2 = _get_conn()
            cur2 = conn2.cursor()
            cur2.execute("SELECT DISTINCT index_name FROM nse_indices_daily ORDER BY index_name LIMIT 20")
            available = [r['index_name'] for r in cur2.fetchall()]
            cur2.close(); conn2.close()
            return json.dumps({
                "error": f"Index '{index_name}' not found.",
                "available_indices": available
            })

        return json.dumps({
            "index_name": index_name,
            "latest": dict(rows[0]),
            "history": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_all_indices_latest() -> str:
    """
    Get the latest values for ALL tracked NSE indices in a single call.
    Returns Nifty 50, Midcap 100, SmallCap 100, Bank Nifty, and all others.
    Great for market breadth overview.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT index_name, close_val, pchange, advances, declines,
                   advances::float / NULLIF(advances + declines, 0) * 100 AS breadth_pct,
                   pe, pb
            FROM nse_indices_daily
            WHERE date = (SELECT MAX(date) FROM nse_indices_daily)
            ORDER BY close_val DESC
        """)
        rows = cur.fetchall()
        cur.close(); conn.close()
        return _rows_to_json(rows)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_volume_anomalies(threshold_pct: float = 200.0, date_str: Optional[str] = None) -> str:
    """
    Get NSE stocks with unusual volume spikes today.
    threshold_pct: Minimum % above 1-week average volume (default: 200%)
    date_str: Date in 'YYYY-MM-DD' format (default: latest available)
    Returns: symbol, today's volume, average volume, spike percentage.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        if date_str:
            date_filter = "date = %s"
            params = (date_str, threshold_pct)
        else:
            date_filter = "date = (SELECT MAX(date) FROM nse_volume_anomalies)"
            params = (threshold_pct,)

        cur.execute(f"""
            SELECT va.symbol, va.date, va.volume,
                   va.week1_avg_volume, va.week1_vol_change_pct,
                   va.week2_avg_volume, va.week2_vol_change_pct,
                   nsd.close_price, nsd.pchange AS price_change_pct
            FROM nse_volume_anomalies va
            LEFT JOIN nse_stocks_daily nsd ON va.symbol = nsd.symbol AND va.date = nsd.date
            WHERE {date_filter} AND va.week1_vol_change_pct > %s
            ORDER BY va.week1_vol_change_pct DESC
            LIMIT 50
        """, params if date_str else (threshold_pct,))

        if not date_str:
            cur.execute(f"""
                SELECT va.symbol, va.date, va.volume,
                       va.week1_avg_volume, va.week1_vol_change_pct,
                       va.week2_avg_volume, va.week2_vol_change_pct,
                       nsd.close_price, nsd.pchange AS price_change_pct
                FROM nse_volume_anomalies va
                LEFT JOIN nse_stocks_daily nsd ON va.symbol = nsd.symbol AND va.date = nsd.date
                WHERE va.date = (SELECT MAX(date) FROM nse_volume_anomalies)
                  AND va.week1_vol_change_pct > %s
                ORDER BY va.week1_vol_change_pct DESC
                LIMIT 50
            """, (threshold_pct,))

        rows = cur.fetchall()
        cur.close(); conn.close()
        return json.dumps({
            "threshold_pct": threshold_pct,
            "count": len(rows),
            "anomalies": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_52w_extremes(extreme_type: str = "HIGH") -> str:
    """
    Get NSE stocks hitting new 52-week highs or lows today.
    extreme_type: 'HIGH' (bullish breakouts) or 'LOW' (bearish breakdowns)
    Returns: symbol, new 52W value, previous 52W value.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT e.symbol, e.date, e.extreme_type,
                   e.new_52w_val, e.prev_52w_val, e.prev_hl_date,
                   nsd.close_price, nsd.pchange, nsd.volume
            FROM nse_52w_extremes e
            LEFT JOIN nse_stocks_daily nsd ON e.symbol = nsd.symbol AND e.date = nsd.date
            WHERE e.date = (SELECT MAX(date) FROM nse_52w_extremes)
              AND e.extreme_type = %s
            ORDER BY e.new_52w_val DESC
        """, (extreme_type.upper(),))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return json.dumps({
            "extreme_type": extreme_type.upper(),
            "count": len(rows),
            "stocks": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_block_deals(date_str: Optional[str] = None) -> str:
    """
    Get NSE block and bulk deals. These reveal institutional activity.
    date_str: 'YYYY-MM-DD' (default: latest available)
    Returns: symbol, deal_type (BLOCK/BULK), client_name, buy_sell, quantity, price.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT ld.symbol, ld.date, ld.deal_type, ld.client_name,
                   ld.buy_sell, ld.quantity, ld.price,
                   nsd.close_price, nsd.pchange
            FROM nse_large_deals ld
            LEFT JOIN nse_stocks_daily nsd ON ld.symbol = nsd.symbol AND ld.date = nsd.date
            WHERE ld.date = COALESCE(%s::date, (SELECT MAX(date) FROM nse_large_deals))
            ORDER BY ld.quantity DESC NULLS LAST
        """, (date_str,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return json.dumps({
            "count": len(rows),
            "deals": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_alpha_signals() -> str:
    """
    Get today's pre-computed alpha signals from materialized views:
    - Volume-backed 52W breakouts (strongest alpha: high + volume surge > 300%)
    - Volatility squeeze & expansion (>5% move on 2x+ normal volume)
    These are high-conviction signals worth investigating.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()

        # Volume breakouts
        cur.execute("""
            SELECT symbol, date, breakout_price, breakout_volume,
                   week2_avg_volume, volume_surge_pct, daily_return_pct
            FROM mv_alpha_volume_breakouts
            WHERE date = (SELECT MAX(date) FROM mv_alpha_volume_breakouts)
            ORDER BY volume_surge_pct DESC LIMIT 20
        """)
        vol_breakouts = [dict(r) for r in cur.fetchall()]

        # Volatility squeezes
        cur.execute("""
            SELECT symbol, date, close_price, today_return_pct,
                   volume, week1_avg_volume, volume_multiple
            FROM mv_alpha_volatility_squeeze
            WHERE date = (SELECT MAX(date) FROM mv_alpha_volatility_squeeze)
            ORDER BY ABS(today_return_pct) DESC LIMIT 20
        """)
        vol_squeezes = [dict(r) for r in cur.fetchall()]

        cur.close(); conn.close()
        return json.dumps({
            "volume_backed_breakouts": vol_breakouts,
            "volatility_squeezes": vol_squeezes
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_tech_indicators(symbol: str) -> str:
    """
    Get pre-computed technical indicators for an NSE stock from the materialized view.
    Returns: SMA 10/20/50/200, Bollinger Bands (upper/lower), Stochastic, ROC-10.
    symbol: NSE ticker (e.g. 'TRENT', 'RELIANCE')
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, close_price, sma_10, sma_20, sma_50, sma_200,
                   bb_upper, bb_lower, stochastic_14, roc_10, cross_sma_50
            FROM mv_tech_indicators
            WHERE symbol = %s
            ORDER BY date DESC LIMIT 60
        """, (symbol.upper(),))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows:
            return json.dumps({"error": f"No tech indicators for '{symbol}'. Try get_nse_stock_history() instead."})

        latest = dict(rows[0])
        # Derive signals
        signals = []
        if latest.get('close_price') and latest.get('sma_200'):
            if float(latest['close_price']) > float(latest['sma_200']):
                signals.append("Above SMA 200 — BULLISH long-term trend")
            else:
                signals.append("Below SMA 200 — BEARISH long-term trend")
        if latest.get('stochastic_14'):
            s = float(latest['stochastic_14'])
            if s > 80:
                signals.append("Stochastic > 80 — OVERBOUGHT")
            elif s < 20:
                signals.append("Stochastic < 20 — OVERSOLD")

        return json.dumps({
            "symbol": symbol.upper(),
            "latest_indicators": latest,
            "quick_signals": signals,
            "history": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_portfolio_history(days: int = 30) -> str:
    """
    Get historical daily portfolio value snapshots.
    Shows how total portfolio value and invested amount changed over time.
    days: Number of days of history (default: 30)
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date,
                   SUM(total_value) AS total_value,
                   SUM(invested_amount) AS invested_amount,
                   SUM(total_value) - SUM(invested_amount) AS unrealized_pnl,
                   CASE WHEN SUM(invested_amount) > 0
                        THEN (SUM(total_value) - SUM(invested_amount)) / SUM(invested_amount) * 100
                        ELSE 0 END AS return_pct
            FROM portfolio_history
            WHERE date >= CURRENT_DATE - %s * INTERVAL '1 day'
            GROUP BY date ORDER BY date
        """, (days,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return json.dumps({
            "days": days,
            "snapshots": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_earnings_calendar(days_ahead: int = 30) -> str:
    """
    Get upcoming earnings announcements for US stocks.
    days_ahead: Look ahead window in days (default: 30)
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT symbol, date, hour, quarter, year,
                   eps_estimate, revenue_estimate
            FROM market.earnings_calendar
            WHERE date BETWEEN CURRENT_DATE AND CURRENT_DATE + %s * INTERVAL '1 day'
            ORDER BY date
        """, (days_ahead,))
        rows = cur.fetchall()
        cur.close(); conn.close()
        return json.dumps({"earnings": [dict(r) for r in rows]}, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_circuit_breakers() -> str:
    """
    Get NSE stocks hitting upper or lower circuit breakers today.
    Upper circuit = bullish momentum (demand exceeded supply).
    Lower circuit = bearish (forced selling or panic).
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT pb.symbol, pb.band_type, pb.close_price, pb.volume,
                   nsd.pchange, nsd.market_cap
            FROM nse_price_band_hitters pb
            LEFT JOIN nse_stocks_daily nsd ON pb.symbol = nsd.symbol AND pb.date = nsd.date
            WHERE pb.date = (SELECT MAX(date) FROM nse_price_band_hitters)
            ORDER BY pb.band_type, nsd.market_cap DESC NULLS LAST
        """)
        rows = cur.fetchall()
        cur.close(); conn.close()
        upper = [dict(r) for r in rows if r['band_type'] == 'UPPER']
        lower = [dict(r) for r in rows if r['band_type'] == 'LOWER']
        return json.dumps({
            "upper_circuit": {"count": len(upper), "stocks": upper},
            "lower_circuit": {"count": len(lower), "stocks": lower}
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def run_readonly_sql(query: str) -> str:
    """
    Execute a custom read-only SQL SELECT query against the stock_pilot database.
    IMPORTANT: Only SELECT statements are allowed.
    IMPORTANT: Reference ai/knowledge/db_schema_kt.md for exact table/column names.

    Key schema reminders:
    - India holdings: table 'holdings', symbol = full company name
    - NSE market data: table 'nse_stocks_daily', symbol = NSE ticker
    - US market data: table 'market.market_data' (market schema prefix required)
    - Symbol mapping: table 'symbol_mappings'
    - IBKR positions: table 'ibkr_portfolio_holdings'
    """
    query = query.strip()
    if not query.upper().startswith("SELECT"):
        return json.dumps({"error": "Only SELECT queries are allowed."})
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute(query)
        rows = cur.fetchall()
        result = [dict(r) for r in rows]
        cur.close(); conn.close()
        return json.dumps({"row_count": len(result), "rows": result[:200]}, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e), "hint": "Check db_schema_kt.md for correct table/column names"})
