#!/usr/bin/env python3
"""
Adds MultiFileUpload component to TicketDetailPage.jsx
Run from: /Users/meetdhola/Downloads/cess-service-v3
"""

MULTI_FILE_COMPONENT = """
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

"""

with open('client/src/pages/service/TicketDetailPage.jsx', 'r') as f:
    c = f.read()

TARGET = "/* ═════════════════════════════════════════════════════════════════\n   MULTI FILE UPLOAD"
if TARGET not in c:
    # Insert before WorkerBillingSummary
    INSERT_BEFORE = "/* ─── Worker's slim billing summary (no edit) ─── */"
    if INSERT_BEFORE in c:
        c = c.replace(INSERT_BEFORE, MULTI_FILE_COMPONENT + INSERT_BEFORE)
        with open('client/src/pages/service/TicketDetailPage.jsx', 'w') as f:
            f.write(c)
        print("✅ MultiFileUpload component added")
    else:
        print("❌ Could not find insertion point for MultiFileUpload")
        # Show nearby
        for i,l in enumerate(c.split('\n')):
            if 'slim billing' in l or 'WorkerBilling' in l:
                print(f"  line {i+1}: {l.strip()}")
else:
    print("⏭  MultiFileUpload already exists")
