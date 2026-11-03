-- FSRS scheduling (#2): each word and direction keeps FSRS's memory state, and due_at is
-- FSRS's next review. Every answer, in every practice mode, updates it.
ALTER TABLE word_reviews
  ADD COLUMN stability double precision NOT NULL DEFAULT 0 CHECK (stability >= 0),
  ADD COLUMN difficulty double precision NOT NULL DEFAULT 0 CHECK (difficulty >= 0),
  ADD COLUMN state text NOT NULL DEFAULT 'new'
    CHECK (state IN ('new', 'learning', 'review', 'relearning')),
  ADD COLUMN learning_steps integer NOT NULL DEFAULT 0 CHECK (learning_steps >= 0),
  ADD COLUMN lapses integer NOT NULL DEFAULT 0 CHECK (lapses >= 0),
  ADD COLUMN scheduled_days integer NOT NULL DEFAULT 0 CHECK (scheduled_days >= 0),
  ADD COLUMN last_review_at timestamptz;

-- Words answered before this: in day-long review, with the interval the old doubling
-- schedule gave them (1, 2, 4, ... at most 30 days) as their stability, a middling
-- difficulty, and their last review that interval before the due date they have.
UPDATE word_reviews
   SET state = 'review',
       stability = LEAST(30, 2 ^ GREATEST(streak - 1, 0)),
       difficulty = 5,
       scheduled_days = LEAST(30, 2 ^ GREATEST(streak - 1, 0))::integer,
       last_review_at = due_at - make_interval(days => LEAST(30, 2 ^ GREATEST(streak - 1, 0))::integer)
 WHERE correct + wrong > 0;
