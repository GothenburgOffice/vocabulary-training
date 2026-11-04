-- When the account last went over the write limit (lib/write-limits.ts), for Admin → Users:
-- a sign of a script, never of a person.
ALTER TABLE users ADD COLUMN write_limited_at timestamptz;
