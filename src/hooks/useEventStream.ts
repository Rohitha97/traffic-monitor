'use client';

import { useEffect, useRef } from 'react';

import { z } from 'zod';

import { detectionEventSchema } from '@/lib/schema';
import { useEventStore } from '@/store/useEventStore';

/*
 * The SSE connection, and the trust state that comes with it.
 *
 * EventSource reconnects on its own, but its default cadence is immediate and
 * relentless — against a server that is actually down that is a retry storm.
 * So the native retry is disabled by closing the socket on error and
 * reconnecting on our own exponential backoff, and the connection state the
 * operator sees is driven from the same place.
 *
 * Events are validated on arrival. The stream is our own route handler, so this
 * is belt-and-braces — but a malformed event that reaches the store would
 * corrupt a queue the operator is making dispatch decisions from, and failing
 * loudly at the boundary is cheaper than debugging that.
 */

/**
 * The stream's opening handshake.
 *
 * Defaulted rather than required: an older server that does not send `history`
 * is reporting nothing wrong, and the honest reading of "no news" here is that
 * the queue is fine.
 */
const readySchema = z.object({
  at: z.iso.datetime(),
  history: z.enum(['shared', 'local']).default('shared'),
});

const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
/** Attempts before the indicator stops saying "reconnecting" and admits it is down. */
const OFFLINE_AFTER_ATTEMPTS = 3;

export function useEventStream(url = '/api/events/stream'): void {
  const ingest = useEventStore((state) => state.ingest);
  const setConnection = useEventStore((state) => state.setConnection);
  const setHistory = useEventStore((state) => state.setHistory);

  // Refs, not state: changing these must never re-render, and the cleanup path
  // has to see the current values rather than a closed-over snapshot.
  const sourceRef = useRef<EventSource | null>(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const disposedRef = useRef(false);

  useEffect(() => {
    disposedRef.current = false;

    const connect = () => {
      if (disposedRef.current) return;

      // Close anything still open before opening another. Without this, a
      // reconnect that races the previous socket's error handler leaves the old
      // connection alive — and since browsers cap HTTP/1.1 at six connections
      // per origin, a handful of leaked streams will starve every other request
      // the page makes.
      sourceRef.current?.close();

      const source = new EventSource(url);
      sourceRef.current = source;

      source.addEventListener('ready', (message) => {
        attemptsRef.current = 0;
        setConnection('live');

        /*
         * The handshake carries the server's own state, not just the fact that
         * it answered: whether its history is shared across instances or is
         * only this process's. A stream can be perfectly live while the broker
         * behind it is down, and the operator is entitled to know that the
         * queue has stopped being authoritative.
         */
        const parsed = readySchema.safeParse(
          JSON.parse((message as MessageEvent<string>).data),
        );
        setHistory(parsed.success ? parsed.data.history : 'shared');
      });

      source.addEventListener('detection', (message) => {
        const parsed = detectionEventSchema.safeParse(
          JSON.parse((message as MessageEvent<string>).data),
        );
        if (parsed.success) {
          ingest(parsed.data);
        } else {
          console.error(
            'Discarded malformed detection event',
            parsed.error.issues,
          );
        }
      });

      source.onerror = () => {
        source.close();
        // Only clear the ref if this is still the live socket — a stale error
        // from a superseded connection must not null out the current one.
        if (sourceRef.current === source) sourceRef.current = null;
        if (disposedRef.current) return;
        // Nor should it stack a second reconnect timer on top of a pending one.
        if (timerRef.current) clearTimeout(timerRef.current);

        attemptsRef.current += 1;
        setConnection(
          attemptsRef.current >= OFFLINE_AFTER_ATTEMPTS
            ? 'offline'
            : 'reconnecting',
        );

        // Exponential backoff with jitter, so a server coming back up does not
        // get every open control-room position retrying in lockstep.
        const backoff = Math.min(
          BASE_DELAY_MS * 2 ** (attemptsRef.current - 1),
          MAX_DELAY_MS,
        );
        const delay = backoff * (0.5 + Math.random() * 0.5);
        timerRef.current = setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      disposedRef.current = true;
      sourceRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url, ingest, setConnection, setHistory]);
}
