import { describe, expect, it, vi } from 'vitest';
import { Auth, publicUser, type PublicUser } from '../src/auth.js';
import type { Db, UserRow } from '../src/db.js';

function fakeDb(): { db: Db; granted: string[]; rows: Map<string, UserRow> } {
  const granted: string[] = [];
  const rows = new Map<string, UserRow>();
  const db = {
    async grantOpenTables(id: string) {
      granted.push(id);
      const row = rows.get(id);
      if (row) rows.set(id, { ...row, can_open_tables: true });
    },
  } as unknown as Db;
  return { db, granted, rows };
}

function row(id: string, canOpen = false): UserRow {
  return {
    id,
    name: 'Tester',
    phrase_hash: 'x',
    created_at: new Date(0),
    recovered_at: null,
    can_open_tables: canOpen,
  };
}

const asUser = (id: string, canOpen = false): PublicUser => publicUser(row(id, canOpen));

describe('an open server', () => {
  it('lets anybody open a table', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, null);
    expect(auth.restricted).toBe(false);
    expect(auth.canOpenTables(asUser('anyone'))).toBe(true);
  });

  it('says there is nothing to claim', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, null);
    expect(await auth.claimHost('anyone', 'whatever', '1.2.3.4')).toBe('open');
  });
});

describe('a host-only server', () => {
  it('refuses a stranger and allows whoever claimed the key', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'correct horse battery staple');
    expect(auth.restricted).toBe(true);
    expect(auth.canOpenTables(asUser('stranger'))).toBe(false);
    expect(auth.canOpenTables(asUser('owner', true))).toBe(true);
  });

  it('grants the right only for the right key', async () => {
    const { db, granted } = fakeDb();
    const auth = new Auth(db, false, 'correct horse battery staple');

    expect(await auth.claimHost('u1', 'wrong', '1.1.1.1')).toBe('wrong');
    expect(granted).toEqual([]);

    expect(await auth.claimHost('u1', 'correct horse battery staple', '1.1.1.1')).toBe('ok');
    expect(granted).toEqual(['u1']);
  });

  it('ignores surrounding whitespace when the key is typed or pasted', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    expect(await auth.claimHost('u1', '  a-secret-key\n', '1.1.1.1')).toBe('ok');
  });

  it('is not fooled by a prefix of the key', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    expect(await auth.claimHost('u1', 'a-secret', '1.1.1.1')).toBe('wrong');
    expect(await auth.claimHost('u1', 'a-secret-key-and-more', '1.1.1.1')).toBe('wrong');
    expect(await auth.claimHost('u1', '', '1.1.1.1')).toBe('wrong');
  });

  it('stops someone guessing the key at speed', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    const results: string[] = [];
    for (let i = 0; i < 12; i++) results.push(await auth.claimHost('u1', `guess-${i}`, '9.9.9.9'));
    expect(results.filter((r) => r === 'wrong')).toHaveLength(10);
    expect(results.filter((r) => r === 'limited')).toHaveLength(2);
    // The limit is per address, so it does not lock out the rest of the table.
    expect(await auth.claimHost('u2', 'a-secret-key', '5.5.5.5')).toBe('ok');
  });

  it('caps how many identities one address can make', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    let allowed = 0;
    for (let i = 0; i < 40; i++) if (auth.allowCreate('7.7.7.7')) allowed++;
    expect(allowed).toBe(30);
    expect(auth.allowCreate('8.8.8.8')).toBe(true);
  });
});

describe('publicUser', () => {
  it('carries the permission through, defaulting to false', () => {
    expect(publicUser(row('u1')).canOpenTables).toBe(false);
    expect(publicUser(row('u1', true)).canOpenTables).toBe(true);
    // A row read from a database predating the column.
    const legacy = { ...row('u1') } as Partial<UserRow> as UserRow;
    delete (legacy as { can_open_tables?: boolean }).can_open_tables;
    expect(publicUser(legacy).canOpenTables).toBe(false);
  });
});

describe('the rate limit window', () => {
  it('lets someone try again later', async () => {
    vi.useFakeTimers();
    try {
      const { db } = fakeDb();
      const auth = new Auth(db, false, 'a-secret-key');
      for (let i = 0; i < 10; i++) await auth.claimHost('u1', 'nope', '4.4.4.4');
      expect(await auth.claimHost('u1', 'nope', '4.4.4.4')).toBe('limited');
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(await auth.claimHost('u1', 'a-secret-key', '4.4.4.4')).toBe('ok');
    } finally {
      vi.useRealTimers();
    }
  });
});
