-- 04_nse_gold_features.sql
-- Comprehensive Technical Indicators and Alpha Generation

-- 1. Full Technical Indicators (MAs, Bollinger Bands, Momentum)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_tech_indicators AS
WITH daily_stats AS (
    SELECT 
        date,
        symbol,
        close_price,
        previous_close,
        pchange,
        volume,
        turnover,
        -- Simple Moving Averages
        AVG(close_price) OVER w_10 AS sma_10,
        AVG(close_price) OVER w_20 AS sma_20,
        AVG(close_price) OVER w_50 AS sma_50,
        AVG(close_price) OVER w_200 AS sma_200,
        -- Volume Moving Averages
        AVG(volume) OVER w_20 AS volume_sma_20,
        -- Standard Deviation for Bollinger Bands
        STDDEV(close_price) OVER w_20 AS stddev_20,
        -- Momentum: Price Rate of Change (10 day)
        (close_price - LAG(close_price, 10) OVER w_full) / NULLIF(LAG(close_price, 10) OVER w_full, 0) * 100 AS roc_10,
        -- Highs and Lows over 14 days
        MAX(close_price) OVER w_14 AS high_14,
        MIN(close_price) OVER w_14 AS low_14
    FROM nse_stocks_daily
    WINDOW 
        w_10 AS (PARTITION BY symbol ORDER BY date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW),
        w_14 AS (PARTITION BY symbol ORDER BY date ROWS BETWEEN 13 PRECEDING AND CURRENT ROW),
        w_20 AS (PARTITION BY symbol ORDER BY date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW),
        w_50 AS (PARTITION BY symbol ORDER BY date ROWS BETWEEN 49 PRECEDING AND CURRENT ROW),
        w_200 AS (PARTITION BY symbol ORDER BY date ROWS BETWEEN 199 PRECEDING AND CURRENT ROW),
        w_full AS (PARTITION BY symbol ORDER BY date)
)
SELECT 
    date,
    symbol,
    close_price,
    sma_10,
    sma_20,
    sma_50,
    sma_200,
    volume_sma_20,
    roc_10,
    -- Bollinger Bands
    sma_20 + (2 * stddev_20) AS bb_upper,
    sma_20 - (2 * stddev_20) AS bb_lower,
    -- Stochastic Oscillator (Fast)
    CASE WHEN (high_14 - low_14) = 0 THEN 50 
         ELSE ((close_price - low_14) / (high_14 - low_14)) * 100 END AS stochastic_14,
    -- Breakout Flag
    CASE WHEN close_price > sma_50 AND LAG(close_price, 1) OVER (PARTITION BY symbol ORDER BY date) <= LAG(sma_50, 1) OVER (PARTITION BY symbol ORDER BY date) THEN TRUE ELSE FALSE END AS cross_sma_50
FROM daily_stats;

-- 2. Volume-Backed Breakouts (Alpha Signal)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_alpha_volume_breakouts AS
SELECT 
    e.date,
    e.symbol,
    e.new_52w_val AS breakout_price,
    v.volume AS breakout_volume,
    v.week2_avg_volume,
    v.week1_vol_change_pct AS volume_surge_pct,
    s.pchange AS daily_return_pct
FROM nse_52w_extremes e
JOIN nse_volume_anomalies v ON e.symbol = v.symbol AND e.date = v.date
JOIN nse_stocks_daily s ON e.symbol = s.symbol AND e.date = s.date
WHERE e.extreme_type = 'HIGH'
  AND v.week1_vol_change_pct > 300; 

-- 3. Smart Money Footprints (Accumulation)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_alpha_smart_money AS
SELECT 
    d.date,
    d.symbol,
    d.deal_type,
    d.client_name,
    d.quantity AS deal_quantity,
    d.price AS deal_price,
    s.close_price,
    (s.close_price - d.price) / d.price * 100 AS closing_vs_deal_pct
FROM nse_large_deals d
JOIN nse_stocks_daily s ON d.symbol = s.symbol AND d.date = s.date
WHERE d.buy_sell = 'BUY'
  AND s.close_price < d.price
  AND d.deal_type IN ('BLOCK', 'BULK');

-- 4. Volatility Squeeze & Expansion
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_alpha_volatility_squeeze AS
SELECT 
    s.date,
    s.symbol,
    s.close_price,
    s.pchange AS today_return_pct,
    s.volume,
    v.week1_avg_volume,
    (s.volume::numeric / NULLIF(v.week1_avg_volume, 0)) AS volume_multiple
FROM nse_stocks_daily s
JOIN nse_volume_anomalies v ON s.symbol = v.symbol AND s.date = v.date
WHERE ABS(s.pchange) > 5 
  AND (s.volume::numeric / NULLIF(v.week1_avg_volume, 0)) > 2;

-- Indexing for MVs
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_tech_ind ON mv_tech_indicators(date, symbol);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vol_breakouts ON mv_alpha_volume_breakouts(date, symbol);
CREATE INDEX IF NOT EXISTS idx_mv_smart_money ON mv_alpha_smart_money(date, symbol);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_vol_squeeze ON mv_alpha_volatility_squeeze(date, symbol);
