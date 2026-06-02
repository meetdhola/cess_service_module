const express   = require('express');
const router    = express.Router();
const pool      = require('../db/pool');
const svcAuth   = require('../middleware/serviceAuth');
const PERMISSIONS = require('../permissions');

/* ─── Helper: get effective permissions for a user ─── */
async function getEffectivePermissions(userId, role) {
  // Start with role defaults
  const defaults = new Set(
    PERMISSIONS
      .filter(p => p.defaults.includes(role))
      .map(p => p.key)
  );

  // Get explicit overrides from DB
  const { rows } = await pool.query(
    `SELECT permission, granted FROM user_permissions WHERE user_id=$1`, [userId]);

  const effective = new Set(defaults);
  for (const row of rows) {
    if (row.granted)  effective.add(row.permission);
    else              effective.delete(row.permission);
  }

  return [...effective];
}

/* GET /api/service/permissions/mine — current user's effective permissions */
router.get('/mine', svcAuth(), async (req, res) => {
  try {
    const perms = await getEffectivePermissions(req.svcUser.id, req.svcUser.role);
    res.json({ permissions: perms, role: req.svcUser.role });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/service/permissions/registry — full permission list */
router.get('/registry', svcAuth(['superadmin']), (_req, res) => {
  res.json(PERMISSIONS);
});

/* GET /api/service/permissions/users — all users with their permissions */
router.get('/users', svcAuth(['superadmin']), async (req, res) => {
  try {
    const { rows: users } = await pool.query(
      `SELECT id, name, role, department, is_active FROM service_users ORDER BY role, name`);

    const { rows: overrides } = await pool.query(
      `SELECT user_id, permission, granted FROM user_permissions`);

    // Group overrides by user
    const overrideMap = {};
    for (const o of overrides) {
      if (!overrideMap[o.user_id]) overrideMap[o.user_id] = {};
      overrideMap[o.user_id][o.permission] = o.granted;
    }

    const result = users.map(u => {
      const roleDefaults = new Set(
        PERMISSIONS.filter(p => p.defaults.includes(u.role)).map(p => p.key));
      const userOverrides = overrideMap[u.id] || {};

      // Build effective permissions
      const effective = new Set(roleDefaults);
      for (const [perm, granted] of Object.entries(userOverrides)) {
        if (granted) effective.add(perm);
        else         effective.delete(perm);
      }

      return {
        ...u,
        permissions:    [...effective],
        overrides:      userOverrides,
        role_defaults:  [...roleDefaults],
      };
    });

    res.json({ users: result, registry: PERMISSIONS });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* PATCH /api/service/permissions/users/:id — set permissions for a user */
router.patch('/users/:id', svcAuth(['superadmin']), async (req, res) => {
  const { overrides } = req.body; // { permission_key: true/false/null }
  if (!overrides || typeof overrides !== 'object') {
    return res.status(400).json({ error: 'overrides object required' });
  }
  try {
    // Delete existing overrides for this user
    await pool.query(`DELETE FROM user_permissions WHERE user_id=$1`, [req.params.id]);

    // Insert new overrides (only non-default ones)
    const { rows: [user] } = await pool.query(
      `SELECT role FROM service_users WHERE id=$1`, [req.params.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const roleDefaults = new Set(
      PERMISSIONS.filter(p => p.defaults.includes(user.role)).map(p => p.key));

    const inserts = [];
    for (const [perm, val] of Object.entries(overrides)) {
      if (val === null) continue; // null = use default, skip
      const isDefault = roleDefaults.has(perm);
      // Only store if different from role default
      if (val === true && !isDefault)  inserts.push([req.params.id, perm, true]);
      if (val === false && isDefault)  inserts.push([req.params.id, perm, false]);
    }

    for (const [uid, perm, granted] of inserts) {
      await pool.query(
        `INSERT INTO user_permissions (user_id, permission, granted)
         VALUES ($1,$2,$3) ON CONFLICT (user_id, permission) DO UPDATE SET granted=$3`,
        [uid, perm, granted]);
    }

    const perms = await getEffectivePermissions(req.params.id, user.role);
    res.json({ permissions: perms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
