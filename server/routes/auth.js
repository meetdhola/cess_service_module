const router  = require('express').Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/pool');

const SECRET = process.env.JWT_SECRET || 'cess_secret_2526';

// GET /api/auth/users  — list all user names+dept for login dropdown
router.get('/users', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT name, department, role, admin_level
       FROM users ORDER BY name`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { name, password } = req.body;
  if (!name || !password)
    return res.status(400).json({ error: 'Name and password required' });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM users WHERE name = $1`, [name]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'User not found' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    const token = jwt.sign(
      { id: user.id, name: user.name, dept: user.department,
        role: user.role, adminLevel: user.admin_level },
      SECRET,
      { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, name: user.name,
      department: user.department, role: user.role,
      adminLevel: user.admin_level } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/auth/register  — self-registration (new staff)
router.post('/register', async (req, res) => {
  const { name, department, role, password } = req.body;
  if (!name || !department || !role || !password)
    return res.status(400).json({ error: 'All fields required' });

  try {
    const exist = await pool.query(`SELECT id FROM users WHERE LOWER(name)=LOWER($1)`, [name]);
    if (exist.rows.length) return res.status(409).json({ error: 'Name already registered' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (name, department, role, password, admin_level)
       VALUES ($1,$2,$3,$4,NULL)`,
      [name.trim(), department, role.trim(), hash]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/auth/reset-password  — admin resets another user's password
const auth = require('../middleware/auth');
router.patch('/reset-password', auth, async (req, res) => {
  const { targetName, newPassword } = req.body;
  // Only master admins can reset passwords
  if (req.user.adminLevel !== 'master')
    return res.status(403).json({ error: 'Master admin only' });

  if (!targetName || !newPassword)
    return res.status(400).json({ error: 'targetName and newPassword required' });

  try {
    const hash = await bcrypt.hash(newPassword, 10);
    const r = await pool.query(
      `UPDATE users SET password=$1 WHERE name=$2 RETURNING id`, [hash, targetName]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
