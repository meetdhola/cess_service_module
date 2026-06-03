import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import svcApi from '../serviceApi';

const SvcAuthCtx = createContext(null);

// Must match server/permissions.js exactly
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
  const [svcUser,     setSvcUser]     = useState(null);
  const [svcReady,    setSvcReady]    = useState(false);
  const [permissions, setPermissions] = useState([]);
  const [permsLoaded, setPermsLoaded] = useState(false);
  const userRef = useRef(null);

  const loadPermissions = useCallback(async (user) => {
    if (!user) { setPermissions([]); setPermsLoaded(true); return; }
    // Apply role defaults immediately (no flicker)
    const defaults = ROLE_DEFAULTS[user.role] || [];
    setPermissions(defaults);
    try {
      const { data } = await svcApi.get('/permissions/mine');
      setPermissions(data.permissions || defaults);
    } catch {
      setPermissions(defaults);
    } finally {
      setPermsLoaded(true);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    const saved = localStorage.getItem('svc_user');
    if (saved) {
      const user = JSON.parse(saved);
      userRef.current = user;
      setSvcUser(user);
      loadPermissions(user);
    }
    setSvcReady(true);
  }, [loadPermissions]);

  // Refresh every 30s so permission changes take effect without re-login
  useEffect(() => {
    if (!svcUser) return;
    userRef.current = svcUser;
    const interval = setInterval(() => {
      if (userRef.current) loadPermissions(userRef.current);
    }, 30000);
    return () => clearInterval(interval);
  }, [svcUser, loadPermissions]);

  const svcLogin = useCallback((token, userData) => {
    localStorage.setItem('svc_token', token);
    localStorage.setItem('svc_user', JSON.stringify(userData));
    userRef.current = userData;
    setSvcUser(userData);
    loadPermissions(userData);
  }, [loadPermissions]);

  const svcLogout = useCallback(() => {
    localStorage.removeItem('svc_token');
    localStorage.removeItem('svc_user');
    userRef.current = null;
    setSvcUser(null);
    setPermissions([]);
    setPermsLoaded(false);
  }, []);

  // can() — checks if user has permission
  // Superadmin always returns true regardless of DB
  const can = useCallback((permission) => {
    if (!svcUser) return false;
    if (svcUser.role === 'superadmin') return true;
    return permissions.includes(permission);
  }, [permissions, svcUser]);

  const canAny = useCallback((...perms) => perms.some(p => can(p)), [can]);

  // Convenience flags (backward compat)
  const isSuperAdmin = svcUser?.role === 'superadmin';
  const isSales      = svcUser?.role === 'admin' && (svcUser?.department || '').toLowerCase().includes('sales');
  const isAdmin      = svcUser?.role === 'admin' || isSuperAdmin;
  const isWorker     = svcUser?.role === 'plc' || svcUser?.role === 'wireman';

  return (
    <SvcAuthCtx.Provider value={{
      svcUser, svcLogin, svcLogout, svcReady,
      permissions, permsLoaded, loadPermissions,
      can, canAny,
      isSuperAdmin, isSales, isAdmin, isWorker,
    }}>
      {children}
    </SvcAuthCtx.Provider>
  );
}

export const useSvcAuth = () => useContext(SvcAuthCtx);
