export interface AuditEntry {
  /** Wall-clock time, pre-formatted. */
  at: string;
  /** "Acknowledged (Rohitha)" or "Priority set Critical (system)". */
  action: string;
}

interface AuditTrailProps {
  entries: readonly AuditEntry[];
}

/**
 * The record, written as it happens and visible while it is written.
 *
 * A safety-critical system is an accountable system: every action appends
 * here, including the ones the system takes on its own — the 20s
 * auto-escalation writes its own line so an operator can see why the banner
 * fired twice.
 *
 * Sits directly above the decision bar so the record is in view at the moment
 * the operator commits to a decision. (Pass A note 4)
 */
export function AuditTrail({ entries }: AuditTrailProps) {
  return (
    <section className="rounded-control flex min-h-0 flex-1 flex-col gap-1.75 overflow-hidden border border-border-hairline p-2.5">
      <h3 className="text-micro tracking-field font-semibold text-text-secondary uppercase">
        Audit trail
      </h3>
      <ol className="flex min-h-0 flex-col gap-1.75 overflow-y-auto">
        {entries.map((entry) => (
          <li
            key={`${entry.at}-${entry.action}`}
            className="flex items-baseline gap-2.5"
          >
            <span className="text-mono-micro w-16 flex-none font-mono font-medium text-text-secondary">
              {entry.at}
            </span>
            <span className="text-micro font-medium text-text-body">
              {entry.action}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
