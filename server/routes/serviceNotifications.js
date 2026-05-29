const router  = require('express').Router();
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

/* ════════════════════════════════════════════════════════════════════
   NOTIFICATIONS — generic per-user inbox.
   Mounted in app.js at:   app.use('/api/service/notifications', router)
   ════════════════════════════════════════════════════════════════════ */

/* ─── GET / — list my notifications ─────────────────────────────────
   Query params:
     scope=unread   → only unread (default for the bell dropdown's main list)
     scope=all      → unread first, then read; capped at limit
     limit=N        → max rows (default 50)
   Always returns most-relevant-first ordering. */
router.get('/', svcAuth(), async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'unread';
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const sql = scope === 'unread'
      ? `SELECT * FROM notifications
          WHERE recipient_id = $1 AND read_at IS NULL
          ORDER BY created_at DESC
          LIMIT $2`
      : `SELECT * FROM notifications
          WHERE recipient_id = $1
          ORDER BY read_at NULLS FIRST, created_at DESC
          LIMIT $2`;
    const { rows } = await pool.query(sql, [req.svcUser.id, limit]);
    res.json(rows);
  } catch (e) {
    console.error('notifications list error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ─── GET /unread-count — small endpoint just for the bell badge ─── */
router.get('/unread-count', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count
         FROM notifications
        WHERE recipient_id = $1 AND read_at IS NULL`,
      [req.svcUser.id]);
    res.json({ count: rows[0].count });
  } catch (e) {
    console.error('unread-count error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ─── PATCH /:id/read — mark one notification read ─── */
router.patch('/:id/read', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications
          SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1::uuid AND recipient_id = $2
        RETURNING *`,
      [req.params.id, req.svcUser.id]);
    if (!rows.length) return res.status(404).json({ error: 'Notification not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('mark-read error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ─── PATCH /read-all — mark all my unread as read ─── */
router.patch('/read-all', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE notifications
          SET read_at = NOW()
        WHERE recipient_id = $1 AND read_at IS NULL
        RETURNING id`,
      [req.svcUser.id]);
    res.json({ marked: rows.length });
  } catch (e) {
    console.error('read-all error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ─── DELETE /:id — remove one (optional housekeeping) ─── */
router.delete('/:id', svcAuth(), async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM notifications WHERE id = $1::uuid AND recipient_id = $2`,
      [req.params.id, req.svcUser.id]);
    if (!rowCount) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('notification delete error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════════════════════════════════
   HELPER — used by other modules (note POST, ticket-assigned, etc.)
   to create notifications + emit socket. Exported below.
   ════════════════════════════════════════════════════════════════════ */

/**
 * Create notifications for one or more recipients.
 * Skips creation for any recipient_id equal to opts.skipRecipientId (used
 * for @everyone to avoid notifying the sender).
 *
 * @param {Object} io      Socket.IO server (req.io)
 * @param {Object} opts
 * @param {string[]} opts.recipientIds  service_users.id list
 * @param {string}   opts.type           e.g. 'note_mention'
 * @param {string}   opts.title          headline
 * @param {string}   opts.body           preview
 * @param {string}   opts.link           click destination
 * @param {Object}   opts.context        type-specific JSON
 * @param {string?}  opts.skipRecipientId  do not notify this id (sender on @everyone)
 */
async function notify(io, opts) {
  const recipients = (opts.recipientIds || [])
    .filter(r => r && r !== opts.skipRecipientId);
  if (!recipients.length) return [];

  // Insert all rows in one statement for atomicity
  const values = [];
  const params = [];
  let n = 1;
  for (const rid of recipients) {
    values.push(`($${n++}::uuid, $${n++}, $${n++}, $${n++}, $${n++}, $${n++}::jsonb)`);
    params.push(rid, opts.type, opts.title, opts.body || null, opts.link || null, JSON.stringify(opts.context || {}));
  }
  const { rows } = await pool.query(
    `INSERT INTO notifications (recipient_id, type, title, body, link, context)
     VALUES ${values.join(', ')}
     RETURNING *`,
    params);

  // Per-user socket push (each user is in a 'user:<id>' room from your existing pattern)
  if (io) {
    for (const r of rows) {
      io.to(`user:${r.recipient_id}`).emit('notifications:new', r);
    }
  }
  return rows;
}

module.exports = router;
module.exports.notify = notify;