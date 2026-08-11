import { z } from 'zod';

import { recordMark } from '@/lib/event-bus';
import { markSchema } from '@/lib/schema';

/*
 * Where the operator's side of the timeline reaches the server.
 *
 * The client marks optimistically — it already appends to its own copy of the
 * audit trail the moment an incident is looked at or decided — and posts the
 * same entry here so the buffered record carries it too. Without this,
 * `/api/metrics` would be measuring events nobody had annotated.
 *
 * Fire-and-forget by design: a dropped mark costs one sample out of a
 * distribution, and blocking an operator's keystroke on a metrics write would
 * be the wrong trade in a tool whose entire argument is response time.
 */

export const dynamic = 'force-dynamic';

const markRequestSchema = z.object({
  id: z.string().min(1),
  mark: markSchema,
  at: z.iso.datetime(),
  actor: z.string().min(1),
  action: z.string().min(1),
  /**
   * Present when the decision was a dismissal.
   *
   * This route started as metrics plumbing, but it is really the client
   * reporting an operator's action to the server — and the reopen rule needs
   * to know not just that an incident was decided but that it was dismissed
   * and on what grounds. Item #2 makes the server authoritative for actions
   * outright; this is the narrow version that unblocks correlation.
   */
  dismissalReason: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Body is not valid JSON' }, { status: 400 });
  }

  const parsed = markRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Mark failed validation', issues: parsed.error.issues },
      { status: 422 },
    );
  }

  const { id, mark, at, actor, action, dismissalReason } = parsed.data;
  const recorded = recordMark(id, mark, at, actor, action, dismissalReason);

  // 200 either way. "Already marked" and "aged out of the buffer" are both
  // normal, and neither is the client's problem to handle.
  return Response.json({ recorded }, { status: 200 });
}
