import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

let _socket = null;

export function getSocket() {
  const token = localStorage.getItem('svc_token');
  if (!token) return null;
  if (!_socket || _socket.disconnected) {
    _socket = io('/', {
      auth: { token },
      transports: ['websocket','polling'],
      autoConnect: true,
    });
  }
  return _socket;
}

export function disconnectSocket() {
  if (_socket) { _socket.disconnect(); _socket = null; }
}

/**
 * useSocket(events)
 * events: { 'event:name': handler }
 * Returns { socket, emit }
 */
export function useSocket(events = {}) {
  const socketRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    socketRef.current = s;
    const entries = Object.entries(events);
    entries.forEach(([ev, fn]) => s.on(ev, fn));
    return () => entries.forEach(([ev, fn]) => s.off(ev, fn));
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  return { socket: socketRef.current, emit };
}
