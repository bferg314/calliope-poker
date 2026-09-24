import { useCallback, useState } from 'react';
import { BOT_PERSONALITIES, type RoomView } from '@calliope/shared';
import { GameStrip } from '../components/GameStrip.js';
import { Invite } from '../components/Invite.js';
import { useConfirm } from '../components/Modal.js';
import { TopBar } from '../components/TopBar.js';
import { Toast } from '../components/Toast.js';
import { fmt } from '../format.js';
import { useRouter } from '../router.js';
import type { RoomSocket } from '../ws.js';
import { personalityLabel, Settings } from './Settings.js';

export function Lobby({ room, socket }: { room: RoomView; socket: RoomSocket }): JSX.Element {
  const me = room.me;
  const confirm = useConfirm();
  const { navigate } = useRouter();
  const isHost = !!me?.isHost;
  const [botMenu, setBotMenu] = useState<number | null>(null);
  const [settingsDirty, setSettingsDirty] = useState(false);
  // Stable, so the effect in Settings that reports it does not loop.
  const onDirtyChange = useCallback((dirty: boolean) => setSettingsDirty(dirty), []);
  const seated = room.table.seats.filter(Boolean).length;
  const withChips = room.table.seats.filter((s) => s && s.stack > 0).length;

  return (
    <div className="page">
      <TopBar right={<span className="room-code smallcaps">{room.code}</span>} />
      <Toast text={socket.error?.message ?? null} />
      <div className="stack" style={{ paddingTop: 'var(--s-4)' }}>
        <div className="row row-between">
          <div>
            <div className="label">the lobby</div>
            <h1>{room.name}</h1>
          </div>
          {isHost && (
            <div className="stack" style={{ gap: 'var(--s-2)', alignItems: 'flex-end' }}>
              <button
                className="btn btn-red"
                style={{ minHeight: 56 }}
                disabled={withChips < 2 || settingsDirty}
                onClick={() => socket.send({ type: 'host', command: { kind: 'start' } })}
              >
                Deal the first hand
              </button>
              {settingsDirty ? (
                <span className="micro">Save the settings first, from the bar below.</span>
              ) : withChips < 2 ? (
                <span className="micro">Two players with chips are needed.</span>
              ) : null}
            </div>
          )}
        </div>

        <div className="lobby-layout">
          <div className="stack">
            <div className="row row-between">
              <span className="label">seats · {seated} of {room.table.seats.length}</span>
              {me && me.seat !== null && (
                <button className="btn btn-quiet btn-small" onClick={() => socket.send({ type: 'stand' })}>stand up</button>
              )}
            </div>
            <div className="seat-grid">
              {room.table.seats.map((s, i) => {
                if (!s) {
                  return (
                    <div key={i} className="seat-slot open" style={{ position: 'relative' }}>
                      {me && me.seat === null ? (
                        <button className="btn btn-small" onClick={() => socket.send({ type: 'sit', seat: i })}>
                          sit here
                        </button>
                      ) : (
                        <span className="smallcaps">open</span>
                      )}
                      {isHost && (
                        <>
                          <button className="btn btn-quiet btn-small" onClick={() => setBotMenu(botMenu === i ? null : i)}>+ bot</button>
                          {botMenu === i && (
                            <div className="menu" style={{ left: 0, right: 'auto' }}>
                              <div className="menu-head label">bot style</div>
                              {BOT_PERSONALITIES.map((p) => (
                                <button key={p} className="btn" onClick={() => { socket.send({ type: 'host', command: { kind: 'add-bot', seat: i, personality: p } }); setBotMenu(null); }}>
                                  {personalityLabel(p)}
                                </button>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                }
                const member = room.members.find((m) => m.id === s.playerId);
                return (
                  <div key={i} className="seat-slot">
                    <div className="row row-between" style={{ gap: 4 }}>
                      <span className="name">{s.name}</span>
                      {member?.isHost && <span className="host-mark">host</span>}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`status-dot ${member?.connected ? 'on' : ''}`} />
                      <span className="micro">{s.kind === 'bot' ? 'bot' : member?.connected ? 'here' : 'away'}</span>
                    </div>
                    <div className="num">{fmt(s.stack)} chips</div>
                    {isHost && s.playerId !== room.hostId && (
                      <button
                        className="btn btn-quiet btn-small"
                        style={{ alignSelf: 'flex-start' }}
                        onClick={() => void (async () => {
                          if (await confirm({
                            title: `Remove ${s.name}?`,
                            body: <p>Their {fmt(s.stack)} chips come off the table and the seat opens up.</p>,
                            confirmLabel: 'Remove',
                            tone: 'danger',
                          })) socket.send({ type: 'host', command: { kind: 'remove-player', playerId: s.playerId } });
                        })()}
                      >
                        remove
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {me && me.seat === null && <p className="micro">Pick an open seat. Each seat starts with a buy-in of {fmt(room.settings.chips.buyInChips)} chips.</p>}

            <div className="panel stack">
              <div className="label">invite</div>
              <Invite code={room.code} joinUrl={room.joinUrl} hasPassword={room.hasPassword} />
            </div>

            <div className="stack">
              <div className="label">who's here</div>
              <ul className="history-list">
                {room.members.map((m) => (
                  <li key={m.id} className="row">
                    <span className={`status-dot ${m.connected ? 'on' : ''}`} />
                    <span>{m.name}</span>
                    {m.isHost && <span className="host-mark">host</span>}
                    {m.seat === null && <span className="micro">watching</span>}
                    {isHost && m.kind === 'human' && !m.isHost && (
                      <button
                        className="btn btn-quiet btn-small"
                        onClick={() => void (async () => {
                          if (await confirm({
                            title: `Make ${m.name} the host?`,
                            body: <p>They take over the settings, the bots and the end of the night. You cannot take it back yourself.</p>,
                            confirmLabel: 'Hand it over',
                            tone: 'danger',
                          })) socket.send({ type: 'host', command: { kind: 'transfer-host', playerId: m.id } });
                        })()}
                      >
                        make host
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="stack">
            <div className="label">the game</div>
            <GameStrip room={room} />
            <Settings
              settings={room.settings}
              variants={room.variants}
              editable={isHost}
              onDirtyChange={onDirtyChange}
              onSave={(patch) => socket.send({ type: 'host', command: { kind: 'set-settings', settings: patch } })}
            />
          </div>
        </div>
      </div>

      {isHost && (
        <div className="settings-section" style={{ marginTop: 'var(--s-5)' }}>
          <button
            className="btn btn-quiet btn-small"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => void (async () => {
              if (await confirm({
                title: 'Cancel this table?',
                body: (
                  <p>
                    It disappears for everyone, including the {room.members.length === 1 ? 'nobody' : 'people'} waiting in it.
                    Nothing has been dealt, so nobody is out of pocket. This cannot be undone.
                  </p>
                ),
                confirmLabel: 'Cancel the table',
                cancelLabel: 'Keep it',
                tone: 'danger',
              })) {
                socket.send({ type: 'host', command: { kind: 'cancel-room' } });
                // Leave straight away, so only the other players see the notice.
                navigate('/');
              }
            })()}
          >
            Cancel this table
          </button>
          <p className="micro" style={{ margin: 0 }}>
            Only possible before the first hand. Once you are playing, use "End the night" instead.
          </p>
        </div>
      )}
    </div>
  );
}
