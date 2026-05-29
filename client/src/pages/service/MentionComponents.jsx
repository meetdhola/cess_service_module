import React, { useState, useEffect, useRef, useCallback } from 'react';
import svcApi from '../../serviceApi';

/* ════════════════════════════════════════════════════════════════════
   Mention components — two exports:
   
     <MentionInput ticketId={...} value={text} onChange={setText}
                   onSubmit={fn} disabled={bool} placeholder="…" />
         Textarea-like input that auto-suggests users when the cursor
         hits an "@" character. Selection inserts a "@[Name](uuid)" 
         token into the value. Backspace right after a token deletes
         the whole token (atomic chip behavior).
   
     <MentionedText body={raw} />
         Renders the raw body, parsing "@[Name](uuid)" tokens as
         colored chips with click-to-toggle tooltip showing name + 
         role + phone (fetched lazily on first hover/click).
   ════════════════════════════════════════════════════════════════════ */

const TOKEN_RE = /@\[([^\]]+)\]\(([^)]+)\)/g;

/* ───────── MentionInput ───────── */
export function MentionInput({ ticketId, value, onChange, onSubmit, disabled, placeholder }) {
  const taRef = useRef(null);
  const [showMenu, setShowMenu]     = useState(false);
  const [suggestions, setSuggs]     = useState([]);
  const [loading, setLoading]       = useState(false);
  const [activeIdx, setActiveIdx]   = useState(0);
  // Position of the "@" character that triggered the dropdown (relative to value)
  const [atIndex, setAtIndex]       = useState(-1);
  // Query the user is typing after @
  const [query, setQuery]           = useState('');

  /* — Detect "@" trigger as the user types/moves cursor — */
  const checkTrigger = useCallback((text, caret) => {
    // Walk backwards from caret; if we hit "@" before whitespace/newline/start,
    // and that "@" is at start-of-text OR preceded by whitespace, the dropdown
    // should be open with whatever follows it as the query.
    let i = caret - 1;
    while (i >= 0) {
      const ch = text[i];
      if (ch === '@') {
        const before = i === 0 ? ' ' : text[i - 1];
        if (/\s/.test(before) || before === '@' /* allow @@ as escape later */) {
          // But ALSO bail out if the "@" is INSIDE an already-completed
          // token like "@[Name](uuid)" — we shouldn't open the menu inside that.
          // Detect by looking ahead: if next char is "[" and there's a matching
          // "](" + ")" between i and caret, we're inside a finished token.
          // Cheap check: any closed token containing this position?
          const segment = text.slice(i, caret);
          if (/^@\[[^\]]*\]\([^)]*\)/.test(segment)) {
            return null; // we're in a completed token — no menu
          }
          return { atIndex: i, query: text.slice(i + 1, caret) };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i--;
    }
    return null;
  }, []);

  const onTextChange = (e) => {
    const newVal = e.target.value;
    onChange(newVal);
    const caret = e.target.selectionStart;
    const trig  = checkTrigger(newVal, caret);
    if (trig) {
      setShowMenu(true);
      setAtIndex(trig.atIndex);
      setQuery(trig.query);
      setActiveIdx(0);
    } else if (showMenu) {
      setShowMenu(false);
    }
  };

  const onCaretMove = () => {
    if (!taRef.current) return;
    const caret = taRef.current.selectionStart;
    const trig  = checkTrigger(value, caret);
    if (trig) {
      if (!showMenu) { setShowMenu(true); setActiveIdx(0); }
      setAtIndex(trig.atIndex);
      setQuery(trig.query);
    } else if (showMenu) {
      setShowMenu(false);
    }
  };

  /* — Fetch suggestions when query changes (debounced) — */
  useEffect(() => {
    if (!showMenu) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await svcApi.get(`/tickets/${ticketId}/mention-suggestions`, {
          params: query ? { q: query, limit: 8 } : { limit: 10 },
        });
        if (!cancelled) { setSuggs(data); setActiveIdx(0); }
      } catch (e) {
        if (!cancelled) setSuggs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 100);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showMenu, query, ticketId]);

  /* — Insert a selection — */
  const insertSuggestion = (s) => {
    if (atIndex < 0 || !taRef.current) return;
    const token = `@[${s.name}](${s.id}) `;
    const caret = taRef.current.selectionStart;
    const before = value.slice(0, atIndex);
    const after  = value.slice(caret);
    const newVal = before + token + after;
    onChange(newVal);
    setShowMenu(false);
    // Move cursor to right after the inserted token (+ trailing space)
    const newCaret = before.length + token.length;
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.setSelectionRange(newCaret, newCaret);
      }
    });
  };

  /* — Backspace deletes a whole token atomically — */
  const onKeyDown = (e) => {
    if (showMenu && suggestions.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => (i - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const s = suggestions[activeIdx];
        if (s) insertSuggestion(s);
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); setShowMenu(false); return; }
    }
    // Submit on Cmd/Ctrl+Enter
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !showMenu) {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    // Atomic chip backspace
    if (e.key === 'Backspace' && !showMenu && taRef.current) {
      const ta = taRef.current;
      const caret = ta.selectionStart;
      if (caret !== ta.selectionEnd) return; // selection — let default delete
      // Check if the character before caret closes a "@[...]()" token
      const head = value.slice(0, caret);
      const tokenMatch = head.match(/@\[[^\]]+\]\([^)]+\)\s?$/);
      if (tokenMatch) {
        e.preventDefault();
        const start = caret - tokenMatch[0].length;
        const newVal = value.slice(0, start) + value.slice(caret);
        onChange(newVal);
        requestAnimationFrame(() => {
          if (taRef.current) {
            taRef.current.focus();
            taRef.current.setSelectionRange(start, start);
          }
        });
      }
    }
  };

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        value={value}
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        onClick={onCaretMove}
        onKeyUp={onCaretMove}
        onBlur={() => setTimeout(() => setShowMenu(false), 150)}  /* delay so click registers */
        rows={1}
        disabled={disabled}
        placeholder={placeholder || 'Add a note… (@ to mention; ⌘/Ctrl+Enter to send)'}
        className="w-full resize-none bg-transparent outline-none text-xs text-slate-800 placeholder-slate-400 px-2 py-2 min-h-[36px] max-h-32"
        style={{ scrollbarWidth: 'thin' }}
      />
      {showMenu && (
        <div className="absolute left-0 bottom-full mb-1.5 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl border border-slate-200 shadow-2xl shadow-slate-900/15 overflow-hidden z-50 animate-fade-in">
          <div className="max-h-72 overflow-y-auto">
            {loading && !suggestions.length ? (
              <div className="px-3 py-3 text-[11px] text-slate-400">Searching…</div>
            ) : suggestions.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-slate-400">No matches</div>
            ) : suggestions.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s); }}
                onMouseEnter={() => setActiveIdx(i)}
                className={`w-full text-left px-3 py-2 flex items-center gap-2.5 transition-all ${
                  activeIdx === i ? 'bg-blue-50' : 'hover:bg-slate-50'
                }`}>
                {/* Avatar */}
                {s.kind === 'everyone' ? (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-base flex-shrink-0">📢</div>
                ) : (
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${roleGradient(s.role)} flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ring-2 ring-white`}>
                    {initials(s.name)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 truncate">{s.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{s.sublabel}</p>
                </div>
                {activeIdx === i && (
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">↵</span>
                )}
              </button>
            ))}
          </div>
          {!query && (
            <div className="px-3 py-1.5 border-t border-slate-100 text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              ↑↓ to navigate · ↵ to insert · esc to close
            </div>
          )}
        </div>
      )}
    </div>
  );
}


/* ───────── MentionedText (renders body w/ chips) ───────── */
export function MentionedText({ body }) {
  if (!body) return null;
  // Split body into [text, token, text, token, ...]
  const parts = [];
  let last = 0;
  let m;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(body)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: body.slice(last, m.index) });
    parts.push({ type: 'mention', name: m[1], id: m[2] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: 'text', value: body.slice(last) });

  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) => p.type === 'text'
        ? <span key={i}>{p.value}</span>
        : <MentionChip key={i} name={p.name} id={p.id}/>
      )}
    </span>
  );
}


/* ───────── MentionChip ───────── */
function MentionChip({ name, id }) {
  const [showTip, setShowTip] = useState(false);
  const [info, setInfo]       = useState(null);
  const [loading, setLoading] = useState(false);

  const isEveryone = id === 'everyone';

  const onClick = async (e) => {
    e.stopPropagation();
    if (isEveryone) { setShowTip(s => !s); return; }
    if (showTip) { setShowTip(false); return; }
    setShowTip(true);
    if (info) return;
    setLoading(true);
    try {
      const { data } = await svcApi.get(`/tickets/lookup-user/${id}`);
      setInfo({ name: data.name, role: data.role, phone: data.phone, department: data.department });
    } catch {
      setInfo({ name, role: null, phone: null });
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!showTip) return;
    const close = (e) => { if (!e.target.closest('.mention-chip-wrap')) setShowTip(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showTip]);

  return (
    <span className="mention-chip-wrap relative inline-block align-baseline">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold transition-all align-baseline mx-0.5 ${
          isEveryone
            ? 'bg-blue-100 text-blue-700 hover:bg-blue-200 border border-blue-200'
            : 'bg-violet-100 text-violet-700 hover:bg-violet-200 border border-violet-200'
        }`}>
        {isEveryone ? '📢' : '@'}{isEveryone ? 'everyone' : name}
      </button>
      {showTip && (
        <span className="absolute left-0 top-full mt-1 z-50 bg-slate-900 text-white text-[11px] rounded-xl shadow-2xl px-3 py-2 whitespace-nowrap animate-fade-in">
          {isEveryone
            ? <span>Notifies everyone on this ticket</span>
            : loading
              ? <span className="text-slate-400">Loading…</span>
              : info ? (
                <span className="flex flex-col items-start gap-0.5 leading-tight">
                  <span className="font-bold">{info.name}</span>
                  {info.role     && <span className="text-slate-300 text-[10px] capitalize">{info.role}{info.department ? ` · ${info.department}` : ''}</span>}
                  {info.phone    && <span className="text-slate-300 text-[10px]">📞 {info.phone}</span>}
                </span>
              ) : <span className="font-bold">{name}</span>
          }
        </span>
      )}
    </span>
  );
}


/* ─── tiny helpers ─── */
function initials(name='') { return name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?'; }
function roleGradient(role) {
  const map = {
    plc:        'from-blue-500 to-indigo-600',
    wireman:    'from-emerald-500 to-green-600',
    admin:      'from-violet-500 to-purple-600',
    superadmin: 'from-amber-400 to-orange-500',
  };
  return map[role] || 'from-slate-400 to-slate-600';
}