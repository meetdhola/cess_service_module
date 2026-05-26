import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSvcAuth } from '../../context/SvcAuthContext';
import { useSocket } from '../../useSocket';
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
  challan:      'Challan',
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

/* ─── Documents component — defined at module scope (stable refs) ─── */
// function TaskDocuments({ ticketId }) {
//   const [docs, setDocs] = useState([]);
//   const [uploading, setUploading] = useState(false);
//   const [docType, setDocType] = useState('challan');
//   const [note, setNote] = useState('');
//   const inputRef = useRef(null);

//   const load = useCallback(async () => {
//     try { const { data } = await svcApi.get(`/tickets/${ticketId}/documents`); setDocs(data); }
//     catch (e) { console.error(e); }
//   }, [ticketId]);

//   useEffect(() => { load(); }, [load]);

//   const upload = async (files) => {
//     if (!files?.length) return;
//     setUploading(true);
//     const fd = new FormData();
//     Array.from(files).forEach(f => fd.append('files', f));
//     fd.append('doc_type', docType);
//     if (note) fd.append('note', note);
//     try {
//       await svcApi.post(`/tickets/${ticketId}/documents`, fd, { headers:{'Content-Type':'multipart/form-data'} });
//       setNote('');
//       await load();
//     } catch (e) { alert(e.response?.data?.error || 'Upload failed'); }
//     finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
//   };

//   const isImage = (filename) => /\.(jpg|jpeg|png|gif|webp)$/i.test(filename);
//   const fileIcon = (d) => {
//     if (isImage(d.filename)) return '🖼';
//     if (d.doc_type==='challan') return '📄';
//     if (d.doc_type==='invoice') return '🧾';
//     if (d.doc_type==='job_card') return '📋';
//     if (d.doc_type==='video') return '🎬';
//     if (d.doc_type==='voice') return '🎤';
//     return '📎';
//   };

//   return (
//     <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-3">
//       <div className="flex items-center justify-between mb-3">
//         <div className="flex items-center gap-2">
//           <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
//             <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
//           </svg>
//           <p className="text-xs font-black text-slate-900">Documents</p>
//           <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{docs.length}</span>
//         </div>
//       </div>

//       {/* Upload area */}
//       <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-3 mb-3">
//         <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 mb-2">
//           <select value={docType} onChange={e=>setDocType(e.target.value)}
//             className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-slate-400">
//             {Object.entries(DOC_TYPE_LABEL).map(([v,l])=><option key={v} value={v}>{l}</option>)}
//           </select>
//           <input type="text" placeholder="Optional note (e.g. signed by customer)" value={note} onChange={e=>setNote(e.target.value)}
//             className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 placeholder-slate-400"/>
//         </div>
//         <div className="flex items-center gap-2">
//           <input ref={inputRef} type="file" multiple accept="image/*,video/*,application/pdf,audio/*" onChange={e=>upload(e.target.files)} className="hidden"/>
//           <button onClick={()=>inputRef.current?.click()} disabled={uploading}
//             className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60">
//             {uploading
//               ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Uploading…</>
//               : <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Upload {DOC_TYPE_LABEL[docType]}</>}
//           </button>
//         </div>
//       </div>

//       {/* Document list */}
//       {docs.length === 0 ? (
//         <p className="text-center text-[11px] text-slate-400 py-3">No documents uploaded yet</p>
//       ) : (
//         <div className="space-y-2 max-h-64 overflow-y-auto">
//           {docs.map(d => (
//             <div key={d.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
//               <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 text-base">{fileIcon(d)}</div>
//               <div className="flex-1 min-w-0">
//                 {/* <div className="flex items-center gap-2 mb-0.5">
//                   <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{DOC_TYPE_LABEL[d.doc_type] || d.doc_type}</span>
//                   {d.uploaded_role && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${d.uploaded_role==='plc'?'bg-blue-100 text-blue-700':d.uploaded_role==='wireman'?'bg-emerald-100 text-emerald-700':d.uploaded_role==='admin'?'bg-violet-100 text-violet-700':'bg-amber-100 text-amber-700'}`}>{d.uploaded_role}</span>}
//                 </div> */}
//                 <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
//   <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
//     {DOC_TYPE_LABEL[d.doc_type] || d.doc_type}
//   </span>
//   {d.source === 'inquiry_form' ? (
//     <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">📋 Inquiry Form</span>
//   ) : d.uploaded_role && (
//     <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
//       d.uploaded_role === 'plc'        ? 'bg-blue-100 text-blue-700' :
//       d.uploaded_role === 'wireman'    ? 'bg-emerald-100 text-emerald-700' :
//       d.uploaded_role === 'admin'      ? 'bg-violet-100 text-violet-700' :
//       d.uploaded_role === 'superadmin' ? 'bg-amber-100 text-amber-700' :
//       'bg-slate-100 text-slate-700'
//     }`}>
//       {d.uploaded_role === 'superadmin' ? 'super admin' : d.uploaded_role}
//     </span>
//   )}
// </div>
//                 <p className="text-xs font-bold text-slate-800 truncate">{d.original_name || d.filename}</p>
//                 {d.note && <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">"{d.note}"</p>}
//                 {/* <p className="text-[10px] text-slate-400 mt-0.5">{d.uploaded_by_name || 'Unknown'} · {new Date(d.uploaded_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</p> */}
//                 <p className="text-[10px] text-slate-400 mt-0.5">
//   {d.source === 'inquiry_form'
//     ? `Uploaded via inquiry${d.uploaded_by_name ? ` · ${d.uploaded_by_name}` : ''}`
//     : (d.uploaded_by_name || 'Unknown')}
//   {' · '}
//   {new Date(d.uploaded_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}
// </p>
//               </div>
//               <a 
//               href={d.url?.startsWith('http') ? d.url : `${window.location.protocol}//${window.location.hostname}:5001${d.url}`}
//   target="_blank"
//   rel="noopener noreferrer"
//   className="text-[11px] font-bold text-blue-600 hover:text-blue-700 flex-shrink-0"
// >
//   View →
// </a>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }

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
  const fullUrl = (u) => u?.startsWith('http') ? u : `${window.location.protocol}//${window.location.hostname}:5001${u}`;

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

/* ═══════════════════════════════════════════════════════════════ */
export default function WorkerDashboard() {
  const { svcUser, svcLogout } = useSvcAuth();
  const [tab,       setTab]       = useState('tasks');
  const [tickets,   setTickets]   = useState([]);
  const [history,   setHistory]   = useState([]);
  const [active,    setActive]    = useState(null);
  const [elapsed,   setElapsed]   = useState(0);
  const [openId,    setOpenId]    = useState(null);
  const [pauseM,    setPauseM]    = useState(false);
  const [reason,    setReason]    = useState('');
  const [reasonCat, setReasonCat] = useState('other');
  const [busy,      setBusy]      = useState(false);
  const tick = useRef(null);

  useSocket({ 'ticket:assigned': () => { loadTickets(); } });

  const loadTickets = useCallback(async () => { try { const{data}=await svcApi.get('/tickets/my'); setTickets(data); } catch(e){console.error(e);} }, []);
  const loadHistory = useCallback(async () => { try { const{data}=await svcApi.get('/sessions/my'); setHistory(data); } catch(e){console.error(e);} }, []);
  const loadActive  = useCallback(async () => {
    try {
      const{data}=await svcApi.get('/sessions/active');
      setActive(data);
      if (data?.status === 'running') setElapsed((data.total_seconds||0) + Math.floor((Date.now()-new Date(data.started_at).getTime())/1000));
      else if (data?.status === 'paused') setElapsed(data.total_seconds||0);
    } catch(e){console.error(e);}
  }, []);

  useEffect(() => { loadTickets(); loadHistory(); loadActive(); }, []); /* mount only */
  useEffect(() => {
    if (active?.status === 'running') tick.current = setInterval(() => setElapsed(e=>e+1), 1000);
    else clearInterval(tick.current);
    return () => clearInterval(tick.current);
  }, [active?.status]);

  const startTimer = async (id) => { setBusy(true); try{await svcApi.post('/sessions/start',{ticket_id:id});await loadActive();await loadTickets();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
  const pauseTimer = async () => {
    if (!reason.trim()) { alert('Please enter a reason'); return; }
    setBusy(true);
    try {
      await svcApi.post(`/sessions/${active.id}/pause`, { reason, reason_category: reasonCat });
      setPauseM(false); setReason(''); setReasonCat('other');
      setActive(p=>({...p,status:'paused'}));
      clearInterval(tick.current);
    } catch(e){ alert(e.response?.data?.error||'Failed'); }
    finally { setBusy(false); }
  };
  const resumeTimer= async () => { setBusy(true); try{await svcApi.post(`/sessions/${active.id}/resume`);await loadActive();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
  const stopTimer  = async () => { if(!window.confirm('Complete this session?'))return; setBusy(true); try{await svcApi.post(`/sessions/${active.id}/stop`);setActive(null);setElapsed(0);clearInterval(tick.current);await loadTickets();await loadHistory();}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };
  const completeTask=async(id)=>{ if(!window.confirm('Mark your work complete?'))return; setBusy(true); try{await svcApi.patch(`/tickets/${id}/complete`);await loadTickets();await loadHistory();if(active?.svc_ticket_id===id){setActive(null);setElapsed(0);clearInterval(tick.current);}}catch(e){alert(e.response?.data?.error||'Failed');}finally{setBusy(false);} };

  const av    = svcUser?.name?.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'??';
  const isPLC = svcUser?.role==='plc';
  const totalWorked = history.reduce((a,s)=>a+(s.total_seconds||0),0);
  const counts = { total:tickets.length, pending:tickets.filter(t=>['Open','Assigned'].includes(t.status)).length, active:tickets.filter(t=>t.status==='In Progress').length, done:tickets.filter(t=>t.status==='Completed').length };

  // Build 7-day chart data from history
  const chartData = (() => {
    const days = [];
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i);
      const key = d.toISOString().slice(0,10);
      const dayHist = history.filter(h=>String(h.created_at).slice(0,10)===key);
      const total = dayHist.reduce((a,h)=>a+(h.total_seconds||0),0);
      days.push({ day: d.toLocaleDateString('en-IN',{weekday:'short'}), Hours: +(total/3600).toFixed(1), Sessions: dayHist.length });
    }
    return days;
  })();

  const NAV = [
    {k:'tasks',   icon:I.tasks,   label:'My Tasks'},
    {k:'timer',   icon:I.timer,   label:'Timer'},
    {k:'history', icon:I.history, label:'History'},
  ];

  return (
    <div className="flex h-screen bg-[#F5F6F8] font-sans overflow-hidden">

      {/* ════════════ LEFT ICON RAIL ════════════ */}
      <aside className="w-16 bg-white border-r border-slate-200/60 flex flex-col items-center py-5 gap-1 flex-shrink-0 z-20">
        <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center mb-4 shadow-lg shadow-slate-900/15">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
        </div>
        {NAV.map(({k,icon,label})=>(
          <button key={k} onClick={()=>setTab(k)} title={label}
            className={`group relative w-11 h-11 rounded-2xl flex items-center justify-center transition-all ${tab===k?'bg-slate-900 text-white':'text-slate-400 hover:bg-slate-100 hover:text-slate-700'}`}>
            <span className="w-4 h-4">{icon}</span>
            {k==='tasks' && active && tab!=='tasks' && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 animate-pulse"/>}
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
          <div className="flex items-center gap-2 ml-auto">
            {active && (
              <div className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full border ${active.status==='running'?'bg-emerald-50 border-emerald-200':'bg-amber-50 border-amber-200'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${active.status==='running'?'bg-emerald-500 animate-pulse':'bg-amber-500'}`}/>
                <span className={`font-mono text-xs font-black tabular-nums ${active.status==='running'?'text-emerald-700':'text-amber-700'}`}>{fmt(elapsed)}</span>
              </div>
            )}
            <button className="w-9 h-9 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-all relative">
              <span className="w-3.5 h-3.5">{I.bell}</span>
              {tickets.filter(t=>t.status==='Assigned').length>0&&<span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-red-500"/>}
            </button>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${isPLC?'bg-gradient-to-br from-blue-500 to-indigo-600':'bg-gradient-to-br from-emerald-500 to-green-600'} ring-2 ring-white shadow ml-1`}>{av}</div>
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
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900">Assigned Tasks</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{tickets.length} total · click any task to expand</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">{counts.pending} pending</span>
                  </div>
                  {!tickets.length
                    ? <div className="text-center py-16"><div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📋</div><p className="text-slate-500 font-bold text-sm">No tasks assigned yet</p><p className="text-slate-400 text-xs mt-1">Check back after an admin assigns a ticket</p></div>
                    : <div className="divide-y divide-slate-100">
                        {tickets.map(tk=>{
                          const isDone = DONE.includes(tk.status);
                          const isOpen = openId===tk.id;
                          const isMe   = active?.svc_ticket_id===tk.id;
                          return (
                            <div key={tk.id} className={`transition-all ${isDone?'opacity-60':''} ${isOpen?'bg-blue-50/30':''}`}>
                              <div onClick={()=>setOpenId(isOpen?null:tk.id)} className="flex items-center gap-4 px-6 py-4 cursor-pointer hover:bg-slate-50/60 transition-all">
                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isDone?'bg-emerald-400':tk.status==='In Progress'?'bg-amber-400':tk.status==='Assigned'?'bg-blue-400':'bg-slate-300'}`}/>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-mono text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">{tk.ticket_id}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${PRI[tk.priority]}`}>{tk.priority}</span>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STA[tk.status]}`}>{tk.status}</span>
                                    {tk.warranty_status==='out_of_warranty' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">⚠ OOW</span>}
                                    {isMe && <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 animate-pulse">⏱ {fmt(elapsed)}</span>}
                                  </div>
                                  <p className="text-sm font-bold text-slate-800 truncate">{tk.customer_name}</p>
                                  <p className="text-[11px] text-slate-400 capitalize">{tk.service_type?.replace(/_/g,' ')} · {fmtDate(tk.created_at)}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {tk.total_worked_secs>0&&<span className="hidden sm:block text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{fmtH(+tk.total_worked_secs)}</span>}
                                  <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
                                </div>
                              </div>

                              {isOpen && (
                                <div className="px-6 pb-5 border-t border-blue-100/60 bg-gradient-to-b from-blue-50/40 to-transparent">
                                  {/* Contact / address grid */}
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 my-4">
                                    {[['Contact',tk.contact_name||'—'],['Phone',tk.contact_phone||'—'],['Sales Agent',tk.sales_agent||'—'],['PLC',tk.needs_plc?(tk.plc_type?`Yes (${tk.plc_type})`:'Yes'):'No'],['Wiring',tk.needs_wiring?'Yes':'No'],['Address',tk.address]].map(([k,v])=>(
                                      <div key={k}>
                                        <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">{k}</p>
                                        <p className="text-xs font-bold text-slate-700 mt-0.5 break-words">{v}</p>
                                      </div>
                                    ))}
                                  </div>

                                  {/* Co-workers (multi-assign display) */}
                                  {(tk.plc_worker_names || tk.wireman_worker_names) && (
  <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-4">
    <div className="flex items-center justify-between mb-2">
      <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Team Assigned</p>
      <TeamProgress ticketId={tk.id}/>
    </div>
    <TeamMembers ticketId={tk.id} plcNames={tk.plc_worker_names} wmNames={tk.wireman_worker_names}/>
  </div>
)}
                                  {/* {(tk.plc_worker_names || tk.wireman_worker_names) && (
                                    <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-4">
                                      <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">Team Assigned</p>
                                      <div className="flex flex-wrap gap-2">
                                        {tk.plc_worker_names?.split(', ').filter(Boolean).map((n,i)=>(
                                          <span key={`plc-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"/>🖥 {n}
                                          </span>
                                        ))}
                                        {tk.wireman_worker_names?.split(', ').filter(Boolean).map((n,i)=>(
                                          <span key={`wm-${i}`} className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>⚡ {n}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )} */}

                                  {tk.description && <div className="bg-white rounded-xl border-l-4 border-l-blue-400 border border-blue-100 px-4 py-3 text-xs text-slate-600 leading-relaxed mb-4 whitespace-pre-wrap">{tk.description}</div>}

                                  {/* Warranty + Invoice + Challan strip */}
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border ${tk.warranty_status==='in_warranty'?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                      {tk.warranty_status==='in_warranty'
                                        ? <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> In Warranty</>
                                        : <><svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Out of Warranty</>}
                                    </span>
                                    {tk.invoice_no && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                                      INV: {tk.invoice_no}
                                    </span>}
                                    {tk.challan_no && <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-200">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>
                                      CHL: {tk.challan_no}
                                    </span>}
                                  </div>

                                  {/* Documents */}
                                  <TaskDocuments ticketId={tk.id}/>

                                  {/* Timer controls */}
                                  {!isDone ? (
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                      {!active && (
                                        <button onClick={()=>startTimer(tk.id)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">
                                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Start Timer
                                        </button>
                                      )}
                                      {isMe && (
                                        <>
                                          <div className="font-mono text-lg font-black text-slate-900 tabular-nums min-w-[90px]">{fmt(elapsed)}</div>
                                          {active.status==='running'
                                            ? <button onClick={()=>setPauseM(true)} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>Pause</button>
                                            : <button onClick={resumeTimer} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Resume</button>}
                                          <button onClick={stopTimer} disabled={busy} className="flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-2xl transition-all disabled:opacity-60"><svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Stop</button>
                                        </>
                                      )}
                                      {!isMe && active && <div className="text-xs text-slate-400 bg-slate-100 px-3 py-2 rounded-2xl">Active session on {active.ticket_no}</div>}
                                      <button onClick={()=>completeTask(tk.id)} disabled={busy} className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-2xl hover:bg-emerald-100 transition-all disabled:opacity-60">
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>Mark Complete
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-2.5">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                                      Task completed — no further action needed
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>}
                </div>
              </div>

              {/* RIGHT — widget rail */}
              <aside className="space-y-4">
                {active ? (
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
                )}

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
            <div className="bg-white rounded-3xl border border-slate-200/60 overflow-hidden">
              {!active ? (
                <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                  <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-700 mb-2">No Active Session</h3>
                  <p className="text-sm text-slate-400 max-w-xs mb-6">Go to My Tasks and tap "Start Timer" on a ticket to begin tracking work time.</p>
                  <button onClick={()=>setTab('tasks')} className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold rounded-2xl shadow-md shadow-slate-900/10 transition-all">View My Tasks →</button>
                </div>
              ) : (
                <div className="flex flex-col items-center py-12 sm:py-16 px-6 gap-6">
                  <div className="relative">
                    <div className={`w-56 h-56 sm:w-72 sm:h-72 rounded-full flex items-center justify-center border-8 transition-all ${active.status==='running'?'border-slate-900':'border-amber-300'}`}>
                      <div className="text-center">
                        <p className={`text-4xl sm:text-5xl font-black font-mono tabular-nums ${active.status==='running'?'text-slate-900':'text-amber-600'}`}>{fmt(elapsed)}</p>
                        <p className="text-xs font-bold text-slate-400 mt-2">{active.status==='running'?'RUNNING':'PAUSED'}</p>
                      </div>
                    </div>
                    {active.status==='running' && <div className="absolute inset-0 rounded-full border-4 border-emerald-300/40 animate-ping"/>}
                  </div>

                  <div className="text-center">
                    <span className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg">{active.ticket_no}</span>
                    <p className="text-xl font-black text-slate-900 mt-3">{active.customer_name}</p>
                    <p className="text-sm text-slate-400 capitalize mt-0.5">{active.service_type?.replace(/_/g,' ')}</p>
                  </div>

                  <div className="flex gap-3">
                    {active.status==='running' ? (
                      <button onClick={()=>setPauseM(true)} disabled={busy} className="flex flex-col items-center gap-2 w-28 sm:w-32 py-5 rounded-3xl bg-amber-50 border-2 border-amber-200 text-amber-700 font-bold text-xs hover:bg-amber-100 transition-all">
                        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>Pause
                      </button>
                    ) : (
                      <button onClick={resumeTimer} disabled={busy} className="flex flex-col items-center gap-2 w-28 sm:w-32 py-5 rounded-3xl bg-blue-50 border-2 border-blue-200 text-blue-700 font-bold text-xs hover:bg-blue-100 transition-all">
                        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>Resume
                      </button>
                    )}
                    <button onClick={stopTimer} disabled={busy} className="flex flex-col items-center gap-2 w-28 sm:w-32 py-5 rounded-3xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-all shadow-md shadow-slate-900/10">
                      <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>Complete
                    </button>
                  </div>
                </div>
              )}
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

      {/* ── PAUSE MODAL ── */}
      {pauseM && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4" onClick={e=>e.target===e.currentTarget&&setPauseM(false)}>
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
              <button onClick={()=>{setPauseM(false);setReason('');setReasonCat('other');}} className="flex-1 py-3 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all">Cancel</button>
              <button onClick={pauseTimer} disabled={busy||!reason.trim()} className="flex-1 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all disabled:opacity-60">Confirm Pause</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}