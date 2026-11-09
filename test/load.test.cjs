const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

function createLocalStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear()
  };
}

function createElementStub() {
  return {
    textContent: '',
    style: {},
    dataset: {},
    setAttribute(name, value) { (this._attrs || (this._attrs = {}))[name] = value; },
    removeAttribute(name) { if (this._attrs) delete this._attrs[name]; },
    appendChild() {},
    remove() {},
    addEventListener() {},
    removeEventListener() {}
  };
}

function createDocumentStub() {
  const head = createElementStub();
  return {
    head,
    body: createElementStub(),
    documentElement: createElementStub(),
    scrollingElement: createElementStub(),
    visibilityState: 'visible',
    hasFocus: () => true,
    createElement: createElementStub,
    createElementNS: createElementStub,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    addEventListener() {},
    removeEventListener() {}
  };
}

function createReactStub() {
  const noop = () => {};
  return {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, noop],
    useEffect: noop,
    useLayoutEffect: noop,
    useMemo: (factory) => factory(),
    useRef: (value) => ({ current: value }),
    useCallback: (fn) => fn,
    Fragment: 'Fragment'
  };
}

function loadModule(platform = 'test', navExtras = {}) {
  let captured = null;
  const localStorage = createLocalStorage();
  const document = createDocumentStub();
  const window = {
    document,
    localStorage,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    navigator: Object.assign({ platform: platform }, navExtras),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { fn(0); return 0; },
    cancelAnimationFrame: () => {},
    __ModuleLoader__: { load: (spec) => { captured = spec; } }
  };
  const sandbox = { window, document, localStorage, console, setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, requestAnimationFrame: window.requestAnimationFrame };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(captured, 'module loader receives the plugin spec');
  const module = captured.factory((id) => {
    if (id === 'react') return createReactStub();
    throw new Error('unexpected runtime dependency: ' + id);
  });
  return { module, window, document, localStorage };
}

function createContext(window, document) {
  const translations = {};
  const registrations = [];
  const effects = [];
  const ctx = {
    locale: {
      register(namespace, dicts) { translations[namespace] = dicts; },
      bind(namespace) {
        return (key, params) => {
          const table = (translations[namespace] || {})[key] ? (translations[namespace] || {}) : null;
          let text = table ? table[key] : key;
          if (params) {
            for (const [name, value] of Object.entries(params)) text = text.split('{' + name + '}').join(String(value));
          }
          return text;
        };
      }
    },
    effect(factory) { const dispose = factory(); if (typeof dispose === 'function') effects.push(dispose); return () => {}; },
    get() { return undefined; },
    sidebarRightTabs: { register() { return () => {}; } },
    slots: {
      inject(name, factory) { return factory(); },
      register(spec, component) { registrations.push({ spec, component }); return () => {}; }
    }
  };
  return { ctx, translations, registrations, effects };
}

test('client bundle loads and mounts against stubbed host services', () => {
  const { module, window, document } = loadModule();
  assert.ok(Array.isArray(module.inject), 'module declares inject list');
  for (const service of ['slots', 'locale', 'remote', 'remote.session', 'sidebarRight', 'layout']) {
    assert.ok(module.inject.includes(service), 'inject list includes ' + service);
  }

  const { ctx, translations, registrations } = createContext(window, document);
  module.apply(ctx);

  assert.ok(translations.projectBoard, 'locale dictionaries registered');
  assert.ok(Object.keys(translations.projectBoard.zh || {}).length > 100, 'zh dictionary is populated');
  assert.ok(Object.keys(translations.projectBoard.en || {}).length > 100, 'en dictionary is populated');

  const ids = registrations.map((entry) => entry.spec.id);
  const expected = [
    'project-board',
    'project-board-header-right',
    'project-board-buttons',
    'project-board-palette',
    'project-board-session-menu',
    'project-board-rename',
    'project-board-hud',
    'project-board-toast',
    'project-board-notifier',
    'project-board-notification-dock',
    'project-board-settings'
  ];
  for (const id of expected) assert.ok(ids.includes(id), 'registered slot ' + id);
  for (const entry of registrations) assert.equal(typeof entry.component, 'function', 'slot ' + entry.spec.id + ' has a component');
});

test('zh and en dictionaries expose the same keys', () => {
  const { module, window, document } = loadModule();
  const { ctx, translations } = createContext(window, document);
  module.apply(ctx);
  const zh = Object.keys(translations.projectBoard.zh).sort();
  const en = Object.keys(translations.projectBoard.en).sort();
  assert.deepEqual(zh, en);
});

test('the plugin marks the platform itself (Electron injects it only in the native window)', () => {
  const mac = loadModule('MacIntel');
  const macCtx = createContext(mac.window, mac.document).ctx;
  mac.module.apply(macCtx);
  assert.equal(mac.document.documentElement._attrs['data-pbx-platform'], 'darwin');

  const win = loadModule('Win32');
  const winCtx = createContext(win.window, win.document).ctx;
  win.module.apply(winCtx);
  assert.equal(win.document.documentElement._attrs['data-pbx-platform'], 'other');
});

test('iOS devices are never reported as macOS, even with a MacIntel platform', () => {
  const IPAD_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
  const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';

  const platformOf = (platform, navExtras) => {
    const loaded = loadModule(platform, navExtras);
    loaded.module.apply(createContext(loaded.window, loaded.document).ctx);
    return loaded.document.documentElement._attrs['data-pbx-platform'];
  };

  // iPadOS Safari requests desktop sites: platform/userAgentData say Mac, the UA says iPad.
  assert.equal(platformOf('MacIntel', { userAgent: IPAD_UA }), 'other');
  assert.equal(platformOf('MacIntel', { userAgent: IPAD_UA, userAgentData: { platform: 'macOS' } }), 'other');
  assert.equal(platformOf('MacIntel', { userAgent: IPHONE_UA }), 'other');
  assert.equal(platformOf('MacIntel', { userAgent: 'Mozilla/5.0 (IPAD; CPU OS 17_0 like Mac OS X)' }), 'other');

  // Detection priority is unchanged: userAgentData.platform > navigator.platform > UA.
  assert.equal(platformOf('Win32', { userAgentData: { platform: 'macOS' } }), 'darwin');
  assert.equal(platformOf('MacIntel', { userAgent: MAC_UA }), 'darwin');
  assert.equal(platformOf('', { userAgent: MAC_UA }), 'darwin');
  assert.equal(platformOf('', { userAgent: IPAD_UA }), 'other');
  assert.equal(platformOf('Win32', { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }), 'other');
});

test('built bundle carries macOS labels, clearance rules and platform-neutral bindings', () => {
  // The checks read client.js (the build artifact) so a src/ edit without `npm run build` fails here.
  const built = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
  assert.match(built, /data-pbx-platform/);
  assert.match(built, /⌥/);
  assert.match(built, /--dsh-frame-top-clearance,48px/);
  assert.match(built, /\[data-fullscreen\] \.pbx-toasts\{top:20px\}/);
  assert.match(built, /html\[data-pbx-platform="darwin"\] \.pbx-hud\.default/);
  // Saved shortcuts keep the platform-neutral "alt" (the physical Option key).
  assert.match(built, /alt\+KeyK/);
  assert.match(built, /event\.altKey/);
  // The palette hint is rendered from the live combos, not a hard-coded Alt+ string.
  assert.match(built, /\{prev\}/);
  assert.match(built, /\{palette\}/);
  assert.doesNotMatch(built, /Alt\+K\/Esc close/);
});

test('settings and mouse hints show the modifier names of the current platform', () => {
  const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)';
  const WIN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
  const HINT_KEYS = ['sort.hint', 'settings.shortcut.hint', 'settings.shortcutNeedModifier', 'settings.headerButtonsHint'];
  const MAC_PARAMS = { ctrl: '⌃', alt: '⌥', meta: '⌘', shift: '⇧' };
  const WIN_PARAMS = { ctrl: 'Ctrl', alt: 'Alt', meta: 'Meta', shift: 'Shift' };

  /* The host substitutes {name} placeholders; mirror it so the rendered text is the real string. */
  const makeT = (dicts, lang) => (key, params) => {
    let text = (dicts[lang] || {})[key] || key;
    if (params) for (const [name, value] of Object.entries(params)) text = text.split('{' + name + '}').join(String(value));
    return text;
  };

  const collectText = (node, out) => {
    if (node === null || node === undefined || node === false || node === true) return out;
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const child of node) collectText(child, out); return out; }
    if (typeof node === 'object') for (const child of node.children || []) collectText(child, out);
    return out;
  };

  /* Every section the settings page reads must be an object; the values are irrelevant here. */
  const settings = { shortcuts: {}, headerButtons: {}, palette: {}, hints: {}, hud: {}, board: {}, notify: {}, log: {}, projectColumns: {}, header: { placement: 'header' } };

  const renderSettings = (platform, ua, lang) => {
    const loaded = loadModule(platform, { userAgent: ua });
    const { ctx, registrations, translations } = createContext(loaded.window, loaded.document);
    loaded.module.apply(ctx);
    const dicts = translations.projectBoard;
    const entry = registrations.find((item) => item.spec.id === 'project-board-settings');
    assert.ok(entry, 'the settings page is registered');
    const tree = entry.component({ t: makeT(dicts, lang), useSettings: (selector) => selector(settings) });
    return { text: collectText(tree, []).join(' '), dicts, t: makeT(dicts, lang) };
  };

  for (const lang of ['zh', 'en']) {
    const mac = renderSettings('MacIntel', MAC_UA, lang);
    const win = renderSettings('Win32', WIN_UA, lang);

    /* The dictionaries are platform-neutral; only the injected names differ. */
    for (const key of HINT_KEYS) {
      assert.equal(mac.dicts[lang][key], win.dicts[lang][key], key + ' is identical on both platforms (' + lang + ')');
      assert.doesNotMatch(mac.dicts[lang][key], /Windows|Option|Command|Shift\+|Ctrl \+|⌥|⌘|⌃|⇧/, key + ' has no hard-coded platform wording (' + lang + ')');
      assert.match(mac.dicts[lang][key], /\{(ctrl|alt|meta|shift)\}/, key + ' uses modifier placeholders (' + lang + ')');
      const macText = mac.t(key, MAC_PARAMS);
      const winText = win.t(key, WIN_PARAMS);
      assert.doesNotMatch(macText, /\{(ctrl|alt|meta|shift)\}/, key + ' resolves on macOS (' + lang + ')');
      assert.doesNotMatch(winText, /\{(ctrl|alt|meta|shift)\}/, key + ' resolves on Windows (' + lang + ')');
      assert.match(macText, /[⌃⌥⌘⇧]/, key + ' shows macOS symbols (' + lang + ')');
      assert.match(winText, /Ctrl|Alt|Meta|Shift/, key + ' shows Windows names (' + lang + ')');
      assert.doesNotMatch(macText, /Ctrl \/ Alt \/ Meta|Hold Ctrl|Ctrl \+/, key + ' has no Windows wording on macOS (' + lang + ')');
      assert.doesNotMatch(winText, /[⌃⌥⌘⇧]/, key + ' has no macOS symbols on Windows (' + lang + ')');
    }

    /* Rendering really injects the params: no unresolved placeholders, right names. */
    assert.doesNotMatch(mac.text, /\{(ctrl|alt|meta|shift)\}/, 'settings page resolves placeholders on macOS (' + lang + ')');
    assert.match(mac.text, /⌃ \/ ⌥ \/ ⌘/, 'settings shortcut hint shows ⌃ / ⌥ / ⌘ (' + lang + ')');
    assert.doesNotMatch(mac.text, /Ctrl \/ Alt \/ Meta/, 'settings shortcut hint hides Windows names on macOS (' + lang + ')');
    assert.doesNotMatch(win.text, /\{(ctrl|alt|meta|shift)\}/, 'settings page resolves placeholders on Windows (' + lang + ')');
    assert.match(win.text, /Ctrl \/ Alt \/ Meta/, 'settings shortcut hint shows Ctrl / Alt / Meta (' + lang + ')');
    assert.doesNotMatch(win.text, /⌃ \/ ⌥ \/ ⌘/, 'settings shortcut hint hides macOS symbols on Windows (' + lang + ')');
  }

  /* Every render site (settings page, board column headers, bare-key error) passes params. */
  const built = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
  for (const key of HINT_KEYS) {
    const pattern = new RegExp('t\\("' + key.replace(/\./g, '\\.') + '"\\s*,\\s*[^)]+\\)');
    assert.match(built, pattern, key + ' is rendered with modifier params in the built bundle');
  }
});
test('the narrow board is a fixed width, so Alt+N opens narrow and closes on the next press', () => {
  /* boardStateNow() classifies a pane by its measured width, so the narrow presentation has to
     be the same width every time. Restoring the last dragged width (say 600px) made the pane
     read as "half" right after opening it, so the next Alt+N saw a different mode and resized
     the pane instead of closing it — the key looked dead. */
  assert.match(source, /BOARD_NARROW_WIDTH = 380/);
  assert.match(source, /BOARD_NARROW_MAX = 460/);
  /* Narrow uses the constant in both the restore and the open path... */
  const narrowWidthUses = source.match(/mode === "narrow" \? BOARD_NARROW_WIDTH/g) || [];
  assert.equal(narrowWidthUses.length, 2);
  /* ...and neither path falls back to the persisted width for narrow. */
  assert.doesNotMatch(source, /mode === "narrow" \? boardWidthDefault/);
  /* The size bucket is decided in exactly one place (boardStateNow). */
  const thresholdUses = source.match(/<= BOARD_NARROW_MAX \? "narrow"/g) || [];
  assert.equal(thresholdUses.length, 1);
});

test('a dragged-wide pane is not classified as fullscreen', () => {
  /* Treating "width >= 72% of the viewport" as full made a session switch restore the pane by
     toggling real fullscreen, so a pane the user had dragged to ~75% jumped to 100%. Only the
     host fullscreen flag may mean full, and the measured width is carried along so a restore
     can put back exactly what was on screen. */
  assert.doesNotMatch(source, /width >= viewport \* 0\.72/);
  assert.match(source, /if \(rightbarFullscreen\(\)\) return \{ open: true, mode: "full" \}/);
  assert.match(source, /want\.width >= 280/);
});

test('any size key closes the board, whatever size it is showing at', () => {
  /* Alt+B used to mean "resize to half" while the pane was narrow and "close" while it was
     half, so the key had no single meaning. Every size key is now its own toggle. */
  assert.match(source, /if \(visible && expanded\) \{\s*sidebarRight\.toggleExpanded\(\);\s*return;/);
  assert.doesNotMatch(source, /currentMode === mode/);
});

test('palette searches settings in three labelled groups and opens the target section', () => {
  /* The copy must actually be embedded in the shipped bundle, in both locales. Adding a key
     only to src/ without rebuilding used to leave the UI showing unresolved placeholders. */
  for (const key of [
    'palette.group.hostSettings',
    'palette.group.pluginSettings',
    'palette.group.sessions',
    'palette.setting.open',
    'toast.settingsOpenFailed',
    'toast.settingsOpenPartial'
  ]) {
    assert.ok(source.includes('"' + key + '"'), key + ' is embedded in the bundle');
  }
  assert.match(source, /Search sessions, projects or settings/);
  assert.match(source, /搜索会话、项目或设置/);
  assert.match(source, /"palette.empty": "No matching results"/);
  assert.match(source, /"palette.empty": "没有匹配的结果"/);

  /* Group headers and the visually distinct settings row are real DOM, not just dictionary
     entries. One index crosses all three groups so arrow keys and Enter keep working. */
  assert.match(source, /className: "pbx-paletteGroup"/);
  assert.match(source, /className: "pbx-prow pbx-prowSetting"/);
  assert.match(source, /if \(item.kind === "session"\) return t\("palette.group.sessions"\)/);
  assert.match(source, /entry.origin === "host" \? t\("palette.group.hostSettings"\) : t\("palette.group.pluginSettings"\)/);

  /* Settings join the results only after the reader types: opening Alt+K stays session-only,
     so the familiar list is unchanged until a query exists. */
  assert.match(source, /if \(!q\) return false;/);

  /* Opening a result prefers the public slot store's openSection(id) — open AND select —
     then open(), then the host's own sidebar control. Every branch is probed, never assumed. */
  assert.match(source, /typeof actions.openSection === "function"/);
  assert.match(source, /actions.openSection\(sectionId\)/);
  assert.match(source, /typeof actions.open === "function"/);
  assert.match(source, /clickHostSettingsTrigger\(\)/);

  /* Host sections come from the public ledger, so a section added by another plugin shows up
     in search without a dsh-tac release; hard-coding the roster would silently go stale. */
  assert.match(source, /entriesOf\(ctx, "settings.section"\)/);
  assert.match(source, /entriesOf\(ctx, "sidebar.settings"\)/);
  assert.match(source, /slots.subscribe\("settings.section", refreshSettingsCatalog\)/);
});

test('settings search indexes the host ledger and opens the selected section', () => {
  /* Exercise the real apply() with a host-like slot ledger: the index must be built from the
     public slot data (not a hard-coded roster), and choosing a result must call the shell
     store's openSection(id) rather than just opening the Settings home page. */
  const { module, window, document } = loadModule();
  const { ctx, registrations } = createContext(window, document);
  const opened = [];
  const actions = {
    openSection: (id) => opened.push(id),
    open: () => opened.push('*open')
  };
  const shellStore = { create: () => ({ actions }) };
  ctx.slots.entries = (name) => {
    if (name === 'settings.section') return [
      { options: { id: 'general', order: 0, label: () => 'General' } },
      { options: { id: 'models', order: 10, label: 'Models' } },
      { options: { id: 'project-board-settings', order: 60, label: () => 'Project Board' } }
    ];
    if (name === 'sidebar.settings') return [{ options: { store: shellStore } }];
    return [];
  };
  module.apply(ctx);

  const palette = registrations.find((entry) => entry.spec.id === 'project-board-palette');
  assert.ok(palette, 'the palette slot is registered');
  const props = palette.spec.inject();
  assert.equal(typeof props.chooseSetting, 'function', 'palette receives the settings deep link');

  const catalog = props.hooks.settingsCatalog.getSnapshot();
  const hostIds = catalog.host.map((entry) => entry.sectionId);
  assert.ok(hostIds.includes('general'), 'host section from the ledger is searchable');
  assert.ok(hostIds.includes('models'), 'second host section is searchable');
  assert.ok(!hostIds.includes('project-board-settings'), 'the plugin section is not duplicated in the host group');
  assert.equal(catalog.plugin.length, 6, 'six plugin preferences are indexed');
  assert.ok(catalog.plugin.every((entry) => entry.sectionId === 'project-board-settings'), 'plugin entries target their own section');

  props.chooseSetting(catalog.host.find((entry) => entry.sectionId === 'models'));
  assert.deepEqual(opened, ['models'], 'openSection receives the selected section id');
});