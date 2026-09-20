import type { NightCash, ReportPlayer } from './protocol.js';
import type { RoomSettings } from './settings.js';

/**
 * Work out what the chips in front of everybody are worth in real money and
 * stamp each player's `cashIn`, `cashOut` and `cashNet` with it.
 *
 * Money is counted in minor units, because a chip is rarely worth a whole
 * cent and rounding each stack on its own would leave the bank a few cents
 * short or over. Payouts are floored and the leftover cents go to the largest
 * fractions, which is what a banker does when handing back the odd coin: the
 * column adds up to the last cent.
 *
 * Cash in is counted per buy-in rather than per chip. What a player handed
 * over is a number of buy-ins at the price on the door, whatever the chips
 * were doing by the end.
 *
 * Returns null when the host left the buy-in's value at zero, which is the
 * honest answer for a night played for nothing.
 */
export function priceNight(players: ReportPlayer[], chips: RoomSettings['chips']): NightCash | null {
  const buyIn = Math.round(chips.buyInValue * 100);
  if (buyIn <= 0 || chips.buyInChips <= 0) return null;
  const perChip = buyIn / chips.buyInChips;

  const exact = players.map((p) => p.finalStack * perChip);
  const out = exact.map((cents) => Math.floor(cents));
  const paidOut = Math.round(exact.reduce((a, c) => a + c, 0));
  // Never negative: the sum of the floors is at most the sum it was rounded from.
  let spare = paidOut - out.reduce((a, c) => a + c, 0);
  const byFraction = exact
    .map((cents, i) => ({ i, frac: cents - out[i]! }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of byFraction) {
    if (spare <= 0) break;
    out[i]!++;
    spare--;
  }

  let paidIn = 0;
  players.forEach((p, i) => {
    p.cashIn = (p.buyIns + p.rebuys) * buyIn;
    p.cashOut = out[i]!;
    p.cashNet = p.cashOut - p.cashIn;
    paidIn += p.cashIn;
  });
  return { currency: chips.currency, buyIn, chipsPerBuyIn: chips.buyInChips, paidIn, paidOut };
}
