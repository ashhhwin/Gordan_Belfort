"""
Quant MCP Tools — Full quantitative finance suite.
Includes: Technical analysis, GARCH, Markowitz optimization, factor models,
backtesting, ML (sklearn/XGBoost), deep learning (PyTorch optional),
statistical tests, and beautiful chart generation.
"""

import io
import json
import base64
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from langchain_core.tools import tool
from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD


# ── Helpers ────────────────────────────────────────────────────

def _get_pg():
    import psycopg2
    return psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)


def _fetch_nse(symbol: str, days: int = 252) -> pd.DataFrame:
    """Fetch NSE stock history as a clean DataFrame."""
    conn = _get_pg()
    df = pd.read_sql("""
        SELECT date, close_price AS close, previous_close,
               pchange, volume, turnover
        FROM nse_stocks_daily
        WHERE symbol = %s
        ORDER BY date ASC
        LIMIT %s
    """, conn, params=(symbol.upper(), days))
    conn.close()
    if not df.empty:
        df['close'] = df['close'].astype(float)
        df['date'] = pd.to_datetime(df['date'])
    return df


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
#  Technical Analysis (pandas-ta)
# ══════════════════════════════════════════════════════════════

@tool
def calculate_technical_indicators(symbol: str, days: int = 100) -> str:
    """
    Calculate a comprehensive set of technical indicators for an NSE stock.
    Includes: RSI(14), MACD(12,26,9), ATR(14), Bollinger Bands(20), Stochastic(14),
              OBV, SMA 20/50/200, EMA 12/26.
    symbol: NSE ticker (e.g. 'TRENT', 'RELIANCE')
    days: Historical bars to analyze (default: 100)
    Returns: Latest indicator values + trend signals + chart.
    """
    try:
        import pandas_ta as ta
    except ImportError:
        return json.dumps({"error": "pandas-ta not installed. Run: pip install pandas-ta"})

    try:
        conn = _get_pg()
        df = pd.read_sql("""
            SELECT date, close_price AS close, previous_close,
                   volume
            FROM nse_stocks_daily WHERE symbol = %s
            ORDER BY date ASC LIMIT %s
        """, conn, params=(symbol.upper(), days * 2))
        conn.close()

        if df.empty or len(df) < 30:
            return json.dumps({"error": f"Insufficient data for {symbol}"})

        df['close'] = df['close'].astype(float)
        df['volume'] = df['volume'].astype(float).fillna(0)

        # Compute indicators
        df.ta.rsi(length=14, append=True)
        df.ta.macd(append=True)
        df.ta.bbands(length=20, append=True)
        df.ta.stoch(append=True)
        df.ta.atr(length=14, append=True)
        df.ta.obv(append=True)
        df['SMA_20'] = ta.sma(df['close'], length=20)
        df['SMA_50'] = ta.sma(df['close'], length=50)
        df['SMA_200'] = ta.sma(df['close'], length=200)
        df['EMA_12'] = ta.ema(df['close'], length=12)
        df['EMA_26'] = ta.ema(df['close'], length=26)

        df = df.tail(days).copy()
        latest = df.iloc[-1].to_dict()

        # Build signals
        signals = []
        price = float(latest['close'])
        rsi = latest.get('RSI_14')
        if rsi:
            rsi = float(rsi)
            if rsi > 70: signals.append(f"RSI {rsi:.1f} — OVERBOUGHT")
            elif rsi < 30: signals.append(f"RSI {rsi:.1f} — OVERSOLD")
            else: signals.append(f"RSI {rsi:.1f} — Neutral")

        macd_line = latest.get('MACD_12_26_9')
        macd_sig = latest.get('MACDs_12_26_9')
        if macd_line and macd_sig:
            if float(macd_line) > float(macd_sig):
                signals.append("MACD above signal line — BULLISH momentum")
            else:
                signals.append("MACD below signal line — BEARISH momentum")

        sma200 = latest.get('SMA_200')
        if sma200 and not np.isnan(float(sma200)):
            if price > float(sma200):
                signals.append(f"Price above SMA 200 (₹{float(sma200):.2f}) — BULLISH long-term")
            else:
                signals.append(f"Price below SMA 200 (₹{float(sma200):.2f}) — BEARISH long-term")

        # Chart
        fig, axes = plt.subplots(4, 1, figsize=(14, 14),
                                 gridspec_kw={'height_ratios': [3, 1, 1, 1]})
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'{symbol} — Technical Analysis', color='white', fontsize=14, fontweight='bold')

        # Price + MAs + Bollinger
        ax1 = _dark_ax(axes[0])
        ax1.plot(df.index, df['close'], color='white', linewidth=1.5, label='Price')
        if 'SMA_20' in df.columns: ax1.plot(df.index, df['SMA_20'], color='#FFD60A', linewidth=1, alpha=0.8, label='SMA 20')
        if 'SMA_50' in df.columns: ax1.plot(df.index, df['SMA_50'], color='#30D158', linewidth=1, alpha=0.8, label='SMA 50')
        if 'SMA_200' in df.columns: ax1.plot(df.index, df['SMA_200'], color='#FF453A', linewidth=1, alpha=0.8, label='SMA 200')
        bb_upper_col = [c for c in df.columns if 'BBU' in c]
        bb_lower_col = [c for c in df.columns if 'BBL' in c]
        if bb_upper_col and bb_lower_col:
            ax1.fill_between(df.index, df[bb_upper_col[0]], df[bb_lower_col[0]], alpha=0.08, color='#0A84FF', label='Bollinger')
        ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)
        ax1.set_ylabel('Price (₹)', color='#8E8E93')

        # RSI
        ax2 = _dark_ax(axes[1])
        rsi_col = [c for c in df.columns if 'RSI' in c]
        if rsi_col:
            ax2.plot(df.index, df[rsi_col[0]], color='#BF5AF2', linewidth=1.2)
            ax2.axhline(70, color='#FF453A', linewidth=0.8, linestyle='--', alpha=0.7)
            ax2.axhline(30, color='#30D158', linewidth=0.8, linestyle='--', alpha=0.7)
            ax2.set_ylim(0, 100)
        ax2.set_ylabel('RSI(14)', color='#8E8E93')

        # MACD
        ax3 = _dark_ax(axes[2])
        macd_col = [c for c in df.columns if c.startswith('MACD_') and 'MACDs' not in c and 'MACDh' not in c]
        macds_col = [c for c in df.columns if 'MACDs' in c]
        macdh_col = [c for c in df.columns if 'MACDh' in c]
        if macd_col: ax3.plot(df.index, df[macd_col[0]], color='#0A84FF', linewidth=1, label='MACD')
        if macds_col: ax3.plot(df.index, df[macds_col[0]], color='#FF9F0A', linewidth=1, label='Signal')
        if macdh_col:
            hist_vals = df[macdh_col[0]].fillna(0)
            ax3.bar(df.index, hist_vals,
                    color=np.where(hist_vals >= 0, '#30D158', '#FF453A'), alpha=0.6, width=0.8)
        ax3.set_ylabel('MACD', color='#8E8E93')
        ax3.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=7)

        # Volume
        ax4 = _dark_ax(axes[3])
        ax4.bar(df.index, df['volume'], color='#0A84FF', alpha=0.5, width=0.8)
        ax4.set_ylabel('Volume', color='#8E8E93')

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "latest_price": round(price, 2),
            "signals": signals,
            "indicators": {k: (round(float(v), 4) if v is not None and not (isinstance(v, float) and np.isnan(v)) else None)
                          for k, v in latest.items()
                          if k not in ('date',) and isinstance(v, (int, float, np.floating))}
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        import traceback
        return json.dumps({"error": str(e), "traceback": traceback.format_exc()})


# ══════════════════════════════════════════════════════════════
#  GARCH Volatility Modeling
# ══════════════════════════════════════════════════════════════

@tool
def calculate_garch_volatility(symbol: str, forecast_days: int = 30) -> str:
    """
    Fit a GARCH(1,1) model to estimate and forecast volatility for an NSE stock.
    Produces: current conditional volatility, 30-day forecast, annualized vol,
    and a volatility term structure chart.
    symbol: NSE ticker
    forecast_days: Number of days to forecast (default: 30)
    """
    try:
        from arch import arch_model
    except ImportError:
        return json.dumps({"error": "arch not installed. Run: pip install arch"})

    try:
        df = _fetch_nse(symbol, days=504)
        if len(df) < 60:
            return json.dumps({"error": f"Insufficient data for {symbol} GARCH fit"})

        returns = df['close'].pct_change().dropna() * 100  # percentage returns

        # Fit GARCH(1,1)
        model = arch_model(returns, vol='Garch', p=1, q=1, dist='Normal')
        result = model.fit(disp='off', show_warning=False)

        # Forecast
        forecast = result.forecast(horizon=forecast_days, reindex=False)
        vol_forecast = np.sqrt(forecast.variance.values[-1]) / 100  # back to decimal

        current_vol_daily = float(result.conditional_volatility.iloc[-1]) / 100
        annual_vol = current_vol_daily * np.sqrt(252) * 100

        # Chart: conditional volatility
        fig, axes = plt.subplots(2, 1, figsize=(14, 8))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'{symbol} — GARCH(1,1) Volatility Model', color='white', fontsize=14, fontweight='bold')

        ax1 = _dark_ax(axes[0])
        cond_vol = result.conditional_volatility / 100 * np.sqrt(252) * 100
        ax1.plot(df['date'].iloc[-len(cond_vol):].values, cond_vol.values,
                 color='#BF5AF2', linewidth=1.2, label='Conditional Vol (Annualized %)')
        ax1.fill_between(df['date'].iloc[-len(cond_vol):].values, cond_vol.values, alpha=0.2, color='#BF5AF2')
        ax1.set_ylabel('Annualized Volatility %', color='#8E8E93')
        ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)

        ax2 = _dark_ax(axes[1])
        fdays = np.arange(1, forecast_days + 1)
        fvol = vol_forecast * np.sqrt(fdays) * 100  # term structure
        ax2.plot(fdays, fvol, color='#FF9F0A', linewidth=2, marker='o', markersize=3)
        ax2.set_xlabel('Forecast Days', color='#8E8E93')
        ax2.set_ylabel('Cumulative Vol %', color='#8E8E93')
        ax2.set_title('Volatility Term Structure (Forecast)', color='#8E8E93', fontsize=10)

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        params = result.params
        return json.dumps({
            "symbol": symbol.upper(),
            "model": "GARCH(1,1)",
            "current_daily_vol_pct": round(current_vol_daily * 100, 4),
            "current_annual_vol_pct": round(annual_vol, 2),
            "omega": round(float(params.get('omega', 0)), 8),
            "alpha": round(float(params.get('alpha[1]', 0)), 6),
            "beta": round(float(params.get('beta[1]', 0)), 6),
            "persistence": round(float(params.get('alpha[1]', 0)) + float(params.get('beta[1]', 0)), 6),
            "aic": round(float(result.aic), 2),
            "bic": round(float(result.bic), 2),
            "30d_vol_forecast": {
                f"day_{i+1}": round(float(vol_forecast[i]) * 100, 4)
                for i in range(min(5, forecast_days))
            },
            "interpretation": f"Volatility is {'HIGH (>30%)' if annual_vol > 30 else 'MODERATE (15-30%)' if annual_vol > 15 else 'LOW (<15%)'} at {annual_vol:.1f}% annualized. "
                             f"Persistence: {float(params.get('alpha[1]', 0)) + float(params.get('beta[1]', 0)):.3f} "
                             f"({'shocks persist long' if float(params.get('alpha[1]', 0)) + float(params.get('beta[1]', 0)) > 0.95 else 'shocks mean-revert quickly'})."
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Portfolio Optimization (Markowitz via cvxpy)
# ══════════════════════════════════════════════════════════════

@tool
def optimize_portfolio_weights(symbols: str, risk_tolerance: float = 0.5) -> str:
    """
    Run Markowitz mean-variance portfolio optimization using cvxpy.
    Finds the optimal portfolio weights that maximize Sharpe ratio.
    symbols: Comma-separated NSE tickers (e.g. 'TRENT,RELIANCE,INFY,HDFC')
    risk_tolerance: 0=min variance, 1=max return (default: 0.5 = max Sharpe approx)
    Returns: optimal weights, expected return, volatility, Sharpe ratio, efficient frontier chart.
    """
    try:
        import cvxpy as cp
    except ImportError:
        return json.dumps({"error": "cvxpy not installed. Run: pip install cvxpy"})

    sym_list = [s.strip().upper() for s in symbols.split(",")]
    if len(sym_list) < 2:
        return json.dumps({"error": "Need at least 2 symbols for optimization"})

    try:
        conn = _get_pg()
        placeholders = ','.join(['%s'] * len(sym_list))
        df = pd.read_sql(f"""
            SELECT date, symbol, close_price AS close
            FROM nse_stocks_daily
            WHERE symbol IN ({placeholders})
            ORDER BY date
        """, conn, params=sym_list)
        conn.close()

        if df.empty:
            return json.dumps({"error": "No data found for provided symbols"})

        pivot = df.pivot(index='date', columns='symbol', values='close').astype(float).dropna()
        returns = pivot.pct_change().dropna()

        if len(returns) < 30:
            return json.dumps({"error": f"Need at least 30 days of data. Got {len(returns)}"})

        mu = returns.mean().values * 252        # annualized returns
        Sigma = returns.cov().values * 252       # annualized covariance
        n = len(sym_list)

        # cvxpy: maximize risk_tolerance * return - (1-risk_tolerance) * variance
        w = cp.Variable(n)
        ret = mu @ w
        risk = cp.quad_form(w, Sigma)
        prob = cp.Problem(
            cp.Maximize(risk_tolerance * ret - (1 - risk_tolerance) * risk),
            [cp.sum(w) == 1, w >= 0.02, w <= 0.40]  # min 2%, max 40% per stock
        )
        prob.solve(solver=cp.SCS, verbose=False)

        if w.value is None:
            return json.dumps({"error": "Optimization failed to converge. Try different symbols or risk_tolerance."})

        weights = np.maximum(w.value, 0)
        weights = weights / weights.sum()

        port_return = float(mu @ weights) * 100
        port_vol = float(np.sqrt(weights @ Sigma @ weights)) * 100
        port_sharpe = port_return / port_vol if port_vol > 0 else 0

        # Equal-weight benchmark comparison
        ew = np.ones(n) / n
        ew_return = float(mu @ ew) * 100
        ew_vol = float(np.sqrt(ew @ Sigma @ ew)) * 100

        # Generate efficient frontier
        frontier_returns, frontier_vols = [], []
        for rt in np.linspace(0, 1, 40):
            w_f = cp.Variable(n)
            prob_f = cp.Problem(
                cp.Maximize(rt * (mu @ w_f) - (1 - rt) * cp.quad_form(w_f, Sigma)),
                [cp.sum(w_f) == 1, w_f >= 0, w_f <= 0.5]
            )
            prob_f.solve(solver=cp.SCS, verbose=False)
            if w_f.value is not None:
                wf = np.maximum(w_f.value, 0); wf = wf / wf.sum()
                frontier_returns.append(float(mu @ wf) * 100)
                frontier_vols.append(float(np.sqrt(wf @ Sigma @ wf)) * 100)

        # Chart
        fig, ax = plt.subplots(figsize=(12, 7))
        fig.patch.set_facecolor('#0D1117')
        _dark_ax(ax)

        if frontier_vols:
            ax.scatter(frontier_vols, frontier_returns, s=8, c='#0A84FF', alpha=0.5, label='Efficient Frontier')

        ax.scatter([port_vol], [port_return], s=200, c='#30D158', marker='*',
                   zorder=5, label=f'Optimal Portfolio (Sharpe: {port_sharpe:.2f})')
        ax.scatter([ew_vol], [ew_return], s=100, c='#FF453A', marker='s',
                   zorder=5, label='Equal-Weight Benchmark')

        # Label individual stocks
        for i, sym in enumerate(sym_list):
            stock_vol = float(np.sqrt(Sigma[i, i])) * 100
            stock_ret = float(mu[i]) * 100
            ax.scatter([stock_vol], [stock_ret], s=60, c='#FFD60A', alpha=0.7, zorder=4)
            ax.annotate(sym, (stock_vol, stock_ret), fontsize=8, color='#E0E0E0',
                       xytext=(5, 5), textcoords='offset points')

        ax.set_xlabel('Annualized Volatility (%)', color='#8E8E93', fontsize=11)
        ax.set_ylabel('Annualized Return (%)', color='#8E8E93', fontsize=11)
        ax.set_title('Efficient Frontier — Markowitz Mean-Variance', color='white', fontsize=14, fontweight='bold')
        ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=9)
        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbols": sym_list,
            "optimal_weights": {sym_list[i]: round(float(weights[i]), 4) for i in range(n)},
            "portfolio_metrics": {
                "expected_annual_return_pct": round(port_return, 2),
                "annual_volatility_pct": round(port_vol, 2),
                "sharpe_ratio": round(port_sharpe, 3),
            },
            "equal_weight_benchmark": {
                "expected_annual_return_pct": round(ew_return, 2),
                "annual_volatility_pct": round(ew_vol, 2),
                "sharpe_ratio": round(ew_return / ew_vol if ew_vol else 0, 3),
            },
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Factor Regression (OLS Beta/Alpha vs Nifty 50)
# ══════════════════════════════════════════════════════════════

@tool
def run_factor_regression(symbol: str, days: int = 252) -> str:
    """
    Run OLS regression of a stock's returns vs Nifty 50 (market factor).
    Computes: alpha (abnormal return), beta (market sensitivity), R², p-values.
    symbol: NSE ticker
    days: History to use (default: 252 = 1 year)
    """
    try:
        from statsmodels.api import OLS, add_constant
        from scipy import stats
    except ImportError:
        return json.dumps({"error": "statsmodels not installed. Run: pip install statsmodels"})

    try:
        conn = _get_pg()
        df_stock = pd.read_sql("""
            SELECT date, pchange FROM nse_stocks_daily
            WHERE symbol = %s ORDER BY date DESC LIMIT %s
        """, conn, params=(symbol.upper(), days))

        df_nifty = pd.read_sql("""
            SELECT date, pchange FROM nse_indices_daily
            WHERE index_name = 'NIFTY 50' ORDER BY date DESC LIMIT %s
        """, conn, params=(days,))
        conn.close()

        if df_stock.empty or df_nifty.empty:
            return json.dumps({"error": "Insufficient data for factor regression"})

        merged = df_stock.merge(df_nifty, on='date', suffixes=('_stock', '_nifty'))
        merged = merged.dropna()

        if len(merged) < 30:
            return json.dumps({"error": f"Only {len(merged)} overlapping dates. Need at least 30."})

        y = merged['pchange_stock'].astype(float).values
        X = add_constant(merged['pchange_nifty'].astype(float).values)

        model = OLS(y, X).fit()
        alpha_daily = float(model.params[0])
        beta = float(model.params[1])
        r2 = float(model.rsquared)
        alpha_annual = alpha_daily * 252

        # Chart
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'{symbol} vs Nifty 50 — Factor Regression', color='white', fontsize=13, fontweight='bold')

        ax1 = _dark_ax(axes[0])
        nifty_r = merged['pchange_nifty'].astype(float)
        stock_r = merged['pchange_stock'].astype(float)
        ax1.scatter(nifty_r, stock_r, alpha=0.3, s=15, color='#0A84FF')
        x_line = np.linspace(nifty_r.min(), nifty_r.max(), 100)
        ax1.plot(x_line, model.params[0] + model.params[1] * x_line, color='#FF453A', linewidth=2)
        ax1.axhline(0, color='#30363D', linewidth=0.5)
        ax1.axvline(0, color='#30363D', linewidth=0.5)
        ax1.set_xlabel('Nifty 50 Daily Return %', color='#8E8E93')
        ax1.set_ylabel(f'{symbol} Daily Return %', color='#8E8E93')
        ax1.set_title(f'β={beta:.3f}, α={alpha_annual:.2f}%/yr, R²={r2:.3f}', color='white', fontsize=10)

        ax2 = _dark_ax(axes[1])
        residuals = model.resid
        ax2.hist(residuals, bins=30, color='#BF5AF2', alpha=0.7, edgecolor='none')
        ax2.set_title('Residuals Distribution', color='white', fontsize=10)
        ax2.set_xlabel('Residual', color='#8E8E93')

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "beta": round(beta, 4),
            "alpha_daily_pct": round(alpha_daily, 5),
            "alpha_annualized_pct": round(alpha_annual, 3),
            "r_squared": round(r2, 4),
            "beta_p_value": round(float(model.pvalues[1]), 6),
            "alpha_p_value": round(float(model.pvalues[0]), 6),
            "is_beta_significant": float(model.pvalues[1]) < 0.05,
            "is_alpha_significant": float(model.pvalues[0]) < 0.05,
            "observations": len(merged),
            "interpretation": (
                f"Beta of {beta:.2f} means {symbol} moves {abs(beta):.2f}x the market "
                f"({'amplified' if abs(beta) > 1 else 'dampened'} volatility, "
                f"{'same' if beta > 0 else 'inverse'} direction). "
                f"Alpha of {alpha_annual:.2f}%/yr is "
                f"{'statistically significant (p<0.05)' if float(model.pvalues[0]) < 0.05 else 'not significant (p>0.05)'}."
            )
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Pairs Trading / Cointegration
# ══════════════════════════════════════════════════════════════

@tool
def run_cointegration_test(symbol1: str, symbol2: str, days: int = 252) -> str:
    """
    Test two NSE stocks for cointegration (pairs trading eligibility).
    Runs Engle-Granger cointegration test + calculates hedge ratio and current z-score.
    z-score > 2 = short sym1 / long sym2; z-score < -2 = long sym1 / short sym2.
    """
    try:
        from statsmodels.tsa.stattools import coint, adfuller
    except ImportError:
        return json.dumps({"error": "statsmodels not installed"})

    try:
        conn = _get_pg()
        df1 = pd.read_sql("SELECT date, close_price FROM nse_stocks_daily WHERE symbol=%s ORDER BY date ASC LIMIT %s",
                          conn, params=(symbol1.upper(), days))
        df2 = pd.read_sql("SELECT date, close_price FROM nse_stocks_daily WHERE symbol=%s ORDER BY date ASC LIMIT %s",
                          conn, params=(symbol2.upper(), days))
        conn.close()

        merged = df1.merge(df2, on='date', suffixes=('_1', '_2')).dropna()
        if len(merged) < 60:
            return json.dumps({"error": "Need at least 60 overlapping trading days"})

        s1 = merged['close_price_1'].astype(float)
        s2 = merged['close_price_2'].astype(float)

        # Cointegration test
        t_stat, p_value, crit_values = coint(s1, s2)

        # Hedge ratio via OLS
        from statsmodels.api import OLS, add_constant
        model = OLS(s1, add_constant(s2)).fit()
        hedge_ratio = float(model.params[1])

        # Spread and z-score
        spread = s1 - hedge_ratio * s2
        spread_mean = spread.mean()
        spread_std = spread.std()
        z_score = (spread.iloc[-1] - spread_mean) / spread_std

        # Rolling z-score
        z_series = (spread - spread.rolling(20).mean()) / spread.rolling(20).std()

        # Chart
        fig, axes = plt.subplots(2, 1, figsize=(14, 8))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'Pairs: {symbol1} vs {symbol2} — Cointegration Analysis',
                     color='white', fontsize=13, fontweight='bold')

        ax1 = _dark_ax(axes[0])
        ax1_r = ax1.twinx()
        ax1.plot(merged['date'], s1.values, color='#0A84FF', linewidth=1, label=symbol1)
        ax1_r.plot(merged['date'], s2.values, color='#FF9F0A', linewidth=1, label=symbol2, alpha=0.8)
        ax1.set_ylabel(symbol1, color='#0A84FF')
        ax1_r.set_ylabel(symbol2, color='#FF9F0A')
        ax1.set_title(f'Price History (hedge ratio: {hedge_ratio:.3f})', color='white', fontsize=10)
        ax1.set_facecolor('#0D1117')

        ax2 = _dark_ax(axes[1])
        ax2.plot(merged['date'], z_series.values, color='#BF5AF2', linewidth=1.2)
        ax2.axhline(2, color='#FF453A', linewidth=0.8, linestyle='--', label='Short signal (+2σ)')
        ax2.axhline(-2, color='#30D158', linewidth=0.8, linestyle='--', label='Long signal (-2σ)')
        ax2.axhline(0, color='#8E8E93', linewidth=0.5)
        ax2.fill_between(merged['date'], z_series.values, 0,
                        where=z_series.values > 2, alpha=0.2, color='#FF453A')
        ax2.fill_between(merged['date'], z_series.values, 0,
                        where=z_series.values < -2, alpha=0.2, color='#30D158')
        ax2.set_ylabel('Z-Score', color='#8E8E93')
        ax2.set_title('Spread Z-Score (Rolling 20-day)', color='#8E8E93', fontsize=10)
        ax2.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        current_z = float(z_series.iloc[-1]) if not np.isnan(float(z_series.iloc[-1])) else float(z_score)
        signal = "NEUTRAL"
        if current_z > 2: signal = f"SHORT {symbol1} / LONG {symbol2} (spread overextended)"
        elif current_z < -2: signal = f"LONG {symbol1} / SHORT {symbol2} (spread underextended)"

        return json.dumps({
            "symbols": [symbol1.upper(), symbol2.upper()],
            "cointegration_p_value": round(float(p_value), 6),
            "is_cointegrated_95pct": float(p_value) < 0.05,
            "is_cointegrated_99pct": float(p_value) < 0.01,
            "hedge_ratio": round(hedge_ratio, 4),
            "current_z_score": round(current_z, 4),
            "signal": signal,
            "spread_mean": round(float(spread_mean), 4),
            "spread_std": round(float(spread_std), 4),
            "observations": len(merged)
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Portfolio Risk Metrics (Real Holdings)
# ══════════════════════════════════════════════════════════════

@tool
def calculate_portfolio_var_real(confidence_level: float = 0.95) -> str:
    """
    Calculate Value at Risk (VaR) and CVaR for the actual IBKR portfolio.
    Uses historical simulation method on real holdings' market data.
    confidence_level: Confidence level (default: 0.95 = 95% VaR)
    Returns: Daily VaR amount, CVaR, portfolio volatility, max drawdown, and risk dashboard chart.
    """
    try:
        import psycopg2, psycopg2.extras
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                                user=PG_USER, password=PG_PASSWORD,
                                cursor_factory=psycopg2.extras.RealDictCursor)
        cur = conn.cursor()

        # Get IBKR holdings
        cur.execute("""
            SELECT symbol, market_value, position, average_cost
            FROM ibkr_portfolio_holdings
            WHERE date = (SELECT MAX(date) FROM ibkr_portfolio_holdings)
        """)
        holdings = cur.fetchall()
        cur.close(); conn.close()

        if not holdings:
            return json.dumps({"error": "No IBKR holdings found"})

        total_value = sum(float(h['market_value'] or 0) for h in holdings)
        weights_map = {h['symbol']: float(h['market_value'] or 0) / total_value for h in holdings}

        # Get historical returns from market.market_data for US stocks
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME,
                                user=PG_USER, password=PG_PASSWORD)
        returns_data = {}
        for h in holdings:
            sym = h['symbol']
            df = pd.read_sql("""
                SELECT trade_date, p_close
                FROM market.market_data WHERE symbol = %s
                ORDER BY trade_date ASC
            """, conn, params=(sym,))
            if len(df) >= 10:
                df['return'] = df['p_close'].astype(float).pct_change().dropna()
                returns_data[sym] = df['return'].dropna().values

        conn.close()

        if not returns_data:
            return json.dumps({"error": "No price history found for IBKR holdings in market.market_data"})

        # Portfolio returns (weighted)
        common_len = min(len(v) for v in returns_data.values())
        if common_len < 30:
            return json.dumps({"error": "Need at least 30 days of overlapping history"})

        port_returns = np.zeros(common_len)
        for sym, rets in returns_data.items():
            w = weights_map.get(sym, 0)
            port_returns += w * rets[-common_len:]

        var = np.percentile(port_returns, (1 - confidence_level) * 100)
        cvar = port_returns[port_returns <= var].mean() if (port_returns <= var).sum() > 0 else var
        annual_vol = np.std(port_returns) * np.sqrt(252) * 100
        daily_var_amount = abs(var) * total_value
        cvar_amount = abs(cvar) * total_value

        # Max drawdown
        cumrets = np.cumprod(1 + port_returns)
        rolling_max = np.maximum.accumulate(cumrets)
        drawdowns = (cumrets - rolling_max) / rolling_max
        max_dd = float(drawdowns.min()) * 100

        # Chart
        fig, axes = plt.subplots(2, 2, figsize=(14, 10))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle('IBKR Portfolio Risk Dashboard', color='white', fontsize=16, fontweight='bold')

        ax = _dark_ax(axes[0, 0])
        ax.hist(port_returns * 100, bins=50, color='#0A84FF', alpha=0.7, edgecolor='none')
        ax.axvline(var * 100, color='#FF453A', lw=2, label=f'VaR {confidence_level:.0%}: {var*100:.2f}%')
        ax.axvline(cvar * 100, color='#FFD60A', lw=2, ls='--', label=f'CVaR: {cvar*100:.2f}%')
        ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)
        ax.set_title('Return Distribution', color='white', fontsize=11)

        ax = _dark_ax(axes[0, 1])
        ax.plot(cumrets * total_value, color='#30D158', lw=1)
        ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'${x:,.0f}'))
        ax.set_title('Portfolio Equity Curve (Simulated)', color='white', fontsize=11)

        ax = _dark_ax(axes[1, 0])
        ax.fill_between(range(len(drawdowns)), drawdowns * 100, 0, color='#FF453A', alpha=0.4)
        ax.plot(drawdowns * 100, color='#FF453A', lw=0.8)
        ax.set_title('Drawdown %', color='white', fontsize=11)
        ax.set_ylabel('%', color='#8E8E93')

        ax = _dark_ax(axes[1, 1])
        if len(returns_data) > 1:
            colors = ['#0A84FF', '#30D158', '#FF453A', '#FFD60A', '#BF5AF2', '#FF9F0A']
            syms = list(returns_data.keys())
            vals = [weights_map.get(s, 0) * 100 for s in syms]
            ax.pie(vals, labels=syms,
                   colors=colors[:len(syms)], autopct='%1.1f%%',
                   textprops={'color': 'white', 'fontsize': 9})
        ax.set_title('Portfolio Weights', color='white', fontsize=11)

        plt.tight_layout(rect=[0, 0, 1, 0.96])
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "portfolio_value_usd": round(total_value, 2),
            "confidence_level": confidence_level,
            f"var_{int(confidence_level*100)}pct_daily_pct": round(float(var * 100), 4),
            f"var_{int(confidence_level*100)}pct_daily_amount_usd": round(daily_var_amount, 2),
            f"cvar_{int(confidence_level*100)}pct_daily_pct": round(float(cvar * 100), 4),
            f"cvar_amount_usd": round(cvar_amount, 2),
            "annual_volatility_pct": round(annual_vol, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "holdings_analyzed": list(returns_data.keys()),
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  ML Models
# ══════════════════════════════════════════════════════════════

@tool
def train_price_predictor(symbol: str, model_type: str = "xgboost", forecast_days: int = 5) -> str:
    """
    Train an ML model to predict future price direction and magnitude for an NSE stock.
    Features: SMA 10/20/50, RSI, MACD, volume ratio, daily range, 5/10-day returns.
    model_type: 'xgboost' | 'random_forest' | 'gradient_boosting' | 'linear_regression'
    forecast_days: Days ahead to predict (default: 5)
    Returns: prediction, confidence, feature importance, CV R², and scatter chart.
    """
    try:
        df = _fetch_nse(symbol, days=500)
        if len(df) < 100:
            return json.dumps({"error": f"Need at least 100 days. Got {len(df)} for {symbol}"})

        df['sma_10'] = df['close'].rolling(10).mean()
        df['sma_20'] = df['close'].rolling(20).mean()
        df['sma_50'] = df['close'].rolling(50).mean()
        df['returns_1d'] = df['close'].pct_change()
        df['returns_5d'] = df['close'].pct_change(5)
        df['returns_10d'] = df['close'].pct_change(10)
        df['vol_ratio'] = df['volume'].astype(float) / df['volume'].astype(float).rolling(20).mean()
        df['daily_range'] = (df['close'] - df['close'].shift(1)) / df['close'].shift(1)
        delta = df['close'].diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        df['rsi'] = 100 - (100 / (1 + gain / loss.replace(0, 1e-10)))
        df['macd'] = df['close'].ewm(span=12).mean() - df['close'].ewm(span=26).mean()
        df['target'] = df['close'].shift(-forecast_days) / df['close'] - 1
        df = df.dropna()

        features = ['sma_10', 'sma_20', 'sma_50', 'returns_1d', 'returns_5d',
                   'returns_10d', 'vol_ratio', 'daily_range', 'rsi', 'macd']
        X = df[features].values
        y = df['target'].values

        from sklearn.model_selection import TimeSeriesSplit
        from sklearn.metrics import mean_absolute_error, r2_score

        tscv = TimeSeriesSplit(n_splits=5)

        if model_type == 'xgboost':
            try:
                from xgboost import XGBRegressor
                model = XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.05,
                                     subsample=0.8, colsample_bytree=0.8, random_state=42, verbosity=0)
            except ImportError:
                from sklearn.ensemble import GradientBoostingRegressor
                model = GradientBoostingRegressor(n_estimators=100, random_state=42)
        elif model_type == 'random_forest':
            from sklearn.ensemble import RandomForestRegressor
            model = RandomForestRegressor(n_estimators=100, max_depth=8, random_state=42, n_jobs=-1)
        elif model_type == 'gradient_boosting':
            from sklearn.ensemble import GradientBoostingRegressor
            model = GradientBoostingRegressor(n_estimators=100, max_depth=5, random_state=42)
        else:
            from sklearn.linear_model import LinearRegression
            model = LinearRegression()

        cv_scores, preds_all, actuals_all = [], [], []
        for train_idx, test_idx in tscv.split(X):
            model.fit(X[train_idx], y[train_idx])
            preds = model.predict(X[test_idx])
            cv_scores.append(r2_score(y[test_idx], preds))
            preds_all.extend(preds)
            actuals_all.extend(y[test_idx])

        model.fit(X, y)
        prediction = float(model.predict(X[-1:].reshape(1, -1))[0])

        importances = {}
        if hasattr(model, 'feature_importances_'):
            importances = {features[i]: round(float(model.feature_importances_[i]), 4)
                          for i in range(len(features))}
        elif hasattr(model, 'coef_'):
            importances = {features[i]: round(float(abs(model.coef_[i])), 6)
                          for i in range(len(features))}

        current_price = float(df['close'].iloc[-1])

        # Chart
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'{symbol} — ML Price Predictor ({model_type})', color='white', fontsize=13, fontweight='bold')

        ax1 = _dark_ax(axes[0])
        ax1.scatter(actuals_all, preds_all, alpha=0.3, s=10, color='#0A84FF')
        lims = [min(min(actuals_all), min(preds_all)), max(max(actuals_all), max(preds_all))]
        ax1.plot(lims, lims, '--', color='#8E8E93', alpha=0.5)
        ax1.set_title(f'Predicted vs Actual | CV R²: {np.mean(cv_scores):.3f}', color='white', fontsize=10)
        ax1.set_xlabel('Actual Return', color='#8E8E93')
        ax1.set_ylabel('Predicted Return', color='#8E8E93')

        if importances:
            ax2 = _dark_ax(axes[1])
            sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:10]
            ax2.barh([x[0] for x in sorted_imp], [x[1] for x in sorted_imp], color='#BF5AF2', alpha=0.8)
            ax2.set_title('Feature Importance', color='white', fontsize=10)

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "model": model_type,
            "forecast_days": forecast_days,
            "current_price": round(current_price, 2),
            "predicted_return_pct": round(prediction * 100, 3),
            "predicted_price": round(current_price * (1 + prediction), 2),
            "direction": "BULLISH" if prediction > 0 else "BEARISH",
            "mean_cv_r2": round(float(np.mean(cv_scores)), 4),
            "mae": round(mean_absolute_error(actuals_all, preds_all), 6),
            "confidence": "HIGH" if np.mean(cv_scores) > 0.3 else "MODERATE" if np.mean(cv_scores) > 0.1 else "LOW",
            "feature_importance": dict(sorted(importances.items(), key=lambda x: x[1], reverse=True)),
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def train_lstm_price_model(symbol: str, epochs: int = 30, lookback: int = 20) -> str:
    """
    Train an LSTM neural network for price sequence prediction.
    Requires PyTorch. Falls back gracefully if not installed.
    symbol: NSE ticker
    epochs: Training epochs (default: 30; more = better but slower)
    lookback: Sequence length (default: 20 days of history as input)
    Returns: Training loss curve, predictions, and performance metrics.
    """
    try:
        import torch
        import torch.nn as nn
        from torch.utils.data import DataLoader, TensorDataset
    except ImportError:
        return json.dumps({
            "error": "PyTorch not installed.",
            "install": "Run: pip install torch",
            "alternative": "Use train_price_predictor() with model_type='xgboost' instead."
        })

    try:
        df = _fetch_nse(symbol, days=400)
        if len(df) < lookback + 60:
            return json.dumps({"error": f"Need at least {lookback + 60} days"})

        # Normalize
        prices = df['close'].values.astype(np.float32)
        price_min, price_max = prices.min(), prices.max()
        norm_prices = (prices - price_min) / (price_max - price_min + 1e-8)

        # Sequences
        X_seqs, y_seqs = [], []
        for i in range(lookback, len(norm_prices)):
            X_seqs.append(norm_prices[i-lookback:i])
            y_seqs.append(norm_prices[i])

        X_tensor = torch.FloatTensor(X_seqs).unsqueeze(-1)  # (N, lookback, 1)
        y_tensor = torch.FloatTensor(y_seqs)

        split = int(len(X_tensor) * 0.8)
        X_train, X_test = X_tensor[:split], X_tensor[split:]
        y_train, y_test = y_tensor[:split], y_tensor[split:]

        # LSTM model
        class PriceLSTM(nn.Module):
            def __init__(self):
                super().__init__()
                self.lstm = nn.LSTM(input_size=1, hidden_size=64, num_layers=2,
                                    batch_first=True, dropout=0.2)
                self.fc = nn.Sequential(
                    nn.Linear(64, 32), nn.ReLU(), nn.Linear(32, 1)
                )
            def forward(self, x):
                out, _ = self.lstm(x)
                return self.fc(out[:, -1, :]).squeeze()

        model_lstm = PriceLSTM()
        optimizer = torch.optim.Adam(model_lstm.parameters(), lr=0.001)
        criterion = nn.MSELoss()

        train_ds = TensorDataset(X_train, y_train)
        loader = DataLoader(train_ds, batch_size=32, shuffle=False)

        losses = []
        model_lstm.train()
        for epoch in range(epochs):
            epoch_loss = 0
            for xb, yb in loader:
                optimizer.zero_grad()
                pred = model_lstm(xb)
                loss = criterion(pred, yb)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item()
            losses.append(epoch_loss / len(loader))

        # Evaluate
        model_lstm.eval()
        with torch.no_grad():
            test_preds = model_lstm(X_test).numpy()
            test_actual = y_test.numpy()

        # Denormalize
        preds_denorm = test_preds * (price_max - price_min) + price_min
        actual_denorm = test_actual * (price_max - price_min) + price_min

        from sklearn.metrics import mean_absolute_error, r2_score
        mae = mean_absolute_error(actual_denorm, preds_denorm)
        r2 = r2_score(actual_denorm, preds_denorm)

        # Next day prediction
        last_seq = torch.FloatTensor(norm_prices[-lookback:]).unsqueeze(0).unsqueeze(-1)
        with torch.no_grad():
            next_norm = float(model_lstm(last_seq).item())
        next_price = next_norm * (price_max - price_min) + price_min

        # Chart
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        fig.patch.set_facecolor('#0D1117')
        fig.suptitle(f'{symbol} — LSTM Price Model ({epochs} epochs)', color='white', fontsize=13, fontweight='bold')

        ax1 = _dark_ax(axes[0])
        ax1.plot(losses, color='#0A84FF', linewidth=1.5)
        ax1.set_title('Training Loss Curve', color='white', fontsize=10)
        ax1.set_xlabel('Epoch', color='#8E8E93')
        ax1.set_ylabel('MSE Loss', color='#8E8E93')

        ax2 = _dark_ax(axes[1])
        ax2.plot(actual_denorm[-60:], color='white', linewidth=1.2, label='Actual')
        ax2.plot(preds_denorm[-60:], color='#30D158', linewidth=1.2, linestyle='--', label='LSTM Predicted')
        ax2.set_title('Test Set: Predicted vs Actual', color='white', fontsize=10)
        ax2.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)
        ax2.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.2f}'))

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "model": "LSTM (2 layers, 64 hidden)",
            "epochs_trained": epochs,
            "lookback_days": lookback,
            "final_training_loss": round(losses[-1], 6),
            "test_mae_inr": round(float(mae), 2),
            "test_r2": round(float(r2), 4),
            "current_price": round(float(prices[-1]), 2),
            "predicted_next_price": round(float(next_price), 2),
            "predicted_direction": "UP" if next_price > prices[-1] else "DOWN",
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


# ══════════════════════════════════════════════════════════════
#  Keep Existing Working Tools (Fixed SQL)
# ══════════════════════════════════════════════════════════════

@tool
def run_backtest(
    symbol: str,
    strategy: str = "sma_crossover",
    short_window: int = 20,
    long_window: int = 50,
    initial_capital: float = 100000,
    days: int = 252
) -> str:
    """
    Run a vectorized backtest on an NSE stock.
    strategy: 'sma_crossover' | 'rsi_mean_reversion' | 'momentum' | 'bollinger_bands'
    symbol: NSE ticker (e.g. 'TRENT', 'RELIANCE')
    Returns: Sharpe, Sortino, max drawdown, win rate, equity curve chart.
    """
    try:
        df = _fetch_nse(symbol, days=days + long_window + 10)
        if df.empty or len(df) < long_window + 10:
            return json.dumps({"error": f"Insufficient data for {symbol}. Need {long_window+10} days."})

        if strategy == "sma_crossover":
            df['sma_short'] = df['close'].rolling(short_window).mean()
            df['sma_long'] = df['close'].rolling(long_window).mean()
            df['signal'] = np.where(df['sma_short'] > df['sma_long'], 1, -1)
        elif strategy == "rsi_mean_reversion":
            delta = df['close'].diff()
            gain = delta.clip(lower=0).rolling(14).mean()
            loss = (-delta.clip(upper=0)).rolling(14).mean()
            rsi = 100 - (100 / (1 + gain / loss.replace(0, 1e-10)))
            df['signal'] = np.where(rsi < 30, 1, np.where(rsi > 70, -1, 0))
        elif strategy == "momentum":
            df['signal'] = np.where(df['close'].pct_change(short_window) > 0, 1, -1)
        elif strategy == "bollinger_bands":
            sma = df['close'].rolling(short_window).mean()
            std = df['close'].rolling(short_window).std()
            df['signal'] = np.where(df['close'] < sma - 2*std, 1,
                           np.where(df['close'] > sma + 2*std, -1, 0))
        else:
            return json.dumps({"error": f"Unknown strategy. Use: sma_crossover | rsi_mean_reversion | momentum | bollinger_bands"})

        df['position'] = df['signal'].shift(1).fillna(0)
        df['daily_return'] = df['close'].pct_change().fillna(0)
        df['strategy_return'] = df['position'] * df['daily_return']
        df['equity'] = initial_capital * (1 + df['strategy_return']).cumprod()
        df['bh_equity'] = initial_capital * (1 + df['daily_return']).cumprod()
        df = df.dropna()

        total_return = (df['equity'].iloc[-1] / initial_capital - 1) * 100
        bh_return = (df['bh_equity'].iloc[-1] / initial_capital - 1) * 100
        strat_std = df['strategy_return'].std()
        sharpe = df['strategy_return'].mean() / strat_std * np.sqrt(252) if strat_std > 0 else 0
        neg_std = df['strategy_return'][df['strategy_return'] < 0].std()
        sortino = df['strategy_return'].mean() / neg_std * np.sqrt(252) if neg_std > 0 else 0
        max_dd = ((df['equity'] / df['equity'].cummax()) - 1).min() * 100
        win_rate = (df['strategy_return'] > 0).sum() / (df['strategy_return'] != 0).sum() * 100 if (df['strategy_return'] != 0).sum() > 0 else 0

        # Chart
        fig, axes = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={'height_ratios': [3, 1]})
        fig.patch.set_facecolor('#0D1117')

        ax1 = _dark_ax(axes[0])
        ax1.plot(df['date'], df['equity'], color='#30D158', linewidth=1.5, label='Strategy')
        ax1.plot(df['date'], df['bh_equity'], color='#8E8E93', linewidth=1, alpha=0.7, label='Buy & Hold')
        ax1.fill_between(df['date'], df['equity'], df['bh_equity'],
                        where=df['equity'] >= df['bh_equity'], alpha=0.1, color='#30D158')
        ax1.fill_between(df['date'], df['equity'], df['bh_equity'],
                        where=df['equity'] < df['bh_equity'], alpha=0.1, color='#FF453A')
        ax1.set_title(f'{symbol} — {strategy.replace("_", " ").title()} Backtest', color='white', fontsize=14, fontweight='bold')
        ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white')
        ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))

        ax2 = _dark_ax(axes[1])
        drawdown = (df['equity'] / df['equity'].cummax() - 1) * 100
        ax2.fill_between(df['date'], drawdown, 0, color='#FF453A', alpha=0.3)
        ax2.plot(df['date'], drawdown, color='#FF453A', linewidth=0.8)
        ax2.set_title('Drawdown %', color='#8E8E93', fontsize=10)

        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "strategy": strategy,
            "period_days": len(df),
            "initial_capital": initial_capital,
            "final_equity": round(float(df['equity'].iloc[-1]), 2),
            "total_return_pct": round(total_return, 2),
            "buy_hold_return_pct": round(bh_return, 2),
            "alpha_pct": round(total_return - bh_return, 2),
            "sharpe_ratio": round(sharpe, 3),
            "sortino_ratio": round(sortino, 3),
            "max_drawdown_pct": round(max_dd, 2),
            "win_rate_pct": round(win_rate, 2),
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def monte_carlo_simulation(symbol: str, num_simulations: int = 500, forecast_days: int = 60,
                            initial_investment: float = 100000) -> str:
    """
    Run Monte Carlo simulation for an NSE or US stock using geometric Brownian motion.
    symbol: Ticker (e.g. 'TRENT', 'AMD') | num_simulations: # of paths | forecast_days: horizon
    Returns: Probability of profit, percentile price targets, and fan chart.
    """
    try:
        # Try fetching from local Postgres NSE table first
        df = _fetch_nse(symbol, days=252)
        
        # If not found or insufficient, fallback to yfinance to support US stocks (like AMD)
        if df.empty or len(df) < 30:
            import yfinance as yf
            ticker_symbol = symbol.upper()
            # If it doesn't have an exchange suffix and we didn't find it in NSE, treat as US or check yfinance
            yf_df = yf.download(ticker_symbol, period="1y", progress=False)
            if not yf_df.empty and len(yf_df) >= 30:
                df = pd.DataFrame()
                df['close'] = yf_df['Close'].values.flatten()
                df['date'] = yf_df.index
            else:
                return json.dumps({"error": f"Insufficient data found for '{symbol}' in database and yfinance."})

        prices = df['close'].values
        log_returns = np.diff(np.log(prices))
        mu = log_returns.mean()
        sigma = log_returns.std()
        last_price = prices[-1]

        np.random.seed(42)
        simulations = np.zeros((num_simulations, forecast_days))
        for i in range(num_simulations):
            daily_returns = np.random.normal(mu, sigma, forecast_days)
            simulations[i] = last_price * np.exp(np.cumsum(daily_returns))

        final_prices = simulations[:, -1]
        percentiles = np.percentile(final_prices, [5, 25, 50, 75, 95])
        prob_profit = (final_prices > last_price).sum() / num_simulations * 100

        fig, ax = plt.subplots(figsize=(14, 7))
        fig.patch.set_facecolor('#0D1117')
        _dark_ax(ax)

        days_range = range(1, forecast_days + 1)
        p5  = np.percentile(simulations, 5, axis=0)
        p25 = np.percentile(simulations, 25, axis=0)
        p50 = np.percentile(simulations, 50, axis=0)
        p75 = np.percentile(simulations, 75, axis=0)
        p95 = np.percentile(simulations, 95, axis=0)

        ax.fill_between(days_range, p5, p95, alpha=0.1, color='#0A84FF', label='5th–95th %ile')
        ax.fill_between(days_range, p25, p75, alpha=0.2, color='#0A84FF', label='25th–75th %ile')
        ax.plot(days_range, p50, color='#0A84FF', linewidth=2, label='Median')
        ax.axhline(y=last_price, color='#8E8E93', linestyle='--', alpha=0.5)
        for i in range(min(30, num_simulations)):
            ax.plot(days_range, simulations[i], alpha=0.04, color='#BF5AF2', linewidth=0.4)

        ax.set_title(f'{symbol} — Monte Carlo ({num_simulations} paths, {forecast_days} days)',
                    color='white', fontsize=14, fontweight='bold')
        ax.set_xlabel('Trading Days', color='#8E8E93')
        ax.set_ylabel('Price (₹)', color='#8E8E93')
        ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=9)
        plt.tight_layout()
        chart_b64 = _fig_to_b64(fig)

        return json.dumps({
            "symbol": symbol.upper(),
            "current_price": round(float(last_price), 2),
            "annual_vol_pct": round(sigma * np.sqrt(252) * 100, 2),
            "percentile_targets": {
                "5th (bear)": round(float(percentiles[0]), 2),
                "25th": round(float(percentiles[1]), 2),
                "50th (base)": round(float(percentiles[2]), 2),
                "75th": round(float(percentiles[3]), 2),
                "95th (bull)": round(float(percentiles[4]), 2),
            },
            "probability_of_profit_pct": round(prob_profit, 1),
            "expected_value": round(float(initial_investment * np.median(final_prices) / last_price), 2),
            "var_95_pct": round(float(initial_investment * (1 - percentiles[0] / last_price)), 2),
        }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def calculate_kelly_criterion(win_rate: float, avg_win_pct: float, avg_loss_pct: float) -> str:
    """
    Calculate the Kelly Criterion for optimal position sizing.
    win_rate: Historical win rate as decimal (e.g. 0.55 for 55%)
    avg_win_pct: Average winning trade return % (e.g. 8.0 for 8%)
    avg_loss_pct: Average losing trade return % as positive number (e.g. 4.0 for -4%)
    Returns: Full Kelly %, Half Kelly (recommended), Quarter Kelly (conservative).
    """
    try:
        b = avg_win_pct / avg_loss_pct  # win/loss ratio
        p = win_rate
        q = 1 - win_rate
        kelly = (b * p - q) / b
        kelly_half = kelly / 2
        kelly_quarter = kelly / 4

        return json.dumps({
            "win_rate": win_rate,
            "avg_win_pct": avg_win_pct,
            "avg_loss_pct": avg_loss_pct,
            "win_loss_ratio": round(b, 3),
            "full_kelly_pct": round(kelly * 100, 2),
            "half_kelly_pct": round(kelly_half * 100, 2),
            "quarter_kelly_pct": round(kelly_quarter * 100, 2),
            "recommendation": "half_kelly" if kelly > 0 else "no_position",
            "interpretation": (
                f"Full Kelly: {kelly*100:.1f}% of portfolio per trade. "
                f"Recommended: Half Kelly at {kelly_half*100:.1f}% for better risk control. "
                f"{'PROFITABLE edge detected.' if kelly > 0 else 'NEGATIVE edge — do not trade this setup.'}"
            )
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def run_hypothesis_test(data_a_json: str, data_b_json: str, test_type: str = "ttest") -> str:
    """
    Run statistical hypothesis tests between two datasets.
    test_type: 'ttest' | 'mann_whitney' | 'ks_test' | 'levene'
    data_a_json / data_b_json: JSON arrays of numbers (e.g. "[1.2, 3.4, 2.1, ...]")
    Returns: test statistic, p-value, interpretation.
    """
    try:
        from scipy import stats
        a = json.loads(data_a_json)
        b = json.loads(data_b_json)

        if test_type == "ttest":
            stat, p = stats.ttest_ind(a, b)
            test_name = "Independent Samples T-Test"
        elif test_type == "mann_whitney":
            stat, p = stats.mannwhitneyu(a, b, alternative='two-sided')
            test_name = "Mann-Whitney U Test"
        elif test_type == "ks_test":
            stat, p = stats.ks_2samp(a, b)
            test_name = "Kolmogorov-Smirnov Test"
        elif test_type == "levene":
            stat, p = stats.levene(a, b)
            test_name = "Levene's Test for Equal Variances"
        else:
            return json.dumps({"error": "test_type must be: ttest | mann_whitney | ks_test | levene"})

        significant = float(p) < 0.05

        return json.dumps({
            "test": test_name,
            "statistic": round(float(stat), 6),
            "p_value": round(float(p), 8),
            "significant_at_5pct": significant,
            "significant_at_1pct": float(p) < 0.01,
            "dataset_a": {"mean": round(float(np.mean(a)), 4), "std": round(float(np.std(a)), 4), "n": len(a)},
            "dataset_b": {"mean": round(float(np.mean(b)), 4), "std": round(float(np.std(b)), 4), "n": len(b)},
            "conclusion": (
                f"{'REJECT' if significant else 'FAIL TO REJECT'} null hypothesis at 5% significance. "
                f"{'Distributions ARE statistically different.' if significant else 'No significant difference detected.'}"
            )
        }, indent=2)
    except Exception as e:
        return json.dumps({"error": str(e)})
