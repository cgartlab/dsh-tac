/**
 * One-shot cleanup: drop i18n keys that no source file references any more.
 *
 * Kept out of the build on purpose — this ran once to remove the column headers that the
 * project board superseded with settings.pc.* and the menu labels replaced by
 * menu.archiveTitle / menu.deleteTitle. It is not part of any npm script.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const DEAD = [
  'col.running',
  'col.current',
  'col.attention',
  'col.done',
  'col.idle',
  'col.total',
  'col.presets',
  'menu.archive',
  'menu.delete',
  'menu.archiveHint',
  'menu.deleteHint',
  /* The legacy HUD capsule toggle: superseded by headerButtons.capsule, and the label under
     settings.hb.* carries the current copy. */
  'settings.capsuleEnabled',
  'settings.capsuleEnabledDesc',
  /* Empty-state copy for the floating list, which renders nothing at all when it has no rows;
     the placeholder hint for a session cycle that has no current session. */
  'hud.collapsed',
  'hud.empty',
  'nav.cycle',
  'nav.noSession',
  'settings.shortcutConflict'
];

for (const file of ['src/i18n/zh.ts', 'src/i18n/en.ts']) {
  const full = path.join(root, file);
  let src = fs.readFileSync(full, 'utf8');
  let removed = 0;
  for (const key of DEAD) {
    /* Match `'key': 'value',` (or the double-quoted variant) with any leading spaces. */
    const re = new RegExp("\\s*'" + key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*(?:'[^']*'|\"[^\"]*\")\\s*,?", 'g');
    const before = src;
    src = src.replace(re, '');
    if (src !== before) removed += 1;
  }
  fs.writeFileSync(full, src, 'utf8');
  console.log(file + ': removed ' + removed + '/' + DEAD.length);
}
