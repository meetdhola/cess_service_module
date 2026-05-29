BEGIN;

-- Add IRC (Internal Rate Card) daily rate on workers
ALTER TABLE service_users
  ADD COLUMN IF NOT EXISTS irc_daily_rate NUMERIC(10,2) DEFAULT 0;

-- Seed some realistic defaults based on role
UPDATE service_users SET irc_daily_rate = 1300 WHERE role='wireman' AND (irc_daily_rate IS NULL OR irc_daily_rate=0);
UPDATE service_users SET irc_daily_rate = 3000 WHERE role='plc'     AND (irc_daily_rate IS NULL OR irc_daily_rate=0);

COMMIT;