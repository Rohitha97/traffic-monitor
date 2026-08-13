/*
 * Fail the build if the Japanese face did not actually make it into it.
 *
 * `next/font/google` downloads at build time and self-hosts the result, which
 * is what keeps a control-room machine off a font CDN. It also **logs a fetch
 * failure and carries on**: the build exits 0, the CSS keeps only the
 * metric-adjusted `Noto Sans JP Fallback`, and Japanese renders in whatever the
 * operating system happens to supply. That is the "browser substitutes
 * something arbitrary and the interface looks broken" failure the font stack
 * exists to prevent, arriving silently.
 *
 * It is not hypothetical. A CJK face is ~370 `@font-face` rules across three
 * weights and 142 files; Google rate-limits that, and one build during this
 * phase produced exactly this — 18 files, zero real Japanese faces, and a
 * green build log.
 *
 * Same principle as the message-parity check: a missing translation should
 * break the build rather than fall back silently in front of an operator. A
 * missing glyph is the same failure one layer down.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const CSS_DIR = '.next/static/css';
const MEDIA_DIR = '.next/static/media';

/** Weights the design sets Japanese text in. See ADR-0011. */
const REQUIRED_WEIGHTS = ['400', '500', '600'];
const FAMILY = 'Noto Sans JP';

/**
 * Enough CJK-covering faces that this is plainly the real font.
 *
 * A complete download is ~330. The threshold is low enough not to be brittle
 * against Google re-chunking the subsets, and far above what a partial
 * download leaves behind.
 */
const MIN_CJK_FACES = 100;

function readAllCss(dir) {
  let css = '';
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) css += readAllCss(path);
    else if (path.endsWith('.css')) css += readFileSync(path, 'utf8');
  }
  return css;
}

function fail(message) {
  console.error(`\n✗ Font check failed: ${message}\n`);
  process.exitCode = 1;
}

let css;
try {
  css = readAllCss(CSS_DIR);
} catch {
  fail(`no built CSS at ${CSS_DIR}. Run \`pnpm build\` first.`);
  process.exit();
}

const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((m) => m[0]);

// Minified output drops the quotes around the family name; unminified keeps
// them. Tolerating both is not cosmetic — matching only the quoted form
// reported zero faces against a build that was entirely correct.
const familyOf = (face) =>
  (/font-family:\s*['"]?([^;'"]+)['"]?\s*;/.exec(face)?.[1] ?? '').trim();

const japanese = faces.filter((face) => familyOf(face) === FAMILY);
const cjk = japanese.filter((face) =>
  /U\+(3[0-9a-f]{3}|4[e-f][0-9a-f]{2}|[5-9][0-9a-f]{3})/i.test(face),
);

if (japanese.length === 0) {
  fail(
    `no "${FAMILY}" @font-face rules in the build — only the metric fallback.\n` +
      '  Japanese text will render in an arbitrary system font.\n' +
      '  Usually a rate-limited or offline font download: rerun the build.',
  );
} else if (cjk.length < MIN_CJK_FACES) {
  fail(
    `only ${cjk.length} "${FAMILY}" faces cover CJK ranges (expected ≥ ${MIN_CJK_FACES}).\n` +
      '  The download was partial, so some kanji will fall back to a system font.',
  );
}

const weights = new Set(
  japanese.map((face) => /font-weight:\s*(\d+)/.exec(face)?.[1]),
);
const missingWeights = REQUIRED_WEIGHTS.filter((w) => !weights.has(w));
if (japanese.length > 0 && missingWeights.length > 0) {
  fail(
    `"${FAMILY}" is missing weight(s) ${missingWeights.join(', ')}.\n` +
      '  The design encodes meaning in the 500/600 steps — an unread row is 600\n' +
      '  where a read one is 500 — and a missing weight collapses that.',
  );
}

// Self-hosted means self-hosted. A remote URL here is a control-room machine
// that renders wrongly the moment it cannot reach the internet.
const remote = css.match(/url\(\s*['"]?https?:/g) ?? [];
if (remote.length > 0) {
  fail(
    `${remote.length} font URL(s) point at a remote host. Fonts must be self-hosted.`,
  );
}

// A referenced file that was never written is a 404 at runtime.
const referenced = new Set(
  [...css.matchAll(/url\((\/_next\/static\/media\/[^)]+)\)/g)].map((m) =>
    basename(m[1]),
  ),
);
let present = new Set();
try {
  present = new Set(readdirSync(MEDIA_DIR));
} catch {
  // No media directory at all is already covered by the face checks above.
}
const missingFiles = [...referenced].filter((file) => !present.has(file));
if (missingFiles.length > 0) {
  fail(
    `${missingFiles.length} font file(s) are referenced but were not emitted, e.g. ${missingFiles[0]}`,
  );
}

if (process.exitCode !== 1) {
  const bytes = [...present].reduce(
    (total, file) => total + statSync(join(MEDIA_DIR, file)).size,
    0,
  );
  console.log(
    `✓ ${japanese.length} ${FAMILY} faces (${cjk.length} CJK) at weights ` +
      `${REQUIRED_WEIGHTS.join('/')}, ${present.size} files, ` +
      `${(bytes / 1024 / 1024).toFixed(1)}MB, all self-hosted.`,
  );
}
