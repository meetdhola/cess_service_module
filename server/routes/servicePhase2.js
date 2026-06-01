// ════════════════════════════════════════════════════════════════════
// servicePhase2.js — Phase 2 routes for the Cess Service Module
//
// Mount in your server entry (e.g. app.js / index.js) AFTER your existing
// service routers, on the SAME base path:
//
//     const phase2 = require('./routes/servicePhase2');
//     app.use('/api/service', phase2);
//
// It reuses req.svcUser, req.io, the same pool, and the same multer upload
// dir as serviceTickets.js. Nothing here conflicts with existing routes.
// ════════════════════════════════════════════════════════════════════

const router  = require('express').Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const pool    = require('../db/pool');
const svcAuth = require('../middleware/serviceAuth');

// Same uploads dir / disk storage pattern as serviceTickets.js
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random()*1e9)}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 50*1024*1024 } });

/* ════════════════════════════════════════════════════════════ */
/* 1. SCHEDULED TASKS  (admin/superadmin create; ticket-linked)  */
/* ════════════════════════════════════════════════════════════ */

// CREATE — admin/superadmin only, must link to a ticket
router.post('/scheduled-tasks', svcAuth(['admin','superadmin']), async (req, res) => {
  const { ticket_id, title, notes, due_date, status } = req.body;
  if (!ticket_id || !title?.trim() || !due_date) {
    return res.status(400).json({ error: 'ticket_id, title and due_date are required' });
  }
  try {
    // Confirm ticket exists
    const { rows: t } = await pool.query(`SELECT id FROM service_tickets WHERE id=$1`, [ticket_id]);
    if (!t.length) return res.status(404).json({ error: 'Ticket not found' });

    const { rows } = await pool.query(
      `INSERT INTO scheduled_tasks (ticket_id, title, notes, due_date, status, created_by)
       VALUES ($1::uuid, $2, $3, $4::date, COALESCE($5,'pending'), $6::uuid)
       RETURNING *`,
      [ticket_id, title.trim(), notes || null, due_date, status || null, req.svcUser.id]);

    req.io?.to('admins').emit('scheduled-task:created', { task: rows[0] });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Scheduled task create error:', e);
    res.status(500).json({ error: e.message });
  }
});

// LIST — optional ?status= filter (All/pending/in_process/completed) and ?ticket_id=
// Visible to any logged-in user (workers see tasks on their tickets via the same call).
router.get('/scheduled-tasks', svcAuth(), async (req, res) => {
  const { status, ticket_id } = req.query;
  const where = []; const args = []; let n = 1;
  if (status && status !== 'All') { where.push(`st.status=$${n++}`); args.push(status); }
  if (ticket_id)                  { where.push(`st.ticket_id=$${n++}`); args.push(ticket_id); }
  try {
    const { rows } = await pool.query(
      `SELECT st.*,
              t.ticket_id   AS ticket_no,
              t.customer_name,
              cu.name       AS created_by_name,
              (st.due_date - CURRENT_DATE) AS days_until_due
         FROM scheduled_tasks st
         JOIN service_tickets t  ON t.id = st.ticket_id
         LEFT JOIN service_users cu ON cu.id = st.created_by
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY st.due_date ASC, st.created_at DESC`,
      args);
    res.json(rows);
  } catch (e) {
    console.error('Scheduled task list error:', e);
    res.status(500).json({ error: e.message });
  }
});

// REMINDERS — tasks due within the next 3 days (inclusive) and not completed.
// Powers the dashboard + assign-page reminder banners across all dashboards.
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
    console.error('Reminders error:', e);
    res.status(500).json({ error: e.message });
  }
});

// UPDATE — admin/superadmin (status change or edit)
router.patch('/scheduled-tasks/:id', svcAuth(['admin','superadmin']), async (req, res) => {
  const { title, notes, due_date, status } = req.body;
  if (status && !['pending','in_process','completed'].includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE scheduled_tasks SET
         title     = COALESCE($1, title),
         notes     = COALESCE($2, notes),
         due_date  = COALESCE($3::date, due_date),
         status    = COALESCE($4, status),
         updated_at= NOW()
       WHERE id=$5::uuid RETURNING *`,
      [title || null, notes ?? null, due_date || null, status || null, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Scheduled task update error:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE — admin/superadmin
router.delete('/scheduled-tasks/:id', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    await pool.query(`DELETE FROM scheduled_tasks WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════════ */
/* 2. TICKET CHALLANS  (multiple per ticket)                     */
/*    Editable by worker / admin / superadmin.                   */
/* ════════════════════════════════════════════════════════════ */

router.get('/tickets/:id/challans', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tc.*, su.name AS added_by_name
         FROM ticket_challans tc
         LEFT JOIN service_users su ON su.id = tc.added_by
        WHERE tc.ticket_id = $1
        ORDER BY tc.created_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/:id/challans', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  const challan_no = req.body.challan_no?.toString().trim();
  const note       = req.body.note?.toString().trim() || null;
  if (!challan_no) return res.status(400).json({ error: 'challan_no is required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO ticket_challans (ticket_id, challan_no, note, added_by)
       VALUES ($1::uuid, $2, $3, $4::uuid) RETURNING *`,
      [req.params.id, challan_no, note, req.svcUser.id]);
    req.io?.to('admins').emit('challan:added', { ticket_id: req.params.id, challan_no });
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('Challan add error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/tickets/:id/challans/:challanId', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  const challan_no = req.body.challan_no?.toString().trim();
  const note       = req.body.note?.toString().trim() ?? null;
  if (!challan_no) return res.status(400).json({ error: 'challan_no is required' });
  try {
    const { rows } = await pool.query(
      `UPDATE ticket_challans SET challan_no=$1, note=$2, updated_at=NOW()
        WHERE id=$3::uuid AND ticket_id=$4::uuid RETURNING *`,
      [challan_no, note, req.params.challanId, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Challan not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error('Challan edit error:', e);
    res.status(500).json({ error: e.message });
  }
});

router.delete('/tickets/:id/challans/:challanId', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {
  try {
    await pool.query(`DELETE FROM ticket_challans WHERE id=$1 AND ticket_id=$2`,
      [req.params.challanId, req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ════════════════════════════════════════════════════════════ */
/* 3. TICKET NOTES  (collaborative thread)                       */
/*    Any assigned worker / admin / superadmin can add.          */
/* ════════════════════════════════════════════════════════════ */

router.get('/tickets/:id/notes', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tn.id, tn.body, tn.created_at,
              tn.author_id, su.name AS author_name, su.role AS author_role
         FROM ticket_notes tn
         LEFT JOIN service_users su ON su.id = tn.author_id
        WHERE tn.ticket_id = $1
        ORDER BY tn.created_at ASC`, [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/tickets/:id/notes', svcAuth(), async (req, res) => {
  const body = req.body.body?.toString().trim();
  if (!body) return res.status(400).json({ error: 'note body is required' });
  try {
    // Workers must be assigned to comment; admins/superadmins always allowed.
    const isPrivileged = ['admin','superadmin'].includes(req.svcUser.role);
    if (!isPrivileged) {
      const { rows: a } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [req.params.id, req.svcUser.id]);
      if (!a.length) return res.status(403).json({ error: 'You are not assigned to this ticket' });
    }

    const { rows } = await pool.query(
      `INSERT INTO ticket_notes (ticket_id, author_id, body)
       VALUES ($1::uuid, $2::uuid, $3) RETURNING *`,
      [req.params.id, req.svcUser.id, body]);

    const note = { ...rows[0], author_name: req.svcUser.name, author_role: req.svcUser.role };
    req.io?.to('admins').emit('note:added', { ticket_id: req.params.id, note });
    res.status(201).json(note);
  } catch (e) {
    console.error('Note add error:', e);
    res.status(500).json({ error: e.message });
  }
});

/* ════════════════════════════════════════════════════════════ */
/* 4. WORKER COMPLETION  (expense + completion report upload)    */
/*    Worker submits expense + report → their side complete.     */
/*    Charge is entered LATER by admin/superadmin.               */
/* ════════════════════════════════════════════════════════════ */

router.post('/tickets/:id/worker-completion',
  svcAuth(['plc','wireman']),
  upload.fields([
    { name: 'report',       maxCount: 10 },
    { name: 'expense_file', maxCount: 10 },
  ]),
  async (req, res) => {
    const expenseRaw = req.body.expense_amount;
    const expense_note = req.body.expense_note?.toString().trim() || null;

    const expense = Number(expenseRaw ?? 0);
    if (isNaN(expense) || expense < 0) {
      return res.status(400).json({ error: 'expense_amount must be a non-negative number' });
    }

    try {
      // Verify ticket + assignment
      const { rows: tkts } = await pool.query(
        `SELECT id, status, warranty_status FROM service_tickets WHERE id=$1`, [req.params.id]);
      if (!tkts.length) return res.status(404).json({ error: 'Ticket not found' });

      const { rows: assigned } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [req.params.id, req.svcUser.id]);
      if (!assigned.length) return res.status(403).json({ error: 'You are not assigned to this ticket' });

      const reportFiles  = req.files?.report       || [];
      const expenseFiles = req.files?.expense_file || [];
      const reportPath      = reportFiles[0]  ? `/uploads/${reportFiles[0].filename}`  : null;
      const expenseFilePath = expenseFiles[0] ? `/uploads/${expenseFiles[0].filename}` : null;

      // Upsert this worker's billing row: set expense + completion report + completed timestamp.
      // charged_amount stays whatever it was (likely NULL — admin fills it later).
      const { rows } = await pool.query(
        `INSERT INTO ticket_worker_billing
           (ticket_id, worker_id, expense_amount, expense_note, completion_report_path, expense_file_path, completed_by_worker_at)
         VALUES ($1::uuid, $2::uuid, $3::numeric, $4, $5, $6, NOW())
         ON CONFLICT (ticket_id, worker_id)
         DO UPDATE SET
           expense_amount         = EXCLUDED.expense_amount,
           expense_note           = EXCLUDED.expense_note,
           completion_report_path = COALESCE(EXCLUDED.completion_report_path, ticket_worker_billing.completion_report_path),
           expense_file_path      = COALESCE(EXCLUDED.expense_file_path, ticket_worker_billing.expense_file_path),
           completed_by_worker_at = NOW()
         RETURNING *`,
        [req.params.id, req.svcUser.id, expense, expense_note, reportPath, expenseFilePath]);

      // Save extra files beyond first to ticket_worker_files
      for (const f of reportFiles.slice(1)) {
        await pool.query(
          `INSERT INTO ticket_worker_files (ticket_id, worker_id, file_type, file_path, original_name, file_size) VALUES ($1,$2,'report',$3,$4,$5)`,
          [req.params.id, req.svcUser.id, `/uploads/${f.filename}`, f.originalname, f.size]);
      }
      for (const f of expenseFiles.slice(1)) {
        await pool.query(
          `INSERT INTO ticket_worker_files (ticket_id, worker_id, file_type, file_path, original_name, file_size, expense_amount) VALUES ($1,$2,'expense',$3,$4,$5,$6)`,
          [req.params.id, req.svcUser.id, `/uploads/${f.filename}`, f.originalname, f.size, expense]);
      }
      // Notify admin/superadmin that this worker finished and a charge is now needed.
      req.io?.to('admins').emit('worker:completed', {
        ticket_id:   req.params.id,
        worker_id:   req.svcUser.id,
        worker_name: req.svcUser.name,
        expense,
      });

      res.json(rows[0]);
    } catch (e) {
      console.error('Worker completion error:', e);
      res.status(500).json({ error: e.message });
    }
  });

/* ════════════════════════════════════════════════════════════ */
/* 5. ADMIN/SUPERADMIN CHARGE ENTRY                              */
/*    Enter the charge for a worker's completed work.            */
/*    (Rate Card button is a frontend concern — Phase 3.)        */
/* ════════════════════════════════════════════════════════════ */

router.patch('/tickets/:id/worker-billing/:workerId/charge', svcAuth(['admin','superadmin']), async (req, res) => {
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

/* ════════════════════════════════════════════════════════════ */
/* 6. REOPEN  (admin/superadmin) — reactivate SAME ticket        */
/*    Closed/Completed → 'In Progress'. All history preserved.   */
/* ════════════════════════════════════════════════════════════ */

router.patch('/tickets/:id/reopen', svcAuth(['admin','superadmin']), async (req, res) => {
  try {
    const { rows: tkts } = await pool.query(
      `SELECT status FROM service_tickets WHERE id=$1`, [req.params.id]);
    if (!tkts.length) return res.status(404).json({ error: 'Ticket not found' });
    if (!['Completed','Closed'].includes(tkts[0].status)) {
      return res.status(400).json({ error: 'Only Completed or Closed tickets can be reopened.' });
    }

    const { rows } = await pool.query(
      `UPDATE service_tickets SET
         status       = 'In Progress',
         reopen_count = reopen_count + 1,
         reopened_at  = NOW(),
         reopened_by  = $1::uuid,
         updated_at   = NOW()
       WHERE id=$2::uuid RETURNING *`,
      [req.svcUser.id, req.params.id]);

    req.io?.to('admins').emit('ticket:reopened', { ticket_id: req.params.id });
    res.json(rows[0]);
  } catch (e) {
    console.error('Reopen error:', e);
    res.status(500).json({ error: e.message });
  }
});

// FULL — fetch ALL data tied to a ticket (for the reopen "suggestions" view)
router.get('/tickets/:id/full', svcAuth(), async (req, res) => {
  try {
    // Resolve human ticket number (e.g. SE0019) to internal UUID
    const idParam = req.params.id;
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idParam);
    let ticketUUID = idParam;
    if (!isUUID) {
      const { rows: lk } = await pool.query(
        `SELECT id FROM service_tickets WHERE ticket_id=$1`, [idParam]);
      if (!lk.length) return res.status(404).json({ error: 'Ticket not found' });
      ticketUUID = lk[0].id;
    }
    // Worker access check
    const role = req.svcUser?.role;
    if (role === 'plc' || role === 'wireman') {
      const { rows: ok } = await pool.query(
        `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
        [ticketUUID, req.svcUser.id]);
      if (!ok.length) {
        // Also allow if ticket is Open (for self-assign flow)
        const { rows: tk } = await pool.query(
          `SELECT status FROM service_tickets WHERE id=$1`, [ticketUUID]);
        if (!tk.length || !['Open','Assigned'].includes(tk[0].status)) {
          return res.status(403).json({ error: 'Not assigned to this ticket' });
        }
      }
    }
    const [ticket, assignments, sessions, billing, challans, notes, media, docs] = await Promise.all([
      pool.query(`SELECT * FROM service_tickets WHERE id=$1`, [ticketUUID]),
      pool.query(
        `SELECT ta.*, su.name AS worker_name FROM ticket_assignments ta
           JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=$1`, [ticketUUID]),
      pool.query(
        `SELECT ws.*, su.name AS worker_name FROM work_sessions ws
           JOIN service_users su ON su.id=ws.worker_id
          WHERE ws.ticket_id=$1 ORDER BY ws.started_at DESC`, [ticketUUID]),
      pool.query(
        `SELECT twb.*, su.name AS worker_name FROM ticket_worker_billing twb
           JOIN service_users su ON su.id=twb.worker_id WHERE twb.ticket_id=$1`, [ticketUUID]),
      pool.query(
        `SELECT tc.*, su.name AS added_by_name FROM ticket_challans tc
           LEFT JOIN service_users su ON su.id=tc.added_by
          WHERE tc.ticket_id=$1 ORDER BY tc.created_at ASC`, [ticketUUID]),
      pool.query(
        `SELECT tn.*, su.name AS author_name FROM ticket_notes tn
           LEFT JOIN service_users su ON su.id=tn.author_id
          WHERE tn.ticket_id=$1 ORDER BY tn.created_at ASC`, [ticketUUID]),
      pool.query(`SELECT * FROM ticket_media WHERE ticket_id=$1`, [ticketUUID]),
      pool.query(`SELECT * FROM ticket_documents WHERE ticket_id=$1`, [ticketUUID]),
    ]);

    if (!ticket.rows.length) return res.status(404).json({ error: 'Ticket not found' });

    const toUrl = (p) => !p ? null : p.startsWith('/uploads') ? p : `/uploads/${p}`;

    // Fetch extra files from ticket_worker_files for all workers
    const { rows: extraFiles } = await pool.query(
      `SELECT * FROM ticket_worker_files WHERE ticket_id=$1 ORDER BY uploaded_at ASC`,
      [ticketUUID]);

    const billingMapped = billing.rows.map(b => {
      const workerExtras = extraFiles.filter(f => f.worker_id === b.worker_id);
      const extraReports  = workerExtras.filter(f => f.file_type === 'report')
        .map(f => ({ url: toUrl(f.file_path), name: f.original_name, size: f.file_size }));
      const extraExpenses = workerExtras.filter(f => f.file_type === 'expense')
        .map(f => ({ url: toUrl(f.file_path), name: f.original_name, size: f.file_size, amount: f.expense_amount }));
      return {
        ...b,
        report_url:       toUrl(b.completion_report_path),
        expense_file_url: toUrl(b.expense_file_path),
        // All files including extras
        all_report_files: [
          ...(b.completion_report_path ? [{ url: toUrl(b.completion_report_path), name: 'Report' }] : []),
          ...extraReports,
        ],
        all_expense_files: [
          ...(b.expense_file_path ? [{ url: toUrl(b.expense_file_path), name: 'Expense proof' }] : []),
          ...extraExpenses,
        ],
      };
    });
    res.json({
      ticket:      ticket.rows[0],
      assignments: assignments.rows,
      sessions:    sessions.rows,
      billing:     billingMapped,
      challans:    challans.rows,
      notes:       notes.rows,
      media:       media.rows,
      documents:   docs.rows,
    });
  } catch (e) {
    console.error('Ticket full fetch error:', e);
    res.status(500).json({ error: e.message });
  }
});


/* ════════════════════════════════════════════════════════════════
   MULTIPLE FILES PER WORKER
   POST /tickets/:id/worker-files  — worker uploads report or expense file
   GET  /tickets/:id/worker-files  — get all files for this ticket
   ════════════════════════════════════════════════════════════════ */
router.post('/tickets/:id/worker-files',
  svcAuth(['plc','wireman']),
  upload.fields([
    { name: 'files', maxCount: 10 },
  ]),
  async (req, res) => {
    const { file_type, expense_amount, note } = req.body;
    if (!file_type || !['report','expense'].includes(file_type)) {
      return res.status(400).json({ error: 'file_type must be report or expense' });
    }
    const uploadedFiles = req.files?.files || [];
    if (!uploadedFiles.length) return res.status(400).json({ error: 'No files uploaded' });

    // Verify assignment
    const { rows: assigned } = await pool.query(
      `SELECT 1 FROM ticket_assignments WHERE ticket_id=$1 AND worker_id=$2`,
      [req.params.id, req.svcUser.id]);
    if (!assigned.length) return res.status(403).json({ error: 'Not assigned to this ticket' });

    try {
      const inserted = [];
      for (const f of uploadedFiles) {
        const { rows } = await pool.query(
          `INSERT INTO ticket_worker_files
             (ticket_id, worker_id, file_type, file_path, original_name, file_size, expense_amount, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [req.params.id, req.svcUser.id, file_type,
           `/uploads/${f.filename}`, f.originalname, f.size,
           expense_amount ? Number(expense_amount) : 0,
           note?.toString().trim() || null]
        );
        inserted.push(rows[0]);
      }
      res.json(inserted);
    } catch (e) { res.status(500).json({ error: e.message }); }
  }
);

router.get('/tickets/:id/worker-files', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT twf.*, su.name AS worker_name
         FROM ticket_worker_files twf
         JOIN service_users su ON su.id = twf.worker_id
        WHERE twf.ticket_id = $1
        ORDER BY twf.uploaded_at DESC`,
      [req.params.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


/* GET /tickets/:id/reopens — reopen history for a ticket */
router.get('/tickets/:id/reopens', svcAuth(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.*, su.name AS reopened_by_name
         FROM ticket_reopens tr
         LEFT JOIN service_users su ON su.id = tr.reopened_by
        WHERE tr.ticket_id = $1
        ORDER BY tr.reopened_at DESC`,
      [req.params.id]);
    res.json(rows);
  } catch (e) {
    // Table may not exist yet — return empty array gracefully
    console.error('Reopens fetch error:', e.message);
    res.json([]);
  }
});

module.exports = router;