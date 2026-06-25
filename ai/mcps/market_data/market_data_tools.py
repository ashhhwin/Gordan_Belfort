"""
Market Data MCP Tools — Real NSE + US market data tools.
Uses the actual PostgreSQL tables and yfinance for live quotes.
"""

import json
import decimal
from datetime import datetime
from typing import Optional
import psycopg2
import psycopg2.extras
from langchain_core.tools import tool
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


def _get_conn():
    return psycopg2.connect(
        host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
        user=PG_USER, password=PG_PASSWORD,
        cursor_factory=psycopg2.extras.RealDictCursor
    )


def _serialize(obj):
    if isinstance(obj, decimal.Decimal): return float(obj)
    if isinstance(obj, (datetime,)): return obj.isoformat()
    raise TypeError(f"Not serializable: {type(obj)}")


@tool
def get_us_stock_snapshot(symbol: str) -> str:
    """
    Get US stock fundamentals and price data from the market.market_data table.
    Use this for IBKR holdings (AMD, ARKK, SPYM, etc.) for fundamental analysis.
    symbol: US ticker (e.g. 'AMD', 'ARKK', 'SPYM')
    Returns: price, sector, market cap, beta, PE, 52W range, short interest, earnings date.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT symbol, company_name, type, sector, industry,
                   market_cap, beta, p_open, p_high, p_low, p_close, volume,
                   prev_close, p_50d_ma, p_200d_ma, v_14d_ma, v_50d_ma,
                   f52w_high, f52w_h_date, f52w_low, f52w_l_date,
                   short_ratio, short_percent_float, earnings_date,
                   shares_out, shares_float, shares_insiders, shares_institutions,
                   trade_date
            FROM market.market_data
            WHERE symbol = %s
            ORDER BY trade_date DESC LIMIT 1
        """, (symbol.upper(),))
        row = cur.fetchone()
        cur.close(); conn.close()

        if not row:
            return json.dumps({"error": f"No data found for US symbol '{symbol}' in market.market_data"})

        data = dict(row)
        # Add computed signals
        if data.get('p_close') and data.get('p_50d_ma') and data.get('p_200d_ma'):
            price = float(data['p_close'])
            ma50 = float(data['p_50d_ma'])
            ma200 = float(data['p_200d_ma'])
            data['signals'] = {
                "above_50d_ma": price > ma50,
                "above_200d_ma": price > ma200,
                "golden_cross": ma50 > ma200,
                "pct_from_52w_high": round((price - float(data['f52w_high'])) / float(data['f52w_high']) * 100, 2) if data.get('f52w_high') else None,
                "pct_from_52w_low": round((price - float(data['f52w_low'])) / float(data['f52w_low']) * 100, 2) if data.get('f52w_low') else None,
            }

        return json.dumps(data, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_yfinance_quote(symbol: str) -> str:
    """
    Get a live price quote using yfinance.
    For NSE Indian stocks, append .NS suffix: 'RELIANCE.NS', 'TRENT.NS'
    For US stocks, use ticker directly: 'AMD', 'NVDA'
    For indices: '^NSEI' (Nifty 50), '^BSESN' (Sensex), '^GSPC' (S&P 500)
    Returns: current price, day change, 52W range, volume, market cap.
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        info = ticker.fast_info
        hist = ticker.history(period="5d", interval="1d")

        result = {
            "symbol": symbol,
            "currency": getattr(info, "currency", "USD"),
            "last_price": round(float(getattr(info, "last_price", 0) or 0), 4),
            "previous_close": round(float(getattr(info, "previous_close", 0) or 0), 4),
            "day_change_pct": None,
            "market_cap": getattr(info, "market_cap", None),
            "fifty_two_week_high": getattr(info, "year_high", None),
            "fifty_two_week_low": getattr(info, "year_low", None),
            "volume": getattr(info, "last_volume", None),
        }

        if result["last_price"] and result["previous_close"]:
            result["day_change"] = round(result["last_price"] - result["previous_close"], 4)
            result["day_change_pct"] = round(
                (result["last_price"] - result["previous_close"]) / result["previous_close"] * 100, 3
            )

        if not hist.empty:
            result["recent_closes"] = {
                str(k.date()): round(float(v), 4)
                for k, v in hist['Close'].tail(5).items()
            }

        return json.dumps(result, default=str, indent=2)
    except ImportError:
        return json.dumps({"error": "yfinance not installed. Run: pip install yfinance"})
    except Exception as e:
        return json.dumps({"error": str(e), "symbol": symbol})


@tool
def get_nse_etf_data(symbol: str, days: int = 30) -> str:
    """
    Get historical data for an NSE ETF (e.g. 'NIFTYBEES', 'HDFCGOLD', 'MAFANG').
    Returns OHLC, volume, turnover, and NAV for the last N days.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT date, open_price, high_price, low_price, close_price,
                   pchange, volume, turnover, nav
            FROM nse_etfs_daily
            WHERE symbol = %s
            ORDER BY date DESC LIMIT %s
        """, (symbol.upper(), days))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows:
            conn2 = _get_conn()
            cur2 = conn2.cursor()
            cur2.execute("SELECT DISTINCT symbol FROM nse_etfs_daily ORDER BY symbol LIMIT 30")
            available = [r['symbol'] for r in cur2.fetchall()]
            cur2.close(); conn2.close()
            return json.dumps({"error": f"ETF '{symbol}' not found.", "available_etfs": available})

        return json.dumps({
            "symbol": symbol.upper(),
            "latest": dict(rows[0]),
            "history": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_eps_estimates(ticker: str) -> str:
    """
    Get analyst EPS estimates for a US stock from the earnings estimates table.
    ticker: US ticker symbol (e.g. 'AMD', 'NVDA', 'MSFT')
    Returns quarterly and annual EPS consensus estimates.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT frequency, period, quarter, year,
                   eps_avg, eps_high, eps_low, number_analysts, api_run_date
            FROM market.eps_estimates
            WHERE ticker = %s
            ORDER BY period
        """, (ticker.upper(),))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows:
            return json.dumps({"error": f"No EPS estimates for '{ticker}'"})

        return json.dumps({
            "ticker": ticker.upper(),
            "estimates": [dict(r) for r in rows]
        }, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def get_macro_indicators() -> str:
    """
    Get macro market indicators: Nifty 50 PE/PB/DY, S&P 500 index level,
    and available NSE breadth data. Use for macro context in analysis.
    """
    try:
        conn = _get_conn()
        cur = conn.cursor()

        # NSE indices with valuation
        cur.execute("""
            SELECT index_name, close_val, pchange, pe, pb, dy, advances, declines
            FROM nse_indices_daily
            WHERE date = (SELECT MAX(date) FROM nse_indices_daily)
              AND index_name IN ('NIFTY 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100', 'NIFTY BANK')
            ORDER BY index_name
        """)
        nse_indices = [dict(r) for r in cur.fetchall()]
        cur.close(); conn.close()

        result = {"nse_indices": nse_indices}

        # Live S&P 500 via yfinance
        try:
            import yfinance as yf
            sp500 = yf.Ticker("^GSPC").fast_info
            result["sp500"] = {
                "last_price": round(float(getattr(sp500, "last_price", 0)), 2),
                "previous_close": round(float(getattr(sp500, "previous_close", 0)), 2),
            }
            if result["sp500"]["last_price"] and result["sp500"]["previous_close"]:
                result["sp500"]["day_change_pct"] = round(
                    (result["sp500"]["last_price"] - result["sp500"]["previous_close"])
                    / result["sp500"]["previous_close"] * 100, 3
                )
        except Exception:
            result["sp500"] = {"error": "yfinance unavailable"}

        return json.dumps(result, default=_serialize, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
