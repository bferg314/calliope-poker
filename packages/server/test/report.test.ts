import { describe, expect, it } from 'vitest';
import { reduce, seededDeck } from '@calliope/engine';
import { buildReport, emptyLedger, newRoom, randomRoomCode } from '../src/room.js';
import { hashSecret, verifySecret } from '../src/auth.js';

describe('room', () => {
  it('makes six-character codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 50; i++) expect(randomRoomCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('builds a report whose nets sum to zero', () => {
    const r = newRoom({ code: 'ABCDEF', host: { id: 'h', name: 'Host' }, now: 1 });
    r.members.b = { id: 'b', name: 'Bembo', kind: 'bot', joinedAt: 1 };
    r.ledger.h = { ...emptyLedger(), buyIns: 1, totalIn: 1000 };
    r.ledger.b = { ...emptyLedger(), buyIns: 1, totalIn: 1000 };
    let t = reduce(r.table, { type: 'sit', seat: 0, player: { id: 'h', name: 'Host', kind: 'human' }, stack: 1000 }).state;
    t = reduce(t, { type: 'sit', seat: 1, player: { id: 'b', name: 'Bembo', kind: 'bot' }, stack: 1000 }).state;
    t = reduce(t, { type: 'start-hand', deck: seededDeck(1) }).state;
    const actor = t.hand!.round.actor!;
    const res = reduce(t, { type: 'action', seat: actor, action: { type: 'fold' } });
    r.table = res.state;
    const settled = res.effects.find((e) => e.type === 'hand-settled');
    if (settled && settled.type === 'hand-settled') r.hands.push(settled.summary);
    const report = buildReport(r, 2);
    expect(report.handsPlayed).toBe(1);
    expect(report.players.reduce((a, p) => a + p.net, 0)).toBe(0);
    expect(report.players[0]!.net).toBeGreaterThan(0);
  });
});

describe('secrets', () => {
  it('verifies scrypt hashes', () => {
    const h = hashSecret('olive lion enter pagan aroma');
    expect(verifySecret('olive lion enter pagan aroma', h)).toBe(true);
    expect(verifySecret('olive lion enter pagan arena', h)).toBe(false);
  });
});
