#!/usr/bin/env python3
"""
Frontend patches for all 6 changes.
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
            return True
        else:
            print(f"❌ NOT FOUND: {label}")
            FAIL += 1
            return False
    except FileNotFoundError:
        print(f"❌ FILE NOT FOUND: {path}")
        FAIL += 1
        return False

B = '.'

# ══════════════════════════════════════════════════════════════════════
# CHANGE 1 — PLC On-site/Remote in worker ticket info row
# The old version uses different format — find actual string first
# ══════════════════════════════════════════════════════════════════════
WD = f'{B}/client/src/pages/service/WorkerDashboard.jsx'
with open(WD, 'r') as f:
    wd_content = f.read()

# find the actual plc_type line
import re
plc_lines = [(i+1, l) for i,l in enumerate(wd_content.split('\n')) if 'plc_type' in l or 'needs_plc' in l]
print("PLC lines found:")
for ln, l in plc_lines[:5]:
    print(f"  {ln}: {l.strip()[:100]}")

# Try multiple variants
plc_variants = [
    ("tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No'",
     "tk.needs_plc?(tk.plc_type==='site'?'🏭 On-site':tk.plc_type==='remote'?'💻 Remote':'Yes'):'No'"),
    ('tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:"Yes"):"No"',
     "tk.needs_plc?(tk.plc_type==='site'?'🏭 On-site':tk.plc_type==='remote'?'💻 Remote':'Yes'):'No'"),
]
for old, new in plc_variants:
    if old in wd_content:
        wd_content = wd_content.replace(old, new, 1)
        with open(WD, 'w') as f:
            f.write(wd_content)
        print("✅ Change 1: PLC badge labels")
        OK += 1
        break
else:
    print("⚠ Change 1: Could not auto-patch — see manual instructions below")

# ══════════════════════════════════════════════════════════════════════
# CHANGE 2 — IRC cost column in workers tab of AdminDashboard
# Show IRC daily rate and monthly salary for Sales dept admins
# ══════════════════════════════════════════════════════════════════════
AD = f'{B}/client/src/pages/service/AdminDashboard.jsx'

# Add IRC column header to workers table
patch(AD,
    "['Name','Role','Department','Phone','Actions'].map(h=><th",
    "['Name','Role','Department','Phone','Salary','IRC/Day','Actions'].map(h=><th",
    "Change 2a: IRC column header in workers table"
)

# Add IRC data cells in workers table rows — find the worker row
patch(AD,
    "<td className=\"px-4 py-3 text-xs text-slate-500\">{w.department||'—'}</td>\n                      <td className=\"px-4 py-3 text-xs text-slate-500\">{w.phone||'—'}</td>",
    """<td className="px-4 py-3 text-xs text-slate-500">{w.department||'—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{w.phone||'—'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">{w.monthly_salary ? `₹${Number(w.monthly_salary).toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-600">{w.irc_daily_rate ? `₹${Number(w.irc_daily_rate).toLocaleString('en-IN')}` : '—'}</td>""",
    "Change 2b: IRC data cells in workers table"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 4 — Show half + full day rates in BillingAuditPanel suggestion
# ══════════════════════════════════════════════════════════════════════
BAP = f'{B}/client/src/pages/service/BillingAuditPanel.jsx'

patch(BAP,
    """                {sg && sg.hours}h · {sg.basis}""",
    """                {sg && sg.hours}h · {sg.basis}
                    {sg?.half_day_rate > 0 && <span className="text-[9px] font-bold text-slate-400">· ½day ₹{sg.half_day_rate.toLocaleString('en-IN')} · full ₹{sg.full_day_rate.toLocaleString('en-IN')}</span>}""",
    "Change 4: half/full day rates in billing suggestion badge"
)

# Also add half/full day rates to the rate card suggestion box
patch(BAP,
    """                      <span className="text-blue-700">Rate card suggests <span className="font-black">{inrFmt(sg.suggested_amount)}</span> <span className="text-blue-500">({sg.basis})</span></span>""",
    """                      <span className="text-blue-700">Rate card suggests <span className="font-black">{inrFmt(sg.suggested_amount)}</span> <span className="text-blue-500">({sg.basis})</span></span>
                      {sg.half_day_rate > 0 && (
                        <span className="text-blue-500 text-[10px] ml-2">
                          Half-day: <span className="font-black">₹{sg.half_day_rate.toLocaleString('en-IN')}</span>
                          {' · '}Full-day: <span className="font-black">₹{sg.full_day_rate.toLocaleString('en-IN')}</span>
                        </span>
                      )}""",
    "Change 4b: half/full day rates in rate card suggestion box"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 5 — Multiple files upload UI in TicketDetailPage
# Add "Add more files" button in WorkerBillingSummary section
# ══════════════════════════════════════════════════════════════════════
TDP = f'{B}/client/src/pages/service/TicketDetailPage.jsx'

# Add useState for multi-file modal after existing useState imports
patch(TDP,
    "import React, { useState, useRef, useEffect, useCallback } from 'react';",
    "import React, { useState, useRef, useEffect, useCallback } from 'react';",
    "Change 5 import (already correct)"
)

# Add multi-file upload section in WorkerBillingSummary
patch(TDP,
    """        {/* {hasCharged
          ? <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">Customer charged {inrFmt(mine.charged_amount)}</span>
          : <span className="text-[11px] font-bold text-slate-500 italic">Charge will be entered by admin</span>} */}
      </div>
    </section>""",
    """        {/* {hasCharged
          ? <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">Customer charged {inrFmt(mine.charged_amount)}</span>
          : <span className="text-[11px] font-bold text-slate-500 italic">Charge will be entered by admin</span>} */}
      </div>
      {/* Add more files button */}
      {hasReport && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <MultiFileUpload ticketId={ticketId} workerId={svcUserId} onDone={()=>{}} />
        </div>
      )}
    </section>""",
    "Change 5: Add more files button in WorkerBillingSummary"
)

# ══════════════════════════════════════════════════════════════════════
# CHANGE 6 — Bulk secret key reset button in Users tab
# ══════════════════════════════════════════════════════════════════════

# Add bulkResetKeys function near regenKey
patch(AD,
    "  const regenKey = async (u) => {",
    """  const [bulkResetModal, setBulkResetModal] = useState(false);
  const [bulkConfirm1,   setBulkConfirm1]   = useState('');
  const [bulkConfirm2,   setBulkConfirm2]   = useState('');
  const [bulkResult,     setBulkResult]     = useState(null);

  const bulkRegenKeys = async () => {
    if (bulkConfirm1 !== 'RESET ALL KEYS' || bulkConfirm2 !== 'RESET ALL KEYS') {
      alert('Both fields must say exactly: RESET ALL KEYS');
      return;
    }
    setBusy(true);
    try {
      const { data } = await svcApi.patch('/auth/users/bulk-regen-keys', {
        confirm1: bulkConfirm1,
        confirm2: bulkConfirm2,
      });
      setBulkResult(data.users);
      setBulkResetModal(false);
      setBulkConfirm1(''); setBulkConfirm2('');
      loadAllUsers();
      alert(`✅ Reset ${data.users.length} secret keys successfully!`);
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const regenKey = async (u) => {""",
    "Change 6a: bulk reset function and state"
)

# Add Reset All Keys button in the Users tab header
patch(AD,
    """                  <button onClick={()=>setAddUserM(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md">
                    <span className="w-3 h-3">{I.plus}</span>Add User
                  </button>""",
    """                  <div className="flex items-center gap-2">
                    <button onClick={()=>setBulkResetModal(true)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold rounded-xl transition-all">
                      🔄 Reset All Keys
                    </button>
                    <button onClick={()=>setAddUserM(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md">
                      <span className="w-3 h-3">{I.plus}</span>Add User
                    </button>
                  </div>""",
    "Change 6b: Reset All Keys button in Users tab header"
)

# Add Bulk Reset Modal before closing of AdminDashboard return
patch(AD,
    "      {/* ─── Key modal ─── */}",
    """      {/* ─── Bulk Reset Keys Modal ─── */}
      {bulkResetModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-md">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-red-100 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
              <div>
                <h3 className="text-base font-black text-slate-900">Reset All Secret Keys</h3>
                <p className="text-[11px] text-red-600 mt-0.5">This will change ALL users' login keys immediately</p>
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
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Type it again to confirm</label>
                <input type="text" value={bulkConfirm2} onChange={e=>setBulkConfirm2(e.target.value)}
                  placeholder="RESET ALL KEYS"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-red-400"/>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>{setBulkResetModal(false);setBulkConfirm1('');setBulkConfirm2('');}}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-semibold text-sm rounded-xl">Cancel</button>
              <button onClick={bulkRegenKeys} disabled={busy || bulkConfirm1!=='RESET ALL KEYS' || bulkConfirm2!=='RESET ALL KEYS'}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl disabled:opacity-40">
                {busy ? 'Resetting…' : '🔄 Reset All Keys'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Key modal ─── */}""",
    "Change 6c: Bulk Reset Keys Modal"
)

print(f"\n{'='*50}")
print(f"Results: {OK} applied, {FAIL} failed")
print(f"{'='*50}")
