import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { io } from 'socket.io-client';

// lightweight hook: connects when user is signed in and attaches Clerk token via socket auth
export default function useClerkSocket(serverUrl, options = {}) {
  const { getToken, isSignedIn } = useAuth();
  const socketRef = useRef(null);
  const [, setConnected] = useState(false);

  const connect = useCallback(async () => {
    if (!isSignedIn) return;
    const token = await getToken();
    if (socketRef.current) socketRef.current.disconnect();
    socketRef.current = io(serverUrl, { auth: { token }, ...options });
    socketRef.current.on('connect', () => setConnected(true));
    socketRef.current.on('disconnect', () => setConnected(false));
    return socketRef.current;
  }, [getToken, isSignedIn, serverUrl, options]);

  useEffect(() => {
    connect();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  return {
    get socket() { return socketRef.current; },
    connect,
    disconnect: () => socketRef.current?.disconnect(),
  };
}