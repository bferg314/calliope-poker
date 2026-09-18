import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { z } from 'zod';
import { clientMessageSchema, roomCodeSchema, type ServerMessage } from '@calliope/shared';
import { RoomError, type Client } from './manager.js';
import type { Services } from './http.js';

export function registerWs(app: FastifyInstance, s: Services): void {
  app.get('/ws/rooms/:code', { websocket: true }, async (socket: WebSocket, request) => {
    const send = (msg: ServerMessage): void => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const row = await s.auth.userFrom(request);
    if (!row) { send({ type: 'error', code: 'unauthenticated', message: 'Sign in first' }); socket.close(4001, 'unauthenticated'); return; }
    const parsed = roomCodeSchema.safeParse((request.params as { code: string }).code);
    const rt = parsed.success ? s.manager.get(parsed.data) : undefined;
    if (!rt) { send({ type: 'error', code: 'no-room', message: 'No table with that code' }); socket.close(4004, 'no-room'); return; }
    if (!rt.record.members[row.id]) { send({ type: 'error', code: 'not-a-member', message: 'Join the room first' }); socket.close(4003, 'not-a-member'); return; }

    const client: Client = { userId: row.id, send };
    s.manager.connect(rt, client);

    let alive = true;
    const heartbeat = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      socket.ping();
    }, 25_000);
    socket.on('pong', () => { alive = true; });

    socket.on('message', (raw) => {
      let msg;
      try {
        msg = clientMessageSchema.parse(JSON.parse(raw.toString()));
      } catch (e) {
        const message = e instanceof z.ZodError ? e.issues.map((i) => i.message).join('; ') : 'Bad message';
        send({ type: 'error', code: 'bad-message', message });
        return;
      }
      try {
        s.manager.handle(rt, row.id, msg, client);
      } catch (e) {
        if (e instanceof RoomError) send({ type: 'error', code: e.code, message: e.message });
        else if (e instanceof z.ZodError) send({ type: 'error', code: 'invalid', message: e.issues.map((i) => i.message).join('; ') });
        else { app.log.error(e); send({ type: 'error', code: 'internal', message: 'Something went wrong' }); }
      }
    });

    socket.on('close', () => {
      clearInterval(heartbeat);
      s.manager.disconnect(rt, client);
    });
  });
}
