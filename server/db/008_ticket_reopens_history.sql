-- ════════════════════════════════════════════════════════════════════
-- Migration 008 — ticket_reopens history table
-- Cess Engineering Service Module
--
-- One row per reopen event. service_tickets keeps reopen_count + the
-- latest reopened_at/by; this table preserves the full audit trail
-- (who reopened, when, with what reason, from what previous status).
-- Idempotent + transactional.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS ticket_reopens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    UUID NOT NULL REFERENCES service_tickets(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,
  prev_status  VARCHAR(20) NOT NULL,    -- 'Completed' or 'Closed'
  reopened_by  UUID REFERENCES service_users(id) ON DELETE SET NULL,
  reopened_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reopens_ticket ON ticket_reopens(ticket_id, reopened_at DESC);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY:
--   \d ticket_reopens
-- ════════════════════════════════════════════════════════════════════