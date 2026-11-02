ALTER TABLE users ADD COLUMN last_sign_in_at timestamptz;

UPDATE users
SET last_sign_in_at = (
  SELECT max(created_at) FROM sessions WHERE sessions.user_id = users.id
);
