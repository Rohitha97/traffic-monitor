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

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'docs/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  adherence,
];

export default config;
