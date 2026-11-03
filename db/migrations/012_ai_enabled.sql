-- The account's AI features switch (#113): off means no request of the account's goes to an AI
-- provider. On by default, as before.
ALTER TABLE users ADD COLUMN ai_enabled boolean NOT NULL DEFAULT true;
