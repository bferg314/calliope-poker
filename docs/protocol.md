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

`joinUrl`, here and in `RoomView`, is relative (`/r/CODE`) unless the operator set `PUBLIC_URL`. A self-hosted server cannot know whether people reach it by LAN address, hostname or proxy, so it declines to guess and the client resolves the link against the address it is already on.
| GET | `/api/rooms/:code` | | public info for the join screen |
| POST | `/api/rooms/:code/join` | `{ password? }` | `{ ok }` |
| GET | `/api/rooms/:code/report` | | the night report once the night has ended |
| GET | `/api/health` | | `{ ok, rooms }` |
| GET | `/api/instance` | | `{ restricted, limits }`, see below. No auth |
| POST | `/api/auth/claim-host` | `{ key }` | `{ user }` with `serverRole` `'owner'` (HOST_KEY) or `'admin'` (an admin key). 403 on a wrong key, 429 after 10 tries / 15 min |
| GET | `/api/server` | | `{ owned, policy, tables }`. Owner or admin |
| PUT | `/api/server/policy` | `InstancePolicy` | `{ policy }`, applied at once. Owner or admin |
| POST | `/api/server/rooms/:code/close` | | `{ ok }`. Owner or admin |
| POST | `/api/server/close-empty` | | `{ closed }`. Closes every table nobody has open. Owner or admin |
| GET | `/api/server/admins` | | `{ keys }`, never the keys themselves. Owner only |
| POST | `/api/server/admins` | `{ label }` | `{ id, key }`. The only time the key is sent. Owner only |
| DELETE | `/api/server/admins/:id` | | `{ ok }`. Revokes one key. Owner only |
| DELETE | `/api/server/admins` | | `{ revoked }`. Revokes every key. Owner only |

Errors are `{ error: { code, message } }` with a 4xx/5xx status. `message` is safe to show to players.

## Who may open a table

A user's `serverRole` is `'owner'` once they have entered `HOST_KEY`, `'admin'`
once they have entered a live admin key, and `null` otherwise. The owner role is
stored as a fingerprint of the key, so changing `HOST_KEY` revokes it; an admin
key can be revoked from the Server page. Both follow the identity to a new
device once the five-word ticket is used to recover the name.

Without `HOST_KEY` anyone may open a table and there are no limits. With it, the
`InstancePolicy` decides (`packages/shared/src/policy.ts`):

- `openTo: 'hosts'` (the default): `POST /api/rooms` returns 403 `not-allowed`
  unless the caller has a `serverRole`.
- `openTo: 'anyone'`: anyone may, but a table opened without a role is *public*
  and counts against the limits. Refusals are 429 `server-full`,
  `too-many-tables` (per identity or per address) or `too-fast`.

Public tables expire `maxTableMinutes` after they were opened. `RoomView.serverLimit`
carries `{ expiresAt }` so the client can warn. At that point a lobby is cancelled
(clients get the fatal error `closed`); a night in progress gets the error
`closing`, plays out its hand and ends normally. Idle lobbies and tables with
nobody connected are closed the same way. `abandonedHours` applies to every
table, exempt or not: one nobody has had open for that long is closed too.

Nothing else is restricted. Anyone may still create an identity, join a room by
code or link, take a seat and play. `GET /api/instance` returns `restricted`
(only the owner and admins may open tables) and, on a public server, `limits`
(`maxTables`, `inUse`, `maxTableMinutes`, `maxTablesPerPerson`) so the client can
show how busy it is before offering a "new table" button. The interface is a
convenience: the check that matters is on the server.

Finished rooms are dropped from memory and Redis six hours after they end. A
socket still open gets the fatal error `no-room`, and the client falls back to
`GET /api/rooms/:code/report`, which reads Postgres. Room codes are never reused.

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

Host commands: `start`, `pause`, `deal`, `set-settings { settings }`, `add-bot { seat, personality? }`, `remove-player { playerId }`, `extend { minutes }`, `end-night`, `cancel-room`, `transfer-host { playerId }`, `rename-room { name }`. `deal` starts one hand when the room is not dealing automatically.

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

There is one way out that is not `ended`: `cancel-room` throws the table away
before any hand is dealt. It is refused in every other phase with
`already-started`, because a night that dealt cards owes its players a report,
which is what `end-night` produces.

Cancelling deletes the Redis snapshot first and only then drops the room from
memory, so a table cannot come back on the next restart. If Redis refuses the
delete the room is left completely intact and the host gets `cancel-failed` and
can try again. Postgres keeps the row and stamps `cancelled_at`; nothing is
deleted there, so no future change to the phase rule can erase a played night.

Everyone connected is sent `{ type: 'error', code: 'cancelled' }` and then
closed with **4005**, alongside the existing **4004** for a room that is not
there. Players who were offline at the time never see that frame; they come back
through a link or the resume banner, get a 404 from `GET /api/rooms/:code`, and
land on the "no table here" screen.
