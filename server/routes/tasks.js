const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// ── Visibility helper (mirrors original canSeeUser logic) ──────────────────
async function getVisibleNames(user) {
  if (user.adminLevel === 'master') return null; // null = all
  if (user.adminLevel === 'sub') {
    const { rows } = await pool.query(
      `SELECT member FROM teams WHERE sub_admin = $1`, [user.name]
    );
    return [user.name, ...rows.map(r => r.member)];
  }
  return [user.name];
}

// ── GET /api/tasks  — today's tasks for the logged-in user ─────────────────
router.get('/', auth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tasks
       WHERE owner_name = $1 AND task_date = $2
       ORDER BY created_at DESC`,
      [req.user.name, date]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tasks/weekly  — 7-day view for the logged-in user ──────────────
router.get('/weekly', auth, async (req, res) => {
  const { from, to } = req.query; // ISO dates
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM tasks
       WHERE owner_name = $1 AND task_date BETWEEN $2 AND $3
       ORDER BY task_date, created_at`,
      [req.user.name, from, to]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tasks/admin  — admin view (today or date param) ───────────────
router.get('/admin', auth, async (req, res) => {
  const date   = req.query.date || new Date().toISOString().slice(0, 10);
  const status = req.query.status; // optional filter

  if (!req.user.adminLevel)
    return res.status(403).json({ error: 'Admin only' });

  try {
    const visible = await getVisibleNames(req.user);
    let query = `
      SELECT t.*, u.department, u.role
      FROM tasks t
      JOIN users u ON u.name = t.owner_name
      WHERE t.task_date = $1`;
    const params = [date];

    if (visible) {
      params.push(visible);
      query += ` AND t.owner_name = ANY($${params.length})`;
    }
    if (status && status !== 'All') {
      if (status === 'NeedsApproval') {
        query += ` AND (t.approval IS NULL OR t.approval = 'Pending')`;
      } else {
        params.push(status);
        query += ` AND t.status = $${params.length}`;
      }
    }
    query += ` ORDER BY u.department, t.owner_name, t.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tasks/admin/weekly  — admin weekly export ─────────────────────
router.get('/admin/weekly', auth, async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  if (!req.user.adminLevel) return res.status(403).json({ error: 'Admin only' });

  try {
    const visible = await getVisibleNames(req.user);
    let query = `
      SELECT t.*, u.department, u.role
      FROM tasks t
      JOIN users u ON u.name = t.owner_name
      WHERE t.task_date BETWEEN $1 AND $2`;
    const params = [from, to];

    if (visible) {
      params.push(visible);
      query += ` AND t.owner_name = ANY($${params.length})`;
    }
    query += ` ORDER BY t.task_date, u.department, t.owner_name, t.created_at`;

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tasks  — create task ─────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { title, description, category, subcat, priority, status, assignedTo } = req.body;
  if (!title || !category || !priority || !status)
    return res.status(400).json({ error: 'title, category, priority, status required' });

  const now  = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const date = now.toISOString().slice(0, 10);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert for owner
    const { rows } = await client.query(
      `INSERT INTO tasks
         (owner_name, title, description, category, subcat, priority, status,
          assigned_by, assigned_to, task_date, logged_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [req.user.name, title, description || null, category, subcat || null,
       priority, status, req.user.name, assignedTo || null, date, time]
    );
    const task = rows[0];

    // If assigned to someone else, also insert into their task list
    if (assignedTo && assignedTo !== req.user.name) {
      await client.query(
        `INSERT INTO tasks
           (owner_name, title, description, category, subcat, priority, status,
            assigned_by, assigned_to, task_date, logged_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [assignedTo, title, description || null, category, subcat || null,
         priority, status, req.user.name, assignedTo, date, time]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(task);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── PATCH /api/tasks/:id  — edit task (owner or admin) ─────────────────────
router.patch('/:id', auth, async (req, res) => {
  const { id } = req.params;
  const { title, description, category, subcat, priority, status } = req.body;

  try {
    // Verify access
    const { rows: existing } = await pool.query(
      `SELECT * FROM tasks WHERE id=$1`, [id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });

    const task = existing[0];
    const isOwner  = task.owner_name === req.user.name;
    const isAdmin  = !!req.user.adminLevel;
    if (!isOwner && !isAdmin)
      return res.status(403).json({ error: 'Forbidden' });

    const { rows } = await pool.query(
      `UPDATE tasks SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         category    = COALESCE($3, category),
         subcat      = COALESCE($4, subcat),
         priority    = COALESCE($5, priority),
         status      = COALESCE($6, status)
       WHERE id = $7 RETURNING *`,
      [title, description, category, subcat, priority, status, id]
    );
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/tasks/:id/toggle-done  — checkbox toggle ────────────────────
router.patch('/:id/toggle-done', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE tasks
       SET status = CASE WHEN status='Done' THEN 'Pending' ELSE 'Done' END
       WHERE id=$1 AND owner_name=$2 RETURNING *`,
      [req.params.id, req.user.name]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/tasks/:id/approval  — approve/reject (admin) ───────────────
router.patch('/:id/approval', auth, async (req, res) => {
  if (!req.user.adminLevel) return res.status(403).json({ error: 'Admin only' });
  const { decision } = req.body; // 'Approved' | 'Rejected'
  if (!['Approved', 'Rejected'].includes(decision))
    return res.status(400).json({ error: 'decision must be Approved or Rejected' });

  try {
    const { rows } = await pool.query(
      `UPDATE tasks SET approval=$1 WHERE id=$2 RETURNING *`,
      [decision, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/tasks/:id  — delete (owner or admin) ──────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const { rows: existing } = await pool.query(
      `SELECT owner_name FROM tasks WHERE id=$1`, [req.params.id]
    );
    if (!existing.length) return res.status(404).json({ error: 'Not found' });

    const isOwner = existing[0].owner_name === req.user.name;
    const isAdmin = !!req.user.adminLevel;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'Forbidden' });

    await pool.query(`DELETE FROM tasks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
