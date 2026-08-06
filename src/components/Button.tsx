import type { ButtonHTMLAttributes } from 'react';

/*
 * Three treatments, drawn across Pass C frames 1, 2, 3 and 5.
 *
 * Note the primary is a filled light button, not nocturne's outlined accent —
 * the product has no accent hue, because saturation is reserved for priority.
 * A filled control on a dark ground is the loudest neutral available, which is
 * what the one committing action ("Dispatch") should be.
 *
 * Pass C draws no hover or pressed state for buttons. The tints below come
 * from nocturne's interaction-state convention, carried forward in the
 * product's own colours (DESIGN_INVENTORY.md §1.1) — "interactive states are
 * themed, never browser defaults".
 */
const VARIANT = {
  primary:
    'bg-text-primary text-ground hover:bg-text-body active:bg-text-secondary',
  secondary:
    'border border-border-component text-text-primary hover:bg-text-primary/8 active:bg-text-primary/14',
  quiet:
    'border border-border-hairline text-text-secondary hover:bg-text-primary/6 hover:text-text-primary active:bg-text-primary/12',
} as const;

const SIZE = {
  /** 32px — inside the critical banner, which is only 52px tall. */
  sm: 'h-8 px-4 text-caption',
  /** 36px — the decision bar. */
  md: 'h-9 px-4.5 text-caption',
  /** Compact, for the status bar's mute toggle. */
  xs: 'h-7 px-3 text-kicker',
} as const;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`rounded-control inline-flex flex-none cursor-pointer items-center justify-center gap-1.5 font-medium transition-colors duration-(--duration-state) ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      {...props}
    />
  );
}
