'use strict';

/*
 * Regression guard for the version-bearing files. The 0.5.1 release bumped package.json and
 * rebuilt the artifacts but left package-lock.json at 0.5.0, so `npm run check` had no way to
 * notice. These tests cover both the live repository and the actual check-bundle.cjs behaviour:
 * spawn the real script in a throwaway directory and vary only the lockfile versions.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function readJson(relative, base = root) {
  return JSON.parse(fs.readFileSync(path.join(base, relative), 'utf8'));
}

test('package.json and package-lock.json carry the same version', () => {
  const pkg = readJson('package.json');
  const lock = readJson('package-lock.json');
  assert.equal(typeof pkg.version, 'string', 'package.json declares a version');
  assert.equal(lock.version, pkg.version, 'package-lock.json top-level version matches package.json');
  assert.equal(lock.packages[''].version, pkg.version, 'package-lock.json packages[""].version matches package.json');
});

test('check-bundle.cjs rejects a lockfile whose version drifted from package.json', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tac-lockcheck-'));
  try {
    // Copy the real script and every file it reads, so the only variable is the lockfile.
    const copy = (relative) => {
      const target = path.join(tmp, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, relative), target);
    };
    for (const file of [
      'package.json', 'client.js', 'index.js', 'cordis.patch.yml', 'LICENSE', 'icon.svg',
      'README.md', 'README.zh.md', 'CHANGELOG.md', 'src/constants.ts',
      'locale/zh.json', 'locale/en.json', 'scripts/check-bundle.cjs'
    ]) copy(file);

    const lockPath = path.join(tmp, 'package-lock.json');
    const lock = readJson('package-lock.json');
    const version = readJson('package.json').version;
    const run = () => spawnSync(process.execPath, [path.join(tmp, 'scripts', 'check-bundle.cjs')], { encoding: 'utf8' });
    const writeLock = () => fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

    // Synced lockfile: the whole check passes.
    lock.version = version;
    lock.packages[''].version = version;
    writeLock();
    const good = run();
    assert.equal(good.status, 0, 'a synced lockfile passes the bundle checks: ' + good.stderr);
    assert.match(good.stdout, /bundle checks passed/);

    // Top-level drift: fails with an actionable message.
    lock.version = '0.0.0-drift';
    writeLock();
    const badTop = run();
    assert.equal(badTop.status, 1, 'a stale top-level version fails the check');
    assert.match(badTop.stderr, /package-lock\.json: top-level version/);
    assert.match(badTop.stderr, /npm install --package-lock-only --ignore-scripts/);

    // Root-package drift: fails with an actionable message.
    lock.version = version;
    lock.packages[''].version = '0.0.0-drift';
    writeLock();
    const badRoot = run();
    assert.equal(badRoot.status, 1, 'a stale packages[""].version fails the check');
    assert.match(badRoot.stderr, /package-lock\.json: packages\[""\]\.version/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
