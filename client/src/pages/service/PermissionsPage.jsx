import React, { useState, useEffect, useCallback, useMemo } from 'react';
import svcApi from '../../serviceApi';

const GROUP_ICONS = {
  Analytics: '📊', Tickets: '🎫', Billing: '💰',
  Workers: '👷', Users: '👤', Customers: '🏢',
};
const ROLE_COLORS = {
  superadmin: 'bg-amber-100 text-amber-800',
  admin:      'bg-violet-100 text-violet-800',
  plc:        'bg-blue-100 text-blue-700',
  wireman:    'bg-emerald-100 text-emerald-700',
};

export default function PermissionsPage() {
  const [users,      setUsers]      = useState([]);
  const [registry,   setRegistry]   = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [localPerms, setLocalPerms] = useState({});
  const [savedPerms, setSavedPerms] = useState({});
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState('all');

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

  const groups = useMemo(() => {
    const g = {};
    for (const p of registry) {
      if (!g[p.group]) g[p.group] = [];
      g[p.group].push(p);
    }
    return g;
  }, [registry]);

  // When selecting a user — build flat true/false map from their permissions
  const selectUser = useCallback((uid) => {
    setSelected(uid);
    setSaved(false);
    const user = users.find(u => u.id === uid);
    if (!user) return;
    const map = {};
    for (const p of (user.permissions || [])) map[p] = true;
    setLocalPerms({ ...map });
    setSavedPerms({ ...map });
  }, [users]);

  // Toggle — just flip the boolean, completely independent
  const togglePerm = useCallback((permKey) => {
    setLocalPerms(prev => ({ ...prev, [permKey]: !prev[permKey] }));
  }, []);

  // Has changes = any key differs between localPerms and savedPerms
  const hasPendingChanges = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(localPerms),
      ...Object.keys(savedPerms),
      ...(selectedUser?.role_defaults || []),
    ]);
    for (const k of allKeys) {
      if (!!localPerms[k] !== !!savedPerms[k]) return true;
    }
    return false;
  }, [localPerms, savedPerms, selectedUser]);

  // Build overrides: compare localPerms vs role_defaults
  const buildOverrides = useCallback(() => {
    if (!selectedUser) return {};
    const defaults = new Set(selectedUser.role_defaults || []);
    const overrides = {};
    const allKeys = new Set([
      ...registry.map(p => p.key),
      ...Object.keys(localPerms),
    ]);
    for (const key of allKeys) {
      const isOn = !!localPerms[key];
      const isDef = defaults.has(key);
      overrides[key] = isOn === isDef ? null : isOn;
    }
    return overrides;
  }, [localPerms, selectedUser, registry]);

  const savePermissions = async () => {
    if (!selected || !hasPendingChanges) return;
    setSaving(true);
    try {
      const overrides = buildOverrides();
      await svcApi.patch(`/permissions/users/${selected}`, { overrides });
      setSavedPerms({ ...localPerms });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      await load();
    } catch (e) { alert(e.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const resetToDefaults = async () => {
    if (!selected) return;
    if (!window.confirm('Reset all permissions to role defaults?')) return;
    setSaving(true);
    try {
      const resetObj = {};
      for (const p of registry) resetObj[p.key] = null;
      await svcApi.patch(`/permissions/users/${selected}`, { overrides: resetObj });
      const defaults = {};
      for (const p of (selectedUser?.role_defaults || [])) defaults[p] = true;
      setLocalPerms({ ...defaults });
      setSavedPerms({ ...defaults });
      await load();
    } catch (e) { alert('Failed'); }
    finally { setSaving(false); }
  };

  const filteredUsers = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'all' || u.role === filter;
    return matchSearch && matchFilter;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-600 rounded-full animate-spin"/>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* LEFT: User list */}
      <div className="w-64 flex-shrink-0 border-r border-slate-100 bg-white flex flex-col overflow-hidden">
        <div className="p-3 border-b border-slate-100 space-y-2">
          <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest px-1">Manage Permissions</h3>
          <input
            className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-slate-400"
            placeholder="Search users…"
            value={search} onChange={e => setSearch(e.target.value)}
          />
          <div className="flex gap-1 flex-wrap">
            {['all','superadmin','admin','plc','wireman'].map(r => (
              <button key={r} onClick={() => setFilter(r)}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-all ${
                  filter === r ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-400'
                }`}>
                {r === 'all' ? 'All' : r}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {filteredUsers.map(u => (
            <button key={u.id} onClick={() => selectUser(u.id)}
              className={`w-full text-left px-3 py-2.5 transition-all ${
                selected === u.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-50 text-slate-700'
              }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-xs font-bold truncate ${selected === u.id ? 'text-white' : 'text-slate-800'}`}>{u.name}</p>
                  <p className={`text-[10px] capitalize truncate ${selected === u.id ? 'text-slate-300' : 'text-slate-400'}`}>{u.department || u.role}</p>
                </div>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                  selected === u.id ? 'bg-white/20 text-white' : (ROLE_COLORS[u.role] || 'bg-slate-100 text-slate-600')
                }`}>{u.role}</span>
              </div>
              {Object.keys(u.overrides || {}).length > 0 && (
                <div className={`text-[9px] mt-0.5 font-bold ${selected === u.id ? 'text-amber-300' : 'text-amber-600'}`}>
                  ● {Object.keys(u.overrides).length} override{Object.keys(u.overrides).length !== 1 ? 's' : ''}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: Permission toggles */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/40">
        {!selectedUser ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <p className="text-sm font-bold text-slate-400">Select a user to manage permissions</p>
            <p className="text-xs text-slate-300">Changes take effect within 30 seconds</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between gap-4 flex-shrink-0">
              <div>
                <h3 className="text-sm font-black text-slate-900">{selectedUser.name}</h3>
                <p className="text-[11px] text-slate-400 capitalize">{selectedUser.role} · {selectedUser.department || '—'}</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {hasPendingChanges && (
                  <span className="text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    unsaved changes
                  </span>
                )}
                <button onClick={resetToDefaults} disabled={saving}
                  className="text-[11px] font-bold px-3 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all disabled:opacity-40">
                  Reset defaults
                </button>
                <button onClick={savePermissions} disabled={saving || !hasPendingChanges}
                  className={`text-[11px] font-bold px-4 py-1.5 rounded-xl transition-all ${
                    saved ? 'bg-emerald-600 text-white' :
                    hasPendingChanges ? 'bg-slate-900 hover:bg-slate-700 text-white' :
                    'bg-slate-100 text-slate-400 cursor-not-allowed'
                  }`}>
                  {saving ? 'Saving…' : saved ? '✓ Saved!' : 'Save permissions'}
                </button>
              </div>
            </div>

            {/* Info */}
            <div className="mx-5 mt-3 px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-700 flex-shrink-0">
              <span className="font-bold">ℹ️</span> Changes take effect within 30 seconds. Superadmin always has all permissions regardless.
            </div>

            {/* Groups */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {Object.entries(groups).map(([group, perms]) => (
                <div key={group} className="bg-white rounded-2xl border border-slate-200/60 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                    <span className="text-base">{GROUP_ICONS[group] || '🔧'}</span>
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">{group}</h4>
                    <span className="text-[10px] text-slate-400 ml-auto">
                      {perms.filter(p => !!localPerms[p.key]).length}/{perms.length} enabled
                    </span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {perms.map(p => {
                      const isOn      = !!localPerms[p.key];
                      const isDef     = (selectedUser.role_defaults || []).includes(p.key);
                      const isChanged = !!localPerms[p.key] !== !!savedPerms[p.key];
                      return (
                        <div key={p.key} className={`flex items-center justify-between px-4 py-3 transition-all ${isChanged ? 'bg-amber-50/50' : ''}`}>
                          <div className="min-w-0 flex-1 pr-4">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold text-slate-800">{p.label}</p>
                              {isDef && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">role default</span>
                              )}
                              {isChanged && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">modified</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{p.key}</p>
                          </div>
                          <button
                            onClick={() => togglePerm(p.key)}
                            className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 ${
                              isOn ? 'bg-emerald-500' : 'bg-slate-200'
                            }`}>
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-200 ${
                              isOn ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
                            }`}/>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
