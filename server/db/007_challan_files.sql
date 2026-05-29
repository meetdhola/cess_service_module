-- ════════════════════════════════════════════════════════════════════
-- Migration 007 — Challan = number + file
-- Cess Engineering Service Module
--
-- A challan is one record holding BOTH a challan number AND an attached
-- file (image/PDF). ticket_challans already has challan_no + note; this
-- adds the file linkage. Idempotent + transactional.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE ticket_challans
  ADD COLUMN IF NOT EXISTS file_url   TEXT,
  ADD COLUMN IF NOT EXISTS file_name  TEXT,
  ADD COLUMN IF NOT EXISTS file_size  BIGINT,
  ADD COLUMN IF NOT EXISTS added_role VARCHAR(20);

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY:
--   \d ticket_challans   → expect file_url, file_name, file_size, added_role
-- ════════════════════════════════════════════════════════════════════