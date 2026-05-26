import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('cess_user');
    if (saved) setUser(JSON.parse(saved));
    setReady(true);
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('cess_token', token);
    localStorage.setItem('cess_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('cess_token');
    localStorage.removeItem('cess_user');
    setUser(null);
  };

  const isMaster   = user?.adminLevel === 'master';
  const isSubAdmin = user?.adminLevel === 'sub';
  const isAnyAdmin = isMaster || isSubAdmin;

  return (
    <AuthCtx.Provider value={{ user, login, logout, isMaster, isSubAdmin, isAnyAdmin, ready }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
