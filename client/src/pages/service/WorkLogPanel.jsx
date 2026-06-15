import React, { useState, useEffect, useCallback } from 'react';
import svcApi from '../../serviceApi';

const fmtDate = iso => iso ? new Date(iso).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '';
const fmtTime = t => t ? t.slice(0,5) : '';

const ROLE_CLR = {
  plc:        'bg-blue-100 text-blue-700',
  wireman:    'bg-emerald-100 text-emerald-700',
  admin:      'bg-violet-100 text-violet-700',
  superadmin: 'bg-amber-100 text-amber-700',
};

export default function WorkLogPanel({ ticketId, currentUserId, currentUserRole }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [desc,    setDesc]    = useState('');
  const [date,    setDate]    = useState(new Date().toISOString().slice(0,10));
  const [time,    setTime]    = useState(new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Kolkata'}));
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await svcApi.get(`/tickets/${ticketId}/work-logs`);
      setLogs(data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!desc.trim() || saving) return;
    setSaving(true);
    try {
      const { data } = await svcApi.post(`/tickets/${ticketId}/work-logs`, {
        description: desc.trim(), log_date: date, log_time: time
      });
      setLogs(p => [data, ...p]);
      setDesc('');
    } catch(e) { alert(e.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const remove = async id => {
    if (!window.confirm('Delete this work log entry?')) return;
    try {
      await svcApi.delete(`/tickets/${ticketId}/work-logs/${id}`);
      setLogs(p => p.filter(l => l.id !== id));
    } catch(e) { alert(e.response?.data?.error || 'Failed'); }
  };

  // Group by date
  const grouped = [];
  let lastDate = null;
  for (const l of logs) {
    const d = l.log_date?.slice(0,10);
    if (d !== lastDate) { grouped.push({ type:'date', date: d }); lastDate = d; }
    grouped.push({ type:'log', data: l });
  }

  const isAdmin = ['admin','superadmin'].includes(currentUserRole);

  return (
    <div style={{fontFamily:'-apple-system,BlinkMacSystemFont,Inter,sans-serif'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid #f3f4f6'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{width:'8px',height:'8px',borderRadius:'50%',background:'#8b5cf6',boxShadow:'0 0 0 2px #ede9fe'}}/>
          <span style={{fontSize:'13px',fontWeight:'700',color:'#111827'}}>Work Log</span>
          <span style={{fontSize:'10px',color:'#9ca3af',fontWeight:'500'}}>· {logs.length} entr{logs.length!==1?'ies':'y'}</span>
        </div>
        <span style={{fontSize:'10px',color:'#9ca3af',background:'#f3f4f6',padding:'2px 8px',borderRadius:'20px'}}>Shown in report</span>
      </div>

      {/* Log entries */}
      <div style={{maxHeight:'260px',overflowY:'auto',padding:'8px 0',background:'#fff'}}>
        {loading ? (
          <div style={{padding:'20px 16px',display:'flex',flexDirection:'column',gap:'12px'}}>
            {[1,2].map(i=>(
              <div key={i} style={{height:'48px',background:'#f9fafb',borderRadius:'10px',margin:'0 16px'}}/>
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 16px',gap:'8px'}}>
            <div style={{width:'40px',height:'40px',borderRadius:'12px',background:'#f3f4f6',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="18" height="18" fill="none" stroke="#9ca3af" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>
            </div>
            <span style={{fontSize:'12px',fontWeight:'600',color:'#374151'}}>No work logs yet</span>
            <span style={{fontSize:'11px',color:'#9ca3af'}}>Log daily tasks below</span>
          </div>
        ) : grouped.map((item,idx) => {
          if (item.type === 'date') return (
            <div key={`d-${idx}`} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 16px 8px'}}>
              <div style={{flex:1,height:'1px',background:'#f3f4f6'}}/>
              <span style={{fontSize:'10px',fontWeight:'600',color:'#d1d5db',whiteSpace:'nowrap'}}>
                {fmtDate(item.date)}
              </span>
              <div style={{flex:1,height:'1px',background:'#f3f4f6'}}/>
            </div>
          );
          const l = item.data;
          const canDelete = l.worker_id === currentUserId || isAdmin;
          return (
            <div key={l.id}
              style={{display:'flex',gap:'10px',padding:'4px 16px',cursor:'default'}}
              onMouseEnter={e=>e.currentTarget.style.background='#fafafa'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              {/* Time */}
              <div style={{flexShrink:0,paddingTop:'2px'}}>
                <span style={{fontSize:'10px',fontWeight:'700',color:'#9ca3af',fontVariantNumeric:'tabular-nums'}}>{fmtTime(l.log_time)}</span>
              </div>
              {/* Content */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'3px',flexWrap:'wrap'}}>
                  <span style={{fontSize:'11px',fontWeight:'700',color:'#111827'}}>{l.worker_name}</span>
                  <span style={{fontSize:'8px',fontWeight:'700',padding:'1px 6px',borderRadius:'6px',textTransform:'uppercase',letterSpacing:'0.3px',...Object.fromEntries((ROLE_CLR[l.worker_role]||'bg-slate-100 text-slate-600').split(' ').filter(Boolean).map(cls=>{
                    if(cls.startsWith('bg-')) return ['background', cls.replace('bg-','').replace('-100','').replace('-200','') === 'slate' ? '#f1f5f9' : cls.includes('blue') ? '#dbeafe' : cls.includes('emerald') ? '#d1fae5' : cls.includes('violet') ? '#ede9fe' : '#fef3c7'];
                    if(cls.startsWith('text-')) return ['color', cls.includes('blue') ? '#1d4ed8' : cls.includes('emerald') ? '#065f46' : cls.includes('violet') ? '#5b21b6' : '#92400e'];
                    return ['','']; }))}}>{l.worker_role}</span>
                </div>
                <p style={{fontSize:'12.5px',color:'#374151',lineHeight:'1.5',wordBreak:'break-word',margin:0}}>{l.description}</p>
              </div>
              {/* Delete */}
              {canDelete && (
                <button onClick={()=>remove(l.id)}
                  style={{flexShrink:0,width:'22px',height:'22px',borderRadius:'8px',border:'1px solid #e5e7eb',background:'#fff',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#9ca3af',opacity:0}}
                  onMouseEnter={e=>{e.currentTarget.style.opacity=1;e.currentTarget.style.borderColor='#ef4444';e.currentTarget.style.color='#ef4444';}}
                  onMouseLeave={e=>{e.currentTarget.style.opacity=0;e.currentTarget.style.borderColor='#e5e7eb';e.currentTarget.style.color='#9ca3af';}}>
                  <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{borderTop:'1px solid #f3f4f6',padding:'12px 14px',background:'#fff'}}>
        <div style={{display:'flex',gap:'6px',marginBottom:'8px'}}>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{flex:1,padding:'6px 10px',background:'#f9fafb',border:'1.5px solid #e5e7eb',borderRadius:'10px',fontSize:'11px',color:'#111827',outline:'none'}}/>
          <input type="time" value={time} onChange={e=>setTime(e.target.value)}
            style={{flex:1,padding:'6px 10px',background:'#f9fafb',border:'1.5px solid #e5e7eb',borderRadius:'10px',fontSize:'11px',color:'#111827',outline:'none'}}/>
        </div>
        <div style={{background:'#f9fafb',border:'1.5px solid #e5e7eb',borderRadius:'14px',overflow:'hidden',transition:'all 0.15s'}}>
          <textarea
            value={desc} onChange={e=>setDesc(e.target.value)}
            onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')submit();}}
            placeholder="Describe work done… (⌘ Enter to save)"
            rows={2}
            style={{width:'100%',background:'transparent',border:'none',outline:'none',padding:'10px 12px 6px',fontSize:'12.5px',color:'#111827',resize:'none',lineHeight:'1.5',fontFamily:'inherit'}}/>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 12px 8px'}}>
            <span style={{fontSize:'9px',color:'#d1d5db'}}>⌘ Enter to save</span>
            <button onClick={submit} disabled={!desc.trim()||saving}
              style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:'10px',padding:'6px 14px',fontSize:'11px',fontWeight:'700',cursor:'pointer',opacity:(!desc.trim()||saving)?0.4:1,display:'flex',alignItems:'center',gap:'5px'}}>
              <svg width="12" height="12" fill="none" stroke="#fff" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              Log
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
