-- Google sign-in (#152). An account signs in with a password or with Google, never both: a
-- Google sign-in removes the password. google_sub is Google's stable account ID; nothing
-- else from Google (name, photo, tokens) is stored.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN google_sub text UNIQUE;
ALTER TABLE users ADD CONSTRAINT users_sign_in_method
  CHECK (password_hash IS NOT NULL OR google_sub IS NOT NULL);
