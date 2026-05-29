-- ════════════════════════════════════════════════════════════════════
-- Migration 010 — Two-step closure workflow
-- Cess Engineering Service Module
--
-- Changes:
--   1. Backfill: all existing 'Completed' tickets become 'Closed'.
--   2. Status CHECK constraint updated to include 'Report Submitted'.
--      'Completed' stays permitted as a transitional value but should
--      no longer be set by new flows (backend writes 'Report Submitted'
--      instead). Keeping it permitted avoids breaking the constraint if
--      any external script writes the old value.
--   3. New columns on service_tickets:
--        created_by  UUID FK service_users  (the admin who created the ticket)
--        closed_at   TIMESTAMPTZ
--        closed_by   UUID FK service_users
--   4. Backfill created_by = '11649902-02b1-40db-bb1a-759f8589874a' (Divy
--      Shah, superadmin) for ALL existing rows where created_by IS NULL.
--      Future tickets must set created_by explicitly via the inquiry POST.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) Backfill Completed → Closed ─────────────────────────────────
UPDATE service_tickets SET status = 'Closed' WHERE status = 'Completed';

-- ─── 2) Replace the status CHECK constraint ─────────────────────────
ALTER TABLE service_tickets DROP CONSTRAINT IF EXISTS service_tickets_status_check;
ALTER TABLE service_tickets ADD CONSTRAINT service_tickets_status_check
  CHECK (status IN (
    'Open',
    'Assigned',
    'In Progress',
    'Report Submitted',   -- new: worker has submitted; awaiting admin closure
    'Completed',          -- legacy / safety; no new code writes this
    'Closed'
  ));

-- ─── 3) Add closure-tracking and creator columns ────────────────────
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES service_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by  UUID REFERENCES service_users(id) ON DELETE SET NULL;

-- ─── 4) Backfill created_by to Divy Shah for existing rows ──────────
-- This makes legacy tickets actionable by an admin (per user choice).
-- For new tickets the inquiry/POST route should set created_by to the
-- authenticated creator's id.
UPDATE service_tickets
   SET created_by = '11649902-02b1-40db-bb1a-759f8589874a'::uuid
 WHERE created_by IS NULL;

-- ─── Useful index for "tickets I created" queries ───────────────────
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON service_tickets (created_by);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY:
--   \d service_tickets
--   SELECT status, COUNT(*) FROM service_tickets GROUP BY status ORDER BY status;
--   SELECT COUNT(*) FILTER (WHERE created_by IS NULL) AS still_null,
--          COUNT(*) FILTER (WHERE created_by IS NOT NULL) AS has_creator
--     FROM service_tickets;
-- ════════════════════════════════════════════════════════════════════