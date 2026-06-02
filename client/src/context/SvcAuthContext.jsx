import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import svcApi from '../serviceApi';

const SvcAuthCtx = createContext(null);

// Permission defaults per role (mirrors server/permissions.js)
const ROLE_DEFAULTS = {
  superadmin: [
    'view_reports','view_profitability','view_salary','view_irc','export_reports',
    'create_ticket','assign_workers','close_ticket','reopen_ticket','view_all_tickets','delete_ticket',
    'enter_billing','view_billing','edit_rate_card',
    'start_timer','upload_files','view_worker_costs',
    'manage_users','view_sessions','reset_keys',
    'manage_customers','view_customers',
  ],
  admin: [
    'view_irc',
    'create_ticket','assign_workers','close_ticket','reopen_ticket','view_all_tickets',
    'enter_billing','view_billing',
    'start_timer','upload_files',
    'view_customers',
  ],
  plc:     ['start_timer','upload_files'],
  wireman: ['start_timer','upload_files'],
};

export function SvcAuthProvider({ children }) {
  const [svcUser,      setSvcUser]      = useState(null);
  const [svcReady,     setSvcReady]     = useState(false);
  const [permissions,  setPermissions]  = useState([]);
  const [permsLoaded,  setPermsLoaded]  = useState(false);

  // Load user from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('svc_user');
    if (saved) {
      const user = JSON.parse(saved);
      setSvcUser(user);
      loadPermissions(user);
    }
    setSvcReady(true);
  }, []);

  const loadPermissions = useCallback(async (user) => {
    if (!user) { setPermissions([]); setPermsLoaded(true); return; }
    // Start with role defaults immediately (no flicker)
    const defaults = ROLE_DEFAULTS[user.role] || [];
    setPermissions(defaults);
    try {
      const { data } = await svcApi.get('/permissions/mine');
      setPermissions(data.permissions || defaults);
    } catch {
      // Fall back to role defaults if API fails
      setPermissions(defaults);
    } finally {
      setPermsLoaded(true);
    }
  }, []);

  const svcLogin = (token, userData) => {
    localStorage.setItem('svc_token', token);
    localStorage.setItem('svc_user', JSON.stringify(userData));
    setSvcUser(userData);
    loadPermissions(userData);
  };

  const svcLogout = () => {
    localStorage.removeItem('svc_token');
    localStorage.removeItem('svc_user');
    setSvcUser(null);
    setPermissions([]);
    setPermsLoaded(false);
  };

  // Core permission check
  const can = useCallback((permission) => {
    if (!svcUser) return false;
    // Superadmin always has everything
    if (svcUser.role === 'superadmin') return true;
    return permissions.includes(permission);
  }, [permissions, svcUser]);

  const canAny = useCallback((...perms) => perms.some(p => can(p)), [can]);

  // Convenience role flags (kept for backward compat)
  const isSuperAdmin = svcUser?.role === 'superadmin';
  const isSales      = svcUser?.role === 'admin' && (svcUser?.department || '').toLowerCase().includes('sales');
  const isAdmin      = svcUser?.role === 'admin' || isSuperAdmin;
  const isWorker     = svcUser?.role === 'plc' || svcUser?.role === 'wireman';

  return (
    <SvcAuthCtx.Provider value={{
      svcUser, svcLogin, svcLogout, svcReady,
      permissions, permsLoaded,
      can, canAny,
      isSuperAdmin, isSales, isAdmin, isWorker,
    }}>
      {children}
    </SvcAuthCtx.Provider>
  );
}

export const useSvcAuth = () => useContext(SvcAuthCtx);
