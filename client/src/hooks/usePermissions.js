import { useState, useEffect, useCallback } from 'react';
import svcApi from '../serviceApi';

let _cache = null;
let _listeners = [];

function notify() { _listeners.forEach(fn => fn(_cache)); }

export function clearPermissionsCache() { _cache = null; }

export function usePermissions() {
  const [perms, setPerms] = useState(_cache);

  useEffect(() => {
    const listener = (p) => setPerms(p);
    _listeners.push(listener);
    if (_cache) { setPerms(_cache); }
    else {
      svcApi.get('/permissions/mine')
        .then(({ data }) => {
          _cache = data.permissions || [];
          notify();
        })
        .catch(() => { _cache = []; notify(); });
    }
    return () => { _listeners = _listeners.filter(l => l !== listener); };
  }, []);

  const can = useCallback((permission) => {
    if (!perms) return false;
    return perms.includes(permission);
  }, [perms]);

  const canAny = useCallback((...permissions) => {
    if (!perms) return false;
    return permissions.some(p => perms.includes(p));
  }, [perms]);

  return { can, canAny, permissions: perms || [], loading: perms === null };
}
