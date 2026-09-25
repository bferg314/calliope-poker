import type { Card } from './cards.js';
import type { HandStakes, HandSummary, HandSummaryPlayer, TableState } from './types.js';

/** Facts about a settled hand, for hand history and statistics. */
export function summarizeHand(s: TableState): HandSummary {
  const h = s.hand;
  if (!h || !h.results) throw new Error('summarizeHand needs a settled hand');
  const r = h.results;
  const won: Record<number, number> = {};
  for (const pot of r.pots) {
    for (const [seat, amt] of Object.entries(pot.payouts)) won[Number(seat)] = (won[Number(seat)] ?? 0) + amt;
  }
  const players: HandSummaryPlayer[] = [];
  for (const p of h.players) {
    if (!p) continue;
    const st = s.seats[p.seat];
    const stillSeated = !!st && st.playerId === p.playerId;
    const sawShowdown = r.showdown && !p.folded;
    players.push({
      seat: p.seat,
      playerId: p.playerId,
      name: p.name,
      kind: p.kind,
      holeDown: [...p.holeDown],
      holeUp: [...p.holeUp],
      folded: p.folded,
      vpip: p.vpip,
      pfr: p.pfr,
      sawShowdown,
      wonShowdown: sawShowdown && r.winners.includes(p.seat),
      won: won[p.seat] ?? 0,
      net: r.net[p.seat] ?? 0,
      startStack: p.startStack,
      endStack: stillSeated ? st.stack : 0,
      handLabel: r.hands[p.seat]?.label ?? null,
    });
  }
  const stakes: HandStakes = {
    blinds: { ...s.config.blinds },
    ante: s.config.ante,
    bringIn: s.config.bringIn,
    fixedLimit: { ...s.config.fixedLimit },
  };
  return {
    number: h.number,
    variantId: h.variantId,
    betting: h.betting,
    stakes,
    board: [...h.board],
    potTotal: r.pots.reduce((a, p) => a + p.amount, 0),
    showdown: r.showdown,
    button: h.button,
    players,
    winners: r.winners.map((seat) => {
      const p = players.find((x) => x.seat === seat)!;
      return { seat, playerId: p.playerId, amount: p.won, handLabel: p.handLabel };
    }),
    pots: r.pots.map((p) => ({ amount: p.amount, eligible: [...p.eligible], winners: [...p.winners], payouts: { ...p.payouts } })),
    ...(h.wild && h.wild.kind !== 'none' ? { wild: h.wild } : {}),
    log: [...h.log],
  };
}

/** A settled hand as one viewer may see it: face-down cards that were never shown are null. */
export interface HandSummaryPlayerView extends Omit<HandSummaryPlayer, 'holeDown'> {
  holeDown: (Card | null)[];
}

export interface HandSummaryView extends Omit<HandSummary, 'players'> {
  players: HandSummaryPlayerView[];
}

/**
 * Redact a settled hand for one viewer, for reviewing it afterwards. Down cards
 * are shown only for players who reached the showdown, where they were turned
 * over, and to their owner. A folded hand stays in the muck: nobody at a real
 * table gets to turn it over once the hand is done. Up cards were seen by all.
 */
export function summaryFor(summary: HandSummary, viewerPlayerId: string | null): HandSummaryView {
  return {
    ...summary,
    players: summary.players.map((p) => ({
      ...p,
      holeDown: p.sawShowdown || p.playerId === viewerPlayerId ? [...p.holeDown] : p.holeDown.map(() => null),
    })),
  };
}
