import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db, UserRow } from './db.js';
import { normalizePhrase, randomPhrase, randomUsername } from './words.js';

export const SESSION_COOKIE = 'calliope_session';

export interface PublicUser {
  id: string;
  name: string;
  recovered: boolean;
  createdAt: number;
  /**
   * This identity has entered the server's host key, so it may open tables.
   * Not to be confused with being the host of a particular table.
   */
  canOpenTables: boolean;
}

export function publicUser(u: UserRow): PublicUser {
  return {
    id: u.id,
    name: u.name,
    recovered: u.recovered_at !== null,
    createdAt: u.created_at.getTime(),
    canOpenTables: u.can_open_tables === true,
  };
}

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

class Limiter {
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

  constructor(
    private readonly db: Db,
    private readonly secureCookies: boolean,
    /** When set, opening a table needs this key. Null leaves the server open. */
    private readonly hostKey: string | null = null,
  ) {}

  /** Opening a table is restricted on this server. */
  get restricted(): boolean {
    return this.hostKey !== null;
  }

  canOpenTables(user: PublicUser): boolean {
    return !this.restricted || user.canOpenTables;
  }

  allowCreate(ip: string): boolean {
    return this.createLimiter.allow(`ip:${ip}`);
  }

  /**
   * Hand this identity the right to open tables, if the key is right. Compared
   * in constant time, and rate limited, so the key cannot be guessed at speed.
   */
  async claimHost(userId: string, key: string, ip: string): Promise<'ok' | 'wrong' | 'limited' | 'open'> {
    if (this.hostKey === null) return 'open';
    if (!this.claimLimiter.allow(`ip:${ip}`)) return 'limited';
    const given = createHash('sha256').update(key.trim()).digest();
    const want = createHash('sha256').update(this.hostKey).digest();
    if (given.length !== want.length || !timingSafeEqual(given, want)) return 'wrong';
    await this.db.grantOpenTables(userId);
    return 'ok';
  }

  /** First visit: a fresh identity with a generated name and phrase. */
  async createUser(name?: string): Promise<{ user: PublicUser; phrase: string[]; token: string }> {
    const id = randomUUID();
    const phrase = randomPhrase();
    const finalName = name?.trim() || randomUsername();
    await this.db.createUser(id, finalName, hashSecret(phraseKey(phrase)));
    const token = await this.issueToken(id);
    const user = (await this.db.getUser(id))!;
    return { user: publicUser(user), phrase, token };
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
        return { user: publicUser(user), token };
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
