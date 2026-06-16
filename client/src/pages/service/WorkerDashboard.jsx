import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link , useParams, useNavigate  } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';
import { ChallanPanel, InvoiceEditor } from './ChallanInvoice';
import NotesPanel from './NotesPanel'
import ScheduledTasksTab from './ScheduledTasksTab';
import NotificationsBell from './NotificationsBell';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const fmt  = s => { const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sc=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`; };
const fmtH = s => s>=3600?`${(s/3600).toFixed(1)}h`:s>0?`${Math.round(s/60)}m`:'—';
const fmtDate = d => new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'});

const PRI = { High:'bg-red-50 text-red-600 border-red-200', Medium:'bg-amber-50 text-amber-600 border-amber-200', Low:'bg-emerald-50 text-emerald-600 border-emerald-200' };
const STA = { Open:'bg-slate-100 text-slate-500', Assigned:'bg-blue-50 text-blue-700', 'In Progress':'bg-amber-50 text-amber-700', Completed:'bg-emerald-50 text-emerald-700', Closed:'bg-slate-100 text-slate-400' };
const DONE = ['Completed','Closed'];

const PAUSE_REASONS = [
  ['Lunch Break',             'lunch_break'],
  ['Tea Break',               'tea_break'],
  ['Material Unavailable',    'material_shortage'],
  ['Material Shortage',       'material_shortage'],
  ['Waiting for Instructions','awaiting_instructions'],
  ['Site Issue',              'site_issue'],
  ['Other',                   'other'],
];

const DOC_TYPE_LABEL = {
  invoice:      'Invoice',
  job_card:     'Job Card',
  signed_proof: 'Signed Proof',
  photo:        'Photo',
  video:        'Video',
  voice:        'Voice',
  other:        'Other',
};

const I = {
  tasks:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>,
  timer:    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>,
  history:  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  search:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  bell:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  logout:   <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  plus:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
};


// const fmt = (s) => {
//   const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sc = s%60;
//   return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
// };

const ICONS = {
  tasks: (a) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="5" width="14" height="16" rx="2"/>
      <rect x="9" y="3" width="6" height="4" rx="1"/>
      <line x1="9" y1="12" x2="15" y2="12"/>
      <line x1="9" y1="16" x2="13" y2="16"/>
    </svg>
  ),
  history: (a) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={a?2.2:1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/>
      <polyline points="3 3 3 8 8 8"/>
      <polyline points="12 7 12 12 15 14"/>
    </svg>
  ),
};

function WorkerCommandBar({ items, currentTab, onTabChange, active, elapsed }) {
  const { svcLogout, can } = useSvcAuth();
  const status = active?.status; // 'running' | 'paused' | undefined
  const prevActive = useRef(active);

  // Status colors
  const statusColors = {
    running: { ring: 'emerald-500', bg: 'from-emerald-400 via-emerald-500 to-emerald-600', shadow: 'emerald-500/50', glow: 'emerald-500/40', label: 'Recording', labelColor: 'text-emerald-600' },
    paused:  { ring: 'amber-500',   bg: 'from-amber-400 via-amber-500 to-amber-600',       shadow: 'amber-500/50',   glow: 'amber-500/40',   label: 'On hold',   labelColor: 'text-amber-600' },
    idle:    { ring: 'slate-900',   bg: 'from-slate-900 via-slate-800 to-slate-900',       shadow: 'slate-900/40',   glow: 'slate-900/20',   label: 'Tap to start', labelColor: 'text-slate-500' },
  };
  const sc = statusColors[status] || statusColors.idle;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pointer-events-none"
         style={{paddingBottom:'calc(0.875rem + env(safe-area-inset-bottom))'}}>
      <div className="relative pointer-events-auto max-w-md mx-auto">

        {/* ── LIVE SESSION PANEL — When timer is running, show ticket info ── */}
        {active && (
          <div className="absolute bottom-full left-0 right-0 mb-2 cmd-expand origin-bottom">
            <div className={`cmd-glass rounded-[22px] px-4 py-3 flex items-center gap-3 relative overflow-hidden ${status==='running'?'cmd-shimmer':''}`}>

              {/* Live pulse / paused icon */}
              <div className="relative flex-shrink-0">
                {status === 'running' ? (
                  <>
                    <div className="absolute inset-0 rounded-full bg-emerald-500/40 cmd-ring"/>
                    <div className="relative w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white"/>
                  </>
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white"/>
                )}
              </div>

              {/* Ticket info + live timer */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] font-black bg-slate-900 text-white px-1.5 py-0.5 rounded">
                    {active.ticket_no}
                  </span>
                  <span className={`cmd-mono text-[13px] font-black tracking-tight ${sc.labelColor}`}>
                    {fmt(elapsed)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 font-bold mt-0.5 truncate">{active.customer_name}</p>
              </div>

              <button
                onClick={() => onTabChange('timer')}
                className={`text-[11px] font-black tracking-wide px-3 py-1.5 rounded-full transition-all active:scale-95 flex-shrink-0 ${
                  status === 'running'
                    ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30'
                    : 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
                }`}>
                Open →
              </button>
            </div>
          </div>
        )}

        {/* ── TIMER HERO BUTTON ── */}
        <button
          onClick={() => can('start_timer') ? onTabChange('timer') : null}
          className="absolute left-1/2 -translate-x-1/2 -top-9 z-10 group select-none">
          <div className="relative">

            {/* Outermost ambient glow */}
            <div className={`absolute -inset-3 rounded-full blur-2xl transition-all duration-500 bg-${sc.glow}`}/>

            {/* Pulsing rings for running state */}
            {status === 'running' && (
              <>
                <div className="absolute inset-0 rounded-full bg-emerald-400/30 cmd-ring"/>
                <div className="absolute inset-0 rounded-full bg-emerald-400/20 cmd-ring" style={{animationDelay:'0.5s'}}/>
              </>
            )}

            {/* White halo */}
            <div className="absolute -inset-1 rounded-full bg-white shadow-[0_10px_30px_rgba(15,23,42,0.18)]"/>

            {/* Main button */}
            <div className={`relative w-[68px] h-[68px] rounded-full bg-gradient-to-br ${sc.bg} flex items-center justify-center shadow-[0_10px_24px_rgba(15,23,42,0.3)] ring-[0.5px] ring-white/30 transition-transform duration-200 group-active:scale-[0.92]`}>

              {/* Top highlight */}
              <div className="absolute top-1 inset-x-3 h-4 rounded-full bg-gradient-to-b from-white/25 to-transparent blur-sm"/>

              {active ? (
                <div className="relative text-center px-1">
                  <span className="cmd-mono block text-[13px] font-black text-white tracking-tight leading-tight">
                    {fmt(elapsed).slice(0,5)}
                  </span>
                  <span className="text-[7px] font-black text-white/90 uppercase tracking-[0.2em] mt-0.5 block">
                    {status === 'running' ? '● LIVE' : '⏸ HOLD'}
                  </span>
                </div>
              ) : (
                <svg className="relative w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="9"/>
                  <polyline points="12 7 12 12 15 14" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* ── MAIN GLASS BAR ── */}
        <div className="cmd-glass rounded-[26px] overflow-hidden relative">
          <div className="absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent"/>

          <div className="relative grid grid-cols-4 items-stretch px-1.5 py-2">
            {/* Tasks */}
            <WorkerNavItem
              item={items[0]}
              active={currentTab === 'tasks'}
              onClick={() => onTabChange('tasks')}
              indicator={!!active && currentTab !== 'tasks'}
              indicatorColor={status === 'running' ? 'emerald' : status === 'paused' ? 'amber' : 'slate'}
            />
            {/* New Request */}
            <div className="flex flex-col items-center justify-center py-1.5 pr-[10vw]">
              <Link to="/service" className={`flex flex-col items-center gap-0.5 active:scale-90 transition-all ${can('upload_files') ? '' : 'opacity-40 pointer-events-none'}`}>
                <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center mb-0.5">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </div>
                <span className="text-[9px] font-black tracking-[0.12em] uppercase text-slate-400">New</span>
              </Link>
            </div>

            {/* History */}
            <WorkerNavItem
              item={items[1]}
              active={currentTab === 'history'}
              onClick={() => onTabChange('history')}
              classname={"pl-[10vw]"}
            />
            {/* Logout */}
            <div className="flex flex-col items-center justify-center py-1.5">
              <button onClick={svcLogout} className="flex flex-col items-center gap-0.5 active:scale-90 transition-all">
                <div className="w-5 h-5 text-slate-400 mb-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </div>
                <span className="text-[9px] font-black tracking-[0.12em] uppercase text-slate-400">Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}

function WorkerNavItem({ item, active, onClick, indicator, classname ,indicatorColor='slate' }) {
  const Icon = ICONS[item.icon];
  const indicatorBg = {
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    slate: 'bg-slate-400',
  }[indicatorColor] || 'bg-emerald-500';

  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-col items-center justify-center py-1.5 transition-all active:scale-90 + ${classname}`}>

      <div className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 rounded-full bg-slate-900 transition-all duration-300 ${
        active ? 'w-7 opacity-100' : 'w-0 opacity-0'
      } + ${item.k === 'history'  &&  "ml-[5vw]" }`}/>

      <div className={`relative w-5 h-5 mb-0.5 transition-all duration-300 ${
        active ? 'text-slate-900 -translate-y-0.5' : 'text-slate-400'
      }`}>
        {Icon(active)}

        {indicator && (
          <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${indicatorBg} ring-[1.5px] ring-white animate-pulse`}/>
        )}
      </div>

      <span className={`relative text-[9px] tracking-[0.12em] uppercase transition-all duration-300 ${
        active ? 'text-slate-900 font-black' : 'text-slate-400 font-bold'
      }`}>
        {item.label}
      </span>
    </button>
  );
}

function ThumbnailButton({ d, onClick, fullUrl, isImage, fileIcon }) {
  const [broken, setBroken] = useState(false);
  const showImage = isImage(d) && !broken;

  return (
    <button
      onClick={onClick}
      className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0 hover:border-blue-400 hover:ring-2 hover:ring-blue-100 transition-all"
    >
      {showImage ? (
        <img
          src={fullUrl(d.url)}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-xl">{fileIcon(d)}</span>
      )}
    </button>
  );
}

/* ─── Team progress badge — shows X/Y done ─── */
function TeamProgress({ ticketId }) {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    let cancelled = false;
    svcApi.get(`/tickets/${ticketId}/team-progress`)
      .then(r => { if (!cancelled) setProgress(r.data); })
      .catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [ticketId]);

  if (!progress) return null;
  const { total, done, pending } = progress;
  const allDone = pending === 0 && total > 0;

  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2 py-0.5 rounded-full ${
      allDone ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {allDone ? (
        <>
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          All Done
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"/>
          {done}/{total} done · {pending} pending
        </>
      )}
    </span>
  );
}

/* ─── Team member chips with per-worker status ─── */
function TeamMembers({ ticketId, plcNames, wmNames }) {
  const [statuses, setStatuses] = useState({}); // { workerName: 'completed' | 'in_progress' | 'pending' }

  useEffect(() => {
    let cancelled = false;
    svcApi.get(`/tickets/${ticketId}/team-progress`)
      .then(r => { if (!cancelled) setStatuses(r.data.byWorker || {}); })
      .catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [ticketId]);

  const chip = (n, role, idx) => {
    const status = statuses[n] || 'pending';
    const isPLC = role === 'plc';
    const colorClass =
      status === 'completed'
        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
        : status === 'in_progress'
          ? (isPLC ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200')
          : 'bg-slate-50 text-slate-500 border-slate-200 opacity-70';

    return (
      <span key={`${role}-${idx}`} className={`inline-flex items-center gap-1.5 text-[11px] font-bold border px-2.5 py-1 rounded-full transition-all ${colorClass}`}>
        {status === 'completed' ? (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        ) : status === 'in_progress' ? (
          <span className="relative flex w-2 h-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isPLC?'bg-blue-400':'bg-emerald-400'}`}/>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isPLC?'bg-blue-500':'bg-emerald-500'}`}/>
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300"/>
        )}
        <span className="text-xs">{isPLC ? '🖥' : '⚡'}</span>
        <span className={status === 'pending' ? 'line-through-pending' : ''}>{n}</span>
        {status === 'pending' && <span className="text-[9px] font-bold opacity-60">· pending</span>}
      </span>
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {plcNames?.split(', ').filter(Boolean).map((n,i) => chip(n, 'plc', i))}
      {wmNames?.split(', ').filter(Boolean).map((n,i) => chip(n, 'wireman', i))}
    </div>
  );
}

function TaskDocuments({ ticketId }) {
  const [docs, setDocs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState('challan');
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
  if (!preview) return;
  const onKey = (e) => { if (e.key === 'Escape') setPreview(null); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [preview]);

  const load = useCallback(async () => {
    try { const { data } = await svcApi.get(`/tickets/${ticketId}/documents`); setDocs(data); }
    catch (e) { console.error(e); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  // Resolve relative /uploads/... paths to the server origin
  const fullUrl = (u) => {
    if (!u) return '#';
    if (u.startsWith('http')) return u;
    const isDev = window.location.hostname === 'localhost';
    const base = isDev ? 'http://localhost:5001' : `${window.location.protocol}//${window.location.hostname}`;
    return `${base}${u}`;
  };

  const upload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append('files', f));
    fd.append('doc_type', docType);
    if (note) fd.append('note', note);
    try {
      await svcApi.post(`/tickets/${ticketId}/documents`, fd, { headers:{'Content-Type':'multipart/form-data'} });
      setNote('');
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  };

  // Classify by extension to pick the right preview viewer
  const ext = (name='') => name.split('.').pop()?.toLowerCase() || '';
  const isImage = (d) => ['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext(d.filename));
  const isVideo = (d) => ['mp4','webm','mov','avi','mkv'].includes(ext(d.filename));
  const isAudio = (d) => ['mp3','wav','ogg','m4a','webm'].includes(ext(d.filename)) || d.doc_type === 'voice';
  const isPDF   = (d) => ext(d.filename) === 'pdf';
  const canPreview = (d) => isImage(d) || isVideo(d) || isAudio(d) || isPDF(d);

  const fileIcon = (d) => {
    if (isImage(d)) return '🖼';
    if (isVideo(d)) return '🎬';
    if (isAudio(d)) return '🎤';
    if (isPDF(d))   return '📕';
    if (d.doc_type === 'challan') return '📄';
    if (d.doc_type === 'invoice') return '🧾';
    if (d.doc_type === 'job_card') return '📋';
    return '📎';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <p className="text-xs font-black text-slate-900">Documents</p>
          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{docs.length}</span>
        </div>
      </div>

      {/* Upload area */}
      <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 mb-2">
          <select value={docType} onChange={e=>setDocType(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-slate-400">
            {Object.entries(DOC_TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
          </select>
          <input type="text" placeholder="Optional note (e.g. signed by customer)" value={note} onChange={e=>setNote(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 placeholder-slate-400"/>
        </div>
        <div className="flex items-center gap-2">
          <input ref={inputRef} type="file" multiple accept="image/*,video/*,application/pdf,audio/*" onChange={e=>upload(e.target.files)} className="hidden"/>
          <button onClick={()=>inputRef.current?.click()} disabled={uploading}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60">
            {uploading
              ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Uploading…</>
              : <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Upload {DOC_TYPE_LABEL[docType]}</>}
          </button>
        </div>
      </div>

      {/* Document list */}
      {docs.length === 0 ? (
        <p className="text-center text-[11px] text-slate-400 py-3">No documents uploaded yet</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {docs.map(d => (
            <div key={d.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 hover:bg-white hover:border-slate-300 transition-all">
              {/* Thumbnail / icon */}
              {/* {isImage(d) ? (
                <button onClick={()=>canPreview(d) && setPreview(d)} className="w-12 h-12 rounded-lg bg-white border border-slate-200 overflow-hidden flex-shrink-0 hover:border-blue-400 hover:ring-2 hover:ring-blue-100 transition-all">
                  <img src={fullUrl(d.url)} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e)=>{ e.target.style.display='none'; e.target.parentElement.innerHTML='<span class="text-base">🖼</span>'; e.target.parentElement.className='w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0'; }}/>
                </button>
              ) : (
                <div className="w-12 h-12 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-xl">{fileIcon(d)}</div>
              )} */}
              <ThumbnailButton d={d} onClick={() => canPreview(d) && setPreview(d)} fullUrl={fullUrl} isImage={isImage} fileIcon={fileIcon} />

              {/* Meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    {DOC_TYPE_LABEL[d.doc_type] || d.doc_type}
                  </span>
                  {d.source === 'inquiry_form' ? (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">📋 Inquiry Form</span>
                  ) : d.uploaded_role && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      d.uploaded_role === 'plc'        ? 'bg-blue-100 text-blue-700' :
                      d.uploaded_role === 'wireman'    ? 'bg-emerald-100 text-emerald-700' :
                      d.uploaded_role === 'admin'      ? 'bg-violet-100 text-violet-700' :
                      d.uploaded_role === 'superadmin' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {d.uploaded_role === 'superadmin' ? 'super admin' : d.uploaded_role}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">{d.original_name || d.filename}</p>
                {d.note && <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">"{d.note}"</p>}
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {d.source === 'inquiry_form'
                    ? `Uploaded via inquiry${d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}`
                    : (d.uploaded_by_name || 'Unknown')}
                  {' · '}
                  {new Date(d.uploaded_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {canPreview(d) && (
                  <button onClick={()=>setPreview(d)} className="text-[11px] font-bold text-blue-600 hover:text-blue-700">View</button>
                )}
                
                 <a href={fullUrl(d.url)}
  download={d.original_name || d.filename}
  className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
  title="Download"
>
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
</a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── PREVIEW MODAL — same-page lightbox ── */}
      {preview && (
        <div
          className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in"
          onClick={(e) => e.target === e.currentTarget && setPreview(null)}
        >
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg flex-shrink-0">{fileIcon(preview)}</div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 truncate">{preview.original_name || preview.filename}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                    {DOC_TYPE_LABEL[preview.doc_type] || preview.doc_type}
                    {' · '}
                    {preview.source === 'inquiry_form'
                      ? `Inquiry form${preview.uploaded_by_name ? ` (${preview.uploaded_by_name})` : ''}`
                      : (preview.uploaded_by_name || 'Unknown')}
                    {' · '}
                    {new Date(preview.uploaded_at).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={fullUrl(preview.url)} download={preview.original_name || preview.filename}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-full hover:bg-slate-100 transition-all">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Download
                </a>
                <button onClick={() => setPreview(null)}
                  className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all"
                  title="Close (Esc)">✕</button>
              </div>
            </div>

            {/* Body — picks correct viewer for the file type */}
            <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-2 sm:p-6 min-h-0">
              {isImage(preview) && (
                <img
                  src={fullUrl(preview.url)}
                  alt={preview.original_name}
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-lg"
                />
              )}
              {isVideo(preview) && (
                <video
                  controls
                  autoPlay
                  src={fullUrl(preview.url)}
                  className="max-w-full max-h-[75vh] rounded-2xl shadow-lg bg-black"
                />
              )}
              {isAudio(preview) && (
                <div className="w-full max-w-md flex flex-col items-center gap-5 p-8">
                  <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-5xl shadow-lg">🎤</div>
                  <p className="text-sm font-bold text-slate-700 text-center">{preview.original_name || 'Voice note'}</p>
                  <audio controls autoPlay src={fullUrl(preview.url)} className="w-full"/>
                </div>
              )}
              {isPDF(preview) && (
                <iframe
                  src={fullUrl(preview.url)}
                  title={preview.original_name}
                  className="w-full h-[78vh] rounded-2xl border border-slate-200 bg-white"
                />
              )}
            </div>

            {/* Optional footer note */}
            {preview.note && (
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex-shrink-0">
                <p className="text-xs text-slate-600 italic">"{preview.note}"</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


/* ─── Complete flow — worker submits expense + completion report ─── */
function CompleteFlow({ tk, svcUser, busy, onComplete }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const billing = useBillingState(tk.id, refreshKey);

  const isWarranty = tk.warranty_status === 'in_warranty';
  const myEntry    = billing?.workers?.find(w => w.worker_id === svcUser.id);
  // A worker has finished their side once they've submitted the completion report.
  const hasCompleted = !!myEntry?.completed_at;

  // Warranty: no expense/report needed — direct complete
  if (isWarranty) {
    return (
      <button
        onClick={onComplete}
        disabled={busy}
        className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-2xl hover:bg-emerald-100 transition-all disabled:opacity-60">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        Mark Complete (Warranty)
      </button>
    );
  }

  // Already submitted report: show submitted state + file links + complete button
  const fullUrl = (u) => {
    if (!u) return '#';
    if (u.startsWith('http')) return u;
    const isDev = window.location.hostname === 'localhost';
    const base = isDev ? 'http://localhost:5001' : `${window.location.protocol}//${window.location.hostname}`;
    return `${base}${u}`;
  };
  if (hasCompleted) {
    return (
      <div className="ml-auto flex flex-col items-end gap-2">
        {/* Status badge + expense */}
        <span className="inline-flex items-center gap-1.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Report submitted{myEntry.expense_amount > 0 ? ` · exp ₹${Number(myEntry.expense_amount).toLocaleString('en-IN')}` : ''}
        </span>
        {/* File links */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {myEntry.report_url && (
            <a onClick={(e)=>{e.preventDefault();window.open(fullUrl(myEntry.report_url),"_blank");}}
               href={fullUrl(myEntry.report_url)} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Completion report
            </a>
          )}
          {myEntry.expense_file_url && (
            <a onClick={(e)=>{e.preventDefault();window.open(fullUrl(myEntry.expense_file_url),"_blank");}}
               href={fullUrl(myEntry.expense_file_url)} target="_blank" rel="noopener noreferrer"
               className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 hover:text-amber-700 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Expense proof
            </a>
          )}
        </div>
        <button
          onClick={onComplete}
          disabled={busy}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Mark Complete
        </button>
      </div>
    );
  }

  // Not yet submitted — open the completion modal
  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        disabled={busy}
        className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">
        <span>📋</span>
        Complete & Report
      </button>

      <WorkerCompletionModal
        ticket={tk}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={() => {
          setModalOpen(false);
          setRefreshKey(k => k + 1);
          setTimeout(onComplete, 300);
        }}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
/* ─── WORKER COMPLETION MODAL — expense + completion report   ─── */
/*     Worker submits their expense + uploads a completion report.  */
/*     The CHARGE is entered later by admin/superadmin.             */
/* ═══════════════════════════════════════════════════════════════ */
function WorkerCompletionModal({ ticket, open, onClose, onSuccess }) {
  const [expense,      setExpense]      = useState('');
  const [note,         setNote]         = useState('');
  const [reportFiles,  setReportFiles]  = useState([]);
  const [expenseFiles, setExpenseFiles] = useState([]);
  const [saving,       setSaving]       = useState(false);
  const reportRef  = useRef(null);
  const expenseRef = useRef(null);

  if (!open) return null;

  const numericExpense = expense === '' ? 0 : Number(expense);
  const hasExpense     = !isNaN(numericExpense) && numericExpense > 0;
  const validExpense   = !isNaN(numericExpense) && numericExpense >= 0;
  const canSubmit      = validExpense && reportFiles.length > 0 && (!hasExpense || expenseFiles.length > 0);

  const reset = () => {
    setExpense(''); setNote('');
    setReportFiles([]); setExpenseFiles([]);
    if (reportRef.current)  reportRef.current.value = '';
    if (expenseRef.current) expenseRef.current.value = '';
  };

  const handleSave = async () => {
    if (!reportFiles.length) { alert('Please attach at least one completion report.'); return; }
    if (hasExpense && !expenseFiles.length) { alert('Please attach expense proof file(s).'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      reportFiles.forEach(f => fd.append('report', f));
      fd.append('expense_amount', String(numericExpense));
      if (note) fd.append('expense_note', note);
      expenseFiles.forEach(f => fd.append('expense_file', f));
      await svcApi.post(`/tickets/${ticket.id}/worker-completion`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      onSuccess?.();
      reset();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to submit completion');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => { reset(); onClose(); };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4 animate-fade-in"
         onClick={e => e.target === e.currentTarget && handleCancel()}>
      <div className="bg-white rounded-[28px] w-full max-w-md shadow-2xl shadow-slate-900/30 overflow-hidden animate-slide-up max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-5 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xl shadow-md shadow-blue-500/20 flex-shrink-0">📋</div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-slate-900 truncate">Submit Completion</h3>
                <p className="text-[11px] text-slate-400">Expense + completion report</p>
              </div>
            </div>
            <button onClick={handleCancel} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-all flex-shrink-0">✕</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto">

          {/* Ticket info */}
          <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-2xl px-4 py-3">
            <span className="font-mono text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{ticket.ticket_id}</span>
            <span className="text-xs font-bold text-slate-700 truncate flex-1">{ticket.customer_name}</span>
          </div>

          {/* Expense input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Your Expense (₹)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-black text-slate-400 pointer-events-none">₹</span>
              <input
                type="number" min="0" step="1" inputMode="numeric"
                value={expense}
                onChange={e => setExpense(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-2xl font-black text-slate-900 outline-none focus:border-blue-400 focus:bg-white transition-all"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1.5">
              Travel, parts, or other costs you incurred. Enter 0 if none.
            </p>
          </div>

          {/* Expense note */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Note (optional)</label>
            <textarea
              rows={2} value={note} onChange={e => setNote(e.target.value)}
              placeholder="e.g. Auto fare ₹200, replacement relay ₹150"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white transition-all resize-none"
            />
          </div>

          {/* Completion report upload — multiple files */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
              Completion Report(s) * <span className="text-slate-400 font-normal normal-case">— add multiple if needed</span>
            </label>
            <input ref={reportRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="hidden"
                   onChange={e => setReportFiles(prev => [...prev, ...Array.from(e.target.files)])}/>
            {reportFiles.length === 0 ? (
              <button type="button" onClick={() => reportRef.current?.click()}
                className="w-full border-2 border-dashed border-slate-300 rounded-2xl p-5 text-center hover:border-blue-400 hover:bg-blue-50/40 transition-all">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2">
                  <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <p className="text-xs font-bold text-slate-700">Tap to attach report(s)</p>
                <p className="text-[10px] text-slate-400 mt-0.5">Photo · PDF · Doc · multiple allowed</p>
              </button>
            ) : (
              <div className="space-y-2">
                {reportFiles.map((f,i) => (
                  <div key={i} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5">
                    <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-emerald-700 truncate">{f.name}</p>
                      <p className="text-[10px] text-emerald-600">{(f.size/1024).toFixed(0)} KB</p>
                    </div>
                    <button onClick={() => setReportFiles(prev => prev.filter((_,j)=>j!==i))}
                      className="w-6 h-6 rounded-full bg-white border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center flex-shrink-0 text-xs">✕</button>
                  </div>
                ))}
                <button type="button" onClick={() => reportRef.current?.click()}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>+</span> Add another report
                </button>
              </div>
            )}
          </div>

          {/* Expense proof upload — shown only when expense > 0, multiple files */}
          {hasExpense && (
            <div className="border-2 border-amber-200 bg-amber-50/50 rounded-2xl p-4">
              <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider mb-2">
                Expense Proof * <span className="text-amber-500 font-normal normal-case">— ₹{numericExpense.toLocaleString('en-IN')} requires proof</span>
              </label>
              <input ref={expenseRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx" className="hidden"
                     onChange={e => setExpenseFiles(prev => [...prev, ...Array.from(e.target.files)])}/>
              {expenseFiles.length === 0 ? (
                <button type="button" onClick={() => expenseRef.current?.click()}
                  className="w-full border-2 border-dashed border-amber-300 rounded-xl p-4 text-center hover:border-amber-400 hover:bg-amber-50 transition-all">
                  <p className="text-xs font-bold text-amber-700">Tap to attach expense proof</p>
                  <p className="text-[10px] text-amber-500 mt-0.5">Receipt · Invoice · Photo</p>
                </button>
              ) : (
                <div className="space-y-2">
                  {expenseFiles.map((f,i) => (
                    <div key={i} className="flex items-center gap-3 bg-white border border-amber-200 rounded-xl px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                      <span className="text-xs font-bold text-amber-700 truncate flex-1">{f.name}</span>
                      <span className="text-[10px] text-amber-500">{(f.size/1024).toFixed(0)}KB</span>
                      <button onClick={() => setExpenseFiles(prev => prev.filter((_,j)=>j!==i))}
                        className="w-5 h-5 rounded-full bg-white border border-red-200 text-red-400 text-xs flex items-center justify-center">✕</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => expenseRef.current?.click()}
                    className="text-[11px] font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1">
                    <span>+</span> Add another proof
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Info banner */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
              This completes your part. Admin will enter the customer charge afterward.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 sm:px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button onClick={handleCancel} disabled={saving}
            className="flex-1 py-3 border border-slate-200 text-slate-600 font-semibold text-sm rounded-2xl hover:bg-slate-50 transition-all disabled:opacity-60">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || !canSubmit}
            className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Submitting…' : 'Submit & Complete →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Per-ticket billing state hook ─── */
function useBillingState(ticketId, refreshKey) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!ticketId) return;
    let cancelled = false;
    svcApi.get(`/tickets/${ticketId}/billing-status`)
      .then(r => { if (!cancelled) setState(r.data); })
      .catch(e => console.error(e));
    return () => { cancelled = true; };
  }, [ticketId, refreshKey]);
  return state;
}


/* ─── Per-card timer controls — independent per ticket ─── */
function CardTimerControls({ tk, sessions, elapsed, busy, startTimer, onPause, onResume, onStop, fmt }) {
  const sess = sessions[tk.id];
  if (!sess) {
    return (
      <button onClick={()=>startTimer(tk.id, !tk.is_assigned_to_me)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Start Timer
      </button>
    );
  }
  const running = sess.status === 'running';
  return (
    <>
      <div className="font-mono text-lg font-black text-slate-900 tabular-nums min-w-[90px]">{fmt(elapsed[tk.id]||0)}</div>
      {running
        ? <button onClick={()=>onPause(tk.id)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause</button>
        : <button onClick={()=>onResume(tk.id)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Resume</button>}
      <button onClick={()=>onStop(tk.id)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Stop</button>
    </>
  );
}

/* ─── Session list — used by Timer tab and right rail ─── */
function SessionList({ sessions, elapsed, busy, onPause, onResume, onStop, fmt, emptyHint }) {
  const arr = Object.values(sessions);
  if (arr.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-4">
          <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
        </div>
        <p className="text-sm font-bold text-slate-500">{emptyHint || 'No active timers'}</p>
      </div>
    );
  }

  // progress ring fills over a 1-hour visual cycle (purely decorative)
  const R = 23, C = 2 * Math.PI * R;
  const ring = (secs) => C * (1 - Math.min((secs % 3600) / 3600, 1));

  return (
    <div className="space-y-2.5">
      {arr.sort((a,b)=>new Date(b.started_at)-new Date(a.started_at)).map(s => {
        const tid = s.svc_ticket_id;
        const running = s.status === 'running';
        const secs = elapsed[tid] || 0;
        const accent  = running ? '#1D9E75' : '#EF9F27';
        return (
          <div key={s.id}
            className="flex items-center gap-4 bg-white rounded-2xl border border-slate-200/70 px-4 py-3.5"
            style={{ borderLeft: `3px solid ${accent}` }}>

            {/* progress ring */}
            <div className="relative w-[52px] h-[52px] flex-shrink-0">
              <svg width="52" height="52" viewBox="0 0 52 52" className="-rotate-90">
                <circle cx="26" cy="26" r={R} fill="none" stroke="#e2e8f0" strokeWidth="3"/>
                <circle cx="26" cy="26" r={R} fill="none" stroke={accent} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={C} strokeDashoffset={ring(secs)} style={{transition:'stroke-dashoffset 1s linear'}}/>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {running
                  ? <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background:accent}}/>
                  : <svg className="w-3.5 h-3.5" style={{color:accent}} fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>}
              </div>
            </div>

            {/* meta + time */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md">{s.ticket_no}</span>
                <span className="text-sm font-bold text-slate-800 truncate">{s.customer_name}</span>
                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${running?'bg-emerald-50 text-emerald-700':'bg-amber-50 text-amber-700'}`}>
                  <span className={`w-1 h-1 rounded-full ${running?'bg-emerald-500':'bg-amber-500'}`}/>{s.status}
                </span>
              </div>
              <div className={`font-mono text-2xl font-black tabular-nums leading-none tracking-tight ${running?'text-slate-900':'text-slate-400'}`}>{fmt(secs)}</div>
              <p className="text-[10px] text-slate-400 capitalize mt-1">{s.service_type?.replace(/_/g,' ')}</p>
            </div>

            {/* controls — icon only */}
            <div className="flex gap-1.5 flex-shrink-0">
              {running
                ? <button onClick={()=>onPause(tid)} disabled={busy} title="Pause"
                    className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 hover:bg-amber-100 flex items-center justify-center transition-all disabled:opacity-60">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  </button>
                : <button onClick={()=>onResume(tid)} disabled={busy} title="Resume"
                    className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100 flex items-center justify-center transition-all disabled:opacity-60">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="6,4 20,12 6,20"/></svg>
                  </button>}
              <button onClick={()=>onStop(tid)} disabled={busy} title="Stop"
                className="w-9 h-9 rounded-xl bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 flex items-center justify-center transition-all disabled:opacity-60">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}



/* ═══════════════════════════════════════════════════════════════ */
export default function WorkerDashboard() {
  const { svcUser, svcLogout, can, permissions } = useSvcAuth();
  // const [tab,       setTab]       = useState('tasks');
    const navigate = useNavigate();
  const { tab: urlTab } = useParams();

  const VALID_TABS = ['tasks','timer','history'];
  const tab = VALID_TABS.includes(urlTab) ? urlTab : 'tasks';
  const setTab = (newTab) => navigate(`/service/worker/${newTab}`);
  const [tickets,   setTickets]   = useState([]);
  const [taskFilter,    setTaskFilter]    = useState('All');
  const [taskDateFrom,  setTaskDateFrom]  = useState('');
  const [taskDateTo,    setTaskDateTo]    = useState('');
  const [history,   setHistory]   = useState([]);
const [sessions,  setSessions]  = useState({});   // ticketId -> session object (running|paused)
  const [elapsed,   setElapsed]   = useState({});   // ticketId -> seconds
  const [openId,    setOpenId]    = useState(null);
  // const [pauseM,    setPauseM]    = useState(false);
  const [pauseTicketId, setPauseTicketId] = useState(null);   // which ticket's pause modal is open
  const [reason,    setReason]    = useState('');
  const [reasonCat, setReasonCat] = useState('other');
  const [busy,      setBusy]      = useState(false);
  const tick = useRef(null);

  useSocket({ 'ticket:assigned': () => { loadTickets(); } });

  const loadTickets = useCallback(async () => { try { const{data}=await svcApi.get('/tickets/my'); setTickets(data); } catch(e){console.error(e);} }, []);
  const loadHistory = useCallback(async () => { try { const{data}=await svcApi.get('/sessions/my'); setHistory(data); } catch(e){console.error(e);} }, []);
  const loadActive  = useCallback(async () => {
    try {
      const { data } = await svcApi.get('/sessions/active');   // array now
      const arr = Array.isArray(data) ? data : (data ? [data] : []);
      const byTicket = {};
      const el = {};
      for (const s of arr) {
        byTicket[s.svc_ticket_id] = s;
        el[s.svc_ticket_id] = s.status === 'running'
          ? (s.total_seconds || 0) + Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)
          : (s.total_seconds || 0);
      }
      setSessions(byTicket);
      setElapsed(el);
    } catch(e){ console.error(e); }
  }, []);

  useEffect(() => { loadTickets(); loadHistory(); loadActive(); }, []); /* mount only */
  // One interval ticks every RUNNING session each second; paused ones hold.
  useEffect(() => {
    const anyRunning = Object.values(sessions).some(s => s?.status === 'running');
    if (!anyRunning) {
      if (tick.current) { clearInterval(tick.current); tick.current = null; }
      return;
    }
    if (tick.current) clearInterval(tick.current);
    tick.current = setInterval(() => {
      setElapsed(prev => {
        const next = { ...prev };
        for (const tid in sessions) {
          if (sessions[tid]?.status === 'running') next[tid] = (next[tid] || 0) + 1;
        }
        return next;
      });
    }, 1000);
    return () => { clearInterval(tick.current); tick.current = null; };
  }, [sessions]);

// PLC type modal state
  const [plcModalTicket, setPlcModalTicket] = useState(null); // {id, needsAssign}

  const startTimer = (id, needsAssign=false) => {
    // Only show PLC type modal for PLC workers
    console.log('[startTimer] svcUser.role:', svcUser?.role, 'isPLC:', svcUser?.role === 'plc');
    if (svcUser?.role === 'plc') {
      setPlcModalTicket({ id, needsAssign });
    } else {
      // Wireman and others start directly as onsite
      confirmStartTimer('onsite', id, needsAssign);
    }
  };

  const confirmStartTimer = async (plcType, directId=null, directNeedsAssign=false) => {
    const id = directId || plcModalTicket?.id;
    const needsAssign = directId ? directNeedsAssign : plcModalTicket?.needsAssign;
    if (!id) return;
    setPlcModalTicket(null);
    setBusy(true);
    try {
      if (needsAssign) { await svcApi.post(`/tickets/${id}/self-assign`).catch(()=>{}); }
      await svcApi.post('/sessions/start', { ticket_id: id, plc_type: plcType });
      await loadActive(); await loadTickets();
    }
    catch(e){ alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  // Which ticket's pause modal is open (null = closed). Replaces the old boolean PauseTicketId.
  const pauseTimer = async () => {
    if (!pauseTicketId) return;
    if (!reason.trim()) { alert('Please enter a reason'); return; }
    const sess = sessions[pauseTicketId];
    if (!sess) { setPauseTicketId(null); return; }
    setBusy(true);
    try {
      await svcApi.post(`/sessions/${sess.id}/pause`, { reason, reason_category: reasonCat });
      setPauseTicketId(null); setReason(''); setReasonCat('other');
      await loadActive();
    } catch(e){ alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const resumeTimer = async (ticketId) => {
    const sess = sessions[ticketId];
    if (!sess) return;
    setBusy(true);
    try { await svcApi.post(`/sessions/${sess.id}/resume`); await loadActive(); }
    catch(e){ alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const stopTimer = async (ticketId) => {
    const sess = sessions[ticketId];
    if (!sess) return;
    if (!window.confirm('Complete this session?')) return;
    setBusy(true);
    try {
      await svcApi.post(`/sessions/${sess.id}/stop`);
      await loadActive(); await loadTickets(); await loadHistory();
    } catch(e){ alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const completeTask = async (id) => {
    if (!window.confirm('Mark your work complete?')) return;
    setBusy(true);
    try { await svcApi.patch(`/tickets/${id}/complete`); await loadActive(); await loadTickets(); await loadHistory(); }
    catch(e){ alert(e.response?.data?.error || 'Failed'); }
    finally { setBusy(false); }
  };

  const av    = svcUser?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'??';
  const isPLC = svcUser?.role==='plc';
  const totalWorked = history.reduce((a,s)=>a+(s.total_seconds||0),0);
  const DONE_STATUSES = ['Completed','Closed','Report Submitted'];
  const dateFilterTickets = (arr) => arr.filter(t => {
    if (!taskDateFrom && !taskDateTo) return true;
    const isDone = DONE_STATUSES.includes(t.status);
    const d = (isDone ? t.updated_at : t.created_at)?.slice(0,10) || '';
    if (taskDateFrom && d < taskDateFrom) return false;
    if (taskDateTo   && d > taskDateTo)   return false;
    return true;
  });
  const dft = dateFilterTickets(tickets);
  const counts = { total:dft.length, pending:dft.filter(t=>['Open','Assigned'].includes(t.status)).length, active:dft.filter(t=>t.status==='In Progress').length, done:dft.filter(t=>DONE_STATUSES.includes(t.status)).length };

  // Build 7-day chart data from history using daily_seconds for accuracy
  const chartData = (() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      let total = 0;
      let sessionCount = 0;
      for (const h of history) {
        const daily = h.daily_seconds;
        if (daily && typeof daily === 'object' && daily[key] !== undefined) {
          total += daily[key];
          sessionCount += 1;
        } else if (!daily || Object.keys(daily).length === 0) {
          // Fallback for old sessions without daily_seconds
          if (String(h.started_at||h.created_at).slice(0,10) === key) {
            total += h.total_seconds || 0;
            sessionCount += 1;
          }
        }
      }
      days.push({ day: d.toLocaleDateString('en-IN',{weekday:'short'}), Hours: +(total/3600).toFixed(1), Sessions: sessionCount });
    }
    return days;
  })();

  const NAV = [
    {k:'tasks',   icon:I.tasks,   label:'My Tasks'},
    {k:'timer',   icon:I.timer,   label:'Timer'},
    {k:'history', icon:I.history, label:'History'},
  ];

  return (
    <div className="flex h-screen bg-[#F5F6F8] font-sans overflow-hidden pb-24 md:pb-7">

      {/* ════════════ LEFT ICON RAIL ════════════ */}
      <aside className="hidden md:flex w-16 bg-white border-r border-slate-200/60 flex-col items-center py-5 gap-1 flex-shrink-0 z-20">
      {/* <aside className="w-16 bg-white border-r border-slate-200/60 flex flex-col items-center py-5 gap-1 flex-shrink-0 z-20"> */}
        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-4 shadow-lg shadow-slate-900/15">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        
        {NAV.map(({k,icon,label})=>(
          <button key={k} onClick={()=>setTab(k)} title={label}
            className={`group relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${tab===k?'bg-slate-900 text-white':'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <span className="w-4 h-4">{icon}</span>
            {k==='tasks' && Object.keys(sessions).length > 0 && tab!=='tasks' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>}
            {/* {k==='tasks' && active && tab!=='tasks' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>} */}
            <span className="absolute left-full ml-3 px-2.5 py-1 bg-slate-900 text-white text-[11px] font-bold rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-30 shadow-xl">{label}</span>
          </button>
        ))}
        <button onClick={svcLogout} className="mt-auto w-11 h-11 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all" title="Sign Out">
          <span className="w-4 h-4">{I.logout}</span>
        </button>
      </aside>

      {/* ════════════ MAIN AREA ════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Topbar */}
        <header className="bg-white border-b border-slate-200/60 px-6 lg:px-8 h-14 flex items-center gap-4 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 flex-1 max-w-md bg-slate-50 rounded-full px-4 py-1.5 border border-slate-200/60 focus-within:border-slate-400 focus-within:bg-white transition-all">
            <span className="w-3.5 h-3.5 text-slate-400">{I.search}</span>
            <input placeholder="Search tickets, customers..." className="flex-1 bg-transparent text-sm outline-none placeholder-slate-400"/>
            <kbd className="hidden lg:block text-[10px] text-slate-400 bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono">⌘K</kbd>
          </div>

          <Link to="/service" className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-full transition-all">
                      <span className="w-3 h-3">{I.plus}</span>New Request
                    </Link>
                    
          <div className="flex items-center gap-2 ml-auto">
            {Object.keys(sessions).length > 0 && (
              <button onClick={()=>setTab('timer')} className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border bg-emerald-50 border-emerald-200 hover:bg-emerald-100 transition-all">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/>
                <span className="text-xs font-black text-emerald-700">{Object.values(sessions).filter(s=>s.status==='running').length} running</span>
              </button>
            )}
            {/* {active && (
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border ${active.status==='running'?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active.status==='running'?'bg-emerald-500 animate-pulse':'bg-amber-500'}`}/>
                <span className={`font-mono text-xs font-black tabular-nums ${active.status==='running'?'text-emerald-700':'text-amber-700'}`}>{fmt(elapsed)}</span>
              </div>
            )} */}
            <button className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all relative">
              {/* <span className="w-3.5 h-3.5">{I.bell}</span>
              {tickets.filter(t=>t.status==='Assigned').length>0&&<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"/>} */}
              <NotificationsBell/>
            </button>

            {/* <button onClick={svcLogout} className="md:hidden w-9 h-9 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-500 hover:bg-red-50 hover:text-red-500 transition-all" title="Sign Out">
  <span className="w-3.5 h-3.5">{I.logout}</span>
</button> */}
<div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${isPLC?'bg-gradient-to-br from-blue-500 to-indigo-600':'bg-gradient-to-br from-emerald-500 to-green-600'} ring-2 ring-white shadow ml-1`}>{av}</div>
            {/* <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${isPLC?'bg-gradient-to-br from-blue-500 to-indigo-600':'bg-gradient-to-br from-emerald-500 to-green-600'} ring-2 ring-white shadow ml-1`}>{av}</div> */}
          </div>
        </header>

        {/* Page title */}
        <div className="bg-white border-b border-slate-200/60 px-6 lg:px-8 py-5 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center">
            <span className="w-3 h-3 rounded-full border-2 border-white"/>
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {tab==='tasks'?`Welcome back, ${svcUser?.name?.split(' ')[0]}`:tab==='timer'?'Work Timer':'Work History'}
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {tab==='tasks'?<>You have <span className="text-blue-600 font-bold">{counts.pending} pending tasks</span> · {counts.active} in progress</>:'Cess Engineering · Field Operations'}
            </p>
          </div>
          <span className="hidden md:block text-[11px] text-slate-400 font-bold">{new Date().toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}</span>
        </div>

        {/* ──── CONTENT ──── */}
        <div className="flex-1 overflow-y-auto p-5 lg:p-7 space-y-5">

          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="md:col-span-1 bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
              <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
              <p className="text-xs font-medium text-slate-400 mb-1.5 relative">Total Worked</p>
              <p className="text-3xl font-black relative">{fmtH(totalWorked)}</p>
              <p className="text-[11px] text-slate-500 mt-1 relative">All sessions</p>
            </div>
            {[['Total Assigned',counts.total,'border-slate-200','text-slate-900'],['Pending',counts.pending,'border-slate-200','text-amber-600'],['In Progress',counts.active,'border-slate-200','text-blue-600'],['Completed',counts.done,'border-slate-200','text-emerald-600']].map(([l,v,bc,tc])=>(
              <div key={l} className={`bg-white rounded-3xl p-5 border ${bc} hover:shadow-sm transition-all`}>
                <div className="flex items-start justify-between mb-2">
                  <p className="text-xs font-medium text-slate-500">{l}</p>
                </div>
                <p className={`text-3xl font-black ${tc}`}>{v}</p>
                <p className="text-[11px] text-slate-400 mt-1">{l==='Completed'?'this period':'tickets'}</p>
              </div>
            ))}
          </div>

          {/* ──────────── TASKS TAB ──────────── */}
          {tab === 'tasks' && (
            <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-5">

              {/* LEFT — tasks list */}
              <div className="space-y-4 min-w-0">
                <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                      <div>
                        <h3 className="text-sm font-black text-slate-900">Assigned Tasks</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{tickets.length} total · click any task to open</p>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {[
                          {label:'Today',      fn:()=>{const t=new Date().toISOString().slice(0,10);setTaskDateFrom(t);setTaskDateTo(t);}},
                          {label:'This Week',  fn:()=>{const now=new Date();const mon=new Date(now);mon.setDate(now.getDate()-now.getDay()+1);setTaskDateFrom(mon.toISOString().slice(0,10));setTaskDateTo(now.toISOString().slice(0,10));}},
                          {label:'This Month', fn:()=>{const now=new Date();setTaskDateFrom(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`);setTaskDateTo(now.toISOString().slice(0,10));}},
                          {label:'All',        fn:()=>{setTaskDateFrom('');setTaskDateTo('');}},
                        ].map(b=>(
                          <button key={b.label} onClick={b.fn}
                            className={`px-3 py-1 text-[10px] font-bold rounded-full border transition-all ${b.label==='All'&&!taskDateFrom&&!taskDateTo?'bg-slate-900 text-white border-slate-900':'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-900 hover:text-white hover:border-slate-900'}`}>
                            {b.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Range</span>
                      <input type="date" value={taskDateFrom} onChange={e=>setTaskDateFrom(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
                      <span className="text-slate-300 text-xs">→</span>
                      <input type="date" value={taskDateTo} onChange={e=>setTaskDateTo(e.target.value)} className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 text-slate-700"/>
                      {(taskDateFrom||taskDateTo)&&<button onClick={()=>{setTaskDateFrom('');setTaskDateTo('');}} className="text-[10px] font-bold text-slate-400 hover:text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-100">✕ Clear</button>}
                    </div>
                  </div>
                  {/* Status filter tabs */}
                  <div className="px-3 py-2 border-b border-slate-100 overflow-x-auto scrollbar-hide">
                    <div className="flex items-center gap-1.5 min-w-max">
                      {[
                        { k:'All',           label:'All',         count: tickets.length,                                                              dot:'bg-slate-400' },
                        { k:'Pending',       label:'Pending',     count: tickets.filter(t=>['Open','Assigned'].includes(t.status)).length,           dot:'bg-amber-400' },
                        { k:'In Progress',   label:'In Progress', count: tickets.filter(t=>t.status==='In Progress').length,                          dot:'bg-blue-500'  },
                        { k:'Completed',     label:'Completed',   count: tickets.filter(t=>['Completed','Closed','Report Submitted'].includes(t.status)).length, dot:'bg-emerald-500' },
                      ].map(t => (
                        <button key={t.k} onClick={()=>setTaskFilter(t.k)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold transition-all whitespace-nowrap ${
                            taskFilter===t.k
                              ? 'bg-slate-900 text-white'
                              : 'bg-slate-50 text-slate-600 border border-slate-200 hover:border-slate-400'
                          }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${taskFilter===t.k?'bg-white':t.dot}`}/>
                          {t.label}
                          <span className={`text-[10px] font-black px-1.5 py-0 rounded ${taskFilter===t.k?'bg-white/20':'bg-white border border-slate-200 text-slate-700'}`}>{t.count}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  {(() => {
                    const dateFiltered = tickets.filter(t => {
                      if (!taskDateFrom && !taskDateTo) return true;
                      // For completed/closed tickets, filter by updated_at (when they finished)
                      // For active tickets, filter by created_at
                      const isDone = ['Completed','Closed','Report Submitted'].includes(t.status);
                      const d = (isDone ? t.updated_at : t.created_at)?.slice(0,10) || '';
                      if (taskDateFrom && d < taskDateFrom) return false;
                      if (taskDateTo   && d > taskDateTo)   return false;
                      return true;
                    });
                    const filtered =
                      taskFilter === 'Pending'       ? dateFiltered.filter(t=>['Open','Assigned'].includes(t.status)) :
                      taskFilter === 'In Progress'   ? dateFiltered.filter(t=>t.status==='In Progress') :
                      taskFilter === 'Completed'     ? dateFiltered.filter(t=>['Completed','Closed','Report Submitted'].includes(t.status)) :
                      dateFiltered;

                    if (!tickets.length) return (
                      <div className="text-center py-16">
                        <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📋</div>
                        <p className="text-slate-500 font-bold text-sm">No tasks assigned yet</p>
                        <p className="text-slate-400 text-xs mt-1">Check back after an admin assigns a ticket</p>
                      </div>
                    );
                    if (!filtered.length) return (
                      <div className="text-center py-12">
                        <p className="text-slate-500 font-bold text-sm">Nothing in "{taskFilter}"</p>
                        <p className="text-slate-400 text-xs mt-1">Try another tab</p>
                      </div>
                    );

                    // Group tickets by date
                    const groupByDate = (tks) => {
                      const groups = {};
                      tks.forEach(tk => {
                        const d = new Date(tk.created_at);
                        const key = d.toDateString();
                        if (!groups[key]) groups[key] = { label: (() => {
                          const today = new Date().toDateString();
                          const yesterday = new Date(Date.now()-86400000).toDateString();
                          if (key===today) return 'Today';
                          if (key===yesterday) return 'Yesterday';
                          return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
                        })(), tickets: [] };
                        groups[key].tickets.push(tk);
                      });
                      return Object.values(groups);
                    };
                    const dateGroups = groupByDate(filtered);

                    return (
                      <div className="divide-y divide-slate-100">
                        {dateGroups.map(group => (
                          <div key={group.label}>
                            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50/80 sticky top-0 z-10">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{group.label}</span>
                              <div className="flex-1 h-px bg-slate-200"/>
                              <span className="text-[10px] font-bold text-slate-400">{group.tickets.length} task{group.tickets.length!==1?'s':''}</span>
                            </div>
                            {group.tickets.map(tk=>{
                          const isDone = DONE.includes(tk.status);
                          const isOpen = openId===tk.id;
                          const mySess = sessions[tk.id];
                          const isMe   = !!mySess;
                          return (
                            <div key={tk.id} className={`transition-all ${isDone?'opacity-60':''} ${isOpen?'bg-blue-50/30':''}`}>
                              {/* <div onClick={()=>setOpenId(isOpen?null:tk.id)} className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/60 transition-all"> */}
                              <Link to={`/service/worker/tickets/${tk.ticket_id}`} className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/60 transition-all no-underline text-inherit">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDone?'bg-emerald-400':tk.status==='In Progress'?'bg-amber-400':tk.status==='Assigned'?'bg-blue-400':'bg-slate-300'}`}/>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{tk.ticket_id}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRI[tk.priority]}`}>{tk.priority}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STA[tk.status]}`}>{tk.status}</span>
                                    {tk.warranty_status==='out_of_warranty' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠ OOW</span>}
                                    {isMe && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${mySess.status==='running'?'bg-emerald-100 text-emerald-700 animate-pulse':'bg-amber-100 text-amber-700'}`}>⏱ {fmt(elapsed[tk.id]||0)}</span>}
                                  </div>
                                  <p className="text-sm font-bold text-slate-800 truncate">{tk.customer_name}</p>
                                  <p className="text-[11px] text-slate-400 capitalize">{tk.service_type?.replace(/_/g,' ')} · {fmtDate(tk.created_at)}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {tk.total_worked_secs>0&&<span className="hidden sm:block text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{fmtH(+tk.total_worked_secs)}</span>}
                                  {/* <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg> */}
                                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                              </Link>

                             
                            </div>
                          );
                        })}
                        </div>
                      ))}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* RIGHT — widget rail */}
              <aside className="space-y-4">
                {Object.keys(sessions).length > 0 ? (
                  <div className="bg-white rounded-3xl border border-slate-200/60 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-black text-slate-900">Active Timers</h3>
                      <span className="text-[10px] font-bold text-slate-400">{Object.keys(sessions).length}</span>
                    </div>
                    <SessionList
                      sessions={sessions} elapsed={elapsed} busy={busy}
                      onPause={(id)=>setPauseTicketId(id)} onResume={resumeTimer} onStop={stopTimer}
                      fmt={fmt} emptyHint="No active timers"
                    />
                  </div>
                ) : (
                  <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
                    <p className="text-sm font-black mb-1 relative">No active session</p>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4 relative">Open a ticket and tap "Start Timer" to begin tracking your work.</p>
                    <button onClick={()=>setTab('timer')} className="px-3.5 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-full hover:bg-slate-100 transition-all relative">View Timers →</button>
                  </div>
                )}
                {/* {active ? (
                  <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-emerald-500/30 blur-2xl"/>
                    <div className="flex items-center justify-between mb-3 relative">
                      <h3 className="text-sm font-black">Active Session</h3>
                      <span className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${active.status==='running'?'bg-emerald-500/20 text-emerald-300':'bg-amber-500/20 text-amber-300'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${active.status==='running'?'bg-emerald-400 animate-pulse':'bg-amber-400'}`}/>{active.status}
                      </span>
                    </div>
                    <p className="font-mono text-4xl font-black tabular-nums relative">{fmt(elapsed)}</p>
                    <p className="text-xs text-slate-400 mt-2 relative">{active.ticket_no} · {active.customer_name}</p>
                    <div className="flex gap-2 mt-4 relative">
                      {active.status==='running'
                        ? <button onClick={()=>setPauseM(true)} disabled={busy} className="flex-1 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-all">⏸ Pause</button>
                        : <button onClick={resumeTimer} disabled={busy} className="flex-1 py-2 bg-white/10 hover:bg-white/15 text-white text-xs font-bold rounded-xl transition-all">▶ Resume</button>}
                      <button onClick={stopTimer} disabled={busy} className="flex-1 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition-all">⏹ Complete</button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900 rounded-3xl p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-blue-500/30 blur-2xl"/>
                    <p className="text-sm font-black mb-1 relative">No active session</p>
                    <p className="text-xs text-slate-400 leading-relaxed mb-4 relative">Open a ticket and tap "Start Timer" to begin tracking your work.</p>
                    <button onClick={()=>setTab('timer')} className="px-3.5 py-1.5 bg-white text-slate-900 text-xs font-bold rounded-full hover:bg-slate-100 transition-all relative">View Timer →</button>
                  </div>
                )} */}

                <div className="bg-white rounded-3xl border border-slate-200/60 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-black text-slate-900">Last 7 days</h3>
                    <span className="text-[10px] font-bold text-slate-400">{fmtH(totalWorked)} total</span>
                  </div>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={chartData} margin={{top:5,right:0,left:-25,bottom:0}}>
                      <defs>
                        <linearGradient id="wHrs" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#1e293b" stopOpacity={1}/>
                          <stop offset="100%" stopColor="#1e293b" stopOpacity={0.3}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                      <XAxis dataKey="day" tick={{fontSize:9,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
                      <YAxis hide/>
                      <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
                      <Bar dataKey="Hours" fill="url(#wHrs)" radius={[4,4,0,0]} maxBarSize={20}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200/60 p-5">
                  <h3 className="text-sm font-black text-slate-900 mb-4">Today's Summary</h3>
                  <div className="space-y-3">
                    {[['📋','Tasks',counts.total,'bg-slate-100'],['⚡','Pending',counts.pending,'bg-amber-100'],['✓','Completed',counts.done,'bg-emerald-100']].map(([ic,l,v,bg])=>(
                      <div key={l} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center text-sm`}>{ic}</div>
                        <p className="flex-1 text-xs font-bold text-slate-800">{l}</p>
                        <span className="text-sm font-black text-slate-900">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}

          {/* ──────────── TIMER TAB ──────────── */}
          {tab === 'timer' && (
            <div className="bg-white rounded-3xl border border-slate-200/60 p-5 lg:p-6">
              <div className="mb-4">
                <h3 className="text-sm font-black text-slate-900">Active Timers</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{Object.keys(sessions).length} running/paused · all tracked independently</p>
              </div>
              <SessionList
                sessions={sessions} elapsed={elapsed} busy={busy}
                onPause={(id)=>setPauseTicketId(id)} onResume={resumeTimer} onStop={stopTimer}
                fmt={fmt} emptyHint="No active timers — start one from My Tasks"
              />
            </div>
          )}
  
          {/* ──────────── HISTORY TAB ──────────── */}
          {tab === 'history' && (
            <div className="space-y-4">
              <div className="bg-white rounded-3xl border border-slate-200/60 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Work Activity</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Hours logged per day · last 7 days</p>
                  </div>
                  <span className="text-[11px] text-slate-400 font-bold">{fmtH(totalWorked)} total</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{top:5,right:5,left:-20,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#e2e8f0" vertical={false}/>
                    <XAxis dataKey="day" tick={{fontSize:10,fill:'#94a3b8',fontWeight:600}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                    <Tooltip contentStyle={{backgroundColor:'#0f172a',border:'none',borderRadius:'12px',fontSize:'11px'}} labelStyle={{color:'#fff',fontWeight:700}} itemStyle={{color:'#fff'}}/>
                    <Line type="monotone" dataKey="Hours" stroke="#1e293b" strokeWidth={2.5} dot={{r:0}} activeDot={{r:5}}/>
                    <Line type="monotone" dataKey="Sessions" stroke="#3b82f6" strokeWidth={2} dot={{r:0}} activeDot={{r:5,fill:'#3b82f6'}} strokeDasharray="4 4"/>
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-5 pt-3 mt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-slate-900"/><span className="text-[11px] font-bold text-slate-700">Hours</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"/><span className="text-[11px] font-bold text-slate-700">Sessions</span></div>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">Session History</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{history.length} total sessions</p>
                  </div>
                </div>
                {!history.length
                  ? <div className="text-center py-12 text-slate-400"><p>No history yet</p></div>
                  : <div className="divide-y divide-slate-100">
                      {history.map(h=>(
                        <div key={h.id} className="flex items-start justify-between px-6 py-4 hover:bg-slate-50/60 transition-all gap-4">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{h.ticket_no}</span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${h.status==='completed'?'bg-emerald-100 text-emerald-700':h.status==='running'?'bg-amber-100 text-amber-600':'bg-slate-100 text-slate-500'}`}>{h.status}</span>
                            </div>
                            <p className="text-sm font-bold text-slate-800 truncate">{h.customer_name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 capitalize">{h.service_type?.replace(/_/g,' ')} · {fmtDate(h.created_at)}</p>
                            {h.pauses?.length>0 && <p className="text-[10px] text-slate-400 mt-1.5 italic">Paused {h.pauses.length}×: {h.pauses.slice(0,2).map(p=>p.reason).join(', ')}{h.pauses.length>2?'…':''}</p>}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-xl font-black text-slate-900">{fmtH(h.total_seconds||0)}</p>
                          </div>
                        </div>
                      ))}
                    </div>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PLC TYPE SELECTION MODAL ── */}
  {plcModalTicket && (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center px-4" style={{zIndex:99999}}>
      <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl p-6" style={{position:'relative',zIndex:100000}}>
        <h3 className="text-base font-black text-slate-900 mb-1">Select Work Type</h3>
        <p className="text-xs text-slate-400 mb-6">How are you working on this ticket?</p>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <button
            onClick={() => confirmStartTimer('onsite', null, false)}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 hover:border-slate-900 hover:bg-slate-50 transition-all group">
            <span className="text-3xl">🏢</span>
            <div className="text-center">
              <div className="text-sm font-black text-slate-900">On-site</div>
              <div className="text-xs text-slate-400 mt-0.5">At customer location</div>
            </div>
          </button>
          <button
            onClick={() => confirmStartTimer('remote', null, false)}
            className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 hover:border-blue-500 hover:bg-blue-50 transition-all group">
            <span className="text-3xl">💻</span>
            <div className="text-center">
              <div className="text-sm font-black text-slate-900">Remote</div>
              <div className="text-xs text-slate-400 mt-0.5">Working remotely</div>
            </div>
          </button>
        </div>
        <button
          onClick={() => setPlcModalTicket(null)}
          className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 font-medium">
          Cancel
        </button>
      </div>
    </div>
  )}

    {/* ── PAUSE MODAL ── */}
      {pauseTicketId && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setPauseTicketId(null)}>
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl shadow-slate-900/20 p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-600" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">Pause Session</h3>
                <p className="text-xs text-slate-400">Why are you pausing?</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 my-5">
              {PAUSE_REASONS.map(([label, cat])=>(
                <button key={label} onClick={()=>{setReason(label); setReasonCat(cat);}}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all ${reason===label?'bg-slate-900 text-white border-slate-900':'bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-900'}`}>
                  {label}
                </button>
              ))}
            </div>
            <textarea rows={2} placeholder="Or describe the reason…" value={reason} onChange={e=>setReason(e.target.value)}
              className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm outline-none focus:border-slate-400 focus:bg-white transition-all resize-none mb-5"/>
            <div className="flex gap-3">
              <button onClick={()=>{setPauseTicketId(null);setReason('');setReasonCat('other');}} className="flex-1 py-3 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={pauseTimer} disabled={busy||!reason.trim()} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">Confirm Pause</button>
            </div>
          </div>
        </div>
      )}

     {/* ════════════ WORKER COMMAND BAR — Timer-Centric ════════════ */}
     <WorkerCommandBar
        items={[
          { k: 'tasks',   label: 'Tasks',   icon: 'tasks' },
          { k: 'history', label: 'History', icon: 'history' },
        ]}
        currentTab={tab}
        onTabChange={setTab}
        active={Object.values(sessions)[0] || null}
        elapsed={Object.values(sessions)[0] ? (elapsed[Object.values(sessions)[0].svc_ticket_id]||0) : 0}
        runningCount={Object.values(sessions).filter(s=>s.status==='running').length}
      />
    </div>
  );
}