import { describe, expect, it } from 'vitest';
import { EngineError, legalActions, seededDeck, viewFor } from '../src/index.js';
import { riggedDeck, tableWith } from './helpers.js';

// Three players in seats 0, 1, 2 with 1000 each; blinds 5/10.
// A rigged deck whose top card is a deuce makes seat 0 the first button
// (rank 2 % 3 = 2 → eligible[2] = seat 2). Use rank 3 for seat 0 (3 % 3 = 0).
// Deal order goes left of the button: with button 0, seat 1 gets card 1, seat 2 card 2, seat 0 card 3.

describe("hold'em, no limit", () => {
  it('posts blinds, deals two cards each, and opens action left of the big blind', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    const deck = riggedDeck(['3c', '4d', '5h', '6s', '7c', '8d']);
    t.apply({ type: 'start-hand', deck });
    const h = t.state.hand!;
    expect(h.button).toBe(0);
    expect(h.variantId).toBe('holdem');
    expect(h.betting).toBe('no-limit');
    expect(h.players[1]!.streetBet).toBe(5);
    expect(h.players[2]!.streetBet).toBe(10);
    expect(t.stack(1)).toBe(995);
    expect(t.stack(2)).toBe(990);
    expect(h.players[1]!.holeDown).toEqual(['3c', '6s']);
    expect(h.players[2]!.holeDown).toEqual(['4d', '7c']);
    expect(h.players[0]!.holeDown).toEqual(['5h', '8d']);
    expect(t.actor()).toBe(0);
    expect(t.effects.at(-1)).toEqual({ type: 'await-action', seat: 0 });

    const legal = legalActions(t.state, 0)!;
    expect(legal.canCheck).toBe(false);
    expect(legal.toCall).toBe(10);
    expect(legal.raise).toEqual({ kind: 'raise', min: 20, max: 1000, fixed: false });
  });

  it('gives the big blind the option and moves to the flop after a check', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    t.act(0, { type: 'call' });
    t.act(1, { type: 'call' });
    expect(t.actor()).toBe(2);
    expect(legalActions(t.state, 2)!.canCheck).toBe(true);
    t.act(2, { type: 'check' });
    const h = t.state.hand!;
    expect(h.streetIndex).toBe(1);
    expect(h.board).toHaveLength(3);
    expect(h.players.every((p) => !p || p.streetBet === 0)).toBe(true);
    expect(h.players[0]!.committed).toBe(10);
    // Postflop the small blind (left of button) acts first.
    expect(t.actor()).toBe(1);
  });

  it('enforces minimum raises and reopens action after a full raise', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    expect(() => t.act(0, { type: 'raise', to: 15 })).toThrow(EngineError);
    t.act(0, { type: 'raise', to: 30 }); // raise of 20
    expect(legalActions(t.state, 1)!.raise!.min).toBe(50);
    t.act(1, { type: 'raise', to: 50 }); // raise of 20 → min next 70
    expect(legalActions(t.state, 2)!.raise!.min).toBe(70);
    t.act(2, { type: 'fold' });
    // Ann already acted but Bob's raise was full, so she may raise again.
    expect(t.actor()).toBe(0);
    expect(legalActions(t.state, 0)!.raise).not.toBeNull();
    t.act(0, { type: 'call' });
    expect(t.state.hand!.streetIndex).toBe(1);
  });

  it('does not reopen action for a short all-in raise', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000);
    // Give Cid a short stack by standing and re-sitting.
    t.apply({ type: 'stand', seat: 2 });
    t.apply({ type: 'sit', seat: 2, player: { id: 'p2', name: 'Cid', kind: 'human' }, stack: 45 });
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    // Ann raises to 30 (full). Bob calls. Cid (BB, 35 left) goes all in for 45 total: a raise of 15 < 20.
    t.act(0, { type: 'raise', to: 30 });
    t.act(1, { type: 'call' });
    const cid = legalActions(t.state, 2)!;
    expect(cid.raise).toEqual({ kind: 'raise', min: 45, max: 45, fixed: false });
    t.act(2, { type: 'raise', to: 45 });
    // Ann faces 15 more but may only call or fold.
    expect(t.actor()).toBe(0);
    const ann = legalActions(t.state, 0)!;
    expect(ann.toCall).toBe(15);
    expect(ann.raise).toBeNull();
    t.act(0, { type: 'call' });
    expect(legalActions(t.state, 1)!.raise).toBeNull();
    t.act(1, { type: 'call' });
    expect(t.state.hand!.streetIndex).toBe(1);
    // Cid is all in; Ann and Bob still bet against each other.
    expect(t.state.hand!.players[2]!.allIn).toBe(true);
    expect(t.actor()).toBe(1);
  });

  it('awards the pot without a showdown when everyone else folds', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    t.act(0, { type: 'raise', to: 30 });
    t.act(1, { type: 'fold' });
    t.act(2, { type: 'fold' });
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.showdown).toBe(false);
    expect(h.results!.winners).toEqual([0]);
    // Ann gets back her uncalled 20 and wins the 25 in blinds.
    expect(t.stack(0)).toBe(1015);
    expect(t.stack(1)).toBe(995);
    expect(t.stack(2)).toBe(990);
    expect(h.players[0]!.revealed).toBe(false);
    const settled = t.effects.find((e) => e.type === 'hand-settled');
    expect(settled && settled.type === 'hand-settled' && settled.summary.winners[0]!.amount).toBe(25);
  });

  it('runs out the board and shows down when players are all in', () => {
    const t = tableWith(['Ann', 'Bob'], 500);
    // Heads up: button (seat 0 via rank 4 % 2 = 0) is the small blind and acts first preflop.
    // Deal order: seat 1 first. Bob: Ah Ad; Ann: Kh Kd; board 2c 7d 9s 3h 5c.
    const deck = riggedDeck(['4c', 'Ah', 'Kh', 'Ad', 'Kd', '2c', '7d', '9s', '3h', '5c']);
    // Top card 4c is dealt to Bob as his first card, so adjust: Bob gets 4c and Ad, Ann gets Ah and Kd.
    t.apply({ type: 'start-hand', deck });
    const h0 = t.state.hand!;
    expect(h0.button).toBe(0);
    expect(t.actor()).toBe(0);
    t.act(0, { type: 'raise', to: 500 });
    t.act(1, { type: 'call' });
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.showdown).toBe(true);
    expect(h.board).toHaveLength(5);
    expect(h.players[0]!.revealed && h.players[1]!.revealed).toBe(true);
    expect(t.stack(0) + t.stack(1)).toBe(1000);
    const winner = h.results!.winners[0]!;
    expect(t.stack(winner)).toBe(1000);
  });

  it('splits side pots correctly with three stacks', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid'], 1000);
    t.apply({ type: 'stand', seat: 1 });
    t.apply({ type: 'sit', seat: 1, player: { id: 'p1', name: 'Bob', kind: 'human' }, stack: 100 });
    t.apply({ type: 'stand', seat: 2 });
    t.apply({ type: 'sit', seat: 2, player: { id: 'p2', name: 'Cid', kind: 'human' }, stack: 300 });
    // Button seat 0 (rank 3). Deal: Bob, Cid, Ann. Bob: As Ad (best), Cid: Ks Kd, Ann: 2s 3d. Board: 7c 8c 9h Jd Qc.
    const deck = riggedDeck(['3c', 'As', 'Ks', '2s', 'Ad', 'Kd', '3d', '7c', '8c', '9h', 'Jd', 'Qc']);
    // Note the rigged 3c is Bob's first card, so Bob: 3c Ad, Cid: As Kd, Ann: Ks 3d. Cid has the best hand (pair of aces).
    t.apply({ type: 'start-hand', deck });
    t.act(0, { type: 'raise', to: 300 });
    t.act(1, { type: 'call' }); // all in for 100
    t.act(2, { type: 'call' }); // all in for 300
    const h = t.state.hand!;
    expect(h.stage).toBe('settled');
    expect(h.results!.pots).toHaveLength(2);
    expect(h.results!.pots[0]!.amount).toBe(300);
    expect(h.results!.pots[1]!.amount).toBe(400);
    expect(h.results!.pots[0]!.winners).toEqual([2]);
    expect(h.results!.pots[1]!.winners).toEqual([2]);
    expect(t.stack(2)).toBe(700);
    expect(t.stack(1)).toBe(0);
    expect(t.stack(0)).toBe(700);
  });

  it('hides other players cards and the deck in views', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    t.apply({ type: 'start-hand', deck: seededDeck(1) });
    const v = viewFor(t.state, 'p1');
    expect(v.viewerSeat).toBe(1);
    expect(v.hand!.players[1]!.holeDown.every((c) => c !== null)).toBe(true);
    expect(v.hand!.players[0]!.holeDown).toEqual([null, null]);
    expect('deck' in v.hand!).toBe(false);
    expect(v.hand!.deckRemaining).toBe(46);
    const spectator = viewFor(t.state, null);
    expect(spectator.viewerSeat).toBeNull();
    expect(spectator.hand!.players[1]!.holeDown).toEqual([null, null]);
  });

  it('folds or checks on timeout and moves the button each hand', () => {
    const t = tableWith(['Ann', 'Bob', 'Cid']);
    t.apply({ type: 'start-hand', deck: riggedDeck(['3c']) });
    t.apply({ type: 'timeout', seat: 0 });
    expect(t.state.hand!.players[0]!.folded).toBe(true);
    t.act(1, { type: 'call' });
    t.apply({ type: 'timeout', seat: 2 }); // can check
    expect(t.state.hand!.players[2]!.folded).toBe(false);
    expect(t.state.hand!.streetIndex).toBe(1);
    t.act(1, { type: 'fold' });
    expect(t.state.hand!.stage).toBe('settled');
    t.apply({ type: 'finish-hand' });
    expect(t.state.hand).toBeNull();
    t.apply({ type: 'start-hand', deck: seededDeck(3) });
    expect(t.state.hand!.button).toBe(1);
  });

  it('is deterministic: same deck and events give the same state', () => {
    const script = ['raise', 'call', 'call', 'check', 'bet', 'call', 'fold', 'check', 'check', 'bet', 'call'] as const;
    const play = () => {
      const t = tableWith(['Ann', 'Bob', 'Cid']);
      t.apply({ type: 'start-hand', deck: seededDeck(42) });
      for (const kind of script) {
        if (t.state.hand!.stage !== 'betting') break;
        const seat = t.actor()!;
        const legal = legalActions(t.state, seat)!;
        if (kind === 'raise' || kind === 'bet') {
          if (legal.raise) t.act(seat, { type: legal.raise.kind, to: Math.min(legal.raise.min * 2, legal.raise.max) });
          else t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
        } else if (kind === 'check') {
          t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
        } else if (kind === 'call') {
          t.act(seat, legal.canCheck ? { type: 'check' } : { type: 'call' });
        } else {
          t.act(seat, { type: 'fold' });
        }
      }
      return t.state;
    };
    expect(play()).toEqual(play());
    expect(play().hand!.log.length).toBeGreaterThan(8);
  });
});
