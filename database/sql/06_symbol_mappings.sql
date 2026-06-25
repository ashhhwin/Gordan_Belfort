-- 06_symbol_mappings.sql
-- Maps IndMoney/CAMS company names → NSE tickers for AI agent SQL joins

CREATE TABLE IF NOT EXISTS symbol_mappings (
    id              SERIAL PRIMARY KEY,
    indmoney_name   TEXT NOT NULL,
    nse_symbol      VARCHAR(50),
    bse_symbol      VARCHAR(50),
    isin            VARCHAR(12),
    exchange        VARCHAR(10) DEFAULT 'NSE',
    asset_class     VARCHAR(30),          -- IND_EQUITY | MF | ETF | BOND
    sector          VARCHAR(100),
    match_method    VARCHAR(20) DEFAULT 'manual',  -- 'manual' | 'fuzzy' | 'isin'
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW(),
    UNIQUE(indmoney_name)
);

CREATE INDEX IF NOT EXISTS idx_symbol_mappings_nse ON symbol_mappings(nse_symbol);
CREATE INDEX IF NOT EXISTS idx_symbol_mappings_isin ON symbol_mappings(isin);

-- Trigger to keep updated_at fresh
CREATE OR REPLACE FUNCTION update_symbol_mappings_ts()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_symbol_mappings_updated_at ON symbol_mappings;
CREATE TRIGGER trg_symbol_mappings_updated_at
    BEFORE UPDATE ON symbol_mappings
    FOR EACH ROW EXECUTE FUNCTION update_symbol_mappings_ts();

-- Seed: common holdings with known NSE symbols
-- This covers the most common names in IndMoney portfolios
-- The seed_symbol_mappings.py script will auto-add the rest via fuzzy matching

INSERT INTO symbol_mappings (indmoney_name, nse_symbol, isin, asset_class, sector) VALUES
-- Large Cap Equities
('Reliance Industries Ltd',             'RELIANCE',     'INE002A01018', 'IND_EQUITY', 'Energy'),
('Tata Consultancy Services Ltd',       'TCS',          'INE467B01029', 'IND_EQUITY', 'IT'),
('HDFC Bank Ltd',                       'HDFCBANK',     'INE040A01034', 'IND_EQUITY', 'Banking'),
('ICICI Bank Ltd',                      'ICICIBANK',    'INE090A01021', 'IND_EQUITY', 'Banking'),
('Infosys Ltd',                         'INFY',         'INE009A01021', 'IND_EQUITY', 'IT'),
('Bharti Airtel Ltd',                   'BHARTIARTL',   'INE397D01024', 'IND_EQUITY', 'Telecom'),
('State Bank of India',                 'SBIN',         'INE062A01020', 'IND_EQUITY', 'Banking'),
('Wipro Ltd',                           'WIPRO',        'INE075A01022', 'IND_EQUITY', 'IT'),
('ITC Ltd',                             'ITC',          'INE154A01025', 'IND_EQUITY', 'FMCG'),
('Hindustan Unilever Ltd',              'HINDUNILVR',   'INE030A01027', 'IND_EQUITY', 'FMCG'),
('Larsen & Toubro Ltd',                 'LT',           'INE018A01030', 'IND_EQUITY', 'Infrastructure'),
('Nestle India Ltd',                    'NESTLEIND',    'INE239A01024', 'IND_EQUITY', 'FMCG'),
('Tata Motors Ltd',                     'TATAMOTORS',   'INE155A01022', 'IND_EQUITY', 'Auto'),
('Bajaj Finance Ltd',                   'BAJFINANCE',   'INE296A01024', 'IND_EQUITY', 'NBFC'),
('HCL Technologies Ltd',                'HCLTECH',      'INE860A01027', 'IND_EQUITY', 'IT'),
('Maruti Suzuki India Ltd',             'MARUTI',       'INE585B01010', 'IND_EQUITY', 'Auto'),
('Asian Paints Ltd',                    'ASIANPAINT',   'INE021A01026', 'IND_EQUITY', 'Chemicals'),
('Axis Bank Ltd',                       'AXISBANK',     'INE238A01034', 'IND_EQUITY', 'Banking'),
('UltraTech Cement Ltd',                'ULTRACEMCO',   'INE481G01011', 'IND_EQUITY', 'Cement'),
('Kotak Mahindra Bank Ltd',             'KOTAKBANK',    'INE237A01028', 'IND_EQUITY', 'Banking'),
-- Mid Cap
('Adani Green Energy Ltd',              'ADANIGREEN',   'INE364U01010', 'IND_EQUITY', 'Renewables'),
('Adani Ports and Special Economic Zone Ltd', 'ADANIPORTS', 'INE742F01042', 'IND_EQUITY', 'Infrastructure'),
('Coforge Ltd',                         'COFORGE',      'INE591G01017', 'IND_EQUITY', 'IT'),
('Persistent Systems Ltd',              'PERSISTENT',   'INE262H01021', 'IND_EQUITY', 'IT'),
('L&T Technology Services Ltd',         'LTTS',         'INE010V01017', 'IND_EQUITY', 'IT'),
('Trent Ltd',                           'TRENT',        'INE849A01020', 'IND_EQUITY', 'Retail'),
('Mphasis Ltd',                         'MPHASIS',      'INE356A01018', 'IND_EQUITY', 'IT'),
('Godrej Properties Ltd',               'GODREJPROP',   'INE484J01027', 'IND_EQUITY', 'Real Estate'),
('SRF Ltd',                             'SRF',          'INE647A01010', 'IND_EQUITY', 'Chemicals'),
('Torrent Pharmaceuticals Ltd',         'TORNTPHARM',   'INE685A01028', 'IND_EQUITY', 'Pharma'),
('Voltas Ltd',                          'VOLTAS',       'INE226A01021', 'IND_EQUITY', 'Consumer'),
('Crompton Greaves Consumer Electricals Ltd', 'CROMPTON', 'INE299U01018', 'IND_EQUITY', 'Consumer'),
('Marico Ltd',                          'MARICO',       'INE196A01026', 'IND_EQUITY', 'FMCG'),
('Pidilite Industries Ltd',             'PIDILITIND',   'INE318A01026', 'IND_EQUITY', 'Chemicals'),
('Havells India Ltd',                   'HAVELLS',      'INE176B01034', 'IND_EQUITY', 'Consumer'),
-- ETFs
('Nippon India ETF Nifty 50 BeES',      'NIFTYBEES',    'INF204KB13I2', 'ETF', 'Index'),
('HDFC Gold ETF',                       'HDFCGOLD',     'INF179KA1TN2', 'ETF', 'Gold'),
('SBI Gold ETF',                        'SGOLD',        NULL,           'ETF', 'Gold'),
('Mirae Asset NYSE FANG+ ETF',          'MAFANG',       NULL,           'ETF', 'Global')
ON CONFLICT (indmoney_name) DO NOTHING;
