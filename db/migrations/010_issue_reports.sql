-- A learner's report about one recent AI result (#95). Anonymous by design: no account is
-- stored, so a report can't be linked back to anyone or shown to anyone after it is sent.
-- No audio, and no activity log in the database.
CREATE TABLE issue_reports (
  id uuid PRIMARY KEY,
  -- The browser's random id for the result, so the same result is kept once.
  activity_id text NOT NULL UNIQUE CHECK (char_length(activity_id) BETWEEN 1 AND 64),
  reason text NOT NULL CHECK (
    reason IN ('pronunciation', 'language-accent', 'garbled-audio', 'incorrect-note', 'other')
  ),
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  word text NOT NULL CHECK (char_length(word) BETWEEN 1 AND 500),
  language text NOT NULL CHECK (char_length(language) BETWEEN 1 AND 60),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  voice text CHECK (voice IS NULL OR char_length(voice) <= 60),
  -- Which tier's models answered; not who asked.
  tier text NOT NULL CHECK (tier IN ('basic', 'plus')),
  prompt jsonb NOT NULL,
  activity_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX issue_reports_created_idx ON issue_reports (created_at DESC);
