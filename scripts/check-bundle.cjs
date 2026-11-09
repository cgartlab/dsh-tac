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

if (failures.length > 0) {
  console.error('\n' + failures.length + ' check(s) failed');
  process.exitCode = 1;
} else {
  console.log('bundle checks passed');
}
