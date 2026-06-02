import React, { useState, useEffect, useCallback } from 'react';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';

/* ════════════════════════════════════════════════════════════════════
   Per-ticket scheduled tasks panel.
   Drops into the ticket detail page (or anywhere with a ticket id).
   - Admin/superadmin: full create / edit / complete / delete
   - Assigned worker:   can mark in_process / completed (status only)
   - Anyone with access: can read
   ════════════════════════════════════════════════════════════════════ */

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) : '—';
const today = () => new Date().toISOString().slice(0,10);

const STATUS_META = {
  pending:    { label:'Pending',     dot:'bg-amber-400',    chip:'bg-amber-50 text-amber-700 border-amber-200' },
  in_process: { label:'In Process',  dot:'bg-blue-500',     chip:'bg-blue-50 text-blue-700 border-blue-200' },
  completed:  { label:'Completed',   dot:'bg-emerald-500',  chip:'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

function dueChip(days, status) {
  if (status === 'completed') return null;
  if (days < 0)  return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">⚠ {Math.abs(days)}d overdue</span>;
  if (days === 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Due today</span>;
  if (days <= 3) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Due in {days}d</span>;
  return null;
}


export default function ScheduledTasksPanel({ ticketId }) {
  const { svcUser, can } = useSvcAuth();
  const isAdmin = svcUser?.role === 'admin' || svcUser?.role === 'superadmin';

  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId]   = useState(null);

  // Add/edit form state
  const [title, setTitle]     = useState('');
  const [notes, setNotes]     = useState('');
  const [dueDate, setDueDate] = useState(today());
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await svcApi.get(`/scheduled-tasks`, { params: { ticket_id: ticketId } });
      setList(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Live updates
  useSocket({
    'scheduled:created': (e) => { if (e?.ticket_id === ticketId) load(); },
    'scheduled:updated': () => load(),
    'scheduled:deleted': () => load(),
  });

  const resetForm = () => { setTitle(''); setNotes(''); setDueDate(today()); setEditId(null); setShowAdd(false); };

  const saveNew = async () => {
    if (!title.trim() || !dueDate) { alert('Title and due date are required'); return; }
    setSaving(true);
    try {
      await svcApi.post('/scheduled-tasks', { ticket_id: ticketId, title: title.trim(), notes: notes.trim() || null, due_date: dueDate });
      resetForm(); await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed to add task'); }
    finally { setSaving(false); }
  };

  const startEdit = (t) => {
    setEditId(t.id);
    setTitle(t.title);
    setNotes(t.notes || '');
    setDueDate(String(t.due_date).slice(0,10));
    setShowAdd(false);
  };

  const saveEdit = async () => {
    if (!title.trim() || !dueDate) { alert('Title and due date are required'); return; }
    setSaving(true);
    try {
      await svcApi.patch(`/scheduled-tasks/${editId}`, { title: title.trim(), notes: notes.trim() || null, due_date: dueDate });
      resetForm(); await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const setStatus = async (t, status) => {
    try {
      await svcApi.patch(`/scheduled-tasks/${t.id}`, { status });
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const del = async (t) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    try { await svcApi.delete(`/scheduled-tasks/${t.id}`); await load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed to delete'); }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <p className="text-xs font-black text-slate-700">Scheduled Tasks</p>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{list.length}</span>
        {can('create_ticket') && !showAdd && !editId && (
          <button onClick={()=>setShowAdd(true)} className="ml-auto text-[11px] font-bold px-3 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-white">+ Add task</button>
        )}
      </div>

      {/* Add / Edit form */}
      {(showAdd || editId) && (
        <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-3 mb-3 space-y-2">
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Task title (e.g. Follow up on commissioning)" autoFocus
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm outline-none focus:border-slate-400"/>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={2} placeholder="Notes (optional)"
            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 resize-none"/>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Due</label>
            <input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} min={today()}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400"/>
            <button onClick={resetForm} disabled={saving} className="ml-auto px-3 py-1.5 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg hover:bg-white">Cancel</button>
            <button onClick={editId ? saveEdit : saveNew} disabled={saving} className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg disabled:opacity-60">
              {saving ? 'Saving…' : (editId ? 'Save' : 'Add task')}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="h-12 bg-slate-50 rounded-xl animate-pulse"/>
      ) : list.length === 0 ? (
        <p className="text-center text-[11px] text-slate-400 py-3">No scheduled tasks{isAdmin ? ' — click "Add task" to create one' : ''}</p>
      ) : (
        <div className="space-y-2">
          {list.map(t => {
            const meta  = STATUS_META[t.status] || STATUS_META.pending;
            const days  = Number(t.days_until_due);
            const isCompleted = t.status === 'completed';
            return (
              <div key={t.id} className={`rounded-xl border px-3 py-2.5 ${isCompleted?'bg-slate-50 border-slate-200 opacity-70':'bg-white border-slate-200'}`}>
                <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${meta.dot}`}/>
                  <p className={`text-xs font-bold text-slate-800 ${isCompleted?'line-through':''} flex-1 min-w-0`}>{t.title}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${meta.chip} border`}>{meta.label}</span>
                  {dueChip(days, t.status)}
                </div>
                {t.notes && <p className="text-[11px] text-slate-500 italic pl-3.5 mb-1">"{t.notes}"</p>}
                <div className="flex items-center gap-2 flex-wrap pl-3.5 text-[10px]">
                  <span className="text-slate-400">Due {fmtDate(t.due_date)}</span>
                  {t.created_by_name && <span className="text-slate-400">· by {t.created_by_name}</span>}
                  <div className="ml-auto flex items-center gap-1.5">
                    {/* Status controls */}
                    {t.status !== 'completed' && (
                      <>
                        {t.status === 'pending' && (
                          <button onClick={()=>setStatus(t,'in_process')} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 font-bold">Start</button>
                        )}
                        <button onClick={()=>setStatus(t,'completed')} className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 font-bold">✓ Complete</button>
                      </>
                    )}
                    {t.status === 'completed' && (
                      <button onClick={()=>setStatus(t,'pending')} className="px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 font-bold">Reopen</button>
                    )}
                    {can('create_ticket') && (
                      <>
                        <button onClick={()=>startEdit(t)} className="px-2 py-0.5 rounded text-slate-500 hover:text-slate-700 hover:bg-slate-100 font-bold">Edit</button>
                        <button onClick={()=>del(t)} className="px-2 py-0.5 rounded text-red-500 hover:text-red-700 hover:bg-red-50 font-bold">Delete</button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}