CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  config JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
