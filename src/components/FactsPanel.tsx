interface FactsPanelProps {
  location: string;
  mileMarker: string;
  /** detectedAt → receivedAt, formatted as "0.6s". The pipeline's own latency. */
  detectionLatency: string;
  /** 0–1 from the detection model. */
  confidence: number;
  /**
   * The four field labels, resolved upstream.
   *
   * Props rather than a hook: this renders from a Server Component on
   * `/dev/states`, and a hook here would blank the whole state matrix — the
   * failure `PriorityChip` already found the hard way. Passing them also keeps
   * the rule that no component invents a label.
   */
  labels: {
    location: string;
    marker: string;
    latency: string;
    confidence: string;
  };
}

/**
 * The four facts that change the decision, always in the same four pixels.
 *
 * The slot layout never varies between incident types, so the operator reads
 * position rather than labels — which is worth roughly 20 seconds per incident
 * at the "orient" step of Pass A's journey map, the single most expensive step
 * the design owns.
 *
 * Detection latency is here because it answers "how stale is this?" before the
 * operator has to ask.
 */
export function FactsPanel({
  location,
  mileMarker,
  detectionLatency,
  confidence,
  labels,
}: FactsPanelProps) {
  const facts = [
    { key: labels.location, value: location },
    { key: labels.marker, value: mileMarker },
    { key: labels.latency, value: detectionLatency },
    /*
     * A percentage, in Western Arabic digits in both locales. Japanese
     * technical interfaces do not use kanji numerals, and the tabular face this
     * sets in has no glyphs for them.
     */
    { key: labels.confidence, value: `${Math.round(confidence * 100)}%` },
  ];

  return (
    <dl className="rounded-control flex flex-col gap-2 border border-border-hairline p-2.5">
      {facts.map(({ key, value }) => (
        <div key={key} className="flex items-center gap-2.5">
          <dt className="text-micro tracking-field w-30 flex-none font-semibold text-text-secondary uppercase">
            {key}
          </dt>
          <dd className="text-mono-meta font-mono font-semibold text-text-primary">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
