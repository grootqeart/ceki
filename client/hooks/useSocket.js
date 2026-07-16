import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { getServerUrl } from '../lib/serverUrl';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = io(getServerUrl(), { autoConnect: true });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socketRef, connected };
}
