const router  = require('express').Router();
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

// ── GET /api/service/reports/weekly ──────────────────────────────────────
// Returns 7-day totals per day: { date, total_seconds, session_count }
router.get('/weekly', svcAuth(['superadmin','admin']), async (req, res) => {
  const days = parseInt(req.query.days) || 7;
  try {
    const { rows } = await pool.query(
      `SELECT
         date_trunc('day', ws.started_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
         SUM(ws.total_seconds)::int AS total_seconds,
         COUNT(*)::int AS session_count,
         COUNT(DISTINCT ws.worker_id)::int AS active_workers
       FROM work_sessions ws
       WHERE ws.started_at >= NOW() - INTERVAL '${days} days'
       GROUP BY day ORDER BY day ASC`
    );
    // Fill missing days with zeros
    const map = {};
    rows.forEach(r => { map[r.day] = r; });
    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      result.push(map[key] || { day: key, total_seconds: 0, session_count: 0, active_workers: 0 });
    }
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/service/reports/daily ───────────────────────────────────────
// Hourly breakdown for a specific date
router.get('/daily', svcAuth(['superadmin','admin']), async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `SELECT
         EXTRACT(HOUR FROM ws.started_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
         SUM(ws.total_seconds)::int AS total_seconds,
         COUNT(*)::int AS session_count,
         COUNT(DISTINCT ws.worker_id)::int AS active_workers
       FROM work_sessions ws
       WHERE (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date = $1::date
       GROUP BY hour ORDER BY hour ASC`,
      [date]
    );
    // Fill all 24 hours
    const map = {};
    rows.forEach(r => { map[r.hour] = r; });
    const result = Array.from({ length: 24 }, (_, h) =>
      map[h] || { hour: h, total_seconds: 0, session_count: 0, active_workers: 0 }
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/service/reports/person-wise ─────────────────────────────────
// Per worker: total_seconds, session_count, ticket_count, avg_session, pauses
router.get('/person-wise', svcAuth(['superadmin','admin']), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    const { rows } = await pool.query(
      `SELECT
         su.id AS worker_id, su.name AS worker_name, su.role AS worker_role,
         COUNT(DISTINCT ws.id)::int          AS session_count,
         COUNT(DISTINCT ws.ticket_id)::int   AS ticket_count,
         SUM(ws.total_seconds)::int          AS total_seconds,
         AVG(ws.total_seconds)::int          AS avg_session_seconds,
         COUNT(sp.id)::int                   AS total_pauses,
         MIN(ws.started_at AT TIME ZONE 'Asia/Kolkata') AS earliest_start,
         MAX(ws.ended_at   AT TIME ZONE 'Asia/Kolkata') AS latest_end
       FROM service_users su
       LEFT JOIN work_sessions ws ON ws.worker_id=su.id
         AND (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       LEFT JOIN session_pauses sp ON sp.session_id=ws.id
       WHERE su.role IN ('plc','wireman') AND su.is_active=TRUE
       GROUP BY su.id, su.name, su.role
       ORDER BY total_seconds DESC NULLS LAST`,
      [fromDate, toDate]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/service/reports/person-detail/:workerId ─────────────────────
// Day-wise sessions for one worker
router.get('/person-detail/:workerId', svcAuth(['superadmin','admin']), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    const { rows } = await pool.query(
      `SELECT
         (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
         SUM(ws.total_seconds)::int  AS total_seconds,
         COUNT(ws.id)::int           AS sessions,
         COUNT(DISTINCT ws.ticket_id)::int AS tickets,
         EXTRACT(HOUR FROM MIN(ws.started_at AT TIME ZONE 'Asia/Kolkata'))::int AS first_hour,
         EXTRACT(HOUR FROM MAX(COALESCE(ws.ended_at, NOW()) AT TIME ZONE 'Asia/Kolkata'))::int AS last_hour
       FROM work_sessions ws
       WHERE ws.worker_id=$1
         AND (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3
       GROUP BY day ORDER BY day ASC`,
      [req.params.workerId, fromDate, toDate]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/reports/pause-analytics ─── */
router.get('/pause-analytics', svcAuth(['superadmin','admin']), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    // Group by category
    const { rows: byCategory } = await pool.query(
      `SELECT
         COALESCE(sp.reason_category,'other') AS category,
         COUNT(*)::int AS count,
         COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(sp.resumed_at, NOW()) - sp.paused_at))),0)::int AS total_seconds
       FROM session_pauses sp
       JOIN work_sessions ws ON ws.id=sp.session_id
       WHERE (sp.paused_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       GROUP BY category
       ORDER BY count DESC`, [fromDate, toDate]);

    // Detailed list: who, where (ticket / customer / site), when, reason
    const { rows: detail } = await pool.query(
      `SELECT
         sp.id, sp.paused_at, sp.resumed_at, sp.reason, sp.reason_category,
         EXTRACT(EPOCH FROM (COALESCE(sp.resumed_at, NOW()) - sp.paused_at))::int AS duration_seconds,
         ws.worker_id, su.name AS worker_name, su.role AS worker_role,
         t.id AS ticket_id, t.ticket_id AS ticket_no, t.customer_name, t.address
       FROM session_pauses sp
       JOIN work_sessions ws  ON ws.id=sp.session_id
       JOIN service_users su  ON su.id=ws.worker_id
       JOIN service_tickets t ON t.id=ws.ticket_id
       WHERE (sp.paused_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       ORDER BY sp.paused_at DESC
       LIMIT 200`, [fromDate, toDate]);

    // Material-shortage hot-spots: by customer/site
    const { rows: hotspots } = await pool.query(
      `SELECT t.customer_name, t.address, COUNT(*)::int AS material_pauses
       FROM session_pauses sp
       JOIN work_sessions ws  ON ws.id=sp.session_id
       JOIN service_tickets t ON t.id=ws.ticket_id
       WHERE sp.reason_category='material_shortage'
         AND (sp.paused_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       GROUP BY t.customer_name, t.address
       ORDER BY material_pauses DESC LIMIT 10`, [fromDate, toDate]);

    // Hourly distribution of material-shortage pauses
    const { rows: hourly } = await pool.query(
      `SELECT EXTRACT(HOUR FROM sp.paused_at AT TIME ZONE 'Asia/Kolkata')::int AS hour,
              COUNT(*)::int AS count
       FROM session_pauses sp
       WHERE sp.reason_category='material_shortage'
         AND (sp.paused_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $1 AND $2
       GROUP BY hour ORDER BY hour`, [fromDate, toDate]);

    res.json({ byCategory, detail, hotspots, hourly });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
