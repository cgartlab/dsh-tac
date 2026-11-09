/**
 * Unit tests for the notification text helpers.
 *
 * These are pure functions but live inside the client bundle, so the module is compiled on the
 * fly with the same esbuild that builds the plugin. They matter because both used to produce
 * unreadable output: an approval reason object rendered as `[object Object]`, and a failed turn
 * announced as a completion.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');

const built = esbuild.buildSync({
  entryPoints: [path.join(root, 'src/features/notifications.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  write: false,
  logLevel: 'silent'
});
const module_ = { exports: {} };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(module_, module_.exports, require);
const { approvalReasonText, sessionFailureReason, formatPendingNotification } = module_.exports;

test('an approval reason renders as text, never as [object Object]', () => {
  assert.equal(approvalReasonText('needs write access'), 'needs write access');
  assert.equal(approvalReasonText({ en: 'Allow writing files?', zh: '允许写入文件吗？' }), '允许写入文件吗？', 'the Chinese copy wins for a zh-first UI');
  assert.equal(approvalReasonText({ en: 'Allow writing files?' }), 'Allow writing files?', 'falls back to English when only that exists');
  assert.equal(approvalReasonText({ message: 'Permission required' }), 'Permission required');
  assert.equal(approvalReasonText({ text: 'from text field' }), 'from text field');
  /* The shape the host actually sends for a nested message object. */
  assert.equal(approvalReasonText({ error: { message: 'nested' }, message: 'outer' }), 'outer', 'a direct message field wins over nesting');
  assert.equal(approvalReasonText({}), '');
  assert.equal(approvalReasonText(null), '');
  assert.equal(approvalReasonText(undefined), '');
  assert.equal(approvalReasonText(42), '');
});

test('the approval notification body embeds the readable reason', () => {
  const t = (key, params) => {
    if (key === 'notif.approvalBody') return 'Approval needed: ' + params.tool;
    if (key === 'notif.approvalChoices') return '1) Allow 2) Deny';
    return key;
  };
  const body = formatPendingNotification(
    { kind: 'approval', toolName: 'write', displayReason: { en: 'Write a file', zh: '写入一个文件' } },
    'Session',
    t
  );
  assert.match(body, /写入一个文件/, 'the localized reason is in the body');
  assert.doesNotMatch(body, /\[object Object\]/, 'and never the object placeholder');
});

test('the approval body still works when there is no reason at all', () => {
  const t = (key) => '(' + key + ')';
  const body = formatPendingNotification({ kind: 'approval', toolName: 'write' }, 'Session', t);
  assert.doesNotMatch(body, /\[object Object\]/);
  assert.match(body, /notif\.approvalChoices/);
});

test('a failed turn yields its reason from the session snapshot', () => {
  assert.equal(sessionFailureReason({ lastAgentError: 'Tool call timed out' }), 'Tool call timed out');
  assert.equal(sessionFailureReason({ promptError: { op: 'send', error: { message: 'rate limited' } } }), 'rate limited');
  assert.equal(
    sessionFailureReason({ lastAgentError: 'agent blew up', promptError: { error: { message: 'send failed' } } }),
    'agent blew up',
    'the agent error is the closer signal'
  );
});

test('a clean turn reports no failure', () => {
  assert.equal(sessionFailureReason({ lastAgentError: null, promptError: null }), '');
  assert.equal(sessionFailureReason({ running: false }), '');
  assert.equal(sessionFailureReason(null), '');
  assert.equal(sessionFailureReason(undefined), '');
  assert.equal(sessionFailureReason('not a snapshot'), '');
});

test('a very long failure reason is trimmed to a notification-sized line', () => {
  const long = 'x'.repeat(1000);
  const reason = sessionFailureReason({ lastAgentError: long });
  assert.equal(reason.length, 240);
});
