/*
 * Message key parity, as a lint step.
 *
 * next-intl falls back to the default locale for a missing key and logs a
 * warning nobody reads. On a control-room screen that means an English string
 * appearing mid-sentence in a Japanese interface, at whatever hour the code
 * path that uses it first runs. A build failure is the correct time to find out.
 *
 * Also checks the ICU placeholders in each message, because a translation that
 * drops `{total}` type-checks, renders, and silently loses the number.
 *
 *   node scripts/check-messages.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'messages';
const REFERENCE = 'en';

/** Every leaf key as a dotted path — `statusBar.connection.live`. */
function flatten(value, prefix = '') {
  if (value === null || typeof value !== 'object') return { [prefix]: value };

  const out = {};
  for (const [key, child] of Object.entries(value)) {
    Object.assign(out, flatten(child, prefix ? `${prefix}.${key}` : key));
  }
  return out;
}

/**
 * The ICU argument names a message depends on.
 *
 * Deliberately just the names: `{total, plural, one {# feed} other {# feeds}}`
 * and `{total, plural, other {# 台}}` must agree on *what* they interpolate,
 * and must be free to disagree on how — Japanese has no grammatical plural, so
 * a single `other` branch is the correct translation, not a missing one.
 */
function placeholders(message) {
  if (typeof message !== 'string') return new Set();
  return new Set(
    [...message.matchAll(/\{\s*([a-zA-Z0-9_]+)\s*[,}]/g)].map(
      (match) => match[1],
    ),
  );
}

const locales = readdirSync(DIR)
  .filter((name) => name.endsWith('.json'))
  .map((name) => name.replace(/\.json$/, ''));

if (!locales.includes(REFERENCE)) {
  console.error(`✗ messages/${REFERENCE}.json is missing`);
  process.exit(1);
}

const loaded = Object.fromEntries(
  locales.map((locale) => [
    locale,
    flatten(JSON.parse(readFileSync(join(DIR, `${locale}.json`), 'utf8'))),
  ]),
);

const reference = loaded[REFERENCE];
const problems = [];

for (const locale of locales) {
  if (locale === REFERENCE) continue;
  const messages = loaded[locale];

  for (const key of Object.keys(reference)) {
    if (!(key in messages)) {
      problems.push(`${locale}: missing "${key}"`);
      continue;
    }

    if (typeof messages[key] !== 'string' || messages[key].trim() === '') {
      problems.push(`${locale}: "${key}" is empty`);
      continue;
    }

    const expected = placeholders(reference[key]);
    const actual = placeholders(messages[key]);

    for (const name of expected) {
      if (!actual.has(name)) {
        problems.push(`${locale}: "${key}" drops the {${name}} placeholder`);
      }
    }
    for (const name of actual) {
      if (!expected.has(name)) {
        problems.push(`${locale}: "${key}" adds an unknown {${name}}`);
      }
    }
  }

  for (const key of Object.keys(messages)) {
    if (!(key in reference)) {
      // A key with no English original is a string no surface can be reading.
      problems.push(`${locale}: "${key}" is not in ${REFERENCE}.json`);
    }
  }
}

if (problems.length > 0) {
  console.error('✗ Message files are out of sync:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `\n${problems.length} problem${problems.length === 1 ? '' : 's'}.`,
  );
  process.exit(1);
}

const count = Object.keys(reference).length;
console.log(
  `✓ ${count} message${count === 1 ? '' : 's'} × ${locales.length} locales, keys and placeholders in sync.`,
);
