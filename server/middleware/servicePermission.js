/**
 * svcPerm(permission) — middleware that checks user has a specific permission.
 * Works alongside svcAuth — user must be authenticated first.
 * Superadmin always passes.
 * For other roles: checks role defaults + DB overrides.
 */
const pool        = require('../db/pool');
const PERMISSIONS = require('../permissions');

const ROLE_DEFAULTS = {};
for (const p of PERMISSIONS) {
  for (const role of p.defaults) {
    if (!ROLE_DEFAULTS[role]) ROLE_DEFAULTS[role] = new Set();
    ROLE_DEFAULTS[role].add(p.key);
  }
}

async function getEffectivePermissions(userId, role) {
  const defaults = new Set(ROLE_DEFAULTS[role] || []);
  try {
    const { rows } = await pool.query(
      `SELECT permission, granted FROM user_permissions WHERE user_id=$1`, [userId]);
    for (const r of rows) {
      if (r.granted) defaults.add(r.permission);
      else           defaults.delete(r.permission);
    }
  } catch {}
  return defaults;
}

function svcPerm(permission) {
  return async (req, res, next) => {
    if (!req.svcUser) return res.status(401).json({ error: 'Unauthorized' });
    if (req.svcUser.role === 'superadmin') return next();
    const perms = await getEffectivePermissions(req.svcUser.id, req.svcUser.role);
    if (perms.has(permission)) return next();
    return res.status(403).json({ error: `Permission denied: ${permission}` });
  };
}

module.exports = svcPerm;
