CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL,
  message TEXT
);
