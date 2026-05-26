import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
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

function exportCSV(rows, cols, filename) {
  const header = cols.map(c=>c.label).join(',');
  const body   = rows.map(r=>cols.map(c=>`"${r[c.key]??''}"`).join(',')).join('\n');
  const blob   = new Blob([header+'\n'+body],{type:'text/csv'});
  const url    = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
/* ─── ICON SET (matches reference style) ─── */
const I = {
  home:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>,
  ticket:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><line x1="13" y1="5" x2="13" y2="19"/></svg>,
  workers:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  reports:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  users:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>,
  sessions: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  filter:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>,
  download: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upRight:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>,
  logout:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus: (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
),
};
  /* ─── Reusable form atoms (defined OUTSIDE components to keep refs stable) ─── */
const FLabel = ({ children }) => (
  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{children}</label>
);
const FInput = (p) => (
  <input
    {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}
  />
);
const FSel = (p) => (
  <select
    {...p}
    className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}
  />
);
function InvoiceEditor({ ticket, onSaved }) {
  const [inv,setInv] = useState(ticket.invoice_no || '');
  const [chl,setChl] = useState(ticket.challan_no || '');
  const [busy,setBusy] = useState(false);
  const [savedAt,setSavedAt] = useState(null);
  const dirty = inv !== (ticket.invoice_no||'') || chl !== (ticket.challan_no||'');
  const save = async () => {
    setBusy(true);
    try { await svcApi.patch(`/tickets/${ticket.id}/invoice`, { invoice_no: inv||null, challan_no: chl||null }); setSavedAt(new Date()); onSaved?.(); }
    catch(e){ alert(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-2">
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice No</label>
          <input value={inv} onChange={e=>setInv(e.target.value)} placeholder="e.g. INV/2026/0123"
            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 focus:bg-white transition-all"/>
          {ticket.invoice_date && <p className="text-[9px] text-slate-400 mt-1">Updated {new Date(ticket.invoice_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}</p>}
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Challan No</label>
          <input value={chl} onChange={e=>setChl(e.target.value)} placeholder="e.g. CH/2026/0456"
            className="w-full mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 focus:bg-white transition-all"/>
          {ticket.challan_date && <p className="text-[9px] text-slate-400 mt-1">Updated {new Date(ticket.challan_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}</p>}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        {savedAt && <span className="text-[10px] text-emerald-600 font-bold mr-auto">✓ Saved {savedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
        <button onClick={save} disabled={busy||!dirty} className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">{busy?'Saving…':'Save'}</button>
      </div>
    </>
  );
}

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
          <p className="text-xs text-slate-400 mt-0.5">Why workers paused, where, and when — last {dateFrom} to {dateTo}</p>
        </div>
        <button onClick={dlPauseCSV} className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:border-blue-300 hover:text-blue-600 transition-all">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      </div>

      {/* Summary KPIs */}
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
              <div className="flex items-start justify-between mb-1.5">
                <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">{meta.ico} {meta.label}</p>
              </div>
              <p className={`text-3xl font-black ${meta.text}`}>{c.count}</p>
              <p className="text-[11px] text-slate-500 mt-1">{fmtH(c.total_seconds)} total</p>
            </div>
          );
        })}
      </div>

      {/* Category breakdown chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <h3 className="text-sm font-black text-slate-900 mb-1">Pauses by Reason</h3>
          <p className="text-[11px] text-slate-400 mb-4">Count of pauses grouped by category</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.byCategory.map(c=>({ name: (CAT_META[c.category]||CAT_META.other).label, Count: c.count, Hours: +(c.total_seconds/3600).toFixed(2) }))} layout="vertical" margin={{top:0,right:16,left:60,bottom:0}}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="name" tick={{fontSize:10,fill:'#64748b',fontWeight:600}} axisLine={false} tickLine={false} width={130}/>
              <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
              <Bar dataKey="Count" fill="#1e293b" radius={[0,4,4,0]} maxBarSize={18}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Hourly distribution of material shortages */}
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

      {/* Material shortage hotspots */}
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

      {/* Recent pause log */}
      <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-900">Recent Pauses</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">{data.detail.length} pauses · click to view ticket</p>
          </div>
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

/* ─── REPORTS TAB (preserved with same chart system) ─── */
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
      {/* Filter bar */}
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

      {/* Top KPIs */}
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

      {/* Charts row */}
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
          <div className="flex items-center gap-5 pt-3 mt-2 border-t border-slate-100">
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-900"/><span className="text-[11px] font-semibold text-slate-700">Hours</span></div>
            <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/><span className="text-[11px] font-semibold text-slate-700">Sessions</span></div>
          </div>
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
              <defs>
                <linearGradient id="rGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="label" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="hours" name="Hours" fill="url(#rGrad)" radius={[6,6,0,0]} maxBarSize={20}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Person heatmap + comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Orders By Time</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Activity intensity per worker</p>
            </div>
          </div>
          <div className="space-y-2.5">
            {persons.slice(0,10).map(p=>{
              const maxH = Math.max(...persons.map(x=>x.hours),1);
              const intensity = p.hours/maxH;
              const dots = Math.max(1, Math.round(intensity*20));
              return (
                <div key={p.worker_id} className="flex items-center gap-3 cursor-pointer group" onClick={()=>loadPersonDays(p)}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${p.worker_role==='plc'?'bg-blue-500':'bg-emerald-500'}`}>{p.worker_name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px] font-bold text-slate-700 truncate">{p.worker_name}</span>
                      <span className="text-[11px] font-black text-slate-900">{p.hours}h</span>
                    </div>
                    <div className="flex gap-0.5 h-2.5">
                      {Array.from({length:20}).map((_,i)=>(
                        <div key={i} className={`flex-1 rounded-sm transition-all ${i<dots?(intensity>0.7?'bg-blue-600':intensity>0.4?'bg-blue-400':'bg-blue-300'):'bg-slate-100'}`} style={{opacity:i<dots?0.4+(i/dots)*0.6:1}}/>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900">Product Statics</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Sessions vs Tickets</p>
            </div>
            <span className="text-[11px] text-slate-400 font-semibold">Last 30d</span>
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={persons.slice(0,8)} margin={{top:5,right:5,left:-15,bottom:30}}>
              <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
              <XAxis dataKey="worker_name" tick={{fontSize:9,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false} angle={-30} textAnchor="end" interval={0} height={50}/>
              <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <Tooltip content={<Tip/>}/>
              <Bar dataKey="session_count" name="Sessions" fill="#3b82f6" radius={[4,4,0,0]} maxBarSize={18}/>
              <Bar dataKey="ticket_count" name="Tickets" fill="#bfdbfe" radius={[4,4,0,0]} maxBarSize={18}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drill-down */}
      {selPerson && (
        <div className="bg-white rounded-3xl border-2 border-blue-200 p-6 shadow-lg shadow-blue-100/40">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-sm font-bold text-white ${selPerson.worker_role==='plc'?'bg-gradient-to-br from-blue-500 to-blue-600':'bg-gradient-to-br from-emerald-500 to-green-600'}`}>{selPerson.worker_name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
              <div>
                <h3 className="text-sm font-black text-slate-900">{selPerson.worker_name}</h3>
                <p className="text-[11px] text-slate-400 capitalize">Day-wise breakdown · {selPerson.worker_role}</p>
              </div>
            </div>
            <button onClick={()=>{setSelPerson(null);setPersonDays([]);}} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
          </div>
          {personDays.length===0 ? <p className="text-center py-6 text-slate-400 text-sm">No work logged</p> : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={personDays} margin={{top:5,right:5,left:-20,bottom:0}}>
                  <defs>
                    <linearGradient id="gPArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                  <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<Tip/>}/>
                  <Area type="monotone" dataKey="hours" name="Hours" stroke="#3b82f6" strokeWidth={2.5} fill="url(#gPArea)"/>
                </AreaChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-3 sm:grid-cols-7 gap-2 mt-3">
                {personDays.map(d=>(
                  <div key={d.day} className="bg-slate-50 rounded-2xl p-3 text-center hover:bg-blue-50 transition-all">
                    <p className="text-[9px] text-slate-400 font-semibold">{d.day}</p>
                    <p className="text-sm font-black text-blue-600 mt-0.5">{d.hours.toFixed(1)}h</p>
                    <p className="text-[9px] text-slate-400">{d.sessions} sess</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
  <PauseAnalyticsSection dateFrom={dateFrom} dateTo={dateTo}/>
}

/* ─── MAIN DASHBOARD ─── */
export default function AdminDashboard() {
  const { svcUser, svcLogout, isSuperAdmin } = useSvcAuth();
  const [tab,setTab]           = useState('overview');
  const [tickets,setTickets]   = useState([]);
  const [workers,setWorkers]   = useState([]);
  const [allUsers,setAllUsers] = useState([]);
  const [sessions,setSessions] = useState([]);
  const [filters,setFilters]   = useState({status:'All',priority:'All',service_type:'All',search:''});
  const [expanded,setExpanded] = useState(null);
  const [assignM,setAssignM]   = useState(null);
const [aData, setAData] = useState({ plc:[], wireman:[] });
  const [keyModal,setKeyModal] = useState(null);
  const [addUserM,setAddUserM] = useState(false);
  const [newUser,setNewUser]   = useState({name:'',phone:'',role:'plc',department:''});
  const [busy,setBusy]         = useState(false);
  const [liveEvents,setLiveEvents]=useState([]);
  const [filterOpen,setFilterOpen] = useState(false);
const [rangeOpen,setRangeOpen]   = useState(false);
const [dateRange,setDateRange]   = useState('Today');

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
  useEffect(()=>{loadWorkers();loadSessions();if(isSuperAdmin)loadAllUsers();},[]); /* run-once on mount */

  const plcW  = workers.filter(w=>w.role==='plc');
  const wireW = workers.filter(w=>w.role==='wireman');

  // And openAssign function:
const openAssign = tk => {
  if (TERMINAL.includes(tk.status)) { alert('Cannot assign a completed/closed ticket.'); return; }
  setAssignM(tk);
  setAData({
    plc:     (tk.assigned_plcs    || []).map(a => a.worker_id),
    wireman: (tk.assigned_wiremen || []).map(a => a.worker_id),
  });
};// And saveAssign function:
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
  // const openAssign = tk => { if(TERMINAL.includes(tk.status)){alert('Cannot assign a completed/closed ticket.');return;} setAssignM(tk);setAData({plc:tk.assigned_plc||'',wireman:tk.assigned_wireman||''}); };
  // const saveAssign = async()=>{setBusy(true);try{await svcApi.patch(`/tickets/${assignM.id}/assign`,{assigned_plc:aData.plc||null,assigned_wireman:aData.wireman||null});setAssignM(null);loadTickets();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);}};
  const updateStatus= async(id,status)=>{try{await svcApi.patch(`/tickets/${id}/status`,{status});loadTickets();}catch(e){console.error(e);}};
  const regenKey = async(u)=>{setBusy(true);try{const{data}=await svcApi.patch(`/auth/users/${u.id}/regen-key`);setKeyModal({id:u.id,name:u.name,newKey:data.secret_key});loadAllUsers();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);}};
  const addUser  = async()=>{if(!newUser.name.trim()||!newUser.phone.trim()){alert('Name and phone required');return;}setBusy(true);try{await svcApi.post('/auth/users',newUser);setAddUserM(false);setNewUser({name:'',phone:'',role:'plc',department:''});loadAllUsers();loadWorkers();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);}};
  const toggleActive=async(u)=>{try{await svcApi.patch(`/auth/users/${u.id}`,{is_active:!u.is_active});loadAllUsers();loadWorkers();}catch(e){console.error(e);}};

  const exportTicketsCSV = () => {
  if (!tickets.length) { alert('No tickets to export'); return; }
  const cols = [
    {key:'ticket_id',label:'Ticket ID'},
    {key:'customer_name',label:'Customer'},
    {key:'address',label:'Address'},
    {key:'service_type',label:'Service'},
    {key:'priority',label:'Priority'},
    {key:'status',label:'Status'},
    {key:'plc_worker_name',label:'PLC Worker'},
    {key:'wireman_worker_name',label:'Wireman'},
    {key:'contact_name',label:'Contact'},
    {key:'contact_phone',label:'Phone'},
    {key:'sales_agent',label:'Sales Agent'},
    {key:'created_at',label:'Created'},
  ];
  const filename = `tickets_${dateRange.toLowerCase().replace(/ /g,'_')}_${new Date().toISOString().slice(0,10)}.csv`;
  exportCSV(tickets, cols, filename);
};

const applyRange = (range) => {
  setDateRange(range);
  setRangeOpen(false);
  // Range affects display only — could also filter tickets by date here
  // For now we just store the label; the user can use the Tickets tab filters for precise control
};

  const av = svcUser?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'??';
  const counts = {total:tickets.length,open:tickets.filter(t=>t.status==='Open').length,assigned:tickets.filter(t=>t.status==='Assigned').length,inprog:tickets.filter(t=>t.status==='In Progress').length,done:tickets.filter(t=>t.status==='Completed').length,unassigned:tickets.filter(t=>!t.assigned_plc&&!t.assigned_wireman&&!TERMINAL.includes(t.status)).length};
  const liveCount = sessions.filter(s=>s.status==='running').length;

  const NAV = [
    {k:'overview', icon:I.home,     label:'Overview'},
    {k:'tickets',  icon:I.ticket,   label:'Tickets', badge:counts.unassigned||null},
    {k:'workers',  icon:I.workers,  label:'Workers'},
    ...(isSuperAdmin?[
      {k:'reports', icon:I.reports, label:'Reports'},
      {k:'users',   icon:I.users,   label:'Users'},
      {k:'sessions',icon:I.sessions,label:'Sessions',badge:liveCount||null},
    ]:[]),
  ];


  // const FInput=(p)=><input {...p} className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>;
  // const FSel  =(p)=><select {...p} className={`w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white transition-all ${p.className||''}`}/>;
  // const FLabel=({children})=><label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{children}</label>;

  return (
    <div className="flex h-screen bg-[#F5F6F8] font-sans overflow-hidden">

      {/* ════════════ LEFT ICON RAIL ════════════ */}
      <aside className="w-16 bg-white border-r border-slate-200/60 flex flex-col items-center py-5 gap-1 flex-shrink-0 z-20">
        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-4 shadow-lg shadow-slate-900/15">
          <svg className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        {NAV.map(({k,icon,label,badge})=>(
          <button key={k} onClick={()=>setTab(k)} title={label}
            className={`group relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${tab===k?'bg-slate-900 text-white':'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <span className="w-[18px] h-[18pxs]">{icon}</span>
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

        {/* ─── TOPBAR ─── */}
        <header className="bg-white border-b border-slate-200/60 px-6 lg:px-8 h-14 flex items-center gap-4 flex-shrink-0">
          {/* Search */}
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md bg-slate-50 rounded-full px-4 py-1.5 border border-slate-200/60 focus-within:border-slate-400 focus-within:bg-white transition-all">
            <span className="w-3.5 h-3.5 text-slate-400">{I.search}</span>
            <input placeholder="Search tickets, customers..." className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400" onChange={e=>{setFilters(p=>({...p,search:e.target.value}));if(tab!=='tickets')setTab('tickets');}}/>
            <kbd className="hidden lg:block text-[10px] text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
          </div>
          <Link to="/service" className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full transition-all">
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
              <span className="w-3.5 h-3.5">{I.bell}</span>
              {liveEvents.length>0&&<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"/>}
            </button>
            <div className="flex items-center gap-2 ml-1">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${isSuperAdmin?'bg-gradient-to-br from-amber-400 to-orange-500':'bg-gradient-to-br from-blue-500 to-indigo-600'} ring-2 ring-white shadow`}>{av}</div>
            </div>
          </div>
        </header>

        {/* ─── CONTENT ─── */}
        <div className="flex-1 overflow-y-auto">

          {/* ───────────── OVERVIEW (matches reference) ───────────── */}
          {tab==='overview' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5 p-5 lg:p-7">

              {/* LEFT main column */}
              <div className="space-y-5 min-w-0">
                {/* Page title */}
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center">
                    <span className="w-3 h-3 rounded-full border-2 border-white"/>
                  </div>
                  <div>
                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">Welcome Back {svcUser?.name?.split(' ')[0]}</h1>
                    <p className="text-xs text-slate-400 mt-0.5">You have <span className="text-blue-600 font-bold">{liveEvents.length||counts.unassigned} recent notifications</span></p>
                  </div>
                  <div className="ml-auto flex items-center gap-2 relative">
  {/* FILTER */}
  <div className="relative">
    <button
      onClick={() => { setFilterOpen(o=>!o); setRangeOpen(false); }}
      className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-full transition-all ${filterOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
      <span className="w-3 h-3">{I.filter}</span>Filter
      {(filters.status!=='All' || filters.priority!=='All' || filters.service_type!=='All') && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>
      )}
    </button>

    {filterOpen && (
      <>
        <div className="fixed inset-0 z-30" onClick={()=>setFilterOpen(false)}/>
        <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/10 z-40 p-4 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-xs font-black text-slate-900">Quick Filters</p>
            <button onClick={()=>{setFilters({status:'All',priority:'All',service_type:'All',search:''});setFilterOpen(false);}} className="text-[10px] font-bold text-blue-600 hover:text-blue-700">Reset</button>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Status</label>
            <select value={filters.status} onChange={e=>setFilters(p=>({...p,status:e.target.value}))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700">
              {['All','Open','Assigned','In Progress','Completed','Closed'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Priority</label>
            <select value={filters.priority} onChange={e=>setFilters(p=>({...p,priority:e.target.value}))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700">
              {['All','High','Medium','Low'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Service Type</label>
            <select value={filters.service_type} onChange={e=>setFilters(p=>({...p,service_type:e.target.value}))}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700">
              <option value="All">All</option>
              {['installation','troubleshooting','new_development','after_sales'].map(s=><option key={s} value={s}>{SVC_L[s]}</option>)}
            </select>
          </div>
          <button onClick={()=>{setFilterOpen(false);setTab('tickets');}} className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all">
            View Filtered Tickets →
          </button>
        </div>
      </>
    )}
  </div>

  {/* DATE RANGE */}
  <div className="relative">
    <button
      onClick={() => { setRangeOpen(o=>!o); setFilterOpen(false); }}
      className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 border text-xs font-bold rounded-full transition-all ${rangeOpen ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
      {dateRange}
      <svg className={`w-3 h-3 transition-transform ${rangeOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
    </button>

    {rangeOpen && (
      <>
        <div className="fixed inset-0 z-30" onClick={()=>setRangeOpen(false)}/>
        <div className="absolute right-0 top-full mt-2 w-44 bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/10 z-40 p-1.5 animate-fade-in">
          {['Today','Last 7 days','Last 30 days','This month','All time'].map(r=>(
            <button key={r} onClick={()=>applyRange(r)}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${dateRange===r ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}>
              {r}
              {dateRange===r && <svg className="w-3 h-3 text-blue-600" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          ))}
        </div>
      </>
    )}
  </div>

  {/* EXPORT */}
  <button
    onClick={exportTicketsCSV}
    className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full transition-all flex items-center gap-1.5 shadow-md shadow-slate-900/10">
    <span className="w-3 h-3">{I.download}</span>Export Report
  </button>
</div>
                </div>

                {/* Hero KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-500/30 blur-2xl"/>
                    <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-indigo-500/20 blur-2xl"/>
                    <button className="mt-1 px-4 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-full hover:bg-slate-100 transition-all relative shadow mb-1">Motivation</button>
                    <p className="text-sm font-bold mt-3 relative leading-snug">The way to get started is to<br/>quit talking and begin doing.</p>
                  </div>
                  {[['Total Tickets',counts.total,counts.assigned+' assigned','↑ 12.4%'],['In Progress',counts.inprog,counts.unassigned+' unassigned','live'],['Completed',counts.done,'this month','↑ 8.7%']].map(([l,v,sub,delta])=>(
                    <div key={l} className="bg-white rounded-3xl p-5 border border-slate-200/60 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between mb-2">
                        <p className="text-xs font-medium text-slate-500">{l}</p>
                        <button className="text-slate-300 hover:text-slate-600"><span className="w-3 h-3 inline-block">{I.upRight}</span></button>
                      </div>
                      <p className="text-3xl font-black text-slate-900">{v}<span className="text-base font-bold text-slate-300 ml-1">/{counts.total}</span></p>
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[11px] text-slate-400">{sub}</p>
                        <span className={`text-[10px] font-bold ${delta.startsWith('↑')?'text-emerald-600 bg-emerald-50':'text-blue-600 bg-blue-50'} px-1.5 py-0.5 rounded`}>{delta}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Mid charts row: Transaction Activity + Sale Performance */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <OverviewChart tickets={tickets}/>
                  <SessionTrendChart sessions={sessions}/>
                </div>

                {/* Bottom row: Orders By Time heatmap + Product Statics bar */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <OrdersByTimeHeatmap sessions={sessions}/>
                  <ProductStaticsChart tickets={tickets}/>
                </div>

                {/* Recent tickets list */}
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
                      <div key={tk.id} className="flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-all">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${tk.status==='Completed'?'bg-emerald-400':tk.status==='In Progress'?'bg-amber-400':tk.status==='Assigned'?'bg-blue-400':'bg-slate-300'}`}/>
                        <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md flex-shrink-0">{tk.ticket_id}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{tk.customer_name}</p>
                          <p className="text-[11px] text-slate-400 capitalize">{tk.service_type?.replace(/_/g,' ')} · {fmtD(tk.created_at)}</p>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${PR_CLR[tk.priority]}`}>{tk.priority}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ST_CLR[tk.status]}`}>{tk.status}</span>
                      </div>
                    ))}
                    {!tickets.length && <p className="text-center py-8 text-sm text-slate-400">No tickets yet.</p>}
                  </div>
                </div>
              </div>

              {/* RIGHT widget rail (Schedule + Meetings) */}
              <aside className="space-y-4">
                {/* Live activity dark card */}
                <div className="bg-slate-900 rounded-3xl p-5 text-white">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black">Live Activity</h3>
                    <button className="text-[10px] text-slate-400 hover:text-white">See all</button>
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

                {/* Quick Actions */}
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

                {/* Worker Status card */}
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

          {/* ───────────── TICKETS / WORKERS / REPORTS / USERS / SESSIONS ───────────── */}
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
                        const isDone=TERMINAL.includes(tk.status);
                        return (
                          <React.Fragment key={tk.id}>
                            <tr className={`hover:bg-blue-50/30 transition-all ${expanded===tk.id?'bg-blue-50/40':''} ${isDone?'opacity-60':''}`}>
                              <td className="px-4 py-3.5"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">{tk.ticket_id}</span></td>
                              <td className="px-4 py-3.5 max-w-[130px]"><p className="font-bold text-slate-800 truncate">{tk.customer_name}</p><p className="text-[10px] text-slate-400 truncate">{tk.address?.slice(0,28)}</p></td>
                              <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{SVC_L[tk.service_type]}</td>
                              <td className="px-4 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PR_CLR[tk.priority]}`}>{tk.priority}</span></td>
                              <td className="px-4 py-3.5">
                                {isDone?<span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ST_CLR[tk.status]}`}>{tk.status}</span>:
                                <select className="text-[11px] font-semibold px-2 py-1 rounded-lg border border-slate-200 outline-none cursor-pointer bg-white text-slate-700 focus:border-slate-400" value={tk.status} onChange={e=>updateStatus(tk.id,e.target.value)}>
                                  {['Open','Assigned','In Progress','Completed','Closed'].map(s=><option key={s}>{s}</option>)}
                                </select>}
                              </td>
                              <td className="px-4 py-3.5">
  {tk.plc_worker_names ? (
    <div className="flex flex-wrap gap-1 max-w-[180px]">
      {tk.plc_worker_names.split(', ').map((n,i) => (
        <span key={i} className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{n.split(' ')[0]}</span>
      ))}
    </div>
  ) : <span className="text-slate-300 italic text-[10px]">None</span>}
</td>
<td className="px-4 py-3.5">
  {tk.wireman_worker_names ? (
    <div className="flex flex-wrap gap-1 max-w-[180px]">
      {tk.wireman_worker_names.split(', ').map((n,i) => (
        <span key={i} className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{n.split(' ')[0]}</span>
      ))}
    </div>
  ) : <span className="text-slate-300 italic text-[10px]">None</span>}
</td>
                              {/* <td className="px-4 py-3.5">{tk.plc_worker_name?<span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tk.plc_worker_name}</span>:<span className="text-slate-300 italic text-[10px]">None</span>}</td>
                              <td className="px-4 py-3.5">{tk.wireman_worker_name?<span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{tk.wireman_worker_name}</span>:<span className="text-slate-300 italic text-[10px]">None</span>}</td> */}
                              <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">{fmtD(tk.created_at)}</td>
                              <td className="px-4 py-3.5 whitespace-nowrap">
                                {!isDone&&<button onClick={()=>openAssign(tk)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 mr-1.5">Assign</button>}
                                <button onClick={()=>setExpanded(expanded===tk.id?null:tk.id)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100">{expanded===tk.id?'Hide':'View'}</button>
                              </td>
                            </tr>
                            {expanded===tk.id&&(
                              <tr><td colSpan={9} className="px-4 pb-4 bg-blue-50/20">
                                <div className="bg-white rounded-2xl border border-blue-100 p-5 mt-1">
                                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono text-sm font-black text-blue-600">{tk.ticket_id}</span>
                                      <span className="text-slate-400">—</span>
                                      <span className="font-bold text-slate-800">{tk.customer_name}</span>
                                      {isDone&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Completed</span>}
                                    </div>
                                    <button onClick={()=>setExpanded(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                                    {[['Address',tk.address],['Contact',`${tk.contact_name||'—'}${tk.contact_phone?` · ${tk.contact_phone}`:''}`],['Designation',tk.designation||'—'],['Sales Agent',tk.sales_agent||'—'],['PLC',tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No'],['Wiring',tk.needs_wiring?'Yes':'No']].map(([k,v])=>(
                                      <div key={k}><p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">{k}</p><p className="text-xs font-bold text-slate-700 mt-0.5 break-words">{v}</p></div>
                                    ))}
                                  </div>
                                  {tk.description&&<div className="bg-slate-50 rounded-xl border-l-4 border-l-blue-400 border border-blue-100 px-4 py-3 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{tk.description}</div>}
                                  {/* Invoice & Challan editor */}
<div className="mt-4 bg-white border-2 border-slate-200 rounded-2xl p-4">
  <div className="flex items-center justify-between mb-3">
    <div className="flex items-center gap-2">
      <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <p className="text-xs font-black text-slate-900">Invoice & Challan</p>
    </div>
    <div className="flex items-center gap-2">
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tk.warranty_status==='in_warranty'?'bg-emerald-50 text-emerald-700 border border-emerald-200':'bg-amber-50 text-amber-700 border border-amber-200'}`}>
        {tk.warranty_status==='in_warranty' ? '✓ In Warranty' : '⚠ Out of Warranty'}
      </span>
    </div>
  </div>
  <InvoiceEditor ticket={tk} onSaved={loadTickets}/>
</div>
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab==='workers' && (
            <div className="p-5 lg:p-7 grid sm:grid-cols-2 gap-4">
              {[['🖥 PLC Engineers',plcW,'bg-gradient-to-br from-blue-500 to-blue-600','bg-blue-50 text-blue-700 border-blue-200'],['⚡ Wiremen',wireW,'bg-gradient-to-br from-emerald-500 to-green-600','bg-emerald-50 text-emerald-700 border-emerald-200']].map(([title,list,avG,badge])=>(
                <div key={title} className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                  <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="text-sm font-black text-slate-900">{title}</h3>
                    <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{list.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {!list.length&&<p className="text-center py-8 text-slate-400 text-sm">No workers yet</p>}
                    {list.map(w=>(
                      <div key={w.id} className="flex items-center gap-3 px-6 py-4 hover:bg-slate-50/60 transition-all">
                        <div className={`w-10 h-10 rounded-full ${avG} flex items-center justify-center text-xs font-bold text-white`}>{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{w.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">{w.department} · {w.phone}</p>
                        </div>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>{w.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab==='reports' && isSuperAdmin && <div className="p-5 lg:p-7"><ReportsTab/></div>}

          {/* {tab==='users' && isSuperAdmin && (
            <div className="p-5 lg:p-7">
              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                  <div><h3 className="text-sm font-black text-slate-900">All Users & Secret Keys</h3><p className="text-[11px] text-slate-400 mt-0.5">Manage roles, keys & access</p></div>
                  <button onClick={()=>setAddUserM(true)} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-full hover:bg-slate-800 transition-all">+ Add User</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100"><tr>{['Name','Phone','Role','Dept','Secret Key','Status','Actions'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {allUsers.map(u=>(
                        <tr key={u.id} className={`hover:bg-slate-50/60 ${!u.is_active?'opacity-50':''}`}>
                          <td className="px-4 py-3.5 font-bold text-slate-800">{u.name}</td>
                          <td className="px-4 py-3.5 font-mono text-slate-500">{u.phone}</td>
                          <td className="px-4 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.role==='superadmin'?'bg-amber-100 text-amber-700':u.role==='admin'?'bg-violet-100 text-violet-700':u.role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{u.role}</span></td>
                          <td className="px-4 py-3.5 text-slate-500">{u.department||'—'}</td>
                          <td className="px-4 py-3.5"><span className="font-mono text-sm font-black text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1 rounded-xl tracking-[4px]">{u.secret_key}</span></td>
                          <td className="px-4 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.is_active?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{u.is_active?'Active':'Inactive'}</span></td>
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <button onClick={()=>regenKey(u)} disabled={busy} className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 transition-all mr-1.5 disabled:opacity-60">
  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <polyline points="23 4 23 10 17 10"/>
    <polyline points="1 20 1 14 7 14"/>
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
  </svg>
  New Key
</button>
                            {/* <button onClick={()=>regenKey(u)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 mr-1.5">🔄 New Key</button> 
                            <button onClick={()=>toggleActive(u)} className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border ${u.is_active?'bg-red-50 text-red-600 border-red-200 hover:bg-red-100':'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}>{u.is_active?'Disable':'Enable'}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )} */}

{tab==='users' && isSuperAdmin && (
  <div className="p-5 lg:p-7 space-y-4">

    {/* Summary KPI strip */}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
        <p className="text-xs font-medium text-slate-400 mb-1.5 relative">Total Users</p>
        <p className="text-3xl font-black relative">{allUsers.length}</p>
        <p className="text-[11px] text-slate-500 mt-1 relative">Across all roles</p>
      </div>
      {[
        ['Super Admins', allUsers.filter(u=>u.role==='superadmin').length, 'text-amber-600'],
        ['Admins',       allUsers.filter(u=>u.role==='admin').length,      'text-violet-600'],
        ['PLC Engineers',allUsers.filter(u=>u.role==='plc').length,        'text-blue-600'],
        ['Wiremen',      allUsers.filter(u=>u.role==='wireman').length,    'text-emerald-600'],
      ].map(([l,v,tc])=>(
        <div key={l} className="bg-white rounded-3xl p-5 border border-slate-200/60 hover:shadow-sm transition-all">
          <p className="text-xs font-medium text-slate-500 mb-1.5">{l}</p>
          <p className={`text-3xl font-black ${tc}`}>{v}</p>
          <p className="text-[11px] text-slate-400 mt-1">active accounts</p>
        </div>
      ))}
    </div>

    {/* Users table */}
    <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div>
          <h3 className="text-sm font-black text-slate-900">All Users & Secret Keys</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Manage roles, regenerate keys & toggle access</p>
        </div>
        <button onClick={()=>setAddUserM(true)} className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-full hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-md shadow-slate-900/10">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add User
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              {['User','Role','Department','Secret Key','Status','Actions'].map(h=>
                <th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-6 py-3.5 whitespace-nowrap">{h}</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {allUsers.map(u=>{
              const initials = u.name.split(' ').map(x=>x[0]).join('').slice(0,2).toUpperCase();
              const roleStyle = {
                superadmin: {bg:'bg-gradient-to-br from-amber-400 to-orange-500', badge:'bg-amber-50 text-amber-700 border-amber-200', dot:'bg-amber-500'},
                admin:      {bg:'bg-gradient-to-br from-violet-500 to-purple-600', badge:'bg-violet-50 text-violet-700 border-violet-200', dot:'bg-violet-500'},
                plc:        {bg:'bg-gradient-to-br from-blue-500 to-indigo-600', badge:'bg-blue-50 text-blue-700 border-blue-200', dot:'bg-blue-500'},
                wireman:    {bg:'bg-gradient-to-br from-emerald-500 to-green-600', badge:'bg-emerald-50 text-emerald-700 border-emerald-200', dot:'bg-emerald-500'},
              }[u.role] || {bg:'bg-slate-400', badge:'bg-slate-100 text-slate-600 border-slate-200', dot:'bg-slate-400'};
              const roleLabel = {superadmin:'Super Admin', admin:'Admin', plc:'PLC Engineer', wireman:'Wireman'}[u.role] || u.role;
              return (
                <tr key={u.id} className={`hover:bg-slate-50/60 transition-all ${!u.is_active?'opacity-50':''}`}>
                  {/* User cell — avatar + name + phone */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${roleStyle.bg} flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ring-2 ring-white shadow-sm`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{u.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{u.phone}</p>
                      </div>
                    </div>
                  </td>

                  {/* Role badge */}
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full border ${roleStyle.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${roleStyle.dot}`}/>
                      {roleLabel}
                    </span>
                  </td>

                  {/* Department */}
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-600 font-medium">{u.department || <span className="text-slate-300 italic">—</span>}</span>
                  </td>

                  {/* Secret Key — premium pill */}
                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 group">
                      <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                      </svg>
                      <span className="font-mono text-sm font-black text-slate-900 tracking-[3px]">{u.secret_key}</span>
                      <button onClick={()=>{navigator.clipboard.writeText(u.secret_key);}} title="Copy key"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-600 ml-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      </button>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-slate-400'} ${u.is_active ? 'animate-pulse' : ''}`}/>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={()=>regenKey(u)} disabled={busy} title="Regenerate secret key"
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-all disabled:opacity-60">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <polyline points="23 4 23 10 17 10"/>
                          <polyline points="1 20 1 14 7 14"/>
                          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                        </svg>
                        New Key
                      </button>
                      <button onClick={()=>toggleActive(u)} title={u.is_active?'Disable user':'Enable user'}
                        className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${
                          u.is_active
                            ? 'bg-white border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600 hover:bg-red-50'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                        }`}>
                        {u.is_active ? (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                            Disable
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                            Enable
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!allUsers.length && (
              <tr><td colSpan={6} className="text-center py-16 text-slate-400">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-2">
                    <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                  </div>
                  <p className="text-sm font-bold text-slate-500">No users yet</p>
                  <p className="text-xs text-slate-400">Add your first user to get started</p>
                </div>
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  </div>
)}
          {tab==='sessions' && (
            <div className="p-5 lg:p-7 space-y-4">
              {liveEvents.length>0&&(
                <div className="bg-slate-900 rounded-3xl p-6 text-white">
                  <h3 className="text-sm font-black mb-3 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>Real-time Events</h3>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {liveEvents.map(e=>(
                      <div key={e.id} className="flex items-center gap-3 text-xs px-3 py-2 bg-slate-800/50 rounded-xl">
                        <span className={`w-1.5 h-1.5 rounded-full ${e.color==='emerald'?'bg-emerald-400':e.color==='amber'?'bg-amber-400':e.color==='blue'?'bg-blue-400':'bg-slate-400'}`}/>
                        <span className="flex-1 font-medium">{e.msg}</span>
                        <span className="text-[10px] text-slate-400">{e.ts}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
                  <h3 className="text-sm font-black text-slate-900">All Work Sessions</h3>
                  {liveCount>0&&<span className="flex items-center gap-1.5 text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>{liveCount} live</span>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/50 border-b border-slate-100"><tr>{['Ticket','Customer','Worker','Role','Started','Duration','Status'].map(h=><th key={h} className="text-left text-[10px] font-bold text-slate-500 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {!sessions.length?<tr><td colSpan={7} className="text-center py-12 text-slate-400">No sessions yet.</td></tr>:sessions.map(s=>(
                        <tr key={s.id} className="hover:bg-slate-50/60">
                          <td className="px-4 py-3.5"><span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg">{s.ticket_no}</span></td>
                          <td className="px-4 py-3.5 text-slate-600 max-w-[110px] truncate">{s.customer_name}</td>
                          <td className="px-4 py-3.5 font-bold text-slate-800">{s.worker_name}</td>
                          <td className="px-4 py-3.5"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{s.worker_role}</span></td>
                          <td className="px-4 py-3.5 text-slate-400 whitespace-nowrap">{new Date(s.started_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
                          <td className="px-4 py-3.5 font-black text-slate-800">{fmtH(s.total_seconds||0)}</td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5">
                              {s.status==='running'&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status==='running'?'bg-emerald-100 text-emerald-700':s.status==='paused'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{s.status}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ASSIGN MODAL */}
      {assignM&&(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setAssignM(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl shadow-slate-900/20 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">Assign Workers</h3>
              <button onClick={()=>setAssignM(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 border-b border-slate-100 flex-wrap">
              <span className="font-mono text-sm font-black text-blue-600">{assignM.ticket_id}</span>
              <span className="text-sm font-bold text-slate-800">{assignM.customer_name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto ${PR_CLR[assignM.priority]}`}>{assignM.priority}</span>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><FLabel>🖥 PLC Engineer</FLabel><FSel value={aData.plc} onChange={e=>setAData(p=>({...p,plc:e.target.value}))}>
                <option value="">— No PLC assigned —</option>
                {plcW.map(w=><option key={w.id} value={w.id}>{w.name} ({w.department})</option>)}
              </FSel></div>
              <div><FLabel>⚡ Wireman</FLabel><FSel value={aData.wireman} onChange={e=>setAData(p=>({...p,wireman:e.target.value}))}>
                <option value="">— No wireman assigned —</option>
                {wireW.map(w=><option key={w.id} value={w.id}>{w.name} ({w.department})</option>)}
              </FSel></div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={()=>setAssignM(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl hover:bg-slate-50">Cancel</button>
              <button onClick={saveAssign} disabled={busy} className="flex-1 py-3 bg-slate-900 text-white font-bold text-sm rounded-2xl hover:bg-slate-800 disabled:opacity-60">Save Assignment</button>
            </div>
          </div>
        </div>
      )}

      {/* KEY MODAL */}
      {keyModal&&(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5">🔑</div>
            <h3 className="text-lg font-black text-slate-900 mb-1">New Key Generated</h3>
            <p className="text-sm text-slate-400 mb-5">For <strong className="text-slate-700">{keyModal.name}</strong></p>
            <div className="bg-blue-50 border border-blue-100 rounded-2xl py-5 mb-5">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">New Secret Key</p>
              <p className="text-4xl font-black font-mono text-blue-600 tracking-[8px]">{keyModal.newKey}</p>
            </div>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-5">⚠️ Share this now — it won't be shown again.</p>
            <button onClick={()=>setKeyModal(null)} className="w-full py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800">Got it · Key shared</button>
          </div>
        </div>
      )}

      {/* ADD USER MODAL */}
      {assignM&&(
  <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setAssignM(null)}>
    <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl shadow-slate-900/20 overflow-hidden max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
        <h3 className="text-base font-black text-slate-900">Assign Workers</h3>
        <button onClick={()=>setAssignM(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
      </div>
      <div className="flex items-center gap-3 px-6 py-3 bg-blue-50 border-b border-slate-100 flex-wrap flex-shrink-0">
        <span className="font-mono text-sm font-black text-blue-600">{assignM.ticket_id}</span>
        <span className="text-sm font-bold text-slate-800">{assignM.customer_name}</span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto ${PR_CLR[assignM.priority]}`}>{assignM.priority}</span>
      </div>
      <div className="px-6 py-5 space-y-4 overflow-y-auto">
        <p className="text-xs text-slate-500">Select one or more workers for each role. Multiple workers can be assigned to the same ticket.</p>

        <div>
          <div className="flex items-center justify-between mb-2">
            <FLabel>🖥 PLC Engineers</FLabel>
            <span className="text-[10px] font-bold text-blue-600">{aData.plc.length} selected</span>
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto bg-slate-50 rounded-2xl p-2 border border-slate-200">
            {plcW.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No PLC engineers available</p>}
            {plcW.map(w => {
              const checked = aData.plc.includes(w.id);
              return (
                <label key={w.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${checked ? 'bg-blue-100 border border-blue-300' : 'bg-white border border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={checked}
                    onChange={()=>setAData(p => ({...p, plc: checked ? p.plc.filter(x=>x!==w.id) : [...p.plc, w.id]}))}
                    className="w-4 h-4 accent-blue-600 cursor-pointer"/>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                    <p className="text-[10px] text-slate-400">{w.department || '—'} · {w.phone}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <FLabel>⚡ Wiremen</FLabel>
            <span className="text-[10px] font-bold text-emerald-600">{aData.wireman.length} selected</span>
          </div>
          <div className="space-y-1.5 max-h-44 overflow-y-auto bg-slate-50 rounded-2xl p-2 border border-slate-200">
            {wireW.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No wiremen available</p>}
            {wireW.map(w => {
              const checked = aData.wireman.includes(w.id);
              return (
                <label key={w.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all ${checked ? 'bg-emerald-100 border border-emerald-300' : 'bg-white border border-slate-200 hover:border-slate-300'}`}>
                  <input type="checkbox" checked={checked}
                    onChange={()=>setAData(p => ({...p, wireman: checked ? p.wireman.filter(x=>x!==w.id) : [...p.wireman, w.id]}))}
                    className="w-4 h-4 accent-emerald-600 cursor-pointer"/>
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{w.name}</p>
                    <p className="text-[10px] text-slate-400">{w.department || '—'} · {w.phone}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex gap-3 px-6 py-4 border-t border-slate-100 flex-shrink-0">
        <button onClick={()=>setAssignM(null)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl hover:bg-slate-50">Cancel</button>
        <button onClick={saveAssign} disabled={busy} className="flex-1 py-3 bg-slate-900 text-white font-bold text-sm rounded-2xl hover:bg-slate-800 disabled:opacity-60">
          Assign {aData.plc.length + aData.wireman.length} worker{aData.plc.length+aData.wireman.length!==1?'s':''}
        </button>
      </div>
    </div>
  </div>
)}
      {/* {addUserM&&(
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setAddUserM(false)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">Add New User</h3>
              <button onClick={()=>setAddUserM(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div><FLabel>Full Name *</FLabel><FInput placeholder="Worker full name" value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))}/></div>
              <div><FLabel>Phone *</FLabel><FInput type="tel" placeholder="9876543210" value={newUser.phone} onChange={e=>setNewUser(p=>({...p,phone:e.target.value}))}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><FLabel>Role *</FLabel><FSel value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
                  <option value="plc">PLC Engineer</option><option value="wireman">Wireman</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option>
                </FSel></div>
                <div><FLabel>Department</FLabel><FInput placeholder="Operations" value={newUser.department} onChange={e=>setNewUser(p=>({...p,department:e.target.value}))}/></div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={()=>setAddUserM(false)} className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl hover:bg-slate-50">Cancel</button>
              <button onClick={addUser} disabled={busy} className="flex-1 py-3 bg-slate-900 text-white font-bold text-sm rounded-2xl hover:bg-slate-800 disabled:opacity-60">Create User</button>
            </div>
          </div>
        </div>
      )} */}
    </div>
  );
}

/* ─── Sub-chart components ─── */
function OverviewChart({ tickets }) {
  const data = (() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const dt = tickets.filter(t=>String(t.created_at).slice(0,10)===key);
      days.push({ day: d.toLocaleDateString('en-IN',{weekday:'short'}), Tickets: dt.length, Done: dt.filter(t=>t.status==='Completed').length });
    }
    return days;
  })();
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Transaction Activity</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Tickets created vs completed</p>
        </div>
        <span className="text-[11px] text-slate-400 font-bold">Last 7d</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{top:5,right:5,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
          <Line type="monotone" dataKey="Tickets" stroke="#1e293b" strokeWidth={2.5} dot={{r:0}} activeDot={{r:5}}/>
          <Line type="monotone" dataKey="Done" stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 4" dot={{r:0}} activeDot={{r:5,fill:'#3b82f6'}}/>
        </LineChart>
      </ResponsiveContainer>
      <div className="flex items-center gap-5 pt-3 mt-1 border-t border-slate-100">
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-900"/><span className="text-[11px] font-semibold text-slate-700">Created</span></div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/><span className="text-[11px] font-semibold text-slate-700">Completed</span></div>
      </div>
    </div>
  );
}

function SessionTrendChart({ sessions }) {
  const data = (() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const ds = sessions.filter(s=>String(s.started_at).slice(0,10)===key);
      const total = ds.reduce((a,s)=>a+(s.total_seconds||0),0);
      days.push({ day: d.toLocaleDateString('en-IN',{weekday:'short'}), Hours: +(total/3600).toFixed(1) });
    }
    return days;
  })();
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Sale Performance</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Total work hours · last 7 days</p>
        </div>
        <span className="text-[11px] text-slate-400 font-bold">Last 7d</span>
      </div>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{top:5,right:5,left:-20,bottom:0}}>
          <defs>
            <linearGradient id="gOvBar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={1}/>
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.3}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
          <Bar dataKey="Hours" fill="url(#gOvBar)" radius={[6,6,0,0]} maxBarSize={32}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function OrdersByTimeHeatmap({ sessions }) {
  // 7 days × 24 hours grid intensity
  const grid = (() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const hours = Array.from({length:24}).map((_,h) => {
        const matched = sessions.filter(s => {
          const sd = new Date(s.started_at);
          return sd.toISOString().slice(0,10)===key && sd.getHours()===h;
        });
        return matched.reduce((a,s)=>a+(s.total_seconds||0),0);
      });
      days.push({ label: d.toLocaleDateString('en-IN',{weekday:'short'}), hours });
    }
    return days;
  })();
  const maxVal = Math.max(...grid.flatMap(d=>d.hours), 1);
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Orders By Time</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Hours per slot — last 7 days</p>
        </div>
        <span className="text-[11px] text-slate-400 font-bold">January 2026</span>
      </div>
      <div className="space-y-1.5">
        {grid.map(row=>(
          <div key={row.label} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold w-8">{row.label}</span>
            <div className="flex-1 grid grid-cols-24 gap-0.5">
              {row.hours.map((v,h)=>{
                const intensity = v/maxVal;
                return <div key={h} className="aspect-square rounded-sm" style={{backgroundColor: v===0 ? '#f1f5f9' : `rgba(59,130,246,${0.2 + intensity*0.8})`}} title={`${row.label} ${h}:00 — ${(v/3600).toFixed(1)}h`}/>;
              })}
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-3 text-[10px] text-slate-400">
          <span>Less</span>
          {[0.1,0.3,0.5,0.7,1].map(i=>(
            <span key={i} className="w-3 h-3 rounded-sm" style={{backgroundColor:`rgba(59,130,246,${i})`}}/>
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

function ProductStaticsChart({ tickets }) {
  const data = ['installation','troubleshooting','new_development','after_sales'].map(t=>({
    label: SVC_L[t],
    Open: tickets.filter(x=>x.service_type===t&&x.status==='Open').length,
    Active: tickets.filter(x=>x.service_type===t&&['Assigned','In Progress'].includes(x.status)).length,
    Done: tickets.filter(x=>x.service_type===t&&x.status==='Completed').length,
  }));
  return (
    <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-slate-900">Product Statics</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Tickets by service type</p>
        </div>
        <span className="text-[11px] text-slate-400 font-bold">Last 7d</span>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{top:5,right:5,left:-20,bottom:0}}>
          <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
          <XAxis dataKey="label" tick={{fontSize:9,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
          <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
          <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
          <Bar dataKey="Open" stackId="a" fill="#cbd5e1" radius={[0,0,0,0]} maxBarSize={28}/>
          <Bar dataKey="Active" stackId="a" fill="#60a5fa" radius={[0,0,0,0]} maxBarSize={28}/>
          <Bar dataKey="Done" stackId="a" fill="#1e3a8a" radius={[6,6,0,0]} maxBarSize={28}/>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}




// import React, { useState, useEffect, useCallback, useRef } from 'react';
// import { Link } from 'react-router-dom';
// import svcApi from '../../serviceApi';
// import { useSvcAuth } from '../../context/SvcAuthContext';
// import { useSocket } from '../../useSocket';
// import {
//   BarChart, Bar, LineChart, Line, AreaChart, Area,
//   XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
//   PieChart, Pie, Cell
// } from 'recharts';

// /* ─── helpers ─── */
// const SVC_L   = {installation:'Installation',troubleshooting:'Troubleshooting',new_development:'New Dev',after_sales:'After Sales'};
// const ST_CLR  = {Open:'bg-slate-100 text-slate-600',Assigned:'bg-indigo-50 text-indigo-700','In Progress':'bg-amber-50 text-amber-700',Completed:'bg-emerald-50 text-emerald-700',Closed:'bg-slate-100 text-slate-400'};
// const PR_CLR  = {High:'bg-red-50 text-red-600 border-red-200',Medium:'bg-amber-50 text-amber-600 border-amber-200',Low:'bg-emerald-50 text-emerald-600 border-emerald-200'};
// const TERMINAL= ['Completed','Closed'];
// const fmtH    = s=>s>=3600?`${(s/3600).toFixed(1)}h`:s>0?`${Math.round(s/60)}m`:'—';
// const fmtD    = d=>new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
// const fmtDay  = d=>{const dt=new Date(d); return dt.toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'});};
// const fmtHour = h=>{const suffix=h>=12?'PM':'AM'; const hh=h%12||12; return `${hh}${suffix}`;};
// const PIE_COLORS = ['#6366f1','#22c55e','#f59e0b','#ef4444','#8b5cf6'];

// /* ─── CSV export helper ─── */
// function exportCSV(rows, cols, filename) {
//   const header = cols.map(c=>c.label).join(',');
//   const body   = rows.map(r=>cols.map(c=>`"${r[c.key]??''}"`).join(',')).join('\n');
//   const blob   = new Blob([header+'\n'+body],{type:'text/csv'});
//   const url    = URL.createObjectURL(blob);
//   const a      = document.createElement('a'); a.href=url; a.download=filename; a.click();
//   URL.revokeObjectURL(url);
// }

// /* ─── sub-components ─── */
// const Kpi = ({label,value,sub,color='from-indigo-500 to-indigo-600'})=>(
//   <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100/80 relative overflow-hidden hover:shadow-md transition-all group">
//     <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${color}`}/>
//     <p className="text-2xl font-black text-slate-800">{value}</p>
//     <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-1 font-semibold">{label}</p>
//     {sub&&<p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
//   </div>
// );

// const SectionHeader=({title,action})=>(
//   <div className="flex items-center justify-between mb-4">
//     <h3 className="text-sm font-black text-slate-800">{title}</h3>
//     {action}
//   </div>
// );

// /* ─── REPORTS TAB ─── */
// function ReportsTab({workers}) {
//   const [weekData, setWeekData]   = useState([]);
//   const [dayData,  setDayData]    = useState([]);
//   const [persons,  setPersons]    = useState([]);
//   const [selDay,   setSelDay]     = useState(new Date().toISOString().slice(0,10));
//   const [selPerson,setSelPerson]  = useState(null);
//   const [personDays,setPersonDays]= useState([]);
//   const [dateFrom, setDateFrom]   = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-29); return d.toISOString().slice(0,10); });
//   const [dateTo,   setDateTo]     = useState(new Date().toISOString().slice(0,10));
//   const [loading,  setLoading]    = useState(false);

//   const loadAll = useCallback(async()=>{
//     setLoading(true);
//     try {
//       const [w,d,p] = await Promise.all([
//         svcApi.get('/reports/weekly',{params:{days:14}}),
//         svcApi.get('/reports/daily', {params:{date:selDay}}),
//         svcApi.get('/reports/person-wise',{params:{from:dateFrom,to:dateTo}}),
//       ]);
//       setWeekData(w.data.map(r=>({...r, day: fmtDay(r.day), hours:+(r.total_seconds/3600).toFixed(2) })));
//       setDayData(d.data.map(r=>({...r, label:fmtHour(r.hour), hours:+(r.total_seconds/3600).toFixed(2) })));
//       setPersons(p.data.map(r=>({...r, hours:+(r.total_seconds/3600).toFixed(2) })));
//     } catch(e){console.error(e);} finally{setLoading(false);}
//   },[selDay,dateFrom,dateTo]);

//   useEffect(()=>{ loadAll(); },[loadAll]);

//   const loadPersonDays = async(worker)=>{
//     if(selPerson?.worker_id===worker.worker_id){setSelPerson(null);setPersonDays([]);return;}
//     setSelPerson(worker);
//     try {
//       const{data}=await svcApi.get(`/reports/person-detail/${worker.worker_id}`,{params:{from:dateFrom,to:dateTo}});
//       setPersonDays(data.map(r=>({...r, day:fmtD(r.day), hours:+(r.total_seconds/3600).toFixed(2) })));
//     } catch(e){console.error(e);}
//   };

//   const totalHrs  = weekData.reduce((a,r)=>a+r.hours,0).toFixed(1);
//   const peakHour  = [...dayData].sort((a,b)=>b.hours-a.hours)[0];
//   const topWorker = [...persons].sort((a,b)=>b.total_seconds-a.total_seconds)[0];

//   /* CSV export functions */
//   const dlWeekly  = ()=>exportCSV(weekData,[{key:'day',label:'Day'},{key:'hours',label:'Hours'},{key:'session_count',label:'Sessions'},{key:'active_workers',label:'Workers'}],`weekly_report_${new Date().toISOString().slice(0,10)}.csv`);
//   const dlDaily   = ()=>exportCSV(dayData,[{key:'label',label:'Hour'},{key:'hours',label:'Hours'},{key:'session_count',label:'Sessions'}],`daily_report_${selDay}.csv`);
//   const dlPersons = ()=>exportCSV(persons,[{key:'worker_name',label:'Name'},{key:'worker_role',label:'Role'},{key:'session_count',label:'Sessions'},{key:'ticket_count',label:'Tickets'},{key:'hours',label:'Hours'},{key:'total_pauses',label:'Pauses'}],`person_report_${dateFrom}_${dateTo}.csv`);

//   const CustomTooltip=({active,payload,label})=>{
//     if(!active||!payload?.length) return null;
//     return (
//       <div className="bg-white rounded-xl shadow-xl border border-slate-100 px-4 py-3 text-xs">
//         <p className="font-bold text-slate-700 mb-1.5">{label}</p>
//         {payload.map((p,i)=><p key={i} style={{color:p.color}} className="font-semibold">{p.name}: {p.value}{p.name==='Hours'?'h':''}</p>)}
//       </div>
//     );
//   };

//   if(loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"/></div>;

//   return (
//     <div className="space-y-5">
//       {/* Date range filter */}
//       <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm px-5 py-4 flex flex-wrap items-center gap-4">
//         <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Report Range</span>
//         <div className="flex items-center gap-2">
//           <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 transition-all"/>
//           <span className="text-slate-400 text-xs">to</span>
//           <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 transition-all"/>
//         </div>
//         <button onClick={loadAll} className="px-4 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:-translate-y-0.5 transition-all shadow-md shadow-indigo-200/50">Apply</button>
//         <div className="ml-auto flex gap-2">
//           <button onClick={dlWeekly}  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-all">⬇ Weekly</button>
//           <button onClick={dlDaily}   className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-all">⬇ Daily</button>
//           <button onClick={dlPersons} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-xl hover:border-indigo-300 hover:text-indigo-600 transition-all">⬇ Person</button>
//         </div>
//       </div>

//       {/* Summary KPIs */}
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
//         <Kpi label="Total Hours (14d)" value={`${totalHrs}h`} color="from-indigo-500 to-violet-600"/>
//         <Kpi label="Peak Hour" value={peakHour?fmtHour(peakHour.hour):'—'} color="from-amber-400 to-orange-500"/>
//         <Kpi label="Top Worker" value={topWorker?.worker_name?.split(' ')[0]||'—'} sub={topWorker?fmtH(topWorker.total_seconds||0):''} color="from-emerald-400 to-green-600"/>
//         <Kpi label="Active Workers" value={persons.filter(p=>p.total_seconds>0).length} sub={`of ${persons.length} total`} color="from-blue-400 to-indigo-500"/>
//       </div>

//       {/* Weekly chart + day picker */}
//       <div className="grid sm:grid-cols-2 gap-4">
//         {/* Weekly bar chart */}
//         <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm p-5">
//           <SectionHeader title="Weekly Work Hours (14 days)" action={<span className="text-xs text-slate-400 font-semibold">{totalHrs}h total</span>}/>
//           <ResponsiveContainer width="100%" height={200}>
//             <AreaChart data={weekData} margin={{top:4,right:4,left:-20,bottom:0}}>
//               <defs>
//                 <linearGradient id="gHours" x1="0" y1="0" x2="0" y2="1">
//                   <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15}/>
//                   <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
//                 </linearGradient>
//               </defs>
//               <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
//               <XAxis dataKey="day" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//               <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//               <Tooltip content={<CustomTooltip/>}/>
//               <Area type="monotone" dataKey="hours" name="Hours" stroke="#6366f1" strokeWidth={2.5} fill="url(#gHours)" dot={{r:3,fill:'#6366f1',strokeWidth:0}} activeDot={{r:5}}/>
//               <Area type="monotone" dataKey="session_count" name="Sessions" stroke="#22c55e" strokeWidth={1.5} fill="none" strokeDasharray="4 2" dot={false}/>
//             </AreaChart>
//           </ResponsiveContainer>
//         </div>

//         {/* Daily hour breakdown */}
//         <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm p-5">
//           <SectionHeader
//             title="Hourly Breakdown"
//             action={<input type="date" value={selDay} onChange={e=>setSelDay(e.target.value)} className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:border-indigo-400"/>}
//           />
//           <ResponsiveContainer width="100%" height={200}>
//             <BarChart data={dayData.filter(d=>d.total_seconds>0)} margin={{top:4,right:4,left:-20,bottom:0}}>
//               <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
//               <XAxis dataKey="label" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//               <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//               <Tooltip content={<CustomTooltip/>}/>
//               <Bar dataKey="hours" name="Hours" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={32}/>
//               <Bar dataKey="session_count" name="Sessions" fill="#e0e7ff" radius={[4,4,0,0]} maxBarSize={32}/>
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//       </div>

//       {/* Person wise */}
//       <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden">
//         <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
//           <div>
//             <h3 className="text-sm font-black text-slate-800">Person-wise Report</h3>
//             <p className="text-xs text-slate-400 mt-0.5">Work hours, sessions & pauses per worker</p>
//           </div>
//           <button onClick={dlPersons} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-bold rounded-xl hover:bg-indigo-100 transition-all">⬇ Export CSV</button>
//         </div>

//         {/* Chart */}
//         <div className="px-5 pt-4 pb-2">
//           <ResponsiveContainer width="100%" height={180}>
//             <BarChart data={persons.slice(0,10)} layout="vertical" margin={{top:0,right:16,left:80,bottom:0}}>
//               <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false}/>
//               <XAxis type="number" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//               <YAxis type="category" dataKey="worker_name" tick={{fontSize:10,fill:'#64748b',fontWeight:600}} axisLine={false} tickLine={false} width={80}/>
//               <Tooltip content={<CustomTooltip/>}/>
//               <Bar dataKey="hours" name="Hours" fill="#6366f1" radius={[0,4,4,0]} maxBarSize={18}/>
//               <Bar dataKey="session_count" name="Sessions" fill="#a5b4fc" radius={[0,4,4,0]} maxBarSize={18}/>
//             </BarChart>
//           </ResponsiveContainer>
//         </div>

//         {/* Table */}
//         <div className="overflow-x-auto">
//           <table className="w-full text-xs">
//             <thead className="bg-slate-50 border-y border-slate-100">
//               <tr>{['Worker','Role','Sessions','Tickets','Hours','Avg/Session','Pauses','First In','Actions'].map(h=>
//                 <th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>
//               )}</tr>
//             </thead>
//             <tbody className="divide-y divide-slate-100/80">
//               {!persons.length
//                 ? <tr><td colSpan={9} className="text-center py-8 text-slate-400">No data for this period.</td></tr>
//                 : persons.map(p=>(
//                   <React.Fragment key={p.worker_id}>
//                     <tr className={`hover:bg-slate-50/60 transition-all cursor-pointer ${selPerson?.worker_id===p.worker_id?'bg-indigo-50/40':''}`} onClick={()=>loadPersonDays(p)}>
//                       <td className="px-4 py-3">
//                         <div className="flex items-center gap-2">
//                           <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${p.worker_role==='plc'?'bg-indigo-500':'bg-emerald-500'}`}>{p.worker_name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
//                           <span className="font-semibold text-slate-800">{p.worker_name}</span>
//                         </div>
//                       </td>
//                       <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{p.worker_role}</span></td>
//                       <td className="px-4 py-3 font-bold text-slate-700">{p.session_count||0}</td>
//                       <td className="px-4 py-3 font-bold text-slate-700">{p.ticket_count||0}</td>
//                       <td className="px-4 py-3 font-black text-indigo-600">{fmtH(p.total_seconds||0)}</td>
//                       <td className="px-4 py-3 text-slate-500">{fmtH(p.avg_session_seconds||0)}</td>
//                       <td className="px-4 py-3 text-slate-500">{p.total_pauses||0}</td>
//                       <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{p.earliest_start?new Date(p.earliest_start).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}):'—'}</td>
//                       <td className="px-4 py-3">
//                         <svg className={`w-4 h-4 text-slate-400 transition-transform ${selPerson?.worker_id===p.worker_id?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
//                       </td>
//                     </tr>
//                     {selPerson?.worker_id===p.worker_id && personDays.length>0 && (
//                       <tr>
//                         <td colSpan={9} className="px-5 py-4 bg-indigo-50/30 border-b border-slate-100">
//                           <p className="text-xs font-bold text-slate-700 mb-3">{p.worker_name} — Day-wise breakdown</p>
//                           <ResponsiveContainer width="100%" height={140}>
//                             <BarChart data={personDays} margin={{top:0,right:8,left:-20,bottom:0}}>
//                               <CartesianGrid strokeDasharray="3 3" stroke="#e0e7ff" vertical={false}/>
//                               <XAxis dataKey="day" tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//                               <YAxis tick={{fontSize:9,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
//                               <Tooltip content={<CustomTooltip/>}/>
//                               <Bar dataKey="hours" name="Hours" fill="#6366f1" radius={[4,4,0,0]} maxBarSize={28}/>
//                             </BarChart>
//                           </ResponsiveContainer>
//                           <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mt-3">
//                             {personDays.map(d=>(
//                               <div key={d.day} className="bg-white rounded-xl p-2.5 border border-indigo-100 text-center">
//                                 <p className="text-[9px] text-slate-400 font-semibold">{d.day}</p>
//                                 <p className="text-sm font-black text-indigo-600 mt-0.5">{d.hours.toFixed(1)}h</p>
//                                 <p className="text-[9px] text-slate-400">{d.sessions} sess</p>
//                               </div>
//                             ))}
//                           </div>
//                         </td>
//                       </tr>
//                     )}
//                   </React.Fragment>
//                 ))}
//             </tbody>
//           </table>
//         </div>
//       </div>
//     </div>
//   );
// }

// /* ─── MAIN ADMIN DASHBOARD ─── */
// export default function AdminDashboard() {
//   const { svcUser, svcLogout, isSuperAdmin } = useSvcAuth();
//   const [tab,      setTab]      = useState('tickets');
//   const [tickets,  setTickets]  = useState([]);
//   const [workers,  setWorkers]  = useState([]);
//   const [allUsers, setAllUsers] = useState([]);
//   const [sessions, setSessions] = useState([]);
//   const [filters,  setFilters]  = useState({status:'All',priority:'All',service_type:'All',search:''});
//   const [expanded, setExpanded] = useState(null);
//   const [assignM,  setAssignM]  = useState(null);
//   const [aData,    setAData]    = useState({plc:'',wireman:''});
//   const [keyModal, setKeyModal] = useState(null);
//   const [addUserM, setAddUserM] = useState(false);
//   const [newUser,  setNewUser]  = useState({name:'',phone:'',role:'plc',department:''});
//   const [busy,     setBusy]     = useState(false);
//   /* Live socket feed */
//   const [liveEvents, setLiveEvents] = useState([]);
//   const liveRef = useRef(null);

//   /* Socket.IO — real-time session events */
//   useSocket({
//     'session:started':   e => { addLive(`▶ ${e.worker?.name} started on ${e.ticket_id?.slice(-4)||'ticket'}`, 'emerald'); loadSessions(); },
//     'session:paused':    e => { addLive(`⏸ ${e.worker} paused — "${e.reason}"`, 'amber'); loadSessions(); },
//     'session:resumed':   e => { addLive(`▶ ${e.worker} resumed`, 'indigo'); loadSessions(); },
//     'session:completed': e => { addLive(`✓ ${e.worker} completed (${fmtH(e.totalSeconds)})`, 'blue'); loadSessions(); loadTickets(); },
//   });

//   const addLive = (msg, color) => {
//     const ts = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
//     setLiveEvents(p=>[{msg,color,ts,id:Date.now()},...p].slice(0,20));
//   };

//   const loadTickets  = useCallback(async()=>{ try{ const p={}; if(filters.status!=='All')p.status=filters.status; if(filters.priority!=='All')p.priority=filters.priority; if(filters.service_type!=='All')p.service_type=filters.service_type; if(filters.search)p.search=filters.search; const{data}=await svcApi.get('/tickets',{params:p}); setTickets(data); }catch(e){console.error(e);} },[filters]);
//   const loadWorkers  = useCallback(async()=>{ try{const{data}=await svcApi.get('/auth/workers');setWorkers(data);}catch(e){console.error(e);} },[]);
//   const loadAllUsers = useCallback(async()=>{ if(!isSuperAdmin)return; try{const{data}=await svcApi.get('/auth/all-users');setAllUsers(data);}catch(e){console.error(e);} },[isSuperAdmin]);
//   const loadSessions = useCallback(async()=>{ try{const{data}=await svcApi.get('/sessions/all');setSessions(data);}catch(e){console.error(e);} },[]);

//   useEffect(()=>{ loadTickets(); },[loadTickets]);
//   useEffect(()=>{ loadWorkers(); loadSessions(); if(isSuperAdmin){loadAllUsers();} },[]);

//   const plcW  = workers.filter(w=>w.role==='plc');
//   const wireW = workers.filter(w=>w.role==='wireman');

//   const openAssign=(tk)=>{ if(TERMINAL.includes(tk.status)){alert('Cannot assign a completed/closed ticket.');return;} setAssignM(tk);setAData({plc:tk.assigned_plc||'',wireman:tk.assigned_wireman||''}); };
//   const saveAssign=async()=>{ setBusy(true); try{await svcApi.patch(`/tickets/${assignM.id}/assign`,{assigned_plc:aData.plc||null,assigned_wireman:aData.wireman||null});setAssignM(null);loadTickets();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
//   const updateStatus=async(id,status)=>{ try{await svcApi.patch(`/tickets/${id}/status`,{status});loadTickets();}catch(e){console.error(e);} };
//   const regenKey=async(user)=>{ setBusy(true); try{const{data}=await svcApi.patch(`/auth/users/${user.id}/regen-key`);setKeyModal({id:user.id,name:user.name,newKey:data.secret_key});loadAllUsers();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
//   const addUser=async()=>{ if(!newUser.name.trim()||!newUser.phone.trim()){alert('Name and phone required');return;} setBusy(true); try{await svcApi.post('/auth/users',newUser);setAddUserM(false);setNewUser({name:'',phone:'',role:'plc',department:''});loadAllUsers();loadWorkers();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
//   const toggleActive=async(user)=>{ try{await svcApi.patch(`/auth/users/${user.id}`,{is_active:!user.is_active});loadAllUsers();loadWorkers();}catch(e){console.error(e);} };

//   const av = svcUser?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'??';
//   const counts = {total:tickets.length,open:tickets.filter(t=>t.status==='Open').length,assigned:tickets.filter(t=>t.status==='Assigned').length,inprog:tickets.filter(t=>t.status==='In Progress').length,done:tickets.filter(t=>t.status==='Completed').length,unassigned:tickets.filter(t=>!t.assigned_plc&&!t.assigned_wireman&&!TERMINAL.includes(t.status)).length};
//   const liveCount = sessions.filter(s=>s.status==='running').length;

//   const sideNav = [
//     {k:'tickets',icon:'🎫',label:'All Tickets',badge:counts.unassigned>0?counts.unassigned:null},
//     {k:'workers',icon:'👷',label:'Workers'},
//     ...(isSuperAdmin?[{k:'reports',icon:'📊',label:'Reports'},{k:'users',icon:'👤',label:'Users & Keys'},{k:'sessions',icon:'⏱',label:'Live Sessions',badge:liveCount>0?liveCount:null}]:[]),
//   ];

//   const FInput=(props)=><input {...props} className={`w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white transition-all ${props.className||''}`}/>;
//   const FSel  =(props)=><select {...props} className={`w-full px-3 py-2.5 bg-slate-50 border-2 border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 focus:bg-white transition-all ${props.className||''}`}/>;
//   const FLabel=({children})=><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{children}</label>;

//   return (
//     <div className="flex h-screen bg-[#F7F8FC] font-sans overflow-hidden">
//       {/* ── SIDEBAR ── */}
//       <aside className="w-14 sm:w-60 bg-white border-r border-slate-100/80 flex flex-col flex-shrink-0 shadow-[1px_0_12px_rgba(0,0,0,0.04)]">
//         {/* Logo */}
//         <div className="flex items-center gap-3 px-3 sm:px-5 py-5 border-b border-slate-100/80">
//           <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-md shadow-violet-200 text-base">🛠</div>
//           <div className="hidden sm:block">
//             <p className="text-[13px] font-black text-slate-800 leading-none">Service Admin</p>
//             <p className="text-[10px] text-slate-400 mt-0.5 uppercase tracking-wider">Cess Engineering</p>
//           </div>
//         </div>
//         {/* Profile */}
//         <div className="flex items-center gap-3 px-3 sm:px-4 py-4 border-b border-slate-100/80">
//           <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${isSuperAdmin?'bg-gradient-to-br from-amber-400 to-orange-500':'bg-gradient-to-br from-violet-500 to-indigo-600'}`}>{av}</div>
//           <div className="hidden sm:block min-w-0">
//             <p className="text-xs font-bold text-slate-800 truncate leading-none">{svcUser?.name}</p>
//             <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded-md mt-1 ${isSuperAdmin?'bg-amber-50 text-amber-700':'bg-violet-50 text-violet-700'}`}>{isSuperAdmin?'⭐ Super Admin':'🔑 Admin'}</span>
//           </div>
//         </div>
//         {/* Nav */}
//         <nav className="flex-1 px-2 py-4 space-y-0.5">
//           {sideNav.map(({k,icon,label,badge})=>(
//             <button key={k} onClick={()=>setTab(k)}
//               className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-150 ${tab===k?'bg-indigo-600 text-white shadow-lg shadow-indigo-200':'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>
//               <span className="flex-shrink-0 text-sm">{icon}</span>
//               <span className="hidden sm:block">{label}</span>
//               {badge&&<span className={`hidden sm:flex ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] items-center justify-center ${tab===k?'bg-white/20 text-white':'bg-red-500 text-white'}`}>{badge}</span>}
//             </button>
//           ))}
//         </nav>
//         {/* Bottom */}
//         <div className="px-2 pb-4 space-y-1.5">
//           <Link to="/service" className="hidden sm:flex items-center justify-center gap-1.5 w-full px-3 py-2 rounded-xl bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-all border border-indigo-100">
//             <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Inquiry
//           </Link>
//           <button onClick={svcLogout} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-red-100 bg-red-50 text-red-500 text-xs font-semibold hover:bg-red-100 transition-all">
//             <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
//             <span className="hidden sm:block">Sign Out</span>
//           </button>
//         </div>
//       </aside>

//       {/* ── MAIN ── */}
//       <div className="flex-1 flex flex-col overflow-hidden min-w-0">
//         {/* Topbar */}
//         <header className="bg-white border-b border-slate-100/80 px-5 sm:px-8 h-14 flex items-center justify-between flex-shrink-0 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
//           <div>
//             <h1 className="text-[15px] font-black text-slate-800">{tab==='tickets'?'All Service Tickets':tab==='workers'?'Field Workers':tab==='reports'?'Reports & Analytics':tab==='users'?'Users & Secret Keys':'Live Sessions'}</h1>
//             <p className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1.5">
//               Cess Engineering · Service Management
//               {liveCount>0&&<span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>{liveCount} active</span>}
//             </p>
//           </div>
//           <div className="flex items-center gap-3">
//             {/* Live feed mini */}
//             {liveEvents.length>0 && (
//               <div className="hidden lg:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 max-w-xs overflow-hidden">
//                 <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0"/>
//                 <span className="text-[11px] text-slate-600 truncate">{liveEvents[0]?.msg}</span>
//                 <span className="text-[9px] text-slate-400 flex-shrink-0">{liveEvents[0]?.ts}</span>
//               </div>
//             )}
//             <Link to="/service" className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all">
//               <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>New Inquiry
//             </Link>
//           </div>
//         </header>

//         {/* KPI row */}
//         {tab!=='reports' && (
//           <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5 px-5 sm:px-8 py-4 flex-shrink-0">
//             {[['Total',counts.total,'from-slate-400 to-slate-500'],['Open',counts.open,'from-slate-400 to-slate-500'],['Assigned',counts.assigned,'from-indigo-400 to-indigo-600'],['In Progress',counts.inprog,'from-amber-400 to-amber-600'],['Done',counts.done,'from-emerald-400 to-emerald-600'],['Unassigned',counts.unassigned,'from-red-400 to-red-600']].map(([l,v,g])=>(
//               <Kpi key={l} label={l} value={v} color={g}/>
//             ))}
//           </div>
//         )}

//         {/* Content scroll */}
//         <div className="flex-1 overflow-y-auto px-5 sm:px-8 pb-6">

//           {/* ── TICKETS ── */}
//           {tab==='tickets' && (
//             <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden">
//               <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100/80">
//                 <input className="flex-1 min-w-36 px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 transition-all placeholder-slate-400" placeholder="🔍  Search ticket, customer…" value={filters.search} onChange={e=>setFilters(p=>({...p,search:e.target.value}))}/>
//                 {[['status',['All','Open','Assigned','In Progress','Completed','Closed']],['priority',['All','High','Medium','Low']],['service_type',['All','installation','troubleshooting','new_development','after_sales']]].map(([k,opts])=>(
//                   <select key={k} className="px-3 py-2 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs outline-none focus:border-indigo-400 transition-all text-slate-700" value={filters[k]} onChange={e=>setFilters(p=>({...p,[k]:e.target.value}))}>
//                     {opts.map(o=><option key={o} value={o}>{o==='All'?`All ${k.replace(/_/g,' ')}`:SVC_L[o]||o}</option>)}
//                   </select>
//                 ))}
//               </div>
//               <div className="overflow-x-auto">
//                 <table className="w-full text-xs">
//                   <thead className="bg-slate-50/80 border-b border-slate-100">
//                     <tr>{['Ticket','Customer','Service','Priority','Status','PLC','Wireman','Date','Actions'].map(h=><th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr>
//                   </thead>
//                   <tbody className="divide-y divide-slate-100/80">
//                     {!tickets.length
//                       ? <tr><td colSpan={9} className="text-center py-16 text-slate-400 font-medium">No tickets found.</td></tr>
//                       : tickets.map(tk=>{
//                           const isDone=TERMINAL.includes(tk.status);
//                           return (
//                             <React.Fragment key={tk.id}>
//                               <tr className={`hover:bg-slate-50/60 transition-all ${expanded===tk.id?'bg-indigo-50/30':''} ${isDone?'opacity-60':''}`}>
//                                 <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-indigo-600 bg-indigo-100 px-2 py-1 rounded-lg">{tk.ticket_id}</span></td>
//                                 <td className="px-4 py-3 max-w-[130px]"><p className="font-semibold text-slate-800 truncate">{tk.customer_name}</p><p className="text-[10px] text-slate-400 truncate">{tk.address?.slice(0,28)}</p></td>
//                                 <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{SVC_L[tk.service_type]}</td>
//                                 <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PR_CLR[tk.priority]}`}>{tk.priority}</span></td>
//                                 <td className="px-4 py-3">
//                                   {isDone
//                                     ? <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ST_CLR[tk.status]}`}>{tk.status}</span>
//                                     : <select className="text-[11px] font-semibold px-2 py-1 rounded-lg border-2 border-slate-200 outline-none cursor-pointer bg-white text-slate-700 focus:border-indigo-400 transition-all" value={tk.status} onChange={e=>updateStatus(tk.id,e.target.value)}>
//                                         {['Open','Assigned','In Progress','Completed','Closed'].map(s=><option key={s}>{s}</option>)}
//                                       </select>}
//                                 </td>
//                                 <td className="px-4 py-3">{tk.plc_worker_name?<span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{tk.plc_worker_name}</span>:<span className="text-slate-300 italic text-[10px]">None</span>}</td>
//                                 <td className="px-4 py-3">{tk.wireman_worker_name?<span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{tk.wireman_worker_name}</span>:<span className="text-slate-300 italic text-[10px]">None</span>}</td>
//                                 <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{fmtD(tk.created_at)}</td>
//                                 <td className="px-4 py-3 whitespace-nowrap">
//                                   {!isDone&&<button onClick={()=>openAssign(tk)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-all mr-1.5">Assign</button>}
//                                   <button onClick={()=>setExpanded(expanded===tk.id?null:tk.id)} className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition-all">{expanded===tk.id?'Hide':'View'}</button>
//                                 </td>
//                               </tr>
//                               {expanded===tk.id&&(
//                                 <tr><td colSpan={9} className="px-4 pb-4 bg-indigo-50/20">
//                                   <div className="bg-white rounded-2xl border border-indigo-100 p-5 mt-1">
//                                     <div className="flex items-center justify-between mb-3">
//                                       <div className="flex items-center gap-2 flex-wrap">
//                                         <span className="font-mono text-sm font-black text-indigo-600">{tk.ticket_id}</span>
//                                         <span className="text-slate-400">—</span>
//                                         <span className="font-bold text-slate-700 text-sm">{tk.customer_name}</span>
//                                         {isDone&&<span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ Completed</span>}
//                                       </div>
//                                       <button onClick={()=>setExpanded(null)} className="text-slate-400 hover:text-slate-600 text-lg">✕</button>
//                                     </div>
//                                     <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
//                                       {[['Address',tk.address],['Contact',`${tk.contact_name||'—'}${tk.contact_phone?` · ${tk.contact_phone}`:''}`],['Designation',tk.designation||'—'],['Sales Agent',tk.sales_agent||'—'],['PLC',tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No'],['Wiring',tk.needs_wiring?'Yes':'No']].map(([k,v])=>(
//                                         <div key={k}><p className="text-[9px] text-slate-400 uppercase tracking-widest font-semibold">{k}</p><p className="text-xs font-semibold text-slate-700 mt-0.5 break-words">{v}</p></div>
//                                       ))}
//                                     </div>
//                                     {tk.description&&<div className="bg-slate-50 rounded-xl border-l-4 border-l-indigo-400 border border-indigo-100 px-4 py-3 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{tk.description}</div>}
//                                   </div>
//                                 </td></tr>
//                               )}
//                             </React.Fragment>
//                           );
//                         })}
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}

//           {/* ── WORKERS ── */}
//           {tab==='workers' && (
//             <div className="grid sm:grid-cols-2 gap-4">
//               {[['🖥 PLC Engineers',plcW,'bg-gradient-to-br from-blue-500 to-indigo-600','bg-blue-50 text-blue-700 border-blue-200'],['⚡ Wiremen',wireW,'bg-gradient-to-br from-emerald-500 to-green-600','bg-emerald-50 text-emerald-700 border-emerald-200']].map(([title,list,avG,badge])=>(
//                 <div key={title} className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden">
//                   <div className="px-5 py-4 border-b border-slate-100/80 flex items-center justify-between">
//                     <h3 className="text-sm font-black text-slate-800">{title}</h3>
//                     <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{list.length}</span>
//                   </div>
//                   <div className="divide-y divide-slate-100/80">
//                     {!list.length && <p className="text-center py-8 text-slate-400 text-sm">No workers yet</p>}
//                     {list.map(w=>(
//                       <div key={w.id} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/60 transition-all">
//                         <div className={`w-9 h-9 rounded-full ${avG} flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0`}>{w.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
//                         <div className="flex-1 min-w-0">
//                           <p className="text-sm font-bold text-slate-800 truncate">{w.name}</p>
//                           <p className="text-[11px] text-slate-400 mt-0.5">{w.department} · {w.phone}</p>
//                         </div>
//                         <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${badge}`}>{w.role}</span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}

//           {/* ── REPORTS ── */}
//           {tab==='reports' && isSuperAdmin && <ReportsTab workers={workers}/>}

//           {/* ── USERS ── */}
//           {tab==='users' && isSuperAdmin && (
//             <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden">
//               <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100/80">
//                 <div><h3 className="text-sm font-black text-slate-800">All Users & Secret Keys</h3><p className="text-xs text-slate-400 mt-0.5">Manage access, roles and secret keys</p></div>
//                 <button onClick={()=>setAddUserM(true)} className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all">
//                   <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add User
//                 </button>
//               </div>
//               <div className="overflow-x-auto">
//                 <table className="w-full text-xs">
//                   <thead className="bg-slate-50/80 border-b border-slate-100"><tr>{['Name','Phone','Role','Dept','Secret Key','Status','Actions'].map(h=><th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
//                   <tbody className="divide-y divide-slate-100/80">
//                     {allUsers.map(u=>(
//                       <tr key={u.id} className={`hover:bg-slate-50/60 transition-all ${!u.is_active?'opacity-50':''}`}>
//                         <td className="px-4 py-3 font-semibold text-slate-800">{u.name}</td>
//                         <td className="px-4 py-3 font-mono text-slate-500">{u.phone}</td>
//                         <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.role==='superadmin'?'bg-amber-100 text-amber-700':u.role==='admin'?'bg-violet-100 text-violet-700':u.role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{u.role}</span></td>
//                         <td className="px-4 py-3 text-slate-500">{u.department||'—'}</td>
//                         <td className="px-4 py-3"><span className="font-mono text-sm font-black text-indigo-600 bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-xl tracking-[4px]">{u.secret_key}</span></td>
//                         <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.is_active?'bg-emerald-100 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{u.is_active?'Active':'Inactive'}</span></td>
//                         <td className="px-4 py-3 whitespace-nowrap">
//                           <button onClick={()=>regenKey(u)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200 hover:bg-indigo-100 transition-all mr-1.5">🔄 New Key</button>
//                           <button onClick={()=>toggleActive(u)} className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${u.is_active?'bg-red-50 text-red-600 border-red-200 hover:bg-red-100':'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100'}`}>{u.is_active?'Disable':'Enable'}</button>
//                         </td>
//                       </tr>
//                     ))}
//                   </tbody>
//                 </table>
//               </div>
//             </div>
//           )}

//           {/* ── LIVE SESSIONS ── */}
//           {tab==='sessions' && (
//             <div className="space-y-4">
//               {/* Live feed */}
//               {liveEvents.length>0&&(
//                 <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm p-5">
//                   <h3 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
//                     <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>Real-time Events
//                   </h3>
//                   <div className="space-y-1.5 max-h-40 overflow-y-auto" ref={liveRef}>
//                     {liveEvents.map(e=>(
//                       <div key={e.id} className={`flex items-center gap-3 text-xs px-3 py-2 rounded-xl ${e.color==='emerald'?'bg-emerald-50 text-emerald-700':e.color==='amber'?'bg-amber-50 text-amber-700':e.color==='blue'?'bg-blue-50 text-blue-700':'bg-indigo-50 text-indigo-700'}`}>
//                         <span className="flex-1 font-medium">{e.msg}</span>
//                         <span className="text-[10px] opacity-60 flex-shrink-0">{e.ts}</span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}
//               {/* Sessions table */}
//               <div className="bg-white rounded-2xl border border-slate-100/80 shadow-sm overflow-hidden">
//                 <div className="px-5 py-4 border-b border-slate-100/80 flex items-center gap-3">
//                   <h3 className="text-sm font-black text-slate-800">All Work Sessions</h3>
//                   {liveCount>0&&<span className="flex items-center gap-1.5 text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>{liveCount} live</span>}
//                 </div>
//                 <div className="overflow-x-auto">
//                   <table className="w-full text-xs">
//                     <thead className="bg-slate-50/80 border-b border-slate-100"><tr>{['Ticket','Customer','Worker','Role','Started','Duration','Status'].map(h=><th key={h} className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3 whitespace-nowrap">{h}</th>)}</tr></thead>
//                     <tbody className="divide-y divide-slate-100/80">
//                       {!sessions.length
//                         ? <tr><td colSpan={7} className="text-center py-12 text-slate-400 font-medium">No sessions yet.</td></tr>
//                         : sessions.map(s=>(
//                           <tr key={s.id} className="hover:bg-slate-50/60 transition-all">
//                             <td className="px-4 py-3"><span className="font-mono text-[11px] font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-lg">{s.ticket_no}</span></td>
//                             <td className="px-4 py-3 text-slate-600 max-w-[110px] truncate">{s.customer_name}</td>
//                             <td className="px-4 py-3 font-semibold text-slate-800">{s.worker_name}</td>
//                             <td className="px-4 py-3"><span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.worker_role==='plc'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>{s.worker_role}</span></td>
//                             <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{new Date(s.started_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</td>
//                             <td className="px-4 py-3 font-black text-slate-800">{fmtH(s.total_seconds||0)}</td>
//                             <td className="px-4 py-3">
//                               <div className="flex items-center gap-1.5">
//                                 {s.status==='running'&&<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>}
//                                 <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.status==='running'?'bg-emerald-100 text-emerald-700':s.status==='paused'?'bg-amber-100 text-amber-700':'bg-slate-100 text-slate-600'}`}>{s.status}</span>
//                               </div>
//                             </td>
//                           </tr>
//                         ))}
//                     </tbody>
//                   </table>
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* ── ASSIGN MODAL ── */}
//       {assignM&&(
//         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setAssignM(null)}>
//           <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl shadow-black/20 overflow-hidden">
//             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
//               <h3 className="text-base font-black text-slate-800">Assign Workers</h3>
//               <button onClick={()=>setAssignM(null)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all">✕</button>
//             </div>
//             <div className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-slate-100 flex-wrap">
//               <span className="font-mono text-sm font-black text-indigo-600">{assignM.ticket_id}</span>
//               <span className="text-sm font-bold text-slate-700">{assignM.customer_name}</span>
//               <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ml-auto ${PR_CLR[assignM.priority]}`}>{assignM.priority}</span>
//             </div>
//             <div className="px-6 py-5 space-y-4">
//               <div><FLabel>🖥 PLC Engineer</FLabel><FSel value={aData.plc} onChange={e=>setAData(p=>({...p,plc:e.target.value}))}>
//                 <option value="">— No PLC assigned —</option>
//                 {plcW.map(w=><option key={w.id} value={w.id}>{w.name} ({w.department})</option>)}
//               </FSel></div>
//               <div><FLabel>⚡ Wireman</FLabel><FSel value={aData.wireman} onChange={e=>setAData(p=>({...p,wireman:e.target.value}))}>
//                 <option value="">— No wireman assigned —</option>
//                 {wireW.map(w=><option key={w.id} value={w.id}>{w.name} ({w.department})</option>)}
//               </FSel></div>
//               {assignM.needs_plc&&<div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs font-medium text-blue-700">ℹ️ PLC work required{assignM.plc_type?` (${assignM.plc_type})`:''}</div>}
//               {assignM.needs_wiring&&<div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 text-xs font-medium text-emerald-700">ℹ️ Wiring work required</div>}
//             </div>
//             <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
//               <button onClick={()=>setAssignM(null)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 transition-all">Cancel</button>
//               <button onClick={saveAssign} disabled={busy} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all disabled:opacity-60">Save Assignment</button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* ── KEY MODAL ── */}
//       {keyModal&&(
//         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
//           <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-8 text-center">
//             <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-5 shadow-lg shadow-indigo-200">🔑</div>
//             <h3 className="text-lg font-black text-slate-800 mb-1">New Key Generated</h3>
//             <p className="text-sm text-slate-400 mb-5">For <strong className="text-slate-700">{keyModal.name}</strong></p>
//             <div className="bg-indigo-50 border border-indigo-100 rounded-2xl py-5 mb-5">
//               <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">New Secret Key</p>
//               <p className="text-4xl font-black font-mono text-indigo-600 tracking-[8px]">{keyModal.newKey}</p>
//             </div>
//             <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">⚠️ Share this now — it won't be shown again as plaintext.</p>
//             <button onClick={()=>setKeyModal(null)} className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200/50">Got it · Key shared</button>
//           </div>
//         </div>
//       )}

//       {/* ── ADD USER MODAL ── */}
//       {addUserM&&(
//         <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setAddUserM(false)}>
//           <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
//             <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
//               <h3 className="text-base font-black text-slate-800">Add New User</h3>
//               <button onClick={()=>setAddUserM(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all">✕</button>
//             </div>
//             <div className="px-6 py-5 space-y-4">
//               <div><FLabel>Full Name *</FLabel><FInput placeholder="Worker full name" value={newUser.name} onChange={e=>setNewUser(p=>({...p,name:e.target.value}))}/></div>
//               <div><FLabel>Phone Number *</FLabel><FInput type="tel" placeholder="9876543210" value={newUser.phone} onChange={e=>setNewUser(p=>({...p,phone:e.target.value}))}/></div>
//               <div className="grid grid-cols-2 gap-3">
//                 <div><FLabel>Role *</FLabel><FSel value={newUser.role} onChange={e=>setNewUser(p=>({...p,role:e.target.value}))}>
//                   <option value="plc">PLC Engineer</option><option value="wireman">Wireman</option><option value="admin">Admin</option><option value="superadmin">Super Admin</option>
//                 </FSel></div>
//                 <div><FLabel>Department</FLabel><FInput placeholder="e.g. Operations" value={newUser.department} onChange={e=>setNewUser(p=>({...p,department:e.target.value}))}/></div>
//               </div>
//               <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-xs text-blue-700 font-medium">
//                 <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
//                 A random 6-digit secret key will be auto-generated and displayed after creation.
//               </div>
//             </div>
//             <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
//               <button onClick={()=>setAddUserM(false)} className="flex-1 py-3 border-2 border-slate-200 text-slate-600 font-semibold text-sm rounded-xl hover:border-slate-300 transition-all">Cancel</button>
//               <button onClick={addUser} disabled={busy} className="flex-1 py-3 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold text-sm rounded-xl shadow-md shadow-indigo-200/50 hover:-translate-y-0.5 transition-all disabled:opacity-60">Create User</button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }
