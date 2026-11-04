-- Answer timing (#2), collected before it may ever grade: per account and input type, only
-- running averages of the hesitation score (lib/timing.ts), never single answers' times.
CREATE TABLE answer_timing (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input text NOT NULL CHECK (input IN ('keyboard', 'touch')),
  samples integer NOT NULL DEFAULT 0 CHECK (samples >= 0),
  mean double precision NOT NULL DEFAULT 0,
  variance double precision NOT NULL DEFAULT 0 CHECK (variance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, input)
);

-- How many scored answers fell in each quarter step of the score, site-wide, so admin can
-- see what share a Hard threshold would mark. No account is stored.
CREATE TABLE answer_timing_buckets (
  input text NOT NULL CHECK (input IN ('keyboard', 'touch')),
  bucket smallint NOT NULL CHECK (bucket BETWEEN -8 AND 20),
  answers bigint NOT NULL DEFAULT 0 CHECK (answers >= 0),
  PRIMARY KEY (input, bucket)
);
