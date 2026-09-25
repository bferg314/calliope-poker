import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerRole } from '@calliope/shared';
import type { Db, UserRow } from './db.js';
import { normalizePhrase, randomPhrase, randomUsername } from './words.js';

export const SESSION_COOKIE = 'calliope_session';

export interface PublicUser {
  id: string;
  name: string;
  recovered: boolean;
  createdAt: number;
  /**
   * The owner entered HOST_KEY; an admin entered a key the owner made. Either
   * may open tables whatever the policy, free of its limits. Not to be confused
   * with being the host of a particular table.
   */
  serverRole: ServerRole | null;
}

/** What HOST_KEY is remembered by, so changing the key revokes old owners. */
export function hostKeyFingerprint(key: string): string {
  return createHash('sha256').update(`calliope:host:${key}`).digest('hex');
}

/** Admin keys are random and long, so a plain hash is enough and can be looked up. */
export function adminKeyHash(key: string): string {
  return createHash('sha256').update(`calliope:admin:${key}`).digest('hex');
}

export function publicUser(u: UserRow, hostFingerprint: string | null): PublicUser {
  const owner = hostFingerprint !== null && u.host_key_fp === hostFingerprint;
  return {
    id: u.id,
    name: u.name,
    recovered: u.recovered_at !== null,
    createdAt: u.created_at.getTime(),
    serverRole: owner ? 'owner' : hostFingerprint !== null && u.is_admin === true ? 'admin' : null,
  };
}

export const ADMIN_KEY_PREFIX = 'cal-admin-';

// ---- hashing (scrypt: no native dependencies) ----

export function hashSecret(secret: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(secret.normalize('NFKC'), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifySecret(secret: string, stored: string): boolean {
  const [scheme, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const salt = Buffer.from(saltB64, 'base64url');
  const expected = Buffer.from(hashB64, 'base64url');
  const actual = scryptSync(secret.normalize('NFKC'), salt, expected.length, { N: 16384, r: 8, p: 1 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function phraseKey(words: readonly string[]): string {
  return normalizePhrase(words).join(' ');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ---- rate limiting for recovery attempts ----

export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly windowMs: number) {}
  allow(key: string, now = Date.now()): boolean {
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.max) { this.hits.set(key, list); return false; }
    list.push(now);
    this.hits.set(key, list);
    return true;
  }
}

export class Auth {
  private readonly recoverLimiter = new Limiter(10, 15 * 60 * 1000);
  private readonly claimLimiter = new Limiter(10, 15 * 60 * 1000);
  /** Stops a stranger filling the table with throwaway identities. */
  private readonly createLimiter = new Limiter(30, 60 * 60 * 1000);

  /** Fingerprint of the current HOST_KEY; null when the server has no owner. */
  readonly hostFingerprint: string | null;

  constructor(
    private readonly db: Db,
    private readonly secureCookies: boolean,
    /** The owner's key. Null leaves the server open, with nobody to run it. */
    private readonly hostKey: string | null = null,
  ) {
    this.hostFingerprint = hostKey === null ? null : hostKeyFingerprint(hostKey);
  }

  /** The server has an owner, so it can have admins and a policy. */
  get owned(): boolean {
    return this.hostKey !== null;
  }

  publicUser(row: UserRow): PublicUser {
    return publicUser(row, this.hostFingerprint);
  }

  allowCreate(ip: string): boolean {
    return this.createLimiter.allow(`ip:${ip}`);
  }

  /**
   * Give this identity the role its key unlocks: HOST_KEY makes it the owner,
   * a live admin key an admin. The host key is compared in constant time, and
   * every attempt is rate limited, so neither can be guessed at speed.
   */
  async claimKey(userId: string, key: string, ip: string): Promise<ServerRole | 'wrong' | 'limited' | 'open'> {
    if (this.hostKey === null) return 'open';
    if (!this.claimLimiter.allow(`ip:${ip}`)) return 'limited';
    const typed = key.trim();
    const given = createHash('sha256').update(typed).digest();
    const want = createHash('sha256').update(this.hostKey).digest();
    if (given.length === want.length && timingSafeEqual(given, want)) {
      await this.db.grantOwner(userId, this.hostFingerprint!);
      return 'owner';
    }
    if (typed.startsWith(ADMIN_KEY_PREFIX)) {
      const keyId = await this.db.useAdminKey(adminKeyHash(typed));
      if (keyId) {
        await this.db.grantAdmin(userId, keyId);
        return 'admin';
      }
    }
    return 'wrong';
  }

  /** A new admin key. Returned once; only its hash is kept. */
  async createAdminKey(label: string): Promise<{ id: string; key: string }> {
    const id = randomUUID();
    const key = ADMIN_KEY_PREFIX + randomBytes(24).toString('base64url');
    await this.db.createAdminKey(id, label, adminKeyHash(key));
    return { id, key };
  }

  /** First visit: a fresh identity with a generated name and phrase. */
  async createUser(name?: string): Promise<{ user: PublicUser; phrase: string[]; token: string }> {
    const id = randomUUID();
    const phrase = randomPhrase();
    const finalName = name?.trim() || randomUsername();
    await this.db.createUser(id, finalName, hashSecret(phraseKey(phrase)));
    const token = await this.issueToken(id);
    const user = (await this.db.getUser(id))!;
    return { user: this.publicUser(user), phrase, token };
  }

  /** Recover a previous identity from its name and five words. */
  async recover(name: string, words: string[], ip: string): Promise<{ user: PublicUser; token: string } | 'limited' | null> {
    if (!this.recoverLimiter.allow(`ip:${ip}`) || !this.recoverLimiter.allow(`name:${name.toLowerCase()}`)) return 'limited';
    const key = phraseKey(words);
    for (const row of await this.db.usersNamed(name)) {
      if (verifySecret(key, row.phrase_hash)) {
        await this.db.markRecovered(row.id);
        const token = await this.issueToken(row.id);
        const user = (await this.db.getUser(row.id))!;
        return { user: this.publicUser(user), token };
      }
    }
    return null;
  }

  async setPhrase(userId: string, words: string[] | null): Promise<string[]> {
    const phrase = words ?? randomPhrase();
    await this.db.setPhrase(userId, hashSecret(phraseKey(phrase)));
    return phrase;
  }

  async issueToken(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.createSession(tokenHash(token), userId);
    return token;
  }

  async revoke(token: string): Promise<void> {
    await this.db.deleteSession(tokenHash(token));
  }

  tokenFrom(request: FastifyRequest): string | null {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7).trim();
    const cookie = (request.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
    if (cookie) return cookie;
    const q = (request.query ?? {}) as Record<string, unknown>;
    if (typeof q.token === 'string') return q.token;
    return null;
  }

  async userFrom(request: FastifyRequest): Promise<UserRow | null> {
    const token = this.tokenFrom(request);
    if (!token) return null;
    return this.db.sessionUser(tokenHash(token));
  }

  setCookie(reply: FastifyReply, token: string): void {
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.secureCookies,
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  clearCookie(reply: FastifyReply): void {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
  }
}
