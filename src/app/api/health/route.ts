import { busHealth } from '@/lib/event-bus';

/*
 * Liveness probe. Two consumers: the Dockerfile HEALTHCHECK, and compose's
 * `depends_on: { condition: service_healthy }` — which is why it exists
 * before any feature does. Compose cannot order service startup without it.
 *
 * The bus state is reported and deliberately does not affect the status. A
 * dashboard whose broker is down is degraded, not dead: it still receives
 * detections, still shows the queue, and still lets an operator dispatch. If
 * this went unhealthy on a Redis outage, compose and any orchestrator above it
 * would restart a process that was working — turning a cache failure into an
 * outage, which is the exact inversion this whole fallback exists to prevent.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const bus = await busHealth();

  return Response.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    at: new Date().toISOString(),
    bus: {
      kind: bus.kind,
      degraded: bus.degraded,
      ...(bus.detail ? { detail: bus.detail } : {}),
    },
  });
}
