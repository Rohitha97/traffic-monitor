/*
 * Liveness probe. Two consumers: the Dockerfile HEALTHCHECK, and compose's
 * `depends_on: { condition: service_healthy }` — which is why it exists
 * before any feature does. Compose cannot order service startup without it.
 */

export const dynamic = 'force-dynamic';

export function GET(): Response {
  return Response.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    at: new Date().toISOString(),
  });
}
