'use client';

import { useState } from 'react';

import { Button } from '@/components/Button';
import { DismissReasonMenu } from '@/components/DismissReasonMenu';
import { DispatchConfirm } from '@/components/DispatchConfirm';
import { ShortcutOverlay } from '@/components/ShortcutOverlay';

/*
 * The three overlays, which cannot be shown flat in the matrix because they
 * portal to the body and own the keyboard while open. Triggers instead, so a
 * reviewer can open each one and check its focus trap and Esc behaviour
 * directly.
 */
export function DialogDemos() {
  const [dismissOpen, setDismissOpen] = useState(false);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [lastReason, setLastReason] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4">
      <DismissReasonMenu
        open={dismissOpen}
        onOpenChange={setDismissOpen}
        onSelect={(reason) => setLastReason(reason)}
      >
        <Button variant="quiet">Dismiss, not real ▾</Button>
      </DismissReasonMenu>

      <Button variant="primary" onClick={() => setDispatchOpen(true)}>
        Dispatch
      </Button>

      <Button onClick={() => setShortcutsOpen(true)}>Shortcuts · ?</Button>

      {lastReason && (
        <span className="text-kicker font-medium text-text-secondary">
          picked: {lastReason}
        </span>
      )}

      <DispatchConfirm
        open={dispatchOpen}
        onOpenChange={setDispatchOpen}
        onConfirm={() => setDispatchOpen(false)}
        incident={{
          priority: 'critical',
          summary: 'Wrong-way driver',
          camera: 'CAM-014',
          location: 'M6 northbound, junction 8–9',
          priorityReason: 'Critical — live lane 2 of 3, junction approach',
        }}
      />

      <ShortcutOverlay open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  );
}
