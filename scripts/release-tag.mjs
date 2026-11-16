#!/usr/bin/env node
/*
 * Tag-driven release: annotated tag -> push -> GitHub release -> publish workflow -> registry proof.
 *
 * Publishing runs in GitHub Actions with OIDC trusted publishing, so this needs no npm token and
 * no interactive login: the tag push is the only thing that starts it. The GitHub release notes
 * are copied verbatim from the CHANGELOG section, which `npm run version:report` then compares
 * against the published release.
 *
 *   npm run release:preflight        # must print READY first
 *   npm run release:tag              # tag + push + release + wait for the publish run
 *   npm run release:tag -- --dry-run # print the plan, change nothing
 *   npm run release:tag -- --install # also reinstall the local DSH profile from the registry
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const dryRun = process.argv.includes('--dry-run');
const install = process.argv.includes('--install');
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const version = String(pkg.version);
const tag = 'v' + version;
const PKG = 'dsh' + '-tac';

const WIN = process.platform === 'win32';
/* npm/pnpm are .cmd shims on Windows; Node 26 refuses to spawn a batch file directly (EINVAL).
   Route only those names through cmd.exe, which keeps the argument list out of a shell string. */
const SHELL_SHIM = new Set(['npm', 'pnpm', 'npx']);
const exec = (command, args, options) =>
  WIN && SHELL_SHIM.has(command)
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command, ...args], options)
    : execFileSync(command, args, options);
const run = (command, args, options = {}) => {
  process.stdout.write('\n$ ' + [command, ...args].join(' ') + '\n');
  return exec(command, args, { cwd: root, stdio: options.inherit === false ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8' });
};

const capture = (command, args) => {
  try {
    return run(command, args, { inherit: false }).trim();
  } catch (error) {
    return null;
  }
};

/* 1. Refuse to tag a tree that would fail the workflow or already shipped. */
const status = capture('git', ['status', '--porcelain']) || '';
const tracked = status.split('\n').map((line) => line.trim()).filter(Boolean).filter((line) => !line.startsWith('??'));
if (tracked.length > 0) {
  console.error('Uncommitted tracked changes — commit the release first:\n  ' + tracked.slice(0, 6).join('\n  '));
  process.exit(1);
}
const changelog = readFileSync(new URL('CHANGELOG.md', root), 'utf8');
const start = changelog.indexOf('## [' + version + ']');
if (start < 0) {
  console.error('CHANGELOG.md has no "## [' + version + ']" section.');
  process.exit(1);
}
const body = changelog.slice(changelog.indexOf('\n', start) + 1);
const next = body.search(/^##\s*\[/m);
const section = (next < 0 ? body : body.slice(0, next)).trim();

const localTag = capture('git', ['tag', '--list', tag]);
if (localTag === '') {
  console.log('tag ' + tag + ' does not exist locally yet');
} else {
  console.error('tag ' + tag + ' already exists locally — bump the version instead of re-tagging.');
  process.exit(1);
}
const remoteTag = capture('git', ['ls-remote', '--tags', 'origin', 'refs/tags/' + tag]);
if (remoteTag === null) {
  console.error('cannot reach origin to confirm the tag is unused (network?). Re-run when the network is back.');
  process.exit(1);
}
if (remoteTag !== '') {
  console.error('tag ' + tag + ' already exists on origin.');
  process.exit(1);
}
const registryVersion = capture('npm', ['view', PKG + '@' + version, 'version']);
if (registryVersion === version) {
  console.error(PKG + '@' + version + ' is already published.');
  process.exit(1);
}

/* 2. The plan. */
const notesFile = join(tmpdir(), 'dsh-tac-' + version + '-release-notes.md');
writeFileSync(notesFile, section + '\n', 'utf8');
const plan = [
  ['git', ['tag', '-a', tag, '-m', tag + ' — ' + (section.split('\n')[0] || '').replace(/^[-*]\s*/, '').replace(/[*`]/g, '').slice(0, 60)]],
  ['git', ['push', 'origin', tag]],
  ['gh', ['release', 'create', tag, '--title', tag + ' — ' + version, '--notes-file', notesFile, '--latest']]
];
if (dryRun) {
  console.log('\n--dry-run plan:\n' + plan.map(([command, args]) => '  ' + [command, ...args].join(' ')).join('\n'));
  console.log('\nrelease notes (' + notesFile + '):\n' + section);
  process.exit(0);
}
for (const [command, args] of plan) run(command, args);

/* 3. Wait for the publish workflow, then prove the registry has it. */
console.log('\nwaiting for the publish run of ' + tag + ' (up to 10 minutes)…');
const deadline = Date.now() + 10 * 60 * 1000;
let published = false;
while (Date.now() < deadline) {
  const current = capture('npm', ['view', PKG + '@' + version, 'version']);
  if (current === version) {
    published = true;
    break;
  }
  const runs = capture('gh', ['run', 'list', '--workflow', 'publish.yml', '--limit', '3', '--json', 'status,conclusion,headBranch,url,event']);
  if (runs) {
    try {
      const parsed = JSON.parse(runs);
      const failed = parsed.find((item) => item.conclusion === 'failure');
      if (failed && String(failed.headBranch) === tag) {
        console.error('publish run failed: ' + failed.url);
        process.exit(1);
      }
    } catch (error) {
      /* keep polling */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 15000));
}
if (!published) {
  console.error('timed out waiting for ' + PKG + '@' + version + ' — check https://github.com/cgartlab/dsh-tac/actions');
  process.exit(1);
}
console.log('\npublished ' + PKG + '@' + version);

/* 4. Optional: move the local DSH profile off whatever it had and onto the registry build. */
if (install) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const profile = join(home, '.dsh', 'profiles', 'desktop');
  process.stdout.write('\n$ pnpm add ' + PKG + '@' + version + '  (in ' + profile + ')\n');
  execFileSync('pnpm', ['add', PKG + '@' + version], { cwd: profile, stdio: 'inherit', shell: false });
}
console.log('\nNext: npm run version:report -- --gui=http://127.0.0.1:<port>');
