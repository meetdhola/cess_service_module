// import React, { useState, useRef, useEffect } from 'react';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { useSvcAuth } from '../../context/SvcAuthContext';

const SVC = [
  { value:'installation',    label:'Installation',    prefix:'IN', desc:'Set up new equipment' },
  { value:'troubleshooting', label:'Troubleshooting', prefix:'SE', desc:'Diagnose & fix issues' },
  { value:'new_development', label:'New Development', prefix:'SE', desc:'Custom build / project' },
  { value:'after_sales',     label:'After Sales',     prefix:'SE', desc:'Post-sale support' },
];
const AGENTS = ['Divy Shah','Chirag Shah','Ketan Tundiya','Chetankumar Shah','Pankaj Rana','Vivardhan Gandhi','Nikita Koshti','Yogita Shah'];

const INIT = {
  customer_name:'', address:'', service_type:'', description:'',
  contact_name:'', contact_phone:'', designation:'', sales_agent:'',
  priority:'Medium', needs_plc:false, needs_wiring:false, plc_type:'',
  warranty_status:'in_warranty',
  invoice_no:'', challan_no:''
};

// Installation tickets have no warranty concept → send NULL.
const isInstallation = (t) => t === 'installation';

/* ─── Reusable form atoms (module-scope for stable refs) ─── */
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


/* ─── PARTY AUTOCOMPLETE ─── */
function PartyAutocomplete({ value, onChange, onSelect }) {
  const [results, setResults] = useState([]);
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor,  setCursor]  = useState(-1);
  const debounceRef           = useRef(null);
  const wrapperRef            = useRef(null);
  const inputRef              = useRef(null);

  useEffect(() => {
    const fn = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false); setCursor(-1);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const search = useCallback(async (q) => {
    if (!q || q.trim().length < 1) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const { data } = await axios.get(`/api/service/parties/search?q=${encodeURIComponent(q.trim())}`);
      setResults(data);
      setOpen(data.length > 0);
      setCursor(-1);
    } catch { setResults([]); setOpen(false); }
    finally   { setLoading(false); }
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(v), 200);
  };

  const handleSelect = (party) => {
    onSelect(party);
    setOpen(false); setResults([]); setCursor(-1);
  };

  const handleKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown')            { e.preventDefault(); setCursor(c => Math.min(c+1, results.length-1)); }
    else if (e.key === 'ArrowUp')         { e.preventDefault(); setCursor(c => Math.max(c-1, 0)); }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); handleSelect(results[cursor]); }
    else if (e.key === 'Escape')          { setOpen(false); setCursor(-1); }
  };

  const hi = (text, q) => {
    if (!q || !text) return text;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return text;
    return <>{text.slice(0,i)}<mark className="bg-yellow-200 text-yellow-900 rounded not-italic font-black px-0.5">{text.slice(i, i+q.length)}</mark>{text.slice(i+q.length)}</>;
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length >= 1 && results.length > 0 && setOpen(true)}
          placeholder="Search company name…"
          autoComplete="off"
          className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"/>
          </div>
        )}
        {!loading && value && (
          <button type="button"
            onClick={() => { onChange(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 text-[10px] transition-colors">
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-200/80 overflow-hidden z-[200]">
          <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              {results.length} match{results.length !== 1 ? 'es' : ''} in party master
            </span>
            <span className="text-[9px] text-slate-300 hidden sm:block">↑↓ navigate · Enter select</span>
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {results.map((p, i) => (
              <li key={p.code}
                onMouseDown={() => handleSelect(p)}
                onMouseEnter={() => setCursor(i)}
                className={`px-3 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${cursor === i ? 'bg-slate-900 text-white' : 'hover:bg-slate-50'}`}>
                <span className={`flex-shrink-0 font-mono text-[9px] font-black px-1.5 py-0.5 rounded ${cursor===i?'bg-white/20 text-white':'bg-slate-100 text-slate-500'}`}>
                  {p.code}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-bold truncate leading-tight ${cursor===i?'text-white':'text-slate-800'}`}>
                    {hi(p.name, value)}
                  </p>
                  {(p.city || p.state) && (
                    <p className={`text-[11px] flex items-center gap-1 mt-0.5 ${cursor===i?'text-slate-300':'text-slate-400'}`}>
                      <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                      </svg>
                      {hi(p.city, value)}{p.city && p.state ? ', ' : ''}{p.state}
                    </p>
                  )}
                </div>
                {p.phone && (
                  <span className={`flex-shrink-0 text-[10px] font-mono hidden sm:block ${cursor===i?'text-slate-300':'text-slate-400'}`}>
                    {p.phone}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="px-3 py-1.5 border-t border-slate-100 bg-slate-50">
            <p className="text-[9px] text-slate-400">Selecting fills company name · address autofilled if empty</p>
          </div>
        </div>
      )}

      {open && !loading && results.length === 0 && value.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-[200] px-4 py-3">
          <p className="text-xs text-slate-400 text-center">No party found — type the name manually</p>
        </div>
      )}
    </div>
  );
}

/* ─── VOICE RECORDER ─── */
function VoiceRecorder({ onRecord, existing }) {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState(existing || null);
  const [audioURL, setAudioURL] = useState(existing ? URL.createObjectURL(existing) : null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (audioURL) URL.revokeObjectURL(audioURL);
      clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Voice recording requires HTTPS or localhost. Your browser does not support it on this URL.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioURL(url);
        onRecord(blob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setPaused(false);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch (err) {
      alert('Microphone access denied. Please allow microphone permission in your browser.');
      console.error(err);
    }
  };

  const pauseRecording = () => {
    if (recorderRef.current?.state === 'recording') {
      try {
        recorderRef.current.pause();
        setPaused(true);
        clearInterval(timerRef.current);
      } catch { /* Safari iOS may not support pause */ }
    }
  };

  const resumeRecording = () => {
    if (recorderRef.current?.state === 'paused') {
      try {
        recorderRef.current.resume();
        setPaused(false);
        timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      } catch { /* fallback */ }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
      setRecording(false);
      setPaused(false);
      clearInterval(timerRef.current);
    }
  };

  const deleteRecording = () => {
    if (audioURL) URL.revokeObjectURL(audioURL);
    setAudioBlob(null);
    setAudioURL(null);
    setElapsed(0);
    onRecord(null);
  };

  const formatTime = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  // After recording → show playback
  if (audioBlob && !recording) {
    return (
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-3 sm:p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-black text-emerald-700">Voice note recorded</p>
            <p className="text-[10px] sm:text-[11px] text-emerald-600">{(audioBlob.size / 1024).toFixed(0)} KB · {formatTime(elapsed)}</p>
          </div>
          <button type="button" onClick={deleteRecording} className="w-8 h-8 rounded-full bg-white border border-red-200 text-red-500 hover:bg-red-50 flex items-center justify-center flex-shrink-0" title="Delete recording">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
        <audio src={audioURL} controls className="w-full"/>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-3 sm:p-4 border-2 transition-all ${recording ? 'bg-red-50 border-red-300' : 'bg-slate-50 border-slate-200 border-dashed'}`}>
      <div className="flex items-center gap-3">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-slate-900 hover:bg-slate-800 flex items-center justify-center transition-all shadow-lg shadow-slate-900/20 active:scale-95 flex-shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        ) : (
          <div className="relative flex-shrink-0">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
              <span className="w-4 h-4 rounded-sm bg-white"/>
            </div>
            {!paused && <div className="absolute inset-0 rounded-full border-4 border-red-300 animate-ping"/>}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {!recording ? (
            <>
              <p className="text-xs sm:text-sm font-black text-slate-900">Record voice note</p>
              <p className="text-[10px] sm:text-[11px] text-slate-500">Tap mic to describe verbally</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-base sm:text-lg font-black text-red-600 tabular-nums">{formatTime(elapsed)}</span>
                {paused
                  ? <span className="text-[9px] sm:text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">PAUSED</span>
                  : <span className="text-[9px] sm:text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"/>REC
                    </span>}
              </div>
              <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">Speak clearly</p>
            </>
          )}
        </div>

        {recording && (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {paused ? (
              <button type="button" onClick={resumeRecording} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center transition-all" title="Resume">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><polygon points="5,3 19,12 5,21"/></svg>
              </button>
            ) : (
              <button type="button" onClick={pauseRecording} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center transition-all" title="Pause">
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              </button>
            )}
            <button type="button" onClick={stopRecording} className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-slate-900 hover:bg-slate-800 text-white flex items-center justify-center transition-all" title="Stop & save">
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════ */
export default function InquiryForm() {
  const [form,  setForm]  = useState(INIT);
  const [files, setFiles] = useState([]);
  const [done,  setDone]  = useState(null);
  const [busy,  setBusy]  = useState(false);
  const [err,   setErr]   = useState('');
  const [step,  setStep]  = useState(1);
  const [voiceBlob, setVoiceBlob] = useState(null);

  const { svcUser } = useSvcAuth();
  const backUrl = svcUser
    ? (svcUser.role === 'plc' || svcUser.role === 'wireman' ? '/service/worker' : '/service/admin')
    : '/';

  // const set = (k,v) => setForm(p => ({...p, [k]: v}));
  const set = (k,v) => setForm(p => {
    const next = {...p, [k]: v};
    // Installation has no warranty — clear it; restore a sensible default otherwise.
    if (k === 'service_type') {
      next.warranty_status = isInstallation(v) ? null : (p.warranty_status || 'in_warranty');
    }
    return next;
  });
  // const sel = SVC.find(s => s.value === form.service_type);
  const sel = SVC.find(s => s.value === form.service_type);
  const handlePartySelect = (party) => {
  const cityState = [party.city, party.state].filter(Boolean).join(', ');
  setForm(p => ({
    ...p,
    customer_name: party.name,
    address: p.address.trim() ? p.address : cityState,
  }));
};

  const addFiles = e => setFiles(p => [...p, ...Array.from(e.target.files)].slice(0,10));
  const rmFile   = i => setFiles(p => p.filter((_,idx) => idx !== i));
  const fIcon    = f => f.type.startsWith('image/') ? '🖼' : f.type.startsWith('video/') ? '🎬' : '🎤';

  const goNext = (to) => {
    setErr('');
    if (to === 2 && (!form.customer_name.trim() || !form.address.trim() || !form.service_type)) {
      setErr('Please fill all required fields');
      return;
    }
    setStep(to);
    // Scroll to top on step change (mobile)
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      // 1. Create the ticket
      const { data: ticket } = await axios.post('/api/service/tickets', form);

      // 2. Upload all media (files + voice) in ONE request
      if (files.length > 0 || voiceBlob) {
        const fd = new FormData();
        files.forEach(f => fd.append('files', f));
        if (voiceBlob) {
          const voiceFile = new File([voiceBlob], `voice_${Date.now()}.webm`, { type: voiceBlob.type || 'audio/webm' });
          fd.append('files', voiceFile);
        }
        await axios.post(`/api/service/tickets/${ticket.id}/media`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setDone(ticket);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setErr(e.response?.data?.error || 'Submission failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  /* ─── SUCCESS SCREEN ─── */
  if (done) return (
    <div className="min-h-screen bg-[#F5F6F8] flex items-center justify-center px-4 py-8 font-sans">
      <div className="w-full max-w-[920px] grid lg:grid-cols-[1.1fr_1fr] gap-0 bg-white rounded-3xl border border-slate-200/60 shadow-2xl shadow-slate-200/40 overflow-hidden">
        {/* LEFT — dark success panel */}
        <div className="hidden lg:flex flex-col justify-between bg-slate-900 p-10 text-white relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-emerald-500/30 blur-3xl"/>
          <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-blue-500/20 blur-3xl"/>
          <div className="relative z-10">
            <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center text-2xl mb-8 shadow-lg shadow-emerald-500/30">✓</div>
            <h2 className="text-3xl font-black leading-tight mb-3">Request<br/>Submitted</h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-xs">Our team will review your request and contact you shortly with next steps.</p>
          </div>
          <div className="relative z-10">
            <div className="bg-slate-800/60 backdrop-blur rounded-2xl px-4 py-3 border border-slate-700/50">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">What's Next?</p>
              <ul className="space-y-1.5 text-xs">
                {['Track ticket status anytime','Workers will be assigned soon','You\'ll get updates via SMS'].map(t=>(
                  <li key={t} className="flex items-center gap-2"><span className="w-1 h-1 rounded-full bg-emerald-400"/>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* RIGHT — success details */}
        <div className="px-5 sm:px-10 py-8 sm:py-12 text-center">
          <div className="lg:hidden w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center text-3xl mx-auto mb-5 shadow-lg shadow-emerald-200">✓</div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 mb-1">Request submitted</h1>
          <p className="text-xs sm:text-sm text-slate-400 mb-6 sm:mb-7">Save your ticket ID for reference</p>

          <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6 mb-5 sm:mb-6">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Your Ticket ID</p>
            <p className="text-3xl sm:text-5xl font-black font-mono text-slate-900 tracking-[6px] sm:tracking-[8px] break-all">{done.ticket_id}</p>
          </div>

          <div className="space-y-2 bg-white border border-slate-200/60 rounded-2xl p-4 mb-5 sm:mb-6 text-left">
            {[['Customer', done.customer_name],['Service', SVC.find(s=>s.value===done.service_type)?.label],['Priority', done.priority]].map(([k,v])=>(
              <div key={k} className="flex justify-between items-center text-sm py-1 gap-3">
                <span className="text-slate-400 text-xs flex-shrink-0">{k}</span>
                <span className="font-bold text-slate-700 text-right truncate">{v}</span>
              </div>
            ))}
          </div>

          <div className="space-y-2.5">
            <button onClick={()=>{setDone(null);setForm(INIT);setFiles([]);setVoiceBlob(null);setStep(1);}} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-sm transition-all shadow-md shadow-slate-900/10">Submit Another Request</button>
            <Link to={backUrl} className="block w-full py-3 border border-slate-200 text-slate-700 hover:border-slate-400 hover:bg-slate-50 font-bold rounded-2xl text-sm text-center transition-all">
              {svcUser ? 'Back to Dashboard →' : 'Go to Login →'}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );

  /* ─── FORM ─── */
  return (
    <div className="min-h-screen bg-[#F5F6F8] px-3 sm:px-4 py-4 sm:py-10 font-sans">
      <div className="max-w-3xl mx-auto">

        {/* Back to Dashboard pill — visible only if user is logged in */}
        {svcUser && (
          <Link
            to={backUrl}
            className="inline-flex items-center gap-2 mb-4 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs sm:text-sm font-bold rounded-full transition-all shadow-sm">
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
            </svg>
            Back to Dashboard
          </Link>
        )}

        {/* Header card — dark gradient */}
        <div className="bg-slate-900 rounded-3xl p-5 sm:p-6 mb-4 sm:mb-5 text-white relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-40 h-40 rounded-full bg-blue-500/30 blur-3xl"/>
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-indigo-500/20 blur-2xl"/>
          <div className="flex items-center gap-3 sm:gap-4 relative">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cess Engineering</p>
              <h1 className="text-lg sm:text-xl font-black tracking-tight">Service Request</h1>
            </div>
          </div>
        </div>

        {/* Step progress — horizontally scrollable on mobile */}
        <div className="bg-white rounded-2xl border border-slate-200/60 p-3 sm:p-4 mb-4 sm:mb-5 overflow-x-auto scrollbar-hide ">
          <div className="flex items-center gap-1 min-w-max">
            {['Service Type','Details & Media','Contact & Priority'].map((s,i) => (
              <div key={i} className={`flex items-center gap-2.5 px-2 sm:px-3 ${i < 2 ? 'after:content-["›"] after:text-slate-300 after:text-lg after:ml-1 sm:after:ml-2' : ''}`}>
                <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold flex-shrink-0 transition-all ${step > i+1 ? 'bg-emerald-500 text-white' : step === i+1 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}>
                  {step > i+1 ? '✓' : i+1}
                </div>
                <span className={`text-[11px] sm:text-xs font-bold transition-all whitespace-nowrap ${step === i+1 ? 'text-slate-900' : step > i+1 ? 'text-emerald-600' : 'text-slate-400'}`}>{s}</span>
              </div>
            ))}
          </div>
        </div>

        {err && <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 text-red-600 text-xs sm:text-sm font-medium">{err}</div>}

        {/* STEP 1 */}
        {step === 1 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-5 sm:p-8">
            <div className="mb-5 sm:mb-6">
              <h3 className="text-base font-black text-slate-900">Basic Information</h3>
              <p className="text-xs text-slate-400 mt-1">Tell us about the customer and the service needed</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div>
  <FLabel>Customer / Company *</FLabel>
  <PartyAutocomplete
    value={form.customer_name}
    onChange={v => set('customer_name', v)}
    onSelect={handlePartySelect}
  />
  <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>
    Type to search from 283 registered parties
  </p>
</div>
              {/* <div><FLabel>Customer / Company *</FLabel><FInput placeholder="e.g. Gujarat Pipes Ltd" value={form.customer_name} onChange={e=>set('customer_name',e.target.value)}/></div> */}
              {/* <div><FLabel>Site Address *</FLabel><FInput placeholder="Full site address" value={form.address} onChange={e=>set('address',e.target.value)}/></div> */}
              <div><FLabel>Location (Venue) *</FLabel><FInput placeholder="Venue / site location" value={form.address} onChange={e=>set('address',e.target.value)}/></div>
            </div>

            <div className="mb-5">
              <FLabel>Select Service Type *</FLabel>
              {/* 1 col on tiny screens, 2 cols normal mobile, 4 cols on tablet+ */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3 mt-1">
                {SVC.map(st => (
                  <button key={st.value} type="button" onClick={()=>set('service_type',st.value)}
                    className={`text-left p-3 sm:p-4 rounded-2xl border-2 transition-all ${form.service_type===st.value ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10' : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-700'}`}>
                    <p className={`text-[9px] sm:text-[10px] font-mono font-bold mb-1.5 ${form.service_type===st.value?'text-slate-400':'text-slate-400'}`}>{st.prefix}xxxx</p>
                    <p className="text-xs sm:text-sm font-black">{st.label}</p>
                    <p className={`text-[10px] mt-1 leading-tight ${form.service_type===st.value?'text-slate-400':'text-slate-400'}`}>{st.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {sel && (
              <div className="flex items-center gap-2 sm:gap-3 bg-blue-50 border border-blue-100 rounded-2xl px-3 sm:px-4 py-3 mb-5 flex-wrap">
                <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <span className="text-[11px] sm:text-xs text-slate-600">Ticket ID:</span>
                <span className="font-black text-xs sm:text-sm font-mono text-slate-900">{sel.prefix}#### — on submit</span>
              </div>
            )}

            <div className="flex justify-end">
              <button onClick={()=>goNext(2)} className="w-full sm:w-auto px-6 py-3 sm:py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all flex items-center justify-center gap-1.5">
                Next: Add Details
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-5 sm:p-8">
            <div className="mb-5 sm:mb-6">
              <h3 className="text-base font-black text-slate-900">Problem Details & Attachments</h3>
              <p className="text-xs text-slate-400 mt-1">Help us understand the situation</p>
            </div>

            <div className="mb-5">
              <FLabel>Description</FLabel>
              <textarea placeholder="Describe the issue or requirements in detail…" value={form.description} onChange={e=>set('description',e.target.value)} rows={4}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all resize-none leading-relaxed"/>
            </div>

            <div className="mb-5">
              <FLabel>Attachments — Photos, Videos, Audio Files</FLabel>
              <div onClick={()=>document.getElementById('inqF').click()}
                className="border-2 border-dashed border-slate-200 rounded-2xl p-5 sm:p-8 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all">
                <input id="inqF" type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={addFiles}/>
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-2 sm:mb-3">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                </div>
                <p className="text-xs sm:text-sm font-bold text-slate-700">Tap to upload files</p>
                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">Images · Videos · Audio · max 10 files</p>
              </div>
              {files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {files.map((f,i) => (
                    <div key={i} className="flex items-center gap-2 sm:gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-3 sm:px-4 py-2.5">
                      <span className="text-base">{fIcon(f)}</span>
                      <span className="flex-1 text-[11px] sm:text-xs text-slate-700 font-medium truncate">{f.name}</span>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 flex-shrink-0">{(f.size/1024/1024).toFixed(1)}MB</span>
                      <button onClick={()=>rmFile(i)} className="w-5 h-5 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 hover:border-red-200 transition-all text-xs flex-shrink-0">×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Voice recorder */}
            <div className="mb-5">
              <FLabel>🎤 Voice Note (optional)</FLabel>
              <VoiceRecorder onRecord={setVoiceBlob} existing={voiceBlob}/>
            </div>

            <div className="mb-5">
              <FLabel>Work Requirements</FLabel>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                {[['needs_plc','🖥','PLC Work'],['needs_wiring','⚡','Wiring Work']].map(([k,ic,lb]) => (
                  <label key={k} className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 sm:py-3.5 rounded-2xl border-2 cursor-pointer transition-all select-none ${form[k] ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                    <input type="checkbox" className="hidden" checked={form[k]} onChange={e=>set(k,e.target.checked)}/>
                    <span className="text-lg sm:text-xl">{ic}</span>
                    <span className="text-xs sm:text-sm font-bold">{lb}</span>
                    {form[k] && <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 ml-auto" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </label>
                ))}
              </div>
            </div>

            {form.needs_plc && (
              <div className="mb-5">
                <FLabel>PLC Work Type</FLabel>
                <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                  {[['site','🏭','On-site'],['remote','💻','Remote']].map(([v,ic,l]) => (
                    <label key={v} className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-3 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.plc_type===v ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}>
                      <input type="radio" name="plc" className="hidden" value={v} checked={form.plc_type===v} onChange={()=>set('plc_type',v)}/>
                      <span className="text-base sm:text-lg">{ic}</span>
                      <span className="text-xs sm:text-sm font-bold">{l}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5 mt-2">
              <button onClick={()=>{setErr('');setStep(1);}} className="px-6 py-3 sm:py-2.5 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Back
              </button>
              <button onClick={()=>goNext(3)} className="px-6 py-3 sm:py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 transition-all flex items-center justify-center gap-1.5">
                Next: Contact Info
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="bg-white rounded-3xl border border-slate-200/60 p-5 sm:p-8">
            <div className="mb-5 sm:mb-6">
              <h3 className="text-base font-black text-slate-900">Contact & Priority</h3>
              <p className="text-xs text-slate-400 mt-1">Who should we contact, and how urgent is this?</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mb-5">
              <div><FLabel>Contact Person</FLabel><FInput placeholder="On-site contact name" value={form.contact_name} onChange={e=>set('contact_name',e.target.value)}/></div>
              <div><FLabel>Contact Phone</FLabel><FInput type="tel" placeholder="+91 98765 43210" value={form.contact_phone} onChange={e=>set('contact_phone',e.target.value)}/></div>
              <div><FLabel>Designation</FLabel><FInput placeholder="e.g. Plant Manager" value={form.designation} onChange={e=>set('designation',e.target.value)}/></div>
              <div><FLabel>Sales Agent</FLabel>
                <FSel value={form.sales_agent} onChange={e=>set('sales_agent',e.target.value)}>
                  <option value="">— Select agent —</option>
                  {AGENTS.map(a=><option key={a}>{a}</option>)}
                </FSel>
              </div>
            </div>

            {/* Warranty Status */}
            {/* Warranty Status — hidden for installation (installations have no warranty) */}
            {!isInstallation(form.service_type) ? (
              <div className="mb-5">
                <FLabel>Warranty Status</FLabel>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                  {[
                    ['in_warranty',     '✓ In Warranty',     'Customer is under active warranty',  'emerald'],
                    ['out_of_warranty', '⚠ Out of Warranty', 'Warranty expired — billable service', 'amber'],
                  ].map(([v,lb,desc,clr]) => (
                    <label key={v} className={`flex items-start gap-3 p-3 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.warranty_status===v ? (clr==='emerald'?'border-emerald-400 bg-emerald-50':'border-amber-400 bg-amber-50') : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                      <input type="radio" name="warranty" className="hidden" value={v} checked={form.warranty_status===v} onChange={()=>set('warranty_status',v)}/>
                      <span className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${clr==='emerald'?'bg-emerald-500':'bg-amber-500'}`}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs sm:text-sm font-black text-slate-900">{lb}</p>
                        <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">{desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mb-5 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
                <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                <p className="text-[11px] sm:text-xs text-slate-500">Warranty doesn't apply to installation work.</p>
              </div>
            )}
            {/* <div className="mb-5">
              <FLabel>Warranty Status</FLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
                {[
                  ['in_warranty',     '✓ In Warranty',     'Customer is under active warranty',  'emerald'],
                  ['out_of_warranty', '⚠ Out of Warranty', 'Warranty expired — billable service', 'amber'],
                ].map(([v,lb,desc,clr]) => (
                  <label key={v} className={`flex items-start gap-3 p-3 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.warranty_status===v ? (clr==='emerald'?'border-emerald-400 bg-emerald-50':'border-amber-400 bg-amber-50') : 'border-slate-200 bg-slate-50 hover:border-slate-300'}`}>
                    <input type="radio" name="warranty" className="hidden" value={v} checked={form.warranty_status===v} onChange={()=>set('warranty_status',v)}/>
                    <span className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${clr==='emerald'?'bg-emerald-500':'bg-amber-500'}`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-black text-slate-900">{lb}</p>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 mt-0.5">{desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div> */}

            {/* Invoice & Challan */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                <FLabel>Invoice & Challan</FLabel>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold uppercase tracking-wider">Optional · editable later</span>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <input type="text" placeholder="Invoice Number" value={form.invoice_no} onChange={e=>set('invoice_no',e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"/>
                  <p className="text-[10px] text-slate-400 mt-1">Usually filled for installations</p>
                </div>
                <div>
                  <input type="text" placeholder="Challan Number" value={form.challan_no} onChange={e=>set('challan_no',e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-slate-400 focus:bg-white transition-all"/>
                  <p className="text-[10px] text-slate-400 mt-1">Add after dispatch / delivery</p>
                </div>
              </div>
            </div>

            <div className="mb-5">
              <FLabel>Priority Level</FLabel>
              <div className="space-y-2.5 mt-1">
                {[
                  ['High','Urgent attention','red','bg-red-500','border-red-400 bg-red-50','text-red-500'],
                  ['Medium','Normal turnaround','amber','bg-amber-500','border-amber-400 bg-amber-50','text-amber-500'],
                  ['Low','When available','emerald','bg-emerald-500','border-emerald-400 bg-emerald-50','text-emerald-500'],
                ].map(([v,desc,_clr,dot,active,check]) => (
                  <label key={v} className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border-2 cursor-pointer transition-all select-none ${form.priority===v ? active : 'border-slate-200 hover:border-slate-300'}`}>
                    <input type="radio" name="pri" className="hidden" value={v} checked={form.priority===v} onChange={()=>set('priority',v)}/>
                    <span className={`w-3 h-3 rounded-full ${dot} flex-shrink-0`}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-black text-slate-900">{v}</p>
                      <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">{desc}</p>
                    </div>
                    {form.priority===v && <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${check}`} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
                  </label>
                ))}
              </div>
            </div>

            {/* Summary card */}
            <div className="bg-slate-900 rounded-3xl p-4 sm:p-5 mb-5 sm:mb-6 text-white relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-blue-500/20 blur-3xl"/>
              <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 relative">Request Summary</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 relative">
                {[
                  ['Customer', form.customer_name||'—'],
                  ['Service',  sel?.label||'—'],
                  ['Priority', form.priority],
                  ...(!isInstallation(form.service_type)
                    ? [['Warranty', form.warranty_status==='in_warranty'?'✓ In Warranty':'⚠ Out of Warranty']]
                    : []),
                  ['Invoice',  form.invoice_no||'—'],
                  ['Challan',  form.challan_no||'—'],
                  ['Files',    `${files.length} attached`],
                  ['Voice',    voiceBlob ? '✓ Recorded' : '—'],
                ].map(([k,v]) => (
                  <div key={k}>
                    <p className="text-[9px] sm:text-[10px] text-slate-400 uppercase tracking-wider">{k}</p>
                    <p className="text-[11px] sm:text-xs font-bold text-white mt-0.5 truncate">{v}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row justify-between gap-2.5">
              <button onClick={()=>{setErr('');setStep(2);}} className="px-6 py-3 sm:py-2.5 border border-slate-200 text-slate-700 font-bold text-sm rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-1.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                Back
              </button>
              <button onClick={submit} disabled={busy}
                className="px-8 py-3 sm:py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm rounded-2xl shadow-md shadow-slate-900/10 flex items-center justify-center gap-2 transition-all disabled:opacity-70">
                {busy && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>}
                {busy ? 'Submitting…' : 'Submit Request'}
                {!busy && <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}