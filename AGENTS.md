# AGENTS.md

Guidance for coding agents working on Calliope Poker: self-hosted poker for a
table of friends (room codes, dealer's choice, bots, wild cards, a night report).
Read `README.md` for the product and the rules on what it is not (it handles no
money, ever).

## Layout

An npm workspaces monorepo (`packages/*`), TypeScript throughout, Node >= 22
(CI uses 24), ESM only.

| Package | What lives there |
|---|---|
| `packages/engine` | Pure game logic: cards, evaluator, betting, side pots, table state, views, wild cards, and one file per variant in `src/variants/` |
| `packages/bots` | Rule-based bots: hand strength and discard choices |
| `packages/shared` | Protocol schemas (zod), room settings, blind/ante levels, cash pricing, policy shared by client and server |
| `packages/server` | HTTP API + one websocket per room, Postgres (users, stats, hand history) and Redis (live room state), migrations run on boot |
| `packages/web` | React + Vite client: `screens/`, `components/`, `styles/`, plus Playwright scripts in `e2e/` |

Reference docs, kept in step with the code:

- `docs/design.md` - the design system. Source of truth for how the UI looks.
- `docs/protocol.md` - the HTTP API and websocket messages.
- `docs/variants.md` - how to add a poker variant.
- `seed.md` - the original brief.

## Commands

Run from the repo root.

```sh
npm ci                                   # install
npm run typecheck                        # tsc --noEmit in every package
npm test                                 # vitest in every package
npm run build --workspace @calliope/web  # build the client into packages/web/dist
```

CI (`.github/workflows/ci.yml`) runs these, then plays hands in a browser against
a real server. A change is not done until typecheck and tests pass locally.

## Running it locally

The `docker compose` stack serves the app on :8080. For development, start only
the databases and run the server with `tsx`, serving the built client:

```sh
docker compose up -d postgres redis      # publishes 127.0.0.1:5432 and :6379
(cd packages/web && npx vite build)
DATABASE_URL=postgres://calliope:change-me@localhost:5432/calliope \
REDIS_URL=redis://localhost:6379 PUBLIC_URL=http://localhost:3000 \
WEB_DIST="$PWD/packages/web/dist" npx tsx packages/server/src/index.ts
```

- The server serves static files with wildcard routing, so a fresh `vite build`
  is picked up without restarting it.
- `GET /api/health` answers once the server is up.
- Leave `PUBLIC_URL` unset to make join links relative; an absolute value
  always wins over the browser's own address.
- `HOST_KEY` restricts who can deal new tables. The maintainer's own stack on
  :8080 sets it (and an absolute `PUBLIC_URL`), so a fresh browser identity
  there never sees "Deal a new table". That is not a UI bug. Test against the
  dev server on :3000, which sets neither.

### Isolated databases

The compose Postgres/Redis also back the maintainer's live app, and the server
migrates the schema and sweeps rooms on boot. For anything touching schema or
room lifecycle, run throwaway `--rm` containers (`postgres:17-alpine` on
127.0.0.1:55432, `redis:7-alpine` on 127.0.0.1:16379), point the server at them
on `PORT=3100`, and `docker stop` both afterwards. Avoid host port 56379 on
Windows; it falls in an excluded range.

## Testing

- **Unit tests** sit in each package's `test/` folder (vitest). Engine changes
  need engine tests; the helpers in `packages/engine/test/helpers.ts` build
  tables and stacked decks.
- **`packages/web/test/tokens.test.ts`** enforces the design system: every theme
  defines every token, contrast minimums hold, no raw colours or font sizes
  outside `tokens.css`, and no shadows, blurs or gradients.
- **Browser checks** are plain Node scripts in `packages/web/e2e/`, run with
  `npm run e2e:<name> --workspace @calliope/web` (`dealers-choice`,
  `draw-games`, `lobby-and-sharing`, `turn-notification`, `night-report`,
  `decks`, `controller`, `layout`). They take `BASE` (server URL), `OUT`
  (screenshot folder) and sometimes `SECONDS`.
- **Layout audit** (`e2e/layout-audit.mjs`) checks every game x table size x
  8 viewports, about 15 minutes. Narrow it with `VARIANTS`, `COUNTS` and
  `VIEWPORTS`. Results depend on random game state, so run the full matrix
  twice before trusting a pass.
- Rebuild the client before screenshots. Many e2e runs in a row trip the
  server's "too many new names" limit; restart the dev server to clear it.

### Headless Chrome on the maintainer's Windows machine

`channel: 'chrome'` fails here and Edge headless renders nothing. Pass
`EXE="C:/Program Files/Google/Chrome/Application/chrome.exe"`, which `controller`,
`decks`, `layout-audit`, `night-report` and `turn-notification` accept. For the
other scripts, copy to a `*.tmp.mjs`, swap `channel:` for
`executablePath: process.env.EXE`, run it, and delete the copy.

## Conventions

### Game engine

- Variants are plain `VariantDefinition` objects described street by street; the
  engine owns seating, forced bets, betting rounds, side pots, showdown and
  stats. Follow `docs/variants.md`, register the variant in
  `src/variants/index.ts` (that order is the lobby's order), and add a guide
  for it in `packages/web/src/guides.ts`.
- Every game type must keep working whenever the table or engine changes:
  hold'em, Omaha, Pineapple, Atomic Pineapple, Cincinnati, seven- and
  five-card stud, five-card draw, three-card poker, three-card draw, blind
  man's bluff.
- Never send a player cards they should not see (folded hands, other players'
  hole cards). Views are built per seat in `packages/engine/src/view.ts`.

### Settled rules decisions (don't re-ask)

- Wild cards are **anything goes**: a wild can stand for any card, even one
  already held. Double-ace flushes count, and five of a kind beats a straight
  flush.
- Jokers are dealt **only when jokers are wild**.
- The starter decks include **Classic Deck 54** (two jokers). Shipped decks must
  stay small (the 11 MB alternative was rejected for a 2 MB one).

### Client and design

- `docs/design.md` wins. Felt is the default theme; Paper & ink is the
  direction the system is named after. Refine it rather than inventing a new look.
- Use tokens from `styles/tokens.css`, never raw values.
- The player's own hand and their next decision are the loudest things on
  screen. Fold, check/call and bet/raise are never hidden behind a hover or
  an icon.
- A phone is a first-class seat. Table layout and card legibility come first:
  no overlapping seats, readable cards at every table size and viewport.
- Icons come from the in-house inline SVG set in `components/Icon.tsx`; don't
  add an icon library.
- Deck import follows the Open Playing Cards spec
  (github.com/bferg314/card-atelier, `docs/open-playing-cards.md`), including
  rank/suit badges when cards draw below about 60px.
- Everything a player can do at the table should also work from the keyboard
  (`keys.ts`) and a game controller (`gamepad.ts`, `padNav.ts`).

### Server and protocol

- Request and message shapes live in `packages/shared/src/protocol.ts` and are
  validated with zod on the server. Update `docs/protocol.md` when you change
  them.
- Sessions are a random token (cookie `calliope_session`, a bearer header, or
  `?token=`), so a future native app can connect. Identity is a name plus a
  five-word recovery phrase; there are no accounts.

## Git and pull requests

- Work on a branch, never directly on `main`.
- Commit messages are plain English sentences in the imperative, describing
  what changes for players, e.g. "Make it plain when it is your turn to draw"
  or "Fold the hand log away from its own head". No `feat:` prefixes. Explain
  the why in the body and reference issues ("Closes #62").
- **Commit locally and stop.** Don't push, open a PR or merge until the
  maintainer says so; they test changes locally first. When finishing, say
  which branch the work is on.
- Squash-merge when a large file must stay out of history.

### Spend CI sparingly

Every push to a PR and every merge to `main` runs the whole of CI: typecheck,
tests, the build, then a browser job with Postgres and Redis. That is about 13
minutes a run.

- **One PR per piece of work.** Keep the steps as separate commits on one
  branch. A stack of four PRs costs eight runs. Stack only when asked.
- **CI is not the test loop.** Run typecheck, the unit tests and the relevant
  e2e scripts locally, then push once. Batch follow-up fixes into one push.
- **Merge once the PR's run is green.** If a run fails, read the log and fix the
  cause; don't re-run it hoping for a pass.
- **Docs-only changes** (AGENTS.md, README, `docs/`) ride along with the next
  code PR unless the maintainer asks to ship them alone.
- Merging several PRs back to back starts a `main` run for each. Concurrency
  cancels the older `main` runs, but runs on the merged PRs keep going. List
  the leftovers (`gh run list --status in_progress`) for the maintainer to
  cancel; agents can't cancel runs.
- If a stack is unavoidable: `gh pr merge --delete-branch` on a lower PR closes
  the PR stacked on it. Run `gh pr edit <next> --base main` on every PR above
  it first.

## Environment gotchas (Windows)

- `.env*` files are blocked for agents, both reading and writing. Assume the
  maintainer keeps `.env.example` up to date and refer to it in docs. To check
  one value on the running stack: `docker compose exec app printenv PUBLIC_URL`.
- Kill a stale server by port (`netstat -ano | grep :3000`, then
  `taskkill //PID <pid> //F`). Never `taskkill /IM node.exe`, which takes the
  editor down with it.
- Very long shell commands (over about 8 KB) get cut off silently. Write source
  files with the file tools, not big heredocs.
- Docker Desktop may not be running. Start it and poll `docker info` before
  using compose.
