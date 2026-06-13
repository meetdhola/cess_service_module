import React, { useState, useEffect } from 'react';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';

/* ════════════════════════════════════════════════════════════════════
   AdminDashboard.jsx — REPLACE the entire BillingAuditPanel function
   with this version. Adds:
     • Worker's submitted expense (with note)
     • "View report" link to the completion report file
     • Inline RATE CARD suggestion + "Use" one-tap prefill button
     • Admin still types the actual customer-paid amount in the input
   ════════════════════════════════════════════════════════════════════ */
   const inrFmt = n => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

export default function BillingAuditPanel({ ticketId, isWarranty, isPrivileged }) {
  const { can } = useSvcAuth();
  const [data, setData]             = useState(null);
  const [suggest, setSuggest]       = useState(null);
  const [workerFiles, setWorkerFiles] = useState({});   // { workers: [{worker_id, suggested_amount, basis, expense_amount, report_url, ...}] }
  const [editing, setEditing]       = useState(null);
  const [editAmount, setEditAmount] = useState('');
  const [editNote, setEditNote]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Resolve the report file URL to the file server (same convention as TaskDocuments)
  const fullUrl = (u) => {
    if (!u) return '#';
    if (u.startsWith('http')) return u;
    const isDev = window.location.hostname === 'localhost';
    const base = isDev ? 'http://localhost:5001' : `${window.location.protocol}//${window.location.hostname}`;
    return `${base}${u}`;
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      svcApi.get(`/tickets/${ticketId}/billing-status`),
      isWarranty ? Promise.resolve({ data: null })
                 : svcApi.get(`/tickets/${ticketId}/rate-suggestion`).catch(() => ({ data: null })),
      svcApi.get(`/tickets/${ticketId}/worker-files`).catch(() => ({ data: [] })),
    ])
    .then(([b, s, wf]) => {
      if (!cancelled) {
        setData(b.data);
        setSuggest(s.data);
        // Group extra files by worker_id
        const extraByWorker = {};
        for (const f of (wf.data || [])) {
          if (!extraByWorker[f.worker_id]) extraByWorker[f.worker_id] = { reports: [], expenses: [] };
          if (f.file_type === 'report')  extraByWorker[f.worker_id].reports.push(f);
          if (f.file_type === 'expense') extraByWorker[f.worker_id].expenses.push(f);
        }
        setWorkerFiles(extraByWorker);
      }
    })
    .catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [ticketId, refreshKey, isWarranty]);

  if (isWarranty) {
    return (
      <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡</span>
          <p className="text-xs font-black text-violet-700">Warranty Service — Free</p>
        </div>
        <p className="text-[11px] text-violet-600 mt-1">No billing recorded for warranty tickets.</p>
      </div>
    );
  }

  if (!data) return <div className="bg-slate-50 rounded-2xl p-4 mb-3 animate-pulse h-24"/>;

  // Quick lookup: worker_id → suggestion row
  const suggestById = {};
  for (const s of (suggest?.workers || [])) suggestById[s.worker_id] = s;

  const startEdit = (w) => {
    setEditing(w.worker_id);
    setEditAmount(w.charged_amount != null ? String(w.charged_amount) : '');
    setEditNote(w.charged_note || '');
  };
  const cancelEdit = () => { setEditing(null); setEditAmount(''); setEditNote(''); };
  const saveEdit = async (w) => {
    const amt = Number(editAmount);
    if (isNaN(amt) || amt < 0) { alert('Please enter a valid amount'); return; }
    setSaving(true);
    try {
      await svcApi.patch(`/tickets/${ticketId}/worker-billing/${w.worker_id}`, {
        charged_amount: amt,
        charged_note: editNote || null,
      });
      cancelEdit();
      setRefreshKey(k => k + 1);
    } catch (e) { alert(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const STATE_LABEL = {
    fully_billed:     { text:'Fully Billed',     color:'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partially_billed: { text:'Partially Billed', color:'bg-amber-50 text-amber-700 border-amber-200' },
    not_billed:       { text:'Not Billed',       color:'bg-red-50 text-red-700 border-red-200' },
    unassigned:       { text:'No Workers',       color:'bg-slate-50 text-slate-500 border-slate-200' },
  };
  const stateInfo = STATE_LABEL[data.billing_state] || STATE_LABEL.unassigned;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
          <p className="text-xs font-black text-slate-900">Worker Billing</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${stateInfo.color}`}>
            {stateInfo.text} ({data.billed_count}/{data.worker_count})
          </span>
        </div>
        <p className="text-[11px] font-bold text-slate-600">
          Total Charged: <span className="text-slate-900 font-black">{inrFmt(data.total_charged)}</span>
        </p>
      </div>

      <div className="space-y-2">
        {data.workers.map(w => {
          const sg = suggestById[w.worker_id];           // suggestion + expense + report from rate-suggestion
          const isEditing = editing === w.worker_id;

          return (
            <div key={w.worker_id} className={`rounded-xl border ${w.has_billed ? 'bg-slate-50 border-slate-200' : 'bg-red-50/40 border-red-200'} px-3 py-2.5`}>

              {/* Header row: name + role + status */}
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${w.has_billed ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}/>
                <span className="text-xs font-bold text-slate-800">{w.worker_name}</span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  w.worker_role === 'plc' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {w.worker_role === 'plc' ? 'PLC' : 'WM'}
                </span>
                {sg && (
                  <span className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    {sg.hours}h · {sg.basis}
                    {sg?.half_day_rate > 0 && (
                      <> · <span className="text-slate-400">½d ₹{(sg.half_day_rate||0).toLocaleString('en-IN')} · full ₹{(sg.full_day_rate||0).toLocaleString('en-IN')}</span></>
                    )}
                  </span>
                )}
                {sg?.completed_at && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    Worker done
                  </span>
                )}
              </div>

              {/* Worker-submitted context: expense + report */}
              {sg && (sg.expense_amount > 0 || sg.report_url || sg.expense_note) && (
                <div className="flex items-center gap-3 flex-wrap mb-2 pl-3.5 text-[11px]">
                  {sg.expense_amount > 0 && (
                    <span className="inline-flex items-center gap-1 text-amber-700 font-bold">
                      <span className="text-amber-500">💸</span>
                      Expense {inrFmt(sg.expense_amount)}
                      {sg.expense_note && <span className="text-slate-500 italic font-normal">"{sg.expense_note}"</span>}
                    </span>
                  )}
                  {/* All report files: use extraFiles if available, else fall back to report_url */}
                  {(workerFiles[w.worker_id]?.reports?.length
                    ? workerFiles[w.worker_id].reports.map(f=>({url:f.file_path, name:f.original_name}))
                    : sg.report_url ? [{url:sg.report_url}] : []
                  ).map((f,i)=>(
                    <a key={i} onClick={(e)=>{e.preventDefault();window.open(fullUrl(f.url),"_blank");}}
                       href={fullUrl(f.url)} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700 font-bold text-[11px] bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {i===0?'Report':`Report ${i+1}`}
                    </a>
                  ))}
                  {/* All expense files: use extraFiles if available, else fall back to expense_file_url */}
                  {(workerFiles[w.worker_id]?.expenses?.length
                    ? workerFiles[w.worker_id].expenses.map(f=>({url:f.file_path, name:f.original_name}))
                    : sg.expense_file_url ? [{url:sg.expense_file_url}] : []
                  ).map((f,i)=>(
                    <a key={i} onClick={(e)=>{e.preventDefault();window.open(fullUrl(f.url),"_blank");}}
                       href={fullUrl(f.url)} target="_blank" rel="noopener noreferrer"
                       className="inline-flex items-center gap-1 text-amber-600 hover:text-amber-700 font-bold text-[11px] bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      {i===0?'Expense proof':`Expense ${i+1}`}
                    </a>
                  ))}
                </div>
              )}

              {/* Body: either edit form or summary row */}
              {isEditing ? (
                <div className="space-y-2">
                  {/* Rate-card buttons */}
                  {sg && !sg.is_warranty && (
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-2.5 space-y-2">
                      {/* Hours worked info */}
                      <div className="flex items-center gap-1.5 text-[10px] text-blue-600 font-bold">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {sg.hours_worked > 0
                          ? `${sg.hours_worked.toFixed(1)}h worked · ${sg.basis}`
                          : `No sessions recorded · ${sg.basis}`}
                      </div>
                      {/* Rate buttons — 3 tiers */}
                      <div className="flex gap-2 flex-wrap">
                        {/* Minimum visit charge — < 1 hour */}
                        {sg.min_visit_charge > 0 && (
                          <button type="button"
                            onClick={() => setEditAmount(String(sg.min_visit_charge))}
                            className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                              editAmount === String(sg.min_visit_charge)
                                ? 'bg-slate-700 text-white border-slate-700'
                                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}>
                            🔔 Min. Visit<br/>
                            <span className="text-base font-black">{inrFmt(sg.min_visit_charge)}</span>
                            <span className="text-[9px] block opacity-70">less than 1h</span>
                          </button>
                        )}
                        {/* Half-day — 1h to half_cutoff */}
                        {sg.half_day_rate > 0 && (
                          <button type="button"
                            onClick={() => setEditAmount(String(sg.half_day_rate))}
                            className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                              editAmount === String(sg.half_day_rate)
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white text-amber-700 border-amber-200 hover:bg-amber-50'
                            }`}>
                            🌗 Half-day<br/>
                            <span className="text-base font-black">{inrFmt(sg.half_day_rate)}</span>
                            <span className="text-[9px] block opacity-70">1h – {sg.half_cutoff || 4.5}h</span>
                          </button>
                        )}
                        {/* Full-day — more than half_cutoff */}
                        {sg.full_day_rate > 0 && (
                          <button type="button"
                            onClick={() => setEditAmount(String(sg.full_day_rate))}
                            className={`flex-1 py-1.5 px-2 rounded-lg border text-[11px] font-bold transition-all ${
                              editAmount === String(sg.full_day_rate)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-blue-700 border-blue-200 hover:bg-blue-50'
                            }`}>
                            ☀️ Full-day<br/>
                            <span className="text-base font-black">{inrFmt(sg.full_day_rate)}</span>
                            <span className="text-[9px] block opacity-70">more than {sg.half_cutoff || 4.5}h</span>
                          </button>
                        )}
                      </div>
                      {/* Auto-suggest based on actual hours */}
                      {sg.suggested_amount > 0 && (
                        <div className="flex items-center justify-between mt-1.5 px-1">
                          <span className="text-[10px] text-slate-500">{sg.basis}</span>
                          <button type="button"
                            onClick={() => setEditAmount(String(sg.suggested_amount))}
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg hover:bg-emerald-100">
                            Use suggested {inrFmt(sg.suggested_amount)} →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-[1fr_2fr] gap-2">
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400">₹</span>
                      <input type="number" min="0" step="1" value={editAmount} onChange={e => setEditAmount(e.target.value)} placeholder="0"
                        className="w-full pl-6 pr-2 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold outline-none focus:border-slate-500" autoFocus/>
                    </div>
                    <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Note — how customer paid"
                      className="px-2 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-500"/>
                  </div>

                  {/* Diff hint vs rate card while typing */}
                  {sg && sg.suggested_amount > 0 && editAmount !== '' && !isNaN(Number(editAmount)) && (() => {
                    const diff = Number(editAmount) - sg.suggested_amount;
                    if (diff === 0) return <p className="text-[10px] text-slate-500 pl-1">Matches rate card.</p>;
                    return (
                      <p className={`text-[10px] pl-1 font-bold ${diff > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {diff > 0 ? '+' : ''}{inrFmt(diff)} vs rate card
                      </p>
                    );
                  })()}

                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(w)} disabled={saving}
                      className="flex-1 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg disabled:opacity-60">
                      {saving ? 'Saving…' : (w.has_billed ? 'Save' : 'Add Charge')}
                    </button>
                    <button onClick={cancelEdit}
                      className="px-3 py-1.5 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg hover:bg-slate-100">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap pl-3.5">
                  {w.has_billed ? (
                    <>
                      <span className="text-sm font-black text-slate-900">{inrFmt(w.charged_amount)}</span>
                      {sg && sg.suggested_amount > 0 && (() => {
                        const diff = w.charged_amount - sg.suggested_amount;
                        return (
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            diff > 0 ? 'bg-emerald-100 text-emerald-700' :
                            diff < 0 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                          }`} title={`Rate card: ${inrFmt(sg.suggested_amount)}`}>
                            {diff > 0 ? '+' : ''}{inrFmt(diff)} vs RC
                          </span>
                        );
                      })()}
                      {w.charged_note && (
                        <span className="text-[10px] text-slate-500 italic truncate max-w-[200px]" title={w.charged_note}>"{w.charged_note}"</span>
                      )}
                      {w.edited_by_name && (
                        <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" title={`Edited by ${w.edited_by_name}`}>Edited</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] font-bold text-red-600 italic">⚠ Charge not entered</span>
                      {sg && sg.suggested_amount > 0 && (
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                          Rate card: {inrFmt(sg.suggested_amount)}
                        </span>
                      )}
                    </>
                  )}
                  {can('enter_billing') && (
                 <button onClick={() => startEdit(w)}
                      className="ml-auto text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-blue-50">
                      {w.has_billed ? 'Edit' : 'Enter charge'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}