import React, { useState, useEffect, useCallback } from 'react';
import svcApi from '../../serviceApi';

const GROUP_ICONS = {
  Analytics:  '📊',
  Tickets:    '🎫',
  Billing:    '💰',
  Workers:    '👷',
  Users:      '👤',
  Customers:  '🏢',
};

const ROLE_COLORS = {
  superadmin: 'bg-amber-100 text-amber-800',
  admin:      'bg-violet-100 text-violet-800',
  plc:        'bg-blue-100 text-blue-700',
  wireman:    'bg-emerald-100 text-emerald-700',
};

export default function PermissionsPage() {
  const [users,    setUsers]    = useState([]);
  const [registry, setRegistry] = useState([]);
  const [selected, setSelected] = useState(null); // selected user id
  const [pending,  setPending]  = useState({});   // { perm_key: true/false/null }
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [search,   setSearch]   = useState('');
  const [filter,   setFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await svcApi.get('/permissions/users');
      setUsers(data.users);
      setRegistry(data.registry);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedUser = users.find(u => u.id === selected);

  // Group registry by group
  const groups = {};
  for (const p of registry) {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  }

  // Get permission state for selected user
  const getPermState = (permKey) => {
    if (pending[permKey] !== undefined) return pending[permKey];
    if (!selectedUser) return false;
    return selectedUser.permissions.includes(permKey);
  };

  const isOverridden = (permKey) => {
    if (!selectedUser) return false;
    return selectedUser.overrides[permKey] !== undefined;
  };

  const isDefault = (permKey) => {
    if (!selectedUser) return false;
    return selectedUser.role_defaults.includes(permKey);
  };

  const togglePerm = (permKey) => {
    const current = getPermState(permKey);
    const def = isDefault(permKey);
    // If toggling to default value → remove override (null)
    const newVal = !current;
    setPending(p => ({ ...p, [permKey]: newVal === def ? null : newVal }));
  };

  const savePermissions = async () => {
    if (!selected || Object.keys(pending).length === 0) return;
    setSaving(true);
    try {
      await svcApi.patch(`/permissions/users/${selected}`, { overrides: pending });
      setPending({});
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const resetToDefaults = async () => {
    if (!selected) return;
    if (!window.confirm('Reset all permissions to role defaults?')) return;
    setSaving(true);
    try {
      // Send empty overrides to clear all
      const resetObj = {};
      for (const p of registry) resetObj[p.key] = null;
      await svcApi.patch(`/permissions/users/${selected}`, { overrides: resetObj });
      setPending({});
      await load();
    } catch (e) { alert('Failed'); }
    finally { setSaving(false); }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || u.role === filter;
    return matchSearch && matchFilter;
  });

  const hasPendingChanges = Object.keys(pending).some(k => pending[k] !== null);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT: User List ── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200/60 bg-white flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <h2 className="text-sm font-black text-slate-900 mb-3">Users</h2>
          <input
            type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none focus:border-slate-400 mb-2"/>
          <div className="flex gap-1 flex-wrap">
            {['all','superadmin','admin','plc','wireman'].map(r => (
              <button key={r} onClick={()=>setFilter(r)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-all ${filter===r?'bg-slate-900 text-white':'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredUsers.map(u => (
            <button key={u.id} onClick={()=>{ setSelected(u.id); setPending({}); }}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-slate-50 ${selected===u.id?'bg-blue-50 border-r-2 border-blue-500':''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${
                u.role==='superadmin'?'bg-amber-500':u.role==='admin'?'bg-violet-500':u.role==='plc'?'bg-blue-500':'bg-emerald-500'
              }`}>{u.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{u.name}</p>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${ROLE_COLORS[u.role]||'bg-slate-100 text-slate-600'}`}>{u.role}</span>
                  {u.department && <span className="text-[9px] text-slate-400">{u.department}</span>}
                </div>
              </div>
              {Object.keys(u.overrides).length > 0 && (
                <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Has custom permissions"/>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Permission Editor ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        {!selectedUser ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <svg className="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <p className="text-sm font-bold">Select a user to manage permissions</p>
          </div>
        ) : (
          <div className="p-6 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-bold text-white ${
                  selectedUser.role==='superadmin'?'bg-amber-500':selectedUser.role==='admin'?'bg-violet-500':selectedUser.role==='plc'?'bg-blue-500':'bg-emerald-500'
                }`}>{selectedUser.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div>
                <div>
                  <h3 className="text-base font-black text-slate-900">{selectedUser.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ROLE_COLORS[selectedUser.role]||'bg-slate-100'}`}>{selectedUser.role}</span>
                    {selectedUser.department && <span className="text-[10px] text-slate-400">{selectedUser.department}</span>}
                    {Object.keys(selectedUser.overrides).length > 0 && (
                      <span className="text-[10px] text-amber-600 font-bold">● {Object.keys(selectedUser.overrides).length} custom override{Object.keys(selectedUser.overrides).length!==1?'s':''}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasPendingChanges && (
                  <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                    Unsaved changes
                  </span>
                )}
                <button onClick={resetToDefaults} disabled={saving}
                  className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-100 transition-all disabled:opacity-50">
                  Reset to defaults
                </button>
                <button onClick={savePermissions} disabled={saving || !hasPendingChanges}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-40">
                  {saving ? 'Saving…' : 'Save permissions'}
                </button>
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mb-5 text-[10px] text-slate-500">
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-blue-100 border border-blue-300"/><span>Role default</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300"/><span>Custom grant</span></div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded bg-red-50 border border-red-200"/><span>Custom revoke</span></div>
            </div>

            {/* Permission groups */}
            <div className="space-y-4">
              {Object.entries(groups).map(([groupName, perms]) => (
                <div key={groupName} className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                    <span className="text-base">{GROUP_ICONS[groupName] || '🔧'}</span>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">{groupName}</h4>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {perms.map(p => {
                      const isOn      = getPermState(p.key);
                      const isDef     = isDefault(p.key);
                      const isOvr     = isOverridden(p.key);
                      const isPending = pending[p.key] !== undefined && pending[p.key] !== null;

                      let rowBg = '';
                      if (isPending)     rowBg = isOn ? 'bg-emerald-50/50' : 'bg-red-50/30';
                      else if (isOvr)    rowBg = isOn ? 'bg-emerald-50/30' : 'bg-red-50/20';

                      return (
                        <div key={p.key} className={`flex items-center justify-between px-5 py-3 transition-all ${rowBg}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-800">{p.label}</span>
                              {isDef && !isOvr && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">role default</span>
                              )}
                              {isOvr && (
                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isOn?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-600 border-red-200'}`}>
                                  {isOn ? 'custom grant' : 'custom revoke'}
                                </span>
                              )}
                              {isPending && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">pending</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-0.5 font-mono">{p.key}</p>
                          </div>
                          <button onClick={() => togglePerm(p.key)}
                            className={`relative w-11 h-6 rounded-full transition-all flex-shrink-0 ${isOn ? 'bg-slate-900' : 'bg-slate-200'}`}>
                            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${isOn ? 'left-[22px]' : 'left-0.5'}`}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
