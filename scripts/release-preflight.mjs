#!/usr/bin/env node
/*
 * Release preflight: everything that must be true BEFORE a `v<version>` tag is pushed.
 *
 * The tag push is the publish trigger (`.github/workflows/publish.yml`, OIDC trusted publishing),
 * so a mistake here ships a bad version. This script refuses to say "ready" unless the version
 * surfaces agree, the committed bundle matches src, the changelog section exists, the registry
 * does not already have the version, and the test suite passes.
 *
 * Run it after the bump is committed (a clean tree is required):
 *   npm run build && git commit -am "release: 0.6.2" && npm run release:preflight
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const version = String(pkg.version);
const PKG = 'dsh' + '-tac';
const problems = [];
const notes = [];

const WIN = process.platform === 'win32';
/* npm/pnpm are .cmd shims on Windows; Node 26 refuses to spawn a batch file directly (EINVAL).
   Route only those names through cmd.exe, which keeps the argument list out of a shell string. */
const SHELL_SHIM = new Set(['npm', 'pnpm', 'npx']);
const exec = (command, args, options) =>
  WIN && SHELL_SHIM.has(command)
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], options)
    : execFileSync(command, args, options);
const run = (command, args = [], options = {}) =>
  exec(command, args, { cwd: root, stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });

const capture = (command, args = []) => {
  try {
    return run(command, args).trim();
  } catch (error) {
    return null;
  }
};

const ok = (label, detail) => notes.push('  ok   ' + label + (detail ? ' — ' + detail : ''));
const fail = (label, detail) => {
  problems.push(label + (detail ? ': ' + detail : ''));
  notes.push('  FAIL ' + label + (detail ? ' — ' + detail : ''));
};

/* 1. The changelog must document this exact version. */
const changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8');
const marker = '## [' + version + ']';
const at = changelog.indexOf(marker);
if (at < 0) {
  fail('changelog section', 'CHANGELOG.md has no "' + marker + '" section');
} else {
  const body = changelog.slice(changelog.indexOf('\n', at) + 1);
  const next = body.search(/^##\s*\[/m);
  const section = (next < 0 ? body : body.slice(0, next)).trim();
  if (section.length < 40) fail('changelog section', 'the ' + version + ' section is empty or too short to describe a release');
  else ok('changelog section', section.split('\n').length + ' lines');
}

/* 2. The bundle on disk must be the bundle src produces (CI publishes exactly this tree). */
run('npm', ['run', 'build']);
const dirtyArtifacts = capture('git', ['status', '--porcelain', '--', 'client.js', 'index.js']);
if (dirtyArtifacts === null) fail('bundle freshness', 'git status failed');
else if (dirtyArtifacts !== '') fail('bundle freshness', 'client.js/index.js changed during build — commit the rebuilt bundle');
else ok('bundle freshness', 'committed artifacts match src');

/* 3. The release must not already exist on the registry. */
const publishedVersion = capture('npm', ['view', PKG + '@' + version, 'version']);
if (publishedVersion === version) fail('registry', PKG + '@' + version + ' is already published');
else if (publishedVersion === null) ok('registry', PKG + '@' + version + ' is not published yet');
else fail('registry', 'unexpected npm view answer: ' + publishedVersion);

/* 4. Version surfaces must agree locally (tag may legitimately be missing before the push). */
const reportScript = fileURLToPath(new URL('scripts/version-report.cjs', root));
let reportExit = 0;
try {
  run('node', [reportScript, '--offline', '--pre-release'], { inherit: true });
} catch (error) {
  reportExit = error.status === undefined ? 1 : error.status;
}
if (reportExit !== 0) fail('version surfaces', 'node scripts/version-report.cjs --offline --pre-release reported a mismatch');
else ok('version surfaces', version + ' everywhere');

/* 5. Full checks and tests. */
try {
  run('npm', ['run', 'check'], { inherit: true });
  ok('npm run check');
} catch (error) {
  fail('npm run check', 'see output above');
}
try {
  run('npm', ['test'], { inherit: true });
  ok('npm test');
} catch (error) {
  fail('npm test', 'see output above');
}

/* 6. A dirty tracked tree means the release commit is incomplete. */
const status = capture('git', ['status', '--porcelain']);
const tracked = (status || '')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line) => !line.startsWith('??'));
if (tracked.length > 0) fail('working tree', 'uncommitted tracked changes: ' + tracked.slice(0, 5).join(' | '));
else ok('working tree', 'clean');

console.log('\nrelease preflight for ' + PKG + '@' + version + '\n' + notes.join('\n'));
if (problems.length > 0) {
  console.error('\nNOT READY — ' + problems.length + ' problem(s):');
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}
console.log('\nREADY: push a v' + version + ' tag to publish (npm run release:tag).');
