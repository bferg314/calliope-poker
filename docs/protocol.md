# Protocol

The web client and any future app talk to the server over a small HTTP API and one websocket per room. Schemas live in `packages/shared/src/` and are enforced with zod on the server.

## Authentication

A session is a random token. The browser gets it as an httpOnly cookie `calliope_session`; it is also returned in the JSON body of `POST /api/auth/new` and `POST /api/auth/recover` so a native app can send it as `Authorization: Bearer <token>`. Websocket connections accept the cookie, the bearer header, or `?token=` in the URL.

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/new` | `{ name? }` | `{ user, phrase: string[5], token }` |
| POST | `/api/auth/recover` | `{ name, phrase: string[5] }` | `{ user, token }` (429 after 10 attempts / 15 min) |
| POST | `/api/auth/logout` | | `{ ok }` |
| GET | `/api/me` | | `{ user }` |
| PATCH | `/api/me` | `{ name }` | `{ user }` |
| POST | `/api/me/phrase` | `{ phrase? }` | `{ phrase }` (random when omitted) |
| GET | `/api/me/rooms` | | rooms the player is still part of, for the "back to your game" banner |
| GET | `/api/stats/me` | | lifetime stats and past nights |
| GET | `/api/variants` | | the registered poker variants |
| POST | `/api/rooms` | `{ name?, password?, settings? }` | `{ code, joinUrl }` |
| GET | `/api/rooms/:code` | | public info for the join screen |
| POST | `/api/rooms/:code/join` | `{ password? }` | `{ ok }` |
| GET | `/api/rooms/:code/report` | | the night report once the night has ended |
| GET | `/api/health` | | `{ ok, rooms }` |
| GET | `/api/instance` | | `{ restricted }` — whether opening a table needs the host key. No auth |
| POST | `/api/auth/claim-host` | `{ key }` | `{ user }` with `canOpenTables: true` (403 on a wrong key, 429 after 10 tries / 15 min) |

Errors are `{ error: { code, message } }` with a 4xx/5xx status. `message` is safe to show to players.

## Who may open a table

When the server is started with `HOST_KEY` set, `POST /api/rooms` returns 403
`not-allowed` unless the caller's identity has claimed that key through
`POST /api/auth/claim-host`. The permission is stored on the identity, so it
survives a new device once the five-word ticket is used to recover the name.

Nothing else is restricted. Anyone may still create an identity, join a room by
code or link, take a seat and play. `GET /api/instance` lets a client find out
which kind of server it is talking to before showing a "new table" button, but
the interface is a convenience: the check that matters is on the server.

## Websocket `/ws/rooms/:code`

Only members (who have called `join`) can connect. The server sends a full `snapshot` after every change; there are no partial patches. Snapshots are redacted per viewer: the deck is never sent and other players' face-down cards arrive as `null` until they are revealed.

### Client → server (`clientMessageSchema`)

```
{ type: 'action', action: { type: 'fold' | 'check' | 'call' } | { type: 'bet' | 'raise', to } }
{ type: 'choose-variant', variantId }          // dealer's choice, when it is your deal
{ type: 'sit', seat }                          // takes a buy-in from the room settings
{ type: 'stand' }                              // chips come off the table
{ type: 'sit-out', out: boolean }
{ type: 'rebuy' }
{ type: 'host', command }                      // host only, see below
{ type: 'ping' }
```

Host commands: `start`, `pause`, `deal`, `set-settings { settings }`, `add-bot { seat, personality? }`, `remove-player { playerId }`, `extend { minutes }`, `end-night`, `transfer-host { playerId }`, `rename-room { name }`. `deal` starts one hand when the room is not dealing automatically.

### Server → client

```
{ type: 'snapshot', room: RoomView }
{ type: 'error', code, message }
{ type: 'pong', now }
```

`RoomView` (see `packages/shared/src/protocol.ts`) carries the room phase, settings, the redacted table, the viewer's own status (`me`), members and their connection state, the buy-in ledger, the night clock, the current level, the current action deadline, the last settled hand, and the night report once the night has ended.

### The clock

The night is measured in **playing time**, not wall time, so a pause does not burn it away. `clock.remainingMs` holds its value while the room is paused and `clock.running` says whether it is ticking; `clock.endsAt` is a wall-time deadline that is `null` while paused. Clients should count down from `endsAt` when running and show the frozen `remainingMs` when not.

### Levels

`level` reports the stakes in play (`stakes`), what comes next (`next`, `null` at the top of the ladder), and how much is left before the change as either `msUntilNext` / `nextAt` (time cadence) or `handsUntilNext` (hands cadence). `rising` is false when the schedule is off and `frozen` is true while paused.

Stakes only ever change **between hands**. The ladder is generated from the room's base stakes with `levelLadder()` in `@calliope/shared`, the same pure function the server uses, so a client preview cannot disagree with what actually gets dealt.

Bet and raise amounts are "to" totals for the street, the same numbers `legalActions()` from `@calliope/engine` produces. Clients should compute legal actions locally with that function and the snapshot; the server validates every action with the same code.

## Room phases

`lobby → playing ⇄ paused → final-hand → ended`. `final-hand` is entered when the clock runs out or the host ends the night mid-hand; the hand in progress is the last one. `extend` moves it back to `playing`.
