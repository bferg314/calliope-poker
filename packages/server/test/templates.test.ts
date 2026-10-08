import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, MAX_TEMPLATES, toTemplateSettings, type TableTemplate } from '@calliope/shared';
import type { TemplateWrite } from '../src/db.js';
import { registerHttp, type Services } from '../src/http.js';

interface Row extends TableTemplate { userId: string }

/** The template queries over an array, with the same refusals as the SQL. */
function fakeDb(rows: Row[]) {
  const taken = (userId: string, name: string, except?: string): boolean =>
    rows.some((r) => r.userId === userId && r.id !== except && r.name.toLowerCase() === name.toLowerCase());
  return {
    async listTemplates(userId: string): Promise<TableTemplate[]> {
      return rows.filter((r) => r.userId === userId).map(({ userId: _u, ...t }) => t);
    },
    async insertTemplate(id: string, userId: string, name: string, settings: unknown, max: number): Promise<TemplateWrite> {
      if (rows.filter((r) => r.userId === userId).length >= max) return 'full';
      if (taken(userId, name)) return 'exists';
      rows.push({ id, userId, name, settings, updatedAt: 0 });
      return 'ok';
    },
    async updateTemplate(id: string, userId: string, change: { name?: string; settings?: unknown }): Promise<TemplateWrite> {
      const row = rows.find((r) => r.id === id && r.userId === userId);
      if (!row) return 'missing';
      if (change.name !== undefined && taken(userId, change.name, id)) return 'exists';
      Object.assign(row, change);
      return 'ok';
    },
    async deleteTemplate(id: string, userId: string): Promise<boolean> {
      const i = rows.findIndex((r) => r.id === id && r.userId === userId);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
}

async function app(rows: Row[]) {
  const services = {
    auth: {
      userFrom: async (request: { headers: Record<string, string | undefined> }) => {
        const who = request.headers['x-user'];
        return who ? { id: who } : null;
      },
      publicUser: (row: { id: string }) => ({ id: row.id, name: row.id, recovered: false, createdAt: 0, serverRole: null }),
    },
    db: fakeDb(rows),
    manager: { get: () => undefined, rooms: new Map() },
    policy: {},
    sweep: async () => undefined,
  } as unknown as Services;
  const a = Fastify();
  registerHttp(a, services);
  await a.ready();
  return a;
}

const SETTINGS = toTemplateSettings(DEFAULT_ROOM_SETTINGS);

describe('table templates', () => {
  it('saves, lists, renames and deletes', async () => {
    const a = await app([]);
    const saved = await a.inject({ method: 'POST', url: '/api/me/templates', headers: { 'x-user': 'ann' }, payload: { name: 'Friday', settings: SETTINGS } });
    expect(saved.statusCode).toBe(200);
    const { id } = saved.json() as { id: string };

    const list = async () => ((await a.inject({ method: 'GET', url: '/api/me/templates', headers: { 'x-user': 'ann' } })).json() as { templates: TableTemplate[] }).templates;
    expect((await list()).map((t) => t.name)).toEqual(['Friday']);

    const renamed = await a.inject({ method: 'PUT', url: `/api/me/templates/${id}`, headers: { 'x-user': 'ann' }, payload: { name: 'Saturday' } });
    expect(renamed.statusCode).toBe(200);
    expect((await list())[0]!.name).toBe('Saturday');

    const gone = await a.inject({ method: 'DELETE', url: `/api/me/templates/${id}`, headers: { 'x-user': 'ann' } });
    expect(gone.statusCode).toBe(200);
    expect(await list()).toEqual([]);
  });

  it('keeps each identity\'s templates to itself', async () => {
    const rows: Row[] = [{ id: '00000000-0000-4000-8000-000000000001', userId: 'ann', name: 'Mine', settings: SETTINGS, updatedAt: 0 }];
    const a = await app(rows);
    const bobsList = (await a.inject({ method: 'GET', url: '/api/me/templates', headers: { 'x-user': 'bob' } })).json() as { templates: TableTemplate[] };
    expect(bobsList.templates).toEqual([]);
    const del = await a.inject({ method: 'DELETE', url: `/api/me/templates/${rows[0]!.id}`, headers: { 'x-user': 'bob' } });
    expect(del.statusCode).toBe(404);
    const put = await a.inject({ method: 'PUT', url: `/api/me/templates/${rows[0]!.id}`, headers: { 'x-user': 'bob' }, payload: { name: 'Stolen' } });
    expect(put.statusCode).toBe(404);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Mine');
  });

  it('needs an identity', async () => {
    const res = await (await app([])).inject({ method: 'GET', url: '/api/me/templates' });
    expect(res.statusCode).toBe(401);
  });

  it('refuses a name already in use, and a full shelf', async () => {
    const rows: Row[] = [];
    const a = await app(rows);
    const save = (name: string) => a.inject({ method: 'POST', url: '/api/me/templates', headers: { 'x-user': 'ann' }, payload: { name, settings: SETTINGS } });
    await save('Friday');
    const again = await save('friday');
    expect(again.statusCode).toBe(409);
    expect((again.json() as { error: { code: string } }).error.code).toBe('template-exists');
    for (let i = rows.length; i < MAX_TEMPLATES; i++) await save(`Night ${i}`);
    const full = await save('One more');
    expect(full.statusCode).toBe(409);
    expect((full.json() as { error: { code: string } }).error.code).toBe('templates-full');
  });

  it('refuses settings that do not read', async () => {
    const a = await app([]);
    const bad = await a.inject({
      method: 'POST', url: '/api/me/templates', headers: { 'x-user': 'ann' },
      payload: { name: 'Odd', settings: { ...SETTINGS, actionSeconds: 9000 } },
    });
    expect(bad.statusCode).toBe(400);
    const at = await a.inject({
      method: 'POST', url: '/api/me/templates', headers: { 'x-user': 'ann' },
      payload: { name: 'Stale', settings: { ...SETTINGS, end: { kind: 'at', at: Date.now() } } },
    });
    expect(at.statusCode).toBe(400);
  });
});
