/**
 * The turn bell.
 *
 * Synthesised rather than shipped as a sound file: a struck bell is a handful of
 * decaying sine partials, which costs a few lines here and nothing to download.
 * It also means the bell inherits no room tone from a recording, which matters
 * when eight phones around one kitchen table may ring within a second of
 * each other.
 *
 * Stored per device in `localStorage`, like the theme.
 */

const KEY = 'calliope.bell';

/** The partials of one strike: [frequency, level, seconds to silence]. */
const PARTIALS: readonly (readonly [number, number, number])[] = [
  [880, 1, 1.5],
  [1320, 0.42, 0.85],
  [2640, 0.14, 0.4],
];

const PEAK = 0.16;

let ctx: AudioContext | null = null;

/** True unless the player has turned the bell off. Silence is opt-in. */
export function bellOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== '0';
  } catch {
    return true; // private mode
  }
}

export function setBellOn(on: boolean): void {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* private mode: the choice lasts this session only */
  }
}

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
  } catch {
    return null; // no audio device, or the browser refused one
  }
  return ctx;
}

/**
 * Browsers hold a fresh AudioContext suspended until the page has been touched,
 * so the first gesture anywhere resumes it. Without this the first bell of the
 * night — the one that matters most, because nobody is watching the table
 * yet — would be silent. Called once for the life of the page.
 */
export function armBell(): void {
  const events = ['pointerdown', 'keydown', 'touchend'] as const;
  const onGesture = (): void => {
    if (!bellOn()) return; // keep listening; the player may switch it on later
    const c = context();
    if (!c) {
      stop();
      return;
    }
    c.resume().then(
      () => {
        if (c.state === 'running') stop();
      },
      () => {
        /* this gesture was not enough; the next one may be */
      },
    );
  };
  const stop = (): void => {
    for (const e of events) window.removeEventListener(e, onGesture);
  };
  for (const e of events) window.addEventListener(e, onGesture, { passive: true });
}

/**
 * Ring once. Does nothing if the bell is off, or if the browser has not let us
 * make a sound yet.
 */
export function ringBell(): void {
  if (!bellOn()) return;
  const c = context();
  if (!c) return;
  if (c.state === 'running') {
    strike(c);
    return;
  }
  // Switching the bell on is itself the gesture that unlocks audio, so the
  // confirming ring can resume the context first and still be heard. Away from
  // a gesture this resolves to nothing, which is the right answer too.
  c.resume().then(
    () => {
      if (c.state === 'running') strike(c);
    },
    () => {
      /* still locked */
    },
  );
}

/**
 * A hand bell's hum and strike: the upper partials are near-octaves above the
 * fundamental and die first, which is what reads as struck metal rather than
 * a beep.
 */
function strike(c: AudioContext): void {
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = PEAK;
  out.connect(c.destination);

  let last = 0;
  for (const [freq, level, decay] of PARTIALS) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // The strike is 4ms, not instant: a hard step on a sine clicks.
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + decay);
    last = Math.max(last, decay);
  }

  // Oscillators free themselves when they stop; the gain they share does not.
  window.setTimeout(() => out.disconnect(), (last + 0.2) * 1000);
}
