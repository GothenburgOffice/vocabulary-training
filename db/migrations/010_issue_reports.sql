-- A learner's report about one recent AI result (#95). Anonymous by design: no account is
-- stored, and nothing that could be matched back to one. Dates are kept, not times, because a
-- time could be joined with ai_usage (user id and time) to find the account. No audio, no
-- model output, and no activity log in the database.
CREATE TABLE issue_reports (
  id uuid PRIMARY KEY,
  -- SHA-256 of the browser's id for the result, so the same result is kept once. Hashed
  -- because the browser's id starts with the time of the call.
  activity_hash text NOT NULL UNIQUE CHECK (char_length(activity_hash) = 64),
  reason text NOT NULL CHECK (
    reason IN ('pronunciation', 'language-accent', 'garbled-audio', 'incorrect-note', 'other')
  ),
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  -- Up to the longest text read aloud at once (MAX_SPEECH_TEXT).
  word text NOT NULL CHECK (char_length(word) BETWEEN 1 AND 1000),
  language text NOT NULL CHECK (char_length(language) BETWEEN 1 AND 60),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 200),
  voice text CHECK (voice IS NULL OR char_length(voice) <= 60),
  -- Which tier's models answered; not who asked.
  tier text NOT NULL CHECK (tier IN ('basic', 'plus')),
  prompt jsonb NOT NULL,
  activity_on date NOT NULL,
  reported_on date NOT NULL DEFAULT current_date
);
-- Reports are only ever read newest first, a page at a time.
CREATE INDEX issue_reports_recent_idx ON issue_reports (reported_on DESC, id DESC);
