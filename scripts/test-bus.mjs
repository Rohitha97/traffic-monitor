/*
 * Run the event-bus conformance suite against both implementations.
 *
 * `pnpm test` covers the memory bus and skips the Redis half, because the
 * default path of this project is not allowed to require infrastructure — a
 * clean clone must be able to run the tests. This script is the other half: it
 * starts a throwaway broker, runs the same suite with `REDIS_URL` set so the
 * skipped block runs, and takes the broker away again.
 *
 *   pnpm test:bus
 *
 * The container is named and removed on exit rather than reusing whatever is
 * already listening on 6379. A suite whose starting conditions depend on what
 * you happen to have running is not a suite.
 */

import { spawnSync } from 'node:child_process';

const CONTAINER = 'incident-monitor-bus-test';
const PORT = process.env.BUS_TEST_PORT ?? '6380';
const URL = `redis://127.0.0.1:${PORT}`;

const run = (command, args, options = {}) =>
  spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });

function stop() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' });
}

function ping() {
  const result = spawnSync(
    'docker',
    ['exec', CONTAINER, 'redis-cli', 'ping'],
    { encoding: 'utf8' },
  );
  return result.stdout?.trim() === 'PONG';
}

async function waitForReady(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function main() {
  // Any container left behind by an interrupted run.
  stop();

  console.log(`Starting a throwaway broker on ${URL}`);
  const started = run('docker', [
    'run',
    '--rm',
    '-d',
    '--name',
    CONTAINER,
    '-p',
    `${PORT}:6379`,
    'redis:7-alpine',
    'redis-server',
    '--save',
    '',
    '--appendonly',
    'no',
  ]);

  if (started.status !== 0) {
    console.error('Could not start Redis. Is Docker running?');
    process.exitCode = 1;
    return;
  }

  if (!(await waitForReady())) {
    console.error('Redis did not become ready.');
    stop();
    process.exitCode = 1;
    return;
  }

  const result = run(
    'pnpm',
    ['exec', 'vitest', 'run', 'src/lib/event-bus', ...process.argv.slice(2)],
    { env: { ...process.env, REDIS_URL: URL }, shell: process.platform === 'win32' },
  );

  stop();
  process.exitCode = result.status ?? 1;
}

// Ctrl-C must not leave a container running.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stop();
    process.exit(1);
  });
}

main().catch((error) => {
  console.error(error);
  stop();
  process.exitCode = 1;
});
