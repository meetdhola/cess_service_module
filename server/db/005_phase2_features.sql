-- -- ═══════════════════════════════════════════════════════════
-- -- Phase 1 pre-flight: inspect real schema before migration 005
-- -- ═══════════════════════════════════════════════════════════

-- \echo '--- A: work_sessions columns ---'
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name='work_sessions' ORDER BY ordinal_position;

-- \echo ''
-- \echo '--- B: existing constraints/indexes on work_sessions (looking for any one-running-per-worker rule) ---'
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename='work_sessions';
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='work_sessions'::regclass;

-- \echo ''
-- \echo '--- C: service_tickets status values currently in use ---'
-- SELECT DISTINCT status FROM service_tickets ORDER BY status;

-- \echo ''
-- \echo '--- D: service_tickets service_type values + warranty_status values ---'
-- SELECT DISTINCT service_type FROM service_tickets ORDER BY service_type;
-- SELECT DISTINCT warranty_status FROM service_tickets ORDER BY warranty_status;

-- \echo ''
-- \echo '--- E: does a status CHECK constraint exist on service_tickets? ---'
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid='service_tickets'::regclass AND contype='c';

-- \echo ''
-- \echo '--- F: confirm ticket_worker_billing columns (migration 004 applied?) ---'
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_name='ticket_worker_billing' ORDER BY ordinal_position;

-- \echo ''
-- \echo '--- G: gen_random_uuid availability (pgcrypto) ---'
-- SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','uuid-ossp');



-- ════════════════════════════════════════════════════════════════════
-- Migration 005 — Phase 2 Features
-- Cess Engineering Service Module
--
-- Adds:
--   1. scheduled_tasks        (ticket-linked, 3-day reminder)
--   2. ticket_challans        (multi-challan, one-to-many)
--   3. ticket_notes           (collaborative comment thread)
--   4. ticket_worker_billing  → expense + completion-report + charge-author columns
--   5. work_sessions          → partial unique index: one RUNNING session per (worker,ticket)
--   6. service_tickets        → reopen audit columns (reuses 'In Progress' status, no enum change)
--
-- Safe to re-run: every statement uses IF NOT EXISTS / guarded DO blocks.
-- All wrapped in one transaction — fully applies or rolls back.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- Ensure gen_random_uuid() is available (pgcrypto). Harmless if already present.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────────────
-- 1. SCHEDULED TASKS  (admin/superadmin create; linked to a ticket; 3-day reminder)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  notes        TEXT,
  due_date     DATE NOT NULL,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_process','completed')),
  created_by   UUID REFERENCES service_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sched_ticket  ON scheduled_tasks(ticket_id);
CREATE INDEX IF NOT EXISTS idx_sched_due     ON scheduled_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_sched_status  ON scheduled_tasks(status);

-- ────────────────────────────────────────────────────────────────────
-- 2. TICKET CHALLANS  (multiple challans per ticket; editable by worker/admin/superadmin)
--    Invoice stays single on service_tickets.invoice_no — unchanged.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_challans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  challan_no   TEXT NOT NULL,
  note         TEXT,
  added_by     UUID REFERENCES service_users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_challan_ticket ON ticket_challans(ticket_id);

-- ────────────────────────────────────────────────────────────────────
-- 3. TICKET NOTES  (collaborative thread; anyone working the ticket can add)
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_notes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  author_id    UUID REFERENCES service_users(id) ON DELETE SET NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notes_ticket  ON ticket_notes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notes_created ON ticket_notes(created_at);

-- ────────────────────────────────────────────────────────────────────
-- 4. PER-WORKER BILLING  → add expense + completion report + charge author
--    (expense entered by worker; charge entered by admin/superadmin)
--    profit = charge − irc_cost − expense
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE ticket_worker_billing
  ADD COLUMN IF NOT EXISTS expense_amount         NUMERIC(12,2) NOT NULL DEFAULT 0
                             CHECK (expense_amount >= 0),
  ADD COLUMN IF NOT EXISTS expense_note           TEXT,
  ADD COLUMN IF NOT EXISTS completion_report_path TEXT,
  ADD COLUMN IF NOT EXISTS completed_by_worker_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS charge_entered_by      UUID REFERENCES service_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS charge_entered_at      TIMESTAMPTZ;

-- charged_amount was NOT NULL in migration 004. Now a worker can complete
-- their side (expense + report) BEFORE admin enters the charge, so the row
-- may exist with no charge yet. Drop the NOT NULL so partial rows are valid.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='ticket_worker_billing'
      AND column_name='charged_amount'
      AND is_nullable='NO'
  ) THEN
    ALTER TABLE ticket_worker_billing ALTER COLUMN charged_amount DROP NOT NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 5. CONCURRENT TIMERS
--    Rule: a worker may have many RUNNING sessions across different tickets,
--    but only ONE running session per (worker_id, ticket_id).
--    No existing constraint to drop (confirmed via inspection) — just add the
--    partial unique index. 'paused' counts as running for this rule so a worker
--    can't open two live timers on the same ticket.
-- ────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_session_per_worker_ticket
  ON work_sessions (worker_id, ticket_id)
  WHERE status IN ('running','paused');

-- ────────────────────────────────────────────────────────────────────
-- 6. REOPEN AUDIT  (admin reopens Closed/Completed → reactivates SAME ticket)
--    We reuse the existing 'In Progress' status (no enum change needed),
--    and track the reopen history with these columns.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS reopen_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by    UUID REFERENCES service_users(id) ON DELETE SET NULL;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- POST-MIGRATION VERIFICATION (run manually after applying):
--   \d scheduled_tasks
--   \d ticket_challans
--   \d ticket_notes
--   \d ticket_worker_billing
--   SELECT indexdef FROM pg_indexes WHERE indexname='uniq_active_session_per_worker_ticket';
-- ════════════════════════════════════════════════════════════════════