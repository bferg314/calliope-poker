import postgres from 'postgres';
import type { HandSummary, } from '@calliope/engine';
import type { NightReport } from '@calliope/shared';

export type Sql = ReturnType<typeof postgres>;

export interface UserRow {
  id: string;
  name: string;
  phrase_hash: string;
  created_at: Date;
  recovered_at: Date | null;
  /** This identity has entered the host key, so it may open tables. */
  can_open_tables: boolean;
}

const MIGRATION = `
CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY,
  name text NOT NULL,
  phrase_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  recovered_at timestamptz,
  can_open_tables boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS users_name ON users (lower(name));
-- For databases created before the host key existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_open_tables boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);

CREATE TABLE IF NOT EXISTS rooms (
  code text PRIMARY KEY,
  name text NOT NULL,
  host_id text NOT NULL,
  created_at timestamptz NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  settings jsonb NOT NULL,
  report jsonb,
  cancelled_at timestamptz
);
-- For databases created before a table could be cancelled. It has to come after
-- the CREATE above, or a fresh database fails here before the table exists.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS room_players (
  room_code text NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  user_id text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  buy_ins int NOT NULL,
  rebuys int NOT NULL,
  total_in int NOT NULL,
  final_stack int NOT NULL,
  net int NOT NULL,
  hands_played int NOT NULL,
  hands_won int NOT NULL,
  showdowns_seen int NOT NULL,
  showdowns_won int NOT NULL,
  vpip_hands int NOT NULL,
  biggest_pot_won int NOT NULL,
  PRIMARY KEY (room_code, user_id)
);
CREATE INDEX IF NOT EXISTS room_players_user ON room_players (user_id);

CREATE TABLE IF NOT EXISTS hands (
  id bigserial PRIMARY KEY,
  room_code text NOT NULL,
  number int NOT NULL,
  variant_id text NOT NULL,
  betting text NOT NULL,
  pot int NOT NULL,
  played_at timestamptz NOT NULL DEFAULT now(),
  summary jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS hands_room ON hands (room_code, number);

CREATE TABLE IF NOT EXISTS hand_players (
  hand_id bigint NOT NULL REFERENCES hands(id) ON DELETE CASCADE,
  user_id text NOT NULL,
  room_code text NOT NULL,
  vpip boolean NOT NULL,
  pfr boolean NOT NULL,
  saw_showdown boolean NOT NULL,
  won_showdown boolean NOT NULL,
  won int NOT NULL,
  net int NOT NULL
);
CREATE INDEX IF NOT EXISTS hand_players_user ON hand_players (user_id);
`;

export function connect(url: string): Sql {
  return postgres(url, { max: 8, onnotice: () => undefined });
}

export async function migrate(sql: Sql): Promise<void> {
  await sql.unsafe(MIGRATION);
}

export class Db {
  constructor(private readonly sql: Sql) {}

  async createUser(id: string, name: string, phraseHash: string): Promise<void> {
    await this.sql`INSERT INTO users (id, name, phrase_hash) VALUES (${id}, ${name}, ${phraseHash})`;
  }

  async getUser(id: string): Promise<UserRow | null> {
    const rows = await this.sql<UserRow[]>`SELECT id, name, phrase_hash, created_at, recovered_at, can_open_tables FROM users WHERE id = ${id}`;
    return rows[0] ?? null;
  }

  async usersNamed(name: string): Promise<UserRow[]> {
    return this.sql<UserRow[]>`SELECT id, name, phrase_hash, created_at, recovered_at, can_open_tables FROM users WHERE lower(name) = lower(${name}) LIMIT 50`;
  }

  async renameUser(id: string, name: string): Promise<void> {
    await this.sql`UPDATE users SET name = ${name} WHERE id = ${id}`;
  }

  async setPhrase(id: string, phraseHash: string): Promise<void> {
    await this.sql`UPDATE users SET phrase_hash = ${phraseHash} WHERE id = ${id}`;
  }

  /** Let this identity open tables. Survives moving to another device. */
  async grantOpenTables(id: string): Promise<void> {
    await this.sql`UPDATE users SET can_open_tables = true WHERE id = ${id}`;
  }

  async markRecovered(id: string): Promise<void> {
    await this.sql`UPDATE users SET recovered_at = COALESCE(recovered_at, now()), last_seen_at = now() WHERE id = ${id}`;
  }

  async touchUser(id: string): Promise<void> {
    await this.sql`UPDATE users SET last_seen_at = now() WHERE id = ${id}`;
  }

  async createSession(tokenHash: string, userId: string): Promise<void> {
    await this.sql`INSERT INTO sessions (token_hash, user_id) VALUES (${tokenHash}, ${userId})`;
  }

  async sessionUser(tokenHash: string): Promise<UserRow | null> {
    const rows = await this.sql<UserRow[]>`
      SELECT u.id, u.name, u.phrase_hash, u.created_at, u.recovered_at, u.can_open_tables
      FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ${tokenHash}`;
    return rows[0] ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
  }

  async insertRoom(room: { code: string; name: string; hostId: string; createdAt: number; settings: unknown }): Promise<void> {
    await this.sql`
      INSERT INTO rooms (code, name, host_id, created_at, settings)
      VALUES (${room.code}, ${room.name}, ${room.hostId}, ${new Date(room.createdAt)}, ${this.sql.json(room.settings as never)})
      ON CONFLICT (code) DO NOTHING`;
  }

  /**
   * Mark a table as cancelled. The `started_at IS NULL` guard puts the
   * lobby-only rule in the database, so a night that was actually played can
   * never be quietly erased by this path.
   */
  async roomCancelled(code: string, at: number): Promise<void> {
    await this.sql`UPDATE rooms SET cancelled_at = ${new Date(at)} WHERE code = ${code} AND started_at IS NULL`;
  }

  async roomStarted(code: string, startedAt: number): Promise<void> {
    await this.sql`UPDATE rooms SET started_at = ${new Date(startedAt)} WHERE code = ${code}`;
  }

  async roomEnded(code: string, name: string, endedAt: number, report: NightReport): Promise<void> {
    await this.sql`UPDATE rooms SET name = ${name}, ended_at = ${new Date(endedAt)}, report = ${this.sql.json(report as never)} WHERE code = ${code}`;
    for (const p of report.players) {
      await this.sql`
        INSERT INTO room_players (room_code, user_id, name, kind, buy_ins, rebuys, total_in, final_stack, net,
          hands_played, hands_won, showdowns_seen, showdowns_won, vpip_hands, biggest_pot_won)
        VALUES (${code}, ${p.id}, ${p.name}, ${p.kind}, ${p.buyIns}, ${p.rebuys}, ${p.totalIn}, ${p.finalStack}, ${p.net},
          ${p.handsPlayed}, ${p.handsWon}, ${p.showdownsSeen}, ${p.showdownsWon}, ${Math.round((p.vpipPct / 100) * p.handsPlayed)}, ${p.biggestPotWon})
        ON CONFLICT (room_code, user_id) DO UPDATE SET
          name = EXCLUDED.name, buy_ins = EXCLUDED.buy_ins, rebuys = EXCLUDED.rebuys, total_in = EXCLUDED.total_in,
          final_stack = EXCLUDED.final_stack, net = EXCLUDED.net, hands_played = EXCLUDED.hands_played,
          hands_won = EXCLUDED.hands_won, showdowns_seen = EXCLUDED.showdowns_seen, showdowns_won = EXCLUDED.showdowns_won,
          vpip_hands = EXCLUDED.vpip_hands, biggest_pot_won = EXCLUDED.biggest_pot_won`;
    }
  }

  async insertHand(code: string, summary: HandSummary): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      INSERT INTO hands (room_code, number, variant_id, betting, pot, summary)
      VALUES (${code}, ${summary.number}, ${summary.variantId}, ${summary.betting}, ${summary.potTotal}, ${this.sql.json(summary as never)})
      RETURNING id`;
    const handId = rows[0]!.id;
    for (const p of summary.players) {
      await this.sql`
        INSERT INTO hand_players (hand_id, user_id, room_code, vpip, pfr, saw_showdown, won_showdown, won, net)
        VALUES (${handId}, ${p.playerId}, ${code}, ${p.vpip}, ${p.pfr}, ${p.sawShowdown}, ${p.wonShowdown}, ${p.won}, ${p.net})`;
    }
  }

  async roomReport(code: string): Promise<NightReport | null> {
    const rows = await this.sql<{ report: NightReport | null }[]>`SELECT report FROM rooms WHERE code = ${code}`;
    return rows[0]?.report ?? null;
  }

  async lifetimeStats(userId: string): Promise<{
    nights: { code: string; name: string; endedAt: Date; net: number; finalStack: number; totalIn: number; handsPlayed: number }[];
    totals: { nights: number; net: number; handsPlayed: number; handsWon: number; showdownsSeen: number; showdownsWon: number; vpipHands: number; biggestPotWon: number };
  }> {
    const nights = await this.sql<{ code: string; name: string; endedAt: Date; net: number; finalStack: number; totalIn: number; handsPlayed: number }[]>`
      SELECT r.code, r.name, r.ended_at AS "endedAt", rp.net, rp.final_stack AS "finalStack", rp.total_in AS "totalIn", rp.hands_played AS "handsPlayed"
      FROM room_players rp JOIN rooms r ON r.code = rp.room_code
      WHERE rp.user_id = ${userId} AND r.ended_at IS NOT NULL
      ORDER BY r.ended_at DESC LIMIT 100`;
    const totals = await this.sql<{ nights: number; net: number; handsPlayed: number; handsWon: number; showdownsSeen: number; showdownsWon: number; vpipHands: number; biggestPotWon: number }[]>`
      SELECT count(*)::int AS nights, coalesce(sum(net),0)::int AS net, coalesce(sum(hands_played),0)::int AS "handsPlayed",
        coalesce(sum(hands_won),0)::int AS "handsWon", coalesce(sum(showdowns_seen),0)::int AS "showdownsSeen",
        coalesce(sum(showdowns_won),0)::int AS "showdownsWon", coalesce(sum(vpip_hands),0)::int AS "vpipHands",
        coalesce(max(biggest_pot_won),0)::int AS "biggestPotWon"
      FROM room_players rp JOIN rooms r ON r.code = rp.room_code
      WHERE rp.user_id = ${userId} AND r.ended_at IS NOT NULL`;
    return { nights, totals: totals[0]! };
  }

  async close(): Promise<void> {
    await this.sql.end();
  }
}
