-- Null means the sign-in was before this column existed; it is not backfilled from sessions.
ALTER TABLE users ADD COLUMN last_sign_in_at timestamptz;
