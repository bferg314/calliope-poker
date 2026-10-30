import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { trustOneProxy } from '../src/config.js';

describe('client IP behind the tunnel', () => {
  it('uses the address the tunnel appended, not one the client wrote', async () => {
    const app = Fastify({ trustProxy: trustOneProxy });
    app.get('/ip', async (request) => request.ip);
    const res = await app.inject({
      url: '/ip',
      remoteAddress: '10.42.0.10',
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9' },
    });
    expect(res.body).toBe('203.0.113.9');
    await app.close();
  });
});
