CREATE TABLE IF NOT EXISTS ibkr_portfolio_holdings (
    date DATE NOT NULL,
    account VARCHAR(50) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    sec_type VARCHAR(20),
    exchange VARCHAR(20),
    currency VARCHAR(10),
    position NUMERIC(15, 4),
    market_price NUMERIC(15, 4),
    market_value NUMERIC(15, 4),
    average_cost NUMERIC(15, 4),
    unrealized_pnl NUMERIC(15, 4),
    realized_pnl NUMERIC(15, 4),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, account, symbol)
);

-- Index to quickly query a specific stock's performance over time
CREATE INDEX IF NOT EXISTS idx_ibkr_portfolio_holdings_symbol ON ibkr_portfolio_holdings(symbol);
-- Index to quickly query a specific day's overall portfolio value
CREATE INDEX IF NOT EXISTS idx_ibkr_portfolio_holdings_date ON ibkr_portfolio_holdings(date);
