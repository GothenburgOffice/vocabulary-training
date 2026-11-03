-- Null means the sign-in was before this column existed; it is not backfilled from sessions.
ALTER TABLE users ADD COLUMN last_sign_in_at timestamptz;

-- Admin account controls (#84). A locked account can't sign in. An account in the trash is
-- locked too, and is deleted with all its data 30 days after deleted_at.
ALTER TABLE users ADD COLUMN locked_at timestamptz, ADD COLUMN deleted_at timestamptz;
CREATE INDEX users_deleted_at_idx ON users (deleted_at) WHERE deleted_at IS NOT NULL;
