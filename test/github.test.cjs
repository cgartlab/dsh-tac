/**
 * Unit tests for the GitHub data source.
 *
 * `src/core/github.ts` is pure (it takes a fetch implementation), but the shipped bundle is a
 * self-contained IIFE, so the module is compiled on the fly with the same esbuild that builds
 * the plugin. That keeps the tests against the real source instead of a copy of its logic.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const built = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/core/github.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  write: false,
  logLevel: 'silent'
});
const module_ = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module_, module_.exports, require);
const { fetchRepoStats, normalizeVersion } = module_.exports;

/** A fetch stand-in: maps a URL suffix to a response body/status. */
function stubFetch(routes) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const match = Object.keys(routes).find((fragment) => url.includes(fragment));
    if (!match) return { ok: false, status: 500, json: async () => ({}), headers: { get: () => null } };
    const route = routes[match];
    const status = route.status === undefined ? 200 : route.status;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => route.body,
      headers: { get: (name) => (name.toLowerCase() === 'link' ? route.link || null : null) }
    };
  };
  impl.calls = calls;
  return impl;
}

const REPO = { open_issues_count: 12 };
const PULLS_ONE = [{ number: 1 }];

test('open issues exclude pull requests, because GitHub counts them together', async () => {
  const fetchImpl = stubFetch({
    '/pulls?state=open&per_page=1': { body: PULLS_ONE, link: '<https://api.github.com/x?page=1>; rel="last"' },
    '/releases/latest': { body: { tag_name: 'v1.4.2' } },
    'api.github.com/repos/o/r': { body: REPO }
  });
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.status, 'ok');
  assert.equal(stats.issues, 11, 'twelve open items minus one pull request');
  assert.equal(stats.prs, 1);
  assert.equal(stats.latestVersion, '1.4.2', 'the release tag loses its v prefix');
});

test('the pull-request count comes from the Link header past one page', async () => {
  /* per_page=1 means the last page number is the exact count, which stays right beyond 100. */
  const fetchImpl = stubFetch({
    '/pulls?state=open&per_page=1': {
      body: PULLS_ONE,
      link: '<https://api.github.com/x?page=2>; rel="next", <https://api.github.com/x?page=137>; rel="last"'
    },
    '/releases/latest': { body: { tag_name: 'v2.0.0' } },
    'api.github.com/repos/o/r': { body: REPO }
  });
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.prs, 137, 'the last page number is the open pull-request count');
  assert.equal(stats.issues, 0, 'twelve open items is fewer than 137 pull requests, so issues clamp to zero');
});

test('without a Link header the body length is the count', async () => {
  const fetchImpl = stubFetch({
    '/pulls?state=open&per_page=1': { body: PULLS_ONE },
    '/releases/latest': { body: { tag_name: 'v1.0.0' } },
    'api.github.com/repos/o/r': { body: { open_issues_count: 5 } }
  });
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.prs, 1, 'one pull request in the body');
  assert.equal(stats.issues, 4);
});

test('a missing release leaves the latest version unset instead of failing the row', async () => {
  const fetchImpl = stubFetch({
    '/pulls?state=open&per_page=1': { body: [] },
    '/releases/latest': { status: 404, body: { message: 'Not Found' } },
    'api.github.com/repos/o/r': { body: { open_issues_count: 0 } }
  });
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.status, 'ok');
  assert.equal(stats.latestVersion, undefined);
  assert.equal(stats.issues, 0);
});

test('HTTP failures map to messages the row can explain', async () => {
  const cases = [
    [404, 'repo-not-found'],
    [401, 'token-invalid'],
    [403, 'rate-limited'],
    [429, 'rate-limited'],
    [500, 'HTTP 500']
  ];
  for (const [status, expected] of cases) {
    const fetchImpl = stubFetch({
      '/pulls?state=open&per_page=1': { body: [] },
      '/releases/latest': { body: {} },
      'api.github.com/repos/o/r': { status, body: {} }
    });
    const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
    assert.equal(stats.status, 'error', status + ' is an error');
    assert.equal(stats.error, expected, status + ' maps to ' + expected);
  }
});

test('an aborted request reads as a timeout, not a raw DOMException name', async () => {
  /* Without a deadline a stalled connection left the cell on "loading" forever; when the abort
     fires the reason has to be something the row can show. */
  const fetchImpl = async () => {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    throw error;
  };
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.status, 'error');
  assert.equal(stats.error, 'timeout');
});

test('a plain network failure keeps the message instead of guessing', async () => {
  const fetchImpl = async () => {
    throw new Error('Failed to fetch');
  };
  const stats = await fetchRepoStats('o', 'r', undefined, fetchImpl);
  assert.equal(stats.status, 'error');
  assert.equal(stats.error, 'Failed to fetch');
});

test('the token travels in the Authorization header, and only when given', async () => {
  const withToken = stubFetch({
    '/pulls?state=open&per_page=1': { body: [] },
    '/releases/latest': { body: {} },
    'api.github.com/repos/o/r': { body: REPO }
  });
  await fetchRepoStats('o', 'r', '  tok_123  ', withToken);
  assert.equal(withToken.calls[0].init.headers.Authorization, 'Bearer tok_123', 'the token is trimmed');

  const withoutToken = stubFetch({
    '/pulls?state=open&per_page=1': { body: [] },
    '/releases/latest': { body: {} },
    'api.github.com/repos/o/r': { body: REPO }
  });
  await fetchRepoStats('o', 'r', undefined, withoutToken);
  assert.equal(withoutToken.calls[0].init.headers.Authorization, undefined, 'public repositories need no token');
});

test('owner and repo are encoded into the path', async () => {
  const fetchImpl = stubFetch({
    '/pulls?state=open&per_page=1': { body: [] },
    '/releases/latest': { body: {} },
    'api.github.com/repos/': { body: REPO }
  });
  await fetchRepoStats('a b', 'c/d', undefined, fetchImpl);
  assert.match(fetchImpl.calls[0].url, /repos\/a%20b\/c%2Fd$/, 'path segments are escaped');
});

test('normalizeVersion only strips a v that prefixes a digit', () => {
  assert.equal(normalizeVersion('v1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('1.2.3'), '1.2.3');
  assert.equal(normalizeVersion('version-2'), 'version-2', 'a word starting with v is left alone');
  assert.equal(normalizeVersion(undefined), undefined);
});
