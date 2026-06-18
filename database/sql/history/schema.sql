CREATE TABLE IF NOT EXISTS portfolio_history (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  asset_class VARCHAR(50) NOT NULL,
  total_value NUMERIC(18,4) NOT NULL DEFAULT 0,
  invested_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date, asset_class)
);
