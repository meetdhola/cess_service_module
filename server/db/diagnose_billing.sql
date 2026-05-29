-- ═══════════════════════════════════════════════════════
-- DIAGNOSTIC: Why is SE0006 billing not showing in reports?
-- ═══════════════════════════════════════════════════════

\echo '--- Q1: work_sessions on SE0006 (who ran a timer?) ---'
SELECT su.name, ws.total_seconds, ws.status
FROM work_sessions ws
JOIN service_users su   ON su.id = ws.worker_id
JOIN service_tickets t  ON t.id  = ws.ticket_id
WHERE t.ticket_id = 'SE0006';

\echo ''
\echo '--- Q2: billing entries on SE0006 (who got billed?) ---'
SELECT su.name, twb.charged_amount, twb.edited_by IS NOT NULL AS was_admin_edited
FROM ticket_worker_billing twb
JOIN service_users su  ON su.id = twb.worker_id
JOIN service_tickets t ON t.id  = twb.ticket_id
WHERE t.ticket_id = 'SE0006';

\echo ''
\echo '--- Q3: THE MISMATCH — billed workers with NO session ---'
SELECT su.name AS billed_worker_with_no_session
FROM ticket_worker_billing twb
JOIN service_users su  ON su.id = twb.worker_id
JOIN service_tickets t ON t.id  = twb.ticket_id
WHERE t.ticket_id = 'SE0006'
  AND NOT EXISTS (
    SELECT 1 FROM work_sessions ws
    WHERE ws.ticket_id = t.id
      AND ws.worker_id = twb.worker_id
      AND ws.total_seconds > 0
  );

\echo ''
\echo '--- Q4: pricing rows (is rate card even configured?) ---'
SELECT service_type, location, seniority, per_day_rate, half_day_rate
FROM service_pricing WHERE active=TRUE
ORDER BY service_type, location, seniority;