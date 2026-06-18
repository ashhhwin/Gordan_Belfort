CREATE TABLE IF NOT EXISTS nse_daily_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  endpoint_name VARCHAR(255) NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (date, endpoint_name)
);

CREATE INDEX IF NOT EXISTS idx_nse_daily_data_date ON nse_daily_data(date);
CREATE INDEX IF NOT EXISTS idx_nse_daily_data_endpoint ON nse_daily_data(endpoint_name);
