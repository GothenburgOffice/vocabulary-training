-- What each account sends to the AI features, for the abuse limits (#82): the letters of each
-- call that reached a provider, kept 90 days. The limits themselves are site settings, seeded
-- here with their defaults so they can be read and changed in the database. A letter limit of 0
-- means no limit.
CREATE TABLE ai_usage (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  letters integer NOT NULL CHECK (letters > 0),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_idx ON ai_usage (user_id, kind, at);
CREATE INDEX ai_usage_at_idx ON ai_usage (at);

INSERT INTO site_settings(key, value) VALUES
  ('limits.speech.letters_per_minute', '1200'),
  ('limits.speech.letters_per_day.basic', '100000'),
  ('limits.speech.letters_per_day.plus', '300000'),
  ('limits.speech.cooldown_ms', '500'),
  ('limits.speech.request_block_seconds', '10'),
  ('limits.note.letters_per_minute', '3000'),
  ('limits.note.letters_per_day.basic', '100000'),
  ('limits.note.letters_per_day.plus', '300000'),
  ('limits.note.cooldown_ms', '3000')
ON CONFLICT (key) DO NOTHING;
