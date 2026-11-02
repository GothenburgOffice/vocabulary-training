-- Recent successful AI actions, not provider payloads or audio. Retention is per account.
CREATE TABLE ai_activity (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  word text NOT NULL,
  language text NOT NULL,
  model text NOT NULL,
  voice text,
  tier text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_activity_user_created_idx ON ai_activity (user_id, created_at DESC);

-- Deliberately no FK to ai_activity: a report's snapshot outlives the one-hour log.
CREATE TABLE issue_reports (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL,
  reason text NOT NULL CHECK (
    reason IN ('pronunciation', 'language-accent', 'garbled-audio', 'incorrect-note', 'other')
  ),
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  word text NOT NULL,
  language text NOT NULL,
  model text NOT NULL,
  voice text,
  tier text NOT NULL,
  activity_created_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);
CREATE INDEX issue_reports_created_idx ON issue_reports (created_at DESC);
