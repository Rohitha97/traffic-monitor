'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { formatTimestamp } from '@/lib/format';

import {
  isDismissReason,
  type Camera,
  type EventType,
  type LanePosition,
  type Priority,
  type Status,
} from '@/lib/schema';

/*
 * The shared vocabulary, resolved once per locale.
 *
 * `domain` is its own namespace because event types, lane positions, priority
 * levels and dismissal reasons are *terms*, not copy — the same word appears on
 * a row, in the detail pane, in the audit trail and in a dialog, and it has to
 * be the same word in all four. Duplicating them per component is how a queue
 * ends up saying 落下物 where the detail pane says 障害物.
 *
 * Passed into the view mappers rather than reached for inside them. Those
 * modules are pure by design — `src/lib/incident.ts` exists so the mapping is
 * testable and so no component can invent a label — and a hook call inside them
 * would make them React-only and locale-implicit. This keeps the locale an
 * argument, which is also what lets one test render both languages.
 */

export interface DomainLabels {
  eventType(type: EventType): string;
  lanePosition(position: LanePosition): string;
  priority(priority: Priority): string;
  status(status: Status): string;
  direction(direction: Camera['direction']): string;
  dismissReason(reason: string): string;
  /** The label, never the value: "キロポスト" against an untranslated "MM 42.3". */
  marker(): string;

  /*
   * Units and formatted values.
   *
   * Here rather than in a separate formatter because a unit *is* vocabulary in
   * Japanese: 秒 and 分 are suffixes in the same family as the 件 and 台
   * counters, and splitting "the words" from "the numbers" would put two halves
   * of one sentence in two places.
   *
   * The digits themselves stay Western Arabic in both locales — Japanese
   * technical interfaces do not use kanji numerals, and the tabular face the
   * counters set in has no glyphs for them.
   */
  latency(seconds: number): string;
  eta(minutes: number): string;
  dispatchLine(unit: string, minutes: number): string;
  /** "02:14:07". Identical in both conventions, but locale-driven regardless. */
  time(iso: string): string;
  facts: {
    location: string;
    marker: string;
    latency: string;
    confidence: string;
  };
}

export function useDomainLabels(): DomainLabels {
  const t = useTranslations('domain');
  const locale = useLocale();

  /*
   * Memoised on the translator. These are read once per row per render across
   * a queue that ticks every second, so rebuilding the object each time would
   * hand every consumer a new identity sixty times a minute for no reason.
   */
  return useMemo<DomainLabels>(
    () => ({
      eventType: (type) => t(`eventType.${type}`),
      lanePosition: (position) => t(`lanePosition.${position}`),
      priority: (priority) => t(`priority.${priority}`),
      status: (status) => t(`status.${status}`),
      direction: (direction) => t(`direction.${direction}`),
      /*
       * Tolerant of an unknown key rather than throwing. A reason is read back
       * off an event that may predate a change to the list, and a queue row is
       * the wrong place to discover a key was renamed — an incident labelled
       * with its raw key is far better than one that cannot render at all.
       */
      dismissReason: (reason) =>
        isDismissReason(reason) ? t(`dismissReason.${reason}`) : reason,
      marker: () => t('marker'),

      latency: (seconds) => t('latency', { seconds: seconds.toFixed(1) }),
      eta: (minutes) => t('eta', { minutes }),
      dispatchLine: (unit, minutes) =>
        t('dispatchLine', { unit, eta: t('eta', { minutes }) }),
      time: (iso) => formatTimestamp(iso, locale),
      facts: {
        location: t('facts.location'),
        marker: t('facts.marker'),
        latency: t('facts.latency'),
        confidence: t('facts.confidence'),
      },
    }),
    [t, locale],
  );
}
