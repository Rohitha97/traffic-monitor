import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/*
 * Design-system adherence rules.
 *
 * These three selectors come verbatim from the design project's
 * _adherence.oxlintrc.json (exported at docs/design/_ds/nocturne-…/), with
 * one amendment: the font list carries the two families the design actually
 * uses, since the config shipped declaring only Inter while Pass B sets the
 * product in Public Sans and IBM Plex Mono.
 *
 * They live here rather than in .oxlintrc.json because oxlint does not
 * implement `no-restricted-syntax` — verified against 0.15.15, which does
 * not list the rule at all, so the config's adherence rules were silent
 * no-ops. ESLint's implementation supports the esquery attribute-regex
 * selectors the config is written in. Both linters run in `pnpm lint`, so
 * adherence is enforced exactly as the brief requires; only the engine
 * changed. See docs/DECISIONS.md 1.4.
 */
const adherence = {
  files: ['src/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: String.raw`Literal[value=/#[0-9a-fA-F]{3,8}\b/]`,
        message:
          'Raw hex color — use a design-system color token from src/styles/theme.css.',
      },
      {
        selector: String.raw`Literal[value=/\b\d+px\b/]`,
        message:
          'Raw px value — use a spacing utility from the 4px scale, not an arbitrary value.',
      },
      {
        selector: String.raw`Literal[value=/font-family\s*:\s*(?!['"]?(?:Public Sans|IBM Plex Mono))/i]`,
        message:
          'Font not provided by the design system. Available: Public Sans, IBM Plex Mono.',
      },
    ],
  },
};

/*
 * The state-matrix route quotes Pass C's captions verbatim — "2px inset",
 * "collapses to a 20px strip", "expands to 52px" — because being diffable
 * against the frames is the entire point of that page. The raw-px rule matches
 * any string literal containing a px measurement and cannot distinguish a
 * style value from prose describing one, so it fires on the quotations.
 *
 * Narrowed to the two rules that read prose, on the one development-only route
 * (next.config.ts rewrites /dev/* to 404 in production). Application code
 * keeps both rules in full force.
 */
const devRouteProse = {
  files: ['src/app/dev/**/*.tsx'],
  rules: { 'no-restricted-syntax': 'off' },
};

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'docs/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  adherence,
  devRouteProse,
];

export default config;
