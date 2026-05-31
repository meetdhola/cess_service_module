import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';
import { ChallanPanel, InvoiceEditor } from './ChallanInvoice';
import { ReopenModal, ReopenHistory } from './ReopenComponents';
import NotesPanel from './NotesPanel';
import BillingAuditPanel from './BillingAuditPanel';
import ScheduledTasksTab from './ScheduledTasksTab';
import NotificationsBell from './NotificationsBell';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
/* ─── constants ─── */
const SVC_L = { installation:'Installation', troubleshooting:'Troubleshooting', new_development:'New Dev', after_sales:'After Sales' };
const ST_CLR = { Open:'bg-slate-100 text-slate-600', Assigned:'bg-blue-50 text-blue-700', 'In Progress':'bg-amber-50 text-amber-700', Completed:'bg-emerald-50 text-emerald-700', Closed:'bg-slate-100 text-slate-400' };
const PR_CLR = { High:'bg-red-50 text-red-600 border-red-200', Medium:'bg-amber-50 text-amber-600 border-amber-200', Low:'bg-emerald-50 text-emerald-600 border-emerald-200' };
const TERMINAL = ['Completed','Closed'];
const fmtH = s => s>=3600?`${(s/3600).toFixed(1)}h`:s>0?`${Math.round(s/60)}m`:'—';
const fmtD = d => new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
const fmtDay = d => { const dt=new Date(d); return dt.toLocaleDateString('en-IN',{month:'short',day:'numeric'}); };
const fmtHour = h => { const s=h>=12?'PM':'AM'; const hh=h%12||12; return `${hh}${s}`; };
const inrFmt = n => `₹${Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:0})}`;

function exportCSV(rows, cols, filename) {
  const header = cols.map(c=>c.label).join(',');
  const body   = rows.map(r=>cols.map(c=>`"${String(r[c.key]??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob   = new Blob([header+'\n'+body],{type:'text/csv'});
  const url    = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}

/* ─── ICON SET ─── */
const I = {
  home:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  ticket:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="19"/></svg>,
  workers:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  reports:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  profit:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  users:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  sessions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  filter:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upRight:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>,
  logout:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  more:     <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>,
};

/* ─── Form atoms (defined outside) ─── */
const FLabel = ({ children }) => (
  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{children}</label>
);
const FInput = (p) => (
  <input {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>
);
const FSel = (p) => (
  <select {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>
);


/* ─── Pause Analytics ─── */
function PauseAnalyticsSection({ dateFrom, dateTo }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    svcApi.get('/reports/pause-analytics', { params:{from:dateFrom,to:dateTo} })
      .then(r => setData(r.data))
      .catch(e => console.error(e))
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo]);

  if (loading) return <div className="bg-white rounded-3xl border border-slate-200/60 p-8 flex items-center justify-center"><div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;
  if (!data) return null;

  const CAT_META = {
    material_shortage:     { label:'Material Shortage',      color:'bg-red-500',     bg:'bg-red-50',     text:'text-red-700',     border:'border-red-200',     ico:'📦' },
    lunch_break:           { label:'Lunch Break',            color:'bg-amber-500',   bg:'bg-amber-50',   text:'text-amber-700',   border:'border-amber-200',   ico:'🍱' },
    tea_break:             { label:'Tea Break',              color:'bg-orange-500',  bg:'bg-orange-50',  text:'text-orange-700',  border:'border-orange-200',  ico:'☕' },
    awaiting_instructions: { label:'Awaiting Instructions',  color:'bg-blue-500',    bg:'bg-blue-50',    text:'text-blue-700',    border:'border-blue-200',    ico:'📋' },
    site_issue:            { label:'Site Issue',             color:'bg-violet-500',  bg:'bg-violet-50',  text:'text-violet-700',  border:'border-violet-200',  ico:'🏭' },
    other:                 { label:'Other',                  color:'bg-slate-500',   bg:'bg-slate-100',  text:'text-slate-700',   border:'border-slate-200',   ico:'⏸' },
  };

  const totalPauses = data.byCategory.reduce((a,c)=>a+c.count, 0);
  const totalLost   = data.byCategory.reduce((a,c)=>a+c.total_seconds, 0);

  const dlPauseCSV = () => exportCSV(
    data.detail,
    [
      {key:'paused_at',label:'Paused At'},
      {key:'worker_name',label:'Worker'},
      {key:'worker_role',label:'Role'},
      {key:'ticket_no',label:'Ticket'},
      {key:'customer_name',label:'Customer'},
      {key:'reason_category',label:'Category'},
      {key:'reason',label:'Reason'},
      {key:'duration_seconds',label:'Duration (s)'},
    ],
    `pause_analytics_${dateFrom}_${dateTo}.csv`
  );

  return (
    <div className="space-y-4 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Pause Reason Analytics</h2>
          <p className="text-xs text-slate-400 mt-0.5">Why workers paused, where, and when — {dateFrom} to {dateTo}</p>
        </div>
        <button onClick={dlPauseCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all">
          <span className="w-3 h-3">{I.download}</span>Export
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-red-500/30 blur-2xl"/>
          <p className="text-xs font-medium text-slate-400 mb-1.5 relative">Total Pauses</p>
          <p className="text-3xl font-black relative">{totalPauses}</p>
          <p className="text-[11px] text-slate-500 mt-1 relative">{fmtH(totalLost)} lost time</p>
        </div>
        {data.byCategory.slice(0,3).map(c => {
          const meta = CAT_META[c.category] || CAT_META.other;
          return (
            <div key={c.category} className={`rounded-3xl p-5 border ${meta.border} ${meta.bg}`}>
              <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">{meta.ico} {meta.label}</p>
              <p className={`text-3xl font-black ${meta.text} mt-1.5`}>{c.count}</p>
              <p className="text-[11px] text-slate-500 mt-1">{fmtH(c.total_seconds)} total</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <h3 className="text-sm font-black text-slate-900 mb-1">Pauses by Reason</h3>
          <p className="text-[11px] text-slate-400 mb-4">Count of pauses grouped by category</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byCategory.map(c=>({ name: (CAT_META[c.category]||CAT_META.other).label, Count: c.count }))} layout="vertical" margin={{top:0,right:16,left:60,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:'#64748b',fontWeight:600}} axisLine={false} tickLine={false} width={130}/>
              <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
              <Bar dataKey="Count" fill="#1e293b" radius={[0,4,4,0]} maxBarSize={18}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <h3 className="text-sm font-black text-slate-900 mb-1">Material Shortage — Hourly</h3>
          <p className="text-[11px] text-slate-400 mb-4">When workers most often hit material shortages</p>
          {data.hourly.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-400">No material shortage pauses logged 🎉</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.hourly.map(h=>({ hour: `${h.hour%12||12}${h.hour>=12?'PM':'AM'}`, Count: h.count }))} margin={{top:5,right:5,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                <XAxis dataKey="hour" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
                <Bar dataKey="Count" fill="#ef4444" radius={[6,6,0,0]} maxBarSize={24}/>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {data.hotspots.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900">Material Shortage Hotspots</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Top customer sites where material was unavailable</p>
          </div>
          <div className="divide-y divide-slate-100">
            {data.hotspots.map((h,i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-3.5 hover:bg-red-50/30 transition-all">
                <span className="text-base font-black text-red-600 w-6 text-center">#{i+1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800 truncate">{h.customer_name}</p>
                  <p className="text-[11px] text-slate-400 truncate">{h.address}</p>
                </div>
                <span className="text-xs font-black text-red-600 bg-red-50 border border-red-200 px-3 py-1 rounded-full whitespace-nowrap">{h.material_pauses}× shortage</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-black text-slate-900">Recent Pauses</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">{data.detail.length} pauses logged</p>
        </div>
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/50 border-b border-slate-100 sticky top-0">
              <tr>{['When','Worker','Ticket','Customer','Category','Reason','Duration'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.detail.length===0
                ? <tr><td colSpan={7} className="text-center py-12 text-slate-400">No pauses in this period.</td></tr>
                : data.detail.map(p => {
                    const meta = CAT_META[p.reason_category] || CAT_META.other;
                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(p.paused_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                        <td className="px-4 py-3"><span className="font-bold text-slate-800">{p.worker_name}</span> <span className={`ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{p.worker_role}</span></td>
                        <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{p.ticket_no}</span></td>
                        <td className="px-4 py-3 text-slate-600 max-w-[140px] truncate">{p.customer_name}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.text} ${meta.border}`}>{meta.ico} {meta.label}</span></td>
                        <td className="px-4 py-3 text-slate-600 max-w-[180px] truncate italic">"{p.reason}"</td>
                        <td className="px-4 py-3 font-black text-slate-800">{fmtH(p.duration_seconds)}</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}



/* ─── Billing state badge for ticket list ─── */
function BillingStateBadge({ ticketId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let cancelled = false;
    svcApi.get(`/tickets/${ticketId}/billing-status`)
      .then(r => { if (!cancelled) setState(r.data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticketId]);

  if (!state || state.billing_state === 'warranty' || state.billing_state === 'fully_billed' || state.billing_state === 'unassigned') return null;

  if (state.billing_state === 'not_billed') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-700 border border-red-200 whitespace-nowrap">⚠ Not Billed</span>;
  }
  if (state.billing_state === 'partially_billed') {
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 whitespace-nowrap">Partial {state.billed_count}/{state.worker_count}</span>;
  }
  return null;
}

/* ─── OVERVIEW CHARTS ─── */
function OverviewChart({ tickets }) {
  const byStatus = ['Open','Assigned','In Progress','Completed','Closed'].map(s => ({
    name: s, value: tickets.filter(t => t.status === s).length,
  }));
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Ticket Status Distribution</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Current state of all tickets</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={byStatus} margin={{top:5,right:5,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="name" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
          <Bar dataKey="value" name="Tickets" fill="#3b82f6" radius={[6,6,0,0]} maxBarSize={36}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SessionTrendChart({ sessions }) {
  const last14 = Array.from({length:14}).map((_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (13-i));
    const key = d.toISOString().slice(0,10);
    const dayLabel = d.toLocaleDateString('en-IN',{day:'numeric',month:'short'});
    const count = sessions.filter(s => String(s.started_at).slice(0,10) === key).length;
    return { day: dayLabel, sessions: count };
  });
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Session Trend</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Sessions per day · last 14 days</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={last14} margin={{top:5,right:5,left:-20,bottom:0}}>
          <defs>
            <linearGradient id="sessGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.4}/>
              <stop offset="100%" stopColor="#10b981" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="day" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
          <Area type="monotone" dataKey="sessions" stroke="#10b981" strokeWidth={2.5} fill="url(#sessGrad)"/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function OrdersByTimeHeatmap({ sessions }) {
  // 7 days x 24 hours grid
  const grid = Array.from({length:7},()=>Array(24).fill(0));
  const today = new Date(); today.setHours(0,0,0,0);
  sessions.forEach(s => {
    const d = new Date(s.started_at);
    const diff = Math.floor((today - new Date(d.getFullYear(),d.getMonth(),d.getDate())) / 86400000);
    if (diff >= 0 && diff < 7) {
      const dayIdx = 6 - diff;
      grid[dayIdx][d.getHours()]++;
    }
  });
  const max = Math.max(1, ...grid.flat());
  const dayLabels = Array.from({length:7}).map((_,i)=>{
    const d=new Date(); d.setDate(d.getDate()-(6-i));
    return d.toLocaleDateString('en-IN',{weekday:'short'});
  });
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Activity Heatmap</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Session starts · last 7 days × 24 hours</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="space-y-1 min-w-[600px]">
          {grid.map((row, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="text-[10px] font-bold text-slate-500 w-8">{dayLabels[i]}</span>
              <div className="grid gap-0.5 flex-1" style={{gridTemplateColumns:'repeat(24, minmax(0, 1fr))'}}>
                {row.map((v, j) => {
                  const intensity = v / max;
                  return (
                    <div key={j}
                      className="aspect-square rounded"
                      title={`${dayLabels[i]} ${j}:00 — ${v} sessions`}
                      style={{backgroundColor: intensity === 0 ? '#f1f5f9' : `rgba(59,130,246,${0.2 + intensity*0.8})`}}/>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-1 mt-2 pl-9">
            {[0,6,12,18,23].map(h => (
              <span key={h} className="text-[9px] text-slate-400 font-mono" style={{marginLeft: h===0?0:`${(h/24)*100}%`}}>{h}h</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductStaticsChart({ tickets }) {
  const data = ['installation','troubleshooting','new_development','after_sales'].map(t => ({
    name: SVC_L[t],
    count: tickets.filter(tk => tk.service_type === t).length,
  }));
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Service Type Breakdown</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Tickets by service category</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{top:5,right:5,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="name" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
          <Bar dataKey="count" name="Tickets" fill="#8b5cf6" radius={[6,6,0,0]} maxBarSize={48}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ */
/* ─── PROFITABILITY TAB (SuperAdmin only)                       ─── */
/* ═════════════════════════════════════════════════════════════════ */
function ProfitabilityTab() {
  const [tab, setTab] = useState('overview');
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); });
  const [dateTo, setDateTo]     = useState(new Date().toISOString().slice(0,10));
  const [granularity, setGranularity] = useState('monthly');
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await svcApi.get('/reports/profitability', { params:{from:dateFrom,to:dateTo} }); setOverview(data); }
    catch(e){ console.error(e); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(()=>{ load(); }, [load]);

  const inr = inrFmt;

  const TABS = [
    {k:'overview', label:'Overview'},
    {k:'user',     label:'User-wise'},
    {k:'customer', label:'Customer-wise'},
    {k:'agent',    label:'Sales Agent-wise'},
    {k:'pricing',  label:'Edit Pricing'},
    {k:'salaries', label:'Edit Salaries'},
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-slate-200/60 p-4 md:px-5 md:py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <span className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider w-full sm:w-auto">Period</span>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
          <span className="text-slate-300 text-xs">→</span>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="flex-1 sm:flex-none px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
            {['daily','monthly','yearly'].map(g=>(
              <button key={g} onClick={()=>setGranularity(g)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold capitalize transition-all ${granularity===g?'bg-slate-900 text-white':'text-slate-600 hover:bg-white'}`}>{g}</button>
            ))}
          </div>
          <button onClick={load} className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800">Apply</button>
        </div>
        <div className="overflow-x-auto -mx-1 px-1 scrollbar-hide">
          <div className="flex items-center gap-2 min-w-max pb-1 flex-wrap">
            {TABS.map(t=>(
              <button key={t.k} onClick={()=>setTab(t.k)} className={`text-xs font-bold px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap ${tab===t.k?'bg-slate-900 text-white border-slate-900':'bg-white border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>
      ) : overview && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
            <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-emerald-500/30 blur-2xl"/>
            <p className="text-xs font-medium text-slate-300 mb-1.5 relative">Revenue</p>
            <p className="text-2xl font-black relative">{inr(overview.summary.totalRevenue)}</p>
            <p className="text-[10px] text-slate-400 mt-1 relative">{overview.summary.billableSessions} billable</p>
          </div>

          <div className={`bg-white rounded-3xl p-4 md:p-5 border-2 ${
            overview.summary.chargedDiff > 0 ? 'border-emerald-200' :
            overview.summary.chargedDiff < 0 ? 'border-red-200' :
            'border-slate-200'
          }`}>
            <p className="text-[10px] md:text-xs font-medium text-slate-500 mb-1.5">Rate Card vs Charged</p>
            <p className={`text-xl md:text-2xl font-black ${
              overview.summary.chargedDiff > 0 ? 'text-emerald-600' :
              overview.summary.chargedDiff < 0 ? 'text-red-600' :
              'text-slate-700'
            }`}>
              {overview.summary.chargedDiff > 0 ? '+' : ''}
              {inr(overview.summary.chargedDiff)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
              {overview.summary.chargedDiffPct > 0
                ? `↑ ${overview.summary.chargedDiffPct}% over rate card`
                : overview.summary.chargedDiffPct < 0
                ? `↓ ${Math.abs(overview.summary.chargedDiffPct)}% under rate card`
                : 'matches rate card'}
            </p>
          </div>

          {overview.summary.unbilledSessionCount > 0 ? (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-3xl p-4 md:p-5">
              <p className="text-[10px] md:text-xs font-medium text-amber-700 mb-1.5">⚠ Unbilled</p>
              <p className="text-xl md:text-2xl font-black text-amber-700">{overview.summary.unbilledSessionCount}</p>
              <p className="text-[10px] text-amber-600 mt-1">sessions need billing</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-5 border-2 border-violet-200">
              <p className="text-xs font-medium text-slate-500 mb-1.5">Warranty (Free)</p>
              <p className="text-2xl font-black text-violet-600">{inr(overview.summary.totalForegoneRev)}</p>
              <p className="text-[10px] text-slate-400 mt-1">{overview.summary.warrantySessions} sessions · ₹0 charged</p>
            </div>
          )}

          <div className="bg-white rounded-3xl p-5 border border-slate-200/60">
            <p className="text-xs font-medium text-slate-500 mb-1.5">Actual Cost</p>
            <p className="text-2xl font-black text-amber-600">{inr(overview.summary.totalActualCost)}</p>
            <p className="text-[10px] text-slate-400 mt-1">From salary</p>
          </div>
          <div className="bg-white rounded-3xl p-5 border border-slate-200/60">
            <p className="text-xs font-medium text-slate-500 mb-1.5">IRC Cost</p>
            <p className="text-2xl font-black text-orange-600">{inr(overview.summary.totalIrcCost)}</p>
            <p className="text-[10px] text-slate-400 mt-1">From rate card</p>
          </div>
          <div className="bg-white rounded-3xl p-5 border-2 border-emerald-200">
            <p className="text-xs font-medium text-slate-500 mb-1.5">IRC Profit</p>
            <p className={`text-2xl font-black ${overview.summary.totalIrcProfit>=0?'text-emerald-600':'text-red-600'}`}>
              {overview.summary.totalIrcProfit>=0?'+':''}{inr(overview.summary.totalIrcProfit)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Margin {overview.summary.ircMargin}%</p>
          </div>
        </div>
      )}

      {tab==='overview'  && overview && <OverviewSection sessions={overview.sessions} inr={inr}/>}
      {tab==='user'      && <UserWiseSection dateFrom={dateFrom} dateTo={dateTo} granularity={granularity} inr={inr}/>}
      {tab==='customer'  && <CustomerWiseSection dateFrom={dateFrom} dateTo={dateTo} granularity={granularity} inr={inr}/>}
      {tab==='agent'     && <AgentWiseSection dateFrom={dateFrom} dateTo={dateTo} granularity={granularity} inr={inr}/>}
      {tab==='pricing'   && <PricingEditor/>}
      {tab==='salaries'  && <SalaryEditor/>}
    </div>
  );
}

function OverviewSection({ sessions, inr }) {
  const byDay = {};
  sessions.forEach(s => {
    const d = String(s.started_at).slice(0,10);
    if (!byDay[d]) byDay[d] = { day:d, revenue:0, foregone_revenue:0, actual_cost:0, irc_cost:0 };
    byDay[d].revenue          += s.revenue;
    byDay[d].foregone_revenue += s.foregone_revenue;
    byDay[d].actual_cost      += s.actual_cost;
    byDay[d].irc_cost         += s.irc_cost;
  });
  const data = Object.values(byDay).sort((a,b)=>a.day.localeCompare(b.day)).map(d => ({
    ...d,
    day: new Date(d.day).toLocaleDateString('en-IN',{day:'numeric',month:'short'}),
    actual_profit: d.revenue - d.actual_cost,
    irc_profit:    d.revenue - d.irc_cost,
  }));

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Daily Revenue vs Cost vs Profit</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Warranty sessions show ₹0 revenue — profit shows true business impact</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"/>Revenue</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-violet-400"/>Warranty (lost rev)</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"/>Actual Cost</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-orange-500"/>IRC Cost</span>
          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"/>IRC Profit</span>
        </div>
      </div>
      {data.length===0 ? <p className="text-center py-12 text-slate-400">No data</p> : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{top:5,right:5,left:10,bottom:0}}>
            <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
            <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
            <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
            <Tooltip formatter={(v)=>inr(v)} contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
            <Bar dataKey="revenue"          name="Revenue"          fill="#10b981" radius={[3,3,0,0]} maxBarSize={12}/>
            <Bar dataKey="foregone_revenue" name="Warranty (lost)"  fill="#a78bfa" radius={[3,3,0,0]} maxBarSize={12}/>
            <Bar dataKey="actual_cost"      name="Actual Cost"      fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={12}/>
            <Bar dataKey="irc_cost"         name="IRC Cost"         fill="#ea580c" radius={[3,3,0,0]} maxBarSize={12}/>
            <Bar dataKey="irc_profit"       name="IRC Profit"       fill="#2563eb" radius={[3,3,0,0]} maxBarSize={12}/>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function UserWiseSection({ dateFrom, dateTo, granularity, inr }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    setLoading(true);
    svcApi.get('/reports/profitability/user-wise', { params:{from:dateFrom,to:dateTo,granularity} })
      .then(r=>setData(r.data)).catch(e=>console.error(e)).finally(()=>setLoading(false));
  }, [dateFrom, dateTo, granularity]);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;
  if (!data) return null;

  const dlCSV = () => exportCSV(
    data.users,
    [
      {key:'worker_name',label:'Worker'},{key:'worker_role',label:'Role'},{key:'worker_seniority',label:'Seniority'},
      {key:'monthly_salary',label:'Monthly Salary'},{key:'irc_daily_rate',label:'IRC Daily'},
      {key:'sessions',label:'Sessions'},{key:'hours',label:'Hours'},
      {key:'actual_cost',label:'Actual Cost'},{key:'irc_cost',label:'IRC Cost'},{key:'revenue',label:'Revenue'},
      {key:'actual_profit',label:'Actual Profit'},{key:'irc_profit',label:'IRC Profit'},
      {key:'actual_margin',label:'Actual Margin %'},{key:'irc_margin',label:'IRC Margin %'},
    ],
    `user_wise_${dateFrom}_${dateTo}.csv`
  );

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">User-wise Profitability</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Actual salary vs IRC vs customer rate · {data.users.length} workers · click to expand</p>
        </div>
        <button onClick={dlCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100">
          <span className="w-3 h-3">{I.download}</span>CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>{['Worker','Role','Sessions','Hours','Salary/mo','IRC/day','Revenue','Actual Cost','IRC Cost','Actual Profit','IRC Profit',''].map(h=>
              <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-3 whitespace-nowrap">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.users.map(u => (
              <React.Fragment key={u.worker_id}>
                <tr onClick={()=>setExpanded(expanded===u.worker_id?null:u.worker_id)} className={`hover:bg-slate-50/60 cursor-pointer ${u.irc_profit<0?'bg-red-50/30':''} ${expanded===u.worker_id?'bg-blue-50/40':''}`}>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${u.worker_role==='plc'?'bg-blue-500':'bg-emerald-500'}`}>{u.worker_name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                      <span className="font-bold text-slate-800">{u.worker_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{u.worker_role}</span></td>
                  <td className="px-3 py-3 font-bold text-slate-700">{u.sessions}</td>
                  <td className="px-3 py-3 text-slate-600">{u.hours}h</td>
                  <td className="px-3 py-3 text-slate-600">{inr(u.monthly_salary)}</td>
                  <td className="px-3 py-3 text-slate-600">{inr(u.irc_daily_rate)}</td>
                  <td className="px-3 py-3 text-emerald-600 font-bold">{inr(u.revenue)}</td>
                  <td className="px-3 py-3 text-amber-600 font-bold">{inr(u.actual_cost)}</td>
                  <td className="px-3 py-3 text-orange-600 font-bold">{inr(u.irc_cost)}</td>
                  <td className={`px-3 py-3 font-black ${u.actual_profit>=0?'text-blue-600':'text-red-600'}`}>{u.actual_profit>=0?'+':''}{inr(u.actual_profit)} <span className="text-[9px] opacity-60">({u.actual_margin}%)</span></td>
                  <td className={`px-3 py-3 font-black ${u.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{u.irc_profit>=0?'+':''}{inr(u.irc_profit)} <span className="text-[9px] opacity-60">({u.irc_margin}%)</span></td>
                  <td className="px-3 py-3">
                    <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded===u.worker_id?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                  </td>
                </tr>
                {expanded===u.worker_id && u.timeline.length>0 && (
                  <tr><td colSpan={12} className="px-4 py-4 bg-blue-50/20">
                    <div className="bg-white rounded-2xl border border-blue-100 p-4">
                      <p className="text-xs font-black text-slate-700 mb-3">{u.worker_name} — {granularity} breakdown</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={u.timeline} margin={{top:5,right:5,left:-10,bottom:0}}>
                          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                          <XAxis dataKey="bucket" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                          <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                          <Tooltip formatter={(v)=>inr(v)} contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
                          <Bar dataKey="revenue"     name="Revenue"   fill="#10b981" radius={[3,3,0,0]} maxBarSize={20}/>
                          <Bar dataKey="actual_cost" name="ActualCst" fill="#f59e0b" radius={[3,3,0,0]} maxBarSize={20}/>
                          <Bar dataKey="irc_cost"    name="IRC Cost"  fill="#ea580c" radius={[3,3,0,0]} maxBarSize={20}/>
                          <Bar dataKey="irc_profit"  name="IRC Profit" fill="#2563eb" radius={[3,3,0,0]} maxBarSize={20}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
            {data.users.length===0 && <tr><td colSpan={12} className="text-center py-12 text-slate-400">No data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── CUSTOMER-WISE ─── */
function CustomerWiseSection({ dateFrom, dateTo, granularity, inr }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [view, setView] = useState({});

  useEffect(() => {
    setLoading(true);
    svcApi.get('/reports/profitability/customer-wise', { params:{from:dateFrom,to:dateTo,granularity} })
      .then(r=>setData(r.data)).catch(e=>console.error(e)).finally(()=>setLoading(false));
  }, [dateFrom, dateTo, granularity]);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;
  if (!data) return null;

  const dlCSV = () => exportCSV(
    data.customers,
    [
      {key:'customer_name',label:'Customer'},{key:'ticket_count',label:'Tickets'},
      {key:'warranty_sessions',label:'Warranty Sessions'},{key:'billable_sessions',label:'Billable Sessions'},
      {key:'hours',label:'Hours'},{key:'revenue',label:'Revenue'},{key:'foregone_revenue',label:'Warranty Foregone'},
      {key:'irc_cost',label:'IRC Cost'},{key:'irc_profit',label:'IRC Profit'},{key:'irc_margin',label:'IRC Margin %'},
    ],
    `customer_wise_${dateFrom}_${dateTo}.csv`
  );

  const setCustView = (cust, v) => setView(p => ({ ...p, [cust]: v }));

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">Customer-wise Profitability</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Click row → tickets with Rate Card vs Charged · violet = warranty</p>
        </div>
        <button onClick={dlCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100">
          <span className="w-3 h-3">{I.download}</span>CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>{['Customer','Tickets','Sessions','Hours','Revenue','Warranty (lost)','IRC Cost','Actual Profit','IRC Profit',''].map(h=>
              <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-3 whitespace-nowrap">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.customers.map(c => {
              const isOpen = expanded === c.customer_name;
              const v = view[c.customer_name] || 'tickets';
              return (
                <React.Fragment key={c.customer_name}>
                  <tr onClick={()=>setExpanded(isOpen?null:c.customer_name)} className={`hover:bg-slate-50/60 cursor-pointer ${c.irc_profit<0?'bg-red-50/30':''} ${isOpen?'bg-blue-50/40':''}`}>
                    <td className="px-3 py-3 font-bold text-slate-800">{c.customer_name}</td>
                    <td className="px-3 py-3 text-slate-600">{c.ticket_count}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-600">{c.sessions}</span>
                        {c.warranty_sessions > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{c.warranty_sessions}W</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{c.hours}h</td>
                    <td className="px-3 py-3 text-emerald-600 font-bold">{inr(c.revenue)}</td>
                    <td className="px-3 py-3 text-violet-600 font-bold">{c.foregone_revenue>0?inr(c.foregone_revenue):'—'}</td>
                    <td className="px-3 py-3 text-orange-600 font-bold">{inr(c.irc_cost)}</td>
                    <td className={`px-3 py-3 font-black ${c.actual_profit>=0?'text-blue-600':'text-red-600'}`}>{c.actual_profit>=0?'+':''}{inr(c.actual_profit)}</td>
                    <td className={`px-3 py-3 font-black ${c.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{c.irc_profit>=0?'+':''}{inr(c.irc_profit)} <span className="text-[9px] opacity-60">({c.irc_margin}%)</span></td>
                    <td className="px-3 py-3">
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={10} className="px-4 py-4 bg-blue-50/20">
                      <div className="bg-white rounded-2xl border border-blue-100 p-4">
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          {['tickets','workers','timeline'].map(t=>(
                            <button key={t} onClick={()=>setCustView(c.customer_name, t)} className={`text-[11px] font-bold px-3 py-1 rounded-lg capitalize transition-all ${v===t?'bg-slate-900 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t}</button>
                          ))}
                          {c.warranty_sessions>0 && (
                            <span className="ml-auto bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg text-violet-700 font-bold text-[10px]">
                              ⚠ {c.warranty_sessions} warranty · {inr(c.foregone_revenue)} not charged
                            </span>
                          )}
                        </div>

                        {v==='tickets' && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                  <th className="py-2">Ticket</th><th>Warranty</th><th>Invoice</th><th>Workers</th><th>Hrs</th>
                                  <th className="text-right">Rate Card</th><th className="text-right">Charged</th><th className="text-right">Diff</th>
                                  <th>IRC Cost</th><th>IRC Profit</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {c.ticket_breakdown.map(t => (
                                  <tr key={t.ticket_id} className={t.warranty_status==='in_warranty'?'bg-violet-50/30':''}>
                                    <td className="py-2"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{t.ticket_no}</span></td>
                                    <td className="py-2">
                                      {t.warranty_status==='in_warranty'
                                        ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">⚠ Free</span>
                                        : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Billable</span>}
                                    </td>
                                    <td className="py-2 text-slate-600 font-mono">{t.invoice_no || <span className="text-slate-300 italic">—</span>}</td>
                                    <td className="py-2 text-slate-700">{t.workers.join(', ')}</td>
                                    <td className="py-2 text-slate-600">{t.hours}h</td>
                                    <td className="py-2 text-right text-slate-500 text-[10px]">{inr(t.standard_revenue || 0)}</td>
                                    <td className="py-2 text-right font-bold text-slate-700">
                                      {t.warranty_status === 'in_warranty'
                                        ? <span className="text-violet-600 italic text-[10px]">Warranty</span>
                                        : t.has_charged ? inr(t.revenue) : <span className="text-amber-600 italic text-[10px]">Not Billed</span>}
                                    </td>
                                    <td className={`py-2 text-right font-black ${
                                      !t.has_charged || t.warranty_status === 'in_warranty' ? 'text-slate-300' :
                                      t.charged_diff > 0 ? 'text-emerald-600' :
                                      t.charged_diff < 0 ? 'text-red-600' : 'text-slate-400'
                                    }`} title={t.has_charged && t.standard_revenue > 0 ? `${((t.charged_diff/t.standard_revenue)*100).toFixed(1)}%` : ''}>
                                      {t.warranty_status === 'in_warranty' ? '—' :
                                       !t.has_charged ? '—' :
                                       t.charged_diff > 0 ? `+${inr(t.charged_diff)}` :
                                       t.charged_diff < 0 ? inr(t.charged_diff) : '=₹0'}
                                    </td>
                                    <td className="py-2 text-orange-600 font-bold">{inr(t.irc_cost)}</td>
                                    <td className={`py-2 font-black ${t.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{t.irc_profit>=0?'+':''}{inr(t.irc_profit)}</td>
                                  </tr>
                                ))}
                                {c.ticket_breakdown.length === 0 && <tr><td colSpan={10} className="text-center py-6 text-slate-400">No tickets.</td></tr>}
                              </tbody>
                            </table>
                            {c.ticket_breakdown.length > 0 && (() => {
                              const totalRateCard = c.ticket_breakdown.reduce((a,t)=>a + (t.standard_revenue||0), 0);
                              const totalCharged  = c.ticket_breakdown.filter(t=>t.has_charged).reduce((a,t)=>a + (t.revenue||0), 0);
                              const totalDiff     = totalCharged - c.ticket_breakdown.filter(t=>t.has_charged).reduce((a,t)=>a + (t.standard_revenue||0), 0);
                              const notBilledCount = c.ticket_breakdown.filter(t=>!t.has_charged && t.warranty_status!=='in_warranty').length;
                              return (
                                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3 text-[11px]">
                                  <div className="flex items-center gap-4 flex-wrap">
                                    <span className="text-slate-500">Rate Card Total: <span className="font-black text-slate-800">{inr(totalRateCard)}</span></span>
                                    <span className="text-slate-500">Charged Total: <span className="font-black text-slate-800">{inr(totalCharged)}</span></span>
                                    <span className={`font-black ${totalDiff > 0 ? 'text-emerald-600' : totalDiff < 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                      Diff: {totalDiff > 0 ? '+' : ''}{inr(totalDiff)}
                                    </span>
                                  </div>
                                  {notBilledCount > 0 && (
                                    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                                      ⚠ {notBilledCount} ticket{notBilledCount>1?'s':''} not billed yet
                                    </span>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {v==='workers' && (
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100"><th className="py-2">Worker</th><th>Sessions</th><th>Hours</th><th>Revenue</th><th>IRC Cost</th><th>IRC Profit</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {c.worker_breakdown.map(w => (
                                <tr key={w.worker_id}>
                                  <td className="py-2 font-bold text-slate-700">{w.worker_name} <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${w.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{w.worker_role}</span></td>
                                  <td className="py-2 text-slate-600">{w.sessions}</td>
                                  <td className="py-2 text-slate-600">{w.hours}h</td>
                                  <td className="py-2 text-emerald-600 font-bold">{inr(w.revenue)}</td>
                                  <td className="py-2 text-orange-600 font-bold">{inr(w.irc_cost)}</td>
                                  <td className={`py-2 font-black ${w.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{w.irc_profit>=0?'+':''}{inr(w.irc_profit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {v==='timeline' && (
                          c.timeline.length === 0 ? <p className="text-center py-6 text-slate-400 text-sm">No data.</p> :
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={c.timeline} margin={{top:5,right:5,left:-10,bottom:0}}>
                              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                              <XAxis dataKey="bucket" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                              <Tooltip formatter={(v)=>inr(v)} contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
                              <Bar dataKey="revenue"    name="Revenue"    fill="#10b981" radius={[3,3,0,0]} maxBarSize={20}/>
                              <Bar dataKey="irc_cost"   name="IRC Cost"   fill="#ea580c" radius={[3,3,0,0]} maxBarSize={20}/>
                              <Bar dataKey="irc_profit" name="IRC Profit" fill="#2563eb" radius={[3,3,0,0]} maxBarSize={20}/>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
            {data.customers.length===0 && <tr><td colSpan={10} className="text-center py-12 text-slate-400">No data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── AGENT-WISE ─── */
function AgentWiseSection({ dateFrom, dateTo, granularity, inr }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState(null);
  const [expandedCust, setExpandedCust] = useState({});
  const [view, setView] = useState({});

  useEffect(() => {
    setLoading(true);
    svcApi.get('/reports/profitability/agent-wise', { params:{from:dateFrom,to:dateTo,granularity} })
      .then(r=>setData(r.data)).catch(e=>console.error(e)).finally(()=>setLoading(false));
  }, [dateFrom, dateTo, granularity]);

  if (loading) return <div className="flex items-center justify-center py-12"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;
  if (!data) return null;

  const dlCSV = () => exportCSV(
    data.agents,
    [
      {key:'sales_agent',label:'Sales Agent'},{key:'ticket_count',label:'Tickets'},{key:'customer_count',label:'Customers'},
      {key:'worker_count',label:'Workers'},{key:'sessions',label:'Sessions'},
      {key:'warranty_sessions',label:'Warranty Sessions'},{key:'billable_sessions',label:'Billable Sessions'},
      {key:'hours',label:'Hours'},{key:'revenue',label:'Revenue'},{key:'foregone_revenue',label:'Warranty Lost'},
      {key:'irc_cost',label:'IRC Cost'},{key:'irc_profit',label:'IRC Profit'},{key:'irc_margin',label:'IRC Margin %'},
    ],
    `agent_wise_${dateFrom}_${dateTo}.csv`
  );

  const setAgentView = (agent, v) => setView(p => ({ ...p, [agent]: v }));
  const toggleCust = (key) => setExpandedCust(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-slate-900">Sales Agent-wise Profitability</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Click agent → customer breakdown with ticket IDs · warranty tracked separately</p>
        </div>
        <button onClick={dlCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-600 text-xs font-bold rounded-xl hover:bg-blue-100">
          <span className="w-3 h-3">{I.download}</span>CSV
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>{['Agent','Customers','Tickets','Sessions','Hours','Revenue','Warranty (lost)','IRC Cost','IRC Profit',''].map(h=>
              <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-3 whitespace-nowrap">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.agents.map(a => {
              const isOpen = expandedAgent === a.sales_agent;
              const v = view[a.sales_agent] || 'customers';
              return (
                <React.Fragment key={a.sales_agent}>
                  <tr onClick={()=>setExpandedAgent(isOpen?null:a.sales_agent)} className={`hover:bg-slate-50/60 cursor-pointer ${a.irc_profit<0?'bg-red-50/30':''} ${isOpen?'bg-blue-50/40':''}`}>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">{a.sales_agent.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase()}</div>
                        <span className="font-bold text-slate-800">{a.sales_agent}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{a.customer_count}</td>
                    <td className="px-3 py-3 text-slate-600">{a.ticket_count}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-600">{a.sessions}</span>
                        {a.warranty_sessions > 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{a.warranty_sessions}W</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{a.hours}h</td>
                    <td className="px-3 py-3 text-emerald-600 font-bold">{inr(a.revenue)}</td>
                    <td className="px-3 py-3 text-violet-600 font-bold">{a.foregone_revenue>0?inr(a.foregone_revenue):'—'}</td>
                    <td className="px-3 py-3 text-orange-600 font-bold">{inr(a.irc_cost)}</td>
                    <td className={`px-3 py-3 font-black ${a.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{a.irc_profit>=0?'+':''}{inr(a.irc_profit)} <span className="text-[9px] opacity-60">({a.irc_margin}%)</span></td>
                    <td className="px-3 py-3">
                      <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr><td colSpan={10} className="px-4 py-4 bg-blue-50/20">
                      <div className="bg-white rounded-2xl border border-blue-100 p-4">
                        <div className="flex items-center gap-2 mb-4 flex-wrap">
                          {['customers','workers','timeline'].map(t=>(
                            <button key={t} onClick={()=>setAgentView(a.sales_agent, t)} className={`text-[11px] font-bold px-3 py-1 rounded-lg capitalize transition-all ${v===t?'bg-slate-900 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t}</button>
                          ))}
                          {a.warranty_sessions>0 && <span className="ml-auto bg-violet-50 border border-violet-200 px-2 py-1 rounded-lg text-violet-700 font-bold text-[10px]">⚠ {a.warranty_sessions} warranty · {inr(a.foregone_revenue)} not charged</span>}
                        </div>

                        {v==='customers' && (
                          <div className="space-y-2">
                            {a.customer_breakdown.map(c => {
                              const ckey = `${a.sales_agent}::${c.customer_name}`;
                              const cOpen = expandedCust[ckey];
                              return (
                                <div key={ckey} className={`rounded-xl border ${c.irc_profit<0?'border-red-200 bg-red-50/30':'border-slate-200 bg-slate-50/50'}`}>
                                  <div onClick={()=>toggleCust(ckey)} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-white/60 rounded-xl">
                                    <span className="font-bold text-slate-800 flex-1">🏢 {c.customer_name}</span>
                                    <span className="text-[10px] text-slate-500">{c.ticket_count} ticket{c.ticket_count!==1?'s':''}</span>
                                    {c.warranty_sessions>0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">{c.warranty_sessions}W</span>}
                                    <span className="text-[11px] text-slate-600">{c.hours}h</span>
                                    <span className="text-[11px] text-emerald-600 font-bold w-20 text-right">{inr(c.revenue)}</span>
                                    <span className="text-[11px] text-orange-600 font-bold w-20 text-right">{inr(c.irc_cost)}</span>
                                    <span className={`text-[11px] font-black w-24 text-right ${c.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{c.irc_profit>=0?'+':''}{inr(c.irc_profit)}</span>
                                    <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${cOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                                  </div>
                                  {cOpen && (
                                    <div className="px-4 pb-3 pt-1 overflow-x-auto">
                                      <table className="w-full text-[11px]">
                                        <thead>
                                          <tr className="text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                            <th className="py-2">Ticket ID</th><th>Warranty</th><th>Invoice</th><th>Workers</th><th>Hrs</th>
                                            <th className="text-right">Rate Card</th><th className="text-right">Charged</th><th className="text-right">Diff</th>
                                            <th>IRC Cost</th><th>IRC Profit</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {c.tickets.map(t => (
                                            <tr key={t.ticket_id} className={t.warranty_status==='in_warranty'?'bg-violet-50/40':''}>
                                              <td className="py-2"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{t.ticket_no}</span></td>
                                              <td className="py-2">
                                                {t.warranty_status==='in_warranty'
                                                  ? <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">⚠ Free</span>
                                                  : <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Billable</span>}
                                              </td>
                                              <td className="py-2 text-slate-600 font-mono">{t.invoice_no || <span className="text-slate-300 italic">—</span>}</td>
                                              <td className="py-2 text-slate-700">{t.workers.join(', ')}</td>
                                              <td className="py-2 text-slate-600">{t.hours}h</td>
                                              <td className="py-2 text-right text-slate-500 text-[10px]">{inr(t.standard_revenue || 0)}</td>
                                              <td className="py-2 text-right font-bold text-slate-700">
                                                {t.warranty_status === 'in_warranty' ? <span className="text-violet-600 italic text-[10px]">Warranty</span> :
                                                 t.has_charged ? inr(t.revenue) : <span className="text-amber-600 italic text-[10px]">Not Billed</span>}
                                              </td>
                                              <td className={`py-2 text-right font-black ${
                                                !t.has_charged || t.warranty_status === 'in_warranty' ? 'text-slate-300' :
                                                t.charged_diff > 0 ? 'text-emerald-600' :
                                                t.charged_diff < 0 ? 'text-red-600' : 'text-slate-400'
                                              }`} title={t.has_charged && t.standard_revenue > 0 ? `${((t.charged_diff/t.standard_revenue)*100).toFixed(1)}%` : ''}>
                                                {t.warranty_status === 'in_warranty' ? '—' :
                                                 !t.has_charged ? '—' :
                                                 t.charged_diff > 0 ? `+${inr(t.charged_diff)}` :
                                                 t.charged_diff < 0 ? inr(t.charged_diff) : '=₹0'}
                                              </td>
                                              <td className="py-2 text-orange-600 font-bold">{inr(t.irc_cost)}</td>
                                              <td className={`py-2 font-black ${t.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{t.irc_profit>=0?'+':''}{inr(t.irc_profit)}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {v==='workers' && (
                          <table className="w-full text-[11px]">
                            <thead><tr className="text-left text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100"><th className="py-2">Worker</th><th>Sessions</th><th>Hours</th><th>Revenue</th><th>Warranty Lost</th><th>IRC Cost</th><th>IRC Profit</th></tr></thead>
                            <tbody className="divide-y divide-slate-100">
                              {a.worker_breakdown.map(w => (
                                <tr key={w.worker_id}>
                                  <td className="py-2 font-bold text-slate-700">{w.worker_name} <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-1 ${w.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{w.worker_role}</span></td>
                                  <td className="py-2 text-slate-600">{w.sessions}</td>
                                  <td className="py-2 text-slate-600">{w.hours}h</td>
                                  <td className="py-2 text-emerald-600 font-bold">{inr(w.revenue)}</td>
                                  <td className="py-2 text-violet-600 font-bold">{w.foregone_revenue>0?inr(w.foregone_revenue):'—'}</td>
                                  <td className="py-2 text-orange-600 font-bold">{inr(w.irc_cost)}</td>
                                  <td className={`py-2 font-black ${w.irc_profit>=0?'text-emerald-600':'text-red-600'}`}>{w.irc_profit>=0?'+':''}{inr(w.irc_profit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}

                        {v==='timeline' && (
                          <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={a.timeline} margin={{top:5,right:5,left:-10,bottom:0}}>
                              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                              <XAxis dataKey="bucket" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                              <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                              <Tooltip formatter={(v)=>inr(v)} contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} itemStyle={{color:'#fff'}} labelStyle={{color:'#fff',fontWeight:700}}/>
                              <Bar dataKey="revenue"    name="Revenue"    fill="#10b981" radius={[3,3,0,0]} maxBarSize={20}/>
                              <Bar dataKey="irc_cost"   name="IRC Cost"   fill="#ea580c" radius={[3,3,0,0]} maxBarSize={20}/>
                              <Bar dataKey="irc_profit" name="IRC Profit" fill="#2563eb" radius={[3,3,0,0]} maxBarSize={20}/>
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                    </td></tr>
                  )}
                </React.Fragment>
              );
            })}
            {data.agents.length===0 && <tr><td colSpan={10} className="text-center py-12 text-slate-400">No data.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── PRICING EDITOR ─── */
function PricingEditor() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    svcApi.get('/reports/pricing').then(r=>setRows(r.data)).catch(e=>console.error(e)).finally(()=>setLoading(false));
  }, []);
  useEffect(()=>{ load(); }, [load]);

  const onChange = (id, field, value) => setEdits(p => ({ ...p, [id]: { ...(p[id]||{}), [field]: value } }));

  const saveRow = async (id) => {
    if (!edits[id]) return;
    setSavingId(id);
    try {
      const payload = {};
      Object.entries(edits[id]).forEach(([k,v]) => { payload[k] = v === '' ? null : Number(v); });
      await svcApi.patch(`/reports/pricing/${id}`, payload);
      setEdits(p => { const c = {...p}; delete c[id]; return c; });
      setSavedId(id); setTimeout(()=>setSavedId(null), 2000);
      load();
    } catch(e){ alert(e.response?.data?.error||'Failed'); }
    finally { setSavingId(null); }
  };

  if (loading) return <div className="bg-white rounded-3xl border border-slate-200/60 p-12 flex items-center justify-center"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;

  const groups = {};
  rows.forEach(r => { if (!groups[r.service_type]) groups[r.service_type]=[]; groups[r.service_type].push(r); });

  const cell = (r, field, color) => {
    const edited = edits[r.id]?.[field] !== undefined;
    const val = edited ? edits[r.id][field] : r[field];
    return <input type="number" value={val ?? ''} onChange={e=>onChange(r.id, field, e.target.value)}
      className={`w-24 px-2 py-1 bg-slate-50 border rounded-lg text-xs font-bold outline-none focus:bg-white ${edited?'border-blue-400 bg-blue-50':'border-slate-200'} ${color}`}/>;
  };

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([service, list]) => (
        <div key={service} className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h3 className="text-sm font-black text-slate-900 capitalize">{service} Pricing</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Edit any field inline · click Save when done</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr>{['Location','Seniority','Per Day','Half Day','A-Grade','B-Grade','C-Grade','Save'].map(h=>
                  <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
                )}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map(r => {
                  const dirty = !!edits[r.id];
                  return (
                    <tr key={r.id} className={`hover:bg-slate-50/60 ${dirty?'bg-blue-50/30':''}`}>
                      <td className="px-4 py-3 font-bold text-slate-800 capitalize">{r.location.replace(/_/g,' ')}</td>
                      <td className="px-4 py-3"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 capitalize">{r.seniority}</span></td>
                      <td className="px-4 py-3">{cell(r,'per_day_rate','text-slate-700')}</td>
                      <td className="px-4 py-3">{cell(r,'half_day_rate','text-slate-600')}</td>
                      <td className="px-4 py-3">{cell(r,'grade_a_rate','text-blue-600')}</td>
                      <td className="px-4 py-3">{cell(r,'grade_b_rate','text-violet-600')}</td>
                      <td className="px-4 py-3">{cell(r,'grade_c_rate','text-emerald-600')}</td>
                      <td className="px-4 py-3">
                        <button onClick={()=>saveRow(r.id)} disabled={!dirty||savingId===r.id}
                          className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                            savedId===r.id ? 'bg-emerald-100 text-emerald-700' :
                            dirty ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                          {savingId===r.id ? 'Saving…' : savedId===r.id ? '✓ Saved' : dirty ? 'Save' : '—'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── SALARY EDITOR ─── */
function SalaryEditor() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId]   = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    svcApi.get('/reports/workers/salaries').then(r=>setRows(r.data)).catch(e=>console.error(e)).finally(()=>setLoading(false));
  }, []);
  useEffect(()=>{ load(); }, [load]);

  const onChange = (id, field, value) => setEdits(p => ({ ...p, [id]: { ...(p[id]||{}), [field]: value } }));

  const saveRow = async (id) => {
    if (!edits[id]) return;
    setSavingId(id);
    try {
      const payload = {};
      const e = edits[id];
      if ('monthly_salary' in e) payload.monthly_salary = e.monthly_salary === '' ? null : Number(e.monthly_salary);
      if ('working_days'   in e) payload.working_days   = e.working_days   === '' ? null : Number(e.working_days);
      if ('daily_hours'    in e) payload.daily_hours    = e.daily_hours    === '' ? null : Number(e.daily_hours);
      if ('seniority'      in e) payload.seniority      = e.seniority;
      if ('irc_daily_rate' in e) payload.irc_daily_rate = e.irc_daily_rate === '' ? null : Number(e.irc_daily_rate);
      await svcApi.patch(`/reports/workers/${id}/salary`, payload);
      setEdits(p => { const c = {...p}; delete c[id]; return c; });
      setSavedId(id); setTimeout(()=>setSavedId(null), 2000);
      load();
    } catch(err){ alert(err.response?.data?.error||'Failed'); }
    finally { setSavingId(null); }
  };

  if (loading) return <div className="bg-white rounded-3xl border border-slate-200/60 p-12 flex items-center justify-center"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/></div>;

  const cell = (r, field, color='text-slate-700', width='w-24') => {
    const edited = edits[r.id]?.[field] !== undefined;
    const val = edited ? edits[r.id][field] : r[field];
    return <input type="number" value={val ?? ''} onChange={e=>onChange(r.id, field, e.target.value)}
      className={`${width} px-2 py-1 bg-slate-50 border rounded-lg text-xs font-bold outline-none focus:bg-white ${edited?'border-blue-400 bg-blue-50':'border-slate-200'} ${color}`}/>;
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-sm font-black text-slate-900">Worker Salaries & IRC Rates</h3>
        <p className="text-[11px] text-slate-400 mt-0.5">Edit monthly salary, IRC daily rate, working days · used for profit calculations</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>{['Worker','Role','Seniority','Monthly Salary','Working Days','Daily Hrs','IRC Daily Rate','Save'].map(h=>
              <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>
            )}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(r => {
              const dirty = !!edits[r.id];
              const sen = edits[r.id]?.seniority ?? r.seniority;
              return (
                <tr key={r.id} className={`hover:bg-slate-50/60 ${dirty?'bg-blue-50/30':''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${r.role==='plc'?'bg-blue-500':'bg-emerald-500'}`}>{r.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                      <div><p className="font-bold text-slate-800">{r.name}</p><p className="text-[10px] text-slate-400 font-mono">{r.phone}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${r.role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{r.role}</span></td>
                  <td className="px-4 py-3">
                    <select value={sen} onChange={e=>onChange(r.id,'seniority',e.target.value)} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:bg-white">
                      <option value="junior">junior</option>
                      <option value="senior">senior</option>
                      <option value="specialist">specialist</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{cell(r,'monthly_salary','text-amber-600','w-28')}</td>
                  <td className="px-4 py-3">{cell(r,'working_days','text-slate-600','w-16')}</td>
                  <td className="px-4 py-3">{cell(r,'daily_hours','text-slate-600','w-16')}</td>
                  <td className="px-4 py-3">{cell(r,'irc_daily_rate','text-orange-600','w-28')}</td>
                  <td className="px-4 py-3">
                    <button onClick={()=>saveRow(r.id)} disabled={!dirty||savingId===r.id}
                      className={`text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                        savedId===r.id ? 'bg-emerald-100 text-emerald-700' :
                        dirty ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}>
                      {savingId===r.id ? 'Saving…' : savedId===r.id ? '✓ Saved' : dirty ? 'Save' : '—'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── REPORTS TAB ─── */
function ReportsTab() {
  const [weekData,setWeekData] = useState([]);
  const [dayData,setDayData]   = useState([]);
  const [persons,setPersons]   = useState([]);
  const [selDay,setSelDay]     = useState(new Date().toISOString().slice(0,10));
  const [selPerson,setSelPerson]=useState(null);
  const [personDays,setPersonDays]=useState([]);
  const [dateFrom,setDateFrom] = useState(()=>{const d=new Date();d.setDate(d.getDate()-29);return d.toISOString().slice(0,10);});
  const [dateTo,setDateTo]     = useState(new Date().toISOString().slice(0,10));
  const [loading,setLoading]   = useState(false);

  const loadAll = useCallback(async()=>{
    setLoading(true);
    try{
      const[w,d,p]=await Promise.all([
        svcApi.get('/reports/weekly',{params:{days:14}}),
        svcApi.get('/reports/daily',{params:{date:selDay}}),
        svcApi.get('/reports/person-wise',{params:{from:dateFrom,to:dateTo}}),
      ]);
      setWeekData(w.data.map(r=>({...r,day:fmtDay(r.day),hours:+(r.total_seconds/3600).toFixed(2)})));
      setDayData(d.data.map(r=>({...r,label:fmtHour(r.hour),hours:+(r.total_seconds/3600).toFixed(2)})));
      setPersons(p.data.map(r=>({...r,hours:+(r.total_seconds/3600).toFixed(2)})));
    }catch(e){console.error(e);}finally{setLoading(false);}
  },[selDay,dateFrom,dateTo]);

  useEffect(()=>{loadAll();},[loadAll]);

  const loadPersonDays = async(w)=>{
    if(selPerson?.worker_id===w.worker_id){setSelPerson(null);setPersonDays([]);return;}
    setSelPerson(w);
    try{
      const{data}=await svcApi.get(`/reports/person-detail/${w.worker_id}`,{params:{from:dateFrom,to:dateTo}});
      setPersonDays(data.map(r=>({...r,day:fmtD(r.day),hours:+(r.total_seconds/3600).toFixed(2)})));
    }catch(e){console.error(e);}
  };

  const totalHrs = weekData.reduce((a,r)=>a+r.hours,0).toFixed(1);
  const peakHour = [...dayData].sort((a,b)=>b.hours-a.hours)[0];
  const topWorker= [...persons].sort((a,b)=>b.total_seconds-a.total_seconds)[0];

  const dlWeekly=()=>exportCSV(weekData,[{key:'day',label:'Day'},{key:'hours',label:'Hours'},{key:'session_count',label:'Sessions'}],`weekly_report.csv`);
  const dlDaily =()=>exportCSV(dayData,[{key:'label',label:'Hour'},{key:'hours',label:'Hours'}],`daily_report_${selDay}.csv`);
  const dlPers  =()=>exportCSV(persons,[{key:'worker_name',label:'Name'},{key:'worker_role',label:'Role'},{key:'session_count',label:'Sessions'},{key:'hours',label:'Hours'}],`person_report.csv`);

  const Tip=({active,payload,label})=>active&&payload?.length?(
    <div className="bg-slate-900 text-white rounded-xl shadow-2xl px-3 py-2 text-xs border border-slate-700">
      <p className="font-bold mb-1">{label}</p>
      {payload.map((p,i)=><p key={i} className="font-semibold" style={{color:p.color}}>{p.name}: <span className="text-white">{p.value}{p.dataKey==='hours'?'h':''}</span></p>)}
    </div>
  ):null;

  if(loading) return <div className="flex items-center justify-center py-32"><div className="w-10 h-10 border-2 border-slate-100 border-t-slate-900 rounded-full animate-spin"/></div>;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-slate-200/60 px-5 py-3.5 flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Range</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
        <span className="text-slate-300 text-xs">→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
        <button onClick={loadAll} className="px-4 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800">Apply</button>
        <div className="ml-auto flex gap-2">
          {[['Weekly',dlWeekly],['Daily',dlDaily],['Person',dlPers]].map(([l,fn])=>(
            <button key={l} onClick={fn} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all">
              <span className="w-3 h-3">{I.download}</span>{l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
          <p className="text-xs font-medium text-slate-400 mb-1.5 relative">Total Work Logged</p>
          <p className="text-3xl font-black relative">{totalHrs}<span className="text-base ml-1 text-slate-400">h</span></p>
          <p className="text-[11px] text-slate-500 mt-1 relative">Last 14 days</p>
        </div>
        {[['Peak Hour',peakHour?fmtHour(peakHour.hour):'—',peakHour?`${peakHour.hours}h logged`:'','↑ 4.7%'],['Top Performer',topWorker?.worker_name?.split(' ')[0]||'—',topWorker?fmtH(topWorker.total_seconds||0):'','↑ 8.4%'],['Active Workers',`${persons.filter(p=>p.total_seconds>0).length}`,`of ${persons.length} total`,'↑ 12%']].map(([l,v,sub,delta])=>(
          <div key={l} className="bg-white rounded-3xl p-5 border border-slate-200/60 hover:shadow-sm transition-all">
            <div className="flex items-start justify-between mb-2">
              <p className="text-xs font-medium text-slate-500">{l}</p>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">{delta}</span>
            </div>
            <p className="text-3xl font-black text-slate-900">{v}</p>
            <p className="text-[11px] text-slate-400 mt-1">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Weekly Activity</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Hours · sessions, last 14 days</p>
            </div>
            <span className="text-[11px] text-slate-400 font-semibold">{totalHrs}h total</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={weekData} margin={{top:5,right:5,left:-25,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Line type="monotone" dataKey="hours" name="Hours" stroke="#1e293b" strokeWidth={2.5} dot={{r:0}} activeDot={{r:5,fill:'#1e293b'}}/>
              <Line type="monotone" dataKey="session_count" name="Sessions" stroke="#3b82f6" strokeWidth={2} dot={{r:0}} activeDot={{r:5,fill:'#3b82f6'}} strokeDasharray="4 4"/>
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Hourly Performance</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{fmtD(selDay)}</p>
            </div>
            <input type="date" value={selDay} onChange={e=>setSelDay(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dayData.filter(d=>d.hour>=6&&d.hour<=22)} margin={{top:5,right:5,left:-25,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="hours" name="Hours" fill="#3b82f6" radius={[6,6,0,0]} maxBarSize={20}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black text-slate-900">Worker Performance</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Click a worker for day-wise breakdown</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>{['Worker','Role','Sessions','Hours'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-3 py-3">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {persons.map(p => (
                <tr key={p.worker_id} onClick={()=>loadPersonDays(p)} className={`hover:bg-slate-50/60 cursor-pointer ${selPerson?.worker_id===p.worker_id?'bg-blue-50/40':''}`}>
                  <td className="px-3 py-3 font-bold text-slate-800">{p.worker_name}</td>
                  <td className="px-3 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{p.worker_role}</span></td>
                  <td className="px-3 py-3 text-slate-600">{p.session_count}</td>
                  <td className="px-3 py-3 font-bold text-slate-800">{p.hours}h</td>
                </tr>
              ))}
              {persons.length===0 && <tr><td colSpan={4} className="text-center py-8 text-slate-400">No data.</td></tr>}
            </tbody>
          </table>
        </div>
        {selPerson && personDays.length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-black text-slate-700 mb-3">{selPerson.worker_name} — day-wise</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={personDays} margin={{top:5,right:5,left:-20,bottom:0}}>
                <defs>
                  <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                <XAxis dataKey="day" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <Tooltip content={<Tip/>}/>
                <Area type="monotone" dataKey="hours" stroke="#3b82f6" strokeWidth={2.5} fill="url(#pgrad)"/>
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <PauseAnalyticsSection dateFrom={dateFrom} dateTo={dateTo}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* ─── MAIN DASHBOARD                                          ─── */
/* ═══════════════════════════════════════════════════════════════ */
export default function AdminDashboard() {
  const { svcUser, svcLogout, isSuperAdmin } = useSvcAuth();
  const navigate = useNavigate();
  const { tab: urlTab } = useParams();

  const VALID_TABS = ['overview','tickets','workers','reports','profitability','users','sessions','tasks'];
  const tab = VALID_TABS.includes(urlTab) ? urlTab : 'overview';
  const setTab = useCallback((newTab) => navigate(`/service/admin/${newTab}`), [navigate]);

  useEffect(() => {
    const restricted = ['reports','profitability','users','sessions'];
    if (!isSuperAdmin && restricted.includes(tab)) {
      navigate('/service/admin/overview', { replace: true });
    }
  }, [tab, isSuperAdmin, navigate]);

  const [tickets,setTickets]   = useState([]);
  const [workers,setWorkers]   = useState([]);
  const [allUsers,setAllUsers] = useState([]);
  const [sessions,setSessions] = useState([]);
  const [filters,setFilters]   = useState({status:'All',priority:'All',service_type:'All',search:''});
  const [expanded,setExpanded] = useState(null);
  const [assignM,setAssignM]   = useState(null);
  const [reopenM, setReopenM] = useState(null);   // ticket being reopened
  const [aData, setAData]      = useState({ plc:[], wireman:[] });
  const [keyModal,setKeyModal] = useState(null);
  const [addUserM,setAddUserM] = useState(false);
  const [newUser,setNewUser]   = useState({name:'',phone:'',role:'plc',department:''});
  const [busy,setBusy]         = useState(false);
  const [liveEvents,setLiveEvents] = useState([]);

  useSocket({
    'session:started':   e => { addLive(`▶ ${e.worker?.name} started`,'emerald'); loadSessions(); },
    'session:paused':    e => { addLive(`⏸ ${e.worker} — ${e.reason}`,'amber'); loadSessions(); },
    'session:resumed':   e => { addLive(`▶ ${e.worker} resumed`,'blue'); loadSessions(); },
    'session:completed': e => { addLive(`✓ ${e.worker} done (${fmtH(e.totalSeconds)})`,'slate'); loadSessions(); loadTickets(); },
  });
  const addLive = (msg,color) => {
    const ts = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
    setLiveEvents(p=>[{msg,color,ts,id:Date.now()},...p].slice(0,15));
  };

  const loadTickets  = useCallback(async()=>{try{const p={};if(filters.status!=='All')p.status=filters.status;if(filters.priority!=='All')p.priority=filters.priority;if(filters.service_type!=='All')p.service_type=filters.service_type;if(filters.search)p.search=filters.search;const{data}=await svcApi.get('/tickets',{params:p});setTickets(data);}catch(e){console.error(e);}},[filters]);
  const loadWorkers  = useCallback(async()=>{try{const{data}=await svcApi.get('/auth/workers');setWorkers(data);}catch(e){console.error(e);}},[]);
  const loadAllUsers = useCallback(async()=>{if(!isSuperAdmin)return;try{const{data}=await svcApi.get('/auth/all-users');setAllUsers(data);}catch(e){console.error(e);}},[isSuperAdmin]);
  const loadSessions = useCallback(async()=>{try{const{data}=await svcApi.get('/sessions/all');setSessions(data);}catch(e){console.error(e);}},[]);

  useEffect(()=>{loadTickets();},[loadTickets]);
  useEffect(()=>{
    loadWorkers();
    loadSessions();
    if (isSuperAdmin) loadAllUsers();
  },[loadWorkers, loadSessions, loadAllUsers, isSuperAdmin]);

  const [reminderCount, setReminderCount] = useState(0);
useEffect(() => {
  svcApi.get('/scheduled-tasks/reminders')
    .then(r => setReminderCount(r.data.length))
    .catch(()=>{});
}, [tickets]);   // refresh when tickets reload

  // const plcW  = workers.filter(w=>w.role==='plc');
  // const wireW = workers.filter(w=>w.role==='wireman');
//   const plcW  = workers.filter(w => w.role === 'plc' || (w.role === 'heads' && w.department === 'PLC'));
// const wireW = workers.filter(w => w.role === 'wireman' || (w.role === 'heads' && w.department === 'Wireman'));
const plcW  = workers.filter(w => w.role === 'plc' || (w.role === 'admin' && w.department === 'PLC'));
const wireW = workers.filter(w => w.role === 'wireman' || (w.role === 'admin' && w.department === 'Wireman'));
  const openAssign = tk => {
    if (TERMINAL.includes(tk.status)) { alert('Cannot assign a completed/closed ticket.'); return; }
    setAssignM(tk);
    setAData({
      plc:     (tk.assigned_plcs    || []).map(a => a.worker_id),
      wireman: (tk.assigned_wiremen || []).map(a => a.worker_id),
    });
  };

  const saveAssign = async () => {
    setBusy(true);
    try {
      await svcApi.patch(`/tickets/${assignM.id}/assign`, {
        plc_ids: aData.plc,
        wireman_ids: aData.wireman,
      });
      setAssignM(null);
      loadTickets();
    } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const updateStatus = async (id,status) => {
    try { await svcApi.patch(`/tickets/${id}/status`,{status}); loadTickets(); }
    catch(e){ console.error(e); }
  };

  const regenKey = async (u) => {
    setBusy(true);
    try {
      const {data} = await svcApi.patch(`/auth/users/${u.id}/regen-key`);
      setKeyModal({id:u.id, name:u.name, newKey:data.secret_key});
      loadAllUsers();
    } catch(e){ alert(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const addUser = async () => {
    if (!newUser.name.trim() || !newUser.phone.trim()) { alert('Name and phone required'); return; }
    setBusy(true);
    try {
      const {data} = await svcApi.post('/auth/users', newUser);
      setAddUserM(false);
      setNewUser({name:'',phone:'',role:'plc',department:''});
      loadAllUsers();
      loadWorkers();
      if (data.secret_key) setKeyModal({id:data.id, name:data.name, newKey:data.secret_key});
    } catch(e){ alert(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (u) => {
    try { await svcApi.patch(`/auth/users/${u.id}`,{is_active:!u.is_active}); loadAllUsers(); loadWorkers(); }
    catch(e){ console.error(e); }
  };

  const exportTicketsCSV = () => {
    if (!tickets.length) { alert('No tickets to export'); return; }
    const cols = [
      {key:'ticket_id',label:'Ticket ID'},
      {key:'customer_name',label:'Customer'},
      {key:'address',label:'Address'},
      {key:'service_type',label:'Service'},
      {key:'priority',label:'Priority'},
      {key:'status',label:'Status'},
      {key:'plc_worker_names',label:'PLC Workers'},
      {key:'wireman_worker_names',label:'Wiremen'},
      {key:'contact_name',label:'Contact'},
      {key:'contact_phone',label:'Phone'},
      {key:'sales_agent',label:'Sales Agent'},
      {key:'created_at',label:'Created'},
    ];
    exportCSV(tickets, cols, `tickets_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const av = svcUser?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || '??';
  const counts = {
    total: tickets.length,
    open: tickets.filter(t=>t.status==='Open').length,
    assigned: tickets.filter(t=>t.status==='Assigned').length,
    inprog: tickets.filter(t=>t.status==='In Progress').length,
    done: tickets.filter(t=>t.status==='Completed').length,
    unassigned: tickets.filter(t=>{
      const noPLC = !t.assigned_plcs || t.assigned_plcs.length === 0;
      const noWM  = !t.assigned_wiremen || t.assigned_wiremen.length === 0;
      return noPLC && noWM && !TERMINAL.includes(t.status);
    }).length,
  };
  const liveCount = sessions.filter(s=>s.status==='running').length;

  const NAV = [
    {k:'overview', icon:I.home,     label:'Overview'},
    {k:'tickets',  icon:I.ticket,   label:'Tickets', badge:counts.unassigned||null},
    {k:'tasks', icon:I.tasks || I.ticket, label:'Tasks'},
    {k:'workers',  icon:I.workers,  label:'Workers'},
    ...(isSuperAdmin?[
      {k:'reports',       icon:I.reports,  label:'Reports'},
      {k:'profitability', icon:I.profit,   label:'Profitability'},
      {k:'users',         icon:I.users,    label:'Users'},
      {k:'sessions',      icon:I.sessions, label:'Sessions', badge:liveCount||null},
    ]:[]),
  ];

  return (
    <div className="flex h-screen bg-[#F5F6F8] font-sans overflow-hidden">

      {/* ════════════ LEFT ICON RAIL ════════════ */}
      <aside className="hidden md:flex w-16 bg-white border-r border-slate-200/60 flex-col items-center py-5 gap-1 flex-shrink-0 z-20">
        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-4 shadow-lg shadow-slate-900/15">
          <svg className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        {NAV.map(({k,icon,label,badge})=>(
          <button key={k} onClick={()=>setTab(k)} title={label}
            className={`group relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${tab===k?'bg-slate-900 text-white':'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <span className="w-[18px] h-[18px]">{icon}</span>
            {badge&&<span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>}
            <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30 shadow-xl">{label}</span>
          </button>
        ))}
        <button onClick={svcLogout} className="mt-auto w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all" title="Sign Out">
          <span className="w-[18px] h-[18px]">{I.logout}</span>
        </button>
      </aside>

      {/* ════════════ MAIN AREA ════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* TOPBAR */}
        <header className="bg-white border-b border-slate-200/60 px-4 md:px-6 lg:px-8 h-14 flex items-center gap-3 md:gap-4 flex-shrink-0">
          <Link to="/service/admin/overview" className="md:hidden flex items-center gap-2 flex-shrink-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-900 flex items-center justify-center shadow-md shadow-slate-900/20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div className="leading-tight">
              <p className="text-[13px] font-black text-slate-900 tracking-tight">CESS</p>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Engineering</p>
            </div>
          </Link>

          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md bg-slate-50 rounded-full px-4 py-1.5 border border-slate-200/60 focus-within:border-slate-400 focus-within:bg-white transition-all">
            <span className="w-3.5 h-3.5 text-slate-400">{I.search}</span>
            <input placeholder="Search tickets, customers..." value={filters.search}
              className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"
              onChange={e=>{setFilters(p=>({...p,search:e.target.value}));if(tab!=='tickets')setTab('tickets');}}/>
          </div>

          <Link to="/service" className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full transition-all">
            <span className="w-3 h-3">{I.plus}</span>New Request
          </Link>

          <div className="flex items-center gap-2 ml-auto">
            {liveCount>0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                <span className="text-[11px] font-bold text-emerald-700">{liveCount} live</span>
              </div>
            )}
            <button className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all relative">
              {/* <span className="w-3.5 h-3.5">{I.bell}</span>
              {liveEvents.length>0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"/>} */}
              <NotificationsBell/>
            </button>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${isSuperAdmin?'bg-gradient-to-br from-amber-400 to-orange-500':'bg-gradient-to-br from-blue-500 to-indigo-600'} ring-2 ring-white shadow`}>{av}</div>
          </div>
        </header>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto pb-20 md:pb-0">

          {/* ═══════════════════════════════════ */}
          {/* OVERVIEW TAB                        */}
          {/* ═══════════════════════════════════ */}
          {tab==='overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 p-5 lg:p-7">
              <div className="space-y-5 min-w-0">

                {/* Page title */}
                <div className="flex items-start gap-3 flex-wrap md:flex-nowrap">
                  <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="w-3 h-3 rounded-full border-2 border-white"/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight leading-tight">
                      Welcome Back, {svcUser?.name?.split(' ')[0]}
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                      You have <span className="text-blue-600 font-bold">{liveEvents.length + counts.unassigned} recent notifications</span>
                    </p>
                  </div>
                  <button onClick={exportTicketsCSV}
                    className="flex items-center gap-1.5 px-3 md:px-4 py-2 md:py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full transition-all shadow-md shadow-slate-900/10 whitespace-nowrap">
                    <span className="w-3 h-3">{I.download}</span>
                    <span className="hidden sm:inline">Export Report</span>
                    <span className="sm:hidden">Export</span>
                  </button>
                </div>

                {/* Hero KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                  <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden sm:col-span-2 md:col-span-1">
                    <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-500/30 blur-2xl"/>
                    <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-indigo-500/20 blur-2xl"/>
                    <button className="mt-1 px-4 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-full hover:bg-slate-100 transition-all relative shadow mb-1">Motivation</button>
                    <p className="text-sm font-bold mt-3 relative leading-snug">The way to get started is to<br/>quit talking and begin doing.</p>
                  </div>
                  {[
                    ['Total Tickets', counts.total,  counts.assigned+' assigned',    'tickets'],
                    ['In Progress',   counts.inprog, counts.unassigned+' unassigned','tickets'],
                    ['Completed',     counts.done,   'this month',                   'tickets'],
                  ].map(([l,v,sub,target])=>(
                    <button key={l} onClick={()=>setTab(target)}
                      className="bg-white rounded-3xl p-5 border border-slate-200/60 hover:shadow-md hover:border-slate-300 hover:-translate-y-0.5 transition-all text-left w-full group cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs font-medium text-slate-500">{l}</p>
                        <span className="w-3 h-3 inline-block text-slate-300 group-hover:text-blue-600 transition-colors">{I.upRight}</span>
                      </div>
                      <p className="text-3xl font-black text-slate-900">{v}<span className="text-base font-bold text-slate-300 ml-1">/{counts.total||1}</span></p>
                      <p className="text-[11px] text-slate-400 mt-2">{sub}</p>
                    </button>
                  ))}
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <OverviewChart tickets={tickets}/>
                  <SessionTrendChart sessions={sessions}/>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <OrdersByTimeHeatmap sessions={sessions}/>
                  <ProductStaticsChart tickets={tickets}/>
                </div>

                {/* Recent tickets */}
                <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Recent Tickets</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Latest 5 service tickets</p>
                    </div>
                    <button onClick={()=>setTab('tickets')} className="text-xs font-bold text-blue-600 hover:text-blue-700">View all →</button>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {tickets.slice(0,5).map(tk=>(
                      <button key={tk.id} onClick={()=>{setTab('tickets');setExpanded(tk.id);}}
                        className="w-full flex items-center gap-3 px-4 md:px-6 py-3.5 hover:bg-slate-50/60 transition-all text-left">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tk.status==='Completed'?'bg-emerald-400':tk.status==='In Progress'?'bg-amber-400':tk.status==='Assigned'?'bg-blue-400':'bg-slate-300'}`}/>
                        <span className="font-mono text-[10px] md:text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md flex-shrink-0">{tk.ticket_id}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs md:text-sm font-bold text-slate-800 truncate">{tk.customer_name}</p>
                          <p className="text-[10px] md:text-[11px] text-slate-400 capitalize truncate">{tk.service_type?.replace(/_/g,' ')} · {fmtD(tk.created_at)}</p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 flex-shrink-0">
                          <span className={`text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded-full border ${PR_CLR[tk.priority]} whitespace-nowrap`}>{tk.priority}</span>
                          <span className={`text-[9px] md:text-[10px] font-bold px-1.5 md:px-2 py-0.5 rounded-full ${ST_CLR[tk.status]} whitespace-nowrap`}>{tk.status}</span>
                        </div>
                      </button>
                    ))}
                    {!tickets.length && <p className="text-center py-8 text-sm text-slate-400">No tickets yet.</p>}
                  </div>
                </div>
              </div>

              {/* RIGHT widget rail */}
              <aside className="space-y-4">
                <div className="bg-slate-900 rounded-3xl p-5 text-white">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black">Live Activity</h3>
                  </div>
                  {liveEvents.length===0 ? (
                    <p className="text-center py-4 text-xs text-slate-500">No recent activity</p>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {liveEvents.slice(0,5).map(e=>(
                        <div key={e.id} className={`bg-slate-800/60 rounded-2xl px-3 py-2.5 border-l-2 ${e.color==='emerald'?'border-emerald-400':e.color==='amber'?'border-amber-400':e.color==='blue'?'border-blue-400':'border-slate-500'}`}>
                          <p className="text-[11px] font-medium leading-relaxed">{e.msg}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{e.ts}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white rounded-3xl border border-slate-200/60 p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-3">Quick Actions</h3>
                  <div className="space-y-1.5">
                    {[
                      ['+ New Inquiry','Raise a service ticket',()=>window.open('/service','_blank')],
                      ['All Tickets',`${counts.unassigned} unassigned`,()=>setTab('tickets')],
                      ...(isSuperAdmin?[['Reports','Analytics & exports',()=>setTab('reports')],['Manage Users',`${allUsers.length} users`,()=>setTab('users')]]:[])
                    ].map(([l,sub,fn],i)=>(
                      <button key={i} onClick={fn} className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-slate-50 transition-all text-left group">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-600 flex items-center justify-center text-slate-600 transition-all">→</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-800 truncate">{l}</p>
                          <p className="text-[10px] text-slate-400 truncate">{sub}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-900">Worker Status</h3>
                    <button onClick={()=>setTab('workers')} className="text-[10px] font-bold text-blue-600">View</button>
                  </div>
                  <div className="space-y-3">
                    {[['🖥','PLC Engineers',plcW.length,'bg-blue-100'],['⚡','Wiremen',wireW.length,'bg-emerald-100'],['●','Live Sessions',liveCount,'bg-emerald-100 animate-pulse']].map(([ic,l,v,bg])=>(
                      <div key={l} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center text-sm`}>{ic}</div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-800">{l}</p>
                          <p className="text-[10px] text-slate-400">{l==='Live Sessions'?'currently running':'active'}</p>
                        </div>
                        <span className={`text-sm font-black ${l==='Live Sessions'?'text-emerald-600':'text-slate-900'}`}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
              {tab==='tasks' && (
      <div className="p-5 lg:p-7">
        <ScheduledTasksTab/>
      </div>
    )}

          {/* ═══════════════════════════════════ */}
          {/* TICKETS TAB                         */}
          {/* ═══════════════════════════════════ */}
          {tab==='tickets' && (
            <div className="p-5 lg:p-7 space-y-4">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                {[['Total',counts.total,'bg-slate-900 text-white'],['Open',counts.open,'bg-white text-slate-700'],['Assigned',counts.assigned,'bg-white text-blue-600'],['In Progress',counts.inprog,'bg-white text-amber-600'],['Done',counts.done,'bg-white text-emerald-600'],['Unassigned',counts.unassigned,'bg-white text-red-600']].map(([l,v,c])=>(
                  <div key={l} className={`rounded-2xl p-4 border ${c.includes('slate-900')?'border-slate-900':'border-slate-200/60'} ${c}`}>
                    <p className="text-2xl font-black">{v}</p>
                    <p className={`text-[10px] mt-1 uppercase tracking-wider font-bold ${c.includes('slate-900')?'text-slate-400':'text-slate-400'}`}>{l}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="flex flex-wrap gap-2 p-5 border-b border-slate-100">
                  <input className="flex-1 min-w-36 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:border-slate-400" placeholder="🔍  Search ticket, customer…" value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))}/>
                  {[['status',['All','Open','Assigned','In Progress','Completed','Closed']],['priority',['All','High','Medium','Low']],['service_type',['All','installation','troubleshooting','new_development','after_sales']]].map(([k,opts])=>(
                    <select key={k} className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-2xl text-xs outline-none focus:border-slate-400 text-slate-700" value={filters[k]} onChange={e=>setFilters(p=>({...p,[k]:e.target.value}))}>
                      {opts.map(o=><option key={o} value={o}>{o==='All'?`All ${k.replace(/_/g,' ')}`:SVC_L[o]||o}</option>)}
                    </select>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr>{['Ticket','Customer','Service','Priority','Status','PLC','Wireman','Date','Actions'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!tickets.length?<tr><td colSpan={9} className="text-center py-16 text-slate-400">No tickets found.</td></tr>:tickets.map(tk=>{
                        const isDone = TERMINAL.includes(tk.status);
                        const isWarranty = tk.warranty_status === 'in_warranty';
                        return (
                          <React.Fragment key={tk.id}>
                            <tr className={`hover:bg-blue-50/30 transition-all ${expanded===tk.id?'bg-blue-50/40':''} ${isDone?'opacity-70':''}`}>
                            <td className="px-4 py-3.5"><Link to={`/service/admin/tickets/${tk.ticket_id}`} className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-all">{tk.ticket_id}</Link></td>
                              {/* <td className="px-4 py-3.5"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{tk.ticket_id}</span></td> */}
                              <td className="px-4 py-3.5 max-w-[130px]"><p className="font-bold text-slate-800 truncate">{tk.customer_name}</p><p className="text-[10px] text-slate-400 truncate">{tk.address?.slice(0,28)}</p></td>
                              <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{SVC_L[tk.service_type]||tk.service_type}</td>
                              <td className="px-4 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PR_CLR[tk.priority]}`}>{tk.priority}</span></td>
                              <td className="px-4 py-3.5">
                                <div className="flex flex-col gap-1 items-start">
                                  {isDone
                                    ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ST_CLR[tk.status]}`}>{tk.status}</span>
                                    : <select className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer bg-white text-slate-700 focus:border-slate-400" value={tk.status} onChange={e=>updateStatus(tk.id,e.target.value)}>
                                        {['Open','Assigned','In Progress','Completed','Closed'].map(s=><option key={s}>{s}</option>)}
                                      </select>}
                                  {tk.status === 'Completed' && !isWarranty && <BillingStateBadge ticketId={tk.id}/>}
                                </div>
                              </td>
                              <td className="px-4 py-3.5">
                                {tk.plc_worker_names ? (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {tk.plc_worker_names.split(', ').map((n,i)=>(
                                      <span key={i} className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{n.split(' ')[0]}</span>
                                    ))}
                                  </div>
                                ) : <span className="text-slate-300 italic text-[10px]">None</span>}
                              </td>
                              <td className="px-4 py-3.5">
                                {tk.wireman_worker_names ? (
                                  <div className="flex flex-wrap gap-1 max-w-[180px]">
                                    {tk.wireman_worker_names.split(', ').map((n,i)=>(
                                      <span key={i} className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{n.split(' ')[0]}</span>
                                    ))}
                                  </div>
                                ) : <span className="text-slate-300 italic text-[10px]">None</span>}
                              </td>
                              <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">{fmtD(tk.created_at)}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {!isDone && <button onClick={()=>openAssign(tk)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 mr-1.5">Assign</button>}
                                {isDone && <button onClick={()=>setReopenM(tk)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 mr-1.5">Reopen</button>}
                                <Link to={`/service/admin/tickets/${tk.ticket_id}`} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100">View</Link>
                              </td>
                              {/* <td className="px-4 py-3.5 whitespace-nowrap">
                                {!isDone && <button onClick={()=>openAssign(tk)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 mr-1.5">Assign</button>}
                                <button onClick={()=>setExpanded(expanded===tk.id?null:tk.id)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100">{expanded===tk.id?'Hide':'View'}</button>
                              </td> */}
                            </tr>
                            
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════ */}
          {/* WORKERS TAB                         */}
          {/* ═══════════════════════════════════ */}
          {tab==='workers' && (
            <div className="p-5 lg:p-7 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Service Workers</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{workers.length} active workers · {plcW.length} PLC · {wireW.length} Wireman</p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
  <thead className="bg-slate-50/50 border-b border-slate-100">
    <tr>{['Worker','Role','Department','Phone','Status'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr>
  </thead>
  <tbody className="divide-y divide-slate-100">
    {workers.length===0 ? (
      <tr><td colSpan={5} className="text-center py-12 text-slate-400">No workers.</td></tr>
    ) : workers.map(w => {
      const roleStyle = {
        plc:        'bg-blue-100 text-blue-700',
        wireman:    'bg-emerald-100 text-emerald-700',
        admin:      'bg-violet-100 text-violet-700',
        superadmin: 'bg-amber-100 text-amber-700',
      }[w.role] || 'bg-slate-100 text-slate-600';

      const avatarStyle = {
        plc:        'bg-blue-500',
        wireman:    'bg-emerald-500',
        admin:      'bg-violet-500',
        superadmin: 'bg-amber-500',
      }[w.role] || 'bg-slate-400';

      return (
        <tr key={w.id} className="hover:bg-slate-50/60">
          <td className="px-4 py-3">
            <div className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${avatarStyle}`}>
                {w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}
              </div>
              <span className="font-bold text-slate-800">{w.name}</span>
            </div>
          </td>
          <td className="px-4 py-3">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${roleStyle}`}>
              {w.role}
            </span>
          </td>
          <td className="px-4 py-3 text-slate-600">{w.department||'—'}</td>
          <td className="px-4 py-3 text-slate-600 font-mono">{w.phone}</td>
          <td className="px-4 py-3">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
              Active
            </span>
          </td>
        </tr>
      );
    })}
  </tbody>
</table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════ */}
          {/* REPORTS TAB                         */}
          {/* ═══════════════════════════════════ */}
          {tab==='reports' && isSuperAdmin && (
            <div className="p-5 lg:p-7">
              <ReportsTab/>
            </div>
          )}

          {/* ═══════════════════════════════════ */}
          {/* PROFITABILITY TAB                   */}
          {/* ═══════════════════════════════════ */}
          {tab==='profitability' && isSuperAdmin && (
            <div className="p-5 lg:p-7">
              <ProfitabilityTab/>
            </div>
          )}

          {/* ═══════════════════════════════════ */}
          {/* USERS TAB                           */}
          {/* ═══════════════════════════════════ */}
          {tab==='users' && isSuperAdmin && (
            <div className="p-5 lg:p-7 space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">User Management</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{allUsers.length} users · manage roles, keys, and access</p>
                  </div>
                  <button onClick={()=>setAddUserM(true)} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md">
                    <span className="w-3 h-3">{I.plus}</span>Add User
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr>{['User','Role','Department','Secret Key','Status','Actions'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {allUsers.length===0 ? (
                        <tr><td colSpan={6} className="text-center py-16 text-slate-400">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-2xl">👥</div>
                            <p className="font-bold text-slate-500">No users yet</p>
                            <p className="text-[11px]">Click "Add User" to create one</p>
                          </div>
                        </td></tr>
                      ) : allUsers.map(u => {
                        const roleBg = u.role==='superadmin' ? 'from-amber-400 to-orange-500'
                                     : u.role==='admin'       ? 'from-violet-500 to-purple-600'
                                     : u.role==='plc'         ? 'from-blue-500 to-indigo-600'
                                                              : 'from-emerald-500 to-green-600';
                        const roleBadge = u.role==='superadmin' ? 'bg-amber-100 text-amber-700'
                                        : u.role==='admin'       ? 'bg-violet-100 text-violet-700'
                                        : u.role==='plc'         ? 'bg-blue-100 text-blue-700'
                                                                 : 'bg-emerald-100 text-emerald-700';
                        return (
                          <tr key={u.id} className="hover:bg-slate-50/60 group">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${roleBg} flex items-center justify-center text-[11px] font-bold text-white ring-2 ring-white shadow-sm`}>{u.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-800 truncate">{u.name}</p>
                                  <p className="text-[10px] text-slate-400 font-mono">{u.phone}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3"><span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${roleBadge}`}><span className="w-1.5 h-1.5 rounded-full bg-current"/>{u.role}</span></td>
                            <td className="px-4 py-3 text-slate-600">{u.department||<span className="text-slate-300 italic">—</span>}</td>
                            <td className="px-4 py-3">
                              <div className="inline-flex items-center gap-1.5 bg-slate-100 rounded-lg px-2 py-1">
                                <span className="font-mono text-[10px] text-slate-700">{u.secret_key||'—'}</span>
                                {u.secret_key && (
                                  <button onClick={()=>{navigator.clipboard.writeText(u.secret_key);}}
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-all" title="Copy">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {u.is_active
                                ? <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Active</span>
                                : <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><span className="w-1.5 h-1.5 rounded-full bg-slate-300"/>Inactive</span>}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <button onClick={()=>regenKey(u)} disabled={busy} className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 mr-1 disabled:opacity-50">New Key</button>
                              <button onClick={()=>toggleActive(u)} className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${u.is_active?'bg-red-50 text-red-600 border-red-200 hover:bg-red-100':'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}>{u.is_active?'Disable':'Enable'}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════ */}
          {/* SESSIONS TAB                        */}
          {/* ═══════════════════════════════════ */}
          {tab==='sessions' && isSuperAdmin && (
            <div className="p-5 lg:p-7 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  ['Total', sessions.length, 'bg-slate-900 text-white'],
                  ['Live', sessions.filter(s=>s.status==='running').length, 'bg-emerald-50 text-emerald-700 border-emerald-200'],
                  ['Paused', sessions.filter(s=>s.status==='paused').length, 'bg-amber-50 text-amber-700 border-amber-200'],
                  ['Completed', sessions.filter(s=>s.status==='completed').length, 'bg-blue-50 text-blue-700 border-blue-200'],
                ].map(([l,v,c])=>(
                  <div key={l} className={`rounded-2xl p-4 border ${c}`}>
                    <p className="text-2xl font-black">{v}</p>
                    <p className="text-[10px] mt-1 uppercase tracking-wider font-bold opacity-70">{l}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-900">All Sessions</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Live timing data from all workers</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr>{['Worker','Ticket','Customer','Status','Started','Duration'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sessions.length===0 ? <tr><td colSpan={6} className="text-center py-12 text-slate-400">No sessions.</td></tr> : sessions.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${s.worker_role==='plc'?'bg-blue-500':'bg-emerald-500'}`}>{(s.worker_name||'??').split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                              <span className="font-bold text-slate-800">{s.worker_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{s.ticket_no}</span></td>
                          <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">{s.customer_name}</td>
                          <td className="px-4 py-3">
                            {s.status==='running' && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-700"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>Running</span>}
                            {s.status==='paused'  && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-amber-700"><span className="w-1.5 h-1.5 rounded-full bg-amber-500"/>Paused</span>}
                            {s.status==='completed' && <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-blue-700"><span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>Done</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(s.started_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                          <td className="px-4 py-3 font-black text-slate-800">{fmtH(s.total_seconds||0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>{/* end content scroll */}
      </div>{/* end main area */}

      {/* ════════════ MOBILE BOTTOM NAV ════════════ */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4" style={{paddingBottom:'calc(0.875rem + env(safe-area-inset-bottom))'}}>
        <div className="relative max-w-md mx-auto">
          {/* Primary FAB */}
          <Link to="/service" className="absolute left-1/2 -translate-x-1/2 -top-8 z-10 group">
            <div className="relative">
              <div className="absolute -inset-2 rounded-full bg-gradient-to-br from-blue-500/30 to-indigo-600/30 blur-xl group-active:from-blue-500/50 group-active:to-indigo-600/50 transition-all"/>
              <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center shadow-[0_8px_20px_rgba(15,23,42,0.4)] ring-[0.5px] ring-white/20 transition-transform group-active:scale-[0.92]">
                <span className="relative w-5 h-5 text-white">{I.plus}</span>
              </div>
            </div>
          </Link>

          <div className="bg-white/80 backdrop-blur-xl rounded-[26px] overflow-hidden border border-white/60 shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
            <div className="relative grid grid-cols-5 items-stretch px-1.5 py-2">
              {NAV.slice(0, 2).map(item => (
                <button key={item.k} onClick={()=>setTab(item.k)}
                  className="relative flex flex-col items-center justify-center py-1.5 transition-all active:scale-90">
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-slate-900 transition-all duration-300 ${tab===item.k ? 'w-7 opacity-100' : 'w-0 opacity-0'}`}/>
                  <div className={`relative w-5 h-5 mb-0.5 transition-all duration-300 ${tab===item.k ? 'text-slate-900 -translate-y-0.5' : 'text-slate-400'}`}>
                    {item.icon}
                    {item.badge > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ring-[1.5px] ring-white">{item.badge > 99 ? '99+' : item.badge}</span>}
                  </div>
                  <span className={`text-[9px] tracking-[0.12em] uppercase transition-all ${tab===item.k ? 'text-slate-900 font-black' : 'text-slate-400 font-bold'}`}>{item.label}</span>
                </button>
              ))}

              <div className="flex flex-col items-center justify-end pb-1.5 pt-2">
                <span className="text-[9px] font-black tracking-[0.15em] uppercase text-slate-400 mt-7">New</span>
              </div>

              {NAV.slice(2, 4).map(item => (
                <button key={item.k} onClick={()=>setTab(item.k)}
                  className="relative flex flex-col items-center justify-center py-1.5 transition-all active:scale-90">
                  <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-slate-900 transition-all duration-300 ${tab===item.k ? 'w-7 opacity-100' : 'w-0 opacity-0'}`}/>
                  <div className={`relative w-5 h-5 mb-0.5 transition-all duration-300 ${tab===item.k ? 'text-slate-900 -translate-y-0.5' : 'text-slate-400'}`}>
                    {item.icon}
                    {item.badge > 0 && <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center ring-[1.5px] ring-white">{item.badge > 99 ? '99+' : item.badge}</span>}
                  </div>
                  <span className={`text-[9px] tracking-[0.12em] uppercase transition-all ${tab===item.k ? 'text-slate-900 font-black' : 'text-slate-400 font-bold'}`}>{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </nav>

      {/* ════════════ ASSIGN MODAL ════════════ */}
      {assignM && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div>
                <h3 className="text-base font-black text-slate-900">Assign Workers</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{assignM.ticket_id} · {assignM.customer_name}</p>
              </div>
              <button onClick={()=>setAssignM(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
            </div>

            <div className="p-6 space-y-5">
              {assignM.needs_plc && (
                <div>
                  <FLabel>PLC Engineers</FLabel>
                  {plcW.length===0 ? <p className="text-xs text-slate-400 italic">No PLC workers available.</p> : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {plcW.map(w => {
                        const checked = aData.plc.includes(w.id);
                        return (
                          <label key={w.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border cursor-pointer transition-all ${checked?'bg-blue-50 border-blue-300':'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                            <input type="checkbox" checked={checked} onChange={e=>{
                              setAData(d => ({...d, plc: e.target.checked ? [...d.plc, w.id] : d.plc.filter(x=>x!==w.id)}));
                            }}/>
                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-[10px] font-bold text-white">{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{w.phone}</p>
                            </div>
                            {checked && <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {assignM.needs_wiring && (
                <div>
                  <FLabel>Wiremen</FLabel>
                  {wireW.length===0 ? <p className="text-xs text-slate-400 italic">No wiremen available.</p> : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                      {wireW.map(w => {
                        const checked = aData.wireman.includes(w.id);
                        return (
                          <label key={w.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border cursor-pointer transition-all ${checked?'bg-emerald-50 border-emerald-300':'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}>
                            <input type="checkbox" checked={checked} onChange={e=>{
                              setAData(d => ({...d, wireman: e.target.checked ? [...d.wireman, w.id] : d.wireman.filter(x=>x!==w.id)}));
                            }}/>
                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white">{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                              <p className="text-[10px] text-slate-400 font-mono">{w.phone}</p>
                            </div>
                            {checked && <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end sticky bottom-0 bg-white">
              <button onClick={()=>setAssignM(null)} className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-2xl hover:bg-slate-50">Cancel</button>
              <button onClick={saveAssign} disabled={busy} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl disabled:opacity-60">{busy?'Saving…':'Save Assignment'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════ ADD USER MODAL ════════════ */}
      {addUserM && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-900">Add New User</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">A 6-digit secret key will be auto-generated</p>
              </div>
              <button onClick={()=>setAddUserM(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <FLabel>Full Name *</FLabel>
                <FInput value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))} placeholder="e.g. Pankaj Sharma"/>
              </div>
              <div>
                <FLabel>Phone *</FLabel>
                <FInput type="tel" value={newUser.phone} onChange={e=>setNewUser(p=>({...p,phone:e.target.value}))} placeholder="e.g. 9876543210"/>
              </div>
              <div>
                <FLabel>Role</FLabel>
                <FSel value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
                  <option value="plc">🖥 PLC Engineer</option>
                  <option value="wireman">⚡ Wireman</option>
                  <option value="admin">👤 Admin</option>
                  <option value="superadmin">⭐ Super Admin</option>
                </FSel>
              </div>
              <div>
                <FLabel>Department</FLabel>
                <FInput value={newUser.department} onChange={e=>setNewUser(p=>({...p,department:e.target.value}))} placeholder="e.g. Service · Sales · Ops"/>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3 flex items-start gap-2">
                <svg className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <p className="text-[11px] text-blue-900">A unique 6-digit secret key will be shown after creation. Share it securely — the user logs in with their phone + key.</p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button onClick={()=>setAddUserM(false)} className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-2xl hover:bg-slate-50">Cancel</button>
              <button onClick={addUser} disabled={busy || !newUser.name.trim() || !newUser.phone.trim()} className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed">{busy?'Creating…':'Create User'}</button>
            </div>
          </div>
        </div>
      )}
{/* ════════════ REOPEN MODAL ════════════ */}
      <ReopenModal
        ticket={reopenM}
        open={!!reopenM}
        onClose={()=>setReopenM(null)}
        onSuccess={()=>{ setReopenM(null); loadTickets(); }}
      />
      {/* ════════════ KEY DISPLAY MODAL ════════════ */}
      {keyModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 px-6 py-8 text-center text-white">
              <div className="w-14 h-14 rounded-full bg-white/20 mx-auto flex items-center justify-center mb-3">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                </svg>
              </div>
              <p className="text-[11px] font-bold text-blue-100 uppercase tracking-wider mb-1">Secret Key Generated</p>
              <p className="text-sm font-bold text-white">for {keyModal.name}</p>
            </div>

            <div className="px-6 py-6">
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-5 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">6-Digit Login Key</p>
                <p className="font-mono text-3xl font-black text-slate-900 tracking-[0.3em]">{keyModal.newKey}</p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 mt-4 flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <p className="text-[11px] text-amber-900">Save this key now — it won't be shown again. Share it securely with the user.</p>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={()=>{navigator.clipboard.writeText(keyModal.newKey); alert('Copied to clipboard');}} className="flex-1 py-2.5 bg-blue-50 border border-blue-200 text-blue-600 text-sm font-bold rounded-2xl hover:bg-blue-100 flex items-center justify-center gap-2">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy Key
                </button>
                <button onClick={()=>setKeyModal(null)} className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl">Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
