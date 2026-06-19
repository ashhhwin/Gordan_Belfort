CREATE SCHEMA IF NOT EXISTS market;

CREATE TABLE IF NOT EXISTS market.market_data (
    trade_date DATE,
    symbol VARCHAR(50),
    company_name TEXT,
    type VARCHAR(50),
    sector TEXT,
    industry TEXT,
    market_cap NUMERIC,
    beta NUMERIC,
    p_open NUMERIC,
    p_high NUMERIC,
    p_low NUMERIC,
    p_close NUMERIC,
    volume BIGINT,
    prev_close NUMERIC,
    p_50d_ma NUMERIC,
    p_200d_ma NUMERIC,
    v_14d_ma NUMERIC,
    v_50d_ma NUMERIC,
    options VARCHAR(10),
    f52w_high NUMERIC,
    f52w_h_date DATE,
    f52w_low NUMERIC,
    f52w_l_date DATE,
    close_open NUMERIC,
    open_close NUMERIC,
    high_close NUMERIC,
    low_close NUMERIC,
    close_close NUMERIC,
    shares_out NUMERIC,
    shares_float NUMERIC,
    short_ratio NUMERIC,
    short_percent_float NUMERIC,
    earnings_date DATE,
    shares_insiders NUMERIC,
    shares_institutions NUMERIC
);

CREATE TABLE IF NOT EXISTS market.revenue_estimates (
    ticker VARCHAR(50),
    api_run_date DATE,
    frequency VARCHAR(20),
    number_analysts INTEGER,
    period DATE,
    quarter INTEGER,
    revenue_avg NUMERIC,
    revenue_high NUMERIC,
    revenue_low NUMERIC,
    year INTEGER,
    UNIQUE (ticker, api_run_date, period, frequency)
);

CREATE TABLE IF NOT EXISTS market.eps_estimates (
    ticker VARCHAR(50),
    api_run_date DATE,
    frequency VARCHAR(20),
    eps_avg NUMERIC,
    eps_high NUMERIC,
    eps_low NUMERIC,
    number_analysts INTEGER,
    period DATE,
    quarter INTEGER,
    year INTEGER,
    UNIQUE (ticker, api_run_date, period, frequency)
);

CREATE TABLE IF NOT EXISTS market.earnings_calendar (
    date DATE,
    symbol VARCHAR(50),
    hour VARCHAR(20),
    quarter INTEGER,
    year INTEGER,
    eps_actual NUMERIC,
    eps_estimate NUMERIC,
    revenue_actual NUMERIC,
    revenue_estimate NUMERIC,
    UNIQUE (date, symbol)
);

CREATE TABLE IF NOT EXISTS market.processed_files (
    pipeline VARCHAR(50),
    file_name VARCHAR(255),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pipeline, file_name)
);
