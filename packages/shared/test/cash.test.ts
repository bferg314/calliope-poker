import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM_SETTINGS, priceNight, type ReportPlayer } from '../src/index.js';

const chips = DEFAULT_ROOM_SETTINGS.chips; // $20 for 1,000 chips

function player(buyIns: number, rebuys: number, finalStack: number, perBuyIn = chips.buyInChips): ReportPlayer {
  const totalIn = (buyIns + rebuys) * perBuyIn;
  return {
    id: `p${finalStack}`,
    name: 'Player',
    kind: 'human',
    buyIns,
    rebuys,
    totalIn,
    finalStack,
    net: finalStack - totalIn,
    handsPlayed: 0,
    handsWon: 0,
    showdownsSeen: 0,
    showdownsWon: 0,
    vpipPct: 0,
    biggestPotWon: 0,
    cashIn: 0,
    cashOut: 0,
    cashNet: 0,
  };
}

describe('priceNight', () => {
  it('pays a stack back at the rate the buy-in was sold at', () => {
    const players = [player(1, 0, 1500), player(1, 0, 500)];
    const cash = priceNight(players, chips);
    expect(cash).toEqual({ currency: '$', buyIn: 2000, chipsPerBuyIn: 1000, paidIn: 4000, paidOut: 4000 });
    expect(players.map((p) => p.cashOut)).toEqual([3000, 1000]);
    expect(players.map((p) => p.cashNet)).toEqual([1000, -1000]);
  });

  it('charges every re-buy at the price on the door', () => {
    const [p] = [player(1, 3, 250)];
    priceNight([p!], chips);
    expect(p!.cashIn).toBe(8000);
    expect(p!.cashOut).toBe(500);
    expect(p!.cashNet).toBe(-7500);
  });

  it('hands out every cent, even when the chips do not divide', () => {
    // Three players, 3,001 chips between them: the rate leaves fractions of a cent.
    const players = [player(1, 0, 1001), player(1, 0, 1000), player(1, 0, 1000)];
    const cash = priceNight(players, chips)!;
    expect(players.reduce((a, p) => a + p.cashOut, 0)).toBe(cash.paidOut);
    expect(players.map((p) => p.cashOut)).toEqual([2002, 2000, 2000]);
  });

  it('pays back exactly what the bank took, at any odd rate', () => {
    // Chips are conserved, so whatever the rate, the payouts have to add up to
    // the cash on the door to the last cent.
    const odd = { ...chips, buyInValue: 12.37, buyInChips: 777 };
    for (let seed = 1; seed <= 200; seed++) {
      const stacks = [(seed * 13) % 777, (seed * 101) % 777, (seed * 7) % 777];
      stacks.push(4 * 777 - stacks.reduce((a, n) => a + n, 0));
      const players = stacks.map((n) => player(1, 0, n, odd.buyInChips));
      const cash = priceNight(players, odd)!;
      expect(players.reduce((a, p) => a + p.cashOut, 0)).toBe(cash.paidOut);
      expect(cash.paidOut).toBe(cash.paidIn);
      expect(players.every((p) => Number.isInteger(p.cashOut) && p.cashOut >= 0)).toBe(true);
    }
  });

  it('says nothing about money when the buy-in was never priced', () => {
    const players = [player(1, 0, 1000)];
    expect(priceNight(players, { ...chips, buyInValue: 0 })).toBeNull();
    expect(players[0]!.cashOut).toBe(0);
  });
});
