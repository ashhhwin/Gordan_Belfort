PUBLIC SCHEMA TABLES:
─────────────────────────────────────────────────────────────
TABLE: holdings
PURPOSE: Indian portfolio holdings from IndMoney/CAMS sync
IMPORTANT: symbol column stores FULL COMPANY NAMES (e.g. "Nestle India Ltd"),
           NOT NSE tickers. Join to symbol_mappings for NSE symbol.
COLUMNS: id, user_id, asset_class [IND_EQUITY|MF|ETF|BOND],
         symbol (full name), name, sector, qty, avg_buy, cmp,
         day_change, day_change_pct, buy_date, created_at, updated_at
SAMPLE:
  symbol="Nestle India Ltd", asset_class="IND_EQUITY", qty=40, cmp=1382.60
  symbol="L&T Technology Services Ltd", qty=15, cmp=3322.40

TABLE: ibkr_portfolio_holdings
PURPOSE: US/Global positions from Interactive Brokers
COLUMNS: date, account, symbol [actual ticker e.g. AMD], sec_type, exchange,
         currency, position (fractional shares), market_price, market_value,
         average_cost, unrealized_pnl, realized_pnl
SAMPLE:
  symbol="AMD", position=1.22, market_price=522.11, unrealized_pnl=437.96
  symbol="ARKK", position=4.28, market_value=329.84, unrealized_pnl=-34.15

TABLE: nse_stocks_daily
PURPOSE: NSE daily stock data
PRIMARY KEY: (date, symbol)
COLUMNS: date, symbol [NSE ticker e.g. TRENT], close_price, pchange (% change),
         previous_close, volume, turnover, market_cap
SAMPLE:
  symbol="PARAS", date=2026-06-18, close_price=1295.00, pchange=18.88
  symbol="TRENT", date=2026-06-18, close_price=3108.00, pchange=7.25

TABLE: nse_volume_anomalies
PURPOSE: Stocks with unusual volume spikes (computed weekly averages)
PRIMARY KEY: (date, symbol)
COLUMNS: date, symbol, volume, week1_avg_volume, week1_vol_change_pct,
         week2_avg_volume, week2_vol_change_pct
SAMPLE:
  symbol="TCIEXP", date=2026-06-24, volume=4017518, week1_vol_change_pct=392.14

TABLE: nse_52w_extremes
PURPOSE: Stocks hitting new 52-week highs or lows
PRIMARY KEY: (date, symbol, extreme_type)
COLUMNS: date, symbol, extreme_type [HIGH|LOW], new_52w_val, prev_52w_val, prev_hl_date
SAMPLE:
  symbol="PARAS", extreme_type="HIGH", new_52w_val=32.00

TABLE: nse_large_deals
PURPOSE: Block/bulk deals on NSE
COLUMNS: id, date, symbol, deal_type [BLOCK|BULK], client_name, buy_sell,
         quantity, price

TABLE: nse_indices_daily
PURPOSE: Indian index daily data (Nifty 50, Midcap 100, SmallCap 100, etc.)
PRIMARY KEY: (date, index_name)
COLUMNS: date, index_name, open_val, high_val, low_val, close_val, pchange,
         advances, declines, pe, pb, dy
SAMPLE:
  index_name="NIFTY MIDCAP 100", date=2026-06-18, close_val=62123.35, pchange=0.52

TABLE: nse_etfs_daily
PURPOSE: ETF daily data
COLUMNS: date, symbol, open_price, high_price, low_price, close_price,
         pchange, volume, turnover, nav

TABLE: nse_price_band_hitters
PURPOSE: Stocks hitting upper/lower circuit breakers
COLUMNS: date, symbol, band_type [UPPER|LOWER], close_price, volume

TABLE: portfolio_history
PURPOSE: Historical daily snapshots of portfolio value by asset_class
COLUMNS: id, user_id, date, total_value, invested_amount, asset_class

TABLE: symbol_mappings
PURPOSE: Maps IndMoney company names → NSE tickers
COLUMNS: indmoney_name, nse_symbol, bse_symbol, isin, exchange, asset_class, sector

MARKET SCHEMA TABLES (prefix: market.):
─────────────────────────────────────────────────────────────
TABLE: market.market_data
PURPOSE: US/Global stock data (fundamentals + OHLCV).
COLUMNS: trade_date, symbol [US ticker e.g. AMD], company_name, type, sector,
         industry, market_cap, beta, p_open, p_high, p_low, p_close, volume,
         prev_close, p_50d_ma, p_200d_ma, v_14d_ma, v_50d_ma, options,
         f52w_high, f52w_h_date, f52w_low, f52w_l_date, shares_out,
         shares_float, short_ratio, short_percent_float, earnings_date
NOTE: Use this for US stocks. For IBKR holdings market data, cross-reference
      with ibkr_portfolio_holdings market_price column.

TABLE: market.earnings_calendar
COLUMNS: date, symbol, hour, quarter, year, eps_actual, eps_estimate,
         revenue_actual, revenue_estimate

TABLE: market.eps_estimates
COLUMNS: ticker, api_run_date, frequency, eps_avg, eps_high, eps_low,
         number_analysts, period, quarter, year

TABLE: market.revenue_estimates
COLUMNS: ticker, api_run_date, frequency, number_analysts, period, quarter,
         revenue_avg, revenue_high, revenue_low, year

MATERIALIZED VIEWS (public schema):
─────────────────────────────────────────────────────────────
mv_tech_indicators     — SMA 10/20/50/200, Bollinger Bands, Stochastic, ROC
mv_alpha_volume_breakouts — Stocks at 52W high + volume surge >300%
mv_alpha_smart_money   — Block deals where smart money bought, stock closed lower
mv_alpha_volatility_squeeze — Stocks with >5% move on 2x+ normal volume

CORRECT SQL PATTERNS:
─────────────────────────────────────────────────────────────
-- Get latest IBKR portfolio:
SELECT * FROM ibkr_portfolio_holdings
WHERE date = (SELECT MAX(date) FROM ibkr_portfolio_holdings);

-- Get India holdings with market value:
SELECT symbol, qty, cmp, qty*cmp as market_value,
       (cmp-avg_buy)*qty as unrealized_pnl, asset_class
FROM holdings WHERE qty > 0 ORDER BY qty*cmp DESC;

-- Get today's top volume anomalies:
SELECT symbol, volume, week1_avg_volume, week1_vol_change_pct
FROM nse_volume_anomalies
WHERE date = (SELECT MAX(date) FROM nse_volume_anomalies)
ORDER BY week1_vol_change_pct DESC LIMIT 20;

-- Get latest index values:
SELECT index_name, close_val, pchange, advances, declines
FROM nse_indices_daily
WHERE date = (SELECT MAX(date) FROM nse_indices_daily)
  AND index_name IN ('NIFTY 50', 'NIFTY MIDCAP 100', 'NIFTY SMLCAP 100');

-- Map India holding to NSE symbol:
SELECT h.symbol as full_name, sm.nse_symbol,
       h.qty, h.cmp, h.qty*h.cmp as value
FROM holdings h
LEFT JOIN symbol_mappings sm ON h.symbol = sm.indmoney_name
WHERE h.qty > 0 AND sm.nse_symbol IS NOT NULL;

-- Today's alpha signals:
SELECT * FROM mv_alpha_volume_breakouts
WHERE date = (SELECT MAX(date) FROM mv_alpha_volume_breakouts);
