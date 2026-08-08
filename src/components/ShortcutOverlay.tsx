'use client';

import * as Dialog from '@radix-ui/react-dialog';

import { SHORTCUT_GROUPS, SHORTCUTS } from '@/lib/shortcuts';

interface ShortcutOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The `?` overlay.
 *
 * Rendered from the same table the key handler dispatches from, so a binding
 * cannot be published here and missing in the application — the usual failure
 * mode for a help screen maintained by hand.
 *
 * Not drawn in Pass C: the design has no help affordance, because its operator
 * is trained and does not need one. It ships because the brief asks for it and
 * because a take-home reviewer is not that operator. Built entirely from the
 * design's own tokens so it does not read as a bolt-on.
 */
export function ShortcutOverlay({ open, onOpenChange }: ShortcutOverlayProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 grid place-items-center bg-well/70 p-4">
          <Dialog.Content className="rounded-control flex max-h-full w-150 flex-col gap-4 overflow-y-auto border border-border-component bg-raised p-5">
            <div className="flex items-baseline gap-3">
              <Dialog.Title className="text-title font-semibold text-text-primary">
                Keyboard
              </Dialog.Title>
              <Dialog.Description className="text-micro font-medium text-text-secondary">
                ↑↓ previews as it moves, so opening is never a separate action.
              </Dialog.Description>
            </div>

            {SHORTCUT_GROUPS.map((group) => (
              <section key={group} className="flex flex-col gap-1.5">
                <h3 className="text-micro tracking-field font-semibold text-text-secondary uppercase">
                  {group}
                </h3>
                <dl className="flex flex-col gap-1">
                  {SHORTCUTS.filter((s) => s.group === group).map(
                    (shortcut) => (
                      <div
                        key={shortcut.keys}
                        className="flex items-baseline gap-3"
                      >
                        <dt className="text-mono-meta w-24 flex-none font-mono font-semibold text-text-primary">
                          {shortcut.keys}
                        </dt>
                        <dd className="text-kicker font-medium text-text-body">
                          {shortcut.action}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </section>
            ))}
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
