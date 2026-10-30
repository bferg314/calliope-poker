import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { hashSecret } from '../src/auth.js';
import { registerHttp, type Services } from '../src/http.js';

/** The join route over one live table that has a password. */
async function app() {
  const joined: string[] = [];
  const record = { phase: 'lobby', members: {} as Record<string, unknown>, passwordHash: hashSecret('open sesame') };
  const services = {
    auth: {
      userFrom: async (request: { headers: Record<string, string> }) => ({ id: request.headers['x-test-user'] ?? 'ann' }),
      publicUser: (row: { id: string }) => ({ id: row.id, name: row.id, recovered: false, createdAt: 0, serverRole: null }),
    },
    manager: { get: (code: string) => (code === 'ABC234' ? { record } : undefined), join: (_rt: unknown, user: { id: string }) => joined.push(user.id), rooms: new Map() },
    policy: {},
    sweep: async () => undefined,
  } as unknown as Services;
  const a = Fastify();
  registerHttp(a, services);
  await a.ready();
  const join = (password: string, user = 'ann', ip = '203.0.113.9') =>
    a.inject({ method: 'POST', url: '/api/rooms/ABC234/join', remoteAddress: ip, headers: { 'x-test-user': user }, payload: { password } });
  return { join, joined };
}

describe('table passwords', () => {
  it('lets the right password in', async () => {
    const { join, joined } = await app();
    expect((await join('open sesame')).statusCode).toBe(200);
    expect(joined).toEqual(['ann']);
  });

  it('stops guessing after ten tries from one player', async () => {
    const { join } = await app();
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await join(`guess ${i}`, 'ann', `198.51.100.${i}`)).statusCode);
    expect(codes.slice(0, 10).every((c) => c === 403)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('stops guessing after ten tries from one address, whoever is asking', async () => {
    const { join } = await app();
    const codes = [];
    for (let i = 0; i < 11; i++) codes.push((await join(`guess ${i}`, `player${i}`)).statusCode);
    expect(codes[10]).toBe(429);
  });
});
