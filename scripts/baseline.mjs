/*
 * Run the measurement harness for roadmap #3.
 *
 *   node scripts/baseline.mjs
 *
 * A wrapper only because setting an environment variable inline is not
 * portable between cmd and POSIX shells, and this project has to run on both.
 * The reading it prints goes into ADR-0004.
 */

import { spawnSync } from 'node:child_process';

const result = spawnSync(
  'pnpm',
  ['exec', 'playwright', 'test', '--project=chromium', 'e2e/baseline.spec.ts'],
  { stdio: 'inherit', env: { ...process.env, RUN_BASELINE: '1' }, shell: true },
);

process.exit(result.status ?? 1);
