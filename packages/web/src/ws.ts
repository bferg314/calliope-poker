import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, RoomView, ServerMessage } from '@calliope/shared';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface RoomSocket {
  room: RoomView | null;
  status: SocketStatus;
  /** The last error from the server; cleared after a few seconds. */
  error: { code: string; message: string; at: number } | null;
  /** Non-recoverable: not a member, no such room, or removed. */
  fatal: { code: string; message: string } | null;
  send: (msg: ClientMessage) => void;
  /** Server clock minus local clock, in ms. */
  skew: number;
}

const FATAL = new Set(['not-a-member', 'no-room', 'unauthenticated', 'removed']);

export function useRoomSocket(code: string | null, enabled: boolean): RoomSocket {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [error, setError] = useState<RoomSocket['error']>(null);
  const [fatal, setFatal] = useState<RoomSocket['fatal']>(null);
  const [skew, setSkew] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!code || !enabled) return;
    closedRef.current = false;
    setFatal(null);
    let timer: number | undefined;

    const connect = (): void => {
      if (closedRef.current) return;
      setStatus('connecting');
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws/rooms/${code}`);
      socketRef.current = ws;
      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus('open');
      };
      ws.onmessage = (ev) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(ev.data as string) as ServerMessage;
        } catch {
          return;
        }
        if (msg.type === 'snapshot') {
          setRoom(msg.room);
          setSkew(msg.room.clock.serverNow - Date.now());
        } else if (msg.type === 'error') {
          if (FATAL.has(msg.code)) {
            setFatal({ code: msg.code, message: msg.message });
            closedRef.current = true;
            ws.close();
          } else {
            setError({ code: msg.code, message: msg.message, at: Date.now() });
          }
        } else if (msg.type === 'pong') {
          setSkew(msg.now - Date.now());
        }
      };
      ws.onclose = () => {
        socketRef.current = null;
        setStatus('closed');
        if (closedRef.current) return;
        const delay = Math.min(8000, 800 * 2 ** attemptRef.current++);
        timer = window.setTimeout(connect, delay);
      };
      ws.onerror = () => {
        ws.close();
      };
    };
    connect();

    return () => {
      closedRef.current = true;
      if (timer) window.clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [code, enabled]);

  useEffect(() => {
    if (!error) return;
    const t = window.setTimeout(() => setError(null), 4000);
    return () => window.clearTimeout(t);
  }, [error]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else setError({ code: 'offline', message: 'Not connected. Reconnecting.', at: Date.now() });
  }, []);

  return { room, status, error, fatal, send, skew };
}

/** A clock that ticks so timers can render. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}
