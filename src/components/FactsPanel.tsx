interface FactsPanelProps {
  location: string;
  mileMarker: string;
  /** detectedAt → receivedAt, formatted as "0.6s". The pipeline's own latency. */
  detectionLatency: string;
  /** 0–1 from the detection model. */
  confidence: number;
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
}: FactsPanelProps) {
  const facts = [
    { key: 'Location', value: location },
    { key: 'Mile marker', value: mileMarker },
    { key: 'Detection latency', value: detectionLatency },
    { key: 'Confidence', value: `${Math.round(confidence * 100)}%` },
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
