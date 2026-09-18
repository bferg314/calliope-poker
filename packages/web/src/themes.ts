export const THEMES = [
  { id: 'felt', name: 'Felt', blurb: 'Deep green table. The classic look.', themeColor: '#1e3a2f', dark: true },
  { id: 'paper-ink', name: 'Paper & ink', blurb: 'Cream stock, black and red ink.', themeColor: '#f4efe3', dark: false },
  { id: 'midnight', name: 'Midnight', blurb: 'Blue-black and brass, for playing late.', themeColor: '#12141a', dark: true },
  { id: 'noir', name: 'Noir', blurb: 'True black and one hot red.', themeColor: '#0a0a0a', dark: true },
  { id: 'oxblood', name: 'Oxblood', blurb: 'Leather, mahogany and gold.', themeColor: '#241416', dark: true },
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
