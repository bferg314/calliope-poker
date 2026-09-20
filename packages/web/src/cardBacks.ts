export const CARD_BACKS = [
  { id: 'lattice', name: 'Lattice', blurb: 'The original engraved diamond.' },
  { id: 'waves', name: 'Waves', blurb: 'Fine lines rolling across navy.' },
  { id: 'stars', name: 'Night sky', blurb: 'A small constellation in midnight blue.' },
  { id: 'sunburst', name: 'Sunburst', blurb: 'A warm, geometric casino red.' },
] as const;

export type CardBackId = (typeof CARD_BACKS)[number]['id'];

const KEY = 'calliope.cardBack';
const DEFAULT: CardBackId = 'lattice';

export function isCardBackId(id: string | null | undefined): id is CardBackId {
  return !!id && CARD_BACKS.some((back) => back.id === id);
}

export function applyCardBack(id: CardBackId): void {
  document.documentElement.dataset.cardBack = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
}

export function currentCardBack(): CardBackId {
  const id = document.documentElement.dataset.cardBack;
  return isCardBackId(id) ? id : DEFAULT;
}

export function applyStoredCardBack(): void {
  let id: CardBackId = DEFAULT;
  try {
    const stored = localStorage.getItem(KEY);
    if (isCardBackId(stored)) id = stored;
  } catch {
    /* ignore */
  }
  applyCardBack(id);
}
