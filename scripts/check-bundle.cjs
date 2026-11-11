const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const failures = [];

function fail(message) {
  failures.push(message);
  console.error('FAIL ' + message);
}

function checkFile(relative) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target)) { fail('missing file: ' + relative); return false; }
  return true;
}

function checkJson(relative) {
  const target = path.join(root, relative);
  if (!checkFile(relative)) return null;
  try {
    return JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch (error) {
    fail('invalid JSON: ' + relative + ' (' + error.message + ')');
    return null;
  }
}

for (const script of ['client.js', 'index.js']) {
  if (!checkFile(script)) continue;
  const result = spawnSync(process.execPath, ['--check', path.join(root, script)], { encoding: 'utf8' });
  if (result.status !== 0) fail('syntax error in ' + script + ': ' + (result.stderr || '').trim());
}

checkJson('locale/zh.json');
checkJson('locale/en.json');

const pkg = checkJson('package.json');
if (pkg) {
  if (!pkg.name) fail('package.json: missing name');
  if (!pkg.version) fail('package.json: missing version');
  if (pkg.type !== 'module') fail('package.json: type must be "module"');
  if (!pkg.license) fail('package.json: missing license');
  if (!pkg.dsh || !pkg.dsh.client || pkg.dsh.client.platform !== 'web') fail('package.json: dsh.client.platform must be "web"');
  if (!pkg.dsh || !pkg.dsh.bundle || !pkg.dsh.bundle.patch) fail('package.json: dsh.bundle.patch is required');
  else if (!checkFile(pkg.dsh.bundle.patch)) fail('bundle patch missing: ' + pkg.dsh.bundle.patch);
  for (const key of ['exports', 'files']) {
    if (!pkg[key]) fail('package.json: missing ' + key);
  }
  if (pkg.exports) {
    for (const [entry, target] of Object.entries(pkg.exports)) {
      const value = typeof target === 'string' ? target : (target && target.default);
      if (!value) continue;
      if (value.includes('*')) continue;
      if (!checkFile(value)) fail('exports["' + entry + '"] points at a missing file: ' + value);
    }
  }
}

/* A release bumps package.json and rebuilds the artifacts; the lockfile is the easy one to
   forget (0.5.1 shipped with a 0.5.0 lockfile). Both version fields in a lockfile must
   describe the same package version, otherwise `npm ci` installs a tree recorded for a
   different release and the repository's version-bearing files silently disagree. */
if (pkg && fs.existsSync(path.join(root, 'package-lock.json'))) {
  const lock = checkJson('package-lock.json');
  if (lock) {
    const rootVersion = lock.packages && lock.packages[''] ? lock.packages[''].version : undefined;
    if (lock.version !== pkg.version) {
      fail('package-lock.json: top-level version "' + String(lock.version) + '" does not match package.json version "' + pkg.version + '" — run npm install --package-lock-only --ignore-scripts');
    }
    if (rootVersion !== pkg.version) {
      fail('package-lock.json: packages[""].version "' + String(rootVersion) + '" does not match package.json version "' + pkg.version + '" — run npm install --package-lock-only --ignore-scripts');
    }
  }
}

if (!checkFile('cordis.patch.yml')) fail('missing cordis.patch.yml');
if (!checkFile('LICENSE')) fail('missing LICENSE');
for (const readme of ['README.md', 'README.zh.md']) checkFile(readme);

/* The changelog's newest heading has to describe the version that will ship. `[未发布]` is the
   repository's intended batch-then-release flow, so it counts as valid while changes accumulate;
   once a version heading is added it must match package.json or the release notes describe some
   other build. */
if (checkFile('CHANGELOG.md')) {
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const heading = /^##\s*\[([^\]]+)\]/m.exec(changelog);
  if (!heading) fail('CHANGELOG.md: missing a "## [version]" heading');
  else if (heading[1] !== '未发布' && pkg && pkg.version && heading[1] !== pkg.version) {
    fail('CHANGELOG.md: newest entry ' + heading[1] + ' does not match package.json version ' + pkg.version);
  }
  /* Sections have an order: an unreleased bucket only ever sits on top, and released versions
     strictly descend. A section inserted with the wrong anchor (which once put the preface text
     inside an older section) would otherwise pass every other check. */
  const headings = Array.from(changelog.matchAll(/^##\s*\[([^\]]+)\]/gm), (match) => match[1]);
  const versions = [];
  for (const [index, name] of headings.entries()) {
    if (name === '未发布') {
      if (index !== 0) fail('CHANGELOG.md: [未发布] must be the first section (found at position ' + (index + 1) + ')');
      continue;
    }
    if (!/^\d+\.\d+\.\d+$/.test(name)) {
      fail('CHANGELOG.md: section "' + name + '" is neither a version nor [未发布]');
      continue;
    }
    versions.push(name);
  }
  for (let index = 1; index < versions.length; index += 1) {
    const previous = versions[index - 1].split('.').map(Number);
    const current = versions[index].split('.').map(Number);
    const descending = previous[0] > current[0] || (previous[0] === current[0] && (previous[1] > current[1] || (previous[1] === current[1] && previous[2] > current[2])));
    if (!descending) fail('CHANGELOG.md: sections must descend, found ' + versions[index - 1] + ' before ' + versions[index]);
  }
  for (const name of new Set(versions)) {
    if (versions.filter((item) => item === name).length > 1) fail('CHANGELOG.md: duplicate section [' + name + ']');
  }
}

// The package name is the plugin's identity in three places at once: package.json,
// the client module id in src/constants.ts, and the loader entry inside cordis.patch.yml.
// client.js is generated from src/ by scripts/build.mjs, so the id there is a variable —
// check the source it comes from and prove the built bundle embeds the same name.
if (pkg && pkg.name && checkFile('client.js')) {
  const clientSource = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
  const constantsPath = path.join(root, 'src', 'constants.ts');
  if (!fs.existsSync(constantsPath)) fail('missing src/constants.ts');
  else {
    const constants = fs.readFileSync(constantsPath, 'utf8');
    const moduleId = /export const MODULE_ID = '([^']+)'/.exec(constants);
    if (!moduleId) fail('src/constants.ts: cannot read MODULE_ID');
    else if (moduleId[1] !== pkg.name) fail('src/constants.ts MODULE_ID "' + moduleId[1] + '" does not match package.json name "' + pkg.name + '"');
  }
  if (!clientSource.includes('__ModuleLoader__')) fail('client.js does not call window.__ModuleLoader__');
  if (!clientSource.includes('"' + pkg.name + '"') && !clientSource.includes("'" + pkg.name + "'")) {
    fail('client.js does not embed the package name "' + pkg.name + '" — rebuild with `npm run build`');
  }
  const staleIds = new Set();
  for (const match of clientSource.matchAll(/"(@local\/[^"]+)"/g)) {
    if (!match[1].startsWith(pkg.name)) staleIds.add(match[1]);
  }
  for (const stale of staleIds) fail('client.js still references the old package id "' + stale + '"');
  const patchPath = path.join(root, 'cordis.patch.yml');
  if (fs.existsSync(patchPath)) {
    const patch = fs.readFileSync(patchPath, 'utf8');
    if (!patch.includes("'" + pkg.name + "'")) fail('cordis.patch.yml does not insert package name "' + pkg.name + '"');
  }
}

/* Both artifacts carry the version in their banner. A release that bumps package.json without
   rebuilding would ship a tarball whose banner names the previous version, and `npm run check`
   alone would not notice (CI rebuilds and diffs, local runs do not). */
if (pkg && pkg.version) {
  for (const artifact of ['client.js', 'index.js']) {
    if (!checkFile(artifact)) continue;
    const head = fs.readFileSync(path.join(root, artifact), 'utf8').split('\n', 1)[0];
    const banner = /^\/\*! dsh-tac ([^\s]+) — generated from src\//.exec(head);
    if (!banner) fail(artifact + ': missing the generated banner — run `npm run build`');
    else if (banner[1] !== pkg.version) {
      fail(artifact + ': banner version "' + banner[1] + '" does not match package.json version "' + pkg.version + '" — run `npm run build`');
    }
  }
}
if (failures.length > 0) {
  console.error('\n' + failures.length + ' check(s) failed');
  process.exitCode = 1;
} else {
  console.log('bundle checks passed');
}
