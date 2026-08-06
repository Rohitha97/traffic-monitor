'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';

import { Button } from '@/components/Button';
import { PriorityChip } from '@/components/PriorityChip';
import type { Priority } from '@/lib/priority';

interface DispatchConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  incident?: {
    priority: Priority;
    summary: string;
    camera: string;
    location: string;
    priorityReason: string;
  };
}

/**
 * The one confirmation in the application.
 *
 * A real dispatch costs money and moves people, so it asks — but it asks in a
 * way that costs a single keypress: the confirm button takes focus on open, so
 * `D` then `Enter` completes the whole action without the hands leaving the
 * keyboard. A four-second modal on a critical incident costs more than the
 * occasional mis-dispatch it prevents.
 *
 * Radix supplies the focus trap, the restore-on-close, `Esc`, and the
 * `alertdialog` role that makes a screen reader announce the whole body rather
 * than just the title.
 */
export function DispatchConfirm({
  open,
  onOpenChange,
  onConfirm,
  incident,
}: DispatchConfirmProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 grid place-items-center bg-well/70 p-4">
          <AlertDialog.Content className="rounded-control flex w-110 flex-col gap-3 border border-border-component bg-raised p-4">
            <AlertDialog.Title className="text-title font-semibold text-text-primary">
              Dispatch a response team?
            </AlertDialog.Title>

            {incident && (
              <AlertDialog.Description asChild>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2.5">
                    <PriorityChip priority={incident.priority} size="sm" />
                    <span className="text-caption font-semibold text-text-primary">
                      {incident.summary}
                    </span>
                  </div>
                  <p className="text-kicker font-medium text-text-secondary">
                    {incident.camera} · {incident.location}
                  </p>
                  <p className="text-kicker font-medium text-text-body">
                    {incident.priorityReason}
                  </p>
                </div>
              </AlertDialog.Description>
            )}

            <div className="mt-1 flex justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="quiet">Cancel · Esc</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                {/*
                 * autoFocus so Enter confirms immediately — the second half of
                 * "confirmable with a single keypress".
                 */}
                <Button variant="primary" autoFocus onClick={onConfirm}>
                  Dispatch · Enter
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
