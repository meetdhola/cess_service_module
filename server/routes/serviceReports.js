const router  = require('express').Router();
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');
const svcPerm = require('../middleware/servicePermission');

// ── GET /api/service/reports/weekly ──────────────────────────────────────
// Returns 7-day totals per day: { date, total_seconds, session_count }
router.get('/weekly', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
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
router.get('/daily', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
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
router.get('/person-wise', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    const { rows: allWorkers } = await pool.query(
      `SELECT su.id AS uid, su.name AS worker_name, su.role AS worker_role
       FROM service_users su
       WHERE su.role IN ('plc','wireman') AND su.is_active=TRUE`
    );
    const { rows: allSessions } = await pool.query(
      `SELECT ws.id, ws.worker_id, ws.total_seconds, ws.daily_seconds, ws.started_at
       FROM work_sessions ws
       WHERE ws.status='completed'`
    );
    // Build worker map using daily_seconds for accurate date filtering
    const workerMap = {};
    for (const w of allWorkers) {
      workerMap[w.uid] = { worker_id:w.uid, worker_name:w.worker_name, worker_role:w.worker_role, session_count:0, total_seconds:0 };
    }
    for (const s of allSessions) {
      if (!workerMap[s.worker_id]) continue;
      const daily = s.daily_seconds || {};
      let sessionSecsInRange = 0;
      if (Object.keys(daily).length > 0) {
        for (const [date, secs] of Object.entries(daily)) {
          if (date >= fromDate && date <= toDate) sessionSecsInRange += secs;
        }
      } else {
        const d = (s.started_at||'').slice(0,10);
        if (d >= fromDate && d <= toDate) sessionSecsInRange = s.total_seconds || 0;
      }
      if (sessionSecsInRange > 0) {
        workerMap[s.worker_id].session_count += 1;
        workerMap[s.worker_id].total_seconds += sessionSecsInRange;
      }
    }
    const rows = Object.values(workerMap).sort((a,b) => (b.total_seconds||0)-(a.total_seconds||0));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/service/reports/person-detail/:workerId ─────────────────────
// Day-wise sessions for one worker
router.get('/person-detail/:workerId', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    // Use daily_seconds for accurate day-wise breakdown
    const { rows: sessions } = await pool.query(
      `SELECT id, daily_seconds, total_seconds, started_at, ended_at
       FROM work_sessions
       WHERE worker_id=$1 AND status='completed'`,
      [req.params.workerId]
    );
    // Aggregate by date using daily_seconds
    const dayMap = {};
    for (const s of sessions) {
      const daily = s.daily_seconds || {};
      if (Object.keys(daily).length > 0) {
        for (const [date, secs] of Object.entries(daily)) {
          if (date >= fromDate && date <= toDate) {
            if (!dayMap[date]) dayMap[date] = { day: date, total_seconds: 0, sessions: 0 };
            dayMap[date].total_seconds += secs;
            dayMap[date].sessions += 1;
          }
        }
      } else {
        // Fallback for old sessions
        const d = (s.started_at||'').slice(0,10);
        if (d >= fromDate && d <= toDate) {
          if (!dayMap[d]) dayMap[d] = { day: d, total_seconds: 0, sessions: 0 };
          dayMap[d].total_seconds += s.total_seconds || 0;
          dayMap[d].sessions += 1;
        }
      }
    }
    const rows = Object.values(dayMap).sort((a,b) => a.day.localeCompare(b.day));
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// ── GET /api/service/reports/person-tickets/:workerId ────────────────────
// Ticket-wise breakdown for one worker
router.get('/person-tickets/:workerId', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
  const { from, to } = req.query;
  const fromDate = from || new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  const toDate   = to   || new Date().toISOString().slice(0,10);
  try {
    const { rows } = await pool.query(
      `SELECT
         t.ticket_id AS ticket_no,
         t.customer_name,
         t.job_no,
         COUNT(DISTINCT ws.id)::int          AS sessions,
         SUM(ws.total_seconds)::int          AS total_seconds,
         MIN(ws.started_at AT TIME ZONE 'Asia/Kolkata') AS first_session
       FROM work_sessions ws
       JOIN service_tickets t ON t.id = ws.ticket_id
       WHERE ws.worker_id = $1
         AND (ws.started_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN $2 AND $3
         AND ws.total_seconds > 0
       GROUP BY t.id, t.ticket_id, t.customer_name, t.job_no
       ORDER BY first_session DESC`,
      [req.params.workerId, fromDate, toDate]
    );
    res.json(rows.map(r => ({
      ...r,
      hours: +((r.total_seconds || 0) / 3600).toFixed(2),
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
/* ─── GET /api/service/reports/pause-analytics ─── */
router.get('/pause-analytics', svcAuth(['superadmin','admin']), svcPerm('view_reports'), async (req, res) => {
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
