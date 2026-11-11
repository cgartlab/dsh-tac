#!/usr/bin/env node
/*
 * One command to answer "is every version surface telling the same story?".
 *
 * The version lives in several independent places that a release has to move together:
 * package.json, the lockfile, the built banners, the changelog heading, the git tag, the npm
 * package, the GitHub release and the market catalog. Local surfaces must match exactly; the
 * external ones can legitimately lag (the catalog is rebuilt about once a day), so the script
 * exits non-zero only when a local surface disagrees or when the registry's latest is OLDER
 * than the checkout (a publish that never happened).
 *
 *   node scripts/version-report.cjs            # everything, network included
 *   node scripts/version-report.cjs --offline  # local + git only
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const offline = process.argv.includes('--offline');
const guiUrl = (process.argv.find((item) => item.startsWith('--gui=')) || '').slice('--gui='.length);
const CATALOG_URL = 'https://cdn.jsdelivr.net/npm/dsh-plugin-catalog/index.json';
const PACKAGE = 'dsh-tac';

const rows = [];
const problems = [];
const notes = [];

function row(surface, value, verdict, detail) {
  rows.push({ surface, value, verdict, detail });
}

function readJson(relative) {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch (error) {
    return null;
  }
}

async function npmLatest() {
  try {
    const data = await fetchJson('https://registry.npmjs.org/' + PACKAGE + '/latest', 8000);
    return { version: String(data.version || ''), at: data._npmUser ? undefined : undefined };
  } catch (error) {
    return { error: error.message };
  }
}

async function catalogEntry(version) {
  try {
    const data = await fetchJson(CATALOG_URL, 12000);
    const entry = Array.isArray(data.plugins) ? data.plugins.find((item) => item && item.name === PACKAGE) : null;
    if (!entry) return { error: 'not listed in the catalog' };
    return { versions: Array.isArray(entry.versions) ? entry.versions.map((item) => String(item.version)) : [] };
  } catch (error) {
    return { error: error.message };
  }
}

function changelogSection(text, version) {
  const marker = '## [' + version + ']';
  const start = text.indexOf(marker);
  if (start < 0) return null;
  // Drop the heading line itself (it carries the release date, which the notes do not repeat).
  const lineEnd = text.indexOf('\n', start);
  if (lineEnd < 0) return '';
  const body = text.slice(lineEnd + 1);
  const next = body.search(/^##\s*\[/m);
  return (next < 0 ? body : body.slice(0, next)).trim();
}

async function main() {
  const pkg = readJson('package.json');
  const version = String(pkg.version);
  row('package.json', version, 'local', '');

  const lockPath = path.join(root, 'package-lock.json');
  if (fs.existsSync(lockPath)) {
    const lock = readJson('package-lock.json');
    const lockVersion = String(lock.version || '');
    const rootVersion = String((lock.packages && lock.packages[''] && lock.packages[''].version) || '');
    const ok = lockVersion === version && rootVersion === version;
    row('package-lock.json', lockVersion + ' / ' + rootVersion, ok ? 'local' : 'MISMATCH', ok ? '' : 'run npm install --package-lock-only --ignore-scripts');
    if (!ok) problems.push('package-lock.json version disagrees with package.json');
  }

  for (const artifact of ['client.js', 'index.js']) {
    const target = path.join(root, artifact);
    if (!fs.existsSync(target)) {
      row(artifact + ' banner', '(missing)', 'MISMATCH', '');
      problems.push(artifact + ' is missing');
      continue;
    }
    const head = fs.readFileSync(target, 'utf8').split('\n', 1)[0];
    const banner = /^\/\*! dsh-tac ([^\s]+) — generated/.exec(head);
    const bannerVersion = banner ? banner[1] : '';
    const ok = bannerVersion === version;
    row(artifact + ' banner', bannerVersion || '(no banner)', ok ? 'local' : 'MISMATCH', ok ? '' : 'run npm run build');
    if (!ok) problems.push(artifact + ' banner disagrees with package.json');
  }

  const changelogRaw = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
const changelog = changelogRaw;
  const heading = /^##\s*\[([^\]]+)\]/m.exec(changelog);
  const headingValue = heading ? heading[1] : '(none)';
  const headingOk = headingValue === version || headingValue === '未发布';
  row('CHANGELOG heading', headingValue, headingOk ? 'local' : 'MISMATCH', headingOk ? '' : 'newest section must be the released version or [未发布]');
  if (!headingOk) problems.push('CHANGELOG heading disagrees with package.json');

  /* A shallow clone (CI) has no tags at all — that is not a version problem, just a checkout
     that cannot answer. Only a missing tag in a clone that does have tags is a real gap. */
  const tagOutput = git(['tag', '--list']);
  const tags = tagOutput === null ? null : tagOutput.split('\n').map((item) => item.trim()).filter(Boolean);
  if (tags === null) {
    row('git tag', 'unavailable', 'skipped', 'git is not available');
  } else if (tags.length === 0) {
    row('git tag', 'none fetched', 'skipped', 'this clone has no tags (shallow checkout)');
  } else {
    const tagOk = tags.indexOf('v' + version) >= 0;
    row('git tag', tagOk ? 'v' + version : '(missing)', tagOk ? 'local' : 'MISMATCH', tagOk ? '' : 'git tag v' + version);
    if (!tagOk) problems.push('git tag v' + version + ' is missing');
  }

  if (offline) {
    row('npm registry', 'skipped', 'skipped', '--offline');
    row('market catalog', 'skipped', 'skipped', '--offline');
  } else {
    const latest = await npmLatest();
    if (latest.error) {
      row('npm registry', 'unreachable', 'skipped', latest.error);
    } else {
      const verdict = latest.version === version ? 'remote' : latest.version < version ? 'MISMATCH' : 'ahead';
      row('npm registry', latest.version, verdict, verdict === 'ahead' ? 'registry is newer than this checkout' : verdict === 'MISMATCH' ? 'publish ' + version : '');
      if (verdict === 'MISMATCH') problems.push('npm latest is ' + latest.version + ' but the checkout is ' + version + ' (publish it)');
    }

    const catalog = await catalogEntry(version);
    if (catalog.error) {
      row('market catalog', 'unavailable', 'skipped', catalog.error);
    } else {
      const listed = catalog.versions.indexOf(version) >= 0;
      row('market catalog', catalog.versions.join(', ') || '(none)', listed ? 'remote' : 'lags', listed ? '' : 'rebuilt about once a day; expected to pick up ' + version + ' on the next build');
      if (!listed) notes.push('market catalog has not picked up ' + version + ' yet (daily rebuild)');
    }
  }

  /* The GitHub release notes are the version's public documentation; they are copied from the
     changelog section at release time, so a later edit to either one has to be mirrored. `gh` is
     only present on the release machine, so a missing or unauthenticated CLI skips the row. */
  if (!offline) {
    const section = changelogSection(changelogRaw, version);
    try {
      const body = execFileSync('gh', ['release', 'view', 'v' + version, '--json', 'body'], { cwd: root, encoding: 'utf8' });
      const notes = JSON.parse(body).body || '';
      if (section === null) {
        row('GitHub release notes', 'no changelog section', 'skipped', 'CHANGELOG has no [' + version + '] section');
      } else {
        const normalize = (text) => text.split('\n').map((line) => line.trim()).filter(Boolean).join('\n');
        const same = normalize(notes) === normalize(section);
        row('GitHub release notes', same ? 'match CHANGELOG' : 'DIFFERENT', same ? 'remote' : 'MISMATCH', same ? '' : 'edit the release body or the changelog section so both are identical');
        if (!same) problems.push('GitHub release notes for v' + version + ' differ from the CHANGELOG section');
      }
    } catch (error) {
      row('GitHub release notes', 'unavailable', 'skipped', 'gh CLI is not available or not authenticated');
    }
  }
  /* The desktop app serves the market's update API without authentication, so `--gui=<url>`
     lets the report also confirm what the RUNNING app has installed. Without the flag the row is
     absent: this is a live check, not something CI or an offline release run can do. */
  if (guiUrl && !offline) {
    try {
      const url = guiUrl.replace(/\/$/, '') + '/dsh-market/api/v1/updates?name=' + PACKAGE;
      const data = await fetchJson(url, 8000);
      const pkgRow = data && data.package ? data.package : null;
      if (!pkgRow) {
        row('running app (market API)', 'no package row', 'skipped', 'the GUI answered without a package entry');
      } else {
        const installed = String(pkgRow.installedVersion || '');
        const latest = String(pkgRow.latestVersion || '');
        const ok = installed === version;
        row('running app (market API)', 'installed ' + (installed || '?') + ' / market latest ' + (latest || '?'), ok ? 'local' : 'MISMATCH', ok ? '' : 'the running app still has ' + installed + ' installed — restart or reload it');
        if (!ok) problems.push('the running app has ' + installed + ' installed but the checkout is ' + version);
      }
    } catch (error) {
      row('running app (market API)', 'unreachable', 'skipped', error.message);
    }
  }
  const width = rows.reduce((max, item) => Math.max(max, item.surface.length), 0);
  for (const item of rows) {
    const verdict = item.verdict.padEnd(9);
    const detail = item.detail ? '  ' + item.detail : '';
    console.log(item.surface.padEnd(width) + '  ' + verdict + '  ' + item.value + detail);
  }
  for (const note of notes) console.log('NOTE ' + note);

  if (problems.length > 0) {
    console.error('\n' + problems.length + ' version problem(s)');
    process.exitCode = 1;
  } else {
    console.log('\nlocal version surfaces agree on ' + version);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('version report failed: ' + (error && error.stack ? error.stack : error));
    process.exitCode = 1;
  });
} else {
  module.exports = { changelogSection };
}
