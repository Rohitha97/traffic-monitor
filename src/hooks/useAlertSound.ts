'use client';

import { useCallback, useEffect, useRef } from 'react';

import { useEventStore } from '@/store/useEventStore';

/*
 * The critical alert tone.
 *
 * Two notes, under 400ms, on a soft triangle wave with a gentle envelope —
 * an attention cue, not a startle. An operator hears this hundreds of times
 * across a 12-hour shift; anything sharp becomes something they learn to
 * resent, and resented alerts get muted permanently.
 *
 * Muted by default, and the choice persists. A page that makes noise before
 * consent is hostile, and browsers block audio before a user gesture anyway —
 * so the unmute click *is* the gesture that unlocks the AudioContext, which
 * makes the polite behaviour and the technically-required behaviour the same
 * thing.
 *
 * Never sound-only: the banner, the tab title, the favicon and the row all
 * carry the same alert. This is one channel among several, for an operator who
 * may be looking at a different monitor.
 */

const MUTE_KEY = 'incident-monitor:muted';

/** Two notes: a fifth apart, ascending. Recognisable without being an alarm. */
const NOTES = [
  { frequency: 587.33, startAt: 0, duration: 0.16 }, // D5
  { frequency: 880.0, startAt: 0.14, duration: 0.22 }, // A5
];

const PEAK_GAIN = 0.14;

export function useAlertSound(): { play: () => void } {
  const muted = useEventStore((state) => state.muted);
  const setMuted = useEventStore((state) => state.setMuted);
  const contextRef = useRef<AudioContext | null>(null);

  // Restore the persisted choice on mount rather than during render, so the
  // server-rendered markup and the first client render agree.
  useEffect(() => {
    const stored = window.localStorage.getItem(MUTE_KEY);
    if (stored !== null) setMuted(stored === 'true');
  }, [setMuted]);

  useEffect(() => {
    window.localStorage.setItem(MUTE_KEY, String(muted));
  }, [muted]);

  useEffect(() => {
    const context = contextRef.current;
    return () => {
      void context?.close();
    };
  }, []);

  const play = useCallback(() => {
    if (muted) return;

    try {
      contextRef.current ??= new AudioContext();
      const context = contextRef.current;
      // Safari suspends the context when the tab is backgrounded, which is
      // precisely when this alert matters most.
      if (context.state === 'suspended') void context.resume();

      const now = context.currentTime;
      for (const note of NOTES) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();

        oscillator.type = 'triangle';
        oscillator.frequency.value = note.frequency;

        // A ramped envelope rather than a hard gate: an abrupt start is what
        // makes a tone startling, and it also clicks.
        const start = now + note.startAt;
        const end = start + note.duration;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(PEAK_GAIN, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(end);
      }
    } catch {
      // Audio is one channel of several. If it is unavailable — no device, a
      // policy block, an exhausted context — the banner, tab title, favicon
      // and row still carry the alert, so this fails quietly by design.
    }
  }, [muted]);

  return { play };
}
