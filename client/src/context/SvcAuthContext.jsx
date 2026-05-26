import React, { createContext, useContext, useState, useEffect } from 'react';

const SvcAuthCtx = createContext(null);

export function SvcAuthProvider({ children }) {
  const [svcUser,  setSvcUser]  = useState(null);
  const [svcReady, setSvcReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('svc_user');
    if (saved) setSvcUser(JSON.parse(saved));
    setSvcReady(true);
  }, []);

  const svcLogin = (token, userData) => {
    localStorage.setItem('svc_token', token);
    localStorage.setItem('svc_user', JSON.stringify(userData));
    setSvcUser(userData);
  };

  const svcLogout = () => {
    localStorage.removeItem('svc_token');
    localStorage.removeItem('svc_user');
    setSvcUser(null);
  };

  const isSuperAdmin = svcUser?.role === 'superadmin';
  const isAdmin      = svcUser?.role === 'admin' || isSuperAdmin;
  const isWorker     = svcUser?.role === 'plc' || svcUser?.role === 'wireman';

  return (
    <SvcAuthCtx.Provider value={{ svcUser, svcLogin, svcLogout, isSuperAdmin, isAdmin, isWorker, svcReady }}>
      {children}
    </SvcAuthCtx.Provider>
  );
}

export const useSvcAuth = () => useContext(SvcAuthCtx);
