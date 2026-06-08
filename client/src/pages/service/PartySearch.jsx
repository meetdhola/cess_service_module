import React, { useState, useRef, useCallback } from 'react';
import axios from 'axios';

const hi = (text, q) => {
  if (!q || !text) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return text;
  return <>{text.slice(0,i)}<mark className="bg-yellow-200 text-yellow-900 rounded not-italic font-black px-0.5">{text.slice(i, i+q.length)}</mark>{text.slice(i+q.length)}</>;
};

export default function PartySearch({ value, onChange, onSelect, className = '' }) {
  const [results,    setResults]    = useState([]);
  const [open,       setOpen]       = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [cursor,     setCursor]     = useState(-1);
  const inputRef    = useRef(null);
  const wrapperRef  = useRef(null);
  const debounceRef = useRef(null);

  React.useEffect(() => {
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
    if (e.key === 'ArrowDown')             { e.preventDefault(); setCursor(c => Math.min(c+1, results.length-1)); }
    else if (e.key === 'ArrowUp')          { e.preventDefault(); setCursor(c => Math.max(c-1, 0)); }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); handleSelect(results[cursor]); }
    else if (e.key === 'Escape')           { setOpen(false); setCursor(-1); }
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => value.length >= 1 && results.length > 0 && setOpen(true)}
          placeholder="Search company name…"
          autoComplete="off"
          className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl outline-none focus:border-slate-400 bg-white"
        />
        {loading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin"/>
          </div>
        )}
        {!loading && value && (
          <button type="button"
            onClick={() => { onChange(''); setResults([]); setOpen(false); inputRef.current?.focus(); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-slate-200 hover:bg-slate-300 flex items-center justify-center text-slate-500 text-[9px] transition-colors">
            ✕
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-200/80 overflow-hidden z-[300]">
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
            <p className="text-[9px] text-slate-400">Selecting fills company name · address autofilled</p>
          </div>
        </div>
      )}

      {open && !loading && results.length === 0 && value.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-[300] px-4 py-3">
          <p className="text-xs text-slate-400 text-center">No party found — type the name manually</p>
        </div>
      )}
    </div>
  );
}
