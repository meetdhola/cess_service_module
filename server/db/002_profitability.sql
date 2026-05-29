-- ============================================================
-- Migration 002 — Pricing tiers + Worker salary + Customer grade
-- ============================================================
BEGIN;

-- 1) Worker salary on service_users
ALTER TABLE service_users
  ADD COLUMN IF NOT EXISTS monthly_salary    NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS working_days      INT           DEFAULT 26,  -- per month
  ADD COLUMN IF NOT EXISTS daily_hours       INT           DEFAULT 9,
  ADD COLUMN IF NOT EXISTS seniority         VARCHAR(20) CHECK (seniority IN ('senior','junior','specialist')) DEFAULT 'junior';

-- 2) Customer grade on tickets (A / B / C)
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS customer_grade    VARCHAR(2) CHECK (customer_grade IN ('A','B','C')) DEFAULT 'B',
  ADD COLUMN IF NOT EXISTS billing_location  VARCHAR(20) CHECK (billing_location IN ('within_ahmedabad','within_gujarat','outside_gujarat','remote','india','international')) DEFAULT 'within_ahmedabad',
  ADD COLUMN IF NOT EXISTS billing_mode      VARCHAR(20) CHECK (billing_mode IN ('full_day','half_day','grade_rate'))  DEFAULT 'grade_rate',
  ADD COLUMN IF NOT EXISTS override_rate     NUMERIC(10,2);  -- if admin manually sets a custom rate

-- 3) Master pricing table — populated from the image
CREATE TABLE IF NOT EXISTS service_pricing (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service_type    VARCHAR(20) NOT NULL CHECK (service_type IN ('wireman','programmer','specialist')),
  seniority       VARCHAR(20) NOT NULL CHECK (seniority IN ('senior','junior','specialist','any')),
  location        VARCHAR(30) NOT NULL,
  per_day_rate    NUMERIC(10,2),
  half_day_rate   NUMERIC(10,2),
  grade_a_rate    NUMERIC(10,2),
  grade_b_rate    NUMERIC(10,2),
  grade_c_rate    NUMERIC(10,2),
  notes           TEXT,
  active          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (service_type, seniority, location)
);

-- 4) Seed pricing from the image
INSERT INTO service_pricing (service_type, seniority, location, per_day_rate, half_day_rate, grade_a_rate, grade_b_rate, grade_c_rate, notes) VALUES
  ('wireman',    'any',        'within_ahmedabad', 2000,  1200, 1500, 2000, 2500, 'Wireman within Ahmedabad'),
  ('wireman',    'any',        'within_gujarat',   2500,  1500, 2500, 3000, 3000, 'Wireman within Gujarat'),
  ('wireman',    'any',        'outside_gujarat',  3500,  2100, 2500, 3000, 3500, 'Wireman outside Gujarat'),
  ('programmer', 'senior',     'within_ahmedabad', 4500,  2700, 2500, 3500, 5000, 'Senior programmer Ahmedabad'),
  ('programmer', 'junior',     'within_ahmedabad', 3000,  1800, 2500, 3500, 5000, 'Junior programmer Ahmedabad'),
  ('programmer', 'senior',     'within_gujarat',   6000,  3600, 3500, 4500, 6000, 'Senior programmer Gujarat'),
  ('programmer', 'junior',     'within_gujarat',   4000,  2400, 3500, 4500, 6000, 'Junior programmer Gujarat'),
  ('programmer', 'senior',     'outside_gujarat',  7500,  4500, 5000, 6000, 8000, 'Senior programmer outside Gujarat'),
  ('programmer', 'junior',     'outside_gujarat',  4500,  2700, 5000, 6000, 8000, 'Junior programmer outside Gujarat'),
  ('programmer', 'any',        'remote',           3000,  3000, 2000, 2500, 2500, 'Online / remote support'),
  ('specialist', 'specialist', 'india',           10000,  NULL, NULL, NULL, 10000, 'Ravi — anywhere in India'),
  ('specialist', 'specialist', 'international',   15000,  NULL, NULL, NULL, 15000, 'Ravi — outside India')
ON CONFLICT (service_type, seniority, location) DO NOTHING;

-- 5) Backfill existing users
UPDATE service_users SET seniority='junior' WHERE seniority IS NULL AND role IN ('plc','wireman');
UPDATE service_users SET monthly_salary=26000, working_days=26, daily_hours=8 WHERE monthly_salary IS NULL OR monthly_salary=0;

COMMIT;