const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const pool   = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

const SECRET = process.env.JWT_SECRET || 'cess_secret_2526';

function genKey() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/service/auth/login
router.post('/login', async (req, res) => {
  const { phone, secretKey } = req.body;
  if (!phone || !secretKey) return res.status(400).json({ error: 'Phone and secret key required' });
  try {
    const { rows } = await pool.query(
      `SELECT * FROM service_users WHERE phone=$1 AND is_active=TRUE`, [phone.trim()]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Phone number not registered' });
    if (user.secret_key !== secretKey.trim()) return res.status(401).json({ error: 'Invalid secret key' });
    const token = jwt.sign(
      { id: user.id, name: user.name, phone: user.phone, role: user.role, dept: user.department },
      SECRET, { expiresIn: '12h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, department: user.department } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/service/auth/workers
router.get('/workers', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    const isSuperAdmin = req.svcUser?.role === 'superadmin';
    const isSales      = req.svcUser?.role === 'admin' && (req.svcUser?.department||'').toLowerCase().includes('sales');
    const fields = isSuperAdmin
      ? 'id, name, role, department, phone, monthly_salary, irc_daily_rate, seniority, is_active'
      : isSales
      ? 'id, name, role, department, phone, irc_daily_rate, seniority, is_active'
      : 'id, name, role, department, phone, seniority, is_active';
    const { rows } = await pool.query(
      `SELECT ${fields} FROM service_users WHERE is_active=TRUE AND (role IN ('plc','wireman') OR role IN ('admin','superadmin')) ORDER BY role, name`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/service/auth/me
router.get('/me', svcAuth(), async (req, res) => { res.json(req.svcUser); });

// GET /api/service/auth/all-users  — superadmin: list all with secret keys
router.get('/all-users', svcAuth(['superadmin']), async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, phone, role, department, secret_key, is_active, created_at
       FROM service_users ORDER BY role, name`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* PATCH /api/service/auth/users/bulk-regen-keys — superadmin only */
router.patch('/users/bulk-regen-keys', svcAuth(['superadmin']), async (req, res) => {
  const { confirm1, confirm2 } = req.body;
  if (!confirm1 || !confirm2) return res.status(400).json({ error: 'Two confirmations required' });
  if (confirm1 !== confirm2) return res.status(400).json({ error: 'Confirmations do not match' });
  if (confirm1 !== 'RESET ALL KEYS') return res.status(400).json({ error: 'Type RESET ALL KEYS to confirm' });
  try {
    const { rows: users } = await pool.query(`SELECT id FROM service_users WHERE is_active = TRUE`);
    const results = [];
    for (const u of users) {
      let key, dup;
      do {
        key = String(Math.floor(100000 + Math.random() * 900000));
        dup = await pool.query(`SELECT id FROM service_users WHERE secret_key=$1 AND id != $2`, [key, u.id]);
      } while (dup.rows.length);
      await pool.query(`UPDATE service_users SET secret_key=$1 WHERE id=$2`, [key, u.id]);
      results.push({ id: u.id, secret_key: key });
    }
    res.json({ message: `Reset ${results.length} keys`, users: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/service/auth/users/:id/regen-key  — superadmin: regenerate secret key
router.patch('/users/:id/regen-key', svcAuth(['superadmin']), async (req, res) => {
  try {
    let key = genKey();
    let attempts = 0;
    while (attempts < 10) {
      const dup = await pool.query(`SELECT id FROM service_users WHERE secret_key=$1`, [key]);
      if (!dup.rows.length) break;
      key = genKey(); attempts++;
    }
    const { rows } = await pool.query(
      `UPDATE service_users SET secret_key=$1 WHERE id=$2 RETURNING id, name, secret_key`,
      [key, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


// POST /api/service/auth/users  — superadmin: add new user
router.post('/users', svcAuth(['superadmin']), async (req, res) => {
  const { name, phone, role, department } = req.body;
  if (!name || !phone || !role) return res.status(400).json({ error: 'name, phone, role required' });
  try {
    let key = genKey();
    let attempts = 0;
    while (attempts < 10) {
      const dup = await pool.query(`SELECT id FROM service_users WHERE secret_key=$1`, [key]);
      if (!dup.rows.length) break;
      key = genKey(); attempts++;
    }
    const { rows } = await pool.query(
      `INSERT INTO service_users (name, phone, role, department, secret_key) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name.trim(), phone.trim(), role, department||null, key]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/service/auth/users/:id  — superadmin: update user (toggle active, change role)
router.patch('/users/:id', svcAuth(['superadmin']), async (req, res) => {
  const { is_active, role, department } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE service_users SET
        is_active  = COALESCE($1, is_active),
        role       = COALESCE($2, role),
        department = COALESCE($3, department)
       WHERE id=$4 RETURNING id, name, role, department, is_active, secret_key`,
      [is_active ?? null, role || null, department || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});



module.exports = router;
