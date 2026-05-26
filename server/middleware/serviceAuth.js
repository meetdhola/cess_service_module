const jwt  = require('jsonwebtoken');
const pool = require('../db/pool');

const SECRET = process.env.JWT_SECRET || 'cess_secret_2526';

/**
 * svcAuth(allowedRoles?)
 * allowedRoles: array like ['admin','superadmin'] — if omitted, any role passes
 */
module.exports = function svcAuth(allowedRoles = []) {
  return async (req, res, next) => {
    const header = req.headers['authorization'];
    if (!header) return res.status(401).json({ error: 'No token' });

    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    let payload;
    try {
      payload = jwt.verify(token, SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // Attach user from DB (fresh, in case role changed)
    try {
      const { rows } = await pool.query(
        `SELECT id, name, phone, role, department, is_active
         FROM service_users WHERE id=$1`, [payload.id]
      );
      const u = rows[0];
      if (!u || !u.is_active)
        return res.status(401).json({ error: 'User not found or deactivated' });

      if (allowedRoles.length && !allowedRoles.includes(u.role))
        return res.status(403).json({ error: `Access denied. Required: ${allowedRoles.join(' or ')}` });

      req.svcUser = u;
      next();
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
};
