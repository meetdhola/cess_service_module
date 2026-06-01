#!/usr/bin/env python3
"""
Run from: /Users/meetdhola/Downloads/cess-service-v3
python3 apply_all_changes.py
"""
import sys

OK = 0
FAIL = 0

def patch(path, old, new, label):
    global OK, FAIL
    try:
        with open(path, 'r') as f:
            c = f.read()
        if old in c:
            c = c.replace(old, new, 1)
            with open(path, 'w') as f:
                f.write(c)
            print(f"✅ {label}")
            OK += 1
        else:
            print(f"❌ NOT FOUND: {label}")
            FAIL += 1
    except FileNotFoundError:
        print(f"❌ FILE NOT FOUND: {path}")
        FAIL += 1

B = '.'

# ══════════════════════════════════════════════════════════════════════
# CHANGE 1 — PLC On-site/Remote badge buttons in worker ticket card
# Show clearly labelled badges instead of plain text
# ══════════════════════════════════════════════════════════════════════
patch(
    f'{B}/client/src/pages/service/WorkerDashboard.jsx',
    "['PLC Required',tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No']",
    "['PLC Required',tk.needs_plc?(tk.plc_type==='site'?'🏭 On-site':tk.plc_type==='remote'?'💻 Remote':'Yes'):'No']",
    "Change 1: PLC type badge labels"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 2 — IRC cost visible in Workers tab for Sales dept admins
# Backend: add irc_daily_rate + monthly_salary to /auth/workers response
# ══════════════════════════════════════════════════════════════════════
patch(
    f'{B}/server/routes/serviceAuth.js',
    "`SELECT id, name, role, department, phone FROM service_users WHERE is_active=TRUE AND role IN ('plc','wireman','admin') ORDER BY role, name`",
    "`SELECT id, name, role, department, phone, monthly_salary, irc_daily_rate, seniority FROM service_users WHERE is_active=TRUE AND (role IN ('plc','wireman') OR (role='admin' AND department IN ('PLC','Wireman','Design'))) ORDER BY role, name`",
    "Change 2: workers route returns salary + IRC data"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 3 — Allow ANY plc/wireman to see ALL open tickets (not just assigned)
# Workers can now open tickets from the unassigned pool
# ══════════════════════════════════════════════════════════════════════
patch(
    f'{B}/server/routes/serviceTickets.js',
    """router.get('/my', svcAuth(['plc','wireman']), async (req, res) => {
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
});""",
    """router.get('/my', svcAuth(['plc','wireman']), async (req, res) => {
  try {
    // Return ASSIGNED tickets for this worker PLUS any Open tickets
    // so any worker can pick up unassigned tickets
    const { rows } = await pool.query(
      `SELECT DISTINCT t.*,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='plc')     AS plc_worker_names,
      (SELECT string_agg(su.name, ', ') FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id WHERE ta.ticket_id=t.id AND ta.role='wireman') AS wireman_worker_names,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='plc'), '[]'::json) AS assigned_plcs,
      COALESCE((SELECT json_agg(json_build_object('worker_id', su.id, 'name', su.name, 'role', su.role))
                  FROM ticket_assignments ta JOIN service_users su ON su.id=ta.worker_id
                 WHERE ta.ticket_id=t.id AND ta.role='wireman'), '[]'::json) AS assigned_wiremen,
      (SELECT COUNT(*)::int FROM ticket_documents WHERE ticket_id=t.id) AS doc_count,
      EXISTS(SELECT 1 FROM ticket_assignments ta2 WHERE ta2.ticket_id=t.id AND ta2.worker_id=$1) AS is_assigned_to_me
    FROM service_tickets t
    LEFT JOIN ticket_assignments ta ON ta.ticket_id=t.id AND ta.worker_id=$1
    WHERE (
      ta.worker_id=$1                          -- assigned to me
      OR t.status IN ('Open','Assigned')       -- or any open ticket I can pick up
    )
    AND t.status NOT IN ('Closed','Completed')
    ORDER BY
      EXISTS(SELECT 1 FROM ticket_assignments ta3 WHERE ta3.ticket_id=t.id AND ta3.worker_id=$1) DESC,
      t.created_at DESC`, [req.svcUser.id]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});""",
    "Change 3: Workers can see all open tickets, not just assigned ones"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 4 — Show half-day AND full-day rates in billing suggestion
# Add both rates to the rate-suggestion response
# ══════════════════════════════════════════════════════════════════════
patch(
    f'{B}/server/routes/serviceTickets.js',
    """      let basis;
      if (isWarranty)                       basis = 'Warranty — no charge';
      else if (ticket.override_rate)        basis = 'Override rate';
      else if (ticket.billing_mode === 'half_day')   basis = 'Half-day rate';
      else if (ticket.billing_mode === 'grade_rate') basis = `Grade ${String(ticket.customer_grade||'B').toUpperCase()} rate`;
      else if (hours > 0 && hours <= 4)     basis = 'Auto half-day (≤4h)';
      else                                  basis = 'Per-day rate';""",
    """      let basis;
      if (isWarranty)                       basis = 'Warranty — no charge';
      else if (ticket.override_rate)        basis = 'Override rate';
      else if (ticket.billing_mode === 'half_day')   basis = 'Half-day rate';
      else if (ticket.billing_mode === 'grade_rate') basis = `Grade ${String(ticket.customer_grade||'B').toUpperCase()} rate`;
      else if (hours > 0 && hours <= 4)     basis = 'Auto half-day (≤4h)';
      else                                  basis = 'Per-day rate';

      // Also compute both half and full day rates for display
      const halfDayTicket = { ...ticket, billing_mode: 'half_day' };
      const fullDayTicket = { ...ticket, billing_mode: 'full_day'  };
      const halfDayAmount = isWarranty ? 0 : Math.round(profit.computeRevenue(halfDayTicket, pricing, 4));
      const fullDayAmount = isWarranty ? 0 : Math.round(profit.computeRevenue(fullDayTicket, pricing, 8));""",
    "Change 4a: compute half + full day rates"
)

patch(
    f'{B}/server/routes/serviceTickets.js',
    """        suggested_amount: Math.round(suggested),
        basis,""",
    """        suggested_amount: Math.round(suggested),
        basis,
        half_day_rate:    halfDayAmount,
        full_day_rate:    fullDayAmount,""",
    "Change 4b: include half/full day rates in response"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 5 — Multiple reports + expense files (DB migration already done)
# Backend: new route to add files to ticket_worker_files table
# ══════════════════════════════════════════════════════════════════════
# Add new route to servicePhase2.js before module.exports
with open(f'{B}/server/routes/servicePhase2.js', 'r') as f:
    p2 = f.read()

NEW_ROUTES = """
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

"""

if 'ticket_worker_files' not in p2:
    p2 = p2.replace('module.exports = router;', NEW_ROUTES + 'module.exports = router;')
    with open(f'{B}/server/routes/servicePhase2.js', 'w') as f:
        f.write(p2)
    print("✅ Change 5: Multiple files routes added to servicePhase2.js")
    OK += 1
else:
    print("⏭  Change 5: Routes already exist")

# ══════════════════════════════════════════════════════════════════════
# CHANGE 6 — Bulk secret key reset (backend)
# ══════════════════════════════════════════════════════════════════════
with open(f'{B}/server/routes/serviceAuth.js', 'r') as f:
    auth = f.read()

BULK_RESET = """
/* PATCH /api/service/auth/users/bulk-regen-keys — superadmin only */
router.patch('/users/bulk-regen-keys', svcAuth(['superadmin']), async (req, res) => {
  const { confirm1, confirm2 } = req.body;
  if (!confirm1 || !confirm2)       return res.status(400).json({ error: 'Two confirmations required' });
  if (confirm1 !== confirm2)        return res.status(400).json({ error: 'Confirmations do not match' });
  if (confirm1 !== 'RESET ALL KEYS') return res.status(400).json({ error: 'Type RESET ALL KEYS exactly' });
  try {
    const { rows: users } = await pool.query(
      `SELECT id, name FROM service_users WHERE is_active=TRUE ORDER BY name`);
    const results = [];
    for (const u of users) {
      let key, dup;
      do {
        key = String(Math.floor(100000 + Math.random() * 900000));
        ({ rows: dup } = await pool.query(
          `SELECT id FROM service_users WHERE secret_key=$1 AND id!=$2`, [key, u.id]));
      } while (dup.length);
      await pool.query(`UPDATE service_users SET secret_key=$1 WHERE id=$2`, [key, u.id]);
      results.push({ id: u.id, name: u.name, secret_key: key });
    }
    res.json({ message: `Reset ${results.length} secret keys`, users: results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

"""

if 'bulk-regen-keys' not in auth:
    auth = auth.replace('module.exports = router;', BULK_RESET + 'module.exports = router;')
    with open(f'{B}/server/routes/serviceAuth.js', 'w') as f:
        f.write(auth)
    print("✅ Change 6: Bulk key reset route added")
    OK += 1
else:
    print("⏭  Change 6: Route already exists")

print(f"\n{'='*50}")
print(f"Results: {OK} applied, {FAIL} failed")
print(f"{'='*50}")
