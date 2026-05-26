const router = require('express').Router();
const pool   = require('../db/pool');
const auth   = require('../middleware/auth');

// GET /api/users  — all users for assign dropdown (auth required)
router.get('/', auth, async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, department, role, admin_level FROM users ORDER BY name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/users/teams  — all sub-admin → member mappings (master admin)
router.get('/teams', auth, async (req, res) => {
  if (req.user.adminLevel !== 'master')
    return res.status(403).json({ error: 'Master admin only' });
  try {
    const { rows } = await pool.query(
      `SELECT sub_admin, member FROM teams ORDER BY sub_admin, member`
    );
    // Group by sub_admin
    const map = {};
    rows.forEach(r => {
      if (!map[r.sub_admin]) map[r.sub_admin] = [];
      map[r.sub_admin].push(r.member);
    });
    res.json(map);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/users/teams  — add member to sub-admin team (master admin)
router.post('/teams', auth, async (req, res) => {
  if (req.user.adminLevel !== 'master')
    return res.status(403).json({ error: 'Master admin only' });
  const { subAdmin, member } = req.body;
  try {
    await pool.query(
      `INSERT INTO teams (sub_admin, member) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [subAdmin, member]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/users/teams  — remove member from team (master admin)
router.delete('/teams', auth, async (req, res) => {
  if (req.user.adminLevel !== 'master')
    return res.status(403).json({ error: 'Master admin only' });
  const { subAdmin, member } = req.body;
  try {
    await pool.query(
      `DELETE FROM teams WHERE sub_admin=$1 AND member=$2`, [subAdmin, member]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/users/:name/promote  — promote/demote (master admin)
router.patch('/:name/promote', auth, async (req, res) => {
  if (req.user.adminLevel !== 'master')
    return res.status(403).json({ error: 'Master admin only' });
  const { adminLevel } = req.body; // 'sub' | null
  try {
    const { rows } = await pool.query(
      `UPDATE users SET admin_level=$1 WHERE name=$2 RETURNING id,name,admin_level`,
      [adminLevel || null, req.params.name]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
