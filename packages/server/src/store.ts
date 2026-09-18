import { Redis } from 'ioredis';
import type { RoomRecord } from './room.js';

const KEY = (code: string): string => `room:${code}`;
const INDEX = 'rooms';
/** Rooms expire from Redis a week after their last change; Postgres keeps the report. */
const TTL_SECONDS = 7 * 24 * 60 * 60;

export class Store {
  private readonly redis: Redis;
  constructor(url: string) {
    this.redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  }

  async connect(): Promise<void> {
    await this.redis.connect();
  }

  async save(record: RoomRecord): Promise<void> {
    await this.redis
      .multi()
      .set(KEY(record.code), JSON.stringify(record), 'EX', TTL_SECONDS)
      .sadd(INDEX, record.code)
      .exec();
  }

  async remove(code: string): Promise<void> {
    await this.redis.multi().del(KEY(code)).srem(INDEX, code).exec();
  }

  async loadAll(): Promise<RoomRecord[]> {
    const codes = await this.redis.smembers(INDEX);
    const out: RoomRecord[] = [];
    for (const code of codes) {
      const raw = await this.redis.get(KEY(code));
      if (!raw) { await this.redis.srem(INDEX, code); continue; }
      try { out.push(JSON.parse(raw) as RoomRecord); } catch { await this.remove(code); }
    }
    return out;
  }

  async close(): Promise<void> {
    await this.redis.quit();
  }
}
