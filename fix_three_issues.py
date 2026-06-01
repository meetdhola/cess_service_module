#!/usr/bin/env python3
"""
Fix 3 issues. Run from: /Users/meetdhola/Downloads/cess-service-v3
"""
OK = 0; FAIL = 0

def patch(path, old, new, label):
    global OK, FAIL
    try:
        with open(path) as f: c = f.read()
        if old in c:
            c = c.replace(old, new, 1)
            with open(path, 'w') as f: f.write(c)
            print(f"OK  {label}"); OK += 1
        else:
            print(f"ERR NOT FOUND: {label}"); FAIL += 1
    except FileNotFoundError:
        print(f"ERR FILE NOT FOUND: {path}"); FAIL += 1

CTX = 'client/src/context/SvcAuthContext.jsx'
AD  = 'client/src/pages/service/AdminDashboard.jsx'
WD  = 'client/src/pages/service/WorkerDashboard.jsx'
TDP = 'client/src/pages/service/TicketDetailPage.jsx'
ST  = 'server/routes/serviceTickets.js'

# ISSUE 1a: Add isSales to context
patch(CTX,
    "  const isSuperAdmin = svcUser?.role === 'superadmin';",
    "  const isSuperAdmin = svcUser?.role === 'superadmin';\n  const isSales      = svcUser?.role === 'admin' && (svcUser?.department || '').toLowerCase().includes('sales');",
    "1a: isSales in SvcAuthContext"
)

# ISSUE 1b: Export isSales
patch(CTX,
    "<SvcAuthCtx.Provider value={{ svcUser, svcLogin, svcLogout, isSuperAdmin, isAdmin, isWorker, svcReady }}>",
    "<SvcAuthCtx.Provider value={{ svcUser, svcLogin, svcLogout, isSuperAdmin, isSales, isAdmin, isWorker, svcReady }}>",
    "1b: export isSales"
)

# ISSUE 1c: Import isSales in AdminDashboard
patch(AD,
    "const { svcUser, svcLogout, isSuperAdmin } = useSvcAuth();",
    "const { svcUser, svcLogout, isSuperAdmin, isSales } = useSvcAuth();",
    "1c: import isSales in AdminDashboard"
)

# ISSUE 1d: Fix tab restriction
patch(AD,
    "  useEffect(() => {\n    const restricted = ['reports','profitability','users','sessions'];\n    if (!isSuperAdmin && restricted.includes(tab)) {\n      navigate('/service/admin/overview', { replace: true });\n    }\n  }, [tab, isSuperAdmin, navigate]);",
    "  useEffect(() => {\n    const superOnly = ['users','sessions'];\n    const salesOk   = ['reports','profitability'];\n    if (!isSuperAdmin && superOnly.includes(tab)) {\n      navigate('/service/admin/overview', { replace: true });\n    }\n    if (!isSuperAdmin && !isSales && salesOk.includes(tab)) {\n      navigate('/service/admin/overview', { replace: true });\n    }\n  }, [tab, isSuperAdmin, isSales, navigate]);",
    "1d: Sales admin can access reports + profitability"
)

# ISSUE 1e: Show reports/profitability in sidebar for Sales admins
patch(AD,
    "    ...(isSuperAdmin?[\n      {k:'reports',       icon:I.reports,  label:'Reports'},\n      {k:'profitability', icon:I.profit,   label:'Profitability'},\n      {k:'users',         icon:I.users,    label:'Users'},\n      {k:'sessions',      icon:I.sessions, label:'Sessions', badge:liveCount||null},\n    ]:[]),",
    "    ...((isSuperAdmin||isSales)?[\n      {k:'reports',       icon:I.reports,  label:'Reports'},\n      {k:'profitability', icon:I.profit,   label:'Profitability'},\n    ]:[]),\n    ...(isSuperAdmin?[\n      {k:'users',         icon:I.users,    label:'Users'},\n      {k:'sessions',      icon:I.sessions, label:'Sessions', badge:liveCount||null},\n    ]:[]),",
    "1e: Reports/Profitability visible to Sales admins"
)

# ISSUE 2: startTimer auto-assigns
patch(WD,
    "const startTimer = async (id) => {\n    setBusy(true);\n    try { await svcApi.post('/sessions/start', { ticket_id:id }); await loadActive(); await loadTickets(); }\n    catch(e){ alert(e.response?.data?.error || 'Failed'); }\n    finally { setBusy(false); }\n  };",
    "const startTimer = async (id, needsAssign=false) => {\n    setBusy(true);\n    try {\n      if (needsAssign) { await svcApi.post(`/tickets/${id}/self-assign`).catch(()=>{}); }\n      await svcApi.post('/sessions/start', { ticket_id:id });\n      await loadActive(); await loadTickets();\n    }\n    catch(e){ alert(e.response?.data?.error || 'Failed'); }\n    finally { setBusy(false); }\n  };",
    "2a: startTimer auto-assigns on unassigned tickets"
)

patch(WD,
    "      <button onClick={()=>startTimer(tk.id)} disabled={busy} className=\"flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60\">",
    "      <button onClick={()=>startTimer(tk.id, !tk.is_assigned_to_me)} disabled={busy} className=\"flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60\">",
    "2b: pass needsAssign flag to startTimer"
)

# ISSUE 3a: Backend PATCH /plc-type route
with open(ST) as f:
    st = f.read()
if 'plc-type' not in st:
    PLC = "\n/* PATCH /tickets/:id/plc-type */\nrouter.patch('/:id/plc-type', svcAuth(['plc','wireman','admin','superadmin']), async (req, res) => {\n  const { plc_type } = req.body;\n  if (!['site','remote'].includes(plc_type)) return res.status(400).json({ error: 'plc_type must be site or remote' });\n  try {\n    const { rows } = await pool.query(`UPDATE service_tickets SET plc_type=$1, updated_at=NOW() WHERE id=$2 RETURNING id, plc_type`, [plc_type, req.params.id]);\n    if (!rows.length) return res.status(404).json({ error: 'Ticket not found' });\n    req.io?.to('admins').emit('ticket:updated', { ticket_id: req.params.id, plc_type });\n    res.json(rows[0]);\n  } catch (e) { res.status(500).json({ error: e.message }); }\n});\n\n"
    st = st.replace('module.exports = router;', PLC + 'module.exports = router;')
    with open(ST, 'w') as f: f.write(st)
    print("OK  3a: PATCH /plc-type route"); OK += 1
else:
    print("SKIP 3a: already exists")

# ISSUE 3b: Backend POST /self-assign route
with open(ST) as f:
    st = f.read()
if 'self-assign' not in st:
    SA = "\n/* POST /tickets/:id/self-assign */\nrouter.post('/:id/self-assign', svcAuth(['plc','wireman']), async (req, res) => {\n  try {\n    const { rows: tk } = await pool.query(`SELECT id, status FROM service_tickets WHERE id=$1`, [req.params.id]);\n    if (!tk.length) return res.status(404).json({ error: 'Not found' });\n    if (!['Open','Assigned'].includes(tk[0].status)) return res.status(400).json({ error: 'Ticket not open' });\n    await pool.query(`INSERT INTO ticket_assignments (ticket_id, worker_id, role, assigned_by) VALUES ($1,$2,$3,$2) ON CONFLICT DO NOTHING`, [req.params.id, req.svcUser.id, req.svcUser.role]);\n    await pool.query(`UPDATE service_tickets SET status='Assigned', updated_at=NOW() WHERE id=$1 AND status='Open'`, [req.params.id]);\n    req.io?.to('admins').emit('ticket:updated', { ticket_id: req.params.id });\n    res.json({ ok: true });\n  } catch (e) { res.status(500).json({ error: e.message }); }\n});\n\n"
    st = st.replace('module.exports = router;', SA + 'module.exports = router;')
    with open(ST, 'w') as f: f.write(st)
    print("OK  3b: POST /self-assign route"); OK += 1
else:
    print("SKIP 3b: already exists")

# ISSUE 3c: Frontend PLC type toggle in TicketDetailPage
# Add toggle buttons right after the ticket info grid
patch(TDP,
    "              {ticket.description && (",
    """              {/* PLC type toggle — visible to workers and admins when PLC is required */}
              {ticket.needs_plc && (isWorker || isPrivileged) && (
                <div className="mt-4 flex items-center gap-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PLC Type</p>
                  <div className="flex gap-2">
                    {[['site','🏭 On-site'],['remote','💻 Remote']].map(([v,l]) => (
                      <button key={v} type="button"
                        onClick={async () => {
                          try {
                            await svcApi.patch(`/tickets/${ticket.id}/plc-type`, { plc_type: v });
                            onAnyChange?.();
                          } catch(e) { alert(e.response?.data?.error || 'Failed'); }
                        }}
                        className={`px-3 py-1.5 text-[11px] font-bold rounded-xl border-2 transition-all ${
                          ticket.plc_type === v
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-400'
                        }`}>
                        {l}
                      </button>
                    ))}
                  </div>
                  {!ticket.plc_type && <span className="text-[10px] text-amber-600 font-bold">⚠ Please select type</span>}
                </div>
              )}

              {ticket.description && (""",
    "3c: PLC type toggle buttons in ticket detail"
)

print(f"\n{'='*50}")
print(f"Results: {OK} applied, {FAIL} failed")
print(f"{'='*50}")
