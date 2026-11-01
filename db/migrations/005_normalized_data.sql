-- Normalized user data (issue #1). There is no real user data yet, so the JSONB workspaces
-- are dropped without conversion; accounts keep their sign-in and start with no lists.
CREATE EXTENSION IF NOT EXISTS vector;

-- The match key for finding the same word or answer again: NFC, the standalone apostrophe
-- marks ` ´ ‘ ’ as ', whitespace trimmed and collapsed, lowercase, and the Greek final sigma
-- folded. Accents on letters stay (pêche, péché). It agrees with normalize() in
-- lib/learning.ts, which grades answers; keep the two in step. Keys are only compared with
-- other keys made here, and never replace the stored text.
CREATE FUNCTION vocabulary_key(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE RETURNS NULL ON NULL INPUT
RETURN translate(
  lower(btrim(regexp_replace(
    translate(normalize(t, NFC), E'\u0060\u00B4\u2018\u2019', repeat('''', 4)),
    '\s+', ' ', 'g'))),
  'ς', 'σ');

-- The profile: which native (base) and learning language the dashboard shows.
ALTER TABLE users
  ADD COLUMN native_language text NOT NULL DEFAULT 'Swedish'
    CHECK (length(native_language) BETWEEN 1 AND 60),
  ADD COLUMN learning_language text NOT NULL DEFAULT 'French'
    CHECK (length(learning_language) BETWEEN 1 AND 60),
  ADD CONSTRAINT users_languages_differ CHECK (native_language <> learning_language);

DROP TABLE IF EXISTS workspaces;

-- Every user table carries user_id and the language pair, and indexes lead with
-- user -> native -> learning. The copies on words, accepted_answers and word_reviews follow
-- the list through
-- composite foreign keys with ON UPDATE CASCADE, so they can't drift from it.
CREATE TABLE lists (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  native_language text NOT NULL CHECK (length(native_language) BETWEEN 1 AND 60),
  learning_language text NOT NULL CHECK (length(learning_language) BETWEEN 1 AND 60),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 1000),
  -- Prepared for public lists (#55); everything is private for now.
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'public')),
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (native_language <> learning_language),
  UNIQUE (id, user_id, native_language, learning_language)
);
CREATE INDEX lists_user_pair_idx ON lists (user_id, native_language, learning_language);

CREATE TABLE words (
  id uuid PRIMARY KEY,
  list_id uuid NOT NULL,
  user_id uuid NOT NULL,
  native_language text NOT NULL,
  learning_language text NOT NULL,
  -- The prompt in the native language. Its answers are in accepted_answers.
  native_text text NOT NULL CHECK (length(native_text) BETWEEN 1 AND 200),
  native_key text GENERATED ALWAYS AS (vocabulary_key(native_text)) STORED,
  -- A copy of the list's visibility (#55).
  is_public boolean NOT NULL DEFAULT false,
  position integer NOT NULL,
  FOREIGN KEY (list_id, user_id, native_language, learning_language)
    REFERENCES lists (id, user_id, native_language, learning_language)
    ON UPDATE CASCADE ON DELETE CASCADE,
  UNIQUE (id, user_id, native_language, learning_language)
);
CREATE INDEX words_list_idx ON words (list_id, position);
CREATE INDEX words_user_key_idx ON words (user_id, native_language, learning_language, native_key);

-- The answers accepted in the learning language. Position 0 is the primary answer: the one
-- shown, and the prompt when practising in reverse (which accepts only native_text). Every
-- word has one, written with the word in the same transaction.
CREATE TABLE accepted_answers (
  word_id uuid NOT NULL,
  position integer NOT NULL CHECK (position >= 0),
  user_id uuid NOT NULL,
  native_language text NOT NULL,
  learning_language text NOT NULL,
  learning_text text NOT NULL CHECK (length(learning_text) BETWEEN 1 AND 200),
  learning_key text GENERATED ALWAYS AS (vocabulary_key(learning_text)) STORED,
  -- A copy of the word's visibility (#55), so public searches use a small partial index.
  is_public boolean NOT NULL DEFAULT false,
  PRIMARY KEY (word_id, position),
  UNIQUE (word_id, learning_key),
  FOREIGN KEY (word_id, user_id, native_language, learning_language)
    REFERENCES words (id, user_id, native_language, learning_language)
    ON UPDATE CASCADE ON DELETE CASCADE
);
-- The same learning word across a user's lists, the later join to global terms (#56), and
-- public search (#55).
CREATE INDEX accepted_answers_user_key_idx
  ON accepted_answers (user_id, native_language, learning_language, learning_key);
CREATE INDEX accepted_answers_key_idx ON accepted_answers (learning_language, learning_key);
CREATE INDEX accepted_answers_public_key_idx
  ON accepted_answers (learning_language, learning_key) WHERE is_public;

-- The current review state per word and prompt ('native': the native side was shown and the
-- learning side typed; 'learning': the other way). A word without a row has never been
-- answered in that direction.
CREATE TABLE word_reviews (
  word_id uuid NOT NULL,
  prompt text NOT NULL CHECK (prompt IN ('native', 'learning')),
  user_id uuid NOT NULL,
  native_language text NOT NULL,
  learning_language text NOT NULL,
  correct integer NOT NULL DEFAULT 0 CHECK (correct >= 0),
  wrong integer NOT NULL DEFAULT 0 CHECK (wrong >= 0),
  streak integer NOT NULL DEFAULT 0 CHECK (streak >= 0),
  due_at timestamptz NOT NULL DEFAULT 'epoch',
  PRIMARY KEY (word_id, prompt),
  FOREIGN KEY (word_id, user_id, native_language, learning_language)
    REFERENCES words (id, user_id, native_language, learning_language)
    ON UPDATE CASCADE ON DELETE CASCADE
);
CREATE INDEX word_reviews_due_idx ON word_reviews (user_id, native_language, learning_language, due_at);

-- Completed practice sessions. Their pair and word text are history: they keep what was
-- practised even after the list or word changes or is deleted.
CREATE TABLE runs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  native_language text NOT NULL,
  learning_language text NOT NULL,
  list_id uuid REFERENCES lists(id) ON DELETE SET NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  mode text NOT NULL DEFAULT '' CHECK (length(mode) <= 40),
  completed_at timestamptz NOT NULL
);
CREATE INDEX runs_user_pair_idx ON runs (user_id, native_language, learning_language, completed_at DESC);

CREATE TABLE run_results (
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  position integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  native_language text NOT NULL,
  learning_language text NOT NULL,
  word_id uuid REFERENCES words(id) ON DELETE SET NULL,
  list_id uuid REFERENCES lists(id) ON DELETE SET NULL,
  prompt text NOT NULL CHECK (prompt IN ('native', 'learning')),
  -- The word as practised: its native text and primary answer.
  native_text text NOT NULL,
  learning_text text NOT NULL,
  learning_key text GENERATED ALWAYS AS (vocabulary_key(learning_text)) STORED,
  answer text NOT NULL CHECK (length(answer) <= 500),
  correct boolean NOT NULL,
  answered_at timestamptz NOT NULL,
  PRIMARY KEY (run_id, position)
);
-- A word's past answers in its own list, and the same word across all lists.
CREATE INDEX run_results_word_idx ON run_results (word_id, prompt, answered_at DESC);
CREATE INDEX run_results_key_idx
  ON run_results (user_id, native_language, learning_language, learning_key, answered_at DESC);
