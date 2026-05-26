const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req,_file,cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 50*1024*1024 } });

const PREFIX_FOR = { installation:'IN', troubleshooting:'SE', new_development:'SE', after_sales:'SE' };
const isMediaType = mime => mime.startsWith('image/') ? 'photo' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'voice' : 'other';

/* ─── POST /api/service/tickets — create (PUBLIC inquiry form) ─── */
router.post('/', async (req, res) => {
  const b = req.body;
  if (!b.customer_name?.trim() || !b.address?.trim() || !b.service_type) {
    return res.status(400).json({ error: 'customer_name, address, service_type required' });
  }
  const prefix = PREFIX_FOR[b.service_type] || 'SE';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: c } = await client.query(
      `UPDATE ticket_counters SET last_num=last_num+1 WHERE prefix=$1 RETURNING last_num`, [prefix]);
    const ticket_id = `${prefix}${String(c[0].last_num).padStart(4,'0')}`;
    const { rows } = await client.query(
      `INSERT INTO service_tickets
        (ticket_id, service_type, customer_name, address, description, priority,
         contact_name, contact_phone, designation, sales_agent,
         needs_plc, needs_wiring, plc_type,
         warranty_status, invoice_no, invoice_date, challan_no, challan_date)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10, $11,$12,$13, $14,$15,$16,$17,$18)
       RETURNING *`,
      [ticket_id, b.service_type, b.customer_name.trim(), b.address.trim(), b.description||null, b.priority||'Medium',
       b.contact_name||null, b.contact_phone||null, b.designation||null, b.sales_agent||null,
       !!b.needs_plc, !!b.needs_wiring, b.plc_type||null,
       b.warranty_status||'in_warranty',
       b.invoice_no||null, b.invoice_no?new Date():null,
       b.challan_no||null, b.challan_no?new Date():null]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Create ticket error:', e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

/* ─── POST /api/service/tickets/:id/media — public on create ─── */
router.post('/:id/media', upload.array('files', 10), async (req, res) => {
  try {
    const inserts = req.files.map(f => pool.query(
      `INSERT INTO ticket_media (ticket_id, media_type, filename, original_name, file_size, url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, isMediaType(f.mimetype), f.filename, f.originalname, f.size, `/uploads/${f.filename}`]
    ));
    const results = await Promise.all(inserts);
    res.json(results.map(r => r.rows[0]));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets — list (admin) ─── */
router.get('/', svcAuth(['admin','superadmin']), async (req, res) => {
  const { status, priority, service_type, search } = req.query;
  const where = []; const args = []; let n = 1;
  if (status      && status      !== 'All') { where.push(`t.status=$${n++}`);       args.push(status); }
  if (priority    && priority    !== 'All') { where.push(`t.priority=$${n++}`);     args.push(priority); }
  if (service_type&& service_type!== 'All') { where.push(`t.service_type=$${n++}`); args.push(service_type); }
  if (search) { where.push(`(t.ticket_id ILIKE $${n} OR t.customer_name ILIKE $${n} OR t.contact_name ILIKE $${n})`); args.push(`%${search}%`); n++; }
  const sql = `
    SELECT t.*,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='plc')     AS plc_worker_names,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='wireman') AS wireman_worker_names,
      (SELECT COUNT(*)::int FROM ticket_documents WHERE ticket_id=t.id) AS doc_count
    FROM service_tickets t
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.created_at DESC LIMIT 500`;
  try { const { rows } = await pool.query(sql, args); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets/my — worker's own tickets ─── */
router.get('/my', svcAuth(['plc','wireman']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*,
         (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='plc')     AS plc_worker_names,
         (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='wireman') AS wireman_worker_names,
         (SELECT COALESCE(SUM(total_seconds),0) FROM work_sessions WHERE worker_id=$1 AND ticket_id=t.id)  AS total_worked_secs
       FROM service_tickets t
       JOIN ticket_assignments ta ON ta.ticket_id=t.id
       WHERE ta.worker_id=$1
       ORDER BY t.created_at DESC`, [req.svcUser.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets/:id ─── */
router.get('/:id', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── PATCH /api/service/tickets/:id/assign — multi-assign ─── */
router.patch('/:id/assign', svcAuth(['admin','superadmin']), async (req, res) => {
  const { plc_ids = [], wireman_ids = [] } = req.body;
  // Backwards-compat: also accept old single-id payload
  const plcArr = Array.isArray(plc_ids) ? plc_ids : (req.body.assigned_plc ? [req.body.assigned_plc] : []);
  const wmArr  = Array.isArray(wireman_ids) ? wireman_ids : (req.body.assigned_wireman ? [req.body.assigned_wireman] : []);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: t } = await client.query(`SELECT status FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!t.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ticket not found' }); }
    if (['Completed','Closed'].includes(t[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot assign — ticket is completed/closed.' });
    }
    await client.query(`DELETE FROM ticket_assignments WHERE ticket_id=$1`, [req.params.id]);
    for (const wid of plcArr) {
      await client.query(`INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by) VALUES ($1,$2,'plc',$3) ON CONFLICT DO NOTHING`, [req.params.id, wid, req.svcUser.id]);
    }
    for (const wid of wmArr) {
      await client.query(`INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by) VALUES ($1,$2,'wireman',$3) ON CONFLICT DO NOTHING`, [req.params.id, wid, req.svcUser.id]);
    }
    if (plcArr.length + wmArr.length > 0) {
      await client.query(`UPDATE service_tickets SET status=CASE WHEN status='Open' THEN 'Assigned' ELSE status END, updated_at=NOW() WHERE id=$1`, [req.params.id]);
    }
    await client.query('COMMIT');
    [...plcArr, ...wmArr].forEach(wid => req.io?.to(`user:${wid}`).emit('ticket:assigned', { ticket_id: req.params.id }));
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Assign error:', e);
    res.status(500).json({ error: e.message });
  } finally { client.release(); }
});

/* ─── PATCH /api/service/tickets/:id/status ─── */
router.patch('/:id/status', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE service_tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.body.status, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── PATCH /api/service/tickets/:id/complete ─── */
router.patch('/:id/complete', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  try {
    const { rows: all } = await pool.query(`SELECT worker_id FROM ticket_assignments WHERE ticket_id=$1`, [req.params.id]);
    if (all.length) {
      const { rows: doneSessions } = await pool.query(
        `SELECT DISTINCT worker_id FROM work_sessions WHERE ticket_id=$1 AND status='completed'`, [req.params.id]);
      const doneSet = new Set(doneSessions.map(r => r.worker_id));
      const allDone = all.every(a => doneSet.has(a.worker_id));
      if (allDone) await pool.query(`UPDATE service_tickets SET status='Completed', updated_at=NOW() WHERE id=$1`, [req.params.id]);
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════════ */
/* ─── INVOICE / CHALLAN — sales agent / admin updates  ─── */
/* ════════════════════════════════════════════════════════════ */

router.patch('/:id/invoice', svcAuth(['admin','superadmin']), async (req, res) => {
  const invoice_no = req.body.invoice_no?.toString().trim() || null;
  const challan_no = req.body.challan_no?.toString().trim() || null;
  try {
    const { rows } = await pool.query(
      `UPDATE service_tickets SET
         invoice_no = $1::varchar,
         invoice_date = CASE
           WHEN $1::varchar IS NOT NULL AND (invoice_no IS NULL OR invoice_no <> $1::varchar) THEN NOW()
           ELSE invoice_date
         END,
         challan_no = $2::varchar,
         challan_date = CASE
           WHEN $2::varchar IS NOT NULL AND (challan_no IS NULL OR challan_no <> $2::varchar) THEN NOW()
           ELSE challan_date
         END,
         invoice_updated_at = NOW(),
         invoice_updated_by = $3::uuid,
         updated_at = NOW()
       WHERE id = $4::uuid RETURNING *`,
      [invoice_no, challan_no, req.svcUser.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Invoice update error:', e);
    res.status(500).json({ error: e.message });
  }
});
// router.patch('/:id/invoice', svcAuth(['admin','superadmin']), async (req, res) => {
//   const { invoice_no, challan_no } = req.body;
//   try {
//     const { rows } = await pool.query(
//       `UPDATE service_tickets SET
//          invoice_no = $1,
//          invoice_date = CASE WHEN $1 IS NOT NULL AND (invoice_no IS NULL OR invoice_no <> $1) THEN NOW() ELSE invoice_date END,
//          challan_no = $2,
//          challan_date = CASE WHEN $2 IS NOT NULL AND (challan_no IS NULL OR challan_no <> $2) THEN NOW() ELSE challan_date END,
//          invoice_updated_at = NOW(),
//          invoice_updated_by = $3,
//          updated_at = NOW()
//        WHERE id = $4 RETURNING *`,
//       [invoice_no || null, challan_no || null, req.svcUser.id, req.params.id]);
//     res.json(rows[0]);
//   } catch (e) { console.error('Invoice update error:', e); res.status(500).json({ error: e.message }); }
// });

/* ════════════════════════════════════════════════════════════ */
/* ─── DOCUMENT UPLOADS — anyone logged in can upload      ─── */
/* ════════════════════════════════════════════════════════════ */

// Upload one or more documents
router.post('/:id/documents', svcAuth(), upload.array('files', 10), async (req, res) => {
  console.log(`[docs upload] ticket=${req.params.id} by=${req.svcUser?.name} role=${req.svcUser?.role} files=${req.files?.length || 0}`);
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const docType = req.body.doc_type || 'other';
    const note    = req.body.note     || null;
    const results = [];
    for (const f of req.files) {
      const { rows } = await pool.query(
        `INSERT INTO ticket_documents
          (ticket_id, doc_type, filename, original_name, file_size, url, note, uploaded_by, uploaded_role)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [req.params.id, docType, f.filename, f.originalname, f.size,
         `/uploads/${f.filename}`, note, req.svcUser.id, req.svcUser.role]);
      results.push(rows[0]);
    }
    req.io?.to('admins').emit('document:uploaded', { ticket_id: req.params.id, by: req.svcUser.name, doc_type: docType });
    res.json(results);
  } catch (e) {
    console.error('Doc upload error:', e);
    res.status(500).json({ error: e.message });
  }
});

// LIST documents for a ticket — ALL logged-in users can see (worker, admin, superadmin)
// router.get('/:id/documents', svcAuth(), async (req, res) => {
//   console.log(`[docs list] ticket=${req.params.id} by=${req.svcUser?.name} role=${req.svcUser?.role}`);
//   try {
//     const { rows } = await pool.query(
//       `SELECT td.*, su.name AS uploaded_by_name
//          FROM ticket_documents td
//          LEFT JOIN service_users su ON su.id=td.uploaded_by
//         WHERE td.ticket_id=$1
//         ORDER BY td.uploaded_at DESC`, [req.params.id]);
//     console.log(`[docs list] returned ${rows.length} rows`);
//     res.json(rows);
//   } catch (e) {
//     console.error('Doc list error:', e);
//     res.status(500).json({ error: e.message });
//   }
// });


// LIST documents AND inquiry-form media for a ticket — unified view

router.get('/:id/documents', svcAuth(), async (req, res) => {
  console.log(`[docs list] ticket=${req.params.id} by=${req.svcUser?.name} role=${req.svcUser?.role}`);
  try {
    // Pull from ticket_documents (admin/worker/agent uploads)
    const docsQuery = pool.query(
      `SELECT
         td.id,
         td.ticket_id,
         td.doc_type,
         td.filename,
         td.original_name,
         td.file_size,
         td.url,
         td.note,
         td.uploaded_by,
         td.uploaded_role,
         td.uploaded_at,
         su.name AS uploaded_by_name,
         'document' AS source
       FROM ticket_documents td
       LEFT JOIN service_users su ON su.id = td.uploaded_by
       WHERE td.ticket_id = $1`, [req.params.id]);

    // Pull from ticket_media (uploads from the inquiry form — customer/sales-agent)
    const mediaQuery = pool.query(
      `SELECT
         tm.id,
         tm.ticket_id,
         tm.media_type      AS doc_type,
         tm.filename,
         tm.original_name,
         tm.file_size,
         tm.url,
         NULL::text         AS note,
         NULL::uuid         AS uploaded_by,
         'sales_agent'      AS uploaded_role,
         tm.uploaded_at,
         t.sales_agent      AS uploaded_by_name,
         'inquiry_form'     AS source
       FROM ticket_media tm
       JOIN service_tickets t ON t.id = tm.ticket_id
       WHERE tm.ticket_id = $1`, [req.params.id]);

    const [docs, media] = await Promise.all([docsQuery, mediaQuery]);
    const merged = [...docs.rows, ...media.rows]
      .sort((a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at));

    console.log(`[docs list] returned ${merged.length} items (${docs.rows.length} docs + ${media.rows.length} media)`);
    res.json(merged);
  } catch (e) {
    console.error('Doc list error:', e);
    res.status(500).json({ error: e.message });
  }
});


// Delete (admin only)
router.delete('/:id/documents/:docId', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    const { rows } = await pool.query(`DELETE FROM ticket_documents WHERE id=$1 RETURNING filename`, [req.params.docId]);
    if (rows[0]) {
      const filePath = path.join(UPLOAD_DIR, rows[0].filename);
      fs.unlink(filePath, () => {});
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets/:id/team-progress — completion status per worker ─── */
router.get('/:id/team-progress', svcAuth(), async (req, res) => {
  try {
    // All assigned workers
    const { rows: assigned } = await pool.query(
      `SELECT ta.worker_id, ta.role, su.name
         FROM ticket_assignments ta
         JOIN service_users su ON su.id = ta.worker_id
        WHERE ta.ticket_id = $1`,
      [req.params.id]
    );

    // Latest session status per worker on this ticket
    const { rows: sessions } = await pool.query(
      `SELECT DISTINCT ON (worker_id) worker_id, status
         FROM work_sessions
        WHERE ticket_id = $1
        ORDER BY worker_id, created_at DESC`,
      [req.params.id]
    );
    const sessMap = Object.fromEntries(sessions.map(s => [s.worker_id, s.status]));

    const byWorker = {};
    let done = 0, total = assigned.length;
    for (const w of assigned) {
      const sessStatus = sessMap[w.worker_id];
      let status;
      if (sessStatus === 'completed') { status = 'completed'; done++; }
      else if (sessStatus === 'running' || sessStatus === 'paused') status = 'in_progress';
      else status = 'pending';
      byWorker[w.name] = status;
    }

    res.json({
      total,
      done,
      pending: total - done,
      byWorker,
    });
  } catch (e) {
    console.error('Team progress error:', e);
    res.status(500).json({ error: e.message });
  }
});


module.exports = router;