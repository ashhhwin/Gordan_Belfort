CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  color CHAR(7) NOT NULL,
  initials CHAR(3) NOT NULL,
  webauthn_cred_id TEXT,
  pin_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add foreign key back to users after both tables exist
ALTER TABLE families 
  ADD CONSTRAINT fk_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
