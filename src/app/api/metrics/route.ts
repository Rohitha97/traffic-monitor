import { snapshot } from '@/lib/event-bus';
import { computeMetrics } from '@/lib/metrics';

/*
 * Time to awareness and time to decision, p50 and p95, over the replay buffer.
 *
 * Plain JSON and no dashboard. The cheap version is the useful one: what these
 * numbers are for is answering "did that change help?", and a chart would be a
 * second thing to build and maintain before the first question had been asked
 * once.
 *
 * Scope is the buffer, which is stated in the response rather than implied —
 * these are the last hundred events on this instance, not a shift total, and a
 * p95 over four samples is noise. `n` is reported for exactly that reason.
 */

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  return Response.json(computeMetrics(await snapshot()));
}
