ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_tier text NOT NULL DEFAULT 'basic'
  CHECK (ai_tier IN ('basic', 'plus'));
