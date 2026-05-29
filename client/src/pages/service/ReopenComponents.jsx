import React, { useState, useEffect, useCallback } from 'react';
import svcApi from '../../serviceApi';

/* ════════════════════════════════════════════════════════════════════
   Reopen ticket — modal + history components.
   Used by AdminDashboard. Backend:
     PATCH /tickets/:id/reopen   { reason }   → admin/superadmin only
     GET   /tickets/:id/reopens                → list of reopen events
   ════════════════════════════════════════════════════════════════════ */

const QUICK_REASONS = [
  'Customer reported issue again',
  'Incomplete fix',
  'Additional scope requested',
  'Warranty claim',
  'Wrong diagnosis',
  'Customer not satisfied',
];


/* ─── REOPEN MODAL ─── */
export function ReopenModal({ ticket, open, onClose, onSuccess }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setReason(''); setSaving(false); } }, [open]);

  if (!open || !ticket) return null;

  const canSubmit = reason.trim().length > 0 && !saving;
  const reopenCount = Number(ticket.reopen_count || 0);

  const handleSave = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await svcApi.patch(`/tickets/${ticket.id}/reopen`, { reason: reason.trim() });
      onSuccess?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to reopen');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in"
         onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl shadow-slate-900/30 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-md shadow-amber-500/20 flex-shrink-0">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 truncate">Reopen Ticket</h3>
                <p className="text-[11px] text-slate-400">Sends back to "In Progress"</p>
              </div>
            </div>
            <button onClick={onClose} disabled={saving} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all flex-shrink-0 disabled:opacity-50">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">

          {/* Ticket badge */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
            <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{ticket.ticket_id}</span>
            <span className="text-xs font-bold text-slate-700 truncate flex-1">{ticket.customer_name}</span>
            <span className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full">was {ticket.status}</span>
          </div>

          {/* Repeat-reopen warning */}
          {reopenCount > 0 && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
              <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <p className="text-[11px] font-black text-amber-700">Already reopened {reopenCount}× before</p>
                <p className="text-[10px] text-amber-600 mt-0.5">Check the Reopen History panel below to see prior reasons before adding another.</p>
              </div>
            </div>
          )}

          {/* Quick-pick chips */}
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Quick pick</p>
            <div className="flex flex-wrap gap-2">
              {QUICK_REASONS.map(r => (
                <button key={r} onClick={()=>setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                    reason===r
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'
                  }`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Free-text reason */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3} value={reason} onChange={e=>setReason(e.target.value)}
              placeholder="Describe why this ticket needs to be reopened…"
              autoFocus
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white transition-all resize-none"/>
            <p className="text-[10px] text-slate-400 mt-1.5">The reason is permanently recorded in the reopen history.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-60">
            Cancel
          </button>
          <button onClick={handleSave} disabled={!canSubmit}
            className="flex-1 py-3 bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-bold text-sm rounded-2xl shadow-md shadow-amber-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Reopening…' : 'Reopen Ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}


/* ─── REOPEN HISTORY PANEL ─── */
/* Shown inside the ticket-expand when reopen_count > 0. Optionally pulls
   the "prior work context" from /tickets/:id/full and shows it collapsed. */
export function ReopenHistory({ ticketId, reopenCount }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showContext, setShowContext] = useState(false);
  const [ctx, setCtx]         = useState(null);
  const [ctxLoading, setCtxLoading] = useState(false);

  const load = useCallback(async () => {
    try { const { data } = await svcApi.get(`/tickets/${ticketId}/reopens`); setList(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const loadContext = async () => {
    if (ctx) { setShowContext(s => !s); return; }
    setCtxLoading(true); setShowContext(true);
    try { const { data } = await svcApi.get(`/tickets/${ticketId}/full`); setCtx(data); }
    catch (e) { console.error(e); }
    finally { setCtxLoading(false); }
  };

  if (!reopenCount || reopenCount === 0) return null;
  if (loading) return <div className="bg-amber-50/40 rounded-2xl p-4 mb-3 animate-pulse h-16"/>;

  return (
    <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
        <p className="text-xs font-black text-amber-700">Reopen History</p>
        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full">
          {reopenCount}× reopened
        </span>
        <button onClick={loadContext}
          className="ml-auto text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50">
          {showContext ? 'Hide prior work' : 'View prior work →'}
        </button>
      </div>

      {/* Reopen events */}
      <div className="space-y-2">
        {list.length === 0 ? (
          <p className="text-[11px] text-amber-700 italic">No history rows yet — possibly an older reopen before history tracking.</p>
        ) : list.map((r, idx) => (
          <div key={r.id} className="bg-white rounded-xl border border-amber-100 px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[9px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">#{list.length - idx}</span>
              <span className="text-[11px] font-bold text-slate-700">{r.reopened_by_name || 'Unknown'}</span>
              {r.reopened_by_role && <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{r.reopened_by_role}</span>}
              <span className="text-[9px] text-slate-400">
                from {r.prev_status} · {new Date(r.reopened_at).toLocaleString('en-IN',{day:'numeric',month:'short',year:'2-digit',hour:'2-digit',minute:'2-digit'})}
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">{r.reason}</p>
          </div>
        ))}
      </div>

      {/* Prior work context (collapsible) */}
      {showContext && (
        <div className="mt-4 pt-3 border-t border-amber-200 space-y-3">
          {ctxLoading ? (
            <div className="h-20 bg-white rounded-xl animate-pulse"/>
          ) : !ctx ? (
            <p className="text-[11px] text-slate-500">Could not load prior work.</p>
          ) : (
            <>
              {/* Sessions */}
              {ctx.sessions?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Prior sessions ({ctx.sessions.length})</p>
                  <div className="space-y-1">
                    {ctx.sessions.map(s => {
                      const hrs = (Number(s.total_seconds||0)/3600);
                      return (
                        <div key={s.id} className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-bold text-slate-700">{s.worker_name}</span>
                          <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">{s.status}</span>
                          <span className="text-[10px] text-slate-500">{hrs>=1?`${hrs.toFixed(1)}h`:`${Math.round(hrs*60)}m`}</span>
                          <span className="text-[9px] text-slate-400 ml-auto">{new Date(s.started_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Billing */}
              {ctx.billing?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Prior billing ({ctx.billing.length})</p>
                  <div className="space-y-1">
                    {ctx.billing.map(b => (
                      <div key={b.worker_id} className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5 flex items-center gap-2 flex-wrap text-[11px]">
                        <span className="font-bold text-slate-700">{b.worker_name || b.worker_id?.slice(0,6)}</span>
                        {b.charged_amount != null && <span className="font-black text-slate-900">₹{Number(b.charged_amount).toLocaleString('en-IN')}</span>}
                        {b.expense_amount > 0 && <span className="text-amber-600 font-bold">+exp ₹{Number(b.expense_amount).toLocaleString('en-IN')}</span>}
                        {b.completion_report_path && <span className="text-[9px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">report ✓</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Challans */}
              {ctx.challans?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Prior challans ({ctx.challans.length})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ctx.challans.map(c => (
                      <span key={c.id} className="font-mono text-[10px] font-bold text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">
                        {c.challan_no || (c.file_name || 'file')}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {ctx.notes?.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">Prior notes ({ctx.notes.length})</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {ctx.notes.map(n => (
                      <div key={n.id} className="bg-white rounded-lg border border-slate-200 px-2.5 py-1.5">
                        <p className="text-[11px] text-slate-700">{n.body}</p>
                        <p className="text-[9px] text-slate-400 mt-0.5">{n.author_name || ''} · {new Date(n.created_at).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documents count */}
              {ctx.documents?.length > 0 && (
                <p className="text-[10px] text-slate-500">+ {ctx.documents.length} prior document{ctx.documents.length>1?'s':''} attached</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}