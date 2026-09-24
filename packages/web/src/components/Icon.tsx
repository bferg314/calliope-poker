/**
 * The few icons the interface uses, drawn like the rest of it: a single pen
 * stroke in the current ink, square ends, no fills. 24-unit grid, 1.5 stroke.
 * They sit on the text baseline, so an icon beside a word never looks dropped.
 * See docs/design.md §2 (Icons).
 */

const PATHS = {
  'chevron-down': 'M6 9.5l6 6 6-6',
  'chevron-right': 'M9.5 6l6 6-6 6',
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  copy: 'M8.5 8.5h10v10h-10zM15.5 8.5v-3h-10v10h3',
  pencil: 'M4.5 19.5l1-4.5L15.5 5l3.5 3.5-10 10zM13 7.5l3.5 3.5',
  key: 'M8 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM11.5 12h8.5M17.5 12v3M20 12v2.5',
  person: 'M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5 19.5c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, label }: { name: IconName; size?: 16 | 20 | 24; label?: string }): JSX.Element {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
