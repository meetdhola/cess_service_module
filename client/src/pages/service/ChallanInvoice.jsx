import React, { useState, useEffect, useCallback, useRef } from 'react';
import svcApi from '../../serviceApi';

/* ════════════════════════════════════════════════════════════════════
   SHARED Invoice + Challan components.
   Imported by BOTH WorkerDashboard and AdminDashboard so the two roles
   read & write the SAME data:
     • Invoice  → single number on service_tickets.invoice_no
     • Challans → many rows in ticket_challans (number + file, ≥1 required)
   Backend: PATCH /tickets/:id/invoice  and  /tickets/:id/challans (CRUD).
   ════════════════════════════════════════════════════════════════════ */

/* Resolve a stored "/uploads/x" path to the file server origin (:5001). */
const fileUrl = (u) => !u ? '' : (u.startsWith('http') ? u : `${window.location.protocol}//${window.location.hostname}:5001${u}`);

const isImg = (name='') => ['jpg','jpeg','png','gif','webp','bmp','svg'].includes(name.split('.').pop()?.toLowerCase());
const isPdf = (name='') => name.split('.').pop()?.toLowerCase() === 'pdf';


/* ─── INVOICE EDITOR — single number, both roles can edit ─── */
export function InvoiceEditor({ ticket, onSaved }) {
  const [inv, setInv]       = useState(ticket.invoice_no || '');
  const [busy, setBusy]     = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // Keep in sync if the ticket prop refreshes (e.g. another role edited it)
  useEffect(() => { setInv(ticket.invoice_no || ''); }, [ticket.invoice_no]);

  const dirty = inv !== (ticket.invoice_no || '');

  const save = async () => {
    setBusy(true);
    try {
      await svcApi.patch(`/tickets/${ticket.id}/invoice`, { invoice_no: inv || null });
      setSavedAt(new Date());
      onSaved?.();
    } catch (e) { alert(e.response?.data?.error || 'Failed to save invoice'); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invoice No</label>
      <div className="flex items-center gap-2 mt-1">
        <input value={inv} onChange={e => setInv(e.target.value)} placeholder="e.g. INV/2026/0123"
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 focus:bg-white transition-all"/>
        <button onClick={save} disabled={busy || !dirty}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap">
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      <div className="flex items-center gap-3 mt-1">
        {ticket.invoice_date && <p className="text-[9px] text-slate-400">Updated {new Date(ticket.invoice_date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'2-digit'})}</p>}
        {savedAt && <span className="text-[9px] text-emerald-600 font-bold">✓ Saved {savedAt.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})}</span>}
      </div>
    </div>
  );
}


/* ─── CHALLAN PANEL — multiple challans (number + file), both roles ─── */
export function ChallanPanel({ ticketId }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [no, setNo]           = useState('');
  const [note, setNote]       = useState('');
  const [files, setFiles]     = useState([]);
  const [saving, setSaving]   = useState(false);
  const [editId, setEditId]   = useState(null);   // id being edited
  const [editNo, setEditNo]   = useState('');
  const [editNote, setEditNote] = useState('');
  const [editFile, setEditFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const addRef  = useRef(null);
  const editRef = useRef(null);

  const load = useCallback(async () => {
    try { const { data } = await svcApi.get(`/tickets/${ticketId}/challans`); setList(data); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  const canAdd = (no.trim() || files.length > 0) && !saving;

  const add = async () => {
    if (!no.trim() && !files.length) { alert('Add a challan number or attach a file.'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      if (no.trim()) fd.append('challan_no', no.trim());
      if (note.trim()) fd.append('note', note.trim());
      for (const f of files) fd.append('file', f);
      await svcApi.post(`/tickets/${ticketId}/challans`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setNo(''); setNote(''); setFiles([]); if (addRef.current) addRef.current.value = '';
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to add challan');
      setSaving(false);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (c) => { setEditId(c.id); setEditNo(c.challan_no || ''); setEditNote(c.note || ''); setEditFile(null); };
  const cancelEdit = () => { setEditId(null); setEditNo(''); setEditNote(''); setEditFile(null); if (editRef.current) editRef.current.value = ''; };

  const saveEdit = async (c) => {
    if (!editNo.trim() && !editFile && !c.file_url) { alert('A challan needs a number or a file.'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      if (editNo.trim()) fd.append('challan_no', editNo.trim());
      fd.append('note', editNote.trim());
      if (editFile) fd.append('file', editFile);
      await svcApi.patch(`/tickets/${ticketId}/challans/${c.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      cancelEdit();
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed to update challan'); }
    finally { setSaving(false); }
  };

  const del = async (c) => {
    if (!window.confirm('Delete this challan?')) return;
    try { await svcApi.delete(`/tickets/${ticketId}/challans/${c.id}`); await load(); }
    catch (e) { alert(e.response?.data?.error || 'Failed to delete'); }
  };

  const roleBadge = (r) => {
    const map = {
      plc:'bg-blue-100 text-blue-700', wireman:'bg-emerald-100 text-emerald-700',
      admin:'bg-violet-100 text-violet-700', superadmin:'bg-amber-100 text-amber-700',
    };
    return map[r] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/></svg>
        <p className="text-xs font-black text-slate-700">Challans</p>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{list.length}</span>
      </div>

      {/* Add row */}
      <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3 mb-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <input value={no} onChange={e=>setNo(e.target.value)} placeholder="Challan no (e.g. CH/2026/0456)"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 focus:bg-white transition-all"/>
          <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Optional note"
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 focus:bg-white transition-all"/>
        </div>
        <div className="flex items-center gap-2">
          <input ref={addRef} type="file" accept="image/*,application/pdf" className="hidden" multiple onChange={e=>setFiles(Array.from(e.target.files||[]))}/>
          <button onClick={()=>addRef.current?.click()}
            className={`flex items-center gap-1.5 px-3 py-2 border rounded-xl text-xs font-bold transition-all ${files.length>0?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-400'}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            {files.length>0 ? <span className="max-w-[120px] truncate">{files.length===1?files[0].name:`${files.length} files`}</span> : 'Attach file'}
          </button>
          {files.length>0 && <button onClick={()=>{setFiles([]); if(addRef.current) addRef.current.value='';}} className="text-[11px] font-bold text-red-500 hover:text-red-600">Clear</button>}
          <button onClick={add} disabled={!canAdd}
            className="ml-auto flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            {saving ? 'Adding…' : '+ Add Challan'}
          </button>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="h-12 bg-slate-50 rounded-xl animate-pulse"/>
      ) : list.length === 0 ? (
        <p className="text-center text-[11px] text-slate-400 py-3">No challans yet</p>
      ) : (
        <div className="space-y-2">
          {list.map(c => (
            <div key={c.id} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
              {editId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={editNo} onChange={e=>setEditNo(e.target.value)} placeholder="Challan no"
                      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-500"/>
                    <input value={editNote} onChange={e=>setEditNote(e.target.value)} placeholder="Note"
                      className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs outline-none focus:border-slate-500"/>
                  </div>
                  <div className="flex items-center gap-2">
                    <input ref={editRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={e=>setEditFile(e.target.files?.[0]||null)}/>
                    <button onClick={()=>editRef.current?.click()}
                      className={`px-3 py-1.5 border rounded-lg text-[11px] font-bold transition-all ${editFile?'bg-emerald-50 border-emerald-200 text-emerald-700':'bg-white border-slate-300 text-slate-600'}`}>
                      {editFile ? <span className="max-w-[120px] truncate inline-block align-bottom">{editFile.name}</span> : (c.file_url ? 'Replace file' : 'Attach file')}
                    </button>
                    <button onClick={()=>saveEdit(c)} disabled={saving} className="ml-auto px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-lg disabled:opacity-60">Save</button>
                    <button onClick={cancelEdit} className="px-3 py-1.5 border border-slate-200 text-slate-600 text-[11px] font-bold rounded-lg hover:bg-slate-100">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  {/* thumbnail / icon */}
                  {c.file_url && (
                    <button onClick={()=>setPreview(c)} className="w-10 h-10 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0 hover:border-blue-400">
                      {isImg(c.file_name) ? <img src={fileUrl(c.file_url)} alt="" className="w-full h-full object-cover"/> : <span className="text-base">{isPdf(c.file_name)?'📕':'📎'}</span>}
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.challan_no
                        ? <span className="font-mono text-[11px] font-black text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded">{c.challan_no}</span>
                        : <span className="text-[10px] italic text-slate-400">No number</span>}
                      {c.added_role && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${roleBadge(c.added_role)}`}>{c.added_role==='superadmin'?'super admin':c.added_role}</span>}
                    </div>
                    {c.note && <p className="text-[10px] text-slate-500 italic mt-0.5 truncate">"{c.note}"</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {c.added_by_name || 'Unknown'}{c.created_at ? ` · ${new Date(c.created_at).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {c.file_url && <button onClick={()=>setPreview(c)} className="text-[11px] font-bold text-blue-600 hover:text-blue-700">View</button>}
                    <button onClick={()=>startEdit(c)} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">Edit</button>
                    <button onClick={()=>del(c)} className="text-[11px] font-bold text-red-500 hover:text-red-600">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Preview lightbox */}
      {preview && preview.file_url && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-fade-in"
             onClick={e => e.target === e.currentTarget && setPreview(null)}>
          <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-900 truncate">{preview.challan_no || preview.file_name || 'Challan'}</p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">{preview.added_by_name || ''}{preview.file_name ? ` · ${preview.file_name}` : ''}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a href={fileUrl(preview.file_url)} download={preview.file_name || 'challan'}
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-full hover:bg-slate-100">
                  Download
                </a>
                <button onClick={()=>setPreview(null)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200">✕</button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-2 sm:p-6 min-h-0">
              {isImg(preview.file_name)
                ? <img src={fileUrl(preview.file_url)} alt="" className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-lg"/>
                : isPdf(preview.file_name)
                  ? <iframe src={fileUrl(preview.file_url)} title="challan" className="w-full h-[78vh] rounded-2xl border border-slate-200 bg-white"/>
                  : <a href={fileUrl(preview.file_url)} download className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold">Download file</a>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}