-- A learner's report about one recent AI result (#95). Only what the learner sends is stored:
-- no audio, and no activity log in the database. Deleted with the account.
CREATE TABLE issue_reports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The learner's browser-side id for the result; one report per result per account.
  activity_id text NOT NULL CHECK (char_length(activity_id) BETWEEN 1 AND 64),
  reason text NOT NULL CHECK (
    reason IN ('pronunciation', 'language-accent', 'garbled-audio', 'incorrect-note', 'other')
  ),
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  word text NOT NULL CHECK (char_length(word) BETWEEN 1 AND 500),
  language text NOT NULL CHECK (char_length(language) BETWEEN 1 AND 60),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  voice text CHECK (voice IS NULL OR char_length(voice) <= 60),
  tier text NOT NULL CHECK (tier IN ('basic', 'plus')),
  prompt jsonb NOT NULL,
  activity_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);
CREATE INDEX issue_reports_created_idx ON issue_reports (created_at DESC);
