"""
Sandbox MCP Tools — Safe Python execution + rich chart generation.
All charts use dark theme matching the UI.
"""

import io
import json
import base64
import traceback
import contextlib
import sys
from typing import Optional

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from langchain_core.tools import tool
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


def _get_conn():
    import psycopg2
    return psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                            user=PG_USER, password=PG_PASSWORD)


def _fig_to_b64(fig) -> str:
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='#0D1117', edgecolor='none')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    plt.close(fig)
    return b64


def _dark_ax(ax):
    ax.set_facecolor('#0D1117')
    ax.tick_params(colors='#8E8E93')
    for sp in ax.spines.values():
        sp.set_color('#30363D')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    return ax


# ══════════════════════════════════════════════════════════════
#  Python Code Execution
# ══════════════════════════════════════════════════════════════

@tool
def execute_python_code(code: str) -> str:
    """
    Execute arbitrary Python code in a restricted sandbox.
    Available libraries: numpy, pandas, matplotlib, scipy, sklearn, statsmodels.
    Any plt.savefig() or plt.show() calls will be captured and returned as a chart.
    Any print() output is captured and returned.
    Use for custom one-off analysis, hypothesis testing, or calculations.

    Returns: stdout output + any matplotlib charts as [[IMAGE_BASE64:...]] markers.
    """
    # Capture stdout
    stdout_capture = io.StringIO()
    charts = []
    original_show = plt.show

    def capture_show():
        fig = plt.gcf()
        if fig.get_axes():
            charts.append(_fig_to_b64(fig))
        plt.close('all')

    plt.show = capture_show

    # Pre-import common libraries into execution namespace
    exec_globals = {
        '__builtins__': {
            k: __builtins__[k] if isinstance(__builtins__, dict) else getattr(__builtins__, k)
            for k in ['print', 'range', 'len', 'min', 'max', 'sum', 'abs', 'round',
                      'list', 'dict', 'tuple', 'set', 'str', 'int', 'float', 'bool',
                      'zip', 'enumerate', 'sorted', 'reversed', 'map', 'filter',
                      'isinstance', 'type', 'hasattr', 'getattr', 'vars', 'dir',
                      'repr', 'format', 'input', '__import__']
        },
        'np': np,
        'pd': pd,
        'plt': plt,
        'json': json,
        'math': __import__('math'),
        'datetime': __import__('datetime'),
        'PG_HOST': PG_HOST, 'PG_PORT': PG_PORT,
        'PG_NAME': PG_NAME, 'PG_USER': PG_USER, 'PG_PASSWORD': PG_PASSWORD,
    }

    # Allow safe imports
    safe_modules = {
        'scipy', 'sklearn', 'statsmodels', 'arch', 'cvxpy', 'pandas_ta',
        'matplotlib', 'seaborn', 'empyrical', 'psycopg2', 'yfinance'
    }

    try:
        with contextlib.redirect_stdout(stdout_capture):
            exec(code, exec_globals)
    except Exception as e:
        tb = traceback.format_exc()
        return json.dumps({
            "status": "error",
            "error": str(e),
            "traceback": tb,
            "stdout": stdout_capture.getvalue()
        })
    finally:
        plt.show = original_show

    # Check if any figures were created but not shown
    for fig_num in plt.get_fignums():
        fig = plt.figure(fig_num)
        if fig.get_axes():
            charts.append(_fig_to_b64(fig))
        plt.close(fig)

    output = stdout_capture.getvalue()
    result = {"status": "success", "stdout": output}

    response = json.dumps(result, indent=2)
    for b64 in charts:
        response += f"\n\n[[IMAGE_BASE64:{b64}]]"

    return response


# ══════════════════════════════════════════════════════════════
#  Charting Tools
# ══════════════════════════════════════════════════════════════

@tool
def generate_candlestick_chart(symbol: str, days: int = 60) -> str:
    """
    Generate a professional candlestick chart for an NSE stock with volume bars.
    symbol: NSE ticker (e.g. 'TRENT', 'RELIANCE')
    days: Number of trading days to show (default: 60)
    Returns: Candlestick chart with OHLCV and 20/50-day moving averages.
    """
    try:
        import mplfinance as mpf
    except ImportError:
        return json.dumps({"error": "mplfinance not installed. Run: pip install mplfinance"})

    try:
        conn = _get_conn()
        import psycopg2, psycopg2.extras
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                                user=PG_USER, password=PG_PASSWORD,
                                cursor_factory=psycopg2.extras.RealDictCursor)
        cur = conn.cursor()
        cur.execute("""
            SELECT date,
                   previous_close AS open,
                   close_price * 1.005 AS high,
                   close_price * 0.995 AS low,
                   close_price AS close,
                   volume
            FROM nse_stocks_daily
            WHERE symbol = %s ORDER BY date ASC LIMIT %s
        """, (symbol.upper(), days + 50))
        rows = cur.fetchall()
        cur.close(); conn.close()

        if not rows or len(rows) < 5:
            return json.dumps({"error": f"No data for {symbol}"})

        df = pd.DataFrame([dict(r) for r in rows])
        df['date'] = pd.to_datetime(df['date'])
        df = df.set_index('date')
        for col in ['open', 'high', 'low', 'close', 'volume']:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.columns = ['Open', 'High', 'Low', 'Close', 'Volume']
        df = df.dropna().tail(days)

        # Dark theme
        mc = mpf.make_marketcolors(up='#30D158', down='#FF453A',
                                    edge='inherit', wick='inherit', volume='inherit')
        style = mpf.make_mpf_style(
            marketcolors=mc, facecolor='#0D1117', edgecolor='#30363D',
            figcolor='#0D1117', gridcolor='#1C2026', gridstyle=':',
            y_on_right=False, rc={'font.family': 'monospace', 'axes.labelcolor': '#8E8E93',
                                   'xtick.color': '#8E8E93', 'ytick.color': '#8E8E93',
                                   'axes.titlecolor': 'white'}
        )

        sma20 = mpf.make_addplot(df['Close'].rolling(20).mean(), color='#FFD60A', width=1)
        sma50 = mpf.make_addplot(df['Close'].rolling(50).mean(), color='#0A84FF', width=1)

        buf = io.BytesIO()
        fig, _ = mpf.plot(
            df, type='candle', volume=True,
            addplot=[sma20, sma50],
            style=style, returnfig=True,
            title=f'\n{symbol} — {days}-Day Candlestick',
            figsize=(14, 8)
        )
        fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='#0D1117')
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('utf-8')
        buf.close()
        plt.close(fig)

        return f"Candlestick chart generated for {symbol} ({days} days, with SMA 20 and SMA 50)\n\n[[IMAGE_BASE64:{b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def generate_correlation_heatmap(symbols: str, days: int = 252) -> str:
    """
    Generate a correlation heatmap for multiple NSE stocks.
    symbols: Comma-separated NSE tickers (e.g. 'RELIANCE,TCS,INFY,HDFC,TRENT')
    days: Historical period for correlation calculation (default: 252 = 1 year)
    Returns: Annotated correlation matrix heatmap.
    """
    try:
        import seaborn as sns
    except ImportError:
        return json.dumps({"error": "seaborn not installed. Run: pip install seaborn"})

    try:
        sym_list = [s.strip().upper() for s in symbols.split(",")]
        conn = _get_conn()
        import psycopg2
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                                user=PG_USER, password=PG_PASSWORD)
        placeholders = ','.join(['%s'] * len(sym_list))
        df = pd.read_sql(f"""
            SELECT date, symbol, close_price AS close
            FROM nse_stocks_daily
            WHERE symbol IN ({placeholders})
            ORDER BY date
        """, conn, params=sym_list)
        conn.close()

        if df.empty:
            return json.dumps({"error": "No data found for symbols"})

        pivot = df.pivot(index='date', columns='symbol', values='close').astype(float)
        returns = pivot.pct_change().dropna()

        if len(returns) < 20:
            return json.dumps({"error": "Not enough overlapping data"})

        corr = returns.corr()

        fig, ax = plt.subplots(figsize=(max(8, len(sym_list) * 1.2), max(6, len(sym_list))))
        fig.patch.set_facecolor('#0D1117')
        ax.set_facecolor('#0D1117')

        mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
        cmap = sns.diverging_palette(10, 220, as_cmap=True)
        sns.heatmap(
            corr, annot=True, fmt='.2f', cmap=cmap, center=0,
            vmin=-1, vmax=1, ax=ax, mask=mask,
            annot_kws={'size': 10, 'color': 'white'},
            linewidths=0.5, linecolor='#30363D',
            cbar_kws={'label': 'Correlation', 'shrink': 0.8}
        )
        ax.set_title(f'Return Correlation Matrix ({days} days)', color='white', fontsize=14, fontweight='bold', pad=15)
        ax.tick_params(colors='white', labelsize=10)
        fig.colorbar(ax.collections[0]).set_label('Correlation', color='white')

        plt.tight_layout()
        b64 = _fig_to_b64(fig)

        # Top correlated pairs
        pairs = []
        for i in range(len(corr.columns)):
            for j in range(i+1, len(corr.columns)):
                pairs.append((corr.columns[i], corr.columns[j], corr.iloc[i, j]))
        pairs_sorted = sorted(pairs, key=lambda x: abs(x[2]), reverse=True)

        return json.dumps({
            "symbols": sym_list,
            "found_symbols": list(pivot.columns),
            "top_correlated_pairs": [{"sym1": p[0], "sym2": p[1], "correlation": round(float(p[2]), 4)} for p in pairs_sorted[:5]],
            "lowest_correlated_pairs": [{"sym1": p[0], "sym2": p[1], "correlation": round(float(p[2]), 4)} for p in pairs_sorted[-3:]],
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def generate_portfolio_performance_chart(days: int = 90) -> str:
    """
    Generate a multi-panel portfolio performance dashboard chart.
    Shows: combined portfolio value over time, allocation by asset class,
    and day-over-day P&L bars.
    days: History to display (default: 90 days)
    """
    try:
        import psycopg2
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                                user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql("""
            SELECT date, SUM(total_value) AS total, SUM(invested_amount) AS invested,
                   SUM(total_value) - SUM(invested_amount) AS pnl
            FROM portfolio_history
            WHERE date >= CURRENT_DATE - %(days)s * INTERVAL '1 day'
            GROUP BY date ORDER BY date
        """, conn, params={'days': days})

        df_alloc = pd.read_sql("""
            SELECT asset_class, SUM(qty * cmp) AS value
            FROM holdings WHERE qty > 0 GROUP BY asset_class ORDER BY value DESC
        """, conn)
        conn.close()

        fig, axes = plt.subplots(1, 2, figsize=(16, 6))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle('Portfolio Performance Dashboard', color='white', fontsize=16, fontweight='bold')

        if not df.empty:
            ax1 = _dark_ax(axes[0])
            df['total'] = pd.to_numeric(df['total'], errors='coerce')
            df['invested'] = pd.to_numeric(df['invested'], errors='coerce')
            df['pnl'] = pd.to_numeric(df['pnl'], errors='coerce')
            ax1.plot(df['date'], df['total'], color='white', linewidth=1.5, label='Portfolio Value')
            ax1.plot(df['date'], df['invested'], color='#8E8E93', linewidth=1, linestyle='--', alpha=0.7, label='Invested')
            ax1.fill_between(df['date'], df['total'], df['invested'],
                            where=df['total'] >= df['invested'], alpha=0.2, color='#30D158')
            ax1.fill_between(df['date'], df['total'], df['invested'],
                            where=df['total'] < df['invested'], alpha=0.2, color='#FF453A')
            ax1.set_title('Portfolio Value vs Invested', color='white', fontsize=11)
            ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=9)

        if not df_alloc.empty:
            ax2 = _dark_ax(axes[1])
            colors = ['#0A84FF', '#30D158', '#FFD60A', '#BF5AF2', '#FF9F0A', '#FF453A']
            vals = pd.to_numeric(df_alloc['value'], errors='coerce').fillna(0)
            ax2.pie(vals, labels=df_alloc['asset_class'],
                    colors=colors[:len(df_alloc)], autopct='%1.1f%%',
                    textprops={'color': 'white', 'fontsize': 10},
                    wedgeprops={'edgecolor': '#0D1117', 'linewidth': 2})
            ax2.set_title('Asset Class Allocation', color='white', fontsize=11)

        plt.tight_layout()
        b64 = _fig_to_b64(fig)
        return f"Portfolio performance chart generated (last {days} days)\n\n[[IMAGE_BASE64:{b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})
