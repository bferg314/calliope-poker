/**
 * How each game is played, in a few lines: for the player who has been dealt
 * into something new at dealer's choice. Written to match the engine's rules
 * (packages/engine/src/variants), not poker in general.
 */

export type Ranking = 'five' | 'three' | 'high-card';

export interface Guide {
  /** One line on what the game is. */
  summary: string;
  /** A hand from the first card to the showdown. */
  steps: string[];
  /** Which ranking decides the hand. */
  ranking: Ranking;
  /** What catches people out. */
  notes: string[];
}

const BLINDS = 'The two players left of the dealer post the small and big blinds.';

export const GUIDES: Record<string, Guide> = {
  holdem: {
    summary: 'Two cards of your own and five shared on the table.',
    steps: [
      BLINDS,
      'Everyone gets two cards face down. A round of betting.',
      'The flop: three shared cards face up. A round of betting.',
      'The turn: a fourth shared card. A round of betting.',
      'The river: a fifth. A last round of betting, then the showdown.',
    ],
    ranking: 'five',
    notes: ['Your hand is the best five of your two cards and the five shared, in any mix: you may even play the board alone.'],
  },
  omaha: {
    summary: "Like hold'em, but with four cards of your own, and exactly two of them play.",
    steps: [
      BLINDS,
      'Everyone gets four cards face down. A round of betting.',
      "Then the flop, the turn and the river, as in hold'em, each followed by a round of betting.",
    ],
    ranking: 'five',
    notes: [
      'Your hand is exactly two of your four cards with exactly three from the table. Never one, never three.',
      'Four hearts on the table is no flush for you unless two of your own cards are hearts.',
    ],
  },
  pineapple: {
    summary: "Hold'em dealt three cards, one of which you throw away after the flop.",
    steps: [
      BLINDS,
      'Everyone gets three cards face down. A round of betting.',
      'The flop, and a round of betting.',
      'Everyone throws one of their three cards away.',
      "From there it is hold'em: the turn and the river, each with a round of betting.",
    ],
    ranking: 'five',
    notes: ['Keep the two that go best with the flop: the throw comes before the turn, so you choose with three shared cards showing.'],
  },
  stud7: {
    summary: 'Seven cards each, some face up, and no shared cards at all.',
    steps: [
      'Everyone antes.',
      'Third street: two cards face down and one face up. The lowest card showing must bring it in (a small forced bet), then a round of betting.',
      'Fourth, fifth and sixth streets: one more face up each, each with a round of betting.',
      'Seventh street: a last card face down, a last round of betting, then the showdown.',
    ],
    ranking: 'five',
    notes: [
      'From fourth street on, whoever shows the best hand acts first.',
      'Your hand is the best five of your seven. Your face-down cards are marked "hidden" on your side: nobody else can see them.',
      'Bets are small on third and fourth streets and double from fifth.',
    ],
  },
  stud5: {
    summary: 'Five cards each, one face down and four up. The old one from the westerns.',
    steps: [
      'Everyone antes.',
      'One card face down and one face up. The lowest card showing brings it in, then a round of betting.',
      'Three more cards face up, one at a time, each with a round of betting.',
      'The showdown.',
    ],
    ranking: 'five',
    notes: ['Everyone can see four of your five cards, so your one hidden card is the whole story.', 'From the second round on, whoever shows the best hand acts first.'],
  },
  draw5: {
    summary: 'Five cards each, all face down, and one chance to swap.',
    steps: [
      BLINDS,
      'Everyone gets five cards face down. A round of betting.',
      'The draw: throw away as many as you like, from none to all five, and you are dealt that many back.',
      'A last round of betting, then the showdown.',
    ],
    ranking: 'five',
    notes: ['How many cards a player drew is shown at their seat, and it says a lot: standing pat usually means a made hand.', 'At most six players, so the deck lasts.'],
  },
  three: {
    summary: 'Three cards each and a single round of betting.',
    steps: [BLINDS, 'Everyone gets three cards face down.', 'One round of betting, then the showdown.'],
    ranking: 'three',
    notes: ['With three cards a straight is harder to make than a flush, so a straight beats a flush here, and three of a kind beats both.'],
  },
  draw3: {
    summary: 'Three cards each, and one chance to swap.',
    steps: [
      BLINDS,
      'Everyone gets three cards face down. A round of betting.',
      'The draw: throw away as many as you like, from none to all three, and you are dealt that many back.',
      'A last round of betting, then the showdown.',
    ],
    ranking: 'three',
    notes: ['Three-card ranks: a straight beats a flush, and three of a kind beats both.'],
  },
  bluff: {
    summary: "One card each, held to your forehead: everyone can see it but you. Also called Indian poker.",
    steps: [BLINDS, 'Everyone gets one card, face up to everyone else and face down to you.', 'One round of betting, then everyone sees their own card.'],
    ranking: 'high-card',
    notes: [
      "Bet on what everyone else's cards say about yours: a table of low cards means yours is probably best.",
      'The highest card wins. Aces are high, suits do not count, and equal cards split the pot.',
    ],
  },
};

/** The hands in order, best first, each with a hand to show it. */
export const FIVE_CARD_RANKS: { name: string; example: string[]; wildOnly?: boolean }[] = [
  { name: 'Five of a kind', example: ['As', 'Ah', 'Ad', 'Ac', '*1'], wildOnly: true },
  { name: 'Royal flush', example: ['As', 'Ks', 'Qs', 'Js', 'Ts'] },
  { name: 'Straight flush', example: ['9h', '8h', '7h', '6h', '5h'] },
  { name: 'Four of a kind', example: ['Qc', 'Qd', 'Qh', 'Qs', '7c'] },
  { name: 'Full house', example: ['Kh', 'Kd', 'Ks', '4c', '4h'] },
  { name: 'Flush', example: ['Ad', 'Jd', '8d', '6d', '2d'] },
  { name: 'Straight', example: ['Tc', '9d', '8h', '7s', '6c'] },
  { name: 'Three of a kind', example: ['7c', '7d', '7h', 'Ks', '2c'] },
  { name: 'Two pair', example: ['Jh', 'Jc', '4d', '4s', 'Ac'] },
  { name: 'Pair', example: ['Th', 'Tc', 'Ks', '8d', '3h'] },
  { name: 'High card', example: ['Ah', 'Jd', '9c', '6s', '3h'] },
];

export const THREE_CARD_RANKS: { name: string; example: string[] }[] = [
  { name: 'Straight flush', example: ['Qh', 'Jh', 'Th'] },
  { name: 'Three of a kind', example: ['8c', '8d', '8s'] },
  { name: 'Straight', example: ['5c', '4d', '3h'] },
  { name: 'Flush', example: ['Kd', '9d', '4d'] },
  { name: 'Pair', example: ['Js', 'Jh', '6c'] },
  { name: 'High card', example: ['Ac', 'Td', '4s'] },
];
