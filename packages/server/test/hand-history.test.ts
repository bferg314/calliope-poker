import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { HandSummary, HandSummaryPlayer } from '@calliope/engine';
import type { HandDetail, HandListItem } from '@calliope/shared';
import { registerHttp, type Services } from '../src/http.js';

const player = (seat: number, playerId: string, holeDown: string[], shown: boolean, won = 0): HandSummaryPlayer => ({
  seat, playerId, name: playerId, kind: 'human', holeDown, holeUp: [], folded: !shown, vpip: false, pfr: false,
  sawShowdown: shown, wonShowdown: won > 0, won, net: won, startStack: 1000, endStack: 1000 + won, handLabel: shown ? 'Pair of queens' : null,
});

const hand = (number: number): HandSummary => ({
  number, variantId: 'holdem', betting: 'no-limit',
  stakes: { blinds: { small: 5, big: 10 }, ante: 0, bringIn: 5, fixedLimit: { small: 10, big: 20 } },
  board: ['2c', '7d', '9h', 'Js', 'Kd'], potTotal: 40, showdown: true, button: 0,
  players: [player(0, 'ann', ['As', 'Ad'], false), player(1, 'bob', ['Qh', 'Qs'], true, 40), player(2, 'cid', ['4c', '5c'], true)],
  winners: [{ seat: 1, playerId: 'bob', amount: 40, handLabel: 'Pair of queens' }],
  wild: { kind: 'deuces' },
  log: [],
});

/** The HTTP routes over a filed-away table: nothing live, two hands in the database. */
async function app(viewer: string | null) {
  const services = {
    auth: {
      userFrom: async () => (viewer ? { id: viewer } : null),
      publicUser: (row: { id: string }) => ({ id: row.id, name: row.id, recovered: false, createdAt: 0, serverRole: null }),
    },
    db: { roomHands: async (code: string) => (code === 'ABC234' ? [hand(1), hand(2)] : []) },
    manager: { get: () => undefined, rooms: new Map() },
    policy: {},
    sweep: async () => undefined,
  } as unknown as Services;
  const a = Fastify();
  registerHttp(a, services);
  await a.ready();
  return a;
}

describe('a night\'s hand history', () => {
  it('lists every hand with its game, pot and winners', async () => {
    const res = await (await app(null)).inject({ method: 'GET', url: '/api/rooms/ABC234/hands' });
    const list = res.json() as HandListItem[];
    expect(list.map((h) => h.number)).toEqual([1, 2]);
    expect(list[0]).toMatchObject({ variantName: "Texas Hold'em", potTotal: 40, wild: 'deuces wild', winners: [{ name: 'bob', amount: 40 }] });
    // The list names hands, it does not show them.
    expect(res.body).not.toContain('"As"');
  });

  it('opens one hand as the asker may see it', async () => {
    const toAnn = (await (await app('ann')).inject({ method: 'GET', url: '/api/rooms/ABC234/hands/2' })).json() as HandDetail;
    expect(toAnn.hand.players[0]!.holeDown).toEqual(['As', 'Ad']);
    const toBob = await (await app('bob')).inject({ method: 'GET', url: '/api/rooms/ABC234/hands/2' });
    expect((toBob.json() as HandDetail).hand.players[0]!.holeDown).toEqual([null, null]);
    expect(toBob.body).not.toContain('"As"');
    expect((toBob.json() as HandDetail).hand.players[1]!.holeDown).toEqual(['Qh', 'Qs']);
  });

  it('says so when there is no such hand', async () => {
    const res = await (await app(null)).inject({ method: 'GET', url: '/api/rooms/ABC234/hands/9' });
    expect(res.statusCode).toBe(404);
  });
});
