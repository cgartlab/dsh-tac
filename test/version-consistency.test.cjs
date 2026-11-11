'use strict';

/*
 * Guards for the version-bearing artifacts that npm/GitHub releases depend on. `package.json`
 * is the single source of truth; the built banners, the lockfile and the README screenshots all
 * have to agree with it, and a release must not be able to drift silently. The scripts are
 * spawned in throwaway copies so the failure paths themselves are exercised, not just the
 * happy path of the live repository.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));

function copyInto(target, relative) {
  const destination = path.join(target, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(path.join(root, relative), destination);
}

function runScript(cwd, script) {
  return spawnSync(process.execPath, [path.join(cwd, 'scripts', path.basename(script))], { cwd, encoding: 'utf8' });
}

test('both built artifacts carry the package version in their banner', () => {
  const pkg = readJson('package.json');
  for (const artifact of ['client.js', 'index.js']) {
    const head = fs.readFileSync(path.join(root, artifact), 'utf8').split('\n', 1)[0];
    assert.equal(head, '/*! dsh-tac ' + pkg.version + ' — generated from src/ by scripts/build.mjs; do not edit */', artifact + ' banner names the package version');
  }
});

test('check-bundle rejects an artifact whose banner names another version', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tac-banner-'));
  try {
    const pkg = readJson('package.json');
    for (const file of [
      'package.json',
      'package-lock.json',
      'cordis.patch.yml',
      'LICENSE',
      'README.md',
      'README.zh.md',
      'CHANGELOG.md',
      'icon.svg',
      'src/constants.ts',
      'locale/zh.json',
      'locale/en.json',
      'scripts/check-bundle.cjs'
    ]) copyInto(tmp, file);
    for (const artifact of ['client.js', 'index.js']) {
      const source = fs.readFileSync(path.join(root, artifact), 'utf8');
      fs.writeFileSync(path.join(tmp, artifact), source.replace('dsh-tac ' + pkg.version, 'dsh-tac 0.0.0-stale'));
    }

    const result = runScript(tmp, 'check-bundle.cjs');
    assert.equal(result.status, 1, 'a stale banner fails the bundle checks');
    assert.match(result.stderr, /banner version "0\.0\.0-stale" does not match package\.json version/);
    assert.match(result.stderr, /run `npm run build`/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('check-screenshots rejects an image replaced without metadata', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-tac-shots-'));
  try {
    for (const file of [
      'package.json',
      'CHANGELOG.md',
      'README.md',
      'README.zh.md',
      'screenshots.json',
      'screenshots.meta.json',
      'scripts/check-screenshots.cjs',
      'docs/screenshots/board.png',
      'docs/screenshots/hud.png',
      'docs/screenshots/palette.png'
    ]) copyInto(tmp, file);
    // The metadata names the source files each image depicts; the check verifies they exist.
    fs.cpSync(path.join(root, 'src'), path.join(tmp, 'src'), { recursive: true });

    const clean = runScript(tmp, 'check-screenshots.cjs');
    assert.equal(clean.status, 0, 'the shipped metadata passes: ' + clean.stderr);
    assert.match(clean.stdout, /screenshot checks passed/);

    // Replace one byte in the middle of the PNG: valid file, different hash.
    const target = path.join(tmp, 'docs/screenshots/palette.png');
    const bytes = fs.readFileSync(target);
    bytes[Math.floor(bytes.length / 2)] = bytes[Math.floor(bytes.length / 2)] ^ 0x01;
    fs.writeFileSync(target, bytes);

    const replaced = runScript(tmp, 'check-screenshots.cjs');
    assert.equal(replaced.status, 1, 'a replaced image fails the screenshot checks');
    assert.match(replaced.stderr, /sha256 for docs\/screenshots\/palette\.png does not match/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('every README screenshot is listed, embedded and version-checked', () => {
  const list = readJson('screenshots.json');
  const meta = readJson('screenshots.meta.json');
  const pkg = readJson('package.json');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const released = new Set(Array.from(changelog.matchAll(/^##\s*\[(\d+\.\d+\.\d+)\]/gm), (match) => match[1]));
  const readmes = ['README.md', 'README.zh.md'].map((file) => fs.readFileSync(path.join(root, file), 'utf8'));

  assert.ok(list.length > 0, 'the storefront manifest lists the screenshots');
  for (const relative of list) {
    assert.ok(fs.existsSync(path.join(root, relative)), relative + ' exists');
    for (const [index, text] of readmes.entries()) {
      assert.ok(text.includes('](' + relative + ')'), 'README #' + index + ' embeds ' + relative);
    }
    const entry = meta.images.find((candidate) => candidate.path === relative);
    assert.ok(entry, relative + ' has capture metadata');
    assert.ok(Array.isArray(entry.sources) && entry.sources.length > 0, relative + ' records the sources it depicts');
    for (const source of entry.sources) assert.ok(fs.existsSync(path.join(root, source)), relative + ' source exists: ' + source);
    assert.ok(entry.verifiedThrough, relative + ' records the commit it was verified against');
    assert.ok(released.has(entry.showsVersion), relative + ' records a released showsVersion');
    if (entry.showsVersion !== pkg.version) {
      const record = meta.acknowledgedStale.find((candidate) => candidate.path === relative);
      assert.ok(record, relative + ' is either current or explicitly acknowledged as stale');
    }
  }
});

test('version-report --offline agrees on the local surfaces', () => {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'version-report.cjs'), '--offline', '--pre-release'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, 'the checkout is self-consistent: ' + result.stderr + result.stdout);
  const pkg = readJson('package.json');
  for (const surface of ['package.json', 'package-lock.json', 'client.js banner', 'index.js banner', 'git tag']) {
    assert.ok(result.stdout.includes(surface), 'the report covers ' + surface);
  }
  assert.ok(result.stdout.includes(pkg.version), 'the report names the package version');
});
test('changelogSection extracts the notes without the dated heading', () => {
  const { changelogSection } = require('../scripts/version-report.cjs');
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const pkg = readJson('package.json');
  const released = ['0.5.1', '0.5.0', '0.4.3'].find((version) => changelog.indexOf('## [' + version + ']') >= 0);
  assert.ok(released, 'the changelog has at least one released section');
  const section = changelogSection(changelog, released);
  assert.ok(section && section.length > 20, 'a released section yields its notes');
  assert.ok(!section.startsWith('- 2026'), 'the heading date is not part of the notes: ' + section.slice(0, 40));
  assert.ok(!/^##\s*\[/.test(section), 'the next section is excluded');
  assert.equal(changelogSection(changelog, '0.0.0-nonexistent'), null, 'an unknown version yields null');
  assert.ok(changelog.indexOf('[' + pkg.version + ']') >= 0, 'the current version has its own section');
});