import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Link, useParams, useNavigate } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';

import { ChallanPanel, InvoiceEditor } from './ChallanInvoice';
import { ReopenModal, ReopenHistory }  from './ReopenComponents';
import NotesPanel from './NotesPanel';
import ScheduledTasksPanel from './ScheduledTasksPanel';

const inrFmt = n => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

/* ─── Portal helper — escapes any ancestor stacking context (sticky/blur headers) ─── */
const Portal = ({ children }) => createPortal(children, document.body);

/* ════════════════════════════════════════════════════════════════════
   SHARED ticket detail page. Mounted at:
     /service/admin/tickets/:ticketId   (admin actions enabled)
     /service/worker/tickets/:ticketId  (worker actions enabled)

   Two-step closure (phase 5):
     In Progress → Report Submitted (worker submits) → Closed (admin/creator)
   Workers can't act once status is Report Submitted (their work is done).
   Only the ticket creator OR a superadmin can Close or Reopen.
   ════════════════════════════════════════════════════════════════════ */

/* ─── tiny helpers ─── */
const fmt = (s) => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`; };
const fmtH = s => s>=3600?`${(s/3600).toFixed(1)}h`:s>0?`${Math.round(s/60)}m`:'—';
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) : '—';


const PRI = { High:'bg-red-50 text-red-600 border-red-200', Medium:'bg-amber-50 text-amber-600 border-amber-200', Low:'bg-emerald-50 text-emerald-600 border-emerald-200' };

const STA = {
  Open:                'bg-slate-100 text-slate-500',
  Assigned:            'bg-blue-50 text-blue-700',
  'In Progress':       'bg-amber-50 text-amber-700',
  'Report Submitted':  'bg-orange-50 text-orange-700 border border-orange-200',
  Completed:           'bg-emerald-50 text-emerald-700',
  Closed:              'bg-slate-100 text-slate-500',
};
const TERMINAL  = ['Completed','Closed'];                          // closed/completed; no closure action needed
const WORKER_DONE = ['Completed','Closed','Report Submitted'];     // worker view: their hands-on work is finished

const PAUSE_REASONS = [
  ['Lunch Break',             'lunch_break'],
  ['Tea Break',               'tea_break'],
  ['Material Unavailable',    'material_shortage'],
  ['Waiting for Instructions','awaiting_instructions'],
  ['Site Issue',              'site_issue'],
  ['Other',                   'other'],
];


/* ───────────────────────────────────────────────────────────────────
   Worker actions: timer + complete flow scoped to ONE ticket.
   ─────────────────────────────────────────────────────────────────── */
function WorkerActions({ ticket, billing, onAnyChange }) {
  const [sess, setSess]       = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [reason, setReason]   = useState('');
  const [reasonCat, setReasonCat] = useState('other');
  const [completionOpen, setCompletionOpen] = useState(false);
  const [busy, setBusy]       = useState(false);
  const ticker = useRef(null);

  // Worker considers their work finished once status moves to Report Submitted or beyond
  const workerDone = WORKER_DONE.includes(ticket.status);
  const isWarranty = ticket.warranty_status === 'in_warranty';

  const { svcUser, can } = useSvcAuth();
  const myBilling = (billing || []).find(b => b.worker_id === svcUser?.id);
  const hasCompleted = !!myBilling?.completed_by_worker_at;

  const loadActive = useCallback(async () => {
    try {
      const { data } = await svcApi.get('/sessions/active');
      const arr = Array.isArray(data) ? data : (data ? [data] : []);
      const mine = arr.find(s => s.svc_ticket_id === ticket.id);
      setSess(mine || null);
      if (mine?.status === 'running') {
        setElapsed((mine.total_seconds||0) + Math.floor((Date.now() - new Date(mine.started_at).getTime())/1000));
      } else if (mine?.status === 'paused') {
        setElapsed(mine.total_seconds || 0);
      } else {
        setElapsed(0);
      }
    } catch (e) { console.error(e); }
  }, [ticket.id]);

  useEffect(() => { loadActive(); }, [loadActive]);

  useEffect(() => {
    if (sess?.status === 'running') ticker.current = setInterval(() => setElapsed(e=>e+1), 1000);
    else clearInterval(ticker.current);
    return () => clearInterval(ticker.current);
  }, [sess?.status]);

  const start = async () => {
    setBusy(true);
    try { await svcApi.post('/sessions/start', { ticket_id: ticket.id }); await loadActive(); onAnyChange?.(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };
  const pause = async () => {
    if (!reason.trim()) { alert('Please enter a reason'); return; }
    setBusy(true);
    try {
      await svcApi.post(`/sessions/${sess.id}/pause`, { reason, reason_category: reasonCat });
      setPauseOpen(false); setReason(''); setReasonCat('other');
      await loadActive();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };
  const resume = async () => {
    setBusy(true);
    try { await svcApi.post(`/sessions/${sess.id}/resume`); await loadActive(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!window.confirm('Stop & save this session?')) return;
    setBusy(true);
    try { await svcApi.post(`/sessions/${sess.id}/stop`); await loadActive(); onAnyChange?.(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };
  const completeNow = async () => {
    if (!window.confirm('Mark this ticket complete?')) return;
    setBusy(true);
    try { await svcApi.patch(`/tickets/${ticket.id}/complete`); onAnyChange?.(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  if (workerDone) {
    const label = ticket.status === 'Report Submitted' ? 'Report submitted · awaiting closure' : 'Task completed';
    const palette = ticket.status === 'Report Submitted'
      ? 'text-orange-700 bg-orange-50 border-orange-200'
      : 'text-emerald-700 bg-emerald-50 border-emerald-200';
    return (
      <span className={`inline-flex items-center gap-2 text-xs font-bold border rounded-2xl px-4 py-2.5 ${palette}`}>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        {label}
      </span>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Timer block */}
        {!sess ? (
          <button onClick={start} disabled={busy}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Start Timer
          </button>
        ) : (
          <>
            <div className={`font-mono text-base font-black tabular-nums min-w-[90px] ${sess.status==='running'?'text-emerald-700':'text-amber-600'}`}>
              {fmt(elapsed)}
            </div>
            {sess.status === 'running'
              ? <button onClick={()=>setPauseOpen(true)} disabled={busy}
                  className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center disabled:opacity-60" title="Pause">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                </button>
              : <button onClick={resume} disabled={busy}
                  className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 flex items-center justify-center disabled:opacity-60" title="Resume">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>
                </button>}
            <button onClick={stop} disabled={busy}
              className="w-9 h-9 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center justify-center disabled:opacity-60" title="Stop">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
            </button>
          </>
        )}

        {/* Complete flow */}
        {isWarranty ? (
          <button onClick={completeNow} disabled={busy}
            className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-2xl hover:bg-emerald-100 disabled:opacity-60">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Mark Complete (Warranty)
          </button>
        ) : hasCompleted ? (
          <>
            <span className="ml-2 inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              Report submitted{myBilling.expense_amount > 0 ? ` · exp ${inrFmt(myBilling.expense_amount)}` : ''}
            </span>
            <button onClick={completeNow} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 disabled:opacity-60">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              Mark Complete
            </button>
          </>
        ) : (
          <button onClick={()=>setCompletionOpen(true)} disabled={busy}
            className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 disabled:opacity-60">
            <span>📋</span>Complete & Report
          </button>
        )}
      </div>

      {/* Pause modal — portaled out so the sticky/blur header can't trap it */}
      {pauseOpen && (
        <Portal>
          <div className="fixed inset-0 z-[100] overflow-y-auto"
               onClick={e=>e.target===e.currentTarget && setPauseOpen(false)}>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={()=>setPauseOpen(false)}/>
            <div className="relative min-h-full flex items-end sm:items-center justify-center p-4 pointer-events-none">
              <div className="relative bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col pointer-events-auto">
                <div className="px-6 py-5 border-b border-slate-100 flex-shrink-0">
                  <h3 className="text-base font-black text-slate-900 mb-1">Pause Session</h3>
                  <p className="text-xs text-slate-400">Why are you pausing?</p>
                </div>
                <div className="px-6 py-5 overflow-y-auto">
                  <div className="flex flex-wrap gap-2 mb-4">
                    {PAUSE_REASONS.map(([label, cat]) => (
                      <button key={label} onClick={()=>{setReason(label); setReasonCat(cat);}}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border ${reason===label?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-600 border-slate-200'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <textarea rows={2} placeholder="Or describe the reason…" value={reason} onChange={e=>setReason(e.target.value)}
                    className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white resize-none"/>
                </div>
                <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
                  <button onClick={()=>setPauseOpen(false)} className="flex-1 py-3 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50">Cancel</button>
                  <button onClick={pause} disabled={busy||!reason.trim()} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl disabled:opacity-60">Confirm Pause</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {/* Completion modal */}
      {completionOpen && (
        <CompletionModal ticket={ticket} onClose={()=>setCompletionOpen(false)} onSuccess={()=>{ setCompletionOpen(false); onAnyChange?.(); }}/>
      )}
    </>
  );
}


/* ─── Completion modal (expense + report) — portaled ─── */
function CompletionModal({ ticket, onClose, onSuccess }) {
  const [expense,       setExpense]       = useState('');
  const [note,          setNote]          = useState('');
  const [reportFiles,   setReportFiles]   = useState([]);
  const [expenseFiles,  setExpenseFiles]  = useState([]);
  const [saving,        setSaving]        = useState(false);
  const reportRef  = useRef(null);
  const expenseRef = useRef(null);
  const numericExpense = expense === '' ? 0 : Number(expense);
  const hasExpense     = !isNaN(numericExpense) && numericExpense > 0;
  const valid          = reportFiles.length > 0 && (!hasExpense || expenseFiles.length > 0);
  const save = async () => {
    if (!reportFiles.length) { alert('Please attach at least one completion report.'); return; }
    if (hasExpense && !expenseFiles.length) { alert('Please attach expense proof file(s).'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      reportFiles.forEach(f => fd.append('report', f));
      fd.append('expense_amount', String(isNaN(numericExpense) ? 0 : numericExpense));
      if (note) fd.append('expense_note', note);
      expenseFiles.forEach(f => fd.append('expense_file', f));
      await svcApi.post(`/tickets/${ticket.id}/worker-completion`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onSuccess?.();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const MultiFileBox = ({ label, files, onAdd, onRemove, inputRef, required, accept, color='blue' }) => (
    <div>
      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
        {label} {required && <span className="text-red-500">*</span>}
        <span className="text-slate-400 font-normal normal-case ml-1">— multiple allowed</span>
      </label>
      <input ref={inputRef} type="file" multiple accept={accept} className="hidden"
        onChange={e => onAdd(Array.from(e.target.files))}/>
      {files.length === 0 ? (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-4 text-center hover:border-blue-400 hover:bg-blue-50/40 transition-all">
          <p className="text-xs font-bold text-slate-700">Tap to attach</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Photo · PDF · Doc · multiple allowed</p>
        </button>
      ) : (
        <div className="space-y-2">
          {files.map((f,i) => (
            <div key={i} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5">
              <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              <p className="text-xs font-black text-emerald-700 truncate flex-1">{f.name}</p>
              <span className="text-[10px] text-emerald-600">{(f.size/1024).toFixed(0)}KB</span>
              <button onClick={() => { onRemove(i); }}
                className="w-6 h-6 rounded-full bg-white border border-red-200 text-red-500 text-xs flex items-center justify-center flex-shrink-0">✕</button>
            </div>
          ))}
          <button type="button" onClick={() => inputRef.current?.click()}
            className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
            + Add another file
          </button>
        </div>
      )}
    </div>
  );

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose}/>
        <div className="relative min-h-full flex items-end sm:items-center justify-center p-4 pointer-events-none">
          <div className="relative bg-white rounded-[28px] w-full max-w-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col pointer-events-auto">

            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl shadow-md flex-shrink-0">📋</div>
                <div className="min-w-0">
                  <h3 className="text-base font-black text-slate-900">Submit Completion</h3>
                  <p className="text-[11px] text-slate-400">Expense + completion report</p>
                </div>
              </div>
              <button onClick={onClose} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-5 overflow-y-auto">

              {/* Ticket info */}
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
                <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{ticket.ticket_id}</span>
                <span className="text-xs font-bold text-slate-700 truncate flex-1">{ticket.customer_name}</span>
              </div>

              {/* Expense amount */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Your Expense (₹) <span className="text-slate-400 font-normal normal-case">— 0 if none</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400 pointer-events-none">₹</span>
                  <input type="number" min="0" step="1" value={expense}
                    onChange={e => { setExpense(e.target.value); if (!e.target.value || Number(e.target.value) === 0) setExpenseFile(null); }}
                    placeholder="0" autoFocus inputMode="numeric"
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black outline-none focus:border-blue-400 focus:bg-white"/>
                </div>
              </div>

              {/* Expense note */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Expense Note (optional)</label>
                <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Auto fare ₹200, relay ₹150"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white resize-none"/>
              </div>

              {/* Expense file — only shown when expense > 0 */}
              {hasExpense && (
                <div className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🧾</span>
                    <p className="text-xs font-black text-amber-700">Expense of ₹{numericExpense.toLocaleString('en-IN')} requires proof</p>
                  </div>
                  <MultiFileBox
                    label="Expense Proof"
                    files={expenseFiles}
                    onAdd={f => setExpenseFiles(prev => [...prev, ...f])}
                    onRemove={i => setExpenseFiles(prev => prev.filter((_,j)=>j!==i))}
                    inputRef={expenseRef}
                    required={true}
                    accept="image/*,application/pdf,.doc,.docx"
                  />
                </div>
              )}

              {/* Completion report — always required */}
              <MultiFileBox
                label="Completion Report"
                files={reportFiles}
                onAdd={f => setReportFiles(prev => [...prev, ...f])}
                onRemove={i => setReportFiles(prev => prev.filter((_,j)=>j!==i))}
                inputRef={reportRef}
                required={true}
                accept="image/*,application/pdf,.doc,.docx"
              />

              {/* Validation hint */}
              {!valid && (
                <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  <p className="text-[11px] text-red-600 font-medium">
                    {reportFiles.length === 0
                      ? '📋 Completion report is required'
                      : hasExpense && expenseFiles.length === 0
                      ? '🧾 Expense proof required when expense > ₹0'
                      : ''}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex gap-2 px-6 py-4 border-t border-slate-100 flex-shrink-0">
              <button onClick={onClose} disabled={saving}
                className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl disabled:opacity-60">Cancel</button>
              <button onClick={save} disabled={saving || !valid}
                className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl disabled:opacity-40">
                {saving ? 'Submitting…' : 'Submit & Complete →'}
              </button>
            </div>

          </div>
        </div>
      </div>
    </Portal>
  );
}


/* ═══════════════════════════════════════════════════════════════════ */
/* ───────────────────────  MAIN PAGE  ─────────────────────────────── */
/* ═══════════════════════════════════════════════════════════════════ */
export default function TicketDetailPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { svcUser, can } = useSvcAuth();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const isAdmin       = svcUser?.role === 'admin' || svcUser?.role === 'superadmin';
  const isSuperadmin  = svcUser?.role === 'superadmin';
  const isWorker      = svcUser?.role === 'plc' || svcUser?.role === 'wireman';
  const backUrl       = isAdmin ? '/service/admin/tickets' : '/service/worker/tasks';

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data } = await svcApi.get(`/tickets/${ticketId}/full`);
      setData(data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load ticket');
    } finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const closeTicket = async () => {
    if (!data?.ticket) return;
    if (!window.confirm(`Close ticket ${data.ticket.ticket_id}? This finalizes the work and locks billing.`)) return;
    setClosing(true);
    try {
      await svcApi.patch(`/tickets/${data.ticket.id}/close`);
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to close ticket');
    } finally {
      setClosing(false);
    }
  };

  // Live updates when anyone touches this ticket
  useSocket({
    'ticket:reopened':         (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'ticket:closed':           (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'ticket:report-submitted': (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'session:started':         (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'session:paused':          (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'session:resumed':         (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
    'session:completed':       (e)=>{ if (e?.ticket_id === data?.ticket?.id) load(); },
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F6F8] flex flex-col items-center justify-center px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-4 text-3xl">⚠</div>
        <p className="text-lg font-black text-slate-800">Couldn't load ticket</p>
        <p className="text-sm text-slate-500 mt-1">{error}</p>
        <button onClick={()=>navigate(backUrl)} className="mt-5 px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl">← Back</button>
      </div>
    );
  }

  const { ticket, sessions, billing, assignments } = data;
  const isWarranty   = ticket.warranty_status === 'in_warranty';
  const reopenCount  = Number(ticket.reopen_count || 0);
  const totalSeconds = sessions.reduce((a, s) => a + (Number(s.total_seconds)||0), 0);

  // Row-level closure gate
  const isCreator        = ticket.created_by === svcUser?.id;
  const canActOnClosure  = isCreator || isSuperadmin;

  return (
    <div className="min-h-screen bg-[#F5F6F8]">

      {/* Sticky header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-slate-200/60 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <button onClick={()=>navigate(backUrl)} className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0" title="Back">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-mono text-xs font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md">{ticket.ticket_id}</span>
            <span className="text-base font-black text-slate-900 truncate">{ticket.customer_name}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRI[ticket.priority]}`}>{ticket.priority}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STA[ticket.status]}`}>{ticket.status}</span>
            {isWarranty && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">🛡 Warranty</span>}
            {reopenCount > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">↻ Reopened {reopenCount}×</span>}

            {/* State-specific extra badges */}
            {ticket.status === 'Report Submitted' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">📋 Awaiting closure</span>
            )}
            {ticket.status === 'Closed' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">✓ Closed</span>
            )}
            {ticket.status === 'Completed' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Completed</span>
            )}
          </div>

          {/* Action area — role + row-level aware */}
          <div className="flex items-center gap-2 ml-auto flex-shrink-0">
            {isWorker && <WorkerActions ticket={ticket} billing={billing} onAnyChange={load}/>}

            {can('close_ticket') && ticket.status === 'Report Submitted' && (
              canActOnClosure ? (
                <button onClick={closeTicket} disabled={closing}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-2xl shadow-md shadow-emerald-500/20 transition-all disabled:opacity-60">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                  {closing ? 'Closing…' : 'Close Ticket'}
                </button>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 italic">
                  Only ticket creator can close
                </span>
              )
            )}

            {can('close_ticket') && TERMINAL.includes(ticket.status) && (
              canActOnClosure ? (
                <button onClick={()=>setReopenOpen(true)}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-xs font-bold rounded-2xl">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
                  Reopen
                </button>
              ) : (
                <span className="text-[10px] font-bold text-slate-400 italic">
                  Only ticket creator can reopen
                </span>
              )
            )}
          </div>
        </div>
      </header>

      {/* Two-column body */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-5 lg:py-7">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 lg:gap-6">

          {/* ============== LEFT COLUMN ============== */}
          <div className="space-y-5 min-w-0">

            {/* Ticket info */}
            <section className="bg-white rounded-3xl border border-slate-200/60 p-5">
              <h3 className="text-sm font-black text-slate-900 mb-4">Ticket info</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                {[
                  ['Service',    ticket.service_type?.replace(/_/g,' ')],
                  ['Created',    fmtDate(ticket.created_at)],
                  ['Sales agent',ticket.sales_agent || '—'],
                  ['Contact',    ticket.contact_name || '—'],
                  ['Phone',      ticket.contact_phone || '—'],
                  ['Designation',ticket.designation || '—'],
                  ['PLC',        ticket.needs_plc ? (ticket.plc_type === 'site' ? '🏭 On-site' : ticket.plc_type === 'remote' ? '💻 Remote' : 'Yes') : 'No'],
                  ['Wiring',     ticket.needs_wiring ? 'Yes' : 'No'],
                  ['Location',   ticket.address || '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">{k}</p>
                    <p className="text-xs font-bold text-slate-700 mt-0.5 capitalize break-words">{v}</p>
                  </div>
                ))}
              </div>

              {/* PLC type toggle — visible to workers and admins when PLC is required */}
              {ticket.needs_plc && (isWorker || can('assign_workers')) && (
                <div className="mt-4 flex items-center gap-3">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">PLC Type</p>
                  <div className="flex gap-2">
                    {[['site','🏭 On-site'],['remote','💻 Remote']].map(([v,l]) => (
                      <button key={v} type="button"
                        onClick={async () => {
                          try {
                            await svcApi.patch(`/tickets/${ticket.id}/plc-type`, { plc_type: v });
                            load();
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

              {ticket.description && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3">
                  <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-1">Description</p>
                  <p className="text-xs text-amber-900 leading-relaxed whitespace-pre-wrap">{ticket.description}</p>
                </div>
              )}

              {/* Team assigned chips */}
              {(ticket.plc_worker_names || ticket.wireman_worker_names) && (
                <div className="mt-4">
                  <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">Team assigned</p>
                  <div className="flex flex-wrap gap-2">
                    {ticket.plc_worker_names?.split(', ').filter(Boolean).map((n,i)=>(
                      <span key={`plc-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">🖥 {n}</span>
                    ))}
                    {ticket.wireman_worker_names?.split(', ').filter(Boolean).map((n,i)=>(
                      <span key={`wm-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">⚡ {n}</span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Worker Billing — admin sees full audit; worker sees a slim summary of THEIR row */}
            {can('view_billing') ? (
              <AdminBillingSection ticket={ticket} billing={billing} onChange={load}/>
            ) : (
              <WorkerBillingSummary svcUserId={svcUser?.id} billing={billing} ticketId={ticketId}/>
            )}

            {/* Invoice + Challans */}
            <section className="bg-white rounded-3xl border border-slate-200/60 p-5 space-y-4">
              <InvoiceEditor ticket={ticket} onSaved={load}/>
              <ChallanPanel ticketId={ticket.id}/>
            </section>

            {/* Sessions summary */}
            <section className="bg-white rounded-3xl border border-slate-200/60 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-slate-900">Sessions</h3>
                <span className="text-[11px] font-bold text-slate-500">{sessions.length} · {fmtH(totalSeconds)} total</span>
              </div>
              {sessions.length === 0 ? (
                <p className="text-center text-[11px] text-slate-400 py-3">No sessions yet</p>
              ) : (
                <div className="space-y-1.5">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-xs font-bold text-slate-700">{s.worker_name}</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${s.status==='running'?'bg-emerald-100 text-emerald-700':s.status==='paused'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{s.status}</span>
                      <span className="text-[11px] text-slate-500 ml-auto">{fmtH(s.total_seconds||0)}</span>
                      <span className="text-[10px] text-slate-400">{fmtDate(s.started_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="bg-white rounded-3xl border border-slate-200/60 p-5">
              <ScheduledTasksPanel ticketId={ticket.id}/>
            </section>
          </div>

          {/* ============== RIGHT COLUMN ============== */}
          <aside className="space-y-5 lg:sticky lg:top-[72px] lg:self-start lg:max-h-[calc(100vh-92px)] lg:overflow-y-auto">
            {/* Reopen history (only if >0) */}
            <ReopenHistory ticketId={ticket.id} reopenCount={reopenCount}/>

            {/* Notes thread */}
            <section className="bg-white rounded-3xl border border-slate-200/60 p-4">
              <NotesPanel ticketId={ticket.id} currentUserId={svcUser?.id}/>
            </section>
          </aside>
        </div>
      </main>

      {/* Reopen modal (admin only) */}
      {can('view_billing') && (
        <ReopenModal
          ticket={reopenOpen ? ticket : null}
          open={reopenOpen}
          onClose={()=>setReopenOpen(false)}
          onSuccess={()=>{ setReopenOpen(false); load(); }}
        />
      )}
    </div>
  );
}


/* ─── Admin's full billing audit ─── */
function AdminBillingSection({ ticket, billing, onChange }) {
  const isWarranty = ticket.warranty_status === 'in_warranty';

  if (isWarranty) {
    return (
      <section className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡</span>
          <p className="text-xs font-black text-violet-700">Warranty Service — Free</p>
        </div>
        <p className="text-[11px] text-violet-600 mt-1">No billing recorded for warranty tickets.</p>
      </section>
    );
  }

  return (
    <section className="bg-white rounded-3xl border border-slate-200/60 p-1">
      <BillingAuditMount ticketId={ticket.id} isWarranty={isWarranty} onChange={onChange}/>
    </section>
  );
}

function BillingAuditMount({ ticketId, isWarranty, onChange }) {
  const [Comp, setComp] = useState(null);
  useEffect(() => {
    import('./BillingAuditPanel')
      .then(m => setComp(() => m.default))
      .catch(() => setComp(null));
  }, []);
  if (!Comp) {
    return (
      <div className="p-4 text-xs text-slate-500">
        <p className="font-bold text-slate-700 mb-1">Worker Billing</p>
        <p>Extract <code>BillingAuditPanel</code> from <code>AdminDashboard.jsx</code> into <code>./BillingAuditPanel.jsx</code> (with a <code>export default</code>) so it can render here too.</p>
      </div>
    );
  }
  return <Comp ticketId={ticketId} isWarranty={isWarranty} isPrivileged={true} onChange={onChange}/>;
}



/* ═══════════════════════════════════════════════════════════════════
   MULTI FILE UPLOAD COMPONENT
   Allows workers to add multiple reports + expense files after initial submission
   ═══════════════════════════════════════════════════════════════════ */
function MultiFileUpload({ ticketId, workerId, onDone }) {
  const [open,      setOpen]      = useState(false);
  const [fileType,  setFileType]  = useState('report');
  const [files,     setFiles]     = useState([]);
  const [expense,   setExpense]   = useState('');
  const [note,      setNote]      = useState('');
  const [saving,    setSaving]    = useState(false);
  const [existing,  setExisting]  = useState([]);
  const inputRef = useRef(null);

  const fullUrl = (u) => {
    if (!u) return '#';
    if (u.startsWith('http')) return u;
    const isDev = window.location.hostname === 'localhost';
    const base = isDev ? 'http://localhost:5001' : `${window.location.protocol}//${window.location.hostname}`;
    return `${base}${u}`;
  };

  const loadFiles = async () => {
    try {
      const { data } = await svcApi.get(`/tickets/${ticketId}/worker-files`);
      setExisting(data.filter(f => f.worker_id === workerId));
    } catch {}
  };

  useEffect(() => { if (open) loadFiles(); }, [open]);

  const handleUpload = async () => {
    if (!files.length) { alert('Select at least one file'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file_type', fileType);
      if (expense) fd.append('expense_amount', expense);
      if (note)    fd.append('note', note);
      files.forEach(f => fd.append('files', f));
      await svcApi.post(`/tickets/${ticketId}/worker-files`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setFiles([]); setExpense(''); setNote('');
      loadFiles();
      onDone?.();
    } catch (e) { alert(e.response?.data?.error || 'Upload failed'); }
    finally { setSaving(false); }
  };

  const fileIcon = (path) => {
    const ext = path?.split('.').pop()?.toLowerCase();
    if (['jpg','jpeg','png','gif','webp'].includes(ext)) return '🖼';
    if (['pdf'].includes(ext)) return '📄';
    return '📎';
  };

  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg transition-all">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        {open ? 'Hide files' : `Add more files${existing.length ? ` (${existing.length} uploaded)` : ''}`}
      </button>

      {open && (
        <div className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
          {/* Existing files */}
          {existing.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Previously uploaded</p>
              <div className="space-y-1.5">
                {existing.map(f => (
                  <div key={f.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2">
                    <span className="text-sm">{fileIcon(f.file_path)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-slate-700 truncate">{f.original_name || f.file_path.split('/').pop()}</p>
                      <p className="text-[10px] text-slate-400">
                        {f.file_type === 'expense' ? `💸 Expense ₹${Number(f.expense_amount||0).toLocaleString('en-IN')}` : '📋 Report'}
                        {f.note && ` · ${f.note}`}
                      </p>
                    </div>
                    <a onClick={(e)=>{e.preventDefault();window.open(fullUrl(f.file_path),"_blank");}}
                       href={fullUrl(f.file_path)} target="_blank" rel="noopener noreferrer"
                       className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex-shrink-0">View</a>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload new files */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Upload new files</p>

            {/* File type toggle */}
            <div className="flex gap-2 mb-3">
              {[['report','📋 Report'],['expense','💸 Expense']].map(([v,l]) => (
                <button key={v} type="button" onClick={()=>setFileType(v)}
                  className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg border-2 transition-all ${fileType===v?'border-slate-900 bg-slate-900 text-white':'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  {l}
                </button>
              ))}
            </div>

            {/* Expense amount (only for expense type) */}
            {fileType === 'expense' && (
              <div className="mb-2">
                <input type="number" min="0" value={expense} onChange={e=>setExpense(e.target.value)}
                  placeholder="Expense amount (₹)"
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400"/>
              </div>
            )}

            {/* Note */}
            <div className="mb-2">
              <input type="text" value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400"/>
            </div>

            {/* File selector */}
            <input ref={inputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx"
              className="hidden" onChange={e=>setFiles(Array.from(e.target.files))}/>
            {files.length === 0 ? (
              <button type="button" onClick={()=>inputRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-xl py-3 text-[11px] text-slate-500 hover:border-slate-400 hover:bg-white transition-all">
                Tap to select files
              </button>
            ) : (
              <div className="space-y-1 mb-2">
                {files.map((f,i) => (
                  <div key={i} className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                    <span className="text-sm">📎</span>
                    <span className="text-[11px] text-slate-700 truncate flex-1">{f.name}</span>
                    <button onClick={()=>setFiles(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 text-xs">✕</button>
                  </div>
                ))}
                <button type="button" onClick={()=>inputRef.current?.click()}
                  className="text-[10px] text-blue-600 font-bold">+ Add more</button>
              </div>
            )}

            <button type="button" onClick={handleUpload} disabled={saving || !files.length}
              className="w-full mt-2 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-xl disabled:opacity-40 transition-all">
              {saving ? 'Uploading…' : `Upload ${files.length || ''} file${files.length!==1?'s':''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Worker's slim billing summary (no edit) ─── */
function WorkerBillingSummary({ svcUserId, billing, ticketId }) {
  const mine = (billing || []).find(b => b.worker_id === svcUserId);
  if (!mine) return null;
  const hasReport  = !!(mine.completion_report_path || mine.report_url);
  const hasCharged = mine.charged_amount != null;
  const fullUrl = (u) => {
    if (!u) return '#';
    if (u.startsWith('http')) return u;
    const isDev = window.location.hostname === 'localhost';
    const base =`${window.location.protocol}//${window.location.hostname}`;
    return `${base}${u}`;
  };
  return (
    <section className="bg-white rounded-3xl border border-slate-200/60 p-4">
      <p className="text-xs font-black text-slate-700 mb-2">Your billing on this ticket</p>
      <div className="flex flex-wrap items-center gap-2">
        {hasReport && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Report submitted
          </span>
        )}
        {Number(mine.expense_amount||0) > 0 && (
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            Expense {inrFmt(mine.expense_amount)}
          </span>
        )}
        {/* File links */}
        {/* All report files */}
        {(mine.all_report_files?.length ? mine.all_report_files : (mine.report_url||mine.completion_report_path) ? [{url:mine.report_url||mine.completion_report_path}] : []).map((f,i) => (
          <a key={i} onClick={(e)=>{e.preventDefault();window.open(fullUrl(f.url),"_blank");}}
             href={fullUrl(f.url)} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Report {mine.all_report_files?.length > 1 ? i+1 : ''}
          </a>
        ))}
        {/* All expense files */}
        {(mine.all_expense_files?.length ? mine.all_expense_files : mine.expense_file_url ? [{url:mine.expense_file_url}] : []).map((f,i) => (
          <a key={i} onClick={(e)=>{e.preventDefault();window.open(fullUrl(f.url),"_blank");}}
             href={fullUrl(f.url)} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            Expense {mine.all_expense_files?.length > 1 ? i+1 : 'proof'}
          </a>
        ))}
        {/* {hasCharged
          ? <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-full">Customer charged {inrFmt(mine.charged_amount)}</span>
          : <span className="text-[11px] font-bold text-slate-500 italic">Charge will be entered by admin</span>} */}
      </div>
      {/* Add more files button */}
      {hasReport && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <MultiFileUpload ticketId={ticketId} workerId={svcUserId} onDone={()=>{}} />
        </div>
      )}
    </section>
  );
}