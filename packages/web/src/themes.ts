export const THEMES = [
  { id: 'felt', name: 'Felt', blurb: 'Baize green on a walnut rim. The classic card room.', themeColor: '#13241d', dark: true },
  { id: 'paper-ink', name: 'Paper & ink', blurb: 'Cream stock and a sage table, in red and blue ink.', themeColor: '#f4efe3', dark: false },
  { id: 'midnight', name: 'Midnight', blurb: 'Navy felt and brass, for playing late.', themeColor: '#0e1424', dark: true },
  { id: 'noir', name: 'Noir', blurb: 'Black and silver, framed in one hot red.', themeColor: '#0a0a0a', dark: true },
  { id: 'oxblood', name: 'Oxblood', blurb: 'Oxblood leather on a gold rim.', themeColor: '#1c0e11', dark: true },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const KEY = 'calliope.theme';
const DEFAULT: ThemeId = 'felt';

export function isThemeId(id: string | null | undefined): id is ThemeId {
  return !!id && THEMES.some((t) => t.id === id);
}

export function applyTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* private mode */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const theme = THEMES.find((t) => t.id === id);
  if (meta && theme) meta.setAttribute('content', theme.themeColor);
}

export function currentTheme(): ThemeId {
  const id = document.documentElement.dataset.theme;
  return isThemeId(id) ? id : DEFAULT;
}

export function applyStoredTheme(): void {
  let id: ThemeId = DEFAULT;
  try {
    const stored = localStorage.getItem(KEY);
    if (isThemeId(stored)) id = stored;
  } catch {
    /* ignore */
  }
  applyTheme(id);
}
