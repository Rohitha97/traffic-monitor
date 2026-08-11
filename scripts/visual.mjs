/*
 * Run the visual-regression suite inside the pinned Playwright image.
 *
 * Screenshots are not portable. Font hinting and antialiasing differ enough
 * between Windows, macOS and Linux that a snapshot taken on a laptop will never
 * match CI — so both capture and comparison happen in one image, pinned to the
 * @playwright/test version in package.json.
 *
 *   node scripts/visual.mjs            compare against committed snapshots
 *   node scripts/visual.mjs --update   regenerate them
 *
 * node_modules and .next get their own named volumes: the repository is bind
 * mounted, and the host's Windows-built native modules cannot be loaded by
 * Linux. Keeping them in volumes also means the install is cached between runs.
 */

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Pin the image to the installed Playwright, so the browser that takes the
// snapshots is the browser that compares them.
const { version } = require('@playwright/test/package.json');
const image = `mcr.microsoft.com/playwright:v${version}-noble`;

const update = process.argv.includes('--update');
const inner = [
  'corepack enable',
  'pnpm install --frozen-lockfile --prefer-offline',
  `pnpm exec playwright test --project=visual${update ? ' --update-snapshots' : ''}`,
].join(' && ');

console.log(`${update ? 'Regenerating' : 'Checking'} snapshots in ${image}\n`);

const result = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--init',
    '-v',
    `${root}:/work`,
    '-v',
    'traffic-monitor-vrt-node-modules:/work/node_modules',
    '-v',
    'traffic-monitor-vrt-next:/work/.next',
    '-w',
    '/work',
    '-e',
    'PW_VISUAL_ONLY=1',
    '-e',
    'CI=1',
    image,
    'bash',
    '-lc',
    inner,
  ],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
