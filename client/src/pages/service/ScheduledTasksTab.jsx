import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSocket } from '../../useSocket';

/* ════════════════════════════════════════════════════════════════════
   Global scheduled tasks tab for AdminDashboard.
   Two sections:
     • Reminders — tasks due ≤ 3 days, not completed
     • All tasks  — full list with status filter
   Each task links to its parent ticket page.
   ════════════════════════════════════════════════════════════════════ */

const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'}) : '—';

const STATUS_META = {
  pending:    { label:'Pending',    chip:'bg-amber-50 text-amber-700 border-amber-200',     dot:'bg-amber-400' },
  in_process: { label:'In Process', chip:'bg-blue-50 text-blue-700 border-blue-200',         dot:'bg-blue-500' },
  completed:  { label:'Completed',  chip:'bg-emerald-50 text-emerald-700 border-emerald-200', dot:'bg-emerald-500' },
};

function dueLabel(days, status) {
  if (status === 'completed') return { text:'done', color:'text-emerald-700' };
  if (days < 0)  return { text:`${Math.abs(days)}d overdue`, color:'text-red-700 font-black' };
  if (days === 0) return { text:'Today',  color:'text-red-700 font-black' };
  if (days === 1) return { text:'Tomorrow', color:'text-amber-700 font-bold' };
  if (days <= 3) return { text:`In ${days}d`, color:'text-amber-700 font-bold' };
  return { text:`In ${days}d`, color:'text-slate-500' };
}


export default function ScheduledTasksTab() {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter === 'All' ? {} : { status: statusFilter };
      const { data } = await svcApi.get('/scheduled-tasks', { params });
      setList(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  useSocket({
    'scheduled:created': load,
    'scheduled:updated': load,
    'scheduled:deleted': load,
  });

  const setStatus = async (t, status) => {
    try { await svcApi.patch(`/scheduled-tasks/${t.id}`, { status }); await load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed'); }
  };

  const del = async (t) => {
    if (!window.confirm(`Delete task "${t.title}"?`)) return;
    try { await svcApi.delete(`/scheduled-tasks/${t.id}`); await load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed to delete'); }
  };

  // Derive sections
  const reminders = list.filter(t => t.status !== 'completed' && Number(t.days_until_due) <= 3);
  const overdueCount = list.filter(t => t.status !== 'completed' && Number(t.days_until_due) < 0).length;

  return (
    <div className="space-y-5">

      {/* Heading + KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
          <p className="text-xs font-medium text-slate-400 mb-1.5 relative">All tasks</p>
          <p className="text-3xl font-black relative">{list.length}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60">
          <p className="text-xs font-medium text-slate-500 mb-1.5">Due soon</p>
          <p className="text-3xl font-black text-amber-600">{reminders.length}</p>
          <p className="text-[11px] text-slate-400 mt-1">within 3 days</p>
        </div>
        <div className="bg-white rounded-3xl p-5 border-2 border-red-200">
          <p className="text-xs font-medium text-slate-500 mb-1.5">Overdue</p>
          <p className="text-3xl font-black text-red-600">{overdueCount}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 border border-slate-200/60">
          <p className="text-xs font-medium text-slate-500 mb-1.5">Completed</p>
          <p className="text-3xl font-black text-emerald-600">{list.filter(t=>t.status==='completed').length}</p>
        </div>
      </div>

      {/* Reminders section */}
      {reminders.length > 0 && (
        <div className="bg-amber-50/40 border border-amber-200 rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-amber-200 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            <h3 className="text-sm font-black text-amber-800">Due in 3 days or less</h3>
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full ml-auto">{reminders.length}</span>
          </div>
          <div className="divide-y divide-amber-200/60">
            {reminders.map(t => (
              <TaskRow key={t.id} task={t} onStatus={setStatus} onDelete={del} reminder/>
            ))}
          </div>
        </div>
      )}

      {/* All tasks section */}
      <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-black text-slate-900">All scheduled tasks</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Sorted by due date</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
            {['All','pending','in_process','completed'].map(s => (
              <button key={s} onClick={()=>setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all ${statusFilter===s?'bg-slate-900 text-white':'text-slate-600 hover:bg-white'}`}>
                {s === 'in_process' ? 'In Process' : s}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-8 flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>
        ) : list.length === 0 ? (
          <p className="text-center py-12 text-slate-400 text-sm">
            {statusFilter === 'All' ? 'No tasks scheduled yet — create one from any ticket page.' : `No ${statusFilter} tasks.`}
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {list.map(t => (
              <TaskRow key={t.id} task={t} onStatus={setStatus} onDelete={del}/>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


/* ─── One row in either list ─── */
function TaskRow({ task, onStatus, onDelete, reminder }) {
  const meta = STATUS_META[task.status] || STATUS_META.pending;
  const days = Number(task.days_until_due);
  const due  = dueLabel(days, task.status);
  const completed = task.status === 'completed';

  return (
    <div className={`flex items-start gap-3 px-6 py-3.5 ${completed?'opacity-60':''} hover:bg-white/60 transition-all`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${meta.dot}`}/>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <p className={`text-sm font-bold text-slate-800 ${completed?'line-through':''}`}>{task.title}</p>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${meta.chip}`}>{meta.label}</span>
        </div>
        {task.notes && <p className="text-[11px] text-slate-500 italic mb-0.5 truncate">"{task.notes}"</p>}
        <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
          <Link to={`/service/admin/tickets/${task.ticket_no}`} className="font-mono text-[10px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-md">{task.ticket_no}</Link>
          <span className="truncate max-w-[180px]">{task.customer_name}</span>
          <span className="text-slate-400">·</span>
          <span>Due {fmtDate(task.due_date)}</span>
          <span className={due.color}>{due.text}</span>
          {task.created_by_name && <span className="text-slate-400">· by {task.created_by_name}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {task.status !== 'completed' && (
          <>
            {task.status === 'pending' && (
              <button onClick={()=>onStatus(task,'in_process')} className="text-[10px] font-bold px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">Start</button>
            )}
            <button onClick={()=>onStatus(task,'completed')} className="text-[10px] font-bold px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">✓ Done</button>
          </>
        )}
        {task.status === 'completed' && (
          <button onClick={()=>onStatus(task,'pending')} className="text-[10px] font-bold px-2 py-1 rounded bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100">Reopen</button>
        )}
        <button onClick={()=>onDelete(task)} className="text-[10px] font-bold px-2 py-1 rounded text-red-500 hover:bg-red-50">Delete</button>
      </div>
    </div>
  );
}