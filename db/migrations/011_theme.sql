-- The account's Appearance setting (#106): follow the device, or always light or dark.
ALTER TABLE users ADD COLUMN theme text NOT NULL DEFAULT 'system'
  CHECK (theme IN ('system', 'light', 'dark'));
