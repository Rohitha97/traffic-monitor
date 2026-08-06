'use client';

import { useEffect, useRef } from 'react';

/*
 * The alert channel for an operator who is looking at another monitor.
 *
 * A control-room position runs one to three screens. The banner, the tone and
 * the row all assume this window is being looked at; the tab title and the
 * favicon are the two signals that survive when it is not. Both are set from
 * the same state, so they cannot disagree.
 *
 * Copy is Pass C's, verbatim: "(1) CRITICAL · Incident Monitor" against the
 * resting "Incident Monitor — Sector 4". (Pass C frame 2, live replay)
 */

const RESTING_TITLE = 'Incident Monitor — Sector 4';
const FAVICON_SIZE = 32;

/**
 * Canvas needs literal colours, so they are read back out of the token layer
 * at draw time rather than duplicated here. The favicon then follows the theme
 * instead of drifting from it — and the adherence lint stays satisfied, which
 * is how this got written: it flagged the three hard-coded hexes.
 */
function token(name: string): string {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function drawFavicon(critical: boolean): string | null {
  const ground = token('--color-ground');
  const accent = token(critical ? '--color-critical' : '--color-live');
  // No fallback literals: if the tokens cannot be read, leave the existing
  // favicon alone rather than invent a colour outside the system.
  if (!ground || !accent) return null;

  const canvas = document.createElement('canvas');
  canvas.width = FAVICON_SIZE;
  canvas.height = FAVICON_SIZE;
  const context = canvas.getContext('2d');
  if (!context) return null;

  context.fillStyle = ground;
  context.beginPath();
  context.roundRect(0, 0, FAVICON_SIZE, FAVICON_SIZE, 6);
  context.fill();

  context.fillStyle = accent;
  if (critical) {
    // The same triangle the priority glyph uses — the favicon speaks the
    // design's own vocabulary rather than inventing a badge.
    context.beginPath();
    context.moveTo(16, 6);
    context.lineTo(28, 26);
    context.lineTo(4, 26);
    context.closePath();
    context.fill();
  } else {
    context.beginPath();
    context.arc(16, 16, 6, 0, Math.PI * 2);
    context.fill();
  }

  return canvas.toDataURL('image/png');
}

interface TabAlertOptions {
  /** Unacknowledged criticals. Zero returns the tab to rest. */
  criticalCount: number;
  /** What the newest critical is, for the title. */
  summary?: string | undefined;
}

export function useTabAlert({ criticalCount, summary }: TabAlertOptions): void {
  const linkRef = useRef<HTMLLinkElement | null>(null);

  useEffect(() => {
    const alerting = criticalCount > 0;

    document.title = alerting
      ? `(${criticalCount}) CRITICAL · Incident Monitor`
      : RESTING_TITLE;

    if (!linkRef.current) {
      const existing =
        document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      const link = existing ?? document.createElement('link');
      link.rel = 'icon';
      if (!existing) document.head.appendChild(link);
      linkRef.current = link;
    }

    const dataUrl = drawFavicon(alerting);
    if (dataUrl) linkRef.current.href = dataUrl;
  }, [criticalCount, summary]);

  // Leave the tab as we found it, so a stale "(1) CRITICAL" cannot outlive the
  // incident that caused it.
  useEffect(() => {
    return () => {
      document.title = RESTING_TITLE;
    };
  }, []);
}
