import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { listVariants } from '@calliope/engine';
import { createRoomSchema, nameSchema, phraseSchema, roomCodeSchema } from '@calliope/shared';
import { hashSecret, verifySecret, type Auth, type PublicUser } from './auth.js';
import { publicUser } from './auth.js';
import type { Db } from './db.js';
import { RoomError, type RoomManager } from './manager.js';

export interface Services {
  auth: Auth;
  db: Db;
  manager: RoomManager;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: PublicUser | null;
  }
}

function fail(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.status(status).send({ error: { code, message } });
}

export function registerHttp(app: FastifyInstance, s: Services): void {
  app.decorateRequest('user', null);

  app.addHook('preHandler', async (request) => {
    const row = await s.auth.userFrom(request);
    request.user = row ? publicUser(row) : null;
  });

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof z.ZodError) return fail(reply, 400, 'invalid', err.issues.map((i) => i.message).join('; '));
    if (err instanceof RoomError) return fail(reply, 400, err.code, err.message);
    app.log.error(err);
    return fail(reply, 500, 'internal', 'Something went wrong');
  });

  const requireUser = (request: FastifyRequest, reply: FastifyReply): PublicUser | null => {
    if (!request.user) { void fail(reply, 401, 'unauthenticated', 'Sign in first'); return null; }
    return request.user;
  };

  app.get('/api/health', async () => ({ ok: true, rooms: s.manager.rooms.size }));

  /** What a visitor needs to know before signing in. No authentication required. */
  app.get('/api/instance', async () => ({ restricted: s.auth.restricted }));

  app.get('/api/variants', async () =>
    listVariants().map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      defaultBetting: v.defaultBetting,
      forcedBets: v.forcedBets,
      players: { ...v.players },
      hasDraw: v.streets.some((street) => street.draw !== undefined),
    })),
  );

  // ---- identity ----

  app.post('/api/auth/new', async (request, reply) => {
    if (!s.auth.allowCreate(request.ip)) {
      return fail(reply, 429, 'too-many-names', 'Too many new names from here. Try again later.');
    }
    const body = z.object({ name: nameSchema.optional() }).parse(request.body ?? {});
    const { user, phrase, token } = await s.auth.createUser(body.name);
    s.auth.setCookie(reply, token);
    return { user, phrase, token };
  });

  app.post('/api/auth/recover', async (request, reply) => {
    const body = z.object({ name: nameSchema, phrase: phraseSchema }).parse(request.body ?? {});
    const result = await s.auth.recover(body.name, body.phrase, request.ip);
    if (result === 'limited') return fail(reply, 429, 'too-many-attempts', 'Too many attempts. Wait a few minutes and try again.');
    if (!result) return fail(reply, 404, 'no-match', 'No one by that name with those five words. Check the spelling and try again.');
    s.auth.setCookie(reply, result.token);
    return result;
  });

  /** Prove you run this server, so you may open tables on it. */
  app.post('/api/auth/claim-host', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = z.object({ key: z.string().min(1).max(200) }).parse(request.body ?? {});
    const result = await s.auth.claimHost(user.id, body.key, request.ip);
    if (result === 'limited') return fail(reply, 429, 'too-many-attempts', 'Too many tries. Wait a few minutes.');
    if (result === 'wrong') return fail(reply, 403, 'bad-key', 'That is not the host key for this server.');
    if (result === 'open') return fail(reply, 400, 'not-restricted', 'This server lets anyone open a table.');
    return { user: { ...user, canOpenTables: true } };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = s.auth.tokenFrom(request);
    if (token) await s.auth.revoke(token);
    s.auth.clearCookie(reply);
    return { ok: true };
  });

  app.get('/api/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    await s.db.touchUser(user.id);
    return { user };
  });

  app.patch('/api/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = z.object({ name: nameSchema }).parse(request.body ?? {});
    await s.db.renameUser(user.id, body.name);
    for (const rt of s.manager.rooms.values()) {
      if (rt.record.members[user.id]) s.manager.join(rt, { id: user.id, name: body.name });
    }
    return { user: { ...user, name: body.name } };
  });

  app.post('/api/me/phrase', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = z.object({ phrase: phraseSchema.optional() }).parse(request.body ?? {});
    const phrase = await s.auth.setPhrase(user.id, body.phrase ?? null);
    return { phrase };
  });

  /** Rooms the player is still part of, for the "back to your game" banner. */
  app.get('/api/me/rooms', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return { rooms: s.manager.activeRoomsFor(user.id) };
  });

  app.get('/api/stats/me', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return s.db.lifetimeStats(user.id);
  });

  // ---- rooms ----

  app.post('/api/rooms', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    if (!s.auth.canOpenTables(user)) {
      return fail(reply, 403, 'not-allowed', 'Only the person who runs this server can open a table here.');
    }
    const body = createRoomSchema.parse(request.body ?? {});
    const record = await s.manager.create(user, {
      name: body.name,
      passwordHash: body.password ? hashSecret(body.password) : null,
      settings: body.settings,
    });
    return { code: record.code, joinUrl: `${app.publicUrl}/r/${record.code}` };
  });

  app.get('/api/rooms/:code', async (request, reply) => {
    const code = roomCodeSchema.parse((request.params as { code: string }).code);
    const rt = s.manager.get(code);
    if (!rt) return fail(reply, 404, 'no-room', 'No table with that code');
    return s.manager.publicInfo(rt, request.user?.id ?? null);
  });

  app.post('/api/rooms/:code/join', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const code = roomCodeSchema.parse((request.params as { code: string }).code);
    const body = z.object({ password: z.string().max(64).optional() }).parse(request.body ?? {});
    const rt = s.manager.get(code);
    if (!rt) return fail(reply, 404, 'no-room', 'No table with that code');
    const r = rt.record;
    if (!r.members[user.id]) {
      if (r.phase === 'ended') return fail(reply, 410, 'ended', 'That night is over');
      if (r.passwordHash && !(body.password && verifySecret(body.password, r.passwordHash))) {
        return fail(reply, 403, 'bad-password', 'Wrong password');
      }
    }
    s.manager.join(rt, user);
    return { ok: true, code };
  });

  app.get('/api/rooms/:code/report', async (request, reply) => {
    const code = roomCodeSchema.parse((request.params as { code: string }).code);
    const rt = s.manager.get(code);
    const live = rt?.record.report ?? null;
    const report = live ?? (await s.db.roomReport(code));
    if (!report) return fail(reply, 404, 'no-report', 'No report for that table yet');
    return report;
  });
}
