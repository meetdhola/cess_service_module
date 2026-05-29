-- ════════════════════════════════════════════════════════════════════
-- Migration 011 (FIXED) — Re-attribute ticket ownership from assignment
-- history. Uses ticket_assignments.assigned_at (not created_at, which
-- doesn't exist on that table).
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1) For each ticket WITH assignment history, set created_by to
--        the earliest assigner. ────────────────────────────────────
WITH first_assigner AS (
  SELECT DISTINCT ON (ticket_id)
         ticket_id,
         assigned_by
    FROM ticket_assignments
   WHERE assigned_by IS NOT NULL
   ORDER BY ticket_id, assigned_at ASC NULLS LAST
)
UPDATE service_tickets st
   SET created_by = fa.assigned_by
  FROM first_assigner fa
 WHERE st.id = fa.ticket_id
   AND fa.assigned_by IS NOT NULL;

-- ─── 2) For tickets WITHOUT any assignment history, clear the bogus
--        Divy-backfill attribution. They'll show up as "no owner yet"
--        and only superadmins can act on them, which is correct. ────
UPDATE service_tickets
   SET created_by = NULL
 WHERE id NOT IN (SELECT DISTINCT ticket_id FROM ticket_assignments)
   AND created_by = '11649902-02b1-40db-bb1a-759f8589874a'::uuid;

COMMIT;

-- ════════════════════════════════════════════════════════════════════
-- VERIFY:
--   SELECT
--     t.ticket_id,
--     t.status,
--     COALESCE(su.name, '—') AS owner,
--     (SELECT COUNT(*) FROM ticket_assignments ta WHERE ta.ticket_id=t.id) AS n_assignments
--   FROM service_tickets t
--   LEFT JOIN service_users su ON su.id = t.created_by
--   ORDER BY t.created_at DESC;
-- ════════════════════════════════════════════════════════════════════