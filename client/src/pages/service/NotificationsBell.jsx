import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import svcApi from '../../serviceApi';
import { useSocket } from '../../useSocket';
import { useSvcAuth } from '../../context/SvcAuthContext';

/* ════════════════════════════════════════════════════════════════════
   Notifications system — one default export <NotificationsBell/> that
   renders BOTH the bell-icon-with-badge-and-dropdown AND the floating
   bottom-right toast container. Drop it into the topbar of any page
   and it handles everything (polling, socket, navigation, dismiss).
   
   Backend:
     GET    /notifications?scope=unread|all&limit=N
     GET    /notifications/unread-count
     PATCH  /notifications/:id/read
     PATCH  /notifications/read-all
   
   Socket event: 'notifications:new' (emitted to user:<id> rooms by notify())
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


export default function NotificationsBell() {
  const { svcUser } = useSvcAuth();
  const navigate    = useNavigate();
  const [open, setOpen]             = useState(false);
  const [scope, setScope]           = useState('unread');   // 'unread' | 'all'
  const [items, setItems]           = useState([]);
  const [unreadCount, setUnread]    = useState(0);
  const [loading, setLoading]       = useState(false);
  const [toasts, setToasts]         = useState([]);          // {id, title, body, link}
  const dropdownRef                 = useRef(null);
  const buttonRef                   = useRef(null);

  /* ───────── Load count (poll every 30s + on demand) ───────── */
  const loadCount = useCallback(async () => {
    try {
      const { data } = await svcApi.get('/notifications/unread-count');
      setUnread(data.count || 0);
    } catch (e) { /* silent */ }
  }, []);

  useEffect(() => {
    if (!svcUser) return;
    loadCount();
    const id = setInterval(loadCount, 30000);
    return () => clearInterval(id);
  }, [svcUser, loadCount]);

  /* ───────── Load list when dropdown opens (or scope toggles) ───────── */
  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await svcApi.get('/notifications', { params: { scope, limit: 50 } });
      setItems(data);
    } catch (e) { setItems([]); }
    finally { setLoading(false); }
  }, [scope]);

  useEffect(() => {
    if (open) loadList();
  }, [open, scope, loadList]);

  /* ───────── Live push: new notification arrives ───────── */
  useSocket({
    'notifications:new': (notif) => {
      if (!notif || notif.recipient_id !== svcUser?.id) return;
      // Bump count, refresh list if open
      setUnread(c => c + 1);
      if (open) loadList();
      // Pop a toast
      setToasts(prev => [...prev, notif]);
      // Auto-dismiss after 5s
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== notif.id)), 5000);
    },
  });

  /* ───────── Close dropdown on outside click ───────── */
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (dropdownRef.current?.contains(e.target)) return;
      if (buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  /* ───────── Actions ───────── */
  const markRead = async (n) => {
    if (n.read_at) return;
    try {
      await svcApi.patch(`/notifications/${n.id}/read`);
      setItems(prev => prev.map(it => it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it));
      setUnread(c => Math.max(0, c - 1));
    } catch (e) { /* silent */ }
  };

  const handleItemClick = async (n) => {
    await markRead(n);
    setOpen(false);
    if (n.link) {
      // If link starts with /service/admin but user is a worker, swap prefix
      let link = n.link;
      const isWorker = svcUser?.role === 'plc' || svcUser?.role === 'wireman';
      if (isWorker && link.startsWith('/service/admin/')) {
        link = link.replace('/service/admin/', '/service/worker/');
      }
      navigate(link);
    }
  };

  const markAll = async () => {
    try {
      await svcApi.patch('/notifications/read-all');
      setItems(prev => prev.map(it => it.read_at ? it : { ...it, read_at: new Date().toISOString() }));
      setUnread(0);
    } catch (e) { /* silent */ }
  };

  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));
  const clickToast = (t) => {
    removeToast(t.id);
    handleItemClick(t);
  };

  if (!svcUser) return null;

  return (
    <>
      {/* ───────── BELL BUTTON ───────── */}
      <div className="relative">
        <button
          ref={buttonRef}
          onClick={() => { setOpen(o => !o); if (!open) loadCount(); }}
          className="relative w-10 h-10 rounded-full bg-white border border-slate-200 hover:border-slate-400 transition-all flex items-center justify-center"
          title="Notifications">
          <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* ───────── DROPDOWN ───────── */}
        {open && (
          <div
            ref={dropdownRef}
            className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden z-50 animate-fade-in"
            style={{ maxHeight: 'calc(100vh - 120px)' }}>

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900">Notifications</h3>
                <p className="text-[10px] text-slate-400">
                  {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread`}
                </p>
              </div>
              {unreadCount > 0 && (
                <button onClick={markAll} className="text-[10px] font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-blue-50">
                  Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 240px)' }}>
              {loading ? (
                <div className="p-6 flex justify-center">
                  <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/>
                </div>
              ) : items.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 mx-auto flex items-center justify-center mb-3 text-2xl">🔔</div>
                  <p className="text-xs font-bold text-slate-600">
                    {scope === 'unread' ? 'No unread notifications' : 'Nothing here'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    You'll see @-mentions and updates here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {items.map(n => (
                    <NotificationRow
                      key={n.id}
                      n={n}
                      onClick={() => handleItemClick(n)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer: See all / See unread */}
            <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 flex items-center justify-center">
              {scope === 'unread' ? (
                <button onClick={() => setScope('all')}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 transition-all">
                  See all notifications →
                </button>
              ) : (
                <button onClick={() => setScope('unread')}
                  className="text-[11px] font-bold text-slate-600 hover:text-slate-900 transition-all">
                  ← Show only unread
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ───────── TOAST STACK (bottom-right) ───────── */}
      <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            onClick={() => clickToast(t)}
            className="pointer-events-auto bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/20 px-4 py-3 max-w-sm cursor-pointer hover:border-slate-400 transition-all animate-slide-up flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-base">🔔</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-slate-900 truncate">{t.title}</p>
              {t.body && <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{t.body}</p>}
              <p className="text-[9px] text-blue-600 font-bold mt-1">Click to open →</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
              className="w-6 h-6 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-700 flex-shrink-0 text-xs">
              ✕
            </button>
          </div>
        ))}
      </div>
    </>
  );
}


/* ───────── A single notification row in the dropdown ───────── */
function NotificationRow({ n, onClick }) {
  const isUnread  = !n.read_at;
  const isMention = n.type === 'note_mention';
  const ctx       = n.context || {};

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 flex gap-3 transition-all ${
        isUnread ? 'bg-blue-50/40 hover:bg-blue-50' : 'hover:bg-slate-50 opacity-80'
      }`}>
      {/* Type icon */}
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${
        isMention ? 'bg-violet-100' : 'bg-slate-100'
      }`}>
        {isMention ? '💬' : '🔔'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className={`text-xs ${isUnread ? 'font-black text-slate-900' : 'font-semibold text-slate-600'} flex-1 min-w-0`}>
            {n.title}
          </p>
          {isUnread && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1"/>}
        </div>
        {n.body && (
          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{n.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {ctx.ticket_no && (
            <span className="font-mono text-[9px] font-black text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded">{ctx.ticket_no}</span>
          )}
          {ctx.was_everyone && (
            <span className="text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">📢 everyone</span>
          )}
          <span className="text-[9px] text-slate-400">{fmtRelative(n.created_at)}</span>
        </div>
      </div>
    </button>
  );
}