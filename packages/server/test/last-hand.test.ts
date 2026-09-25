import { describe, expect, it } from 'vitest';
import type { HandSummary, HandSummaryPlayer } from '@calliope/engine';
import { RoomManager, type ManagerDeps } from '../src/manager.js';

const deps: ManagerDeps = {
  persist: async () => undefined,
  forget: async () => undefined,
  onRoomCancelled: async () => undefined,
  onRoomCreated: async () => undefined,
  onRoomStarted: async () => undefined,
  onHandSettled: async () => undefined,
  onNightEnded: async () => undefined,
  publicUrl: 'http://test',
  log: () => undefined,
};

const player = (seat: number, playerId: string, holeDown: string[], shown: boolean): HandSummaryPlayer => ({
  seat, playerId, name: playerId, kind: 'human', holeDown, holeUp: [], folded: !shown, vpip: false, pfr: false,
  sawShowdown: shown, wonShowdown: false, won: 0, net: 0, startStack: 1000, endStack: 1000, handLabel: null,
});

describe('the last hand, as each viewer is sent it', () => {
  it('keeps folded cards face down for everyone but their owner', async () => {
    const manager = new RoomManager(deps);
    const record = await manager.create({ id: 'host', name: 'Host' }, {});
    const rt = manager.get(record.code)!;
    const hand: HandSummary = {
      number: 1, variantId: 'holdem', betting: 'no-limit',
      stakes: { blinds: { small: 5, big: 10 }, ante: 0, bringIn: 5, fixedLimit: { small: 10, big: 20 } },
      board: ['2c', '7d', '9h', 'Js', 'Kd'], potTotal: 20, showdown: true, button: 0,
      players: [player(0, 'host', ['As', 'Ad'], false), player(1, 'bob', ['Qh', 'Qs'], true), player(2, 'cid', ['4c', '5c'], true)],
      winners: [], log: [],
    };
    rt.record.lastHand = hand;

    const toHost = manager.view(rt, 'host').lastHand!;
    expect(toHost.players[0]!.holeDown).toEqual(['As', 'Ad']);
    const toBob = manager.view(rt, 'bob').lastHand!;
    expect(toBob.players[0]!.holeDown).toEqual([null, null]);
    expect(toBob.players[2]!.holeDown).toEqual(['4c', '5c']);
    expect(JSON.stringify(manager.view(rt, null))).not.toContain('"As"');
  });
});
