'use client';

/*
 * A client island.
 *
 * Its accessible name is translated, and `useTranslations` is a hook. Every
 * surface that renders this in the running app is already inside the console's
 * client tree — only `/dev/states` renders it from a Server Component, and a
 * hook there blanks the state matrix. (ADR-0014)
 */

interface EmptyQueueProps {
  feeds: { online: number; total: number };
}

/**
 * The empty state is an invitation, not an apology.
 *
 * It reports what *is* working — every feed online and watching — because in a
 * monitoring context "nothing here" is ambiguous between "all clear" and
 * "the pipeline is broken", and only one of those is good news. The green ring
 * is the same token as the live connection dot, so the two agree on sight.
 */
export function EmptyQueue({ feeds }: EmptyQueueProps) {
  return (
    <div className="rounded-control flex flex-col items-center gap-2.5 border border-border-hairline px-5 py-9 text-center">
      <span
        aria-hidden="true"
        className="text-ui flex size-8 items-center justify-center rounded-full border-2 border-live font-semibold text-live"
      >
        ✓
      </span>
      <p className="text-ui font-semibold text-text-primary">Queue clear</p>
      <p className="text-caption max-w-80 font-medium text-text-secondary">
        All {feeds.total} feeds live. New detections appear here automatically.
      </p>
    </div>
  );
}
