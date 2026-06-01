#!/usr/bin/env python3
"""
Fix remaining failed patches.
Run from: /Users/meetdhola/Downloads/cess-service-v3
"""

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
        print(f"❌ FILE: {path}")
        FAIL += 1

B = '.'
AD  = f'{B}/client/src/pages/service/AdminDashboard.jsx'
WD  = f'{B}/client/src/pages/service/WorkerDashboard.jsx'
BAP = f'{B}/client/src/pages/service/BillingAuditPanel.jsx'

# ── CHANGE 1: PLC badge labels in WorkerDashboard ──────────────────
# Find exact string from file
with open(WD) as f:
    wd = f.read()
for ln, l in enumerate(wd.split('\n')):
    if 'plc_type' in l and 'PLC Required' in l:
        print(f"PLC line {ln+1}: {l.strip()[:120]}")

# Try the exact backtick version
old1 = "tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No'"
new1 = "tk.needs_plc?(tk.plc_type==='site'?'🏭 On-site':tk.plc_type==='remote'?'💻 Remote':'Yes'):'No'"
if old1 in wd:
    wd = wd.replace(old1, new1, 1)
    with open(WD, 'w') as f:
        f.write(wd)
    print("✅ Change 1: PLC badge labels")
    OK += 1
else:
    print("❌ Change 1: exact string not found in WorkerDashboard")
    FAIL += 1

# ── CHANGE 2: IRC columns in workers table ─────────────────────────
# From grep: line 2051 has department, line 2052 has phone
patch(AD,
    """          <td className="px-4 py-3 text-slate-600">{w.department||'—'}</td>
          <td className="px-4 py-3 text-slate-600 font-mono">{w.phone}</td>""",
    """          <td className="px-4 py-3 text-slate-600">{w.department||'—'}</td>
          <td className="px-4 py-3 text-slate-600 font-mono">{w.phone}</td>
          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{w.monthly_salary?`₹${Number(w.monthly_salary).toLocaleString('en-IN')}`:'—'}</td>
          <td className="px-4 py-3 text-slate-600 font-mono text-xs">{w.irc_daily_rate?`₹${Number(w.irc_daily_rate).toLocaleString('en-IN')}`:'—'}</td>""",
    "Change 2b: IRC data cells"
)

# Also add headers — find the workers table header row
with open(AD) as f:
    ad = f.read()
# Find the header row near the workers table
for ln, l in enumerate(ad.split('\n')):
    if 'Name' in l and 'Department' in l and 'Phone' in l and 'th' in l and ln > 2000:
        print(f"Workers header line {ln+1}: {l.strip()[:120]}")

patch(AD,
    "['Name','Role','Department','Phone','Actions']",
    "['Name','Role','Department','Phone','Salary/mo','IRC/day','Actions']",
    "Change 2a: IRC column headers"
)

# ── CHANGE 4: half/full day rates badge in BillingAuditPanel ──────
# From grep: line 128 has sg.hours + sg.basis
patch(BAP,
    "                    {sg.hours}h · {sg.basis}",
    """                    {sg.hours}h · {sg.basis}
                    {sg?.half_day_rate > 0 && (
                      <> · <span className="text-slate-400">½d ₹{(sg.half_day_rate||0).toLocaleString('en-IN')} · full ₹{(sg.full_day_rate||0).toLocaleString('en-IN')}</span></>
                    )}""",
    "Change 4: half/full day rates in hours badge"
)

# ── CHANGE 6c: Bulk Reset Modal ────────────────────────────────────
# From grep: keyModal is at line 2410 with {keyModal && (
patch(AD,
    "      {keyModal && (",
    """      {/* ─── Bulk Reset Keys Modal ─── */}
      {bulkResetModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
              <div>
                <h3 className="text-base font-black text-slate-900">Reset All Secret Keys</h3>
                <p className="text-[11px] text-red-600 mt-0.5">This changes ALL users login keys immediately</p>
              </div>
            </div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Type "RESET ALL KEYS" to confirm</label>
                <input type="text" value={bulkConfirm1} onChange={e=>setBulkConfirm1(e.target.value)}
                  placeholder="RESET ALL KEYS"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Type it again</label>
                <input type="text" value={bulkConfirm2} onChange={e=>setBulkConfirm2(e.target.value)}
                  placeholder="RESET ALL KEYS"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400"/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setBulkResetModal(false);setBulkConfirm1('');setBulkConfirm2('');}}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl">Cancel</button>
              <button onClick={bulkRegenKeys} disabled={busy||bulkConfirm1!=='RESET ALL KEYS'||bulkConfirm2!=='RESET ALL KEYS'}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl disabled:opacity-40">
                {busy?'Resetting…':'🔄 Reset All Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

      {keyModal && (""",
    "Change 6c: Bulk Reset Keys Modal"
)

# ── Also remove duplicate bulkResetModal state (applied twice) ────
with open(AD) as f:
    ad = f.read()
# Count occurrences
count = ad.count("const [bulkResetModal, setBulkResetModal] = useState(false);")
print(f"bulkResetModal state declarations: {count}")
if count > 1:
    # Remove the second one
    first = ad.index("const [bulkResetModal, setBulkResetModal] = useState(false);")
    second = ad.index("const [bulkResetModal, setBulkResetModal] = useState(false);", first + 1)
    # Remove lines around second occurrence
    lines = ad.split('\n')
    clean = []
    skip_next = False
    removed = 0
    for line in lines:
        if removed < count - 1 and "const [bulkResetModal, setBulkResetModal] = useState(false);" in line:
            removed += 1  # skip first occurrence only
            skip_next = False
            clean.append(line)
        elif removed == count - 1 and "const [bulkResetModal, setBulkResetModal] = useState(false);" in line:
            removed += 1  # skip duplicate
            print("Removed duplicate bulkResetModal declaration")
            OK += 1
        else:
            clean.append(line)
    with open(AD, 'w') as f:
        f.write('\n'.join(clean))

# Also remove duplicate bulkConfirm1/2 states
with open(AD) as f:
    ad = f.read()
for state in ["const [bulkConfirm1,   setBulkConfirm1]   = useState('');",
              "const [bulkConfirm2,   setBulkConfirm2]   = useState('');",
              "const [bulkResult,     setBulkResult]     = useState(null);"]:
    count = ad.count(state)
    if count > 1:
        idx = ad.index(state)
        idx2 = ad.index(state, idx + 1)
        ad = ad[:idx2] + ad[idx2 + len(state) + 1:]
        print(f"Removed duplicate: {state[:40]}")

with open(AD, 'w') as f:
    f.write(ad)

print(f"\n{'='*50}")
print(f"Results: {OK} applied, {FAIL} failed")
print(f"{'='*50}")
