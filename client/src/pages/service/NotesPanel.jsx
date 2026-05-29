import React, { useState, useEffect, useCallback, useRef } from 'react';
import svcApi from '../../serviceApi';
import { useSocket } from '../../useSocket';
import { MentionInput, MentionedText } from './MentionComponents';

/* ════════════════════════════════════════════════════════════════════
   SHARED Notes panel — used by both WorkerDashboard and AdminDashboard.
   Backend:
     GET  /tickets/:id/notes  → ordered chronological, with author info
     POST /tickets/:id/notes  → { body } → returns row with author_name/role
     Socket emits 'note:added' to the 'admins' room.
   
   v2 — supports @-mentions via MentionInput + MentionedText.
   ════════════════════════════════════════════════════════════════════ */

const fmtRelative = (iso) => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)        return 'just now';
  if (diff < 3600)      return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400)     return `${Math.floor(diff/3600)}h ago`;
  if (diff < 86400*7)   return `${Math.floor(diff/86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
};

const roleBadge = (r) => {
  const map = {
    plc:        'bg-blue-100 text-blue-700',
    wireman:    'bg-emerald-100 text-emerald-700',
    admin:      'bg-violet-100 text-violet-700',
    superadmin: 'bg-amber-100 text-amber-700',
  };
  return map[r] || 'bg-slate-100 text-slate-600';
};

const initials = (name='') => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';

const avatarBg = (r) => {
  const map = {
    plc:        'from-blue-500 to-indigo-600',
    wireman:    'from-emerald-500 to-green-600',
    admin:      'from-violet-500 to-purple-600',
    superadmin: 'from-amber-400 to-orange-500',
  };
  return map[r] || 'from-slate-400 to-slate-600';
};


export default function NotesPanel({ ticketId, currentUserId }) {
  const [notes, setNotes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [body, setBody]         = useState('');
  const [sending, setSending]   = useState(false);
  const scrollerRef             = useRef(null);

  const load = useCallback(async () => {
    try {
      const { data } = await svcApi.get(`/tickets/${ticketId}/notes`);
      setNotes(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);

  useSocket({
    'note:added': (e) => { if (e?.ticket_id === ticketId) load(); }
  });

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [notes.length]);

  const send = async () => {
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const tempId = `tmp-${Date.now()}`;
    const optimistic = {
      id: tempId, body: text, author_id: currentUserId,
      author_name: 'You', author_role: null,
      created_at: new Date().toISOString(), _pending: true,
    };
    setNotes(prev => [...prev, optimistic]);
    setBody('');
    try {
      const { data } = await svcApi.post(`/tickets/${ticketId}/notes`, { body: text });
      setNotes(prev => prev.map(n => n.id === tempId ? data : n));
    } catch (e) {
      setNotes(prev => prev.filter(n => n.id !== tempId));
      setBody(text);
      alert(e.response?.data?.error || 'Failed to send note');
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <p className="text-xs font-black text-slate-700">Notes</p>
        <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{notes.length}</span>
      </div>

      {/* Thread */}
      <div ref={scrollerRef} className="bg-slate-50/60 border border-slate-200 rounded-2xl p-3 mb-3 max-h-72 overflow-y-auto">
        {loading ? (
          <div className="space-y-2">
            <div className="h-10 bg-white rounded-xl animate-pulse"/>
            <div className="h-10 bg-white rounded-xl animate-pulse w-3/4"/>
          </div>
        ) : notes.length === 0 ? (
          <p className="text-center text-[11px] text-slate-400 py-6">No notes yet — start the conversation</p>
        ) : (
          <div className="space-y-2.5">
            {notes.map(n => {
              const mine = currentUserId && n.author_id === currentUserId;
              return (
                <div key={n.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarBg(n.author_role)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ring-2 ring-white shadow-sm`}>
                    {initials(n.author_name)}
                  </div>
                  <div className={`max-w-[78%] min-w-0 ${mine ? 'items-end text-right' : 'items-start'} flex flex-col`}>
                    <div className={`flex items-center gap-1.5 mb-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[11px] font-bold text-slate-700 truncate">{mine ? 'You' : (n.author_name || 'Unknown')}</span>
                      {n.author_role && !mine && (
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0 rounded ${roleBadge(n.author_role)}`}>
                          {n.author_role === 'superadmin' ? 'super' : n.author_role}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400">{fmtRelative(n.created_at)}</span>
                      {n._pending && <span className="text-[9px] text-slate-400 italic">sending…</span>}
                    </div>
                    <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed border ${
                      mine
                        ? 'bg-blue-50 border-blue-100 text-blue-900 rounded-tr-sm'
                        : 'bg-white border-slate-200 text-slate-800 rounded-tl-sm'
                    } ${n._pending ? 'opacity-60' : ''}`}>
                      <MentionedText body={n.body}/>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Composer with @-mention support */}
      <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-end gap-2 focus-within:border-slate-400 transition-all">
        <div className="flex-1 min-w-0">
          <MentionInput
            ticketId={ticketId}
            value={body}
            onChange={setBody}
            onSubmit={send}
            disabled={sending}
            placeholder="Add a note… (@ to mention; ⌘/Ctrl+Enter to send)"
          />
        </div>
        <button
          onClick={send}
          disabled={!body.trim() || sending}
          className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}




// import React, { useState, useEffect, useCallback, useRef } from 'react';
// import svcApi from '../../serviceApi';
// import { useSocket } from '../../useSocket';

// /* ════════════════════════════════════════════════════════════════════
//    SHARED Notes panel — used by both WorkerDashboard and AdminDashboard.
//    Backend:
//      GET  /tickets/:id/notes  → ordered chronological, with author info
//      POST /tickets/:id/notes  → { body } → returns row with author_name/role
//      Socket emits 'note:added' to the 'admins' room.
//    Workers must be assigned to the ticket to POST; reading is open to any
//    logged-in user.
//    ════════════════════════════════════════════════════════════════════ */

// const fmtRelative = (iso) => {
//   if (!iso) return '';
//   const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
//   if (diff < 60)        return 'just now';
//   if (diff < 3600)      return `${Math.floor(diff/60)}m ago`;
//   if (diff < 86400)     return `${Math.floor(diff/3600)}h ago`;
//   if (diff < 86400*7)   return `${Math.floor(diff/86400)}d ago`;
//   return new Date(iso).toLocaleDateString('en-IN', { day:'numeric', month:'short' });
// };

// const roleBadge = (r) => {
//   const map = {
//     plc:        'bg-blue-100 text-blue-700',
//     wireman:    'bg-emerald-100 text-emerald-700',
//     admin:      'bg-violet-100 text-violet-700',
//     superadmin: 'bg-amber-100 text-amber-700',
//   };
//   return map[r] || 'bg-slate-100 text-slate-600';
// };

// const initials = (name='') => name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() || '?';

// const avatarBg = (r) => {
//   const map = {
//     plc:        'from-blue-500 to-indigo-600',
//     wireman:    'from-emerald-500 to-green-600',
//     admin:      'from-violet-500 to-purple-600',
//     superadmin: 'from-amber-400 to-orange-500',
//   };
//   return map[r] || 'from-slate-400 to-slate-600';
// };


// export default function NotesPanel({ ticketId, currentUserId }) {
//   const [notes, setNotes]       = useState([]);
//   const [loading, setLoading]   = useState(true);
//   const [body, setBody]         = useState('');
//   const [sending, setSending]   = useState(false);
//   const scrollerRef             = useRef(null);
//   const textareaRef             = useRef(null);

//   const load = useCallback(async () => {
//     try {
//       const { data } = await svcApi.get(`/tickets/${ticketId}/notes`);
//       setNotes(data);
//     } catch (e) { console.error(e); }
//     finally { setLoading(false); }
//   }, [ticketId]);

//   useEffect(() => { load(); }, [load]);

//   // Light polling so the other side's notes appear without a manual refresh
//   useEffect(() => {
//     const id = setInterval(load, 15000);
//     return () => clearInterval(id);
//   }, [load]);

//   // Live push (admins room — workers fall back to the 15s poll)
//   useSocket({
//     'note:added': (e) => { if (e?.ticket_id === ticketId) load(); }
//   });

//   // Auto-scroll to newest after notes load/grow
//   useEffect(() => {
//     const el = scrollerRef.current;
//     if (el) el.scrollTop = el.scrollHeight;
//   }, [notes.length]);

//   const send = async () => {
//     const text = body.trim();
//     if (!text || sending) return;
//     setSending(true);
//     // Optimistic append
//     const tempId = `tmp-${Date.now()}`;
//     const optimistic = {
//       id: tempId, body: text, author_id: currentUserId,
//       author_name: 'You', author_role: null,
//       created_at: new Date().toISOString(), _pending: true,
//     };
//     setNotes(prev => [...prev, optimistic]);
//     setBody('');
//     try {
//       const { data } = await svcApi.post(`/tickets/${ticketId}/notes`, { body: text });
//       setNotes(prev => prev.map(n => n.id === tempId ? data : n));
//     } catch (e) {
//       // Rollback on failure
//       setNotes(prev => prev.filter(n => n.id !== tempId));
//       setBody(text);
//       alert(e.response?.data?.error || 'Failed to send note');
//     } finally {
//       setSending(false);
//       textareaRef.current?.focus();
//     }
//   };

//   const onKeyDown = (e) => {
//     if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
//       e.preventDefault();
//       send();
//     }
//   };

//   return (
//     <div>
//       <div className="flex items-center gap-2 mb-3">
//         <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
//           <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
//         </svg>
//         <p className="text-xs font-black text-slate-700">Notes</p>
//         <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{notes.length}</span>
//       </div>

//       {/* Thread */}
//       <div ref={scrollerRef} className="bg-slate-50/60 border border-slate-200 rounded-2xl p-3 mb-3 max-h-72 overflow-y-auto">
//         {loading ? (
//           <div className="space-y-2">
//             <div className="h-10 bg-white rounded-xl animate-pulse"/>
//             <div className="h-10 bg-white rounded-xl animate-pulse w-3/4"/>
//           </div>
//         ) : notes.length === 0 ? (
//           <p className="text-center text-[11px] text-slate-400 py-6">No notes yet — start the conversation</p>
//         ) : (
//           <div className="space-y-2.5">
//             {notes.map(n => {
//               const mine = currentUserId && n.author_id === currentUserId;
//               return (
//                 <div key={n.id} className={`flex gap-2.5 ${mine ? 'flex-row-reverse' : ''}`}>
//                   {/* Avatar */}
//                   <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${avatarBg(n.author_role)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ring-2 ring-white shadow-sm`}>
//                     {initials(n.author_name)}
//                   </div>
//                   {/* Bubble */}
//                   <div className={`max-w-[78%] min-w-0 ${mine ? 'items-end text-right' : 'items-start'} flex flex-col`}>
//                     <div className={`flex items-center gap-1.5 mb-0.5 ${mine ? 'flex-row-reverse' : ''}`}>
//                       <span className="text-[11px] font-bold text-slate-700 truncate">{mine ? 'You' : (n.author_name || 'Unknown')}</span>
//                       {n.author_role && !mine && (
//                         <span className={`text-[8px] font-bold uppercase tracking-wider px-1 py-0 rounded ${roleBadge(n.author_role)}`}>
//                           {n.author_role === 'superadmin' ? 'super' : n.author_role}
//                         </span>
//                       )}
//                       <span className="text-[9px] text-slate-400">{fmtRelative(n.created_at)}</span>
//                       {n._pending && <span className="text-[9px] text-slate-400 italic">sending…</span>}
//                     </div>
//                     <div className={`px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap break-words border ${
//                       mine
//                         ? 'bg-blue-50 border-blue-100 text-blue-900 rounded-tr-sm'
//                         : 'bg-white border-slate-200 text-slate-800 rounded-tl-sm'
//                     } ${n._pending ? 'opacity-60' : ''}`}>
//                       {n.body}
//                     </div>
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         )}
//       </div>

//       {/* Composer */}
//       <div className="bg-white border border-slate-200 rounded-2xl p-2 flex items-end gap-2 focus-within:border-slate-400 transition-all">
//         <textarea
//           ref={textareaRef}
//           value={body}
//           onChange={e=>setBody(e.target.value)}
//           onKeyDown={onKeyDown}
//           rows={1}
//           placeholder="Add a note… (⌘/Ctrl+Enter to send)"
//           className="flex-1 resize-none bg-transparent outline-none text-xs text-slate-800 placeholder-slate-400 px-2 py-2 min-h-[36px] max-h-32"
//           style={{ scrollbarWidth:'thin' }}
//         />
//         <button
//           onClick={send}
//           disabled={!body.trim() || sending}
//           className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
//           {sending ? '…' : 'Send'}
//         </button>
//       </div>
//     </div>
//   );
// }