export interface NearbyCamera {
  id: string;
  /** Mile marker — drives the pin's position along the carriageway. */
  mileMarker: number;
  /** The camera this incident is on. */
  isIncident?: boolean;
}

interface NearbyCamerasProps {
  cameras: readonly NearbyCamera[];
  /** Direction of normal traffic flow, and of the hazard if it opposes it. */
  flowNote?: string;
}

/**
 * Nearby cameras, as a linear mile-marker schematic.
 *
 * This is deliberately *not* a slippy map. The build brief's stack table
 * specifies maplibre-gl on a CARTO basemap; Pass C draws a 120px strip with
 * one carriageway line, pins at mile markers, and a flow-direction legend —
 * no basemap, no geography, no pan or zoom. Pass A classes it "reference, not
 * path". A map here would cost ~800KB of JavaScript and a network tile
 * dependency on a surface whose whole thesis is speed, and would still not
 * match the frame. Recorded as a deliberate stack deviation in DECISIONS.md.
 *
 * Pins are positioned by their actual mile marker rather than spread evenly,
 * so an incident between two closely-spaced cameras reads as such.
 */
export function NearbyCameras({ cameras, flowNote }: NearbyCamerasProps) {
  const markers = cameras.map((c) => c.mileMarker);
  const min = Math.min(...markers);
  const max = Math.max(...markers);
  const span = max - min || 1;

  // Inset the ends so a pin never sits flush against the panel edge.
  const positionOf = (marker: number) => 10 + ((marker - min) / span) * 80;

  return (
    <section className="rounded-control flex h-30 flex-none flex-col border border-border-hairline p-2.5">
      <h3 className="text-micro tracking-field mb-1 font-semibold text-text-secondary uppercase">
        Nearby cameras
      </h3>

      <div className="relative flex-1">
        {/*
         * The carriageway. Horizontal geometry is fixed off the 4px scale
         * rather than the frame's percentages (16% / 30% of the drawn width
         * come to 45px and 84px) — same position at the drawn size, and the
         * line stays put when the detail pane resizes. Vertical position is
         * the one genuinely data-driven value here: it encodes mile marker.
         */}
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-11 w-0.5 bg-border-component/60"
        />

        <ul>
          {cameras.map((camera) => (
            <li key={camera.id}>
              <span
                aria-hidden="true"
                className={`absolute left-11 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                  camera.isIncident
                    ? 'size-3 bg-critical shadow-incident-pin motion-safe:animate-pulse-status'
                    : 'size-2 bg-border-component'
                }`}
                style={{ top: `${positionOf(camera.mileMarker)}%` }}
              />
              <span
                className={`text-micro absolute left-20 -translate-y-1/2 whitespace-nowrap ${
                  camera.isIncident
                    ? 'font-semibold text-text-primary'
                    : 'font-medium text-text-secondary'
                }`}
                style={{ top: `${positionOf(camera.mileMarker)}%` }}
              >
                {camera.id} · MM {camera.mileMarker.toFixed(1)}
                {camera.isIncident && ' — this incident'}
              </span>
            </li>
          ))}
        </ul>

        {flowNote && (
          <p className="text-micro absolute top-1/2 right-1.5 max-w-17 -translate-y-1/2 text-right font-semibold whitespace-pre-line text-text-secondary">
            {flowNote}
          </p>
        )}
      </div>
    </section>
  );
}
