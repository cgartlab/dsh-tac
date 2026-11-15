#!/usr/bin/env node
/*
 * One command for a local release: verify the checkout, verify npm auth, build, test, publish.
 *
 * The auth preflight exists because a dead token used to surface only at `npm publish` with a
 * bare 401/E404; `npm whoami` says whether this shell can write to the registry before anything
 * expensive runs. Trusted publishing (CI on a v* tag) needs no token at all — this is the local
 * fallback for when that is not configured yet.
 *
 *   node scripts/release.mjs            # publish the version in package.json
 *   node scripts/release.mjs --dry-run  # stop before `npm publish`
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dryRun = process.argv.includes('--dry-run');
const root = new URL('..', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

const run = (command, args = []) => {
  process.stdout.write('\n$ ' + [command, ...args].join(' ') + '\n');
  execFileSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
};

const capture = (command, args = []) => {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return '';
  }
};

const user = capture('npm', ['whoami']);
if (!user) {
  console.error(
    [
      '',
      'npm is not authenticated in this environment.',
      '',
      'Run this once in a Windows terminal (one browser 2FA confirmation):',
      '  npm login --auth-type=web --registry=https://registry.npmjs.org/',
      '',
      'Then `npm whoami` must print your account and `node scripts/release.mjs` can publish.',
      'Trusted publishing (a v* tag runs .github/workflows/publish.yml) needs no token at all.'
    ].join('\n')
  );
  process.exit(1);
}
console.log('npm authenticated as ' + user);

run('npm', ['run', 'build']);
run('npm', ['run', 'check']);
run('npm', ['test']);

if (dryRun) {
  console.log('\n--dry-run: skipping `npm publish` for ' + pkg.name + '@' + pkg.version);
  process.exit(0);
}

run('npm', ['publish']);
console.log(
  [
    '',
    'Published ' + pkg.name + '@' + pkg.version + '.',
    '',
    'Tag and release so the version surfaces agree:',
    '  git tag -a v' + pkg.version + ' -m "v' + pkg.version + '"',
    '  git push origin v' + pkg.version,
    '  gh release create v' + pkg.version + ' --latest --notes-file <changelog section>',
    '  npm run version:report'
  ].join('\n')
);
