# Adding a poker variant

Variants live in `packages/engine/src/variants/`. A variant is a plain object; most of the work is describing the streets. The engine handles seating, forced bets, betting rounds, side pots, showdown and stats for you.

## The shape

```ts
import { bestHand } from '../evaluator.js';
import type { VariantDefinition } from './types.js';

export const chicago: VariantDefinition = {
  id: 'chicago',                   // lowercase, digits and dashes; used in room settings and stats
  name: 'Chicago',
  description: 'Seven-card stud, where the high spade in the hole takes half.',
  players: { min: 2, max: 8 },
  forcedBets: 'blinds',            // or 'antes-bringin' for stud-style games
  defaultBetting: 'no-limit',      // 'no-limit' | 'pot-limit' | 'fixed-limit'
  streets: [
    { name: 'preflop', deal: { holeDown: 2 }, bet: true, fixedLimitTier: 'small' },
    { name: 'flop', deal: { community: 3 }, bet: true, fixedLimitTier: 'small' },
    { name: 'turn', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
    { name: 'river', deal: { community: 1 }, bet: true, fixedLimitTier: 'big' },
  ],
  evaluate: (hole, board) => bestHand([...hole, ...board]),
  firstToAct: 'left-of-button',    // or 'best-showing' for stud
};
```

### Streets

Each street says what is dealt and whether betting follows.

| Field | Meaning |
|---|---|
| `deal.holeDown` | face-down cards dealt to every player still in the hand |
| `deal.holeUp` | face-up cards dealt to every player (stud) |
| `deal.community` | shared cards dealt to the board |
| `draw` | players throw cards away at the start of this street, before anything is dealt |
| `bet` | whether a betting round follows |
| `fixedLimitTier` | which fixed-limit bet size (`small` or `big`) applies on this street |

### Throwing cards away

A street with a `draw` stops for it before it deals anything. Each player still in
the hand, starting left of the button, chooses cards to throw; the engine then
deals the rest of the street and opens the betting.

```ts
draw: { min: 1, max: 1, replace: false }   // Pineapple: throw exactly one, get nothing back
draw: { min: 0, max: 5, replace: true }    // Draw poker: throw up to five, get that many back
```

`replace: true` deals a replacement for every card thrown. If the deck runs out,
which a full table of five-card draw will do, the engine shuffles the discards
back in, never handing a player a card they have just thrown away.

Players who run out of time, or who are all in while the hand runs out, have the
choice made for them: draw games stand pat, and Pineapple keeps whichever cards
leave the best hand against the board.

The first street's betting round is where forced bets live. With `blinds`, the small and big blind are posted before the deal and action opens left of the big blind. With `antes-bringin`, everyone antes, the lowest up card brings it in, and action continues clockwise.

If the deck cannot supply everyone on a later street (seven-card stud with eight players) the engine deals one shared card to the board instead. Your `evaluate` function receives it in `board`.

### Evaluation

`evaluate(hole, board)` gets the player's cards (down and up, in deal order) and the board, and must return a `HandRank`. Two helpers cover most games:

- `bestHand(cards)` — best five of any number of cards (Hold'em, stud, Pineapple).
- `bestHandOmaha(hole, board)` — exactly two hole cards and three board cards.

For split-pot or lowball games you would add a new evaluator alongside these in `evaluator.ts`. The engine currently awards each pot to the single best `HandRank` value, so hi/lo needs an engine extension (a second evaluate function and a pot-splitting step in `settle`). That is the one documented gap.

## What ships

| id | game | notes |
|---|---|---|
| `holdem` | Texas Hold'em | 2 down, 5 shared |
| `omaha` | Omaha | 4 down, exactly two of them play |
| `pineapple` | Pineapple | 3 down, throw one away after the flop |
| `stud7` | Seven-card Stud | antes and a bring-in, no board |
| `stud5` | Five-card Stud | 1 down, 4 up |
| `draw5` | Five-card Draw | 5 down, one draw, at most six players |

## Registering

Add the export to `packages/engine/src/variants/index.ts` and include it in `registerBuiltinVariants()`. Anything registered appears in the lobby's game list and can be locked or offered as a dealer's-choice option.

A variant defined outside the engine package can call `registerVariant()` from `@calliope/engine` before the server creates any rooms.

## Testing

Copy `packages/engine/test/stud.test.ts` as a starting point. `riggedDeck([...])` lets you script the exact cards; `tableWith([...names], stack, config)` seats players. Assert who acts first, how many cards each player holds after each street, and who wins a scripted showdown.

## Bots

Bots use hand strength from the public cards plus their own, so they play any variant with `bestHand`-style evaluation without changes. If a variant uses an unusual evaluator, add a matching strength estimate in `packages/bots/src/strength.ts`.
