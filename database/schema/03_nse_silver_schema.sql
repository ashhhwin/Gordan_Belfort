-- 03_nse_silver_schema.sql
-- Comprehensive Silver Layer for all 11 NSE Endpoints

CREATE TABLE IF NOT EXISTS nse_stocks_daily (
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    close_price NUMERIC(18,4),
    pchange NUMERIC(18,4),
    previous_close NUMERIC(18,4),
    volume NUMERIC(24,4),
    turnover NUMERIC(24,4),
    market_cap NUMERIC(24,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, symbol)
);

CREATE TABLE IF NOT EXISTS nse_volume_anomalies (
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    volume NUMERIC(24,4),
    week1_avg_volume NUMERIC(24,4),
    week1_vol_change_pct NUMERIC(18,4),
    week2_avg_volume NUMERIC(24,4),
    week2_vol_change_pct NUMERIC(18,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, symbol)
);

CREATE TABLE IF NOT EXISTS nse_52w_extremes (
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    extreme_type VARCHAR(10) NOT NULL,
    new_52w_val NUMERIC(18,4),
    prev_52w_val NUMERIC(18,4),
    prev_hl_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, symbol, extreme_type)
);

CREATE TABLE IF NOT EXISTS nse_large_deals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    deal_type VARCHAR(20) NOT NULL,
    client_name TEXT,
    buy_sell VARCHAR(10),
    quantity NUMERIC(24,4),
    price NUMERIC(18,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nse_indices_daily (
    date DATE NOT NULL,
    index_name VARCHAR(100) NOT NULL,
    open_val NUMERIC(18,4),
    high_val NUMERIC(18,4),
    low_val NUMERIC(18,4),
    close_val NUMERIC(18,4),
    pchange NUMERIC(18,4),
    advances INT,
    declines INT,
    pe NUMERIC(18,4),
    pb NUMERIC(18,4),
    dy NUMERIC(18,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, index_name)
);

CREATE TABLE IF NOT EXISTS nse_etfs_daily (
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    open_price NUMERIC(18,4),
    high_price NUMERIC(18,4),
    low_price NUMERIC(18,4),
    close_price NUMERIC(18,4),
    pchange NUMERIC(18,4),
    volume NUMERIC(24,4),
    turnover NUMERIC(24,4),
    nav NUMERIC(18,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, symbol)
);

CREATE TABLE IF NOT EXISTS nse_price_band_hitters (
    date DATE NOT NULL,
    symbol VARCHAR(100) NOT NULL,
    band_type VARCHAR(20), -- 'UPPER' or 'LOWER'
    close_price NUMERIC(18,4),
    volume NUMERIC(24,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, symbol)
);

CREATE TABLE IF NOT EXISTS nse_advances_declines (
    date DATE NOT NULL,
    index_name VARCHAR(100) NOT NULL,
    advances INT,
    declines INT,
    unchanged INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (date, index_name)
);

-- Indexing for performance
CREATE INDEX IF NOT EXISTS idx_nse_stocks_symbol ON nse_stocks_daily(symbol);
CREATE INDEX IF NOT EXISTS idx_nse_vol_symbol ON nse_volume_anomalies(symbol);
CREATE INDEX IF NOT EXISTS idx_nse_52w_symbol ON nse_52w_extremes(symbol);
CREATE INDEX IF NOT EXISTS idx_nse_deals_symbol ON nse_large_deals(symbol);
CREATE INDEX IF NOT EXISTS idx_nse_deals_date ON nse_large_deals(date);
CREATE INDEX IF NOT EXISTS idx_nse_indices_name ON nse_indices_daily(index_name);
CREATE INDEX IF NOT EXISTS idx_nse_etfs_symbol ON nse_etfs_daily(symbol);
