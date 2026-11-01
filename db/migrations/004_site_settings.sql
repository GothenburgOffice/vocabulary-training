-- Site-wide settings edited in the admin area. API keys are stored encrypted by the app.
CREATE TABLE site_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Languages offered in the pickers. Lists store the name as text, so rows are hidden, never
-- deleted or renamed. "Other" is built into the app and never stored here.
CREATE TABLE languages (
  name text PRIMARY KEY CHECK (length(name) BETWEEN 1 AND 60 AND name <> 'Other'),
  code text UNIQUE CHECK (code ~ '^[a-z]{2,3}(-[a-z0-9]{2,8})?$'),
  position integer NOT NULL,
  hidden boolean NOT NULL DEFAULT false,
  -- Speech for basic accounts. A blank model means no speech for this language.
  speech_model text NOT NULL DEFAULT '',
  speech_voice text NOT NULL DEFAULT '',
  speech_instructions text NOT NULL DEFAULT '',
  -- Speech for plus accounts. A blank model means plus accounts use the three basic settings.
  plus_speech_model text NOT NULL DEFAULT '',
  plus_speech_voice text NOT NULL DEFAULT '',
  plus_speech_instructions text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO languages(name, code, position) VALUES
  ('Swedish', 'sv', 1),
  ('French', 'fr', 2),
  ('English', 'en', 3),
  ('Spanish', 'es', 4),
  ('German', 'de', 5),
  ('Italian', 'it', 6),
  ('Japanese', 'ja', 7);
