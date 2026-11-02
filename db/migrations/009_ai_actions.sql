CREATE TABLE ai_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('speech', 'note')),
  model text NOT NULL,
  word_id uuid NOT NULL,
  word text NOT NULL,
  prompt jsonb NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_actions_user_at_idx ON ai_actions (user_id, at DESC);
CREATE INDEX ai_actions_at_idx ON ai_actions (at);
