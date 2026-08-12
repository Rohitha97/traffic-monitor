import { z } from 'zod';

import { claim } from '@/lib/event-bus';
import { positionFrom, positionLabel } from '@/lib/position';

/*
 * Taking an incident.
 *
 * The one action in this application that is not optimistic-and-forget, because
 * it is the one action that can be *refused*. Everything else an operator does
 * — dispatching, dismissing, resolving — acts on an incident they already hold,
 * so the client can apply it immediately and tell the server afterwards.
 * Acknowledging is a claim on a shared resource, and Pass A names the failure it
 * prevents: two positions dispatching the same call.
 *
 * So the server decides, and the client waits to hear. A 409 is not an error
 * here — it is the correct answer to a question that was legitimately asked, and
 * it carries who won.
 */

export const dynamic = 'force-dynamic';

const claimRequestSchema = z.object({
  id: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  /*
   * The position comes from the cookie, never from the body.
   *
   * It is not much of an identity — see `src/lib/position.ts` — but taking it
   * from the request body would mean a client could claim an incident *as*
   * another desk, which turns a weak identity into a useless one for no reason.
   */
  const position = positionFrom(request);
  if (!position) {
    return Response.json(
      { error: 'No position assigned. Open the event stream first.' },
      { status: 428 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const parsed = claimRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Claim failed validation', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  /*
   * The *label* is the identity that gets stored, not the bare number.
   *
   * `assignedTo` is rendered — as initials on the row, in full in the detail
   * pane and the audit trail — so storing "3" would mean every reader had to
   * know to say "Position" in front of it, and one of them would eventually
   * forget. One string, formatted once, at the edge.
   */
  const result = await claim(
    parsed.data.id,
    positionLabel(position),
    new Date().toISOString(),
  );

  if (result.ok) {
    return Response.json({ ok: true, owner: result.owner }, { status: 200 });
  }

  /*
   * The event aged out of the replay window, or never existed here. Not a
   * conflict — there is nothing to take — and telling the operator it was
   * "taken by" nobody would be worse than telling them it is gone.
   */
  if (result.owner === null) {
    return Response.json({ ok: false, reason: 'gone' }, { status: 404 });
  }

  return Response.json(
    { ok: false, reason: 'taken', owner: result.owner },
    { status: 409 },
  );
}
