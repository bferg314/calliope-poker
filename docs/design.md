# Calliope Poker — Design System

This document is the source of truth for how the game looks and feels. Table UI code is written against it, not the other way round. When something here and the code disagree, fix the code or update this doc deliberately.

## 1. Direction: paper & ink

A poker night at a kitchen table, printed rather than rendered. The interface is a sheet of cream stock with things set on it in black and red ink: cards, chips, a scorecard. Nothing glows, nothing has a drop shadow, nothing is glass. Hierarchy comes from type size, weight, ink color, and hairline rules. Decoration is the decoration of print: registration marks, ornaments, small caps, a numbered folio in the corner.

Three tests for any new screen or component:

1. **Could it be printed?** If a visual effect only makes sense on a screen (glow, blur, gradient, neon), it is out.
2. **Is the player's own hand the loudest thing?** The player's cards and their next decision are always the largest and highest-contrast elements.
3. **Would a stranger know what to press?** Fold, check/call, and bet/raise are never hidden behind a tap, a hover, or an icon.

## 2. Tokens

Tokens are CSS custom properties on `:root`, set by the active theme. Components only use tokens, never raw values. Every theme must define every token.

### Color

| Token | Paper & ink | Meaning |
|---|---|---|
| `--paper` | `#F4EFE3` | Page ground |
| `--paper-2` | `#EAE3D2` | Slightly deeper ground: panels, the table surface |
| `--paper-3` | `#DDD4BE` | Pressed/inset surfaces, disabled fills |
| `--ink` | `#1B1A17` | Primary text, black suits, rules |
| `--ink-2` | `#5B574D` | Secondary text, hints, folded players |
| `--ink-3` | `#9A9384` | Tertiary: placeholders, hairlines |
| `--red` | `#B3261E` | Red suits, the "to act" mark, destructive confirmation |
| `--red-2` | `#8F1D17` | Red pressed state |
| `--on-red` | `#FBF8F1` | Text on a red fill. Each theme picks the readable one |
| `--accent` | `#1F4E5F` | A single cool ink for links and the active tab. Used sparingly |
| `--field-bg` | `#FBF8F1` | Input and select fill |
| `--card-face` | `#FBF8F1` | Card stock, slightly whiter than paper |
| `--card-back` | `#1B1A17` | Card back ink (pattern drawn in `--paper`) |
| `--felt` | `#EAE3D2` | Table surface. In paper & ink it is just deeper paper |
| `--focus` | `#1F4E5F` | Keyboard focus ring |

Contrast requirements: `--ink` on `--paper` ≥ 12:1, `--ink-2` on `--paper` ≥ 5:1, `--red` on `--paper` ≥ 5.5:1, `--paper` on `--ink` ≥ 12:1.

Chip colors come from room config, not the theme. The theme provides a chip *style* (see §5), and the default denomination set:

| Value | Label | Color |
|---|---|---|
| 1 | white | `#F4EFE3` with `--ink` edge |
| 5 | red | `#B3261E` |
| 25 | green | `#2E5E4E` |
| 100 | black | `#1B1A17` |
| 500 | purple | `#5A3E6B` |
| 1000 | yellow | `#C9A227` |

### Type

Two families, both self-hosted via `@fontsource`:

- **Display and body: Fraunces** (variable; optical size axis; real italics). Headings at `opsz` 72+, body at `opsz` 14. Fraunces has "wonky" alternates (`WONK` axis) that give it a letterpress warmth. Use `font-variation-settings: "WONK" 1` on display sizes only.
- **UI and numerals: Instrument Sans** (tabular figures via `font-variant-numeric: tabular-nums`). All stacks, pot sizes, timers, bet amounts, and buttons use this.

Scale (rem, base 16px):

| Token | Size | Use |
|---|---|---|
| `--t-display` | 3.5 | Landing title, night-report winner |
| `--t-h1` | 2.25 | Screen titles |
| `--t-h2` | 1.5 | Section titles, player's own hand label |
| `--t-body` | 1.0 | Body |
| `--t-small` | 0.875 | Hints, seat names |
| `--t-micro` | 0.75 | Small caps labels, folio |
| `--t-stack` | 1.125 | Stack numbers on seats |
| `--t-pot` | 1.75 | Pot in the middle |
| `--t-action` | 1.25 | Action bar buttons |

Small caps labels (`font-variant-caps: all-small-caps; letter-spacing: 0.08em`) are the standard way to label a value: "POT", "TO CALL", "DEALER", "BLINDS 5 / 10".

### Space and rules

Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64` px as `--s-1` … `--s-8`.

Rules are 1px `--ink-3` or 1px `--ink` for emphasis. Double rules (two 1px lines 3px apart) mark section ends, as in a ledger. No box shadows. Panels are distinguished by `--paper-2` fill and a hairline, or by a rule alone.

Corner radius: cards 6px, chips are circles, buttons 4px, panels 0px. Sharp corners are part of the print feel.

### Motion

Durations: `--d-fast: 120ms`, `--d-base: 200ms`, `--d-slow: 360ms`. Easing: `cubic-bezier(0.2, 0, 0, 1)` (ease-out, decisive). No spring, no bounce, no overshoot.

- Cards are dealt: slide from the deck position to the seat over `--d-slow`, staggered 60ms per card. Flip on reveal: a 1-axis scaleX flip over `--d-base`.
- Chips to pot: slide over `--d-base` at street end, then the pot number counts up over `--d-base`.
- Pot to winner: slide over `--d-slow`, winner's stack counts up.
- "To act" mark: appears instantly (no fade). A moving red mark is the most important motion in the game, so it must never lag.
- `prefers-reduced-motion`: all slides become instant, flips become fades.

## 3. Cards

Cards are our own SVG, one file per card, generated from a template script so they are consistent. Ratio 5:7. Rendered sizes:

| Context | Width |
|---|---|
| Player's own hole cards (phone) | 88px |
| Player's own hole cards (desktop) | 112px |
| Board | 64px phone / 80px desktop |
| Opponent cards (face down / stud up cards) | 36px phone / 48px desktop |
| Hand history / report | 28px |

Face design:

- Card stock `--card-face`, 6px radius, 1px `--ink-3` hairline edge.
- **Oversized corner indices**: rank glyph in Fraunces at 34% of card height, suit pip below at 18% of card height. Indices are in the top-left and rotated bottom-right. At 36px wide the top-left index alone is readable, which is why it is so large.
- Center: a single large suit pip for number cards (no pip-count layout, that is unreadable at small sizes). Court cards (J, Q, K) use a simple two-color line illustration in a woodcut style; if illustration is not ready, a large letter in a decorative frame is acceptable.
- Ace of spades carries a small ornament and the word CALLIOPE in micro small caps. It is the only branded card.
- Black suits in `--ink`, red suits in `--red`. Two inks only.

Back design: `--card-back` ground with a repeating engraved diamond lattice in `--paper` at 1px, and a small central cartouche. Backs must be obviously "not a face" at 36px.

Face-down cards belonging to the player are never shown face down; the player always sees their own cards.

## 4. Table layout

The player's seat is always bottom-center. Opponents are arranged on an arc above. Positions are computed from the player's seat index so every player sees themselves at the bottom.

### Phone portrait (≥ 360px wide, the primary layout)

```
┌──────────────────────────────┐
│ CALLIOPE  ·  Room K7Q2M4   ⋯ │  top bar: 40px, room code, menu
├──────────────────────────────┤
│                              │
│   (opp)   (opp)   (opp)      │  opponents row(s): up to 7 seats
│ (opp)                 (opp)  │  on an arc; each seat is a
│   (opp)           (opp)      │  compact "seat card" (§4.2)
│                              │
│        ┌──┐┌──┐┌──┐┌──┐┌──┐  │  board, centered
│        └──┘└──┘└──┘└──┘└──┘  │
│            POT  1,240        │  pot, small caps label
│                              │
├──────────────────────────────┤
│  ┌────┐ ┌────┐   Alice       │  player's own seat: large cards,
│  │ A♠ │ │ K♥ │   2,450       │  name, stack, hand label
│  └────┘ └────┘   "Ace high"  │
├──────────────────────────────┤
│ [ FOLD ]  [ CALL 40 ]  [ RAISE ▸ ] │  action bar: 64px tall
└──────────────────────────────┘
```

The action bar is fixed to the bottom with safe-area padding. The board and pot are centered in the remaining space. Opponent seats never overlap the board.

### Desktop (≥ 900px)

Same structure, but the opponent arc is a true ellipse around the table surface and the player's seat sits inside the ellipse at the bottom. The action bar becomes a centered panel 560px wide rather than full width. A hand-history rail (last 5 hands, one line each) sits on the right at ≥ 1200px.

### 4.2 Seat card

An opponent's seat is a 120×64px (phone) block:

```
┌──────────────────┐
│ ▮ Bob        D   │   name, dealer button "D" as a printed circle
│   1,850          │   stack in tabular figures
│ [▓][▓]           │   face-down cards, or stud up cards face up
│ bet 40           │   current street bet, shown only when > 0
└──────────────────┘
```

States:

| State | Treatment |
|---|---|
| To act | Left edge carries a 3px `--red` bar; name in `--red`. A thin timer line under the name drains left to right |
| Folded | Whole card at `--ink-2`, cards removed, name struck with a single rule |
| All-in | "ALL IN" small caps under the stack, stack shows 0 |
| Sitting out | `--ink-3`, name in italics |
| Disconnected | A small "·· ··" morse-style mark after the name; nothing else changes, the seat is held |
| Winner (settle) | Name and stack in `--ink` bold, a short "+1,240" in `--red` beside the stack for `--d-slow` × 4 |

### 4.2a Which game is being played

Directly under the top bar, on every screen that has a table, a strip names the
game in display serif with the betting structure beside it in small caps:
"Pineapple · no limit". It is never hidden and never abbreviated, because in
dealer's choice it changes hand to hand and a player who misreads it will misplay
their cards.

The strip carries the current instruction when a street has one, so during a
Pineapple discard it reads "Pineapple · everyone throws one away". Between hands
it shows what the table is set to; while the dealer is choosing it says who is
choosing.

### 4.2b Throwing cards away

When it is a player's turn to discard, their own cards become the control: tap a
card and it drops slightly, fades, and takes a red "throw" stamp. The action bar
is replaced by a single instruction line and one committing button, which names
exactly what will happen: "Throw it away", "Draw 3", or "Stand pat". A "Put back"
button appears once anything is selected.

Opponents' seats show how many cards each of them took ("drew 3"), because in
draw poker that is the only read available.

### 4.2b The level chip

When the stakes climb, the top bar carries a small caps level number, the current blinds, and how long or how many hands until the next level. It turns `--red` in the last minute. A `notice-bar` announces the change on the first hand at a new level and then gets out of the way.

Stakes never change inside a hand. The clock, and the level with it, freezes while the table is paused, and the paused notice says so.

### 4.2c Your turn

The action arriving is the one event a player may have looked away for, and at a
kitchen table they usually have. Two things mark it, and both stop by
themselves:

- **A stamp on the felt.** A paper plate with a hairline rule above and below,
  "Your turn" in display serif, and one small caps line saying what is being
  asked: "10 TO CALL", "CHECK OR RAISE", "PICK THE GAME", "THE DRAW". It is
  pressed onto the table area, not the window, so on desktop it lands on the
  felt rather than halfway into the hand rail. It holds for 1.6 seconds and then
  fades, and a tap or a keypress clears it early — somebody already watching
  gets the board straight back. It never takes pointer events, so it cannot
  swallow the tap it is asking for.
- **A bell.** One struck note, synthesised from three decaying sine partials
  rather than shipped as a sound file. Off is one tick away in the table menu,
  beside "confirm folds", and the choice is stored per device like the theme.
  Browsers hold audio shut until the page has been touched, so the first gesture
  of the night unlocks it; otherwise the first bell, the one that matters most,
  would be the silent one.

Both are edge-triggered on the turn itself: a redraw mid-turn must not ring
again, and two turns in the same hand must both ring. The live region announces
"Your turn" as it always has, and the stamp is `aria-hidden`, so a screen reader
hears it once rather than twice.

### 4.3 Board and pot

Board cards are dealt left to right into fixed slots (5 for community games; stud shows no board and the slots collapse). Pot is a small caps label above a large tabular number. Side pots are listed under the main pot as "SIDE 320 · 180" in `--t-small`. When betting is open, the current street's bets are shown at each seat and are not yet in the pot; at street end they slide in.

## 5. Chips

Chips are drawn as printed tokens: a filled circle in the denomination color, a 2px `--ink` outer ring, four short radial dashes in `--paper`, and the value printed in the center in Instrument Sans. White chips use `--paper` fill with `--ink` ring and ink text. They are used in three places:

1. Beside a seat as its current street bet (up to 4 chips stacked with 3px offsets; the number is always printed beside them).
2. In the pot (a small pile, purely decorative, max 8).
3. On the buy-in and re-buy screens, where the room's denomination set is displayed as a legend.

Chips never need to be counted visually. The number is always present.

## 6. The action bar

The most important component. Three primary controls, always in the same order, always the same size:

```
[  FOLD  ]  [  CHECK  ]  [  BET ▸  ]
[  FOLD  ]  [ CALL 40 ]  [ RAISE ▸ ]
```

- Buttons are 64px tall on phone, 56px on desktop, full width split three ways with 8px gaps. Labels at `--t-action`, small caps.
- Fold is outlined (`--ink` hairline, paper fill). Check/Call is filled `--ink` with paper text. Bet/Raise is filled `--red` with paper text. This encodes cost: quiet, committed, aggressive.
- When it is not the player's turn, the bar remains visible with the buttons at `--ink-3` outline and the text "Waiting for Bob". Pre-actions ("check/fold", "call any") are shown as small toggles above the bar; if a pre-action is set, the bar shows it as a pressed toggle.
- Tapping Bet/Raise slides up a **bet panel** (not a modal) above the bar:

```
┌─────────────────────────────────────┐
│ RAISE TO      [  120  ]  ← editable │
│ ────────●──────────────────── slider│
│ [MIN] [½ POT] [POT] [ALL IN]        │
│ [ CONFIRM RAISE TO 120 ]  [ cancel ]│
└─────────────────────────────────────┘
```

  The amount field is the primary control. The slider snaps to the big blind. Presets fill the field. Confirm is `--red` filled and states the exact amount. Fixed-limit games skip the panel entirely; the button reads "BET 10" / "RAISE TO 20" and acts immediately.
- Keyboard: `F` fold, `C` check/call, `R` open bet panel, digits type into the amount, `Enter` confirm, `Esc` cancel. Shortcuts are printed in micro small caps under each button on desktop.
- Facing a bet, Fold asks for no confirmation by default. A per-user setting "confirm folds" adds a second tap.

## 7. Screens

### Landing

Title "Calliope Poker" at `--t-display` with a printed ornament above it. Two actions: "Deal a new table" and "Join with a code" (six-character input, uppercase, auto-advances). Below, a single line of `--t-small`: "Rooms are private. No accounts, just a name for the evening."

### Identity

First visit: "You're **Quiet Heron** tonight." with a pencil icon to rename. Under it, the recovery phrase is printed as a ticket:

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  KEEP THIS TICKET
  amber  · lantern · velvet · ninety · spool
  Type these five words with your name
  to get your stats back another night.
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
```

Buttons: "Copy", "Choose my own words", "Got it". Recovery screen is the same ticket with blank word slots.

### Lobby

Left: the seat ring as it will appear at the table, with empty seats printed as dotted circles ("open"). Host sees "+ bot" on empty seats. Right (below on phone): settings as a printed form with sections: Game (variant mode, betting, blinds), Chips (buy-in, denominations, starting stack), Re-buys, End of night. A share block shows the room code large, a QR of the join link, and the link itself with a copy button. "Deal the first hand" is the single primary action, `--red`; it is disabled while the settings form has unsaved edits, with the reason and a "Save them" button printed beside it rather than in a tooltip, which a phone has no way to show. Below the form, quietly, "Cancel this table".

### Table

§4. The room code in the top bar is a button: pressing it copies the join link and says so. "Invite someone" in the host menu opens the same share block as a dialog, one acknowledge button.

The QR is drawn as our own SVG from the module matrix, on a card-stock plate with a four-module quiet zone inside the viewBox. It is always dark-on-light, never inheriting the theme: a transparent code on a dark theme puts dark modules on a dark quiet zone and scans nowhere.

### Night report

A single printed sheet, scrollable. Title "The night of 17 September". Winner at `--t-display`. A ledger table: name, buy-ins, re-buys, final stack, net. Then "Biggest pot", "Most hands won", "Luckiest draw" as three short cards. A footer folio: hands played, duration, variants played.

### Profile

Same ledger style, per night, with lifetime totals at the top.

## 8. Theme contract

A theme is a `[data-theme="<id>"]` block in `packages/web/src/styles/tokens.css` that redefines **every** colour token from §2: `color-scheme`, the eleven palette tokens, `--field-bg`, and the six card tokens. Fonts, type scale, spacing, motion and radii are inherited from `:root` and must not be overridden — that is what guarantees the action bar is the same action bar on every theme.

Each theme also has an entry in `packages/web/src/themes.ts` with its `name`, a one-line `blurb`, and the `themeColor` the browser paints its chrome with.

Two rules that keep every theme readable:

- **Cards keep white stock on every ground.** They are printed objects sitting on the table, not part of it. Only `--card-edge` and the back inks change.
- **`--on-red` is the text colour on a red fill,** because a red bright enough to read on a dark ground is too light for white text. Light-red themes set it to their darkest ink; dark-red themes set it to paper.

Five themes ship. **Felt is the default**, and its palette lives on bare `:root`
as well as `[data-theme='felt']`, so the very first paint is already correct and
there is no flash of a light page before the stored choice is applied.


| id | ground | ink | accent | |
|---|---|---|---|---|
| `paper-ink` | cream stock | black and red ink | deep teal |
| `felt` | deep green | cream | pale blue | *default* |
| `midnight` | blue-black | warm cream | brass |
| `noir` | true black | bright white | steel |
| `oxblood` | burgundy-brown | aged paper | muted gold |

**Picking one.** The theme grid renders each swatch inside its own `data-theme` wrapper, so the tokens cascade and every swatch is a true miniature — real cards, a real red button — rather than a hand-painted approximation. The full grid lives on the profile screen; a compact row of dots sits in the table menu, because that is where somebody decides the room is too bright. The choice is stored per device in `localStorage`.

## 8b. Dialogs

Anything destructive asks first, in a dialog that says what will actually happen. Built on the native `<dialog>` element with `showModal()`, which gives a real focus trap, Escape, an inert background and top-layer stacking, so the modal never has to win a `z-index` race.

- A hairline-bordered paper sheet, a display-serif question as the heading, one or two plain sentences of consequence, and two buttons above a rule.
- Destructive dialogs colour the confirm `--red` and **put the keyboard on cancel first**, so Enter never does the damage.
- The confirm button names the action ("Stand up", "End the night"), never "OK".
- Escape, the cancel button and a backdrop click all mean no.
- Stack the buttons on narrow screens, confirm on top.

Dialogs guard: ending the night, standing up, re-buying (which shows the real money value), removing a player, handing over host, forgetting the identity on this device, and replacing the ticket words.

## 9. Accessibility

- Every interactive element is keyboard reachable with a visible `--focus` ring (2px, offset 2px).
- Suits are never conveyed by color alone: the pip glyph is always present, and the hand label ("Flush, ace high") is text.
- Minimum tap target 44px.
- Live region announces: "Your turn", "Bob raises to 120", "You win 1,240".
- All text meets WCAG AA at its size against its ground.

## 10. Words

Copy is short, plain, and slightly dry. "Deal the first hand", not "Start game". "You're out of chips. Re-buy?" not "Insufficient balance". Player-facing errors are one sentence and say what to do next. No exclamation marks except in the night report's winner line.
