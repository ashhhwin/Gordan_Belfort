"""
Quantitative finance tools for the Gordan Belfort AI agent.
Backtesting, Monte Carlo simulations, Markov chain analysis, ML models, and more.
"""

import io
import json
import base64
from langchain_core.tools import tool


def _fig_to_base64(fig):
    """Convert a matplotlib figure to base64 string for embedding."""
    buf = io.BytesIO()
    fig.savefig(buf, format='png', dpi=150, bbox_inches='tight', 
                facecolor='#0D1117', edgecolor='none')
    buf.seek(0)
    b64 = base64.b64encode(buf.read()).decode('utf-8')
    buf.close()
    return b64


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
    Run a backtest on a trading strategy and return performance metrics + equity curve chart.
    
    Args:
        symbol: Stock ticker symbol
        strategy: Strategy type — "sma_crossover" | "rsi_mean_reversion" | "momentum" | "bollinger_bands"
        short_window: Short moving average period (default: 20)
        long_window: Long moving average period (default: 50)
        initial_capital: Starting capital for the backtest (default: 100000)
        days: Number of trading days to backtest (default: 252, i.e., 1 year)
    """
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    # Fetch data
    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql(f"""
            SELECT date, open, high, low, close, volume 
            FROM market_data WHERE symbol = '{symbol.upper()}'
            ORDER BY date DESC LIMIT {days}
        """, conn)
        conn.close()
    except Exception as e:
        return f"Database error fetching data for {symbol}: {e}"

    if df.empty or len(df) < long_window + 10:
        return f"Insufficient data for {symbol}. Need at least {long_window + 10} days, got {len(df)}."

    df = df.sort_values('date').reset_index(drop=True)
    df['close'] = df['close'].astype(float)

    # Generate signals based on strategy
    if strategy == "sma_crossover":
        df['sma_short'] = df['close'].rolling(short_window).mean()
        df['sma_long'] = df['close'].rolling(long_window).mean()
        df['signal'] = 0
        df.loc[df['sma_short'] > df['sma_long'], 'signal'] = 1
        df.loc[df['sma_short'] <= df['sma_long'], 'signal'] = -1

    elif strategy == "rsi_mean_reversion":
        delta = df['close'].diff()
        gain = delta.where(delta > 0, 0).rolling(14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(14).mean()
        rs = gain / loss.replace(0, np.nan)
        df['rsi'] = 100 - (100 / (1 + rs))
        df['signal'] = 0
        df.loc[df['rsi'] < 30, 'signal'] = 1   # Oversold = buy
        df.loc[df['rsi'] > 70, 'signal'] = -1  # Overbought = sell

    elif strategy == "momentum":
        df['returns'] = df['close'].pct_change(short_window)
        df['signal'] = 0
        df.loc[df['returns'] > 0, 'signal'] = 1
        df.loc[df['returns'] <= 0, 'signal'] = -1

    elif strategy == "bollinger_bands":
        df['sma'] = df['close'].rolling(short_window).mean()
        df['std'] = df['close'].rolling(short_window).std()
        df['upper'] = df['sma'] + 2 * df['std']
        df['lower'] = df['sma'] - 2 * df['std']
        df['signal'] = 0
        df.loc[df['close'] < df['lower'], 'signal'] = 1
        df.loc[df['close'] > df['upper'], 'signal'] = -1
    else:
        return f"Unknown strategy: {strategy}. Available: sma_crossover, rsi_mean_reversion, momentum, bollinger_bands"

    # Simulate P&L
    df['position'] = df['signal'].shift(1).fillna(0)
    df['daily_return'] = df['close'].pct_change().fillna(0)
    df['strategy_return'] = df['position'] * df['daily_return']
    df['equity'] = initial_capital * (1 + df['strategy_return']).cumprod()
    df['buy_hold_equity'] = initial_capital * (1 + df['daily_return']).cumprod()

    # Performance metrics
    total_return = (df['equity'].iloc[-1] / initial_capital - 1) * 100
    buy_hold_return = (df['buy_hold_equity'].iloc[-1] / initial_capital - 1) * 100
    sharpe = df['strategy_return'].mean() / df['strategy_return'].std() * np.sqrt(252) if df['strategy_return'].std() > 0 else 0
    max_dd = ((df['equity'] / df['equity'].cummax()) - 1).min() * 100
    sortino_denom = df['strategy_return'][df['strategy_return'] < 0].std()
    sortino = df['strategy_return'].mean() / sortino_denom * np.sqrt(252) if sortino_denom > 0 else 0
    win_rate = (df['strategy_return'] > 0).sum() / (df['strategy_return'] != 0).sum() * 100 if (df['strategy_return'] != 0).sum() > 0 else 0
    num_trades = (df['signal'].diff() != 0).sum()

    # Plot equity curve
    fig, axes = plt.subplots(2, 1, figsize=(14, 8), gridspec_kw={'height_ratios': [3, 1]})
    fig.patch.set_facecolor('#0D1117')

    ax1 = axes[0]
    ax1.set_facecolor('#0D1117')
    ax1.plot(df['date'], df['equity'], color='#30D158', linewidth=1.5, label='Strategy')
    ax1.plot(df['date'], df['buy_hold_equity'], color='#8E8E93', linewidth=1, alpha=0.7, label='Buy & Hold')
    ax1.fill_between(df['date'], df['equity'], df['buy_hold_equity'], 
                     where=df['equity'] >= df['buy_hold_equity'], alpha=0.1, color='#30D158')
    ax1.fill_between(df['date'], df['equity'], df['buy_hold_equity'],
                     where=df['equity'] < df['buy_hold_equity'], alpha=0.1, color='#FF453A')
    ax1.set_title(f'{symbol} — {strategy.replace("_", " ").title()} Backtest', 
                  color='white', fontsize=14, fontweight='bold')
    ax1.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white')
    ax1.tick_params(colors='#8E8E93')
    ax1.spines['bottom'].set_color('#30363D')
    ax1.spines['left'].set_color('#30363D')
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))

    ax2 = axes[1]
    ax2.set_facecolor('#0D1117')
    drawdown = (df['equity'] / df['equity'].cummax() - 1) * 100
    ax2.fill_between(df['date'], drawdown, 0, color='#FF453A', alpha=0.3)
    ax2.plot(df['date'], drawdown, color='#FF453A', linewidth=0.8)
    ax2.set_title('Drawdown %', color='#8E8E93', fontsize=10)
    ax2.tick_params(colors='#8E8E93')
    ax2.spines['bottom'].set_color('#30363D')
    ax2.spines['left'].set_color('#30363D')
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    metrics = {
        "symbol": symbol.upper(),
        "strategy": strategy,
        "period_days": len(df),
        "initial_capital": initial_capital,
        "final_equity": round(df['equity'].iloc[-1], 2),
        "total_return_pct": round(total_return, 2),
        "buy_hold_return_pct": round(buy_hold_return, 2),
        "alpha_pct": round(total_return - buy_hold_return, 2),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "max_drawdown_pct": round(max_dd, 2),
        "win_rate_pct": round(win_rate, 2),
        "num_trades": int(num_trades),
    }

    return json.dumps(metrics, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def monte_carlo_simulation(
    symbol: str,
    num_simulations: int = 500,
    forecast_days: int = 60,
    initial_investment: float = 100000
) -> str:
    """
    Run Monte Carlo simulation to forecast potential price paths and risk metrics.
    Generates a fan chart visualization with confidence intervals.
    
    Args:
        symbol: Stock ticker symbol
        num_simulations: Number of random paths to simulate (default: 500)
        forecast_days: Number of trading days to forecast (default: 60)
        initial_investment: Starting investment amount (default: 100000)
    """
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql(f"""
            SELECT date, close FROM market_data 
            WHERE symbol = '{symbol.upper()}' ORDER BY date DESC LIMIT 252
        """, conn)
        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    if df.empty or len(df) < 30:
        return f"Insufficient data for {symbol}."

    df = df.sort_values('date').reset_index(drop=True)
    prices = df['close'].astype(float).values
    log_returns = np.diff(np.log(prices))
    mu = log_returns.mean()
    sigma = log_returns.std()
    last_price = prices[-1]

    # Simulate
    np.random.seed(42)
    simulations = np.zeros((num_simulations, forecast_days))
    for i in range(num_simulations):
        daily_returns = np.random.normal(mu, sigma, forecast_days)
        price_path = last_price * np.exp(np.cumsum(daily_returns))
        simulations[i] = price_path

    # Statistics
    final_prices = simulations[:, -1]
    percentiles = np.percentile(final_prices, [5, 25, 50, 75, 95])
    expected_value = initial_investment * (np.median(final_prices) / last_price)
    var_95 = initial_investment * (1 - percentiles[0] / last_price)
    prob_profit = (final_prices > last_price).sum() / num_simulations * 100

    # Plot fan chart
    fig, ax = plt.subplots(figsize=(14, 7))
    fig.patch.set_facecolor('#0D1117')
    ax.set_facecolor('#0D1117')

    days = range(1, forecast_days + 1)
    p5 = np.percentile(simulations, 5, axis=0)
    p25 = np.percentile(simulations, 25, axis=0)
    p50 = np.percentile(simulations, 50, axis=0)
    p75 = np.percentile(simulations, 75, axis=0)
    p95 = np.percentile(simulations, 95, axis=0)

    ax.fill_between(days, p5, p95, alpha=0.1, color='#0A84FF', label='5th–95th %ile')
    ax.fill_between(days, p25, p75, alpha=0.2, color='#0A84FF', label='25th–75th %ile')
    ax.plot(days, p50, color='#0A84FF', linewidth=2, label='Median')
    ax.axhline(y=last_price, color='#8E8E93', linestyle='--', alpha=0.5, label=f'Current: ₹{last_price:,.2f}')

    # Plot a few sample paths
    for i in range(min(20, num_simulations)):
        ax.plot(days, simulations[i], alpha=0.03, color='#BF5AF2', linewidth=0.5)

    ax.set_title(f'{symbol} — Monte Carlo Simulation ({num_simulations} paths, {forecast_days} days)',
                 color='white', fontsize=14, fontweight='bold')
    ax.set_xlabel('Trading Days', color='#8E8E93')
    ax.set_ylabel('Price (₹)', color='#8E8E93')
    ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=9)
    ax.tick_params(colors='#8E8E93')
    ax.spines['bottom'].set_color('#30363D')
    ax.spines['left'].set_color('#30363D')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    result = {
        "symbol": symbol.upper(),
        "current_price": round(last_price, 2),
        "forecast_days": forecast_days,
        "num_simulations": num_simulations,
        "daily_mu": round(mu, 6),
        "daily_sigma": round(sigma, 6),
        "annual_volatility_pct": round(sigma * np.sqrt(252) * 100, 2),
        "final_price_percentiles": {
            "5th": round(percentiles[0], 2),
            "25th": round(percentiles[1], 2),
            "median": round(percentiles[2], 2),
            "75th": round(percentiles[3], 2),
            "95th": round(percentiles[4], 2),
        },
        "expected_portfolio_value": round(expected_value, 2),
        "value_at_risk_95_pct": round(var_95, 2),
        "probability_of_profit_pct": round(prob_profit, 2),
    }

    return json.dumps(result, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def markov_chain_analysis(symbol: str, states: int = 3, lookback_days: int = 252) -> str:
    """
    Perform Markov Chain regime analysis on a stock's returns.
    Identifies market regimes (e.g., Bear/Neutral/Bull) and transition probabilities.
    Generates a transition matrix visualization and regime chart.
    
    Args:
        symbol: Stock ticker symbol
        states: Number of market regimes to identify (default: 3 = Bear/Neutral/Bull)
        lookback_days: Days of history to analyze (default: 252)
    """
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql(f"""
            SELECT date, close FROM market_data
            WHERE symbol = '{symbol.upper()}' ORDER BY date DESC LIMIT {lookback_days}
        """, conn)
        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    if df.empty or len(df) < 50:
        return f"Insufficient data for {symbol}."

    df = df.sort_values('date').reset_index(drop=True)
    df['returns'] = df['close'].astype(float).pct_change().dropna()
    returns = df['returns'].dropna().values

    # Discretize into states using quantiles
    state_labels = ['Bear', 'Neutral', 'Bull'] if states == 3 else [f'State_{i}' for i in range(states)]
    thresholds = np.quantile(returns, np.linspace(0, 1, states + 1))
    state_sequence = np.digitize(returns, thresholds[1:-1])

    # Build transition matrix
    trans_matrix = np.zeros((states, states))
    for i in range(len(state_sequence) - 1):
        trans_matrix[state_sequence[i]][state_sequence[i + 1]] += 1
    row_sums = trans_matrix.sum(axis=1, keepdims=True)
    row_sums[row_sums == 0] = 1
    trans_prob = trans_matrix / row_sums

    # Stationary distribution
    eigenvalues, eigenvectors = np.linalg.eig(trans_prob.T)
    idx = np.argmin(np.abs(eigenvalues - 1))
    stationary = np.real(eigenvectors[:, idx])
    stationary = stationary / stationary.sum()

    current_state = state_labels[state_sequence[-1]]

    # Plot: transition matrix heatmap + regime timeline
    fig, axes = plt.subplots(1, 2, figsize=(16, 6), gridspec_kw={'width_ratios': [1, 2]})
    fig.patch.set_facecolor('#0D1117')

    # Heatmap
    ax1 = axes[0]
    ax1.set_facecolor('#0D1117')
    ax1.imshow(trans_prob, cmap='Blues', vmin=0, vmax=1)
    for i in range(states):
        for j in range(states):
            ax1.text(j, i, f'{trans_prob[i, j]:.2f}', ha='center', va='center',
                     color='white' if trans_prob[i, j] > 0.5 else '#E0E0E0', fontsize=12, fontweight='bold')
    ax1.set_xticks(range(states))
    ax1.set_yticks(range(states))
    ax1.set_xticklabels(state_labels, color='#8E8E93', fontsize=10)
    ax1.set_yticklabels(state_labels, color='#8E8E93', fontsize=10)
    ax1.set_title('Transition Probabilities', color='white', fontsize=12, fontweight='bold')
    ax1.set_xlabel('To State', color='#8E8E93')
    ax1.set_ylabel('From State', color='#8E8E93')

    # Regime timeline
    ax2 = axes[1]
    ax2.set_facecolor('#0D1117')
    colors_map = {'Bear': '#FF453A', 'Neutral': '#FFD60A', 'Bull': '#30D158'}
    fallback_colors = ['#FF453A', '#FFD60A', '#30D158', '#0A84FF', '#BF5AF2']
    dates = df['date'].iloc[1:].values
    for i, (d, s) in enumerate(zip(dates, state_sequence)):
        label = state_labels[s]
        c = colors_map.get(label, fallback_colors[s % len(fallback_colors)])
        ax2.axvspan(i - 0.5, i + 0.5, alpha=0.3, color=c)
    ax2.plot(range(len(dates)), df['close'].iloc[1:].astype(float).values, color='white', linewidth=0.8)
    ax2.set_title(f'{symbol} — Market Regime Timeline', color='white', fontsize=12, fontweight='bold')
    ax2.tick_params(colors='#8E8E93')
    ax2.set_xlim(0, len(dates))
    ax2.spines['top'].set_visible(False)
    ax2.spines['right'].set_visible(False)
    ax2.spines['bottom'].set_color('#30363D')
    ax2.spines['left'].set_color('#30363D')

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    result = {
        "symbol": symbol.upper(),
        "num_states": states,
        "state_labels": state_labels,
        "current_regime": current_state,
        "transition_matrix": {
            state_labels[i]: {state_labels[j]: round(trans_prob[i, j], 4) for j in range(states)}
            for i in range(states)
        },
        "stationary_distribution": {state_labels[i]: round(stationary[i], 4) for i in range(states)},
        "regime_persistence": {state_labels[i]: round(trans_prob[i, i], 4) for i in range(states)},
    }

    return json.dumps(result, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def train_price_predictor(symbol: str, model_type: str = "random_forest", forecast_days: int = 5) -> str:
    """
    Train an ML model to predict future price movement direction and magnitude.
    Uses technical features (SMA, RSI, MACD, volume ratios) as inputs.
    
    Args:
        symbol: Stock ticker symbol
        model_type: "random_forest" | "gradient_boosting" | "linear_regression"
        forecast_days: Days ahead to predict (default: 5)
    """
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
    from sklearn.linear_model import LinearRegression
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.metrics import mean_absolute_error, r2_score
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        df = pd.read_sql(f"""
            SELECT date, open, high, low, close, volume
            FROM market_data WHERE symbol = '{symbol.upper()}'
            ORDER BY date ASC
        """, conn)
        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    if len(df) < 100:
        return f"Need at least 100 data points for ML. Got {len(df)} for {symbol}."

    df['close'] = df['close'].astype(float)
    df['volume'] = df['volume'].astype(float)

    # Feature engineering
    df['sma_10'] = df['close'].rolling(10).mean()
    df['sma_20'] = df['close'].rolling(20).mean()
    df['sma_50'] = df['close'].rolling(50).mean()
    df['rsi'] = 100 - (100 / (1 + df['close'].diff().apply(lambda x: max(x, 0)).rolling(14).mean() /
                                df['close'].diff().apply(lambda x: abs(min(x, 0))).rolling(14).mean().replace(0, np.nan)))
    df['macd'] = df['close'].ewm(span=12).mean() - df['close'].ewm(span=26).mean()
    df['vol_ratio'] = df['volume'] / df['volume'].rolling(20).mean()
    df['daily_range'] = (df['high'].astype(float) - df['low'].astype(float)) / df['close']
    df['returns_5d'] = df['close'].pct_change(5)
    df['returns_10d'] = df['close'].pct_change(10)

    # Target: future N-day return
    df['target'] = df['close'].shift(-forecast_days) / df['close'] - 1
    df = df.dropna()

    features = ['sma_10', 'sma_20', 'sma_50', 'rsi', 'macd', 'vol_ratio', 'daily_range', 'returns_5d', 'returns_10d']
    X = df[features].values
    y = df['target'].values

    # Time-series cross-validation
    tscv = TimeSeriesSplit(n_splits=5)
    models = {
        "random_forest": RandomForestRegressor(n_estimators=100, max_depth=10, random_state=42),
        "gradient_boosting": GradientBoostingRegressor(n_estimators=100, max_depth=5, random_state=42),
        "linear_regression": LinearRegression(),
    }

    model = models.get(model_type, models["random_forest"])
    cv_scores = []
    predictions_all = []
    actuals_all = []

    for train_idx, test_idx in tscv.split(X):
        model.fit(X[train_idx], y[train_idx])
        preds = model.predict(X[test_idx])
        cv_scores.append(r2_score(y[test_idx], preds))
        predictions_all.extend(preds)
        actuals_all.extend(y[test_idx])

    # Final model on all data
    model.fit(X, y)
    latest_features = X[-1:].reshape(1, -1)
    prediction = model.predict(latest_features)[0]

    # Feature importance
    if hasattr(model, 'feature_importances_'):
        importances = dict(zip(features, [round(float(x), 4) for x in model.feature_importances_]))
    else:
        importances = {}

    # Plot
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    fig.patch.set_facecolor('#0D1117')

    ax1 = axes[0]
    ax1.set_facecolor('#0D1117')
    ax1.scatter(actuals_all, predictions_all, alpha=0.4, color='#0A84FF', s=10)
    lims = [min(min(actuals_all), min(predictions_all)), max(max(actuals_all), max(predictions_all))]
    ax1.plot(lims, lims, '--', color='#8E8E93', alpha=0.5)
    ax1.set_title('Predicted vs Actual Returns', color='white', fontsize=12, fontweight='bold')
    ax1.set_xlabel('Actual', color='#8E8E93')
    ax1.set_ylabel('Predicted', color='#8E8E93')
    ax1.tick_params(colors='#8E8E93')
    ax1.spines['top'].set_visible(False)
    ax1.spines['right'].set_visible(False)
    ax1.spines['bottom'].set_color('#30363D')
    ax1.spines['left'].set_color('#30363D')

    if importances:
        ax2 = axes[1]
        ax2.set_facecolor('#0D1117')
        sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
        ax2.barh([x[0] for x in sorted_imp], [x[1] for x in sorted_imp], color='#BF5AF2')
        ax2.set_title('Feature Importance', color='white', fontsize=12, fontweight='bold')
        ax2.tick_params(colors='#8E8E93')
        ax2.spines['top'].set_visible(False)
        ax2.spines['right'].set_visible(False)
        ax2.spines['bottom'].set_color('#30363D')
        ax2.spines['left'].set_color('#30363D')
    else:
        axes[1].set_visible(False)

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    current_price = float(df['close'].iloc[-1])
    predicted_price = current_price * (1 + prediction)

    result = {
        "symbol": symbol.upper(),
        "model": model_type,
        "forecast_days": forecast_days,
        "current_price": round(current_price, 2),
        "predicted_return_pct": round(prediction * 100, 3),
        "predicted_price": round(predicted_price, 2),
        "direction": "BULLISH" if prediction > 0 else "BEARISH",
        "cv_r2_scores": [round(s, 4) for s in cv_scores],
        "mean_cv_r2": round(np.mean(cv_scores), 4),
        "mae": round(mean_absolute_error(actuals_all, predictions_all), 6),
        "feature_importance": importances,
        "confidence": "HIGH" if np.mean(cv_scores) > 0.3 else "MODERATE" if np.mean(cv_scores) > 0.1 else "LOW",
    }

    return json.dumps(result, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def correlation_analysis(symbols: str, days: int = 120) -> str:
    """
    Compute and visualize the correlation matrix for a set of stock symbols.
    Useful for portfolio diversification and risk analysis.
    
    Args:
        symbols: Comma-separated list of stock symbols (e.g., "RELIANCE,TCS,INFY,HDFC")
        days: Number of trading days to analyze (default: 120)
    """
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    symbol_list = [s.strip().upper() for s in symbols.split(",")]
    if len(symbol_list) < 2:
        return "Need at least 2 symbols for correlation analysis."

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

    pivot = df.pivot_table(index='date', columns='symbol', values='close').astype(float)
    returns = pivot.pct_change().dropna()
    corr = returns.corr()

    fig, ax = plt.subplots(figsize=(10, 8))
    fig.patch.set_facecolor('#0D1117')
    ax.set_facecolor('#0D1117')

    im = ax.imshow(corr.values, cmap='RdYlGn', vmin=-1, vmax=1)
    for i in range(len(corr)):
        for j in range(len(corr)):
            val = corr.values[i, j]
            ax.text(j, i, f'{val:.2f}', ha='center', va='center',
                    color='black' if abs(val) > 0.5 else 'white', fontsize=11, fontweight='bold')

    ax.set_xticks(range(len(corr.columns)))
    ax.set_yticks(range(len(corr.columns)))
    ax.set_xticklabels(corr.columns, color='#E0E0E0', fontsize=10, rotation=45, ha='right')
    ax.set_yticklabels(corr.columns, color='#E0E0E0', fontsize=10)
    ax.set_title('Return Correlation Matrix', color='white', fontsize=14, fontweight='bold', pad=15)
    plt.colorbar(im, ax=ax, shrink=0.8)

    plt.tight_layout()
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    return json.dumps({
        "symbols": symbol_list,
        "period_days": days,
        "correlation_matrix": {
            sym: {s2: round(corr.loc[sym, s2], 4) for s2 in corr.columns}
            for sym in corr.columns if sym in corr.columns
        }
    }, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"


@tool
def portfolio_risk_analysis(confidence_level: float = 0.95) -> str:
    """
    Comprehensive portfolio risk analysis: VaR, CVaR, Beta, volatility decomposition.
    Generates a risk dashboard visualization.
    
    Args:
        confidence_level: Confidence level for VaR/CVaR calculations (default: 0.95)
    """
    import numpy as np
    import pandas as pd
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    import psycopg2
    from api.config import PG_HOST, PG_PORT, PG_NAME, PG_USER, PG_PASSWORD

    try:
        conn = psycopg2.connect(host=PG_HOST, port=PG_PORT, dbname=PG_NAME, user=PG_USER, password=PG_PASSWORD)
        holdings = pd.read_sql("SELECT symbol, qty, cmp FROM holdings WHERE qty > 0 AND asset_class IN ('EQUITY', 'MF', 'ETF')", conn)
        
        if holdings.empty:
            conn.close()
            return "No equity holdings found for risk analysis."

        holdings['value'] = holdings['qty'].astype(float) * holdings['cmp'].astype(float)
        total_value = holdings['value'].sum()
        holdings['weight'] = holdings['value'] / total_value

        # Get returns for each holding
        returns_data = {}
        for sym in holdings['symbol'].unique():
            df = pd.read_sql("SELECT date, close FROM market_data WHERE symbol = %s ORDER BY date DESC LIMIT 252", conn, params=(sym,))
            if len(df) > 10:
                df = df.sort_values('date')
                returns_data[sym] = df['close'].astype(float).pct_change().dropna().values

        conn.close()
    except Exception as e:
        return f"Database error: {e}"

    if not returns_data:
        return "No market data available for holdings to compute risk metrics."

    # Portfolio returns (simplified — equal-weighted for symbols with data)
    common_len = min(len(v) for v in returns_data.values())
    portfolio_returns = np.zeros(common_len)
    for sym, rets in returns_data.items():
        w = holdings.loc[holdings['symbol'] == sym, 'weight'].values[0]
        portfolio_returns += w * rets[-common_len:]

    # Risk metrics
    var = np.percentile(portfolio_returns, (1 - confidence_level) * 100)
    cvar = portfolio_returns[portfolio_returns <= var].mean() if (portfolio_returns <= var).sum() > 0 else var
    annual_vol = np.std(portfolio_returns) * np.sqrt(252) * 100
    daily_var_amount = abs(var) * total_value
    max_dd = ((np.maximum.accumulate(np.cumprod(1 + portfolio_returns)) - np.cumprod(1 + portfolio_returns)) / 
              np.maximum.accumulate(np.cumprod(1 + portfolio_returns))).max() * 100

    # Plot risk dashboard
    fig, axes = plt.subplots(2, 2, figsize=(14, 10))
    fig.patch.set_facecolor('#0D1117')
    fig.suptitle('Portfolio Risk Dashboard', color='white', fontsize=16, fontweight='bold', y=0.98)

    # Return distribution
    ax = axes[0, 0]
    ax.set_facecolor('#0D1117')
    ax.hist(portfolio_returns * 100, bins=50, color='#0A84FF', alpha=0.7, edgecolor='none')
    ax.axvline(var * 100, color='#FF453A', linewidth=2, label=f'VaR ({confidence_level:.0%}): {var*100:.2f}%')
    ax.axvline(cvar * 100, color='#FFD60A', linewidth=2, linestyle='--', label=f'CVaR: {cvar*100:.2f}%')
    ax.set_title('Return Distribution', color='white', fontsize=11)
    ax.legend(facecolor='#161B22', edgecolor='#30363D', labelcolor='white', fontsize=8)
    ax.tick_params(colors='#8E8E93')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#30363D')
    ax.spines['left'].set_color('#30363D')

    # Equity curve
    ax = axes[0, 1]
    ax.set_facecolor('#0D1117')
    equity = np.cumprod(1 + portfolio_returns) * total_value
    ax.plot(equity, color='#30D158', linewidth=1)
    ax.set_title('Portfolio Equity Curve', color='white', fontsize=11)
    ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f'₹{x:,.0f}'))
    ax.tick_params(colors='#8E8E93')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#30363D')
    ax.spines['left'].set_color('#30363D')

    # Rolling volatility
    ax = axes[1, 0]
    ax.set_facecolor('#0D1117')
    if len(portfolio_returns) > 20:
        rolling_vol = pd.Series(portfolio_returns).rolling(20).std() * np.sqrt(252) * 100
        ax.plot(rolling_vol.values, color='#BF5AF2', linewidth=1)
    ax.set_title('Rolling 20-Day Volatility (%)', color='white', fontsize=11)
    ax.tick_params(colors='#8E8E93')
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_color('#30363D')
    ax.spines['left'].set_color('#30363D')

    # Weight allocation pie
    ax = axes[1, 1]
    ax.set_facecolor('#0D1117')
    top_n = holdings.nlargest(8, 'value')
    colors = ['#0A84FF', '#30D158', '#FF453A', '#FFD60A', '#BF5AF2', '#FF9F0A', '#64D2FF', '#8E8E93']
    ax.pie(top_n['value'], labels=top_n['symbol'], colors=colors[:len(top_n)],
           autopct='%1.1f%%', textprops={'color': 'white', 'fontsize': 9})
    ax.set_title('Top Holdings by Value', color='white', fontsize=11)

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    chart_b64 = _fig_to_base64(fig)
    plt.close(fig)

    result = {
        "portfolio_value": round(total_value, 2),
        "num_holdings": len(holdings),
        f"var_{int(confidence_level*100)}pct_daily": round(var * 100, 4),
        f"var_{int(confidence_level*100)}pct_amount": round(daily_var_amount, 2),
        f"cvar_{int(confidence_level*100)}pct_daily": round(cvar * 100, 4),
        "annual_volatility_pct": round(annual_vol, 2),
        "max_drawdown_pct": round(max_dd, 2),
        "analysis_period_days": common_len,
    }

    return json.dumps(result, indent=2) + f"\n\n[[IMAGE_BASE64:{chart_b64}]]"
