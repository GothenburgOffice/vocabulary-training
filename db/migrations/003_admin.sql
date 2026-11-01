-- Admins see the admin area. Set directly in the database, or once from ADMIN_EMAIL.
ALTER TABLE users ADD COLUMN is_admin boolean NOT NULL DEFAULT false;
