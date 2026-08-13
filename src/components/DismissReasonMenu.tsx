'use client';

import { useDomainLabels } from '@/i18n/domain';
import { DISMISS_REASONS, type DismissReason } from '@/lib/schema';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';

/**
 * False-positive reasons, from Pass A's dismissed state.
 *
 * These are not decoration: a dismissal reason is the training signal that
 * makes the detection model better, so the picker is mandatory rather than
 * optional, and the reason is written into the audit trail and shown on the
 * collapsed row.
 */
/*
 * The reasons themselves live in `@/lib/schema` with the other domain enums —
 * they are vocabulary written onto the event, not a property of this menu.
 * Re-exported here so the call sites that render the picker keep one import.
 */
export { DISMISS_REASONS, type DismissReason } from '@/lib/schema';

interface DismissReasonMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (reason: DismissReason) => void;
  /** The control the menu hangs off — Pass C draws it as "Dismiss, not real ▾". */
  children: ReactNode;
}

/**
 * The reason picker.
 *
 * A menu rather than the modal the brief describes, because Pass C draws the
 * trigger with a disclosure caret. Radix's menu still gives the focus trap,
 * roving focus, type-ahead and `Esc` the brief asks for, so the design's
 * lighter affordance costs nothing in accessibility
 * (DESIGN_INVENTORY.md §6, DECISIONS 2.11).
 *
 * Controlled, so `X` can open it from the keyboard as well as the caret.
 */
export function DismissReasonMenu({
  open,
  onOpenChange,
  onSelect,
  children,
}: DismissReasonMenuProps) {
  const labels = useDomainLabels();

  return (
    <DropdownMenu.Root open={open} onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          aria-label="Dismiss as false positive"
          className="rounded-control flex w-fit flex-col border border-border-component bg-raised py-1 shadow-row-hover"
        >
          <DropdownMenu.Label className="text-micro tracking-field px-3 py-1 font-semibold text-text-secondary uppercase">
            Why is this not real?
          </DropdownMenu.Label>
          {DISMISS_REASONS.map((reason) => (
            <DropdownMenu.Item
              key={reason}
              onSelect={() => onSelect(reason)}
              className="text-caption cursor-pointer px-3 py-1.5 font-medium text-text-body outline-none transition-colors duration-(--duration-state) data-highlighted:bg-text-primary/8 data-highlighted:text-text-primary"
            >
              {labels.dismissReason(reason)}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
