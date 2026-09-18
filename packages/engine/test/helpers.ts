import {
  createTable, fullDeck, reduce, type Action, type Card, type SeatIndex, type TableConfig, type TableEffect,
  type TableEvent, type TableState,
} from '../src/index.js';

export interface Sim {
  state: TableState;
  effects: TableEffect[];
  apply(event: TableEvent): Sim;
  act(seat: SeatIndex, action: Action): Sim;
  actor(): SeatIndex | null;
  stack(seat: SeatIndex): number;
}

export function sim(state: TableState): Sim {
  const s: Sim = {
    state,
    effects: [],
    apply(event) {
      const r = reduce(s.state, event);
      s.state = r.state;
      s.effects = r.effects;
      return s;
    },
    act(seat, action) {
      return s.apply({ type: 'action', seat, action });
    },
    actor() {
      return s.state.hand?.round.actor ?? null;
    },
    stack(seat) {
      return s.state.seats[seat]!.stack;
    },
  };
  return s;
}

/** A table with `names.length` players seated in order from seat 0, each with `stack`. */
export function tableWith(names: string[], stack = 1000, config: Partial<TableConfig> = {}): Sim {
  let s = sim(createTable(config));
  names.forEach((name, i) => {
    s = s.apply({ type: 'sit', seat: i, player: { id: `p${i}`, name, kind: 'human' }, stack });
  });
  return s;
}

/**
 * Build a full deck that begins with the given cards (in deal order) and is
 * followed by the rest of the deck in fixed order. Lets tests script exact hands.
 */
export function riggedDeck(top: Card[]): Card[] {
  const rest = fullDeck().filter((c) => !top.includes(c));
  return [...top, ...rest];
}
