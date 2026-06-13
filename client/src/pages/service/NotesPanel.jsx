import React, { useState, useEffect, useCallback, useRef } from 'react';
import svcApi from '../../serviceApi';
import { useSocket } from '../../useSocket';
import { MentionInput, MentionedText } from './MentionComponents';

const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:true}) : '';
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}) : '';
const initials = (name='') => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()||'?';

const ROLE_STYLE = {
  plc:        { bg:'linear-gradient(135deg,#3b82f6,#1d4ed8)', badge:'background:#ede9fe;color:#5b21b6' },
  wireman:    { bg:'linear-gradient(135deg,#10b981,#059669)', badge:'background:#d1fae5;color:#065f46' },
  admin:      { bg:'linear-gradient(135deg,#8b5cf6,#6d28d9)', badge:'background:#ede9fe;color:#5b21b6' },
  superadmin: { bg:'linear-gradient(135deg,#f59e0b,#ef4444)', badge:'background:#fef3c7;color:#92400e' },
};
const myStyle = { bg:'linear-gradient(135deg,#6366f1,#4f46e5)', badge:'background:#ede9fe;color:#5b21b6' };

const windowRemaining = createdAt => Math.max(0, 600 - (Date.now() - new Date(createdAt).getTime()) / 1000);

function Countdown({ createdAt }) {
  const [rem, setRem] = useState(() => windowRemaining(createdAt));
  useEffect(() => {
    const id = setInterval(() => setRem(windowRemaining(createdAt)), 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  if (rem <= 0) return null;
  const m = Math.floor(rem / 60), s = Math.floor(rem % 60);
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:'4px',background:'#fef3c7',color:'#d97706',fontSize:'9px',fontWeight:700,padding:'2px 8px',borderRadius:'6px'}}>
      <svg width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      {m}m {s.toString().padStart(2,'0')}s
    </span>
  );
}

export default function NotesPanel({ ticketId, currentUserId }) {
  const [notes,     setNotes]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [body,      setBody]      = useState('');
  const [sending,   setSending]   = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBody,  setEditBody]  = useState('');
  const scrollerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await svcApi.get(`/tickets/${ticketId}/notes`);
      setNotes(data.filter(n => !n.is_unsent));
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  useSocket({
    'note:added':  e => { if (e?.ticket_id === ticketId) load(); },
    'note:edited': e => { if (e?.ticket_id === ticketId) load(); },
    'note:unsent': e => { if (e?.ticket_id === ticketId) setNotes(p => p.filter(n => n.id !== e.noteId)); },
  });

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [notes.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    setNotes(p => [...p, { id:tempId, body:text, author_id:currentUserId, author_name:'You', author_role:null, created_at:new Date().toISOString(), _pending:true }]);
    setBody('');
    try {
      const { data } = await svcApi.post(`/tickets/${ticketId}/notes`, { body: text });
      setNotes(p => p.map(n => n.id === tempId ? data : n));
    } catch(e) {
      setNotes(p => p.filter(n => n.id !== tempId));
      setBody(text);
      alert(e.response?.data?.error || 'Failed to send');
    } finally { setSending(false); }
  };

  const saveEdit = async noteId => {
    const text = editBody.trim();
    if (!text) return;
    try {
      const { data } = await svcApi.patch(`/tickets/${ticketId}/notes/${noteId}`, { body: text });
      setNotes(p => p.map(n => n.id === noteId ? { ...n, ...data } : n));
      setEditingId(null);
    } catch(e) { alert(e.response?.data?.error || 'Edit failed'); }
  };

  const unsend = async noteId => {
    if (!window.confirm('Unsend this note? It will be hidden from everyone.')) return;
    try {
      await svcApi.delete(`/tickets/${ticketId}/notes/${noteId}`);
      setNotes(p => p.filter(n => n.id !== noteId));
    } catch(e) { alert(e.response?.data?.error || 'Unsend failed'); }
  };

  // Group notes by date
  const grouped = [];
  let lastDate = null;
  for (const n of notes) {
    const d = new Date(n.created_at).toDateString();
    if (d !== lastDate) { grouped.push({ type:'date', label: fmtDate(n.created_at) }); lastDate = d; }
    grouped.push({ type:'note', data: n });
  }

  const S = {
    wrap: { fontFamily:'-apple-system,BlinkMacSystemFont,Inter,sans-serif' },
    head: { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',background:'#fff',borderBottom:'1px solid #f3f4f6' },
    headL: { display:'flex',alignItems:'center',gap:'8px' },
    dot: { width:'8px',height:'8px',borderRadius:'50%',background:'#10b981',boxShadow:'0 0 0 2px #d1fae5' },
    title: { fontSize:'13px',fontWeight:'700',color:'#111827' },
    sub: { fontSize:'10px',color:'#9ca3af',fontWeight:'500' },
    thread: { padding:'8px 0',maxHeight:'280px',overflowY:'auto',background:'#fff' },
    dsep: { display:'flex',alignItems:'center',gap:'8px',padding:'6px 16px 10px' },
    dsepLine: { flex:'1',height:'1px',background:'#f3f4f6' },
    dsepTxt: { fontSize:'10px',fontWeight:'600',color:'#d1d5db',whiteSpace:'nowrap' },
    msg: { display:'flex',gap:'10px',padding:'4px 16px',cursor:'default' },
    av: { width:'32px',height:'32px',borderRadius:'10px',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:'800',color:'#fff',letterSpacing:'-0.3px' },
    mcol: { flex:1,minWidth:0 },
    mhead: { display:'flex',alignItems:'baseline',gap:'7px',marginBottom:'4px',flexWrap:'wrap' },
    mname: { fontSize:'12px',fontWeight:'700',color:'#111827' },
    mrole: { fontSize:'9px',fontWeight:'700',padding:'1px 6px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.3px' },
    mtime: { fontSize:'10px',color:'#d1d5db',marginLeft:'auto' },
    medited: { fontSize:'9px',color:'#d1d5db',fontStyle:'italic' },
    mbody: { fontSize:'13px',color:'#374151',lineHeight:'1.55',wordBreak:'break-word' },
    mbodyMine: { background:'#f5f3ff',borderLeft:'3px solid #6366f1',padding:'8px 12px',borderRadius:'0 10px 10px 0',color:'#1e1b4b',fontSize:'13px',lineHeight:'1.55',wordBreak:'break-word' },
    mfooter: { display:'flex',alignItems:'center',gap:'6px',marginTop:'6px',flexWrap:'wrap' },
    actBtn: (hover) => ({ height:'22px',padding:'0 8px',borderRadius:'6px',border:'1px solid #e5e7eb',background:'#fff',fontSize:'10px',fontWeight:'600',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'4px',color:'#6b7280' }),
    editArea: { marginTop:'6px',background:'#f5f3ff',border:'1.5px solid #6366f1',borderRadius:'10px',overflow:'hidden' },
    editTA: { width:'100%',background:'transparent',border:'none',outline:'none',padding:'10px 12px',fontSize:'13px',color:'#1e1b4b',resize:'none',lineHeight:'1.55',fontFamily:'inherit' },
    editBtns: { display:'flex',gap:'6px',justifyContent:'flex-end',padding:'6px 10px 8px',borderTop:'1px solid #e0e7ff' },
    unsent: { display:'flex',alignItems:'center',gap:'6px',padding:'6px 10px',background:'#f9fafb',border:'1px dashed #e5e7eb',borderRadius:'8px',fontSize:'11px',color:'#9ca3af',fontStyle:'italic',width:'fit-content' },
    pending: { fontSize:'13px',color:'#9ca3af',lineHeight:'1.55',fontStyle:'italic' },
    compWrap: { borderTop:'1px solid #f3f4f6',padding:'12px 14px',background:'#fff' },
    compBox: { background:'#f9fafb',border:'1.5px solid #e5e7eb',borderRadius:'14px',overflow:'visible',transition:'all 0.15s',position:'relative' },
    compTop: { display:'flex',alignItems:'flex-end',gap:'8px',padding:'10px 12px 6px',position:'relative' },
    compTA: { flex:1,background:'transparent',border:'none',outline:'none',fontSize:'13px',color:'#111827',resize:'none',lineHeight:'1.5',fontFamily:'inherit' },
    compBot: { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 12px 8px' },
    compHint: { fontSize:'9px',color:'#d1d5db' },
    compMention: { fontSize:'9px',color:'#9ca3af',background:'#f3f4f6',padding:'1px 7px',borderRadius:'6px' },
    sendBtn: { width:'32px',height:'32px',background:'#6366f1',borderRadius:'10px',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 },
  };

  return (
    <div style={S.wrap}>
      {/* Header */}
      <div style={S.head}>
        <div style={S.headL}>
          <div style={S.dot}/>
          <span style={S.title}>Notes</span>
          <span style={S.sub}>· {notes.length} message{notes.length!==1?'s':''}</span>
        </div>
      </div>

      {/* Thread */}
      <div ref={scrollerRef} style={S.thread}>
        {loading ? (
          <div style={{padding:'20px 16px',display:'flex',flexDirection:'column',gap:'16px'}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{display:'flex',gap:'10px'}}>
                <div style={{width:'32px',height:'32px',borderRadius:'10px',background:'#f3f4f6',flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{height:'10px',background:'#f3f4f6',borderRadius:'4px',width:'120px',marginBottom:'8px'}}/>
                  <div style={{height:'36px',background:'#f9fafb',borderRadius:'8px'}}/>
                </div>
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 16px',gap:'8px'}}>
            <div style={{width:'40px',height:'40px',borderRadius:'12px',background:'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="18" height="18" fill="none" stroke="#9ca3af" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            </div>
            <span style={{fontSize:'12px',fontWeight:'600',color:'#374151'}}>No notes yet</span>
            <span style={{fontSize:'11px',color:'#9ca3af'}}>Start the conversation below</span>
          </div>
        ) : (
          grouped.map((item, idx) => {
            if (item.type === 'date') return (
              <div key={`d-${idx}`} style={S.dsep}>
                <div style={S.dsepLine}/>
                <span style={S.dsepTxt}>{item.label}</span>
                <div style={S.dsepLine}/>
              </div>
            );
            const n = item.data;
            const mine = currentUserId && n.author_id === currentUserId;
            const rs = mine ? myStyle : (ROLE_STYLE[n.author_role] || ROLE_STYLE.admin);
            const remaining = mine && !n._pending ? windowRemaining(n.created_at) : 0;
            const canAct = remaining > 0;
            const isEditing = editingId === n.id;

            return (
              <div key={n.id} style={{...S.msg, background:'transparent'}}
                onMouseEnter={e => e.currentTarget.style.background='#fafafa'}
                onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                <div style={{...S.av, background: rs.bg}}>{initials(mine?'You':n.author_name)}</div>
                <div style={S.mcol}>
                  <div style={S.mhead}>
                    <span style={S.mname}>{mine ? 'You' : (n.author_name || 'Unknown')}</span>
                    {n.author_role && (
                      <span style={{...S.mrole, ...(Object.fromEntries(rs.badge.split(';').filter(Boolean).map(p => { const [k,v]=p.split(':'); return [k.trim().replace(/-([a-z])/g,(_,c)=>c.toUpperCase()),v?.trim()]; })))}}>
                        {n.author_role==='superadmin'?'Super':n.author_role}
                      </span>
                    )}
                    <span style={S.mtime}>{fmtTime(n.created_at)}</span>
                    {n.edited_at && <span style={S.medited}>· edited</span>}
                  </div>

                  {n._pending ? (
                    <div style={S.pending}>Sending…</div>
                  ) : isEditing ? (
                    <div style={S.editArea}>
                      <textarea
                        style={S.editTA} rows={2} value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        onKeyDown={e => { if ((e.metaKey||e.ctrlKey)&&e.key==='Enter') saveEdit(n.id); if(e.key==='Escape') setEditingId(null); }}
                        autoFocus
                      />
                      <div style={S.editBtns}>
                        <button onClick={() => setEditingId(null)} style={{...S.actBtn(),background:'#f3f4f6',border:'none',borderRadius:'7px',height:'26px',padding:'0 12px',fontSize:'10px',fontWeight:'700',color:'#374151',cursor:'pointer'}}>Cancel</button>
                        <button onClick={() => saveEdit(n.id)} style={{...S.actBtn(),background:'#6366f1',border:'none',borderRadius:'7px',height:'26px',padding:'0 12px',fontSize:'10px',fontWeight:'700',color:'#fff',cursor:'pointer'}}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <div style={mine ? S.mbodyMine : S.mbody}>
                      <MentionedText body={n.body} currentUserId={currentUserId} authorId={n.author_id}/>
                    </div>
                  )}

                  {mine && canAct && !n._pending && !isEditing && (
                    <div style={S.mfooter}>
                      <Countdown createdAt={n.created_at}/>
                      <button
                        onClick={() => { setEditingId(n.id); setEditBody(n.body); }}
                        style={S.actBtn()}>
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Edit
                      </button>
                      <button
                        onClick={() => unsend(n.id)}
                        style={{...S.actBtn(), color:'#ef4444'}}>
                        <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                        Unsend
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div style={S.compWrap}>
        <div style={S.compBox}>
          <div style={S.compTop}>
            <MentionInput
              ticketId={ticketId} value={body} onChange={setBody}
              onSubmit={send} disabled={sending}
              placeholder="Write a note… use @ to mention someone"
            />
            <button onClick={send} disabled={!body.trim()||sending} style={{...S.sendBtn, opacity:(!body.trim()||sending)?0.4:1}}>
              <svg width="14" height="14" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div style={S.compBot}>
            <span style={S.compHint}>⌘ Enter to send</span>
            <span style={S.compMention}>@ mention</span>
          </div>
        </div>
      </div>
    </div>
  );
}
