# Calliope Poker — Design System

This document is the source of truth for how the game looks and feels. Table UI code is written against it, not the other way round. When something here and the code disagree, fix the code or update this doc deliberately.

## 1. Direction: paper & ink

A poker night at a kitchen table, printed rather than rendered. The interface is a sheet of cream stock with things set on it in black and red ink: cards, chips, a scorecard. Nothing glows, nothing has a drop shadow, nothing is glass. Hierarchy comes from type size, weight, ink color, and hairline rules. Decoration is the decoration of print: registration marks, ornaments, small caps, a numbered folio in the corner.

Three tests for any new screen or component:

1. **Could it be printed?** If a visual effect only makes sense on a screen (glow, blur, gradient, neon), it is out.
2. **Is the player's own hand the loudest thing?** The player's cards and their next decision are always the largest and highest-contrast elements.
3. **Would a stranger know what to press?** Fold, check/call, and bet/raise are never hidden behind a tap, a hover, or an icon.

## 2. Tokens

Tokens are CSS custom properties on `:root`, set by the active theme, in `packages/web/src/styles/tokens.css`. Components only use tokens, never raw values. Every theme must define every colour token. `packages/web/test/tokens.test.ts` holds these rules: it fails on a missing token, a contrast below the minimums below, a raw font size or colour outside `tokens.css`, or a shadow, blur or gradient.

### Color

The names come from the paper & ink theme, where they are literal. Felt is the default theme, so its values are listed first.

| Token | Felt | Paper & ink | Meaning |
|---|---|---|---|
| `--paper` | `#1E3A2F` | `#F4EFE3` | Page ground |
| `--paper-2` | `#183026` | `#EAE3D2` | Slightly deeper ground: panels, the game strip, fields |
| `--paper-3` | `#12261E` | `#DDD4BE` | Pressed/inset surfaces, disabled fills |
| `--ink` | `#F4EFE3` | `#1B1A17` | Primary text, rules |
| `--ink-2` | `#CFC8B5` | `#5B574D` | Secondary text, hints, folded players |
| `--ink-3` | `#8E9A88` | `#9A9384` | Tertiary: placeholders, hairlines |
| `--ink-disabled` | `#8E9A88` | `#6F6A5E` | A disabled control's label: faint, but still legible |
| `--red` | `#EC7A68` | `#B3261E` | Red suits, the "to act" mark, aggressive and destructive actions |
| `--red-2` | `#D9604C` | `#8F1D17` | Red pressed state |
| `--on-red` | `#12261E` | `#FBF8F1` | Text on a red fill. Each theme picks the readable one |
| `--accent` | `#9AC7D6` | `#1F4E5F` | A single cool ink for links and the active tab. Used sparingly |
| `--focus` | `#9AC7D6` | `#1F4E5F` | Keyboard focus ring |
| `--felt` | `#1E3A2F` | `#EAE3D2` | Table surface |
| `--seat-bg` | `#183026` | `#EAE3D2` | An opponent's seat card, so seats read as things set on the felt |
| `--field-bg` | `#183026` | `#FBF8F1` | Input and select fill |
| `--card-face` | `#FBF8F1` | `#FBF8F1` | Card stock, the same on every theme |
| `--card-back` | `#F4EFE3` | `#1B1A17` | The fallback card's back |

Contrast minimums, per theme: `--ink` on `--paper` ≥ 7:1; `--ink-2` on `--paper` ≥ 4.5:1; `--on-red` on `--red` ≥ 4.5:1; `--ink` on `--seat-bg` ≥ 7:1; `--ink-disabled` on `--paper` and on `--paper-3` ≥ 3:1.

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
| `--t-h1` | 2.25 | Screen titles, the room code |
| `--t-h2` | 1.5 | Section titles, the player's own name |
| `--t-h3` | 1.25 | The player's own stack, the turn stamp on a phone |
| `--t-lead` | 1.125 | Brand, game strip, seat names in the lobby |
| `--t-body` | 1.0 | Body |
| `--t-small` | 0.875 | Hints, opponents' names and stacks on a phone |
| `--t-seat` | 0.8125 | The smallest seat text on a phone |
| `--t-micro` | 0.75 | Small caps labels, folio. Nothing is set smaller |
| `--t-stack` | 1.125 | Stack numbers on wide-screen seats |
| `--t-pot` | 1.75 | Pot in the middle |
| `--t-action` | 1.125 | Action bar buttons |

Small caps labels (`font-variant-caps: all-small-caps; letter-spacing: 0.08em`) are the standard way to label a value: "POT", "TO CALL", "DEALER", "BLINDS 5 / 10".

### Space and rules

Spacing scale: `4, 8, 12, 16, 24, 32, 48, 64` px as `--s-1` … `--s-8`, and `--s-0` (2px) for hairline offsets only.

Rules are 1px `--ink-3` or 1px `--ink` for emphasis. Double rules (two 1px lines 3px apart) mark section ends, as in a ledger. No box shadows. Panels are distinguished by `--paper-2` fill and a hairline, or by a rule alone.

Corner radius: cards 6px (or the deck's own), chips are circles, buttons 4px (`--r-btn`), panels 0px (`--r-panel`). Sharp corners are part of the print feel.

### Controls

`--hit` (44px) is the smallest thing a finger is asked to hit. Every `.btn`, and anything else given the `hit` class, carries a transparent pad that makes its hit area at least `--hit` square however small it is drawn, so a quiet 36px "stand up" is drawn small and hit large. Inputs and selects are 44px tall; a checkbox or radio sits in a 44px label row.

Buttons come in three sizes: the action bar's (64px on a phone, 56px wide), the default (44px), and small (drawn 36px). Four inks: outline (secondary), ink fill (commit), red fill (aggressive or destructive), quiet (text only). Disabled is a `--paper-3` fill with `--ink-disabled` text.

### Icons

Few, and drawn like the rest of the page: `components/Icon.tsx` holds inline SVGs on a 24-unit grid, one 1.5 stroke in the current ink, square ends, no fills (chevrons, close, plus, check, copy, pencil, person). They sit on the text baseline at 16, 20 or 24px. The dealer button stays a printed "D" in a circle, because it is type. Text glyphs (▾ ▸ ×) are not used as icons.

### Motion

Durations: `--d-fast: 120ms`, `--d-base: 200ms`, `--d-slow: 360ms`. Easing: `cubic-bezier(0.2, 0, 0, 1)` (ease-out, decisive). No spring, no bounce, no overshoot.

- Cards are dealt: slide from the middle of the felt to the seat over `--d-slow`, staggered 60ms per card. A card redrawn in a place already dealt to this hand (a resize that swaps picture for tile) just appears. Flip on reveal: a 1-axis scaleX flip over `--d-base`. In stud, your own "hidden" marks wait until their card lands.
- Chips placed: a bet's chips set down beside the seat's stack over `--d-slow`, again on every raise.
- Chips to pot: one chip per bet (24px, bigger than a bet's) slides into the pot over `--d-slow` at street end. The pot number already counts street bets, so it does not change.
- Pot to winner: up to three chips slide from the pot to each winner's stack over 1.6 × `--d-slow`, after the sweep.
- `packages/web/src/tableMotion.tsx` holds the dealing and chip flights; it only reads the view, so a missed animation is never a missed state.
- "To act" mark: appears instantly (no fade). A moving red mark is the most important motion in the game, so it must never lag.
- `prefers-reduced-motion`: all slides become instant, flips become fades.

## 3. Cards

Cards come from **Open Playing Cards** decks, the format Card Atelier exports ([spec](https://github.com/bferg314/card-atelier/blob/main/docs/open-playing-cards.md)): a picture per card (an SVG, a PNG, or both), a back, and the facts to play with them. Calliope only reads finished decks; how a deck was designed is not its business. Rendered sizes:

| Context | Width |
|---|---|
| Player's own cards, phone | 72–88px for two or three; 64px for four to seven, overlapped only when they will not fit |
| Player's own cards, wide | 112px for two or three, 88px for four or five, 76px for more |
| Board | 48–64px on a phone; on a wide screen as large as clears the seats, up to 120px |
| Opponents' face-up cards (tiles) | 22px phone / 30px wide |
| Opponents' face-down cards (backs, fanned) | 18px phone / 24px wide |
| Theme previews | 26px |

Rules:

- **french-52 only.** A deck must say `deckType: "french-52"`; its well-known ids map straight to engine codes (`hearts-K` → `Kh`, `spades-10` → `Ts`). `value` is ignored: Calliope ranks by rank id. Jokers are ignored. Anything else is refused with a plain sentence.
- **Size from the deck.** Height is width × `heightMm / widthMm`, rounded to a whole pixel; corners follow `cornerRadiusMm`, and bleed is cropped off. Images keep their transparent corners, so any felt shows through.
- **Vector first.** A card is drawn from its `vector` SVG when the deck has one: the browser rasterises it at exactly the drawn size, so it is sharp on any screen, and the files are a fraction of the PNGs' size. Imported decks keep only the SVG when both are present.
- **PNGs drawn at exact size.** A deck's PNGs are print-sized, and a browser shrinking one five-fold in a single step leaves it soft on a 1x screen. A PNG-only card is resampled once per session (`createImageBitmap`, high quality) to exactly its on-screen device-pixel size and drawn from that rendition (`renditions.ts`); the original shows for the few milliseconds until it is ready.
- **A picture only where it can be read.** Calliope draws a card exactly as the deck drew it and adds nothing over it, but it only uses the picture where the corner index will be legible: at least 6.5px tall on screen. The index height comes from the deck's smallest `ranks[].indexHeightMm` over its `heightMm` (6% when the deck does not say, which is a print-proportioned index). Below that size the card is drawn as an **index tile** instead: card stock with the rank set large (never under 12px) in Instrument Sans and the suit pip under it, in the card inks. The tile is not painted over the deck's art; it stands in place of it, the way a scorer writes "K♥" rather than sketching the card. Opponents' face-up cards are always tiles, because a seat has no room for a card big enough to read. Decks meant for play here are exported with oversized indices (Card Atelier: Artwork → Lettering → Oversize for digital play) so that the board and the player's own cards show the art; the starter deck's index is about 10% of its height, so its pictures are legible from about 48px wide.
- **One choice, faces and back together.** The back is the deck's; there is no separate back picker. The preference is local to the device, like the theme. Other players never see your deck.
- **Starter decks** ship unzipped under `packages/web/public/decks/<folder>/` and are served as plain files, fetched once and cached. The build checks each (complete french-52, a licence, every picture present: PNGs at the stated size, SVGs with an `<svg>` root) and fails otherwise. The first folder in `starterDecks({ order })` in `vite.config.ts` is the default.
- **Imported decks** (Profile → Deck → Import) accept the `.zip` or the single `.cards.json`, are checked the same way, and live in IndexedDB as PNG blobs, drawn from object URLs made once when the deck is chosen. A re-import with the same `deckId` replaces the copy; an imported copy of a starter deck stands in for it until removed.
- **Fallback.** Before a deck is ready, or if one cannot be read, cards fall back to Calliope's own two-ink SVG (oversized index, single centre pip, lattice back).
- Backs chosen for starter decks must be obviously "not a face" at 24px.

Face-down cards belonging to the player are never shown face down; the player always sees their own cards.

## 4. Table layout

The player's seat is always bottom-center. Opponents are arranged round the table above it, clockwise from the player, so every player sees themselves at the bottom. Only occupied seats are drawn: an open chair is not worth the room on the felt. The host adds bots from the table menu, and a watcher takes the next open seat from their own panel.

Every layout is checked by `packages/web/e2e/layout-audit.mjs`, which plays each game at 3, 6 and 8 players and resizes through eight windows from 360×640 to 1920×1080 (§9). No seat may overlap another seat, the board, the pot or the player's own seat; nothing may leave the window; and the table may not move between hands.

Which layout is used is decided once, in `Table.tsx`, and handed to CSS as `data-layout` on the table screen, so the script and the styles cannot disagree.

### Phone portrait (`phone`, the primary layout)

```
┌──────────────────────────────┐
│ Calliope K7Q2M4       Alice ⌄│  top bar: 44px, room code, menu
│   Omaha · pot limit          │  game strip: one line, always
├──────────────────────────────┤
│  (opp 3)   (opp 4)   (opp 5) │  across the top
│   ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐   │  the board, full width
│   └──┘ └──┘ └──┘ └──┘ └──┘   │
│ (opp 2)      POT      (opp 6)│  pot between the side columns,
│ (opp 1)     1,240     (opp 7)│  the stage under it
├──────────────────────────────┤
│  ┌────┐ ┌────┐   Alice       │  player's own seat: large cards,
│  │ A♠ │ │ K♥ │   2,450       │  name, stack, hand label
│  └────┘ └────┘   Ace high    │
├──────────────────────────────┤
│ [ FOLD ] [ CALL 40 ] [RAISE ›]│  action bar: 64px buttons
└──────────────────────────────┘
```

A horseshoe on a grid. Opponents run up the left column, across the top and down the right, clockwise from the player, so the first opponent to the player's left is at the bottom of the left column. Up to two opponents sit across the top; three to five put one in each side column; six or more put two in each. The board spans the row between the top seats and the side columns; the pot sits in the middle column between them, with the **stage** under it. Every seat has its own grid cell, so a seat can never land on the board or on another seat, whatever it holds.

The table takes whatever height is left after the top bar, the strip, the player's own seat and the action bar, and none of those change height during a night (§4.2a, §4.4, §6), so the table does not move between turns or between hands. The board's cards are sized from what is left: 48–64px, smaller when two seats stand in each side column.

### Wide (`wide`, 900px and up)

Seats sit on an ellipse round the felt, spread evenly over the players actually seated with the player's own place at the bottom counted as one of the positions. The board sits just above the middle and is sized to clear every seat on the upper half of the ellipse, up to 120px a card; the pot and the stage sit under it in a column no wider than 36% of the table, which keeps them clear of the lower seats. The player's own cards and the action panel (560px) share one centred column under the table. A hand-history rail sits on the right at ≥ 1200px.

### Short (`short`, any window under 520px tall and wider than it is tall)

A phone on its side. The table, laid out as the phone's horseshoe, takes the left of the window; the player's own seat and the action bar stack in a column on the right (at least 18rem, at most 38%). Nothing else changes.

### 4.2 Seat card

An opponent's seat, sized by its cell on a phone and 168px wide on the ellipse:

```
┌──────────────────┐
│▌Bob            D │   name, dealer button "D" as a printed circle
│ 1,850      ● 40  │   stack, and this street's bet at the right
│ ▓▓ [K♥][7♣]      │   face-down cards fanned; face-up ones as tiles
└──────────────────┘
```

The right-hand end of the stack line carries, in order of precedence: the win ("+1,240", while settling), the hand shown at showdown ("Two pair, kings"), this street's bet with its chips, or how many cards were drawn ("drew 3").

Face-down cards are a fan of backs, overlapped: how many, not what. Face-up cards (stud's up-cards, everything at a showdown) are index tiles (§3). When there are more than fit, as at a seven-card stud showdown, they overlap from the right, so every rank stays in view.

States:

| State | Treatment |
|---|---|
| To act | Left edge carries a 3px `--red` bar; name in `--red`. A thin timer line under the name drains left to right |
| Folded | Whole card at `--ink-2`, cards removed, name struck with a single rule |
| All-in | "ALL IN" small caps beside the stack |
| Sitting out | `--ink-3`, name in italics |
| Disconnected | A small "·· ··" morse-style mark after the name; nothing else changes, the seat is held |
| Winner (settle) | Name bold, border in `--ink`, "+1,240" in `--red` at the end of the stack line for `--d-slow` × 4 |

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

It is also where the table says what it is waiting on: "shuffling", "waiting for
a second player", "waiting for the host to deal", "paused, and so is the clock",
and, in `--red`, "last hand of the night" and "stakes are up: 10/20". These used
to be bars of their own that pushed the table down every hand. The strip is
always one line, with the note cut short rather than wrapped, so it never
changes height.

### 4.2b Throwing cards away

When it is a player's turn to discard, their own cards become the control: tap a
card and it drops slightly, fades, and takes a red "throw" stamp. The action bar
is replaced by a single instruction line and one committing button, which names
exactly what will happen: "Throw it away", "Draw 3", or "Stand pat". A "Put back"
button appears once anything is selected.

Opponents' seats show how many cards each of them took ("drew 3"), because in
draw poker that is the only read available.

### 4.2b The level chip

When the stakes climb, the top bar carries a small caps level number, the current blinds, and how long or how many hands until the next level. It turns `--red` in the last minute. The game strip announces the change for a few seconds at the first hand at a new level and then gets out of the way.

Stakes never change inside a hand. The clock, and the level with it, freezes while the table is paused, and the paused notice says so.

### 4.2c Your turn

The action arriving is the one event a player may have looked away for, and at a
kitchen table they usually have. Two things mark it, and both stop by
themselves:

- **A stamp on the felt.** A band filled `--red`, with "Your turn" in display
  serif and, after a middot, one small caps line saying what is being asked:
  "10 TO CALL", "CHECK OR RAISE", "PICK THE GAME", "THE DRAW". Red because red
  is already the ink that means "to act" on a seat card (§4.2), so the stamp is
  that mark written large; the text is `--on-red`, which each theme sets to the
  one readable ink for its own red.

  It is pressed onto the **stage**, the table's own place under the pot
  (§4), so it lands on the felt and not halfway into the hand rail, it is
  **clear of the pot**, and it covers no seat. The pot is the number you want
  most while you are deciding, and a notice that hides it buys attention at the
  price of the thing it is calling you to; being low also puts it between the
  board and your own cards, where you are looking anyway. That is why it is one
  short band and not a tall plate. Between two columns of seats on a phone the
  stage is narrow, so the band sets smaller and takes two lines there.

  It holds for 1.6 seconds and then fades, and a tap or a keypress clears it
  early, so somebody already watching gets the table straight back. It never
  takes pointer events, so it cannot swallow the tap it is asking for.
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

Board cards are dealt left to right into fixed slots (5 for community games; stud and draw show no board and the row collapses). Between hands the slots follow the game the table is set to, so they do not come and go. Pot is a small caps label above a large tabular number. Side pots are listed under the main pot as "SIDE 320 · 180" in `--t-small`. When betting is open, the current street's bets are shown at each seat and are not yet in the pot; at street end they slide in.

The result of a hand ("Alice wins the pot of 1,240 with two pair, kings and threes") is printed on the stage under the pot while the hand settles, in display italic on a hairline-ruled slip, and clamped to six lines in a narrow stage.

### 4.4 Your own seat

The player's cards and next decision are the loudest things on the screen (§1). The seat is sized for the **most** cards the game can deal the player, not the cards held now, so it keeps one height through the hand and between hands and nothing above it moves. With two cards on a phone, name, stack and hand label sit beside the cards; with three or more, they are one line above the cards, which then get the full width. Seven stud cards overlap only as far as they must, always leaving at least 28px of each card, index side, in view.

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
- When it is not the player's turn, the bar keeps its buttons where they will be, faint, with "Waiting for Bob" printed over them in display italic. It is the same height either way, so nothing above it moves when the action comes round.
- When there is one thing for the player to do that is not a bet, it takes the bar's place at the bar's height, in `--red`: "Deal the next hand" for the host when dealing is by hand, "Re-buy 1,000 chips" for a player out of chips.
- The draw bar (§4.2b) is the same height as the action bar: a 20px instruction line over 44px buttons on a phone, the instruction beside the buttons on a wide screen.
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

Buttons: "Copy", "Save image", "Choose my own words", "Got it". Recovery screen is the same ticket with blank word slots.

"Save image" draws the ticket to a PNG the player can keep on their phone: the same stock, name, words and instruction, set in Fraunces on cream with dark ink. Like the cards and the QR it ignores the active theme, because half of them are dark and a saved dark rectangle is a poor thing to read five words off a year later. It is drawn on a canvas rather than scraped off the page, so the saved ticket carries the words and the one instruction they are useless without, and none of the buttons beside them.

### Lobby

Left: the seats, with empty seats printed with dotted rules ("open"). Host sees "+ bot" on empty seats. Right (below on phone, after the seats and the invitation): settings as a printed form in sections: Game (variant mode, betting, blinds), Chips (buy-in, denominations), Re-buys, Rising stakes, End of the night. Each section folds to one line that says what it is set to ("$20 for 1,000 chips · 6 colours"), so the form reads at a glance and a phone does not scroll past all of it; Game is open for the host. The game picker lists names only, with the chosen game's description printed under it. A share block shows the room code large, a QR of the join link, and the link itself with a copy button.

"Deal the first hand" is the single primary action, `--red`; it is disabled while the settings form has unsaved edits. An unsaved edit brings up a strip along the foot of the window, "You have unsaved settings.", with discard and Save settings, so saving is one tap from wherever the host has scrolled; the note by the Deal button points to it rather than to a tooltip, which a phone has no way to show. Below the form, quietly, "Cancel this table".

### Table

§4. The room code in the top bar is a button: pressing it copies the join link and says so. "Invite someone" in the host menu opens the same share block as a dialog, one acknowledge button.

The QR is drawn as our own SVG from the module matrix, on a card-stock plate with a four-module quiet zone inside the viewBox. It is always dark-on-light, never inheriting the theme: a transparent code on a dark theme puts dark modules on a dark quiet zone and scans nowhere.

### Night report

A single printed sheet, scrollable. Title "The night of 17 September". Winner at `--t-display`. A ledger table: name, buy-ins, re-buys, final stack, net. Then "Biggest pot", "Most hands won", "Luckiest draw" as three short cards. A footer folio: hands played, duration, variants played.

When the host priced a buy-in, the sheet settles up in real money as well as chips. The viewer's own payout — what the bank counts back for their chips — is printed between the winner and the ledger, ruled above and below. In the ledger, cash is set in `--t-micro` under the chip figure it came from, never in a column of its own: the in, out and net columns each carry their own amount, and a closing "the bank" row totals what was taken and what is owed. Payouts are worked out in cents and the odd cent goes to the largest fraction, so the column adds up to what came in the door. A night played for nothing prints no money at all.

### Profile

Same ledger style, per night, with lifetime totals at the top.

## 8. Theme contract

A theme is a `[data-theme="<id>"]` block in `packages/web/src/styles/tokens.css` that redefines **every** colour token from §2: `color-scheme`, the palette tokens (including `--ink-disabled` and `--seat-bg`), `--field-bg`, and the six card tokens. `test/tokens.test.ts` fails a theme that leaves one out or falls below a contrast minimum. Fonts, type scale, spacing, motion and radii are inherited from `:root` and must not be overridden — that is what guarantees the action bar is the same action bar on every theme.

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
- Minimum tap target 44px (`--hit`, §2), however small the control is drawn.
- `e2e/layout-audit.mjs` checks the tap targets, overlaps and card sizes of every screen at eight window sizes, and fails on any.
- Live region announces: "Your turn", "Bob raises to 120", "You win 1,240".
- All text meets WCAG AA at its size against its ground.

## 10. Words

Copy is short, plain, and slightly dry. "Deal the first hand", not "Start game". "You're out of chips. Re-buy?" not "Insufficient balance". Player-facing errors are one sentence and say what to do next. No exclamation marks except in the night report's winner line.
