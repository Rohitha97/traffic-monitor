/*
 * The operator shell — master–detail with a pinned critical band, the
 * layout chosen in Pass A §04 ("A, with one lane borrowed from B").
 *
 * Phase 1 builds the grid only: regions, geometry, surfaces and landmarks.
 * Components land in phase 2, data in phase 3.
 *
 * Every dimension here is a plain spacing utility because Pass B's 4px grid
 * makes each frame measurement land on a scale step — h-12 is the 48px
 * status bar, w-108 the 432px queue, h-9 the 36px queue header.
 * (DESIGN_INVENTORY.md §8)
 */
export default function DashboardPage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ground">
      {/*
       * Status bar — feed health, open counts, clocks, mute. Deliberately
       * outside the reading path: glanced at, never read. (Pass A note 1)
       */}
      <header
        aria-label="System status"
        className="h-12 flex-none border-b border-border-hairline bg-panel"
      />

      {/*
       * Pinned critical band — zero-height whenever nothing is critical,
       * and the one place on screen a critical can ever appear. This is
       * lane B's spatial guarantee at a tenth of its cost. (Pass A §04)
       *
       * It takes space rather than overlaying, so an arriving critical
       * never covers what the operator was reading. (Pass A note 1, frame 2)
       */}
      <div aria-live="assertive" className="flex-none empty:h-0" />

      <div className="flex min-h-0 flex-1">
        {/*
         * Triage queue — twelve 40px rows visible at 1440×900 without
         * scrolling. (Pass A note 3)
         */}
        <section
          aria-label="Incident queue"
          className="flex w-108 flex-none flex-col border-r border-border-hairline"
        >
          <div className="flex h-9 flex-none items-center justify-between border-b border-border-hairline px-3" />
          <div className="min-h-0 flex-1 overflow-y-auto" />
        </section>

        {/*
         * Detail pane — a fixed slot layout that never changes between
         * incident types, so the four facts that drive the call sit in the
         * same four pixels every time. The operator reads position, not
         * labels. (Pass A §04, note 4)
         */}
        <main
          aria-label="Incident detail"
          className="flex min-w-0 flex-1 flex-col gap-4 p-5"
        />
      </div>
    </div>
  );
}
