"""
Visualization tools for the Gordan Belfort AI agent.
Generates diagrams, flowcharts, and rich charts using Mermaid and Matplotlib.
"""

import io
import base64
import json
from langchain_core.tools import tool


def _fig_to_base64(fig):
    """Convert a matplotlib figure to base64 string."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight',
                facecolor='#0D1117', edgecolor='none')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    return b64


@tool
def generate_mermaid_diagram(diagram_code: str, title: str = "Diagram") -> str:
    """
    Generate a Mermaid diagram and return it as a rendered image.
    Supports flowcharts, sequence diagrams, class diagrams, state diagrams, 
    Gantt charts, pie charts, and more.
    
    The output will be rendered as a Mermaid code block in the chat UI, which
    the frontend will render natively. Just return the Mermaid syntax.
    
    Args:
        diagram_code: Valid Mermaid diagram syntax (e.g., "graph TD; A-->B; B-->C;")
        title: Title for the diagram
    """
    # Validate basic Mermaid syntax
    valid_starts = ['graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 
                    'stateDiagram', 'gantt', 'pie', 'erDiagram', 'journey',
                    'gitgraph', 'mindmap', 'timeline', 'sankey', 'xychart']
    
    first_line = diagram_code.strip().split('\n')[0].strip()
    is_valid = any(first_line.lower().startswith(v.lower()) for v in valid_starts)
    
    if not is_valid:
        return f"Invalid Mermaid syntax. Diagram must start with one of: {', '.join(valid_starts)}"
    
    # Return as a mermaid code block — the frontend will render it
    return f"```mermaid\n---\ntitle: {title}\n---\n{diagram_code}\n```"


@tool
def generate_candlestick_chart(symbol: str, days: int = 60) -> str:
    """
    Generate a professional candlestick chart with volume bars for a stock symbol.
    Includes SMA overlays and volume-price analysis.
    
    Args:
        symbol: Stock ticker symbol
        days: Number of trading days to display (default: 60)
    """
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql(f"""
            SELECT date, open, high, low, close, volume
            FROM market_data WHERE symbol = '{symbol.upper()}'
            ORDER BY date DESC LIMIT {days}
        """, conn)
        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    if df.empty:
        return f"No market data found for {symbol}."

    df = df.sort_values('date').reset_index(drop=True)
    for col in ['open', 'high', 'low', 'close', 'volume']:
        df[col] = df[col].astype(float)

    # Moving averages
    df['sma_10'] = df['close'].rolling(10).mean()
    df['sma_20'] = df['close'].rolling(20).mean()

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(16, 9), gridspec_kw={'height_ratios': [3, 1]}, sharex=True)
    fig.patch.set_facecolor('#0D1117')

    # Candlesticks
    ax1.set_facecolor('#0D1117')
    for i, row in df.iterrows():
        color = '#30D158' if row['close'] >= row['open'] else '#FF453A'
        ax1.plot([i, i], [row['low'], row['high']], color=color, linewidth=0.8)
        ax1.plot([i, i], [row['open'], row['close']], color=color, linewidth=3.5)

    ax1.plot(df.index, df['sma_10'], color='#0A84FF', linewidth=1, alpha=0.8, label='SMA 10')
    ax1.plot(df.index, df['sma_20'], color='#BF5AF2', linewidth=1, alpha=0.8, label='SMA 20')
    ax1.set_title(f'{symbol.upper()} — Candlestick Chart ({days} days)', color='white', fontsize=14, fontweight='bold')
    ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=9)
    ax1.tick_params(colors='#8E8E93')
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.spines['bottom'].set_color('#30363D')
    ax1.spines['left'].set_color('#30363D')
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))

    # Volume
    ax2.set_facecolor('#0D1117')
    colors = ['#30D158' if df['close'].iloc[i] >= df['open'].iloc[i] else '#FF453A' for i in range(len(df))]
    ax2.bar(df.index, df['volume'], color=colors, alpha=0.6)
    ax2.set_title('Volume', color='#8E8E93', fontsize=10)
    ax2.tick_params(colors='#8E8E93')
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)
    ax2.spines['bottom'].set_color('#30363D')
    ax2.spines['left'].set_color('#30363D')

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) > 1 else last
    change = last['close'] - prev['close']
    change_pct = (change / prev['close']) * 100

    summary = {
        "symbol": symbol.upper(),
        "latest_close": round(last['close'], 2),
        "change": round(change, 2),
        "change_pct": round(change_pct, 2),
        "high_period": round(df['high'].max(), 2),
        "low_period": round(df['low'].min(), 2),
        "avg_volume": round(df['volume'].mean(), 0),
    }

    return json.dumps(summary, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def generate_comparison_chart(symbols: str, metric: str = "returns", days: int = 90) -> str:
    """
    Generate a comparison chart for multiple stocks, comparing returns or prices.
    
    Args:
        symbols: Comma-separated list of symbols (e.g., "RELIANCE,TCS,INFY")
        metric: "returns" (normalized %) or "price" (absolute prices)
        days: Number of trading days (default: 90)
    """
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    
    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        placeholders = ','.join(['%s'] * len(symbol_list))
        df = pd.read_sql(f"""
            SELECT date, symbol, close FROM market_data
            WHERE symbol IN ({placeholders})
            ORDER BY date DESC LIMIT {days * len(symbol_list)}
        """, conn, params=symbol_list)
        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    pivot = df.pivot_table(index='date', columns='symbol', values='close').astype(float).sort_index()

    fig, ax = plt.subplots(figsize=(14, 7))
    fig.patch.set_facecolor('#0D1117')
    ax.set_facecolor('#0D1117')

    colors = ['#0A84FF', '#30D158', '#FF453A', '#FFD60A', '#BF5AF2', '#FF9F0A', '#64D2FF']

    for i, sym in enumerate(pivot.columns):
        series = pivot[sym].dropna()
        if metric == "returns":
            series = (series / series.iloc[0] - 1) * 100
            ax.plot(series.index, series.values, color=colors[i % len(colors)], linewidth=1.5, label=sym)
        else:
            ax.plot(series.index, series.values, color=colors[i % len(colors)], linewidth=1.5, label=sym)

    if metric == "returns":
        ax.axhline(y=0, color='#8E8E93', linestyle='--', alpha=0.3)
        ax.set_ylabel('Return (%)', color='#8E8E93')
    else:
        ax.set_ylabel('Price (₹)', color='#8E8E93')
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))

    ax.set_title(f'Stock Comparison — {metric.title()} ({days} days)', color='white', fontsize=14, fontweight='bold')
    ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white')
    ax.tick_params(colors='#8E8E93')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#30363D')
    ax.spines['left'].set_color('#30363D')

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    return f"Comparison chart generated for: {', '.join(symbol_list)}\n\n[[IMAGE_BASE64:{chart_b64}]]"
