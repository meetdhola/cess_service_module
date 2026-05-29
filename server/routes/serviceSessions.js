const router  = require('express').Router();
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

// ── POST /api/service/sessions/start ─────────────────────────────────────
router.post('/start', svcAuth(['plc','wireman']), async (req, res) => {
  const { ticket_id } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
  const workerId = req.svcUser.id;
  try {
    const { rows: active } = await pool.query(
      `SELECT id FROM work_sessions WHERE ticket_id=$1 AND worker_id=$2 AND status IN ('running','paused')`,
      [ticket_id, workerId]
    );
    if (active.length) return res.status(409).json({ error: 'Session already active.' });
    const { rows } = await pool.query(
      `INSERT INTO work_sessions (ticket_id, worker_id, started_at, status) VALUES ($1,$2,NOW(),'running') RETURNING *`,
      [ticket_id, workerId]
    );
    await pool.query(`UPDATE service_tickets SET status='In Progress', updated_at=NOW() WHERE id=$1`, [ticket_id]);
    // Emit real-time event
    req.io?.to('admins').emit('session:started', {
      session: rows[0], worker: { id: req.svcUser.id, name: req.svcUser.name, role: req.svcUser.role }, ticket_id
    });
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/service/sessions/:id/pause ─────────────────────────────────
// router.post('/:id/pause', svcAuth(['plc','wireman']), async (req, res) => {
//   const { reason } = req.body;
//   if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });
//   const client = await pool.connect();
//   try {
//     await client.query('BEGIN');
//     const { rows: sess } = await client.query(`SELECT * FROM work_sessions WHERE id=$1 AND worker_id=$2`, [req.params.id, req.svcUser.id]);
//     if (!sess.length) return res.status(404).json({ error: 'Not found' });
//     if (sess[0].status !== 'running') return res.status(400).json({ error: 'Not running' });
//     const elapsed = Math.floor((Date.now() - new Date(sess[0].started_at).getTime()) / 1000);
//     await client.query(`UPDATE work_sessions SET status='paused', total_seconds=total_seconds+$1 WHERE id=$2`, [elapsed, req.params.id]);
//     const { rows: pause } = await client.query(`INSERT INTO session_pauses (session_id,paused_at,reason) VALUES ($1,NOW(),$2) RETURNING *`, [req.params.id, reason.trim()]);
//     await client.query('COMMIT');
//     req.io?.to('admins').emit('session:paused', { sessionId: req.params.id, reason: reason.trim(), worker: req.svcUser.name });
//     res.json({ session: { ...sess[0], status:'paused', total_seconds: sess[0].total_seconds+elapsed }, pause: pause[0] });
//   } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
//   finally { client.release(); }
// });

router.post('/:id/pause', svcAuth(['plc','wireman']), async (req, res) => {
  const { reason, reason_category } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Reason required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sess } = await client.query(`SELECT * FROM work_sessions WHERE id=$1 AND worker_id=$2`, [req.params.id, req.svcUser.id]);
    if (!sess.length) return res.status(404).json({ error: 'Not found' });
    if (sess[0].status !== 'running') return res.status(400).json({ error: 'Not running' });
    const elapsed = Math.floor((Date.now() - new Date(sess[0].started_at).getTime()) / 1000);
    await client.query(`UPDATE work_sessions SET status='paused', total_seconds=total_seconds+$1 WHERE id=$2`, [elapsed, req.params.id]);
    const { rows: pause } = await client.query(
      `INSERT INTO session_pauses (session_id, paused_at, reason, reason_category) VALUES ($1, NOW(), $2, $3) RETURNING *`,
      [req.params.id, reason.trim(), reason_category || 'other']
    );
    await client.query('COMMIT');
    req.io?.to('admins').emit('session:paused', {
      sessionId: req.params.id, reason: reason.trim(), reason_category: reason_category||'other',
      worker: req.svcUser.name, ticket_id: sess[0].ticket_id
    });
    res.json({ session: { ...sess[0], status:'paused', total_seconds: sess[0].total_seconds+elapsed }, pause: pause[0] });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── POST /api/service/sessions/:id/resume ────────────────────────────────
router.post('/:id/resume', svcAuth(['plc','wireman']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sess } = await client.query(`SELECT * FROM work_sessions WHERE id=$1 AND worker_id=$2`, [req.params.id, req.svcUser.id]);
    if (!sess.length) return res.status(404).json({ error: 'Not found' });
    if (sess[0].status !== 'paused') return res.status(400).json({ error: 'Not paused' });
    await client.query(`UPDATE session_pauses SET resumed_at=NOW() WHERE session_id=$1 AND resumed_at IS NULL`, [req.params.id]);
    const { rows } = await client.query(`UPDATE work_sessions SET status='running', started_at=NOW() WHERE id=$1 RETURNING *`, [req.params.id]);
    await client.query('COMMIT');
    req.io?.to('admins').emit('session:resumed', { sessionId: req.params.id, worker: req.svcUser.name });
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── POST /api/service/sessions/:id/stop ──────────────────────────────────
router.post('/:id/stop', svcAuth(['plc','wireman']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: sess } = await client.query(`SELECT * FROM work_sessions WHERE id=$1 AND worker_id=$2`, [req.params.id, req.svcUser.id]);
    if (!sess.length) return res.status(404).json({ error: 'Not found' });
    let elapsed = 0;
    if (sess[0].status === 'running') elapsed = Math.floor((Date.now() - new Date(sess[0].started_at).getTime()) / 1000);
    const { rows } = await client.query(`UPDATE work_sessions SET status='completed', ended_at=NOW(), total_seconds=total_seconds+$1 WHERE id=$2 RETURNING *`, [elapsed, req.params.id]);
    await client.query('COMMIT');
    req.io?.to('admins').emit('session:completed', {
      sessionId: req.params.id, worker: req.svcUser.name,
      totalSeconds: rows[0].total_seconds, ticket_id: sess[0].ticket_id
    });
    res.json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

// ── GET /api/service/sessions/my ─────────────────────────────────────────
router.get('/my', svcAuth(['plc','wireman']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ws.*, st.ticket_id AS ticket_no, st.customer_name, st.service_type,
         COALESCE(json_agg(json_build_object('paused_at',sp.paused_at,'resumed_at',sp.resumed_at,'reason',sp.reason) ORDER BY sp.paused_at) FILTER (WHERE sp.id IS NOT NULL),'[]') AS pauses
       FROM work_sessions ws
       JOIN service_tickets st ON st.id=ws.ticket_id
       LEFT JOIN session_pauses sp ON sp.session_id=ws.id
       WHERE ws.worker_id=$1
       GROUP BY ws.id, st.ticket_id, st.customer_name, st.service_type
       ORDER BY ws.created_at DESC`,
      [req.svcUser.id]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/service/sessions/active ─────────────────────────────────────
// Returns ALL of this worker's running + paused sessions (concurrent timers).
router.get('/active', svcAuth(['plc','wireman']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ws.*, st.ticket_id AS ticket_no, st.customer_name, st.service_type, st.id AS svc_ticket_id
       FROM work_sessions ws JOIN service_tickets st ON st.id=ws.ticket_id
       WHERE ws.worker_id=$1 AND ws.status IN ('running','paused')
       ORDER BY ws.created_at DESC`,
      [req.svcUser.id]
    );
    res.json(rows);   // ← array now, not a single object
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// router.get('/active', svcAuth(['plc','wireman']), async (req, res) => {
//   try {
//     const { rows } = await pool.query(
//       `SELECT ws.*, st.ticket_id AS ticket_no, st.customer_name, st.service_type, st.id AS svc_ticket_id
//        FROM work_sessions ws JOIN service_tickets st ON st.id=ws.ticket_id
//        WHERE ws.worker_id=$1 AND ws.status IN ('running','paused')
//        ORDER BY ws.created_at DESC LIMIT 1`,
//       [req.svcUser.id]
//     );
//     res.json(rows[0] || null);
//   } catch (e) { res.status(500).json({ error: e.message }); }
// });

// ── GET /api/service/sessions/all ────────────────────────────────────────
router.get('/all', svcAuth(['superadmin','admin']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ws.*, su.name AS worker_name, su.role AS worker_role,
         st.ticket_id AS ticket_no, st.customer_name, st.service_type
       FROM work_sessions ws
       JOIN service_users su ON su.id=ws.worker_id
       JOIN service_tickets st ON st.id=ws.ticket_id
       ORDER BY ws.created_at DESC LIMIT 500`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
