/**
 * The turn bell.
 *
 * Synthesised rather than shipped as a sound file: a struck bar or chip is a
 * handful of decaying sine partials, which costs a few lines here and nothing
 * to download.
 * It also means the bell inherits no room tone from a recording, which matters
 * when eight phones around one kitchen table may ring within a second of
 * each other.
 *
 * The sounds follow what makes an alert noticeable without grating: a quick
 * strike that decays rather than a held tone (Sreetharan, Schlesinger & Schutz,
 * 2021), an instrument's timbre rather than a bare sine, and little energy up
 * around 2.5-4 kHz, where the ear is most sensitive and a tone turns piercing.
 *
 * Whether it rings, and which sound, are stored per device in `localStorage`,
 * like the theme.
 */

const KEY = 'calliope.bell';
const SOUND_KEY = 'calliope.bellSound';

export const BELL_SOUNDS = ['marimba', 'chime', 'chip'] as const;
export type BellSound = (typeof BELL_SOUNDS)[number];

export const BELL_SOUND_LABEL: Record<BellSound, string> = {
  marimba: 'Marimba',
  chime: 'Soft chime',
  chip: 'Chip clink',
};

/** One partial of a note: [ratio to the note, level, seconds to silence]. */
type Partial = readonly [number, number, number];

interface Voice {
  /** Overall level; the quicker a voice dies, the higher it can sit. */
  peak: number;
  /** Rolls off whatever the partials leave up where the ear is sharpest. */
  lowpass: number | null;
  /** Seconds to full level. A few ms reads as struck; zero clicks. */
  attack: number;
  partials: readonly Partial[];
  /** [frequency, seconds after the first note]. */
  notes: readonly (readonly [number, number])[];
}

const VOICES: Record<BellSound, Voice> = {
  // Two wooden bars a fourth apart, E5 then A5. The knock at 4x is what catches
  // the ear, and it is gone in 80ms; the rising pair reads as "your turn?".
  marimba: {
    peak: 0.3,
    lowpass: 4500,
    attack: 0.003,
    partials: [[1, 1, 0.6], [3.99, 0.3, 0.08], [9.9, 0.05, 0.03]],
    notes: [[659.25, 0], [880, 0.13]],
  },
  // D5 then G5, rounded at the start and rolled off above 3 kHz: the gentlest,
  // for a quiet room.
  chime: {
    peak: 0.2,
    lowpass: 3000,
    attack: 0.012,
    partials: [[1, 1, 1.0], [2, 0.25, 0.45], [3, 0.08, 0.2]],
    notes: [[587.33, 0], [783.99, 0.16]],
  },
  // Two clay chips tapped together: short and inharmonic, over in a tenth of a second.
  chip: {
    peak: 0.14,
    lowpass: null,
    attack: 0.001,
    partials: [[1, 0.5, 0.12], [1.52, 0.35, 0.08], [2.22, 0.2, 0.05]],
    notes: [[2350, 0], [2480, 0.07]],
  },
};

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

/** The chosen sound; the marimba unless the player picked another. */
export function bellSound(): BellSound {
  try {
    const s = localStorage.getItem(SOUND_KEY);
    return (BELL_SOUNDS as readonly string[]).includes(s ?? '') ? (s as BellSound) : 'marimba';
  } catch {
    return 'marimba'; // private mode
  }
}

export function setBellSound(sound: BellSound): void {
  try {
    localStorage.setItem(SOUND_KEY, sound);
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
 * Ring once, with the chosen sound unless another is named. Does nothing if
 * the bell is off, or if the browser has not let us make a sound yet.
 */
export function ringBell(sound: BellSound = bellSound()): void {
  if (!bellOn()) return;
  const c = context();
  if (!c) return;
  if (c.state === 'running') {
    strike(c, sound);
    return;
  }
  // Switching the bell on is itself the gesture that unlocks audio, so the
  // confirming ring can resume the context first and still be heard. Away from
  // a gesture this resolves to nothing, which is the right answer too.
  c.resume().then(
    () => {
      if (c.state === 'running') strike(c, sound);
    },
    () => {
      /* still locked */
    },
  );
}

/** Play every note of a voice: each a handful of sine partials, struck and left to decay. */
function strike(c: AudioContext, sound: BellSound): void {
  const voice = VOICES[sound];
  const t0 = c.currentTime;
  const out = c.createGain();
  out.gain.value = voice.peak;
  let tail: AudioNode = out;
  if (voice.lowpass !== null) {
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = voice.lowpass;
    filter.Q.value = 0.5;
    tail = out.connect(filter);
  }
  tail.connect(c.destination);

  let last = 0;
  for (const [note, offset] of voice.notes) {
    const t = t0 + offset;
    for (const [ratio, level, decay] of voice.partials) {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sine';
      osc.frequency.value = note * ratio;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(level, t + voice.attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      osc.connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + decay);
      last = Math.max(last, offset + decay);
    }
  }

  // Oscillators free themselves when they stop; the gain and filter they share do not.
  window.setTimeout(() => { out.disconnect(); if (tail !== out) tail.disconnect(); }, (last + 0.2) * 1000);
}
