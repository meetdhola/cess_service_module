-- ════════════════════════════════════════════════════════════════════
-- Migration 006 — Make warranty_status nullable (installation has no warranty)
-- Cess Engineering Service Module
--
-- Installation tickets have no warranty concept. Rather than forcing a
-- misleading 'out_of_warranty', we allow warranty_status = NULL.
--
-- Postgres note: a CHECK of the form  col IN ('a','b')  already PASSES on
-- NULL (NULL comparison → UNKNOWN → treated as not-violated). So the only
-- thing that can block NULL is a NOT NULL column constraint. We drop that
-- if present. Idempotent + transactional.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Drop NOT NULL on warranty_status if it's currently set.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'service_tickets'
      AND column_name = 'warranty_status'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE service_tickets ALTER COLUMN warranty_status DROP NOT NULL;
  END IF;
END $$;

-- Belt-and-suspenders: make sure the CHECK explicitly permits NULL.
-- (Recreate it as IN-list OR NULL so intent is unambiguous.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'service_tickets_warranty_status_check'
  ) THEN
    ALTER TABLE service_tickets DROP CONSTRAINT service_tickets_warranty_status_check;
  END IF;
END $$;

ALTER TABLE service_tickets
  ADD CONSTRAINT service_tickets_warranty_status_check
  CHECK (warranty_status IS NULL
         OR warranty_status IN ('in_warranty','out_of_warranty'));

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY (run manually):
--   SELECT column_name, is_nullable FROM information_schema.columns
--     WHERE table_name='service_tickets' AND column_name='warranty_status';
--   -- expect is_nullable = YES
-- ════════════════════════════════════════════════════════════════════