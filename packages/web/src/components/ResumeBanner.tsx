import { useCallback, useEffect, useState } from 'react';
import type { ActiveRoom } from '@calliope/shared';
import { api } from '../api.js';
import { fmt } from '../format.js';
import { useRouter } from '../router.js';

const POLL_MS = 10_000;

function line(room: ActiveRoom): { headline: string; detail: string; urgent: boolean } {
  const urgent = room.isYourTurn || room.isYourChoice;
  const headline = room.isYourTurn
    ? "It's your turn"
    : room.isYourChoice
      ? 'Your deal. Pick the game'
      : room.seat === null
        ? `Watching ${room.name}`
        : `Back to ${room.name}`;
  const bits: string[] = [];
  if (room.seat !== null) bits.push(`${fmt(room.stack)} chips`);
  bits.push(`${room.seated} at the table`);
  if (room.phase === 'lobby') bits.push('not started');
  else if (room.phase === 'paused') bits.push('paused');
  else if (room.phase === 'final-hand') bits.push('last hand');
  else if (room.handCount > 0) bits.push(`hand ${room.handCount}`);
  return { headline, detail: `${room.code} · ${bits.join(' · ')}`, urgent };
}

/**
 * The way back to a game in progress. Sits at the top of the landing and profile
 * pages, and turns red when the table is waiting on this player.
 */
export function ResumeBanner(): JSX.Element | null {
  const { navigate } = useRouter();
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);

  const load = useCallback(() => {
    api<{ rooms: ActiveRoom[] }>('GET', '/api/me/rooms')
      .then((r) => setRooms(r.rooms))
      .catch(() => setRooms([]));
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = (): void => load();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  if (rooms.length === 0) return null;
  return (
    <div className="resume">
      {rooms.map((room) => {
        const { headline, detail, urgent } = line(room);
        const classes = ['resume-card', urgent && 'urgent', room.seat === null && 'watching'].filter(Boolean).join(' ');
        return (
          <a
            key={room.code}
            href={`/r/${room.code}`}
            className={classes}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              e.preventDefault();
              navigate(`/r/${room.code}`);
            }}
          >
            <span className="what">
              <span className="headline">{headline}</span>
              <span className="detail">{detail}</span>
            </span>
            <span className="go">{urgent ? 'go' : 'back to the table'}</span>
          </a>
        );
      })}
    </div>
  );
}
