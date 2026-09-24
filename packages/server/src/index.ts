import { existsSync } from 'node:fs';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import { Auth } from './auth.js';
import { loadConfig } from './config.js';
import { Db, connect, migrate } from './db.js';
import { registerHttp } from './http.js';
import { RoomManager } from './manager.js';
import { TablePolicy } from './policy.js';
import { Store } from './store.js';
import { registerWs } from './ws.js';

declare module 'fastify' {
  interface FastifyInstance {
    publicUrl: string;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const app = Fastify({ logger: { level: config.production ? 'info' : 'debug' }, trustProxy: true });
  app.decorate('publicUrl', config.publicUrl);

  const sql = connect(config.databaseUrl);
  await migrate(sql);
  const db = new Db(sql);
  const store = new Store(config.redisUrl);
  await store.connect();
  const auth = new Auth(db, config.publicUrl.startsWith('https://'), config.hostKey);
  const policy = await TablePolicy.load(db, auth.owned);
  if (config.hostKey) {
    if (config.hostKey.length < 16) app.log.warn('HOST_KEY is short. Use a long random one: openssl rand -base64 24');
    const adopted = await db.adoptLegacyOwners(auth.hostFingerprint!);
    if (adopted > 0) app.log.info(`${adopted} identity(ies) that entered HOST_KEY before are the owner under the current key`);
    const p = policy.policy;
    const admins = await db.liveAdminKeyCount();
    app.log.info(
      p.openTo === 'hosts'
        ? `Only the owner and admins can open tables (${admins} admin key(s) live)`
        : `Anyone can open a table: at most ${p.maxTables ?? 'unlimited'} at once, ` +
          `${p.maxTablesPerPerson} each, closing after ${p.maxTableMinutes === null ? 'no limit' : `${p.maxTableMinutes} min`} ` +
          `(${admins} admin key(s) live)`,
    );
  } else {
    app.log.warn(
      'HOST_KEY is not set, so anyone who can reach this server can open a table, with no limits. ' +
      'Set HOST_KEY in your .env to keep it to yourself, or to open it to the public with limits.',
    );
  }

  const manager = new RoomManager({
    publicUrl: config.publicUrl,
    log: (msg, extra) => app.log.warn({ extra }, msg),
    persist: (record) => store.save(record),
    forget: (record) => store.remove(record.code),
    onRoomCancelled: (record) => db.roomCancelled(record.code, Date.now()),
    onRoomCreated: (record) => db.insertRoom({ code: record.code, name: record.name, hostId: record.hostId, createdAt: record.createdAt, settings: record.settings }),
    onRoomStarted: (record) => db.roomStarted(record.code, record.clock.startedAt ?? Date.now()),
    onHandSettled: (record, summary) => db.insertHand(record.code, summary),
    onNightEnded: (record, report) => db.roomEnded(record.code, record.name, report.endedAt, report),
    expiresAt: (record) => policy.expiresAt(record),
  });
  const restored = await store.loadAll();
  manager.restore(restored);
  app.log.info(`Restored ${restored.length} room(s) from Redis`);

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  const log = (msg: string, extra?: unknown): void => { app.log.warn({ extra }, msg); };
  let sweeping: Promise<void> | null = null;
  // One sweep at a time: a slow one is joined, not doubled up.
  const sweep = (): Promise<void> => {
    sweeping ??= policy.sweep(manager, Date.now(), log, (r) => store.save(r)).finally(() => { sweeping = null; });
    return sweeping;
  };
  const sweeper = setInterval(() => void sweep(), 30_000);

  const services = { auth, db, manager, policy, sweep };
  registerHttp(app, services);
  registerWs(app, services);

  if (config.webDist && existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: true, index: ['index.html'] });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/')) {
        return reply.status(404).send({ error: { code: 'not-found', message: 'No such route' } });
      }
      return reply.sendFile('index.html');
    });
    app.log.info(`Serving web app from ${config.webDist}`);
  }

  const shutdown = async (): Promise<void> => {
    app.log.info('Shutting down');
    clearInterval(sweeper);
    await app.close();
    await store.close();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  await app.listen({ port: config.port, host: config.host });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
