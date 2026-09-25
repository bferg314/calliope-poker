import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hasVariant, getVariant, listVariants, summaryFor, wildLabel, type HandSummary } from '@calliope/engine';
import { createRoomSchema, instancePolicySchema, nameSchema, phraseSchema, roomCodeSchema, type HandDetail, type HandListItem } from '@calliope/shared';
import { hashSecret, verifySecret, type Auth, type PublicUser } from './auth.js';
import type { Db } from './db.js';
import { RoomError, type RoomManager } from './manager.js';
import { REFUSAL_STATUS, type TablePolicy } from './policy.js';
import { randomRoomCode } from './room.js';

export interface Services {
  auth: Auth;
  db: Db;
  manager: RoomManager;
  policy: TablePolicy;
  /** Run the limits and the clean-up now, after the policy changed. */
  sweep(): Promise<void>;
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
    request.user = row ? s.auth.publicUser(row) : null;
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

  /** The owner or an admin. `ownerOnly` narrows it to whoever holds HOST_KEY. */
  const requireRole = (request: FastifyRequest, reply: FastifyReply, ownerOnly = false): PublicUser | null => {
    const user = requireUser(request, reply);
    if (!user) return null;
    const ok = ownerOnly ? user.serverRole === 'owner' : user.serverRole !== null;
    if (!ok) {
      void fail(reply, 403, 'not-allowed', ownerOnly ? 'Only the owner of this server can do that.' : 'Only the people who run this server can do that.');
      return null;
    }
    return user;
  };

  app.get('/api/health', async () => ({ ok: true, rooms: s.manager.rooms.size }));

  /** What a visitor needs to know before signing in. No authentication required. */
  app.get('/api/instance', async () => s.policy.info(s.manager.rooms.values()));

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

  /** Prove you run this server, with HOST_KEY or an admin key the owner made. */
  app.post('/api/auth/claim-host', async (request, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = z.object({ key: z.string().min(1).max(200) }).parse(request.body ?? {});
    const result = await s.auth.claimKey(user.id, body.key, request.ip);
    if (result === 'limited') return fail(reply, 429, 'too-many-attempts', 'Too many tries. Wait a few minutes.');
    if (result === 'wrong') return fail(reply, 403, 'bad-key', 'That key does not open anything on this server.');
    if (result === 'open') return fail(reply, 400, 'not-restricted', 'This server lets anyone open a table.');
    // An owner who also once held an admin key stays the owner.
    const serverRole = user.serverRole === 'owner' ? 'owner' : result;
    return { user: { ...user, serverRole } };
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
    const body = createRoomSchema.parse(request.body ?? {});
    const passwordHash = body.password ? hashSecret(body.password) : null;
    // Codes are never reused, or a new night would be filed on top of an old one.
    let code = randomRoomCode();
    while (s.manager.rooms.has(code) || (await s.db.roomCodeExists(code))) code = randomRoomCode();
    // No await between admit and create: the limits cannot be raced.
    const admitted = s.policy.admit(user, request.ip, s.manager.rooms.values());
    if (typeof admitted === 'string') return fail(reply, REFUSAL_STATUS[admitted], admitted, s.policy.refusalMessage(admitted));
    const record = await s.manager.create(user, {
      name: body.name,
      passwordHash,
      settings: body.settings,
      code,
      quota: admitted.quota,
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

  // ---- running the server ----

  app.get('/api/server', async (request, reply) => {
    if (!requireRole(request, reply)) return;
    return { owned: s.policy.owned, policy: s.policy.policy, tables: s.policy.tables(s.manager) };
  });

  app.put('/api/server/policy', async (request, reply) => {
    if (!requireRole(request, reply)) return;
    const policy = instancePolicySchema.parse(request.body ?? {});
    await s.policy.update(policy);
    await s.sweep();
    return { policy: s.policy.policy };
  });

  app.post('/api/server/rooms/:code/close', async (request, reply) => {
    if (!requireRole(request, reply)) return;
    const code = roomCodeSchema.parse((request.params as { code: string }).code);
    const rt = s.manager.get(code);
    if (!rt) return fail(reply, 404, 'no-room', 'No table with that code');
    await s.manager.close(rt, 'admin');
    return { ok: true };
  });

  /** Close every table nobody has open right now. */
  app.post('/api/server/close-empty', async (request, reply) => {
    if (!requireRole(request, reply)) return;
    return { closed: await s.policy.closeEmpty(s.manager) };
  });

  app.get('/api/server/admins', async (request, reply) => {
    if (!requireRole(request, reply, true)) return;
    return { keys: await s.db.listAdminKeys() };
  });

  /** A new admin key. This is the only time its value is ever shown. */
  app.post('/api/server/admins', async (request, reply) => {
    if (!requireRole(request, reply, true)) return;
    const body = z.object({ label: z.string().trim().min(1, 'Give the key a name').max(40) }).parse(request.body ?? {});
    const { id, key } = await s.auth.createAdminKey(body.label);
    return { id, key };
  });

  app.delete('/api/server/admins/:id', async (request, reply) => {
    if (!requireRole(request, reply, true)) return;
    const id = z.string().uuid().parse((request.params as { id: string }).id);
    const revoked = await s.db.revokeAdminKeys(id);
    if (revoked === 0) return fail(reply, 404, 'no-key', 'No live key with that id');
    return { ok: true };
  });

  app.delete('/api/server/admins', async (request, reply) => {
    if (!requireRole(request, reply, true)) return;
    return { revoked: await s.db.revokeAdminKeys(null) };
  });

  /**
   * A night's hands, from the live table while it is held and from the database
   * after. Anyone with the code may read them, as anyone with it may read the
   * report, so each hand goes out as the asker may see it: folded hands stay
   * face down, except the asker's own.
   */
  const handsOf = async (code: string): Promise<HandSummary[]> => s.manager.get(code)?.record.hands ?? (await s.db.roomHands(code));
  const variantName = (id: string): string => (hasVariant(id) ? getVariant(id).name : id);

  app.get('/api/rooms/:code/hands', async (request): Promise<HandListItem[]> => {
    const code = roomCodeSchema.parse((request.params as { code: string }).code);
    return (await handsOf(code)).map((h) => ({
      number: h.number,
      variantId: h.variantId,
      variantName: variantName(h.variantId),
      potTotal: h.potTotal,
      showdown: h.showdown,
      wild: wildLabel(h.wild),
      winners: h.winners.map((w) => ({ name: h.players.find((p) => p.seat === w.seat)?.name ?? '?', amount: w.amount, handLabel: w.handLabel })),
    }));
  });

  app.get('/api/rooms/:code/hands/:number', async (request, reply): Promise<HandDetail | FastifyReply> => {
    const params = request.params as { code: string; number: string };
    const code = roomCodeSchema.parse(params.code);
    const number = z.coerce.number().int().positive().parse(params.number);
    const hand = (await handsOf(code)).find((h) => h.number === number);
    if (!hand) return fail(reply, 404, 'no-hand', 'No such hand at that table');
    return { hand: summaryFor(hand, request.user?.id ?? null), variantName: variantName(hand.variantId) };
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
