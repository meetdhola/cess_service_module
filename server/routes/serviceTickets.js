const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');
const svcPerm = require('../middleware/servicePermission');
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

/* ─── POST /api/service/tickets — create (PUBLIC inquiry form, optional auth) ─── */
router.post('/', async (req, res) => {
  const b = req.body;
  // Extract creator from token if logged-in user submits
  let creatorId = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET || 'cess_secret_2024');
      creatorId = decoded.id || null;
    } catch {}
  }
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
    // Validate PLC or wiring required
    if (!b.needs_plc && !b.needs_wiring) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'At least one of PLC Engineer or Wireman is required' });
    }
    const { rows } = await client.query(
      `INSERT INTO service_tickets
        (ticket_id, service_type, customer_name, address, description, priority,
         contact_name, contact_phone, designation, sales_agent,
         needs_plc, needs_wiring, plc_type,
         warranty_status, invoice_no, invoice_date, challan_no, challan_date, deadline_date, created_by, job_no)
       VALUES ($1,$2,$3,$4,$5,$6, $7,$8,$9,$10, $11,$12,$13, $14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [ticket_id, b.service_type, b.customer_name.trim(), b.address.trim(), b.description||null, b.priority||'Medium',
       b.contact_name||null, b.contact_phone||null, b.designation||null, b.sales_agent||null,
       !!b.needs_plc, !!b.needs_wiring, b.plc_type||null,
       b.warranty_status||'in_warranty',
       b.invoice_no||null, b.invoice_no?new Date():null,
       b.challan_no||null, b.challan_no?new Date():null,
       b.deadline_date||null, creatorId, b.job_no||null]
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
router.get('/', svcAuth(['admin','superadmin']), svcPerm('view_all_tickets'), async (req, res) => {
  const { status, priority, service_type, search, sales_agent, date_from, date_to } = req.query;
  const where = []; const args = []; let n = 1;
  if (status      && status      !== 'All') { where.push(`t.status=$${n++}`);       args.push(status); }
  if (priority    && priority    !== 'All') { where.push(`t.priority=$${n++}`);     args.push(priority); }
  if (service_type&& service_type!== 'All') { where.push(`t.service_type=$${n++}`); args.push(service_type); }
  if (sales_agent && sales_agent !== 'All') { where.push(`t.sales_agent=$${n++}`);  args.push(sales_agent); }
  if (date_from) { where.push(`(t.created_at AT TIME ZONE 'Asia/Kolkata')::date >= $${n++}`); args.push(date_from); }
  if (date_to)   { where.push(`(t.created_at AT TIME ZONE 'Asia/Kolkata')::date <= $${n++}`); args.push(date_to); }
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
      (SELECT COUNT(*)::int FROM ticket_documents WHERE ticket_id=t.id) AS doc_count,
      su.name AS created_by_name
    FROM service_tickets t
    LEFT JOIN service_users su ON su.id = t.created_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.created_at DESC LIMIT 500`;
  try { const { rows } = await pool.query(sql, args); res.json(rows); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── GET /api/service/tickets/my — worker's own tickets ─── */
router.get('/my', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  try {
    // Return ASSIGNED tickets for this worker PLUS any Open tickets
    // so any worker can pick up unassigned tickets
    const { rows } = await pool.query(
      `SELECT t.*,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='plc')     AS plc_worker_names,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='wireman') AS wireman_worker_names,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta2 JOIN service_users su ON su.id=ta2.worker_id
                 WHERE ta2.ticket_id=t.id AND ta2.role='plc'), '[]'::json) AS assigned_plcs,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta3 JOIN service_users su ON su.id=ta3.worker_id
                 WHERE ta3.ticket_id=t.id AND ta3.role='wireman'), '[]'::json) AS assigned_wiremen,
      (SELECT COUNT(*)::int FROM ticket_documents WHERE ticket_id=t.id) AS doc_count,
      EXISTS(SELECT 1 FROM ticket_assignments ta4 WHERE ta4.ticket_id=t.id AND ta4.worker_id=$1) AS is_assigned_to_me
    FROM service_tickets t
    WHERE (
      EXISTS(SELECT 1 FROM ticket_assignments ta5 WHERE ta5.ticket_id=t.id AND ta5.worker_id=$1)
      OR t.status = 'Open'
    )
    AND t.status NOT IN ('Closed','Completed')
    ORDER BY
      EXISTS(SELECT 1 FROM ticket_assignments ta6 WHERE ta6.ticket_id=t.id AND ta6.worker_id=$1) DESC,
      t.created_at DESC`, [req.svcUser.id]);
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

/* GET /api/service/tickets/party-contact — last contact for a company */
router.get('/party-contact', svcAuth(), async (req, res) => {
  const { name } = req.query;
  if (!name) return res.json({});
  try {
    const { rows } = await pool.query(
      `SELECT contact_name, contact_phone, designation
         FROM service_tickets
        WHERE customer_name ILIKE $1
          AND contact_name IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [name]);
    res.json(rows[0] || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/:id', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.*, su.name AS created_by_name
         FROM service_tickets t
         LEFT JOIN service_users su ON su.id = t.created_by
        WHERE t.id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── PATCH /api/service/tickets/:id/assign — multi-assign ─── */
router.patch('/:id/assign', svcAuth(['admin','superadmin']), svcPerm('assign_workers'), async (req, res) => {
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
router.patch('/:id/status', svcAuth(['admin','superadmin']), svcPerm('assign_workers'), async (req, res) => {
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
router.patch('/:id/complete', svcAuth(['plc','wireman','admin','superadmin']), svcPerm('start_timer'), async (req, res) => {
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

router.patch('/:id/close', svcAuth(['admin','superadmin']), svcPerm('close_ticket'), async (req, res) => {
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

router.patch('/:id/invoice', svcAuth(['admin','superadmin']), svcPerm('enter_billing'), async (req, res) => {
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
router.post('/:id/worker-billing', svcAuth(['plc','wireman','admin','superadmin']), svcPerm('upload_files'), async (req, res) => {
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
    // Get extra files from ticket_worker_files
    const { rows: extraFiles } = await pool.query(
      `SELECT * FROM ticket_worker_files WHERE ticket_id=$1 ORDER BY uploaded_at ASC`,
      [req.params.id]);

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
        all_report_files: (() => {
          const extras = (extraFiles||[]).filter(f=>f.worker_id===a.worker_id&&f.file_type==='report').map(f=>({ url:f.file_path.startsWith('/uploads')?f.file_path:`/uploads/${f.file_path}`, name:f.original_name||'Report' }));
          if (extras.length>0) return extras;
          return b?.completion_report_path ? [{ url:b.completion_report_path.startsWith('/uploads')?b.completion_report_path:`/uploads/${b.completion_report_path}`, name:'Report' }] : [];
        })(),
        all_expense_files: (() => {
          const extras = (extraFiles||[]).filter(f=>f.worker_id===a.worker_id&&f.file_type==='expense').map(f=>({ url:f.file_path.startsWith('/uploads')?f.file_path:`/uploads/${f.file_path}`, name:f.original_name||'Expense proof', amount:f.expense_amount }));
          if (extras.length>0) return extras;
          return b?.expense_file_path ? [{ url:b.expense_file_path.startsWith('/uploads')?b.expense_file_path:`/uploads/${b.expense_file_path}`, name:'Expense proof' }] : [];
        })(),
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
      final  `
/* PATCH /tickets/:id/plc-type */
router.patch('/:id/plc-type', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  const { plc_type } = req.body;
  if (!['site','remote'].includes(plc_type)) return res.status(400).json({ error: 'plc_type must be site or remote' });
  try {
    const { rows } = await pool.query(`UPDATE service_tickets SET plc_type=$1, updated_at=NOW() WHERE id=$2 RETURNING id, plc_type`, [plc_type, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    req.io?.to('admins').emit('ticket:updated', { ticket_id: req.params.id, plc_type });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* POST /tickets/:id/self-assign */
router.post('/:id/self-assign', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  try {
    const { rows: tk } = await pool.query(`SELECT id, status FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!tk.length) return res.status(404).json({ error: 'Not found' });
    if (!['Open','Assigned'].includes(tk[0].status)) return res.status(400).json({ error: 'Ticket not open' });
    await pool.query(`INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by) VALUES ($1,$2,$3,$2) ON CONFLICT DO NOTHING`, [req.params.id, req.svcUser.id, req.svcUser.role]);
    await pool.query(`UPDATE service_tickets SET status='Assigned', updated_at=NOW() WHERE id=$1 AND status='Open'`, [req.params.id]);
    req.io?.to('admins').emit('ticket:updated', { ticket_id: req.params.id });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* ─── GET /:id/rate-suggestion ─── */
/* Returns per-worker rate card suggestion + expense/report info  */
router.get('/:id/rate-suggestion', svcAuth(['admin','superadmin']), svcPerm('view_billing'), async (req, res) => {
  try {
    // Resolve UUID or human ticket number
    const idParam = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
    const lookup = isUUID
      ? await pool.query('SELECT id FROM service_tickets WHERE id=$1::uuid', [idParam])
      : await pool.query('SELECT id FROM service_tickets WHERE ticket_id=$1', [idParam]);
    if (!lookup.rows.length) return res.status(404).json({ error: 'Ticket not found' });
    const id = lookup.rows[0].id;

    // Ticket billing fields
    const { rows: tk } = await pool.query(
      `SELECT id, ticket_id, customer_grade, billing_location, billing_mode,
              override_rate, warranty_status
         FROM service_tickets WHERE id=$1`, [id]);
    if (!tk.length) return res.status(404).json({ error: 'Ticket not found' });
    const ticket = tk[0];

    // Pricing rows
    const { rows: pricingRows } = await pool.query(
      `SELECT * FROM service_pricing WHERE active=TRUE`);

    // Assigned workers + hours + billing info
    const { rows: workers } = await pool.query(
      `WITH assigned AS (
         SELECT worker_id, MIN(role) AS assigned_role
           FROM ticket_assignments WHERE ticket_id=$1 GROUP BY worker_id
       )
       SELECT su.id AS worker_id, su.name AS worker_name, su.role AS worker_role,
              su.seniority AS worker_seniority, su.daily_hours AS daily_hours,
              a.assigned_role,
              COALESCE((
                SELECT SUM(CASE WHEN ws.status='running'
                  THEN ws.total_seconds + EXTRACT(EPOCH FROM (NOW()-ws.started_at))::int
                  ELSE ws.total_seconds END)
                FROM work_sessions ws WHERE ws.ticket_id=$1 AND ws.worker_id=su.id
              ), 0) AS total_seconds,
              COALESCE((
                SELECT SUM(CASE WHEN ws.status='running'
                  THEN ws.total_seconds + EXTRACT(EPOCH FROM (NOW()-ws.started_at))::int
                  ELSE ws.total_seconds END)
                FROM work_sessions ws WHERE ws.ticket_id=$1 AND ws.worker_id=su.id
                AND ws.session_plc_type='onsite'
              ), 0) AS onsite_seconds,
              COALESCE((
                SELECT SUM(CASE WHEN ws.status='running'
                  THEN ws.total_seconds + EXTRACT(EPOCH FROM (NOW()-ws.started_at))::int
                  ELSE ws.total_seconds END)
                FROM work_sessions ws WHERE ws.ticket_id=$1 AND ws.worker_id=su.id
                AND ws.session_plc_type='remote'
              ), 0) AS remote_seconds,
              twb.charged_amount, twb.charged_note,
              twb.expense_amount, twb.expense_note,
              twb.completion_report_path, twb.expense_file_path, twb.completed_by_worker_at
         FROM assigned a
         JOIN service_users su ON su.id=a.worker_id
         LEFT JOIN ticket_worker_billing twb ON twb.ticket_id=$1 AND twb.worker_id=su.id
        ORDER BY su.name`, [id]);

    const isWarranty = ticket.warranty_status === 'in_warranty';

    // Inline pricing helpers
    function pickPricing(worker, ticket, rows) {
      const serviceType = worker.role === 'wireman' ? 'wireman' : 'programmer';
      const location    = ticket.billing_location || 'within_ahmedabad';
      const seniority   = worker.seniority || 'junior';
      let row = rows.find(p =>
        p.service_type === serviceType && p.location === location &&
        (p.seniority === seniority || p.seniority === 'any'));
      if (!row) row = rows.find(p => p.service_type === serviceType && p.location === location);
      return row || null;
    }

    function computeRevenue(ticket, pricing, hours, dailyHours) {
      if (ticket.override_rate) return Number(ticket.override_rate);
      if (!pricing) return 0;
      if (ticket.billing_mode === 'half_day') return Number(pricing.half_day_rate || 0);
      const halfCutoff = (dailyHours || 9) / 2;
      const minCharge  = 1500;
      const grade      = (ticket.customer_grade || 'B').toLowerCase();
      // Get full-day rate based on billing mode
      let fullDayRate;
      if (ticket.billing_mode === 'grade_rate') {
        fullDayRate = Number(pricing['grade_' + grade + '_rate'] || pricing.per_day_rate || 0);
      } else {
        fullDayRate = Number(pricing.per_day_rate || 0);
      }
      // Half-day rate
      const halfDayRate = Number(pricing.half_day_rate || fullDayRate * 0.6 || 0);
      // 3-tier logic for ALL modes
      if (hours === 0)           return 0;
      if (hours < 1)             return minCharge;
      if (hours <= halfCutoff)   return halfDayRate;
      return fullDayRate;
    }

    const toUrl = (p) => !p ? null : p.startsWith('/uploads') ? p : '/uploads/' + p;

    const result = workers.map(w => {
      const hours      = (Number(w.total_seconds) || 0) / 3600;
      const dailyHours = Number(w.daily_hours) || 9;
      const halfCutoff = dailyHours / 2;
      const pricing = pickPricing(
        { role: w.assigned_role || w.worker_role, seniority: w.worker_seniority },
        ticket, pricingRows);
      const minCharge = Number(pricing?.minimum_visit_charge || 1500);
      // Auto-suggest based on tier logic
      const suggested = isWarranty ? 0 : computeRevenue(ticket, pricing, hours, dailyHours);

      const gradeLabel = ticket.billing_mode==='grade_rate' ? ' · Grade '+String(ticket.customer_grade||'B').toUpperCase()+' rate' : '';
      let basis;
      if (isWarranty)                            basis = 'Warranty — no charge';
      else if (ticket.override_rate)             basis = 'Override rate';
      else if (ticket.billing_mode==='half_day') basis = 'Half-day rate';
      else if (hours === 0)                      basis = 'No sessions yet';
      else if (hours < 1)                        basis = `${Math.round(hours*60)}min → minimum visit charge${gradeLabel}`;
      else if (hours <= halfCutoff)              basis = `${hours.toFixed(2)}h → half-day (≤${halfCutoff}h)${gradeLabel}`;
      else                                       basis = `${hours.toFixed(2)}h → full-day (>${halfCutoff}h)${gradeLabel}`;

      // Half + full day rates for display
      const halfDayAmount = isWarranty ? 0 : (pricing ? Math.round(Number(pricing.half_day_rate || 0)) : 0);
      const fullDayAmount = isWarranty ? 0 : (pricing ? Math.round(Number(pricing.per_day_rate  || 0)) : 0);
      // Time-based: proportional charge = (hours / 9) * per_day_rate
      const timeBasedAmount = isWarranty || !pricing || hours === 0 ? 0
        : Math.round((hours / dailyHours) * Number(pricing.per_day_rate || 0));

      return {
        worker_id:        w.worker_id,
        worker_name:      w.worker_name,
        worker_role:      w.worker_role,
        worker_seniority: w.worker_seniority,
        assigned_role:    w.assigned_role,
        hours:            +hours.toFixed(2),
        onsite_hours:     +(Number(w.onsite_seconds||0)/3600).toFixed(2),
        remote_hours:     +(Number(w.remote_seconds||0)/3600).toFixed(2),
        suggested_amount: Math.round(suggested),
        basis,
        half_day_rate:    halfDayAmount,
        full_day_rate:    fullDayAmount,
        min_visit_charge: isWarranty ? 0 : minCharge,
        hours_worked:     +hours.toFixed(2),
        half_cutoff:      halfCutoff,
        is_warranty:      isWarranty,
        charged_amount:   w.charged_amount != null ? Number(w.charged_amount) : null,
        charged_note:     w.charged_note || null,
        expense_amount:   w.expense_amount != null ? Number(w.expense_amount) : 0,
        expense_note:     w.expense_note || null,
        completed_at:     w.completed_by_worker_at || null,
        report_url:       toUrl(w.completion_report_path),
        expense_file_url: toUrl(w.expense_file_path),
      };
    });

    res.json({ ticket_id: id, workers: result });
  } catch (e) {
    console.error('Rate suggestion error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* DELETE /api/service/tickets/:id — superadmin only */
router.delete('/:id', svcAuth(['superadmin']), svcPerm('delete_ticket'), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `DELETE FROM service_tickets WHERE id=$1::uuid RETURNING ticket_id`,
      [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json({ ok: true, ticket_id: rows[0].ticket_id });
  } catch (e) {
    console.error('Delete ticket error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* PATCH /api/service/tickets/:id/edit — edit ticket fields (admin) */
router.patch('/:id/edit', svcAuth(['admin','superadmin']), svcPerm('assign_workers'), async (req, res) => {
  const { customer_name, address, service_type, description, priority,
          contact_name, contact_phone, designation, sales_agent,
          warranty_status, needs_plc, needs_wiring, plc_type, deadline_date, job_no } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE service_tickets SET
        customer_name  = COALESCE($1,  customer_name),
        address        = COALESCE($2,  address),
        service_type   = COALESCE($3,  service_type),
        description    = COALESCE($4,  description),
        priority       = COALESCE($5,  priority),
        contact_name   = COALESCE($6,  contact_name),
        contact_phone  = COALESCE($7,  contact_phone),
        designation    = COALESCE($8,  designation),
        sales_agent    = COALESCE($9,  sales_agent),
        warranty_status= COALESCE($10, warranty_status),
        needs_plc      = COALESCE($11, needs_plc),
        needs_wiring   = COALESCE($12, needs_wiring),
        plc_type       = COALESCE($13, plc_type),
        deadline_date  = COALESCE($14, deadline_date),
        job_no         = COALESCE($15, job_no),
        updated_at     = NOW()
       WHERE id=$16::uuid
       RETURNING *`,
      [customer_name||null, address||null, service_type||null, description||null, priority||null,
       contact_name||null, contact_phone||null, designation||null, sales_agent||null,
       warranty_status||null,
       needs_plc!=null ? !!needs_plc : null,
       needs_wiring!=null ? !!needs_wiring : null,
       plc_type||null, deadline_date||null, job_no||null,
       req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Edit ticket error:', e);
    res.status(500).json({ error: e.message });
  }
});

// ── Work Logs ──────────────────────────────────────────────────────────────
router.get('/:id/work-logs', svcAuth(['admin','superadmin','plc','wireman']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wl.*, su.name AS worker_name, su.role AS worker_role
       FROM ticket_work_logs wl
       JOIN service_users su ON su.id = wl.worker_id
       WHERE wl.ticket_id = $1
       ORDER BY wl.log_date DESC, wl.log_time DESC`,
      [req.params.id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/work-logs', svcAuth(['admin','superadmin','plc','wireman']), async (req, res) => {
  try {
    const { description, log_date, log_time } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: 'Description required' });
    const { rows } = await pool.query(
      `INSERT INTO ticket_work_logs (ticket_id, worker_id, log_date, log_time, description)
       VALUES ($1, $2, $3::date, $4::time, $5) RETURNING *`,
      [req.params.id, req.svcUser.id,
       log_date || new Date().toISOString().slice(0,10),
       log_time || new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'}),
       description.trim()]);
    const { rows: full } = await pool.query(
      `SELECT wl.*, su.name AS worker_name, su.role AS worker_role
       FROM ticket_work_logs wl JOIN service_users su ON su.id=wl.worker_id
       WHERE wl.id=$1`, [rows[0].id]);
    res.json(full[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id/work-logs/:logId', svcAuth(['admin','superadmin','plc','wireman']), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT worker_id FROM ticket_work_logs WHERE id=$1 AND ticket_id=$2`,
      [req.params.logId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const isMine  = rows[0].worker_id === req.svcUser.id;
    const isAdmin = ['admin','superadmin'].includes(req.svcUser.role);
    if (!isMine && !isAdmin) return res.status(403).json({ error: 'Not allowed' });
    await pool.query(`DELETE FROM ticket_work_logs WHERE id=$1`, [req.params.logId]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
