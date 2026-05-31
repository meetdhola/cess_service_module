const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');
const profit = require('./serviceProfitability');  
const { notify } = require('./serviceNotifications');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
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
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='plc'), '[]'::json) AS assigned_plcs,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='wireman'), '[]'::json) AS assigned_wiremen,
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
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='plc'), '[]'::json) AS assigned_plcs,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='wireman'), '[]'::json) AS assigned_wiremen,
      (SELECT COUNT(*)::int FROM ticket_documents WHERE ticket_id=t.id) AS doc_count
    FROM service_tickets t
       JOIN ticket_assignments ta ON ta.ticket_id=t.id
       WHERE ta.worker_id=$1
       ORDER BY t.created_at DESC`, [req.svcUser.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets/:id ─── */

/* ─── GET /api/service/parties/search ─── */
router.get('/parties/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 1) return res.json([]);
  try {
    const { rows } = await pool.query(
      `SELECT code, name, city, state, phone, email
         FROM party_master
        WHERE is_active = TRUE
          AND (name ILIKE $1 OR city ILIKE $1)
        ORDER BY CASE WHEN name ILIKE $2 THEN 0 ELSE 1 END, name ASC
        LIMIT 10`,
      [`%${q}%`, `${q}%`]
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

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

  // Safety: refuse to wipe assignments if the request supplies neither list.
  // The Assign modal preloads existing assignees and sends back the full intended
  // set on save, so reaching here with both empty is almost certainly a UI bug
  // or stale request — fail loudly instead of silently clearing the ticket.
  if (plcArr.length === 0 && wmArr.length === 0) {
    return res.status(400).json({ error: 'No workers selected.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: t } = await client.query(`SELECT status FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!t.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Ticket not found' });
    }
    if (['Completed','Closed'].includes(t[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot assign — ticket is completed/closed.' });
    }

    // Replace assignments
    await client.query(`DELETE FROM ticket_assignments WHERE ticket_id=$1`, [req.params.id]);
    for (const wid of plcArr) {
      await client.query(
        `INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by)
         VALUES ($1,$2,'plc',$3) ON CONFLICT DO NOTHING`,
        [req.params.id, wid, req.svcUser.id]);
    }
    for (const wid of wmArr) {
      await client.query(
        `INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by)
         VALUES ($1,$2,'wireman',$3) ON CONFLICT DO NOTHING`,
        [req.params.id, wid, req.svcUser.id]);
    }

    // Promote Open → Assigned when any worker is now on the ticket
    await client.query(
      `UPDATE service_tickets
          SET status     = CASE WHEN status='Open' THEN 'Assigned' ELSE status END,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id]);

    // Claim ownership: first admin to assign becomes created_by.
    // WHERE created_by IS NULL ensures subsequent reassignments don't change owner.
    await client.query(
      `UPDATE service_tickets
          SET created_by = $1::uuid
        WHERE id = $2::uuid AND created_by IS NULL`,
      [req.svcUser.id, req.params.id]);

    await client.query('COMMIT');

    // Notify assigned workers
    [...plcArr, ...wmArr].forEach(wid =>
      req.io?.to(`user:${wid}`).emit('ticket:assigned', { ticket_id: req.params.id })
    );

    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Assign error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

/* ─── PATCH /api/service/tickets/:id/status ─── */
router.patch('/:id/status', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(`UPDATE service_tickets SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [req.body.status, req.params.id]);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ╔══════════════════════════════════════════════════════════════════╗
   ║  PART B — REPLACE your existing  /:id/complete  route with this.   ║
   ║                                                                    ║
   ║  WHY: the old version blocked workers until charged_amount was     ║
   ║  set. In the new flow the worker no longer enters the charge —     ║
   ║  they submit expense + completion report (via /worker-completion). ║
   ║  So completion is now gated on completed_by_worker_at, and the     ║
   ║  charge is entered by admin/superadmin afterwards.                 ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ─── PATCH /api/service/tickets/:id/complete ───
   Workers must have submitted their completion report (expense + file)
   before marking complete — unless the ticket is warranty.
   Admins/superadmins can complete regardless.
   Ticket auto-marks 'Completed' when every assigned worker has both a
   completed work_session AND a completion report (or it's warranty). */
router.patch('/:id/complete', svcAuth(['plc','wireman']), async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { rows: tk } = await pool.query(
      `SELECT id, ticket_id AS ticket_no, customer_name, status, warranty_status, created_by
         FROM service_tickets WHERE id=$1`, [ticketId]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tk[0];
 
    const { rows: assigned } = await pool.query(
      `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
      [ticketId, req.svcUser.id]);
    if (!assigned.length) return res.status(403).json({ error: 'Not assigned to this ticket' });
 
    if (!['In Progress','Assigned','Open'].includes(ticket.status)) {
      return res.status(400).json({ error: `Cannot complete from status "${ticket.status}"` });
    }
 
    // Mark this worker's billing row as completed (no expense/report required)
    await pool.query(
      `INSERT INTO ticket_worker_billing (ticket_id, worker_id, completed_by_worker_at)
       VALUES ($1::uuid, $2::uuid, NOW())
       ON CONFLICT (ticket_id, worker_id) DO UPDATE SET completed_by_worker_at = NOW()`,
      [ticketId, req.svcUser.id]);
 
    const { rows: updated } = await pool.query(
      `UPDATE service_tickets
          SET status='Report Submitted', updated_at=NOW()
        WHERE id=$1
        RETURNING *`, [ticketId]);
 
    if (ticket.created_by) {
      const isWarranty = ticket.warranty_status === 'in_warranty';
      await notify(req.io, {
        recipientIds: [ticket.created_by],
        type:    'report_submitted',
        title:   `${req.svcUser.name} marked ${ticket.ticket_no} ready for closure`,
        body:    `${ticket.customer_name}${isWarranty ? ' · warranty (no charge)' : ''}`,
        link:    `/service/admin/tickets/${ticket.ticket_no}`,
        context: {
          ticket_id: ticket.id, ticket_no: ticket.ticket_no,
          customer: ticket.customer_name, actor_id: req.svcUser.id,
          actor_name: req.svcUser.name, is_warranty: isWarranty,
        },
      });
    }
 
    req.io?.to('admins').emit('ticket:report-submitted', {
      ticket_id: ticket.id, ticket_no: ticket.ticket_no, worker_id: req.svcUser.id,
    });
 
    res.json(updated[0]);
  } catch (e) {
    console.error('complete error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/:id/close', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    const ticketId = req.params.id;
    const { rows: tk } = await pool.query(
      `SELECT id, ticket_id AS ticket_no, customer_name, status, created_by
         FROM service_tickets WHERE id=$1`, [ticketId]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tk[0];
 
    // Row-level gate: superadmin can close anyone's ticket; admin can only
    // close their own. (If created_by is NULL, only superadmin can act.)
    const isCreator    = ticket.created_by === req.svcUser.id;
    const isSuperadmin = req.svcUser.role === 'superadmin';
    if (!isCreator && !isSuperadmin) {
      return res.status(403).json({ error: 'Only the ticket creator or a superadmin can close this ticket' });
    }
 
    if (ticket.status !== 'Report Submitted') {
      return res.status(400).json({ error: `Cannot close from status "${ticket.status}". Ticket must be 'Report Submitted'.` });
    }
 
    const { rows: updated } = await pool.query(
      `UPDATE service_tickets
          SET status='Closed', closed_at=NOW(), closed_by=$1::uuid, updated_at=NOW()
        WHERE id=$2
        RETURNING *`,
      [req.svcUser.id, ticketId]);
 
    req.io?.emit('ticket:closed', {
      ticket_id: ticket.id, ticket_no: ticket.ticket_no, closed_by: req.svcUser.id,
    });
 
    res.json(updated[0]);
  } catch (e) {
    console.error('close error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* ─── PATCH /api/service/tickets/:id/complete ─── */
// router.patch('/:id/complete', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
//   try {
//     const isWorker     = ['plc','wireman'].includes(req.svcUser.role);
//     const isPrivileged = ['admin','superadmin'].includes(req.svcUser.role);

//     // Get ticket warranty + status
//     const { rows: tkts } = await pool.query(
//       `SELECT warranty_status, status FROM service_tickets WHERE id=$1`, [req.params.id]);
//     if (!tkts.length) return res.status(404).json({ error: 'Ticket not found' });
//     const tkt = tkts[0];

//     // Workers must have submitted billing first — unless warranty
//     if (isWorker && tkt.warranty_status !== 'in_warranty') {
//       const { rows: billing } = await pool.query(
//         `SELECT 1 FROM ticket_worker_billing WHERE ticket_id=$1 AND worker_id=$2`,
//         [req.params.id, req.svcUser.id]);
//       if (!billing.length) {
//         return res.status(400).json({ error: 'Please record the charged amount before marking complete.' });
//       }
//     }

//     // Auto-complete logic: if ALL assigned workers have completed sessions, mark ticket Completed
//     const { rows: all } = await pool.query(
//       `SELECT worker_id FROM ticket_assignments WHERE ticket_id=$1`, [req.params.id]);
//     if (all.length) {
//       const { rows: doneSessions } = await pool.query(
//         `SELECT DISTINCT worker_id FROM work_sessions WHERE ticket_id=$1 AND status='completed'`,
//         [req.params.id]);
//       const doneSet = new Set(doneSessions.map(r => r.worker_id));
//       const allDone = all.every(a => doneSet.has(a.worker_id));
//       if (allDone) {
//         await pool.query(
//           `UPDATE service_tickets SET status='Completed', updated_at=NOW() WHERE id=$1`,
//           [req.params.id]);
//       }
//     }
//     res.json({ ok: true });
//   } catch (e) {
//     console.error('Complete ticket error:', e);
//     res.status(500).json({ error: e.message });
//   }
// });

/* ════════════════════════════════════════════════════════════ */
/* ─── INVOICE / CHALLAN ─── */
/* ════════════════════════════════════════════════════════════ */

router.patch('/:id/invoice', svcAuth(), async (req, res) => {
  const invoice_no = req.body.invoice_no?.toString().trim() || null;
  try {
    const { rows } = await pool.query(
      `UPDATE service_tickets SET
         invoice_no = $1::varchar,
         invoice_date = CASE
           WHEN $1::varchar IS NOT NULL AND (invoice_no IS NULL OR invoice_no <> $1::varchar) THEN NOW()
           ELSE invoice_date
         END,
         invoice_updated_at = NOW(),
         invoice_updated_by = $2::uuid,
         updated_at = NOW()
       WHERE id = $3::uuid RETURNING *`,
      [invoice_no, req.svcUser.id, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    req.io?.to('admins').emit('invoice:updated', { ticket_id: req.params.id, invoice_no });
    res.json(rows[0]);
  } catch (e) {
    console.error('Invoice update error:', e);
    res.status(500).json({ error: e.message });
  }
});

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


/* ════════════════════════════════════════════════════════════ */
/* ─── WORKER BILLING — per-worker charged amounts          ─── */
/* ════════════════════════════════════════════════════════════ */

// POST /api/service/tickets/:id/worker-billing
// The assigned worker submits their charged amount (one entry per worker per ticket)
// Workers can only create/update their OWN entry, and only if ticket is not yet 'Completed'
router.post('/:id/worker-billing', svcAuth(['plc','wireman']), async (req, res) => {
  const { charged_amount, charged_note } = req.body;

  // Validation
  if (charged_amount === undefined || charged_amount === null) {
    return res.status(400).json({ error: 'charged_amount is required' });
  }
  const amount = Number(charged_amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'charged_amount must be a non-negative number' });
  }
  if (amount > 99999999) {
    return res.status(400).json({ error: 'Amount exceeds maximum allowed' });
  }

  try {
    // 1. Verify ticket exists + warranty status + completion state
    const { rows: tkts } = await pool.query(
      `SELECT id, ticket_id, status, warranty_status FROM service_tickets WHERE id=$1`,
      [req.params.id]);
    if (!tkts.length) return res.status(404).json({ error: 'Ticket not found' });
    const tkt = tkts[0];

    // Warranty tickets: no billing flow
    if (tkt.warranty_status === 'in_warranty') {
      return res.status(400).json({ error: 'Warranty tickets do not require billing entries' });
    }

    // Locked after completion — only admin can edit
    if (['Completed','Closed'].includes(tkt.status)) {
      return res.status(403).json({ error: 'Ticket is completed. Only admins can edit billing.' });
    }

    // 2. Verify worker is assigned to this ticket
    const { rows: assigned } = await pool.query(
      `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
      [req.params.id, req.svcUser.id]);
    if (!assigned.length) {
      return res.status(403).json({ error: 'You are not assigned to this ticket' });
    }

    // 3. Upsert billing entry
    const { rows } = await pool.query(
      `INSERT INTO ticket_worker_billing (ticket_id, worker_id, charged_amount, charged_note)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4)
       ON CONFLICT (ticket_id, worker_id)
       DO UPDATE SET
         charged_amount = EXCLUDED.charged_amount,
         charged_note   = EXCLUDED.charged_note,
         charged_at     = NOW()
       RETURNING *`,
      [req.params.id, req.svcUser.id, amount, charged_note || null]);

    // Broadcast for admin live view
    req.io?.to('admins').emit('billing:recorded', {
      ticket_id: req.params.id,
      worker_id: req.svcUser.id,
      worker_name: req.svcUser.name,
      amount,
    });

    res.json(rows[0]);
  } catch (e) {
    console.error('Worker billing error:', e);
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/service/tickets/:id/worker-billing/:workerId
// Admin-only edit (post-completion adjustments)
router.patch('/:id/worker-billing/:workerId', svcAuth(['admin','superadmin']), async (req, res) => {
  const { charged_amount, charged_note } = req.body;

  if (charged_amount === undefined || charged_amount === null) {
    return res.status(400).json({ error: 'charged_amount is required' });
  }
  const amount = Number(charged_amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'charged_amount must be non-negative' });
  }

  try {
    // Upsert (allows admin to add billing even if worker never submitted)
    const { rows } = await pool.query(
      `INSERT INTO ticket_worker_billing (ticket_id, worker_id, charged_amount, charged_note, edited_by, edited_at)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5::uuid, NOW())
       ON CONFLICT (ticket_id, worker_id)
       DO UPDATE SET
         charged_amount = EXCLUDED.charged_amount,
         charged_note   = EXCLUDED.charged_note,
         edited_by      = EXCLUDED.edited_by,
         edited_at      = NOW()
       RETURNING *`,
      [req.params.id, req.params.workerId, amount, charged_note || null, req.svcUser.id]);

    res.json(rows[0]);
  } catch (e) {
    console.error('Admin billing edit error:', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/service/tickets/:id/billing-status
// Returns per-worker billing entries + ticket-level rollup. Used by both worker (own entry) and admin (full audit).
router.get('/:id/billing-status', svcAuth(), async (req, res) => {
  try {
    // Get all assigned workers
    const { rows: assigned } = await pool.query(
      `SELECT ta.worker_id, ta.role, su.name AS worker_name, su.seniority AS worker_seniority
         FROM ticket_assignments ta
         JOIN service_users su ON su.id = ta.worker_id
        WHERE ta.ticket_id = $1`,
      [req.params.id]);

    // Get existing billing entries
    const { rows: billings } = await pool.query(
      `SELECT twb.*, eu.name AS edited_by_name
         FROM ticket_worker_billing twb
         LEFT JOIN service_users eu ON eu.id = twb.edited_by
        WHERE twb.ticket_id = $1`,
      [req.params.id]);
    const bMap = Object.fromEntries(billings.map(b => [b.worker_id, b]));

    // Get ticket warranty status
    const { rows: tkts } = await pool.query(
      `SELECT warranty_status, status FROM service_tickets WHERE id=$1`,
      [req.params.id]);
    const ticket = tkts[0] || {};

    // Build per-worker rows
    const workers = assigned.map(a => {
      const b = bMap[a.worker_id];
      return {
        worker_id:        a.worker_id,
        worker_name:      a.worker_name,
        worker_role:      a.role,
        worker_seniority: a.worker_seniority,
        has_billed:       b ? b.charged_amount != null : false,
        charged_amount:   b && b.charged_amount != null ? Number(b.charged_amount) : null,
        charged_note:     b?.charged_note || null,
        charged_at:       b?.charged_at || null,
        edited_by_name:   b?.edited_by_name || null,
        edited_at:        b?.edited_at || null,
        // NEW — worker completion side:
        expense_amount:   b ? Number(b.expense_amount || 0) : 0,
        expense_note:     b?.expense_note || null,
        completed_at:     b?.completed_by_worker_at || null,
        has_report:       !!b?.completion_report_path,
        report_url:       b?.completion_report_path
                            ? (b.completion_report_path.startsWith('/uploads')
                              ? b.completion_report_path
                              : `/uploads/${b.completion_report_path}`)
                            : null,
        expense_file_url: b?.expense_file_path
                            ? (b.expense_file_path.startsWith('/uploads')
                              ? b.expense_file_path
                              : `/uploads/${b.expense_file_path}`)
                            : null,
      };
    });

    const billedCount    = workers.filter(w => w.has_billed).length;
    const totalCharged   = workers.reduce((a, w) => a + (w.charged_amount || 0), 0);
    const allBilled      = workers.length > 0 && billedCount === workers.length;

    let billing_state;
    if (ticket.warranty_status === 'in_warranty')   billing_state = 'warranty';
    else if (workers.length === 0)                  billing_state = 'unassigned';
    else if (billedCount === 0)                     billing_state = 'not_billed';
    else if (allBilled)                             billing_state = 'fully_billed';
    else                                            billing_state = 'partially_billed';

    res.json({
      ticket_status:    ticket.status,
      warranty_status:  ticket.warranty_status,
      billing_state,
      worker_count:     workers.length,
      billed_count:     billedCount,
      total_charged:    +totalCharged.toFixed(2),
      workers,
    });
  } catch (e) {
    console.error('Billing status error:', e);
    res.status(500).json({ error: e.message });
  }
});



/* ════════════════════════════════════════════════════════════════════
   PHASE 2 — BACKEND ROUTES
   Cess Engineering Service Module

   HOW TO APPLY (serviceTickets.js):
   1. Paste the big "NEW ROUTES" block (everything between the two
      banner lines below) into serviceTickets.js, immediately ABOVE the
      final  `module.exports = router;`  line.
   2. REPLACE your existing `/:id/complete` route with the new version
      given in PART B further down (it now gates on the completion report
      for workers instead of charged_amount).
   3. serviceProfitability.js — apply the small expense edit in PART C.

   No other changes. All patterns match your file:
   svcAuth(), req.svcUser, req.io, multer `upload`, ON CONFLICT upserts.
   ════════════════════════════════════════════════════════════════════ */


/* ╔══════════════════════════════════════════════════════════════════╗
   ║  PART A — NEW ROUTES  (paste above module.exports = router;)       ║
   ╚══════════════════════════════════════════════════════════════════╝ */

/* ════════════════════════════════════════════════════════════ */
/* ─── SCHEDULED TASKS (admin/superadmin) ─── */
/* ════════════════════════════════════════════════════════════ */

// CREATE — linked to a ticket
router.post('/scheduled-tasks', svcAuth(['admin','superadmin']), async (req, res) => {
  const { ticket_id, title, notes, due_date } = req.body;
  if (!ticket_id || !title?.trim() || !due_date) {
    return res.status(400).json({ error: 'ticket_id, title and due_date are required' });
  }
  try {
    // Ensure the ticket exists
    const { rows: tk } = await pool.query(`SELECT id FROM service_tickets WHERE id=$1`, [ticket_id]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await pool.query(
      `INSERT INTO scheduled_tasks (ticket_id, title, notes, due_date, created_by)
       VALUES ($1::uuid, $2, $3, $4::date, $5::uuid)
       RETURNING *`,
      [ticket_id, title.trim(), notes || null, due_date, req.svcUser.id]);

    // Notify everyone (dashboards listen for new scheduled tasks)
    req.io?.emit('scheduled:created', { id: rows[0].id, ticket_id, title: title.trim(), due_date });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Scheduled task create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// LIST — with optional status filter (All / pending / in_process / completed)
// Returns ticket info joined in so dashboards can show ticket code + customer.
router.get('/scheduled-tasks', svcAuth(), async (req, res) => {
  const { status, ticket_id } = req.query;
  const where = []; const args = []; let n = 1;
  if (status && status !== 'All') { where.push(`st.status=$${n++}`); args.push(status); }
  if (ticket_id)                  { where.push(`st.ticket_id=$${n++}`); args.push(ticket_id); }
  const sql = `
    SELECT st.*,
           t.ticket_id     AS ticket_no,
           t.customer_name,
           t.status        AS ticket_status,
           cu.name         AS created_by_name,
           (st.due_date - CURRENT_DATE) AS days_until_due
      FROM scheduled_tasks st
      JOIN service_tickets t  ON t.id = st.ticket_id
      LEFT JOIN service_users cu ON cu.id = st.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY st.due_date ASC, st.created_at DESC`;
  try {
    const { rows } = await pool.query(sql, args);
    res.json(rows);
  } catch (e) {
    console.error('Scheduled task list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// REMINDERS — tasks due within the next 3 days (inclusive), not completed.
// Shown on dashboards + assign page across all roles.
router.get('/scheduled-tasks/reminders', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT st.*,
              t.ticket_id AS ticket_no,
              t.customer_name,
              (st.due_date - CURRENT_DATE) AS days_until_due
         FROM scheduled_tasks st
         JOIN service_tickets t ON t.id = st.ticket_id
        WHERE st.status <> 'completed'
          AND st.due_date <= CURRENT_DATE + INTERVAL '3 days'
        ORDER BY st.due_date ASC`);
    res.json(rows);
  } catch (e) {
    console.error('Scheduled reminders error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/scheduled-tasks/:taskId', svcAuth(), async (req, res) => {
  const { title, notes, due_date, status } = req.body;
  if (status && !['pending','in_process','completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
 
  const isPrivileged = ['admin','superadmin'].includes(req.svcUser.role);
 
  try {
    // Workers can only flip status, and only on tickets they're assigned to.
    if (!isPrivileged) {
      if (title || notes || due_date) {
        return res.status(403).json({ error: 'Only admins can edit task details. You may only change status.' });
      }
      if (!status) {
        return res.status(400).json({ error: 'No changes provided' });
      }
      // Verify the worker is assigned to this task's ticket
      const { rows: ok } = await pool.query(
        `SELECT 1
           FROM scheduled_tasks st
           JOIN ticket_assignments ta
             ON ta.ticket_id = st.ticket_id AND ta.worker_id = $1::uuid
          WHERE st.id = $2::uuid`,
        [req.svcUser.id, req.params.taskId]);
      if (!ok.length) return res.status(403).json({ error: 'Not allowed for this task' });
    }
 
    const { rows } = await pool.query(
      `UPDATE scheduled_tasks SET
         title      = COALESCE($1, title),
         notes      = COALESCE($2, notes),
         due_date   = COALESCE($3::date, due_date),
         status     = COALESCE($4, status),
         updated_at = NOW()
       WHERE id = $5::uuid
       RETURNING *`,
      [title ?? null, notes ?? null, due_date ?? null, status ?? null, req.params.taskId]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    req.io?.emit('scheduled:updated', { id: rows[0].id, status: rows[0].status });
    res.json(rows[0]);
  } catch (e) {
    console.error('Scheduled task update error:', e);
    res.status(500).json({ error: e.message });
  }
});


// DELETE (admin/superadmin)
router.delete('/scheduled-tasks/:taskId', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM scheduled_tasks WHERE id = $1::uuid RETURNING id`,
      [req.params.taskId]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    req.io?.emit('scheduled:deleted', { id: rows[0].id });
    res.json({ ok: true });
  } catch (e) {
    console.error('Scheduled task delete error:', e);
    res.status(500).json({ error: e.message });
  }
});
 


/* ════════════════════════════════════════════════════════════ */
/* ─── TICKET CHALLANS (multiple per ticket) ─── */
/*     Invoice stays single on service_tickets.invoice_no.       */
/*     Editable by worker / admin / superadmin.                  */
/* ════════════════════════════════════════════════════════════ */

// LIST
router.get('/:id/challans', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tc.*, su.name AS added_by_name
         FROM ticket_challans tc
         LEFT JOIN service_users su ON su.id = tc.added_by
        WHERE tc.ticket_id = $1
        ORDER BY tc.created_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (e) {
    console.error('Challan list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ADD a challan — number optional + file optional, but at least ONE required.
router.post('/:id/challans', svcAuth(), upload.single('file'), async (req, res) => {
  const challan_no = req.body.challan_no?.toString().trim() || null;
  const note       = req.body.note?.toString().trim() || null;
  if (!challan_no && !req.file) {
    return res.status(400).json({ error: 'Add a challan number or attach a file (at least one).' });
  }
  try {
    const { rows: tk } = await pool.query(`SELECT id FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
 
    const fileUrl  = req.file ? `/uploads/${req.file.filename}` : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : null;
 
    const { rows } = await pool.query(
      `INSERT INTO ticket_challans
         (ticket_id, challan_no, note, file_url, file_name, file_size, added_by, added_role)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8)
       RETURNING *`,
      [req.params.id, challan_no, note, fileUrl, fileName, fileSize, req.svcUser.id, req.svcUser.role]);
 
    // Notify everyone viewing the ticket (admins + the assigned workers)
    req.io?.to('admins').emit('challan:added', { ticket_id: req.params.id, challan_no });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Challan add error:', e);
    res.status(500).json({ error: e.message });
  }
});

// EDIT a challan — update number/note, and optionally replace the file.
router.patch('/:id/challans/:challanId', svcAuth(), upload.single('file'), async (req, res) => {
  const challan_no = req.body.challan_no?.toString().trim() || null;
  const note       = req.body.note?.toString().trim() ?? null;
  try {
    // If a new file came in, use it; otherwise keep existing (COALESCE on NULLs).
    const fileUrl  = req.file ? `/uploads/${req.file.filename}` : null;
    const fileName = req.file ? req.file.originalname : null;
    const fileSize = req.file ? req.file.size : null;
 
    const { rows } = await pool.query(
      `UPDATE ticket_challans SET
         challan_no = $1,
         note       = $2,
         file_url   = COALESCE($3, file_url),
         file_name  = COALESCE($4, file_name),
         file_size  = COALESCE($5, file_size),
         updated_at = NOW()
        WHERE id = $6::uuid AND ticket_id = $7::uuid
        RETURNING *`,
      [challan_no, note, fileUrl, fileName, fileSize, req.params.challanId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Challan not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Challan edit error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE a challan — any logged-in user (per your answer: worker can edit/delete).
router.delete('/:id/challans/:challanId', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM ticket_challans WHERE id=$1 AND ticket_id=$2 RETURNING file_url`,
      [req.params.challanId, req.params.id]);
    // Best-effort: remove the file from disk if present
    if (rows[0]?.file_url) {
      const fp = path.join(UPLOAD_DIR, path.basename(rows[0].file_url));
      fs.unlink(fp, () => {});
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('Challan delete error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* ════════════════════════════════════════════════════════════ */
/* ─── TICKET NOTES (collaborative thread) ─── */
/* ════════════════════════════════════════════════════════════ */

// LIST notes (author name + body + time)
router.get('/:id/notes', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tn.id, tn.body, tn.created_at,
              tn.author_id, su.name AS author_name, su.role AS author_role
         FROM ticket_notes tn
         LEFT JOIN service_users su ON su.id = tn.author_id
        WHERE tn.ticket_id = $1
        ORDER BY tn.created_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (e) {
    console.error('Notes list error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  PART B — REPLACE the existing POST /:id/notes route with this.   ║
   ║                                                                    ║
   ║  Mention syntax in the body:                                       ║
   ║    @[Display Name](user-uuid)        → single user                 ║
   ║    @[Everyone on this ticket](everyone)  → broadcast               ║
   ║                                                                    ║
   ║  The frontend MentionInput will emit these tokens. The route:     ║
   ║   1. Validates each user-uuid is in the eligible audience for     ║
   ║      this ticket (admin/superadmin/assigned). Invalid tokens are  ║
   ║      kept as plain text in the body but DON'T create notifications.║
   ║   2. Records mentions in note_mentions.                            ║
   ║   3. Creates notifications via notify() helper (which also emits  ║
   ║      the socket event the bell + toast listen to).                ║
   ║   4. @everyone fans out to ALL eligible users EXCEPT the sender.  ║
   ║      Individual @self is allowed and notifies the sender.         ║
   ╚══════════════════════════════════════════════════════════════════╝ */
 
/* ════════════════════════════════════════════════════════════════════
   DEBUG VERSION of POST /:id/notes — replaces the previous Chunk-2 
   version. Logs to the SERVER CONSOLE so we can see exactly what's 
   being computed. After this debug session we'll restore a clean copy.
   
   What you'll see in your `npm run dev` terminal after each note POST:
     [notes:debug] svcUser.id       = <should be sender's uuid>
     [notes:debug] body             = <raw note body>
     [notes:debug] parsed userIds   = [..., ...]
     [notes:debug] parsed everyone  = true/false
     [notes:debug] audience.ids     = [..., ...]
     [notes:debug] eligible.has(X)  = true/false for each parsed uid
     [notes:debug] individualMentions = [...]
     [notes:debug] everyoneMentions   = [...]
   ════════════════════════════════════════════════════════════════════ */

router.post('/:id/notes', svcAuth(), async (req, res) => {
  const body = req.body.body?.toString().trim();
  if (!body) return res.status(400).json({ error: 'Note body is required' });

  try {
    console.log('---- [notes:debug] START ----');
    console.log('[notes:debug] req.svcUser =', JSON.stringify(req.svcUser));
    console.log('[notes:debug] body        =', body);

    const isPrivileged = ['admin','superadmin'].includes(req.svcUser.role);
    if (!isPrivileged) {
      const { rows: assigned } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [req.params.id, req.svcUser.id]);
      if (!assigned.length) return res.status(403).json({ error: 'You are not assigned to this ticket' });
    }

    const { rows: tkRows } = await pool.query(
      `SELECT id, ticket_id AS ticket_no, customer_name FROM service_tickets WHERE id=$1`,
      [req.params.id]);
    if (!tkRows.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tkRows[0];

    const tokenRe = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const userIds  = new Set();
    let everyone   = false;
    let m;
    while ((m = tokenRe.exec(body)) !== null) {
      const id = m[2].trim();
      console.log('[notes:debug] token name=' + m[1] + ' id=' + id);
      if (id === 'everyone') everyone = true;
      else if (/^[0-9a-f-]{36}$/i.test(id)) userIds.add(id);
      else console.log('[notes:debug]   → REJECTED (not uuid or everyone)');
    }
    console.log('[notes:debug] parsed userIds =', [...userIds]);
    console.log('[notes:debug] parsed everyone =', everyone);

    const { rows: audience } = await pool.query(
      `SELECT DISTINCT su.id, su.name
         FROM service_users su
        WHERE su.is_active = TRUE
          AND (
            su.role IN ('admin','superadmin')
            OR EXISTS (
              SELECT 1 FROM ticket_assignments ta
               WHERE ta.ticket_id = $1::uuid AND ta.worker_id = su.id
            )
          )`,
      [ticket.id]);
    console.log('[notes:debug] audience rows =', audience.length);
    audience.forEach(a => console.log('  audience[]:', a.id, '·', a.name, '· typeof id =', typeof a.id));
    const eligible = new Set(audience.map(a => a.id));

    console.log('[notes:debug] eligible Set size =', eligible.size);
    for (const uid of userIds) {
      console.log('[notes:debug]   eligible.has(' + uid + ') =', eligible.has(uid));
    }

    const { rows: noteRows } = await pool.query(
      `INSERT INTO ticket_notes (ticket_id, author_id, body)
       VALUES ($1::uuid, $2::uuid, $3) RETURNING *`,
      [req.params.id, req.svcUser.id, body]);
    const note = { ...noteRows[0], author_name: req.svcUser.name, author_role: req.svcUser.role };

    const individualMentions = [...userIds].filter(uid => eligible.has(uid));
    const individualSet = new Set(individualMentions);

    console.log('[notes:debug] individualMentions =', individualMentions);

    let everyoneMentions = [];
    if (everyone) {
      everyoneMentions = [...eligible].filter(uid => {
        const isSender = uid === req.svcUser.id;
        const alreadyIndividual = individualSet.has(uid);
        console.log('  everyone filter uid=' + uid + ' isSender=' + isSender + ' alreadyIndividual=' + alreadyIndividual);
        return !isSender && !alreadyIndividual;
      });
    }
    console.log('[notes:debug] everyoneMentions =', everyoneMentions);

    const allMentioned = [
      ...individualMentions.map(uid => ({ uid, is_everyone: false })),
      ...everyoneMentions.map(uid   => ({ uid, is_everyone: true  })),
    ];
    console.log('[notes:debug] allMentioned total =', allMentioned.length);

    if (allMentioned.length) {
      const values = [];
      const params = [];
      let n = 1;
      for (const am of allMentioned) {
        values.push(`($${n++}::uuid, $${n++}::uuid, $${n++})`);
        params.push(note.id, am.uid, am.is_everyone);
      }
      await pool.query(
        `INSERT INTO note_mentions (note_id, user_id, is_everyone)
         VALUES ${values.join(', ')}
         ON CONFLICT (note_id, user_id) DO NOTHING`,
        params);

      const cleanPreview = body.replace(/@\[([^\]]+)\]\(([^)]+)\)/g, (_, name) => `@${name}`).slice(0, 140);
      const link = `/service/admin/tickets/${ticket.ticket_no}`;

      console.log('[notes:debug] calling notify() for', allMentioned.length, 'recipients');
      await notify(req.io, {
        recipientIds: allMentioned.map(am => am.uid),
        type:    'note_mention',
        title:   `${req.svcUser.name} mentioned you`,
        body:    cleanPreview,
        link,
        context: {
          ticket_id: ticket.id, ticket_no: ticket.ticket_no, customer: ticket.customer_name,
          note_id: note.id, actor_id: req.svcUser.id, actor_name: req.svcUser.name, was_everyone: everyone,
        },
      });
    } else {
      console.log('[notes:debug] no notifications to send');
    }

    req.io?.to('admins').emit('note:added', { ticket_id: req.params.id, note });
    console.log('---- [notes:debug] END ----');

    res.status(201).json(note);
  } catch (e) {
    console.error('Note add error:', e);
    res.status(500).json({ error: e.message });
  }
});



// Example signature: router.post('/:id/worker-completion', svcAuth(['plc','wireman']), upload.fields([{ name: 'report', maxCount: 1 }, { name: 'expense_file', maxCount: 1 }]), async (req, res) => { ... })
router.post('/:id/worker-completion', svcAuth(['plc','wireman']), upload.fields([{ name: 'report', maxCount: 1 }, { name: 'expense_file', maxCount: 1 }]), async (req, res) => {
  try {
    const ticketId = req.params.id;
    const workerId = req.svcUser.id;
    const expense  = req.body.expense_amount != null ? Number(req.body.expense_amount) : 0;
    const note     = req.body.expense_note?.toString().trim() || null;
 
    if (!req.files?.report?.[0])  return res.status(400).json({ error: 'Completion report file is required' });
    if (isNaN(expense) || expense < 0) return res.status(400).json({ error: 'Invalid expense amount' });
 
    // 1) Confirm assignment + fetch ticket + creator
    const { rows: tk } = await pool.query(
      `SELECT id, ticket_id AS ticket_no, customer_name, status, warranty_status, created_by
         FROM service_tickets WHERE id=$1`, [ticketId]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tk[0];
 
    const { rows: assigned } = await pool.query(
      `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
      [ticketId, workerId]);
    if (!assigned.length) return res.status(403).json({ error: 'Not assigned to this ticket' });
 
    if (!['In Progress','Assigned','Open'].includes(ticket.status)) {
      return res.status(400).json({ error: `Cannot submit report from status "${ticket.status}"` });
    }
 
    const reportPath      = `/uploads/${req.files.report[0].filename}`;
    const expenseFilePath = req.files?.expense_file?.[0] ? `/uploads/${req.files.expense_file[0].filename}` : null;
 
    // 2) Upsert this worker's billing row with expense + report
    await pool.query(
      `INSERT INTO ticket_worker_billing
         (ticket_id, worker_id, expense_amount, expense_note, completion_report_path, expense_file_path, completed_by_worker_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, NOW())
       ON CONFLICT (ticket_id, worker_id) DO UPDATE
         SET expense_amount         = EXCLUDED.expense_amount,
             expense_note           = EXCLUDED.expense_note,
             completion_report_path = EXCLUDED.completion_report_path,
             expense_file_path      = COALESCE(EXCLUDED.expense_file_path, ticket_worker_billing.expense_file_path),
             completed_by_worker_at = NOW()`,
      [ticketId, workerId, expense, note, reportPath, expenseFilePath]);
 
    // 3) Flip ticket to 'Report Submitted'
    const { rows: updated } = await pool.query(
      `UPDATE service_tickets
          SET status='Report Submitted', updated_at=NOW()
        WHERE id=$1
        RETURNING *`, [ticketId]);
 
    // 4) Notify the creator (and any superadmins, optionally — for now creator only)
    if (ticket.created_by) {
      await notify(req.io, {
        recipientIds: [ticket.created_by],
        type:    'report_submitted',
        title:   `${req.svcUser.name} submitted a completion report`,
        body:    `${ticket.ticket_no} · ${ticket.customer_name}${expense > 0 ? ` · expense ₹${expense}` : ''}`,
        link:    `/service/admin/tickets/${ticket.ticket_no}`,
        context: {
          ticket_id:  ticket.id,
          ticket_no:  ticket.ticket_no,
          customer:   ticket.customer_name,
          actor_id:   workerId,
          actor_name: req.svcUser.name,
          expense_amount: expense,
        },
      });
    }
 
    // 5) Broadcast to admins
    req.io?.to('admins').emit('ticket:report-submitted', {
      ticket_id: ticket.id, ticket_no: ticket.ticket_no, worker_id: workerId,
    });
 
    res.json(updated[0]);
  } catch (e) {
    console.error('worker-completion error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* ════════════════════════════════════════════════════════════ */
/* ─── ADMIN/SUPERADMIN — enter the CHARGE for a worker ─── */
/*     Separate from worker expense. Rate Card button is a       */
/*     frontend concern (Phase 3); this just records the charge. */
/* ════════════════════════════════════════════════════════════ */
router.patch('/:id/worker-billing/:workerId/charge', svcAuth(['admin','superadmin']), async (req, res) => {
  const { charged_amount, charged_note } = req.body;
  if (charged_amount === undefined || charged_amount === null) {
    return res.status(400).json({ error: 'charged_amount is required' });
  }
  const amount = Number(charged_amount);
  if (isNaN(amount) || amount < 0) {
    return res.status(400).json({ error: 'charged_amount must be non-negative' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO ticket_worker_billing
         (ticket_id, worker_id, charged_amount, charged_note, charge_entered_by, charge_entered_at)
       VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5::uuid, NOW())
       ON CONFLICT (ticket_id, worker_id)
       DO UPDATE SET
         charged_amount    = EXCLUDED.charged_amount,
         charged_note      = COALESCE(EXCLUDED.charged_note, ticket_worker_billing.charged_note),
         charge_entered_by = EXCLUDED.charge_entered_by,
         charge_entered_at = NOW()
       RETURNING *`,
      [req.params.id, req.params.workerId, amount, charged_note || null, req.svcUser.id]);
    res.json(rows[0]);
  } catch (e) {
    console.error('Charge entry error:', e);
    res.status(500).json({ error: e.message });
  }
});



router.patch('/:id/reopen', svcAuth(['admin','superadmin']), async (req, res) => {
  const reason = req.body.reason?.toString().trim();
  if (!reason) return res.status(400).json({ error: 'A reason is required to reopen a ticket.' });
 
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
 
    const { rows: tk } = await client.query(
      `SELECT id, status, created_by FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!tk.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Ticket not found' }); }
 
    // Row-level gate
    const isCreator    = tk[0].created_by === req.svcUser.id;
    const isSuperadmin = req.svcUser.role === 'superadmin';
    if (!isCreator && !isSuperadmin) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only the ticket creator or a superadmin can reopen this ticket' });
    }
 
    if (!['Closed','Completed'].includes(tk[0].status)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Only Closed tickets can be reopened' });
    }
    const prevStatus = tk[0].status;
 
    await client.query(
      `INSERT INTO ticket_reopens (ticket_id, reason, prev_status, reopened_by)
       VALUES ($1::uuid, $2, $3, $4::uuid)`,
      [req.params.id, reason, prevStatus, req.svcUser.id]);
 
    const { rows } = await client.query(
      `UPDATE service_tickets SET
         status       = 'In Progress',
         reopen_count = reopen_count + 1,
         reopened_at  = NOW(),
         reopened_by  = $1::uuid,
         closed_at    = NULL,
         closed_by    = NULL,
         updated_at   = NOW()
       WHERE id = $2::uuid
       RETURNING *`,
      [req.svcUser.id, req.params.id]);
 
    await client.query('COMMIT');
    req.io?.emit('ticket:reopened', {
      ticket_id:    req.params.id,
      reason,
      prev_status:  prevStatus,
      reopened_by:  { id: req.svcUser.id, name: req.svcUser.name },
    });
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Reopen error:', e);
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
 

// GET /tickets/:id/full
// :id is either a UUID or a human ticket number (e.g. SE0004).
router.get('/:id/full', svcAuth(), async (req, res) => {
  try {
    const idParam = req.params.id;
    // Detect UUID vs human ticket number. UUIDs always have dashes; ticket
    // numbers are like "SE0004". Be liberal: try UUID first, fall back to
    // ticket_id match if it looks like a number-style code.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
 
    // 1) Resolve to internal UUID
    const lookup = isUUID
      ? await pool.query(`SELECT id FROM service_tickets WHERE id = $1::uuid`, [idParam])
      : await pool.query(`SELECT id FROM service_tickets WHERE ticket_id = $1`, [idParam]);
    if (!lookup.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const id = lookup.rows[0].id;
 
    // 2) If the caller is a worker, enforce assignment
    const role = req.svcUser.role;
    if (role === 'plc' || role === 'wireman') {
      const { rows: ok } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [id, req.svcUser.id]);
      if (!ok.length) return res.status(403).json({ error: 'You are not assigned to this ticket' });
    }
 
    // 3) Fan-out the related data (same shape as before, plus joined names)
    const [ticket, assignments, sessions, billing, challans, notes, documents] = await Promise.all([
      pool.query(`SELECT * FROM service_tickets WHERE id=$1`, [id]),
      pool.query(
        `SELECT ta.*, su.name AS worker_name, su.role AS worker_role, su.seniority AS worker_seniority
           FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
          WHERE ta.ticket_id=$1`, [id]),
      pool.query(
        `SELECT ws.*, su.name AS worker_name
           FROM work_sessions ws JOIN service_users su ON su.id=ws.worker_id
          WHERE ws.ticket_id=$1 ORDER BY ws.started_at DESC`, [id]),
      pool.query(
        `SELECT twb.*, su.name AS worker_name
           FROM ticket_worker_billing twb JOIN service_users su ON su.id=twb.worker_id
          WHERE twb.ticket_id=$1`, [id]),
      pool.query(
        `SELECT tc.*, su.name AS added_by_name
           FROM ticket_challans tc LEFT JOIN service_users su ON su.id=tc.added_by
          WHERE tc.ticket_id=$1 ORDER BY tc.created_at ASC`, [id]),
      pool.query(
        `SELECT tn.*, su.name AS author_name, su.role AS author_role
           FROM ticket_notes tn LEFT JOIN service_users su ON su.id=tn.author_id
          WHERE tn.ticket_id=$1 ORDER BY tn.created_at ASC`, [id]),
      pool.query(`SELECT * FROM ticket_documents WHERE ticket_id=$1 ORDER BY uploaded_at DESC`, [id]),
    ]);
 
    // 4) Build the comma-joined team name strings the dashboards expect
    const tk = ticket.rows[0];
    const plcNames = assignments.rows
      .filter(a => a.worker_role === 'plc')
      .map(a => a.worker_name);
    const wmNames  = assignments.rows
      .filter(a => a.worker_role === 'wireman')
      .map(a => a.worker_name);
    tk.plc_worker_names     = plcNames.join(', ');
    tk.wireman_worker_names = wmNames.join(', ');
 
    const toUrl = (p) => !p ? null : p.startsWith('/uploads') ? p : `/uploads/${p}`;
    const billingMapped = billing.rows.map(b => ({
      ...b,
      report_url:       toUrl(b.completion_report_path),
      expense_file_url: toUrl(b.expense_file_path),
    }));
    res.json({
      ticket:      tk,
      assignments: assignments.rows,
      sessions:    sessions.rows,
      billing:     billingMapped,
      challans:    challans.rows,
      notes:       notes.rows,
      documents:   documents.rows,
    });
  } catch (e) {
    console.error('Full ticket fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});
 

/* ─── GET /:id/reopens — full reopen history ─── */
/* Visible to anyone who can see the ticket (workers + admins).             */
router.get('/:id/reopens', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.id, tr.reason, tr.prev_status, tr.reopened_at,
              tr.reopened_by, su.name AS reopened_by_name, su.role AS reopened_by_role
         FROM ticket_reopens tr
         LEFT JOIN service_users su ON su.id = tr.reopened_by
        WHERE tr.ticket_id = $1
        ORDER BY tr.reopened_at DESC`,
      [req.params.id]);
    res.json(rows);
  } catch (e) {
    console.error('Reopen list error:', e);
    res.status(500).json({ error: e.message });
  }
});



// GET /tickets/:id/rate-suggestion
// For each assigned worker, returns the rate-card suggested amount + the
// worker's submitted expense/report, so admin can enter the customer charge.
router.get('/:id/rate-suggestion', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    // 1. Ticket (with the billing fields the formula needs)
    const { rows: tk } = await pool.query(
      `SELECT id, ticket_id, customer_grade, billing_location, billing_mode,
              override_rate, warranty_status
         FROM service_tickets WHERE id = $1`, [req.params.id]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tk[0];
 
    // 2. Active pricing rows (same source as the reports)
    const { rows: pricingRows } = await pool.query(`SELECT * FROM service_pricing WHERE active=TRUE`);
 
    // 3. Assigned workers (one row per unique worker, even if assigned in both roles)
    //    + hours worked on this ticket + their billing/expense
    const { rows: workers } = await pool.query(
      `WITH assigned AS (
         SELECT worker_id, MIN(role) AS assigned_role
           FROM ticket_assignments
          WHERE ticket_id = $1
          GROUP BY worker_id
       )
       SELECT su.id AS worker_id, su.name AS worker_name, su.role AS worker_role,
              su.seniority AS worker_seniority, a.assigned_role,
              COALESCE((
                SELECT SUM(CASE WHEN ws.status='running'
                                THEN ws.total_seconds + EXTRACT(EPOCH FROM (NOW() - ws.started_at))::int
                                ELSE ws.total_seconds END)
                  FROM work_sessions ws
                 WHERE ws.ticket_id = $1 AND ws.worker_id = su.id
              ), 0) AS total_seconds,
              twb.charged_amount, twb.charged_note,
              twb.expense_amount, twb.expense_note,
              twb.completion_report_path, twb.expense_file_path, twb.completed_by_worker_at
         FROM assigned a
         JOIN service_users su ON su.id = a.worker_id
         LEFT JOIN ticket_worker_billing twb
                ON twb.ticket_id = $1 AND twb.worker_id = su.id
        ORDER BY su.name`,
      [req.params.id]);
 
    const isWarranty = ticket.warranty_status === 'in_warranty';
 
    const result = workers.map(w => {
      const hours   = (Number(w.total_seconds) || 0) / 3600;
      // Pricing uses the ROLE THEY WERE ASSIGNED AS on this ticket
      const pricing = profit.pickPricing(
        { role: w.assigned_role || w.worker_role, seniority: w.worker_seniority },
        ticket, pricingRows);
      const suggested = isWarranty ? 0 : profit.computeRevenue(ticket, pricing, hours);
 
      // Describe the basis so admin knows where the number came from
      let basis;
      if (isWarranty)                       basis = 'Warranty — no charge';
      else if (ticket.override_rate)        basis = 'Override rate';
      else if (ticket.billing_mode === 'half_day')   basis = 'Half-day rate';
      else if (ticket.billing_mode === 'grade_rate') basis = `Grade ${String(ticket.customer_grade||'B').toUpperCase()} rate`;
      else if (hours > 0 && hours <= 4)     basis = 'Auto half-day (≤4h)';
      else                                  basis = 'Per-day rate';
 
      return {
        worker_id:        w.worker_id,
        worker_name:      w.worker_name,
        worker_role:      w.worker_role,
        worker_seniority: w.worker_seniority,
        assigned_role:    w.assigned_role,
        hours:            +hours.toFixed(2),
        suggested_amount: Math.round(suggested),
        basis,
        // worker-submitted info for admin context:
        charged_amount:   w.charged_amount != null ? Number(w.charged_amount) : null,
        charged_note:     w.charged_note || null,
        expense_amount:   w.expense_amount != null ? Number(w.expense_amount) : 0,
        expense_note:     w.expense_note || null,
        completed_at:     w.completed_by_worker_at || null,
        expense_file_url: w.expense_file_path
                            ? (w.expense_file_path.startsWith('/uploads')
                              ? w.expense_file_path
                              : `/uploads/${w.expense_file_path}`)
                            : null,
        report_url:       w.completion_report_path
                            ? (w.completion_report_path.startsWith('/uploads')
                                ? w.completion_report_path
                                : `/uploads/${w.completion_report_path}`)
                            : null,
      };
    });
 
    res.json({ ticket_id: ticket.id, is_warranty: isWarranty, workers: result });
  } catch (e) {
    console.error('Rate suggestion error:', e);
    res.status(500).json({ error: e.message });
  }
});
 

/* ╔══════════════════════════════════════════════════════════════════╗
   ║  PART A — Mention suggestions for the typeahead dropdown.         ║
   ║                                                                    ║
   ║  GET /tickets/:id/mention-suggestions?q=md&limit=8                 ║
   ║                                                                    ║
   ║  Returns @everyone (when q is empty) + users who can see the      ║
   ║  ticket (admins + superadmins + assigned workers), filtered by    ║
   ║  case-insensitive name substring match, capped at limit.          ║
   ╚══════════════════════════════════════════════════════════════════╝ */
 
/* ════════════════════════════════════════════════════════════════════
   FIX for the mention-suggestions endpoint.
   
   Bug: when the URL ID is a UUID, the query `WHERE id=$1::uuid OR
   ticket_id=$1` makes Postgres try to compare a varchar column to
   a uuid value, which fails with:
     "operator does not exist: character varying = uuid"
   
   Fix: detect UUID vs ticket_no in JS like /:id/full does, and choose
   the right column. REPLACE the existing GET /:id/mention-suggestions
   route with this version.
   ════════════════════════════════════════════════════════════════════ */

router.get('/:id/mention-suggestions', svcAuth(), async (req, res) => {
  const q     = (req.query.q || '').toString().trim();
  const limit = Math.min(Number(req.query.limit) || 8, 20);

  try {
    // Resolve ticket UUID — accept either UUID or human ticket number
    const idParam = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
    const lookup = isUUID
      ? await pool.query(`SELECT id FROM service_tickets WHERE id = $1::uuid`, [idParam])
      : await pool.query(`SELECT id FROM service_tickets WHERE ticket_id = $1`, [idParam]);
    if (!lookup.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticketId = lookup.rows[0].id;

    // Worker access — must be assigned
    const role = req.svcUser.role;
    if (role === 'plc' || role === 'wireman') {
      const { rows: ok } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [ticketId, req.svcUser.id]);
      if (!ok.length) return res.status(403).json({ error: 'Not allowed' });
    }

    // Eligible audience
    const { rows: users } = await pool.query(
      `SELECT DISTINCT su.id, su.name, su.role, su.phone
         FROM service_users su
        WHERE su.is_active = TRUE
          AND (
            su.role IN ('admin','superadmin')
            OR EXISTS (
              SELECT 1 FROM ticket_assignments ta
               WHERE ta.ticket_id = $1::uuid AND ta.worker_id = su.id
            )
          )
          ${q ? `AND su.name ILIKE $2` : ''}
        ORDER BY su.name ASC
        LIMIT ${limit}`,
      q ? [ticketId, `%${q}%`] : [ticketId]);

    const suggestions = [];

    // @everyone only when no query — keeps filtered results clean
    if (!q) {
      const { rows: cnt } = await pool.query(
        `SELECT COUNT(DISTINCT su.id)::int AS n
           FROM service_users su
          WHERE su.is_active = TRUE
            AND (su.role IN ('admin','superadmin')
                 OR EXISTS (
                   SELECT 1 FROM ticket_assignments ta
                    WHERE ta.ticket_id = $1::uuid AND ta.worker_id = su.id
                 ))`,
        [ticketId]);
      suggestions.push({
        id:       'everyone',
        kind:     'everyone',
        name:     'Everyone on this ticket',
        sublabel: `${cnt[0].n} ${cnt[0].n === 1 ? 'person' : 'people'}`,
        role:     null,
        phone:    null,
      });
    }
    for (const u of users) {
      suggestions.push({
        id:       u.id,
        kind:     'user',
        name:     u.name,
        sublabel: u.role + (u.phone ? ` · ${u.phone}` : ''),
        role:     u.role,
        phone:    u.phone,
      });
    }
    res.json(suggestions);
  } catch (e) {
    console.error('mention-suggestions error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.get('/lookup-user/:userId', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, role, phone, department, is_active
         FROM service_users
        WHERE id = $1::uuid`,
      [req.params.userId]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('user lookup error:', e);
    res.status(500).json({ error: e.message });
  }
});
 

module.exports = router;