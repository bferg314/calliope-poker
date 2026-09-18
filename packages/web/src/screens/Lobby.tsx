import { useState } from 'react';
import { BOT_PERSONALITIES, type RoomView } from '@calliope/shared';
import { GameStrip } from '../components/GameStrip.js';
import { useConfirm } from '../components/Modal.js';
import { TopBar } from '../components/TopBar.js';
import { Toast } from '../components/Toast.js';
import { fmt } from '../format.js';
import type { RoomSocket } from '../ws.js';
import { personalityLabel, Settings } from './Settings.js';

export function Lobby({ room, socket }: { room: RoomView; socket: RoomSocket }): JSX.Element {
  const me = room.me;
  const confirm = useConfirm();
  const isHost = !!me?.isHost;
  const [copied, setCopied] = useState(false);
  const [botMenu, setBotMenu] = useState<number | null>(null);
  const seated = room.table.seats.filter(Boolean).length;
  const withChips = room.table.seats.filter((s) => s && s.stack > 0).length;

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(room.joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

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
            <button
              className="btn btn-red"
              style={{ minHeight: 56 }}
              disabled={withChips < 2}
              onClick={() => socket.send({ type: 'host', command: { kind: 'start' } })}
              title={withChips < 2 ? 'Two players with chips are needed' : undefined}
            >
              Deal the first hand
            </button>
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
              <div className="code-big">{room.code}</div>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" readOnly value={room.joinUrl} onFocus={(e) => e.currentTarget.select()} aria-label="Join link" />
                <button className="btn" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
              </div>
              {room.hasPassword && <div className="micro">This table has a password. Tell people in person.</div>}
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
              onSave={(patch) => socket.send({ type: 'host', command: { kind: 'set-settings', settings: patch } })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
