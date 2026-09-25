import { describe, expect, it, vi } from 'vitest';
import { adminKeyHash, Auth, hostKeyFingerprint, publicUser } from '../src/auth.js';
import type { Db, UserRow } from '../src/db.js';

interface FakeKey { id: string; hash: string; revoked: boolean }

/** Just enough of Db for claiming keys: users' fingerprints and admin keys. */
function fakeDb(): { db: Db; owners: Map<string, string>; admins: Map<string, string>; keys: FakeKey[] } {
  const owners = new Map<string, string>();
  const admins = new Map<string, string>();
  const keys: FakeKey[] = [];
  const db = {
    async grantOwner(id: string, fp: string) { owners.set(id, fp); },
    async grantAdmin(id: string, keyId: string) { admins.set(id, keyId); },
    async useAdminKey(hash: string) { return keys.find((k) => k.hash === hash && !k.revoked)?.id ?? null; },
    async createAdminKey(id: string, _label: string, hash: string) { keys.push({ id, hash, revoked: false }); },
  } as unknown as Db;
  return { db, owners, admins, keys };
}

function row(id: string, extra: Partial<UserRow> = {}): UserRow {
  return {
    id,
    name: 'Tester',
    phrase_hash: 'x',
    created_at: new Date(0),
    recovered_at: null,
    host_key_fp: null,
    is_admin: false,
    ...extra,
  };
}

const KEY = 'correct horse battery staple';

describe('a server with no owner', () => {
  it('has nothing to claim', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, null);
    expect(auth.owned).toBe(false);
    expect(await auth.claimKey('anyone', 'whatever', '1.2.3.4')).toBe('open');
  });

  it('gives nobody a role, whatever their row says', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, null);
    expect(auth.publicUser(row('u1', { host_key_fp: hostKeyFingerprint(KEY), is_admin: true })).serverRole).toBeNull();
  });
});

describe('the owner', () => {
  it('is whoever entered HOST_KEY', async () => {
    const { db, owners } = fakeDb();
    const auth = new Auth(db, false, KEY);
    expect(await auth.claimKey('u1', 'wrong', '1.1.1.1')).toBe('wrong');
    expect(owners.size).toBe(0);
    expect(await auth.claimKey('u1', KEY, '1.1.1.1')).toBe('owner');
    expect(owners.get('u1')).toBe(hostKeyFingerprint(KEY));
    expect(auth.publicUser(row('u1', { host_key_fp: owners.get('u1')! })).serverRole).toBe('owner');
  });

  it('stops being the owner when HOST_KEY changes', () => {
    const { db } = fakeDb();
    const before = row('u1', { host_key_fp: hostKeyFingerprint(KEY) });
    expect(new Auth(db, false, 'a brand new key').publicUser(before).serverRole).toBeNull();
  });

  it('ignores surrounding whitespace when the key is typed or pasted', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    expect(await auth.claimKey('u1', '  a-secret-key\n', '1.1.1.1')).toBe('owner');
  });

  it('is not fooled by a prefix of the key', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    expect(await auth.claimKey('u1', 'a-secret', '1.1.1.1')).toBe('wrong');
    expect(await auth.claimKey('u1', 'a-secret-key-and-more', '1.1.1.1')).toBe('wrong');
    expect(await auth.claimKey('u1', '', '1.1.1.1')).toBe('wrong');
  });
});

describe('admins', () => {
  it('are whoever entered a key the owner made', async () => {
    const { db, admins } = fakeDb();
    const auth = new Auth(db, false, KEY);
    const { id, key } = await auth.createAdminKey('Sam');
    expect(key.startsWith('cal-admin-')).toBe(true);
    expect(await auth.claimKey('sam', key, '2.2.2.2')).toBe('admin');
    expect(admins.get('sam')).toBe(id);
    expect(auth.publicUser(row('sam', { is_admin: true })).serverRole).toBe('admin');
  });

  it('keeps only a hash of the key', async () => {
    const { db, keys } = fakeDb();
    const auth = new Auth(db, false, KEY);
    const { key } = await auth.createAdminKey('Sam');
    expect(keys[0]!.hash).toBe(adminKeyHash(key));
    expect(keys[0]!.hash).not.toContain(key);
  });

  it('cannot use a revoked key', async () => {
    const { db, keys } = fakeDb();
    const auth = new Auth(db, false, KEY);
    const { key } = await auth.createAdminKey('Sam');
    keys[0]!.revoked = true;
    expect(await auth.claimKey('sam', key, '2.2.2.2')).toBe('wrong');
  });

  it('lose the role once their key is revoked, which the database reports as not admin', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, KEY);
    expect(auth.publicUser(row('sam', { is_admin: false })).serverRole).toBeNull();
  });

  it('are not the owner even with the owner fingerprint of an old key', () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, KEY);
    const r = row('sam', { is_admin: true, host_key_fp: hostKeyFingerprint('old key') });
    expect(auth.publicUser(r).serverRole).toBe('admin');
  });
});

describe('guessing', () => {
  it('is rate limited per address, for either kind of key', async () => {
    const { db } = fakeDb();
    const auth = new Auth(db, false, 'a-secret-key');
    const results: string[] = [];
    for (let i = 0; i < 12; i++) results.push(await auth.claimKey('u1', `cal-admin-guess-${i}`, '9.9.9.9'));
    expect(results.filter((r) => r === 'wrong')).toHaveLength(10);
    expect(results.filter((r) => r === 'limited')).toHaveLength(2);
    // The limit is per address, so it does not lock out the rest of the table.
    expect(await auth.claimKey('u2', 'a-secret-key', '5.5.5.5')).toBe('owner');
  });

  it('lets someone try again later', async () => {
    vi.useFakeTimers();
    try {
      const { db } = fakeDb();
      const auth = new Auth(db, false, 'a-secret-key');
      for (let i = 0; i < 10; i++) await auth.claimKey('u1', 'nope', '4.4.4.4');
      expect(await auth.claimKey('u1', 'nope', '4.4.4.4')).toBe('limited');
      vi.advanceTimersByTime(16 * 60 * 1000);
      expect(await auth.claimKey('u1', 'a-secret-key', '4.4.4.4')).toBe('owner');
    } finally {
      vi.useRealTimers();
    }
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
  it('reads a row from before roles existed as no role', () => {
    const legacy = { ...row('u1') } as Partial<UserRow>;
    delete legacy.host_key_fp;
    delete legacy.is_admin;
    expect(publicUser(legacy as UserRow, hostKeyFingerprint(KEY)).serverRole).toBeNull();
  });
});
