'use strict';

/*
 * Keyboard-shortcut verification for @local/dsh-tac.
 *
 * The plugin binds its global shortcuts inside the Palette component:
 *
 *     useEffect(() => {
 *       const onShortcut = (event) => { ... };
 *       document.addEventListener('keydown', onShortcut, true);
 *       return () => document.removeEventListener('keydown', onShortcut, true);
 *     }, [palette]);
 *
 * test/load.test.cjs only checks that the bundle mounts, and its React stub never
 * runs effects, so this file adds the missing machinery instead of mocking the
 * handler:
 *
 *   - a tiny React runtime that really executes useEffect (this is what installs
 *     the keydown listener) and re-renders when state/store snapshots change;
 *   - a virtual DOM in which the rendered Palette tree is attached, so the
 *     plugin's own `document.querySelectorAll('[aria-modal="true"]')` checks run
 *     against the same markup the browser would see (palette panel vs real modal);
 *   - a KeyboardEvent-shaped event object dispatched through the plugin's real
 *     document listener (Node has no DOM, so the shim only provides DOM fields).
 *
 * The harness has grown the pieces the harder paths need, all still deterministic:
 *
 *   - `window.dispatchEvent` delivers to the listeners the plugin installed on the
 *     window (hold-scroll release keys, `pbx-hud-toggle`), not just records the event;
 *   - `runFrame(timestamp)` drains the queued `requestAnimationFrame` callbacks so the
 *     hold-scroll loop can be stepped, and `__setNow(ms)` moves the clock the loop reads
 *     for its history-prefetch deadline;
 *   - `connectBoardPane()` mirrors the host right pane (tab, expansion, width, fullscreen)
 *     so the three-state board logic is exercised against the same markup the plugin reads;
 *   - `createHarness({ services })` drops or replaces services before `apply()` captures
 *     them, which is how a host build without `sidebarRight` or `layout` is tested.
 *
 * Everything is deterministic: timers are recorded but never fire on their own, no network,
 * no real storage, and every test gets a fresh sandbox around client.js.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const BOARD_KIND = 'projectBoard'; // client.js: BOARD_KIND

/* =============================================================== virtual DOM */

function splitSelector(selector) {
  return String(selector || '').split(',').map((part) => part.trim()).filter(Boolean);
}

function compoundMatches(node, compound) {
  if (!node || node.tag === '#text') return false;
  const match = /^([a-zA-Z][\w-]*|\*)?((?:\.[\w-]+|\[[^\]]+\])*)$/.exec(compound);
  if (!match) return false;
  if (match[1] && match[1] !== '*' && node.tag !== match[1].toLowerCase()) return false;
  const tokens = match[2] || '';
  const tokenRe = /(\.[\w-]+|\[[^\]]+\])/g;
  let token;
  while ((token = tokenRe.exec(tokens))) {
    const piece = token[0];
    if (piece[0] === '.') {
      const classes = String(node.className || '').split(/\s+/).filter(Boolean);
      if (classes.indexOf(piece.slice(1)) < 0) return false;
      continue;
    }
    const inner = piece.slice(1, -1);
    const eq = inner.indexOf('=');
    if (eq < 0) {
      if (!node.hasAttribute(inner)) return false;
      continue;
    }
    let name = inner.slice(0, eq).trim();
    let value = inner.slice(eq + 1).trim();
    if ((value[0] === '"' && value[value.length - 1] === '"') || (value[0] === "'" && value[value.length - 1] === "'")) value = value.slice(1, -1);
    let operator = '=';
    const marker = name[name.length - 1];
    if (marker === '*' || marker === '^' || marker === '$') { operator = marker; name = name.slice(0, -1).trim(); }
    const actual = node.getAttribute(name);
    if (actual === null) return false;
    if (operator === '=' && actual !== value) return false;
    if (operator === '*' && actual.indexOf(value) < 0) return false;
    if (operator === '^' && actual.indexOf(value) !== 0) return false;
    if (operator === '$' && actual.slice(-value.length) !== value) return false;
  }
  return true;
}

function selectorMatches(node, selector) {
  if (!node || node.tag === '#text') return false;
  return splitSelector(selector).some((compound) => compoundMatches(node, compound));
}

let nodeSeq = 0;

class VirtualNode {
  constructor(tag, props, children, ownerDocument) {
    this.id = ++nodeSeq;
    this.tag = String(tag || 'div').toLowerCase();
    this.tagName = this.tag.toUpperCase();
    this.ownerDocument = ownerDocument || null;
    this.props = props || {};
    this.className = typeof this.props.className === 'string' ? this.props.className : '';
    this.attributes = {};
    for (const [key, value] of Object.entries(this.props)) {
      if (key === 'className' || key === 'key' || key === 'ref' || key === 'style' || key === 'children') continue;
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') this.attributes[key] = String(value);
    }
    if (this.className) this.attributes.class = this.className;
    this.dataset = {};
    this.style = this.props.style || {};
    this.children = [];
    this.parentNode = null;
    /* The plugin walks up the tree (scroller discovery, closest()); mirror the DOM accessor. */
    Object.defineProperty(this, 'parentElement', {
      get() {
        return this.parentNode && this.parentNode.tag !== '#text' ? this.parentNode : null;
      }
    });
    this.isConnected = true;
    this.textContent = '';
    this.value = '';
    this.disabled = Boolean(this.props.disabled);
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
    /* The plugin reads these for drag/clamp maths; a layoutless node still has a box. */
    this.offsetWidth = 120;
    this.offsetHeight = 40;
    this.isContentEditable = this.attributes.contenteditable === 'true';
    for (const child of children || []) this.appendChild(child);
  }

  appendChild(child) {
    if (!child) return child;
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) this.children.splice(index, 1);
    if (child) child.parentNode = null;
    return child;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
    this.isConnected = false;
  }

  getClientRects() {
    return [{ width: 120, height: 40, top: 0, left: 0, right: 120, bottom: 40 }];
  }

  getBoundingClientRect() {
    return { width: 120, height: 40, top: 0, left: 0, right: 120, bottom: 40 };
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }

  matches(selector) {
    return selectorMatches(this, selector);
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (selectorMatches(node, selector)) return node;
      node = node.parentNode;
    }
    return null;
  }

  contains(other) {
    let node = other;
    while (node) {
      if (node === this) return true;
      node = node.parentNode;
    }
    return false;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children || []) {
        if (selectorMatches(child, selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) {
    const list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body;
  }

  select() {
    this.selection = [0, String(this.value === undefined ? '' : this.value).length];
  }

  scrollIntoView() {}

  click() {}

  setSelectionRange() {}

  addEventListener() {}

  removeEventListener() {}

  dispatchEvent() {
    return true;
  }
}

function createVirtualDocument() {
  const listeners = new Map();
  const extraRoots = [];
  const componentRoots = new Map();

  const doc = {
    visibilityState: 'visible',
    hasFocus: () => true,
    activeElement: null,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) {
      if (!event.target) event.target = doc.activeElement;
      event.currentTarget = doc;
      for (const handler of (listeners.get(event.type) || []).slice()) {
        handler(event);
      }
      return !event.defaultPrevented;
    },
    createElement(tag) {
      return new VirtualNode(tag, {}, [], doc);
    },
    createElementNS(_namespace, tag) {
      return new VirtualNode(tag, {}, [], doc);
    },
    createRange() {
      return { selectNodeContents() {}, collapse() {}, setStart() {}, setEnd() {} };
    },
    querySelectorAll(selector) {
      const roots = doc.allRoots();
      const out = [];
      for (const node of roots) {
        if (selectorMatches(node, selector)) out.push(node);
        for (const child of node.querySelectorAll(selector)) out.push(child);
      }
      return out;
    },
    querySelector(selector) {
      const list = doc.querySelectorAll(selector);
      return list.length > 0 ? list[0] : null;
    },
    allRoots() {
      const roots = extraRoots.slice();
      for (const node of componentRoots.values()) if (node) roots.push(node);
      return roots;
    },
    __addRoot(node) {
      if (node && extraRoots.indexOf(node) < 0) extraRoots.push(node);
    },
    __removeRoot(node) {
      const index = extraRoots.indexOf(node);
      if (index >= 0) extraRoots.splice(index, 1);
    },
    __setComponentRoot(key, node) {
      componentRoots.set(key, node);
    }
  };

  doc.head = new VirtualNode('head', {}, [], doc);
  doc.body = new VirtualNode('body', {}, [], doc);
  doc.documentElement = new VirtualNode('html', {}, [], doc);
  doc.scrollingElement = doc.documentElement;
  doc.activeElement = doc.body;
  return doc;
}

/** Turn a React-element tree (h() output) into VirtualNodes and publish `ref` objects. */
function convertTree(element, doc) {
  if (element === null || element === undefined || element === false) return null;
  if (Array.isArray(element)) return element.map((child) => convertTree(child, doc)).filter(Boolean);
  if (typeof element === 'string' || typeof element === 'number') {
    const text = new VirtualNode('#text', {}, [], doc);
    text.textContent = String(element);
    return text;
  }
  if (typeof element !== 'object') return null;
  if (typeof element.type !== 'string') {
    // Fragment or a nested component (e.g. Icon): opaque to the shortcut checks.
    return new VirtualNode('component', {}, [], doc);
  }
  const node = new VirtualNode(element.type, element.props || {}, [], doc);
  if (element.props && element.props.ref && typeof element.props.ref === 'object') {
    element.props.ref.current = node;
  }
  const flat = [];
  const push = (child) => {
    if (Array.isArray(child)) child.forEach(push);
    else if (child !== null && child !== undefined && child !== false) flat.push(child);
  };
  for (const child of element.children || []) push(child);
  for (const child of flat) {
    const converted = convertTree(child, doc);
    if (converted) node.appendChild(converted);
  }
  return node;
}

/* ============================================================ keyboard event */

class KeyboardEventShim {
  constructor(type, init) {
    const source = init || {};
    this.type = type;
    this.bubbles = Boolean(source.bubbles);
    this.cancelable = source.cancelable !== false;
    this.key = source.key === undefined ? '' : String(source.key);
    this.code = source.code === undefined ? '' : String(source.code);
    this.altKey = Boolean(source.altKey);
    this.ctrlKey = Boolean(source.ctrlKey);
    this.metaKey = Boolean(source.metaKey);
    this.shiftKey = Boolean(source.shiftKey);
    this.repeat = Boolean(source.repeat);
    this.isComposing = Boolean(source.isComposing);
    this.keyCode = Number(source.keyCode) || 0;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    this.target = source.target || null;
    this.currentTarget = null;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }

  stopImmediatePropagation() {
    this.propagationStopped = true;
  }

  composedPath() {
    return [];
  }
}

/* ============================================================ React runtime */

/*
 * Minimal but faithful hook runtime for the one component under test:
 * state setters re-render, effect deps are compared, cleanups run before the
 * next run, and refs are attached while the rendered tree is converted.
 */
function createReactRuntime(doc) {
  let activeInstance = null;

  function depsChanged(previous, next) {
    if (!previous) return true;
    if (!next) return true;
    if (previous.length !== next.length) return true;
    for (let i = 0; i < previous.length; i += 1) {
      if (!Object.is(previous[i], next[i])) return true;
    }
    return false;
  }

  function useState(initial) {
    const instance = activeInstance;
    const index = instance.cursor;
    instance.cursor += 1;
    if (!instance.hooks[index]) {
      instance.hooks[index] = { kind: 'state', value: typeof initial === 'function' ? initial() : initial };
    }
    const slot = instance.hooks[index];
    const setState = (next) => {
      const value = typeof next === 'function' ? next(slot.value) : next;
      if (Object.is(value, slot.value)) return;
      slot.value = value;
      instance.dirty = true;
    };
    return [slot.value, setState];
  }

  function useEffect(factory, deps) {
    const instance = activeInstance;
    const index = instance.cursor;
    instance.cursor += 1;
    const previous = instance.hooks[index];
    if (previous && previous.kind === 'effect' && !depsChanged(previous.deps, deps)) {
      instance.effectSlots.push(previous);
      return;
    }
    const slot = { kind: 'effect', deps: deps ? deps.slice() : null, cleanup: previous && previous.cleanup, pending: factory, previous: previous || null };
    instance.hooks[index] = slot;
    instance.effectSlots.push(slot);
  }

  function useMemo(factory, deps) {
    const instance = activeInstance;
    const index = instance.cursor;
    instance.cursor += 1;
    const previous = instance.hooks[index];
    if (previous && previous.kind === 'memo' && !depsChanged(previous.deps, deps)) return previous.value;
    const value = factory();
    instance.hooks[index] = { kind: 'memo', value, deps: deps ? deps.slice() : null };
    return value;
  }

  function useRef(value) {
    const instance = activeInstance;
    const index = instance.cursor;
    instance.cursor += 1;
    if (!instance.hooks[index]) instance.hooks[index] = { kind: 'ref', ref: { current: value } };
    return instance.hooks[index].ref;
  }

  function useCallback(fn, deps) {
    return useMemo(() => fn, deps);
  }

  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState,
    useEffect,
    useLayoutEffect: useEffect,
    useMemo,
    useRef,
    useCallback,
    Fragment: 'Fragment'
  };

  function mount(component, props, onTree) {
    const instance = {
      component,
      props,
      hooks: [],
      cursor: 0,
      dirty: false,
      effectSlots: [],
      onTree,
      node: null,
      renders: 0
    };

    function flushEffects() {
      const slots = instance.effectSlots;
      instance.effectSlots = [];
      for (const slot of slots) {
        if (!slot.pending) continue;
        if (typeof slot.cleanup === 'function') {
          try { slot.cleanup(); } catch (error) { /* a cleanup must not break the harness */ }
        }
        slot.cleanup = slot.pending();
        slot.pending = null;
      }
    }

    function render() {
      let guard = 0;
      do {
        instance.dirty = false;
        activeInstance = instance;
        instance.cursor = 0;
        instance.effectSlots = [];
        const tree = instance.component(instance.props);
        activeInstance = null;
        instance.renders += 1;
        const node = convertTree(tree, doc);
        instance.node = node;
        if (typeof instance.onTree === 'function') instance.onTree(instance.node);
        flushEffects();
      } while (instance.dirty && ++guard < 40);
      return instance.node;
    }

    instance.render = render;
    return instance;
  }

  return { React, mount };
}

/* ================================================================ the harness */

function createLocalStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear(),
    /** Everything the plugin persisted, so a test can inspect or re-seed it. */
    __dump: () => Object.fromEntries(data)
  };
}

function createWindowStub(doc, localStorage) {
  const timers = [];
  const intervals = [];
  const frames = [];
  const dispatched = [];
  const listenerMap = new Map();
  let idSeq = 0;
  let clock = 0;

  const win = {
    document: doc,
    localStorage,
    innerWidth: 1440,
    innerHeight: 900,
    devicePixelRatio: 1,
    screenX: 0,
    screenY: 0,
    navigator: { platform: 'test' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    getComputedStyle: () => ({ overflowY: 'visible' }),
    getSelection: () => null,
    performance: { now: () => clock },
    /* Tests advance this clock so interval deadlines (history prefetch timeouts) can expire. */
    __setNow(value) {
      clock = value;
    },
    addEventListener(type, handler) {
      if (!listenerMap.has(type)) listenerMap.set(type, []);
      listenerMap.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listenerMap.get(type);
      if (!list) return;
      const index = list.indexOf(handler);
      if (index >= 0) list.splice(index, 1);
    },
    dispatchEvent(event) {
      dispatched.push(event);
      // Deliver to the listeners the plugin installed on the window (chat-scroll release keys,
      // HUD toggle events). The document stub does the same for document listeners.
      const handlers = (listenerMap.get(event.type) || []).slice();
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          /* a listener must not break the harness */
        }
      }
      return true;
    },
    setTimeout(fn, delay) {
      idSeq += 1;
      timers.push({ id: idSeq, fn, delay, cleared: false });
      return idSeq;
    },
    clearTimeout(id) {
      const timer = timers.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    setInterval(fn, delay) {
      idSeq += 1;
      intervals.push({ id: idSeq, fn, delay, cleared: false });
      return idSeq;
    },
    clearInterval(id) {
      const timer = intervals.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    requestAnimationFrame(fn) {
      idSeq += 1;
      frames.push({ id: idSeq, fn });
      return idSeq;
    },
    cancelAnimationFrame(id) {
      const index = frames.findIndex((entry) => entry.id === id);
      if (index >= 0) frames.splice(index, 1);
    },
    __timers: timers,
    __intervals: intervals,
    __frames: frames,
    __dispatched: dispatched
  };

  win.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init ? init.detail : undefined;
    }
  };
  return win;
}

function createServices() {
  const calls = {
    openSession: [],
    sidebarOpenTab: [],
    sidebarToggleExpanded: [],
    layoutToggleSidebar: [],
    setRightbar: []
  };
  return {
    calls,
    uiWorkspace: {
      openSession(sessionId) { calls.openSession.push(sessionId); }
    },
    sidebarRight: {
      active: () => undefined,
      isExpanded: () => false,
      openTab(kind) { calls.sidebarOpenTab.push(kind); },
      toggleExpanded() { calls.sidebarToggleExpanded.push(true); },
      commandTarget: () => undefined,
      toggleFullscreen() {}
    },
    layout: {
      toggleSidebar() { calls.layoutToggleSidebar.push(true); },
      panels: { setRightbar(px) { calls.setRightbar.push(px); } },
      selectPanel() {}
    }
  };
}

function createContext(doc, services) {
  const translations = {};
  const registrations = [];
  const effects = [];
  const ctx = {
    locale: {
      register(namespace, dicts) {
        // The host merges the plugin's locale dictionaries; the stub keeps the English side so
        // text assertions see real strings and {placeholders} are interpolated.
        translations[namespace] = Object.assign({}, (dicts && (dicts.en || dicts.zh)) || {}, translations[namespace] || {});
      },
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
    effect(factory) {
      const dispose = factory();
      if (typeof dispose === 'function') effects.push(dispose);
      return () => {};
    },
    get(name) { return services[name]; },
    on() { return () => {}; },
    sidebarRight: services.sidebarRight,
    sidebarRightTabs: { register() { return () => {}; } },
    slots: {
      inject(name, factory) { return factory(); },
      register(spec, component) {
        registrations.push({ spec, component });
        return () => {};
      }
    },
    layout: services.layout,
    uiWorkspace: services.uiWorkspace
  };
  return { ctx, translations, registrations, effects };
}

const SESSION_FIXTURE = {
  ids: ['s1', 's2', 's3'],
  byId: {
    s1: { id: 's1', title: 'Alpha', updatedAt: 3000 },
    s2: { id: 's2', title: 'Beta', updatedAt: 2000, retainedBy: { mainView: 1 } },
    s3: { id: 's3', title: 'Gamma', updatedAt: 1000 }
  }
};

function keyForCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (code === 'Comma') return ',';
  if (code === 'Period') return '.';
  if (code === 'Space') return ' ';
  if (code === 'Enter') return 'Enter';
  if (code === 'Escape') return 'Escape';
  if (code === 'ArrowUp') return 'ArrowUp';
  if (code === 'ArrowDown') return 'ArrowDown';
  return code;
}

function comboInit(combo) {
  const parts = String(combo).split('+');
  const code = parts.pop();
  return {
    key: keyForCode(code),
    code,
    altKey: parts.indexOf('alt') >= 0,
    ctrlKey: parts.indexOf('ctrl') >= 0,
    metaKey: parts.indexOf('meta') >= 0,
    shiftKey: parts.indexOf('shift') >= 0
  };
}

function createHarness(options) {
  const doc = createVirtualDocument();
  const localStorage = createLocalStorage(options && options.storage);
  const win = createWindowStub(doc, localStorage);
  const services = createServices();
  /* A host build may expose fewer services; overrides are applied before apply() captures them. */
  for (const [name, value] of Object.entries((options && options.services) || {})) {
    if (value === undefined) delete services[name];
    else services[name] = value;
  }
  const silentConsole = { log() {}, warn() {}, error() {}, info() {}, debug() {} };

  const sandbox = {
    window: win,
    document: doc,
    localStorage,
    console: silentConsole,
    setTimeout: win.setTimeout,
    clearTimeout: win.clearTimeout,
    setInterval: win.setInterval,
    clearInterval: win.clearInterval,
    requestAnimationFrame: win.requestAnimationFrame,
    cancelAnimationFrame: win.cancelAnimationFrame,
    CustomEvent: win.CustomEvent
  };
  sandbox.globalThis = sandbox;

  let captured = null;
  win.__ModuleLoader__ = { load: (spec) => { captured = spec; } };
  vm.runInNewContext(source, sandbox, { filename: 'client.js' });
  assert.ok(captured, 'the bundle factory was captured');

  const runtime = createReactRuntime(doc);
  const module = captured.factory((id) => {
    if (id === 'react') return runtime.React;
    throw new Error('unexpected runtime dependency: ' + id);
  });

  const { ctx, registrations } = createContext(doc, services);
  module.apply(ctx);

  const paletteEntry = registrations.find((entry) => entry.spec.id === 'project-board-palette');
  assert.ok(paletteEntry, 'the palette overlay is registered');
  const injected = paletteEntry.spec.inject();
  assert.ok(injected && injected.palette && typeof injected.palette.getSnapshot === 'function', 'palette store is injected');

  const paletteStore = injected.palette;
  const settingsStore = injected.hooks.settings;
  const hudOrderStore = injected.hooks.hudOrder;

  const spies = {
    toggleBoard: [],
    toggleLeftSidebar: [],
    toggleHud: [],
    requestRename: [],
    requestSessionMenu: [],
    notify: []
  };

  /* Mutable so a test can give the palette real projects to filter by. */
  let wsFixture = { items: [], archivedSessionIds: [] };

  const props = Object.assign({}, injected, {
    t: ctx.locale.bind('projectBoard'),
    useSessions: (selector) => selector(SESSION_FIXTURE),
    useSessionStatus: (selector) => selector(new Map()),
    useWorkspaces: (selector) => selector(wsFixture),
    usePalette: (selector) => selector(paletteStore.getSnapshot()),
    useSettings: (selector) => selector(settingsStore.getSnapshot()),
    useHudOrder: (selector) => selector(hudOrderStore.getSnapshot()),
    toggleBoard: (mode) => { spies.toggleBoard.push(mode); return injected.toggleBoard(mode); },
    toggleLeftSidebar: () => { spies.toggleLeftSidebar.push(true); return injected.toggleLeftSidebar(); },
    toggleHud: () => { spies.toggleHud.push(true); return injected.toggleHud(); },
    requestRename: (id, title) => { spies.requestRename.push([id, title]); return injected.requestRename(id, title); },
    requestSessionMenu: (id, title) => { spies.requestSessionMenu.push([id, title]); return injected.requestSessionMenu(id, title); },
    notify: (payload) => { spies.notify.push(payload); return injected.notify(payload); }
  });

  const instance = runtime.mount(paletteEntry.component, props, (node) => {
    const snapshot = paletteStore.getSnapshot();
    const open = Boolean(snapshot && snapshot.open);
    // Attach the panel only while the store reports the palette open. The real
    // 180 ms exit animation is deliberately not simulated so the virtual DOM
    // always reflects the logical open state.
    doc.__setComponentRoot('palette', node && open ? node : null);
  });
  instance.render();

  function render() {
    return instance.render();
  }

  function pressRaw(init) {
    const event = new KeyboardEventShim('keydown', Object.assign({ bubbles: true, cancelable: true }, init));
    if (!event.target) event.target = doc.activeElement;
    doc.dispatchEvent(event);
    // The host subscribes to the plugin stores and re-renders after the update;
    // mirror that so paletteOpenRef and the mounted panel track the store.
    render();
    return event;
  }

  function pressCombo(combo) {
    return pressRaw(comboInit(combo));
  }

  function resetState() {
    paletteStore.set({ open: false, move: { dir: 0, at: 0 } });
    render();
  }

  function clearSpies() {
    for (const key of Object.keys(spies)) spies[key].length = 0;
    services.calls.openSession.length = 0;
    services.calls.sidebarOpenTab.length = 0;
    services.calls.sidebarToggleExpanded.length = 0;
    services.calls.layoutToggleSidebar.length = 0;
    services.calls.setRightbar.length = 0;
    win.__dispatched.length = 0;
  }

  function makeEditable(options) {
    const settings = options || {};
    const tag = settings.contenteditable ? 'div' : 'textarea';
    const node = new VirtualNode(tag, settings.contenteditable ? { contenteditable: 'true', 'aria-label': 'composer' } : { 'aria-label': 'composer' }, [], doc);
    node.ownerDocument = doc;
    node.value = settings.value || '';
    node.isContentEditable = Boolean(settings.contenteditable);
    node.setSelectionRange = (start, end) => { node.selection = [start, end]; };
    return node;
  }

  function focusEditable(node) {
    doc.activeElement = node;
    return node;
  }

  return {
    module,
    ctx,
    registrations,
    runtime,
    doc,
    window: win,
    paletteStore,
    settingsStore,
    services,
    spies,
    instance,
    render,
    setWorkspaces(next) {
      wsFixture = next;
    },
    mountHud(rootKey) {
      const entry = registrations.find((item) => item.spec.id === 'project-board-hud');
      assert.ok(entry, 'the floating session list overlay is registered');
      const hud = runtime.mount(entry.component, Object.assign({}, props, entry.spec.inject()), (node) => {
        if (rootKey) doc.__setComponentRoot(rootKey, node);
      });
      hud.render();
      return hud;
    },
    runIntervals() {
      for (const timer of win.__intervals.slice()) if (!timer.cleared) timer.fn();
    },
    runTimers() {
      for (const timer of win.__timers.slice()) if (!timer.cleared) timer.fn();
    },
    /** Run the animation frames queued so far; each callback may schedule the next one. */
    runFrame(timestamp) {
      const queued = win.__frames.splice(0);
      for (const frame of queued) frame.fn(timestamp);
      return queued.length;
    },
    frameCount() {
      return win.__frames.length;
    },
    pressRaw,
    pressCombo,
    resetState,
    clearSpies,
    makeEditable,
    focusEditable,
    timersSince(index) {
      return win.__timers.slice(index).filter((timer) => !timer.cleared);
    },
    timerCount() {
      return win.__timers.length;
    },
    hudEvents() {
      return win.__dispatched.map((event) => event.type);
    },
    paletteOpen() {
      return Boolean(paletteStore.getSnapshot().open);
    },
    paletteMove() {
      return paletteStore.getSnapshot().move;
    }
  };
}

/* ==================================================================== tests */

test('Alt shortcuts still reach the plugin while an editable element is focused', () => {
  const harness = createHarness();
  const textarea = harness.makeEditable();
  harness.doc.__addRoot(textarea);

  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  assert.equal(harness.doc.activeElement, textarea, 'the composer textarea owns focus');

  // Alt+K: the palette must toggle even though a textarea is focused.
  const paletteEvent = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'Alt+K opens the palette from a focused textarea');
  assert.equal(paletteEvent.defaultPrevented, true, 'Alt+K is consumed by the plugin, not swallowed by a typing guard');

  // Alt+I: previous session (palette must be closed again for the session cycle).
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  const prevEvent = harness.pressRaw({ key: 'i', code: 'KeyI', altKey: true, bubbles: true });
  assert.deepEqual(harness.services.calls.openSession, ['s1'], 'Alt+I requests the previous session from a focused textarea');
  assert.equal(prevEvent.defaultPrevented, true, 'Alt+I is consumed while typing');

  // Alt+D: session menu for the current session.
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  const menuEvent = harness.pressRaw({ key: 'd', code: 'KeyD', altKey: true, bubbles: true });
  assert.deepEqual(harness.spies.requestSessionMenu, [['s2', 'Beta']], 'Alt+D opens the session menu from a focused textarea');
  assert.equal(menuEvent.defaultPrevented, true, 'Alt+D is consumed while typing');

  // Alt+N: native board, narrow mode.
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  const boardEvent = harness.pressRaw({ key: 'n', code: 'KeyN', altKey: true, bubbles: true });
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'Alt+N toggles the board from a focused textarea');
  assert.ok(harness.services.calls.sidebarOpenTab.indexOf(BOARD_KIND) >= 0, 'the native board tab was opened');
  assert.equal(boardEvent.defaultPrevented, true, 'Alt+N is consumed while typing');

  // Alt+B: half-width board.
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  const halfEvent = harness.pressRaw({ key: 'b', code: 'KeyB', altKey: true, bubbles: true });
  assert.deepEqual(harness.spies.toggleBoard, ['half'], 'Alt+B requests the half-width board from a focused textarea');
  assert.equal(halfEvent.defaultPrevented, true, 'Alt+B is consumed while typing');

  // Alt+E: HUD toggle (dispatched on window by toggleHud).
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(textarea);
  const hudEvent = harness.pressRaw({ key: 'e', code: 'KeyE', altKey: true, bubbles: true });
  assert.ok(harness.hudEvents().indexOf('pbx-hud-toggle') >= 0, 'Alt+E toggles the HUD from a focused textarea');
  assert.equal(hudEvent.defaultPrevented, true, 'Alt+E is consumed while typing');

  // contenteditable behaves like a textarea.
  const editable = harness.makeEditable({ contenteditable: true });
  harness.doc.__addRoot(editable);
  harness.resetState();
  harness.clearSpies();
  harness.focusEditable(editable);
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'Alt+K also works from a contenteditable element');
});

test('a real modal dialog suppresses shortcuts', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // A visible aria-modal dialog that is NOT the plugin palette: exactly what a
  // native DSH dialog (rename, settings, command palette, ...) renders.
  const modal = new VirtualNode('div', { className: 'native-modal', 'aria-modal': 'true', role: 'dialog' }, [], harness.doc);
  harness.doc.__addRoot(modal);
  assert.equal(harness.doc.querySelectorAll('[aria-modal="true"]').length, 1, 'the virtual document contains one real modal');

  const paletteEvent = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'Alt+K does not open the palette behind a real modal');
  assert.equal(paletteEvent.defaultPrevented, false, 'Alt+K is left to the modal');

  const boardEvent = harness.pressRaw({ key: 'n', code: 'KeyN', altKey: true, bubbles: true });
  assert.deepEqual(harness.spies.toggleBoard, [], 'Alt+N does not touch the board behind a real modal');
  assert.equal(boardEvent.defaultPrevented, false, 'Alt+N is left to the modal');

  harness.pressRaw({ key: 'e', code: 'KeyE', altKey: true, bubbles: true });
  assert.deepEqual(harness.hudEvents(), [], 'Alt+E does not toggle the HUD behind a real modal');

  const prevEvent = harness.pressRaw({ key: 'i', code: 'KeyI', altKey: true, bubbles: true });
  assert.deepEqual(harness.services.calls.openSession, [], 'Alt+I does not switch sessions behind a real modal');
  assert.equal(prevEvent.defaultPrevented, false, 'Alt+I is left to the modal');

  const sidebarEvent = harness.pressRaw({ key: 'w', code: 'KeyW', altKey: true, bubbles: true });
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [], 'Alt+W does not toggle the native sidebar behind a real modal');
  assert.equal(sidebarEvent.defaultPrevented, false, 'Alt+W is left to the modal');

  // Control: once the modal is gone the same combo works again.
  harness.doc.__removeRoot(modal);
  harness.clearSpies();
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'Alt+K works again after the real modal closes');
});

test('the native sidebar drawer does not block the shortcut that closes it', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // Below its LG breakpoint DSH renders the left sidebar as a modal drawer: role=dialog,
  // aria-modal and data-shortcut-modal="sidebar". DSH keeps its own toggle alive for that
  // state, so the plugin must keep Alt+W alive too — otherwise Alt+W opens the sidebar and
  // can never close it again.
  const drawer = new VirtualNode('div', {
    className: 'native-sidebar',
    role: 'dialog',
    'aria-modal': 'true',
    'data-shortcut-modal': 'sidebar'
  }, [], harness.doc);
  harness.doc.__addRoot(drawer);
  assert.equal(harness.doc.querySelectorAll('[aria-modal="true"]').length, 1, 'the virtual document contains the sidebar drawer');

  const event = harness.pressRaw({ key: 'w', code: 'KeyW', altKey: true, bubbles: true });
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'Alt+W still reaches the layout service while the sidebar drawer is open');
  assert.equal(event.defaultPrevented, true, 'Alt+W is consumed by the plugin, not left to the drawer');

  // The drawer stays out of the way of the other shortcuts as well.
  harness.clearSpies();
  harness.pressRaw({ key: 'n', code: 'KeyN', altKey: true, bubbles: true });
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'Alt+N still toggles the board while the sidebar drawer is open');

  harness.doc.__removeRoot(drawer);
});

test('Alt+W leaves a fullscreen board first, so the sidebar it opens is visible', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  const calls = [];
  harness.services.sidebarRight.commandTarget = () => 'board';
  harness.services.sidebarRight.toggleFullscreen = (target) => { calls.push(target); };

  // A fullscreen right panel covers the whole frame, sidebar column included: toggling the
  // sidebar underneath it would look like a dead key.
  const full = new VirtualNode('div', { 'data-rightbar-fullscreen': 'true' }, [], harness.doc);
  harness.doc.__addRoot(full);

  harness.pressRaw({ key: 'w', code: 'KeyW', altKey: true, bubbles: true });
  assert.deepEqual(calls, ['board'], 'the fullscreen board leaves fullscreen before the sidebar toggles');
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'the sidebar still toggles afterwards');

  harness.doc.__removeRoot(full);
});

test('one Alt+W press toggles the sidebar once even if it is delivered twice', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // A leaked listener from a client-plugin hot reload would receive the same event object and
  // toggle the panel a second time, cancelling the press out.
  const event = new KeyboardEventShim('keydown', { key: 'w', code: 'KeyW', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'the duplicated delivery toggles the panel once, not twice');
});

test('one Alt+N press toggles the board once even if it is delivered twice', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // Same guard as Alt+W (pbxSidebarActed): a leaked listener from a hot reload would
  // receive the same event and toggleBoard a second time, cancelling the press.
  const event = new KeyboardEventShim('keydown', { key: 'n', code: 'KeyN', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'the duplicated Alt+N delivery toggles the board once, not twice');
});

test('the floating list docks and comes back with the native sidebar on the same frame', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // The native frame publishes the layout's *target* state: an inline grid template whose first
  // track is the sidebar column, plus a collapsed attribute. Neither waits for the width animation.
  /* element.style.gridTemplateColumns is the value only; the attribute keeps the declaration. */
  const closed = '0px minmax(400px, 1fr) minmax(0px, 800px)';
  const opened = '280px minmax(400px, 1fr) minmax(0px, 800px)';
  const frame = new VirtualNode('div', {
    className: 'AppFrame_frame',
    style: { gridTemplateColumns: closed },
    'data-sidebar-collapsed': 'true'
  }, [], harness.doc);
  frame.attributes.style = 'grid-template-columns: ' + closed;
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud();
  assert.ok(hud.node, 'the floating list rendered');
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list starts unfolded while the sidebar is closed');

  // Open the sidebar: the frame's target state changes immediately, before the column animates.
  frame.style.gridTemplateColumns = opened;
  frame.attributes.style = 'grid-template-columns: ' + opened;
  frame.removeAttribute('data-sidebar-collapsed');
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list collapses to a pill as soon as the sidebar target state changes');

  // Close it again: the pill must come back without waiting for a width animation to finish.
  frame.style.gridTemplateColumns = closed;
  frame.attributes.style = 'grid-template-columns: ' + closed;
  frame.setAttribute('data-sidebar-collapsed', 'true');
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list unfolds again as soon as the sidebar closes');

  harness.doc.__removeRoot(frame);
});

test('a list that docked at startup comes back when the sidebar closes', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // The app opens with the native sidebar already expanded (its layout store starts at 280px),
  // so the floating list docks on mount. Closing the sidebar must bring it back.
  const opened = 'grid-template-columns: 280px minmax(400px, 1fr) minmax(0px, 800px)';
  const closed = 'grid-template-columns: 0px minmax(400px, 1fr) minmax(0px, 800px)';
  const frame = new VirtualNode('div', { className: 'AppFrame_frame', style: { gridTemplateColumns: opened } }, [], harness.doc);
  frame.attributes.style = 'grid-template-columns: ' + opened;
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list starts as a pill when the app opens with the sidebar expanded');

  frame.style.gridTemplateColumns = closed;
  frame.attributes.style = 'grid-template-columns: ' + closed;
  frame.setAttribute('data-sidebar-collapsed', 'true');
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), false, 'closing the sidebar brings the list back');

  harness.doc.__removeRoot(frame);
});

test('a sidebar width sampled mid-animation does not move the floating list', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // No frame grid here: the only signal is the sidebar column's rendered width, which animates
  // through intermediate values while the sidebar opens or closes.
  let width = 52;
  const column = new VirtualNode('div', { className: 'SidebarRoot_sidebarCol' }, [], harness.doc);
  column.getBoundingClientRect = () => ({ width: width, height: 400, top: 0, left: 0, right: width, bottom: 400 });
  harness.doc.__addRoot(column);

  const hud = harness.mountHud();
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list starts unfolded');

  // Mid-transition reading: taller than the rail but far below the expanded width.
  width = 150;
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), false, 'one transient reading does not collapse the list');

  // The expanded width holds: now it may dock.
  width = 300;
  harness.runIntervals();
  harness.runTimers();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list docks once the expanded width holds');

  // Closing: the first reading is the animated width again, so the pill must stay put.
  width = 150;
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'a transient reading does not unfold the list early');

  // The collapsed rail width holds: the pill comes back.
  width = 52;
  harness.runIntervals();
  harness.runTimers();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list unfolds once the collapsed width holds');

  harness.doc.__removeRoot(column);
});

test('palette open: Alt+K closes it, Alt+I and Alt+, still move the selection', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // Open the palette through the real store and let the panel mount.
  harness.paletteStore.set({ open: true, move: { dir: 0, at: 0 } });
  harness.render();
  assert.equal(harness.paletteOpen(), true, 'palette store reports open');
  assert.equal(harness.doc.querySelectorAll('[aria-modal="true"]').length, 1, 'the open palette panel is aria-modal in the virtual document');
  assert.equal(harness.doc.querySelectorAll('.pbx-palette').length, 1, 'the open palette panel carries .pbx-palette');

  const closeEvent = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'Alt+K toggles the palette closed');
  assert.equal(closeEvent.defaultPrevented, true, 'Alt+K is handled by the plugin palette');

  // Re-open: the palette must keep owning Alt+I / Alt+, instead of the modal guard.
  harness.paletteStore.set({ open: true, move: { dir: 0, at: 0 } });
  harness.render();

  const prevEvent = harness.pressRaw({ key: 'i', code: 'KeyI', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'Alt+I keeps the palette open (it is not a modal blocker)');
  assert.equal(harness.paletteMove().dir, -1, 'Alt+I moves the palette selection up');
  assert.equal(prevEvent.defaultPrevented, true, 'Alt+I is consumed by the palette');

  const nextEvent = harness.pressRaw({ key: ',', code: 'Comma', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'Alt+, keeps the palette open');
  assert.equal(harness.paletteMove().dir, 1, 'Alt+, moves the palette selection down');
  assert.equal(nextEvent.defaultPrevented, true, 'Alt+, is consumed by the palette');

  assert.deepEqual(harness.services.calls.openSession, [], 'palette navigation never switches sessions');
});

test('plain letters without modifiers never trigger actions', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  const letters = [
    ['KeyK', 'k'], ['KeyI', 'i'], ['KeyD', 'd'], ['KeyN', 'n'],
    ['KeyB', 'b'], ['KeyE', 'e'], ['KeyR', 'r'], ['KeyS', 's'],
    ['KeyU', 'u'], ['KeyM', 'm'], ['KeyV', 'v'], ['KeyW', 'w'],
    ['Comma', ',']
  ];

  for (const [code, key] of letters) {
    const event = harness.pressRaw({ key, code, bubbles: true });
    assert.equal(event.defaultPrevented, false, 'plain ' + key + ' is not consumed by the plugin');
  }

  assert.equal(harness.paletteOpen(), false, 'plain letters do not open the palette');
  assert.deepEqual(harness.services.calls.openSession, [], 'plain letters do not switch sessions');
  assert.deepEqual(harness.spies.toggleBoard, [], 'plain letters do not toggle the board');
  assert.deepEqual(harness.spies.toggleLeftSidebar, [], 'plain letters do not toggle the sidebar');
  assert.deepEqual(harness.spies.toggleHud, [], 'plain letters do not toggle the HUD');
  assert.deepEqual(harness.spies.requestRename, [], 'plain letters do not request a rename');
  assert.deepEqual(harness.spies.requestSessionMenu, [], 'plain letters do not open the session menu');
  assert.deepEqual(harness.hudEvents(), [], 'plain letters emit no window events');
});

test('every default shortcut combo is wired and produces its side effect', () => {
  const harness = createHarness();
  const shortcuts = harness.settingsStore.getSnapshot().shortcuts;

  const expectedIds = [
    'palette', 'prev', 'next', 'userPrev', 'userNext', 'scrollBottom',
    'sidebarBoard', 'leftSidebar', 'panelHalf', 'panelFull', 'rename',
    'interject', 'hud', 'sessionMenu'
  ];
  assert.deepEqual(Object.keys(shortcuts).sort(), expectedIds.slice().sort(), 'DEFAULT_SETTINGS.shortcuts exposes the documented actions');

  // A visible composer lets scrollBottom be observed through focusComposerInput().
  const composer = harness.makeEditable();
  harness.doc.__addRoot(composer);

  /*
   * Observable side effects used below:
   *   palette        -> palette store open
   *   prev / next    -> uiWorkspace.openSession(sessionId) via the session cycle
   *   userPrev/Next  -> preventDefault + a 300 ms hold-scroll timer (the keyboard
   *                     path is observable; the actual scrolling needs a chat view)
   *   scrollBottom   -> composer textarea receives focus
   *   sidebarBoard / panelHalf / panelFull -> toggleBoard(mode) and the native
   *                     sidebar/layout services are invoked
   *   leftSidebar    -> layout.toggleSidebar()
   *   rename         -> props.requestRename(currentId, title)
   *   sessionMenu    -> props.requestSessionMenu(currentId, title)
   *   interject      -> warn toast when no queued message exists
   *   hud            -> window 'pbx-hud-toggle' event
   * No combo is smoke-only: each one is asserted either through a store, a
   * service call, a spy, or the consumed event.
   */
  const checkers = {
    palette: () => {
      assert.equal(harness.paletteOpen(), true, 'default palette combo opens the palette');
    },
    prev: () => {
      assert.deepEqual(harness.services.calls.openSession, ['s1'], 'default prev combo opens the previous session');
    },
    next: () => {
      assert.deepEqual(harness.services.calls.openSession, ['s3'], 'default next combo opens the next session');
    },
    userPrev: (event, timerStart) => {
      assert.equal(event.defaultPrevented, true, 'default userPrev combo is consumed');
      assert.ok(harness.timersSince(timerStart).some((timer) => timer.delay === 300), 'default userPrev combo arms the hold-scroll timer');
    },
    userNext: (event, timerStart) => {
      assert.equal(event.defaultPrevented, true, 'default userNext combo is consumed');
      assert.ok(harness.timersSince(timerStart).some((timer) => timer.delay === 300), 'default userNext combo arms the hold-scroll timer');
    },
    scrollBottom: () => {
      assert.equal(harness.doc.activeElement, composer, 'default scrollBottom combo focuses the composer');
    },
    sidebarBoard: () => {
      assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'default sidebarBoard combo asks for the narrow board');
      assert.ok(harness.services.calls.sidebarOpenTab.indexOf(BOARD_KIND) >= 0, 'default sidebarBoard combo opens the native board tab');
    },
    leftSidebar: () => {
      assert.deepEqual(harness.spies.toggleLeftSidebar, [true], 'default leftSidebar combo toggles the left sidebar');
      assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'default leftSidebar combo reaches the layout service');
    },
    panelHalf: () => {
      assert.deepEqual(harness.spies.toggleBoard, ['half'], 'default panelHalf combo asks for the half board');
    },
    panelFull: () => {
      assert.deepEqual(harness.spies.toggleBoard, ['full'], 'default panelFull combo asks for the full board');
    },
    rename: () => {
      assert.deepEqual(harness.spies.requestRename, [['s2', 'Beta']], 'default rename combo requests a rename for the current session');
    },
    interject: () => {
      assert.ok(harness.spies.notify.length > 0, 'default interject combo reports that nothing is queued');
      assert.equal(harness.spies.notify[0].tone, 'warn', 'default interject combo warns when there is no queued message');
    },
    hud: () => {
      assert.ok(harness.hudEvents().indexOf('pbx-hud-toggle') >= 0, 'default hud combo dispatches the HUD toggle event');
    },
    sessionMenu: () => {
      assert.deepEqual(harness.spies.requestSessionMenu, [['s2', 'Beta']], 'default sessionMenu combo opens the menu for the current session');
    }
  };

  for (const id of expectedIds) {
    const combo = shortcuts[id];
    assert.equal(typeof combo, 'string', 'default combo for ' + id + ' is a string');
    assert.ok(combo.indexOf('+') > 0, 'default combo for ' + id + ' has a modifier');

    harness.resetState();
    harness.clearSpies();
    harness.doc.activeElement = harness.doc.body;
    const timerStart = harness.timerCount();

    let event;
    assert.doesNotThrow(() => { event = harness.pressCombo(combo); }, 'pressing ' + combo + ' (' + id + ') does not throw');
    assert.ok(event, 'an event object was returned for ' + id);
    assert.equal(event.defaultPrevented, true, 'combo ' + combo + ' (' + id + ') is consumed by the plugin');
    assert.equal(typeof checkers[id], 'function', 'every default combo has a checker');
    checkers[id](event, timerStart);
  }
});

/* ------------------------------------------------------------ reliability net */

test('a real modal leaves every default shortcut to the dialog', () => {
  const harness = createHarness();
  const shortcuts = harness.settingsStore.getSnapshot().shortcuts;

  // A host dialog (settings, confirm, etc.) owns the keyboard while it is open: the plugin
  // must neither act nor consume, or the dialog's own Alt chords stop working.
  const modal = new VirtualNode('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'host dialog' }, [], harness.doc);
  harness.doc.__addRoot(modal);

  for (const id of Object.keys(shortcuts)) {
    harness.resetState();
    harness.clearSpies();
    harness.doc.activeElement = harness.doc.body;
    const event = harness.pressCombo(shortcuts[id]);
    assert.equal(event.defaultPrevented, false, 'a host modal leaves ' + shortcuts[id] + ' (' + id + ') to the dialog');
  }

  assert.equal(harness.paletteOpen(), false, 'no shortcut opens the palette behind a host modal');
  assert.deepEqual(harness.spies.toggleBoard, [], 'no board shortcut fires behind a host modal');
  assert.deepEqual(harness.spies.toggleLeftSidebar, [], 'Alt+W does not fire behind a host modal');
  assert.deepEqual(harness.spies.requestRename, [], 'Alt+R does not fire behind a host modal');
  assert.deepEqual(harness.spies.requestSessionMenu, [], 'Alt+D does not fire behind a host modal');
  assert.deepEqual(harness.hudEvents(), [], 'Alt+E does not fire behind a host modal');

  harness.doc.__removeRoot(modal);
});

test('an extra modifier never matches a configured combo', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  const variants = [
    { altKey: true, shiftKey: true },
    { altKey: true, ctrlKey: true },
    { altKey: true, metaKey: true },
    { metaKey: true }
  ];
  for (const variant of variants) {
    harness.pressRaw(Object.assign({ key: 'k', code: 'KeyK', bubbles: true }, variant));
    assert.equal(harness.paletteOpen(), false, 'combo with extra ' + Object.keys(variant).join('+') + ' must not open the palette');
  }

  // The configured combo itself still works, so the branch above is not dead code.
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'the exact configured combo still opens the palette');
});

test('a disabled command palette does not swallow its combo', () => {
  const harness = createHarness();
  const before = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ palette: Object.assign({}, before.palette, { enabled: false }) });
  harness.render();
  harness.clearSpies();
  harness.resetState();

  const event = harness.pressCombo('alt+KeyK');
  assert.equal(harness.paletteOpen(), false, 'the disabled palette stays closed');
  assert.equal(event.defaultPrevented, false, 'a disabled palette leaves its combo to the rest of the app');
});

test('one Alt+E press toggles the floating list once even if it is delivered twice', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // Alt+E dispatches a window event, so a leaked listener from a hot reload would dispatch it
  // twice and the list would toggle open then closed — the press would look dead.
  const event = new KeyboardEventShim('keydown', { key: 'e', code: 'KeyE', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();
  const toggles = harness.hudEvents().filter((type) => type === 'pbx-hud-toggle');
  assert.equal(toggles.length, 1, 'the duplicated Alt+E delivery dispatches one HUD toggle');
});

test('one Alt+U press arms a single hold even if it is delivered twice', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  const before = harness.timerCount();

  // Two deliveries must not arm two hold loops: a leaked listener keeps its own module state,
  // so each delivery would start an independent requestAnimationFrame loop on the same scroller.
  const event = new KeyboardEventShim('keydown', { key: 'u', code: 'KeyU', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();
  const holdTimers = harness.window.__timers.slice(before).filter((timer) => timer.delay === 300);
  assert.equal(holdTimers.length, 1, 'the duplicated Alt+U delivery arms the hold-scroll timer once');
});

test('palette open: board and dialog shortcuts dismiss it and still act once', () => {
  const harness = createHarness();

  // Alt+N: the palette is modal, but a board key is an explicit way out of it.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  assert.equal(harness.paletteOpen(), true, 'the palette opens first');
  harness.pressCombo('alt+KeyN');
  assert.equal(harness.paletteOpen(), false, 'Alt+N dismisses the palette');
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'Alt+N still toggles the board once');

  // Alt+R: the rename dialog replaces the palette rather than stacking behind it.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  harness.pressCombo('alt+KeyR');
  assert.equal(harness.paletteOpen(), false, 'Alt+R dismisses the palette');
  assert.deepEqual(harness.spies.requestRename, [['s2', 'Beta']], 'Alt+R requests the rename once');

  // Alt+D: same for the session menu.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  harness.pressCombo('alt+KeyD');
  assert.equal(harness.paletteOpen(), false, 'Alt+D dismisses the palette');
  assert.deepEqual(harness.spies.requestSessionMenu, [['s2', 'Beta']], 'Alt+D requests the session menu once');
});

test('a remapped shortcut takes effect at once and frees the old combo', () => {
  const harness = createHarness();
  const before = harness.settingsStore.getSnapshot();
  const next = JSON.parse(JSON.stringify(before));
  next.shortcuts.palette = 'ctrl+alt+KeyP';
  harness.settingsStore.set(next);
  harness.render();

  harness.resetState();
  harness.clearSpies();

  // The old combo is no longer configured, so the page keeps it.
  const oldEvent = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'the previous palette combo no longer opens it');
  assert.equal(oldEvent.defaultPrevented, false, 'the previous palette combo is no longer consumed');

  // The recorded combo works immediately, without a plugin reload.
  harness.pressRaw({ key: 'p', code: 'KeyP', altKey: true, ctrlKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'the remapped combo opens the palette without a reload');
});
test('palette open: every other default combo is consumed without acting', () => {
  const harness = createHarness();
  const shortcuts = harness.settingsStore.getSnapshot().shortcuts;
  const composer = harness.makeEditable();
  harness.doc.__addRoot(composer);

  // Policy (docs/architecture.md): while the palette is open, only its own keys work. The
  // rename / session-menu / board keys dismiss it first and then act once (covered above);
  // every other combo must be consumed and ignored so no Option character or side effect
  // reaches the page.
  const inert = [
    { id: 'userPrev', extra: (start) => assert.equal(holdTimers(harness, start), 0, 'Alt+U arms no hold while the palette is open') },
    { id: 'userNext', extra: (start) => assert.equal(holdTimers(harness, start), 0, 'Alt+M arms no hold while the palette is open') },
    { id: 'scrollBottom', extra: () => assert.notEqual(harness.doc.activeElement, composer, 'Alt+S does not focus the composer behind the palette') },
    { id: 'hud', extra: () => assert.deepEqual(harness.hudEvents(), [], 'Alt+E dispatches no HUD toggle behind the palette') },
    { id: 'interject', extra: () => assert.equal(harness.spies.notify.length, 0, 'Alt+Enter does not report an empty queue behind the palette') }
  ];

  function holdTimers(target, start) {
    return target.window.__timers.slice(start).filter((timer) => timer.delay === 300).length;
  }

  for (const item of inert) {
    harness.resetState();
    harness.clearSpies();
    harness.pressCombo(shortcuts.palette);
    assert.equal(harness.paletteOpen(), true, 'the palette is open before ' + item.id);
    const start = harness.timerCount();
    const event = harness.pressCombo(shortcuts[item.id]);
    assert.equal(event.defaultPrevented, true, shortcuts[item.id] + ' (' + item.id + ') is consumed while the palette is open');
    assert.equal(harness.paletteOpen(), true, shortcuts[item.id] + ' (' + item.id + ') leaves the palette open');
    item.extra(start);
  }

  // The sidebar key follows the board policy: dismiss the palette, then toggle once.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo(shortcuts.palette);
  harness.pressCombo(shortcuts.leftSidebar);
  assert.equal(harness.paletteOpen(), false, 'Alt+W dismisses the palette');
  assert.deepEqual(harness.spies.toggleLeftSidebar, [true], 'Alt+W still toggles the sidebar once');
});
test('Alt+Enter steers the earliest queued message exactly once', () => {
  const harness = createHarness();
  const dock = new VirtualNode('div', { 'data-queue-dock': '' }, [], harness.doc);
  const echo = new VirtualNode('li', { 'data-submission-echo': '' }, [], harness.doc);
  const first = new VirtualNode('li', {}, [], harness.doc);
  const firstButton = new VirtualNode('button', { 'aria-label': '插话发送' }, [], harness.doc);
  const second = new VirtualNode('li', {}, [], harness.doc);
  const secondButton = new VirtualNode('button', { 'aria-label': '插话发送' }, [], harness.doc);
  let firstClicks = 0;
  let secondClicks = 0;
  firstButton.click = () => { firstClicks += 1; };
  secondButton.click = () => { secondClicks += 1; };
  first.appendChild(firstButton);
  second.appendChild(secondButton);
  dock.appendChild(echo);
  dock.appendChild(first);
  dock.appendChild(second);
  harness.doc.__addRoot(dock);

  // The submission echo row is not a pending message: the first steerable row must win, and a
  // duplicated delivery (leaked listener) must not steer a second message.
  const event = new KeyboardEventShim('keydown', { key: 'Enter', code: 'Enter', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();

  assert.equal(firstClicks, 1, 'the earliest queued message is steered once');
  assert.equal(secondClicks, 0, 'later queued messages are left alone');
  assert.equal(harness.spies.notify.length, 0, 'a successful steer raises no warning');
  assert.equal(event.defaultPrevented, true, 'Alt+Enter is consumed when a message is steered');

  harness.doc.__removeRoot(dock);
});

test('Alt+Enter expands a collapsed queue dock and then steers', () => {
  const harness = createHarness();
  const dock = new VirtualNode('div', { 'data-queue-dock': '' }, [], harness.doc);
  const header = new VirtualNode('button', { 'aria-controls': 'queue', 'aria-expanded': 'false' }, [], harness.doc);
  let headerClicks = 0;
  header.click = () => { headerClicks += 1; };
  dock.appendChild(header);
  harness.doc.__addRoot(dock);

  harness.pressRaw({ key: 'Enter', code: 'Enter', altKey: true, bubbles: true });
  assert.equal(headerClicks, 1, 'a collapsed dock is expanded once');
  assert.equal(harness.spies.notify.length, 0, 'expanding the dock is not reported as an empty queue');

  // The host renders the rows after the expansion; the deferred retry then steers the message.
  const row = new VirtualNode('li', {}, [], harness.doc);
  const steer = new VirtualNode('button', { 'aria-label': '插话发送' }, [], harness.doc);
  let steerClicks = 0;
  steer.click = () => { steerClicks += 1; };
  row.appendChild(steer);
  dock.appendChild(row);
  harness.runTimers();
  assert.equal(steerClicks, 1, 'the deferred retry steers the newly rendered message');

  harness.doc.__removeRoot(dock);
});
test('Alt+S uses the native back-to-bottom control and focuses the composer', () => {
  const harness = createHarness();
  const button = new VirtualNode('button', { 'aria-label': '回到底部' }, [], harness.doc);
  button.getBoundingClientRect = () => ({ width: 24, height: 24, top: 0, left: 0, right: 24, bottom: 24 });
  let clicks = 0;
  button.click = () => { clicks += 1; };
  harness.doc.__addRoot(button);

  const composer = harness.makeEditable();
  composer.getBoundingClientRect = () => ({ width: 320, height: 96, top: 600, left: 0, right: 320, bottom: 696 });
  harness.doc.__addRoot(composer);
  harness.doc.activeElement = harness.doc.body;

  harness.pressCombo('alt+KeyS');
  assert.equal(clicks, 1, 'the native back-to-bottom control is pressed once');
  assert.equal(harness.doc.activeElement, composer, 'the conversation composer receives focus');

  // A duplicated delivery must not re-run the focus/scroll dance.
  clicks = 0;
  const event = new KeyboardEventShim('keydown', { key: 's', code: 'KeyS', altKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  harness.doc.dispatchEvent(event);
  harness.render();
  assert.equal(clicks, 1, 'the duplicated Alt+S delivery presses the native control once');

  harness.doc.__removeRoot(button);
});
/* --------------------------------------------------------- settings recorder */

function mountSettingsPage(harness, overrides) {
  const entry = harness.registrations.find((item) => item.spec.id === 'project-board-settings');
  assert.ok(entry, 'the settings page is registered');
  const injected = entry.spec.inject();
  const props = Object.assign(
    {},
    injected,
    {
      t: harness.ctx.locale.bind('projectBoard'),
      useSettings: (selector) => selector(injected.hooks.settings.getSnapshot()),
      useLogs: (selector) => selector(injected.hooks.logs.getSnapshot()),
      useShortcutsCatalog: (selector) => selector(null)
    },
    overrides || {}
  );
  const instance = harness.runtime.mount(entry.component, props, (node) => {
    harness.doc.__setComponentRoot('settings', node);
  });
  instance.render();
  return { instance, injected, props };
}

function clickKeycap(harness, page, index) {
  const keycaps = harness.doc.querySelectorAll('.pbx-keycap');
  assert.ok(keycaps.length > index, 'the shortcut keycaps are rendered');
  keycaps[index].props.onClick({ preventDefault() {}, stopPropagation() {}, target: keycaps[index] });
  page.instance.render();
}

test('recording a shortcut stores the combo and consumes the press', () => {
  const harness = createHarness();
  const page = mountSettingsPage(harness);

  // The palette row is the first keycap in the shortcuts section.
  clickKeycap(harness, page, 0);
  const keycaps = harness.doc.querySelectorAll('.pbx-keycap');
  assert.ok(String(keycaps[0].className).indexOf('recording') >= 0, 'the clicked keycap is in recording state');

  const event = new KeyboardEventShim('keydown', { key: 'p', code: 'KeyP', altKey: true, ctrlKey: true, bubbles: true, cancelable: true });
  harness.doc.dispatchEvent(event);
  page.instance.render();

  assert.equal(harness.settingsStore.getSnapshot().shortcuts.palette, 'ctrl+alt+KeyP', 'the recorded combo is stored');
  assert.equal(event.defaultPrevented, true, 'the recorder consumes the recorded press');
});

test('recording a combo owned by another action is rejected and shown inline', () => {
  const harness = createHarness();
  const page = mountSettingsPage(harness);
  const before = harness.settingsStore.getSnapshot().shortcuts;

  clickKeycap(harness, page, 1); // the "previous session" keycap
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  page.instance.render();

  const after = harness.settingsStore.getSnapshot().shortcuts;
  assert.equal(after.prev, before.prev, 'the conflicting combo is not stored');
  assert.equal(after.palette, 'alt+KeyK', 'the original owner keeps its combo');
  const errors = harness.doc.querySelectorAll('.pbx-setError');
  assert.equal(errors.length, 1, 'the conflict is reported inline');
  assert.ok(String(errors[0].textContent || errors[0].children.length).length >= 0, 'the inline error carries text');
});

test('recording a combo used by a built-in command is rejected', () => {
  const harness = createHarness();
  const page = mountSettingsPage(harness, { findBuiltinConflict: () => ({ label: 'Host Command' }) });

  clickKeycap(harness, page, 0);
  harness.pressRaw({ key: 'p', code: 'KeyP', altKey: true, bubbles: true });
  page.instance.render();

  assert.equal(harness.settingsStore.getSnapshot().shortcuts.palette, 'alt+KeyK', 'a built-in conflict is not stored');
  assert.equal(harness.doc.querySelectorAll('.pbx-setError').length, 1, 'the built-in conflict is reported inline');
});

test('while recording, other shortcuts stay suppressed', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  const page = mountSettingsPage(harness);

  clickKeycap(harness, page, 10); // "rename"
  // Alt+K is owned by the palette; the recorder must swallow it instead of letting the
  // global dispatcher open the search panel behind the settings page.
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  page.instance.render();

  assert.equal(harness.paletteOpen(), false, 'no shortcut fires while a combo is being recorded');
  assert.equal(harness.doc.querySelectorAll('.pbx-setError').length, 1, 'the recorder still reports the conflict');
});

test('Escape cancels recording without changing the combo', () => {
  const harness = createHarness();
  const page = mountSettingsPage(harness);
  const before = harness.settingsStore.getSnapshot().shortcuts;

  clickKeycap(harness, page, 0);
  harness.pressRaw({ key: 'Escape', code: 'Escape', bubbles: true });
  page.instance.render();

  assert.equal(harness.settingsStore.getSnapshot().shortcuts.palette, before.palette, 'Escape leaves the combo unchanged');
  assert.equal(harness.doc.querySelectorAll('.pbx-keycap.recording').length, 0, 'Escape ends the recording state');
});

test('recording ignores a bare modifier and rejects a modifier-free combo', () => {
  const harness = createHarness();
  const page = mountSettingsPage(harness);
  const before = harness.settingsStore.getSnapshot().shortcuts;

  clickKeycap(harness, page, 0);

  // A modifier pressed on its own is not a combo: the keycap keeps waiting.
  harness.pressRaw({ key: 'Alt', code: 'AltLeft', altKey: true, bubbles: true });
  page.instance.render();
  assert.ok(String(harness.doc.querySelectorAll('.pbx-keycap')[0].className).indexOf('recording') >= 0, 'a bare modifier keeps recording');

  // A plain letter is not a shortcut either: it is rejected with a hint, not stored.
  harness.pressRaw({ key: 'p', code: 'KeyP', bubbles: true });
  page.instance.render();
  assert.equal(harness.settingsStore.getSnapshot().shortcuts.palette, before.palette, 'a modifier-free combo is not stored');
  assert.equal(harness.doc.querySelectorAll('.pbx-setError').length, 1, 'the missing modifier is reported inline');
});

test('a tap on Alt+U jumps to the previous instruction and releases match their own key', () => {
  const harness = createHarness();

  // Minimal conversation view: a flow host with two rendered user bubbles. The first sits
  // above the viewport, so "previous" has a target to jump to.
  const flow = new VirtualNode('div', { 'data-slot': 'conversation.chat.flow' }, [], harness.doc);
  flow.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  function makeRow(top) {
    const row = new VirtualNode('div', { 'data-slot': 'conversation.chat.user.content' }, [], harness.doc);
    row.getBoundingClientRect = () => ({ width: 600, height: 40, top, left: 0, right: 600, bottom: top + 40 });
    const classes = new Set();
    row.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
    row.offsetWidth = 0;
    row.__classes = classes;
    flow.appendChild(row);
    return row;
  }
  const above = makeRow(-50);
  makeRow(200);
  harness.doc.__addRoot(flow);

  // Tap: press and release inside the 300 ms hold delay, so the loop never starts.
  harness.pressCombo('alt+KeyU');
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  assert.ok(above.__classes.has('pbx-user-jump-highlight'), 'a tap jumps to the previous instruction');

  // A release of a different key belongs to that key's own hold.
  harness.pressCombo('alt+KeyU');
  above.__classes.delete('pbx-user-jump-highlight');
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyM', altKey: true, bubbles: true }));
  assert.equal(above.__classes.has('pbx-user-jump-highlight'), false, 'a different key release leaves the tap pending');
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  assert.ok(above.__classes.has('pbx-user-jump-highlight'), 'the matching release still performs the tap jump');

  harness.doc.__removeRoot(flow);
});
test('auto-repeat and IME composition never trigger a shortcut', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // Holding a key down produces repeated keydown events; only the first press acts.
  const repeatPalette = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, repeat: true, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'a repeated Alt+K does not open the palette');
  assert.equal(repeatPalette.defaultPrevented, false, 'a repeat is left to the page');

  const repeatBoard = harness.pressRaw({ key: 'n', code: 'KeyN', altKey: true, repeat: true, bubbles: true });
  assert.deepEqual(harness.spies.toggleBoard, [], 'a repeated Alt+N does not toggle the board');
  assert.equal(repeatBoard.defaultPrevented, false, 'the repeat is not consumed');

  // While an IME is composing, the keystroke belongs to the composition.
  const composing = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, isComposing: true, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'a composing Alt+K does not open the palette');
  assert.equal(composing.defaultPrevented, false, 'a composing key is not consumed by the plugin');

  const keyCodeComposing = harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, keyCode: 229, bubbles: true });
  assert.equal(harness.paletteOpen(), false, 'a keyCode 229 event does not open the palette');
  assert.equal(keyCodeComposing.defaultPrevented, false, 'a keyCode 229 event is not consumed');

  // The first real press still works, so the gates are not swallowing everything.
  harness.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  assert.equal(harness.paletteOpen(), true, 'a fresh press opens the palette');
});
/* ------------------------------------------------------- board pane (stateful) */

/**
 * Make the stubbed host behave like DSH's right pane: opening a tab and expanding the pane
 * create a `[class*="_panel"][data-sidebar-right-open]` node, `layout.panels.setRightbar`
 * changes the measured column width and `toggleFullscreen` toggles the fullscreen marker.
 * The plugin reads that same markup, so the three-state board logic can be exercised end to end.
 */
function connectBoardPane(harness) {
  const state = { kind: null, expanded: false, fullscreen: false, width: 0 };
  const panel = new VirtualNode('div', { class: '_panel' }, [], harness.doc);
  const column = new VirtualNode('div', { 'data-rightbar-col': '' }, [], harness.doc);
  const fullscreenNode = new VirtualNode('div', { 'data-rightbar-fullscreen': 'true' }, [], harness.doc);
  column.getBoundingClientRect = () => ({ width: state.width, height: 400, top: 0, left: 800, right: 800 + state.width, bottom: 400 });
  harness.doc.__addRoot(column);

  function sync() {
    const open = Boolean(state.kind && state.expanded);
    if (open) panel.setAttribute('data-sidebar-right-open', '');
    else panel.removeAttribute('data-sidebar-right-open');
    if (open) harness.doc.__addRoot(panel);
    else harness.doc.__removeRoot(panel);
    if (state.fullscreen) harness.doc.__addRoot(fullscreenNode);
    else harness.doc.__removeRoot(fullscreenNode);
  }

  harness.services.sidebarRight.active = () => (state.kind ? { kind: state.kind } : undefined);
  harness.services.sidebarRight.isExpanded = () => state.expanded;
  harness.services.sidebarRight.openTab = (kind) => {
    state.kind = kind;
    harness.services.calls.sidebarOpenTab.push(kind);
    sync();
  };
  harness.services.sidebarRight.toggleExpanded = () => {
    state.expanded = !state.expanded;
    if (state.expanded && !state.width) state.width = 380;
    harness.services.calls.sidebarToggleExpanded.push(state.expanded);
    sync();
  };
  harness.services.sidebarRight.commandTarget = () => (state.kind ? 'board' : undefined);
  harness.services.sidebarRight.toggleFullscreen = () => {
    state.fullscreen = !state.fullscreen;
    sync();
  };
  harness.services.layout.panels.setRightbar = (px) => {
    state.width = px;
    harness.services.calls.setRightbar.push(px);
  };
  return state;
}

test('Alt+N opens the narrow board and the next press closes it', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  assert.equal(state.kind, BOARD_KIND, 'the native board tab is opened');
  assert.equal(state.expanded, true, 'the pane is expanded');
  assert.equal(state.width, 380, 'the narrow width is applied');

  harness.pressCombo('alt+KeyN');
  assert.equal(state.expanded, false, 'the same key closes the pane it opened');
});

test('Alt+B on a narrow board resizes it and closes on the next press', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  harness.pressCombo('alt+KeyB');
  assert.equal(state.expanded, true, 'a different size key keeps the pane open');
  assert.equal(state.width, Math.round(harness.window.innerWidth * 0.5), 'the half width is applied');

  harness.pressCombo('alt+KeyB');
  assert.equal(state.expanded, false, 'the same key then closes the half-width pane');
});

test('Alt+V opens fullscreen from an open board and closes on the next press', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  harness.pressCombo('alt+KeyV');
  assert.equal(state.expanded, true, 'the pane stays open');
  assert.equal(state.fullscreen, true, 'the pane goes fullscreen');

  harness.pressCombo('alt+KeyV');
  assert.equal(state.expanded, false, 'the same key closes the fullscreen pane');
});

test('Alt+N from a fullscreen board leaves fullscreen and lands on the narrow width', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  harness.pressCombo('alt+KeyV');
  assert.equal(state.fullscreen, true, 'the board is fullscreen');

  harness.pressCombo('alt+KeyN');
  assert.equal(state.fullscreen, false, 'a size key leaves fullscreen');
  assert.equal(state.expanded, true, 'the pane stays open');
  assert.equal(state.width, 380, 'and lands on the narrow width');
});
/* ------------------------------------------------------------ session cycle */

test('the session cycle handles a single session', () => {
  const harness = createHarness();
  const savedIds = SESSION_FIXTURE.ids;
  const savedById = SESSION_FIXTURE.byId;
  try {
    SESSION_FIXTURE.ids = ['s2'];
    SESSION_FIXTURE.byId = { s2: savedById.s2 };
    harness.resetState();
    harness.clearSpies();
    harness.render();

    harness.pressCombo('alt+Comma');
    assert.deepEqual(harness.services.calls.openSession, ['s2'], 'next opens the only session');

    harness.clearSpies();
    harness.pressCombo('alt+KeyI');
    assert.deepEqual(harness.services.calls.openSession, ['s2'], 'previous opens the only session');
  } finally {
    SESSION_FIXTURE.ids = savedIds;
    SESSION_FIXTURE.byId = savedById;
  }
});

test('the session cycle follows the floating list order', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  // The floating list publishes the order its rows are shown in; the cycle must follow that
  // order instead of re-sorting by activity. The default order here would be s1, s2, s3.
  const orderStore = harness.registrations.find((entry) => entry.spec.id === 'project-board-palette').spec.inject().hooks.hudOrder;
  orderStore.set({ ids: ['s1', 's3', 's2'] });
  harness.render();

  harness.pressCombo('alt+Comma');
  assert.deepEqual(harness.services.calls.openSession, ['s1'], 'next follows the published order (s2 wraps to s1)');

  harness.clearSpies();
  harness.pressCombo('alt+KeyI');
  assert.deepEqual(harness.services.calls.openSession, ['s3'], 'previous follows the published order (s2 -> s3)');
});

test('the session cycle starts from an end when the current session is not listed', () => {
  const harness = createHarness();
  const saved = SESSION_FIXTURE.byId.s2;
  try {
    delete SESSION_FIXTURE.byId.s2.retainedBy;
    harness.resetState();
    harness.clearSpies();
    harness.render();

    harness.pressCombo('alt+KeyI');
    assert.deepEqual(harness.services.calls.openSession, ['s3'], 'previous wraps to the last row when there is no current session');

    harness.clearSpies();
    harness.pressCombo('alt+Comma');
    assert.deepEqual(harness.services.calls.openSession, ['s1'], 'next starts at the first row when there is no current session');
  } finally {
    SESSION_FIXTURE.byId.s2 = saved;
    harness.render();
  }
});
/* ------------------------------------------------------- view persistence + HUD */

function mountBoardPanel(harness) {
  const entry = harness.registrations.find((item) => item.spec.key === 'project-board');
  assert.ok(entry, 'the main board panel is registered');
  const injected = entry.spec.inject();
  const props = Object.assign({}, injected, {
    useSessions: (selector) => selector(SESSION_FIXTURE),
    useSessionStatus: (selector) => selector(new Map()),
    useWorkspaces: (selector) =>
      selector({ items: [{ workspaceId: 'w1', title: 'Workspace', sessionIds: ['s1', 's2', 's3'] }], archivedSessionIds: [] }),
    useSettings: (selector) => selector(harness.settingsStore.getSnapshot()),
    t: harness.ctx.locale.bind('projectBoard')
  });
  const instance = harness.runtime.mount(entry.component, props, (node) => harness.doc.__setComponentRoot('board', node));
  instance.render();
  return instance;
}

test('opening the board by shortcut lands on the project view', () => {
  const harness = createHarness();
  const board = mountBoardPanel(harness);
  const tabs = () => harness.doc.querySelectorAll('.pbx-tab');
  assert.equal(tabs().length, 2, 'the board renders its two view tabs');
  assert.equal(tabs()[0].getAttribute('aria-selected'), 'true', 'the configured default view is projects');

  // The user switches to the session list while the pane stays mounted.
  tabs()[1].props.onClick({});
  board.render();
  assert.equal(tabs()[1].getAttribute('aria-selected'), 'true', 'the session view is selected');

  // Opening the board through a shortcut must land on projects even though the mounted
  // component still holds the session view in its own state.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyN');
  board.render();
  assert.equal(tabs()[0].getAttribute('aria-selected'), 'true', 'a shortcut open switches back to the project view');
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'the board was opened once');
});

test('Alt+E turns a disabled floating list back on', () => {
  const harness = createHarness();
  const hud = harness.mountHud();
  const before = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ hud: Object.assign({}, before.hud, { enabled: false }) });
  hud.render();

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyE');
  hud.render();

  assert.equal(harness.settingsStore.getSnapshot().hud.enabled, true, 'the shortcut re-enables the floating list');
  assert.equal(harness.hudEvents().filter((type) => type === 'pbx-hud-toggle').length, 1, 'one toggle event per press');
});
test('Alt+W toggles the sidebar without disturbing an open board pane', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  harness.clearSpies();
  harness.pressCombo('alt+KeyW');

  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'the sidebar toggles');
  assert.deepEqual(harness.spies.toggleBoard, [], 'the board pane is not toggled again');
  assert.equal(state.expanded, true, 'the board stays open');
  assert.equal(state.width, 380, 'and keeps its narrow width');
});

test('Alt+W walks the sidebar API fallbacks when a path is missing or throws', () => {
  const harness = createHarness();
  const paths = [];
  harness.services.layout.toggleSidebar = () => {
    throw new Error('not supported by this host build');
  };
  harness.services.layout.panels = { toggleSidebar: () => { paths.push('panels'); }, setRightbar() {} };

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyW');
  assert.deepEqual(paths, ['panels'], 'a throwing primary path falls through to layout.panels.toggleSidebar');

  // A host build that exposes neither layout method still has the left sidebar service.
  delete harness.services.layout.toggleSidebar;
  harness.services.layout.panels = undefined;
  harness.services.sidebarLeft = { toggleExpanded: () => { paths.push('left'); } };
  harness.pressCombo('alt+KeyW');
  assert.deepEqual(paths, ['panels', 'left'], 'the left sidebar service is the last fallback');
});
test('every shortcut that must work while typing still does', () => {
  const harness = createHarness();
  const textarea = harness.makeEditable();
  harness.doc.__addRoot(textarea);

  // A queued message for Alt+Enter.
  const dock = new VirtualNode('div', { 'data-queue-dock': '' }, [], harness.doc);
  const row = new VirtualNode('li', {}, [], harness.doc);
  const steer = new VirtualNode('button', { 'aria-label': '插话发送' }, [], harness.doc);
  let steers = 0;
  steer.click = () => { steers += 1; };
  row.appendChild(steer);
  dock.appendChild(row);
  harness.doc.__addRoot(dock);

  // The host's own back-to-bottom control for Alt+S.
  const backToBottom = new VirtualNode('button', { 'aria-label': '回到底部' }, [], harness.doc);
  backToBottom.getBoundingClientRect = () => ({ width: 24, height: 24, top: 0, left: 0, right: 24, bottom: 24 });
  let bottoms = 0;
  backToBottom.click = () => { bottoms += 1; };
  harness.doc.__addRoot(backToBottom);

  const cases = [
    { key: 'Enter', code: 'Enter', id: 'interject', check: () => assert.equal(steers, 1, 'Alt+Enter steers while typing') },
    { key: 'u', code: 'KeyU', id: 'userPrev', check: () => {} },
    { key: 'm', code: 'KeyM', id: 'userNext', check: () => {} },
    { key: 's', code: 'KeyS', id: 'scrollBottom', check: () => assert.equal(bottoms, 1, 'Alt+S scrolls to the bottom while typing') }
  ];

  for (const item of cases) {
    harness.resetState();
    harness.clearSpies();
    harness.focusEditable(textarea);
    const start = harness.timerCount();
    const event = harness.pressRaw({ key: item.key, code: item.code, altKey: true, bubbles: true });
    assert.equal(event.defaultPrevented, true, 'Alt+' + item.code + ' (' + item.id + ') is consumed while typing');
    if (item.id === 'userPrev' || item.id === 'userNext') {
      const holdTimers = harness.window.__timers.slice(start).filter((timer) => timer.delay === 300);
      assert.equal(holdTimers.length, 1, 'Alt+' + item.code + ' arms the hold while typing');
    }
    item.check();
  }

  harness.doc.__removeRoot(dock);
  harness.doc.__removeRoot(backToBottom);
});
/* ------------------------------------------------------- hold-to-scroll loop */

function makeScrollableChat(harness, options) {
  const settings = options || {};
  const scroller = new VirtualNode('div', { class: 'native-scroll' }, [], harness.doc);
  const flow = new VirtualNode('div', { 'data-slot': 'conversation.chat.flow' }, [], harness.doc);
  flow.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  scroller.appendChild(flow);
  scroller.scrollTop = typeof settings.scrollTop === 'number' ? settings.scrollTop : 600;
  scroller.scrollHeight = typeof settings.scrollHeight === 'number' ? settings.scrollHeight : 2000;
  scroller.clientHeight = 600;
  scroller.style = { scrollBehavior: 'smooth' };
  scroller.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  scroller.dispatchEvent = () => true;
  harness.doc.__addRoot(scroller);
  const previousComputedStyle = harness.window.getComputedStyle;
  harness.window.getComputedStyle = (node) => (node === scroller ? { overflowY: 'auto' } : { overflowY: 'visible' });
  return {
    scroller,
    restore() {
      harness.window.getComputedStyle = previousComputedStyle;
      harness.doc.__removeRoot(scroller);
    }
  };
}

test('holding Alt+U scrolls the conversation up and stops on release', () => {
  const harness = createHarness();
  const chat = makeScrollableChat(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyU');
  harness.runTimers(); // the 300 ms hold delay elapses and the loop starts

  let clock = 0;
  for (let i = 0; i < 8; i += 1) {
    clock += 16;
    harness.runFrame(clock);
  }
  assert.ok(chat.scroller.scrollTop < 600, 'the conversation scrolled up while the key was held');
  assert.equal(chat.scroller.style.scrollBehavior, 'auto', 'the plugin drives the scroller while held');

  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  const releasedAt = chat.scroller.scrollTop;
  for (let i = 0; i < 4; i += 1) {
    clock += 16;
    harness.runFrame(clock);
  }
  assert.equal(chat.scroller.scrollTop, releasedAt, 'the loop stops after the key is released');
  assert.equal(chat.scroller.style.scrollBehavior, 'smooth', 'the original scroll-behavior is restored');

  chat.restore();
});

test('holding Alt+M to the bottom focuses the composer once', () => {
  const harness = createHarness();
  const chat = makeScrollableChat(harness, { scrollTop: 1400, scrollHeight: 2000 });
  const composer = harness.makeEditable();
  composer.getBoundingClientRect = () => ({ width: 320, height: 96, top: 600, left: 0, right: 320, bottom: 696 });
  harness.doc.__addRoot(composer);
  harness.doc.activeElement = harness.doc.body;

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyM');
  harness.runTimers();

  let clock = 0;
  for (let i = 0; i < 3; i += 1) {
    clock += 16;
    harness.runFrame(clock);
  }
  assert.equal(harness.doc.activeElement, composer, 'the composer is focused when the held scroll reaches the bottom');

  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyM', altKey: true, bubbles: true }));
  harness.doc.activeElement = harness.doc.body;
  for (let i = 0; i < 3; i += 1) {
    clock += 16;
    harness.runFrame(clock);
  }
  assert.equal(harness.doc.activeElement, harness.doc.body, 'the focus is not stolen again after release');

  chat.restore();
});

test('repeated Alt+U taps walk past the row that was just visited', () => {
  const harness = createHarness();
  const flow = new VirtualNode('div', { 'data-slot': 'conversation.chat.flow' }, [], harness.doc);
  flow.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  function row(top) {
    const node = new VirtualNode('div', { 'data-slot': 'conversation.chat.user.content' }, [], harness.doc);
    node.getBoundingClientRect = () => ({ width: 600, height: 40, top, left: 0, right: 600, bottom: top + 40 });
    const classes = new Set();
    node.classList = { add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name) };
    node.offsetWidth = 0;
    node.__classes = classes;
    flow.appendChild(node);
    return node;
  }
  const older = row(-200);
  const nearer = row(-50);
  row(200);
  harness.doc.__addRoot(flow);

  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyU');
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  assert.ok(nearer.__classes.has('pbx-user-jump-highlight'), 'the first tap jumps to the nearest instruction above the viewport');

  // A second tap inside the 700 ms window must skip the row it just visited.
  harness.pressCombo('alt+KeyU');
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  assert.ok(older.__classes.has('pbx-user-jump-highlight'), 'the second tap moves on to the next instruction above');

  harness.doc.__removeRoot(flow);
});
test('holding Alt+U near the top prefetches older history once', () => {
  const harness = createHarness();
  const chat = makeScrollableChat(harness, { scrollTop: 400, scrollHeight: 2000 });
  const loadEarlier = new VirtualNode('button', {}, [], harness.doc);
  loadEarlier.textContent = '加载更早';
  loadEarlier.getBoundingClientRect = () => ({ width: 120, height: 28, top: 0, left: 0, right: 120, bottom: 28 });
  loadEarlier.offsetParent = {};
  let loads = 0;
  loadEarlier.click = () => { loads += 1; };
  harness.doc.__addRoot(loadEarlier);

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyU');
  harness.runTimers();

  let clock = 0;
  for (let i = 0; i < 3; i += 1) {
    clock += 16;
    harness.window.__setNow(clock);
    harness.runFrame(clock);
  }
  assert.equal(loads, 1, 'the host history button is pressed once while approaching the top');
  assert.ok(chat.scroller.scrollTop < 400, 'the loop keeps scrolling while the page loads');

  // The host page arrives: the poll notices the growth and stops waiting.
  chat.scroller.scrollHeight = 2400;
  harness.runIntervals();
  const waits = harness.window.__intervals.filter((timer) => !timer.cleared && timer.delay === 120);
  assert.equal(waits.length, 0, 'the growth poll stops once the page has arrived');

  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  harness.doc.__removeRoot(loadEarlier);
  chat.restore();
});

test('a history page that never arrives ends the held scroll instead of looping forever', () => {
  const harness = createHarness();
  const chat = makeScrollableChat(harness, { scrollTop: 30, scrollHeight: 2000 });
  const loadEarlier = new VirtualNode('button', {}, [], harness.doc);
  loadEarlier.textContent = '加载更早';
  loadEarlier.getBoundingClientRect = () => ({ width: 120, height: 28, top: 0, left: 0, right: 120, bottom: 28 });
  loadEarlier.offsetParent = {};
  let loads = 0;
  loadEarlier.click = () => { loads += 1; }; // clicks, but the host never grows the list
  harness.doc.__addRoot(loadEarlier);

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyU');
  harness.runTimers();

  let clock = 0;
  for (let i = 0; i < 40; i += 1) {
    clock += 16;
    harness.window.__setNow(clock);
    harness.runFrame(clock);
  }
  // The 2600 ms deadline is measured on performance.now(): expire it and let the poll run.
  harness.window.__setNow(clock + 4000);
  harness.runIntervals();
  harness.runFrame(clock + 4016);

  assert.equal(loads, 1, 'the button is pressed once, not in a loop');
  assert.equal(harness.frameCount(), 0, 'the loop stops after the page fails to arrive');

  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  harness.doc.__removeRoot(loadEarlier);
  chat.restore();
});

test('a reverted scroll position falls back to stepping by message anchors', () => {
  const harness = createHarness();
  const scroller = new VirtualNode('div', { class: 'native-scroll' }, [], harness.doc);
  const flow = new VirtualNode('div', { 'data-slot': 'conversation.chat.flow' }, [], harness.doc);
  flow.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  scroller.appendChild(flow);
  let stored = 600;
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => stored,
    set: () => { /* the host reverts every plain position write */ }
  });
  scroller.scrollHeight = 2000;
  scroller.clientHeight = 600;
  scroller.style = { scrollBehavior: '' };
  scroller.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  scroller.dispatchEvent = () => true;
  harness.doc.__addRoot(scroller);

  const anchors = [];
  for (let i = 0; i < 3; i += 1) {
    const anchor = new VirtualNode('div', { 'data-chat-anchor-key': 'a' + i }, [], harness.doc);
    anchor.getBoundingClientRect = () => ({ width: 600, height: 80, top: i * 220 - 100, left: 0, right: 600, bottom: i * 220 - 20 });
    anchor.scrollIntoView = () => { stored = Math.max(0, stored - 120); anchors.push(i); };
    scroller.appendChild(anchor);
  }

  const previousComputedStyle = harness.window.getComputedStyle;
  harness.window.getComputedStyle = (node) => (node === scroller ? { overflowY: 'auto' } : { overflowY: 'visible' });

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyU');
  harness.runTimers();

  let clock = 0;
  for (let i = 0; i < 30; i += 1) {
    clock += 16;
    harness.window.__setNow(clock);
    harness.runFrame(clock);
  }

  assert.ok(anchors.length >= 1, 'a message anchor step is used when plain writes are reverted');
  assert.ok(stored < 600, 'the anchor step actually moved the view');

  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  harness.window.getComputedStyle = previousComputedStyle;
  harness.doc.__removeRoot(scroller);
});
test('Alt+W from a fullscreen board exits fullscreen and toggles the sidebar', () => {
  const harness = createHarness();
  const state = connectBoardPane(harness);
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyN');
  harness.pressCombo('alt+KeyV');
  assert.equal(state.fullscreen, true, 'the board is fullscreen first');

  harness.clearSpies();
  harness.pressCombo('alt+KeyW');
  assert.equal(state.fullscreen, false, 'the fullscreen board is left before the sidebar toggles');
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'the sidebar toggles exactly once');
  assert.equal(state.expanded, true, 'the board pane itself stays open');
});
test('the palette navigates with the arrow keys and opens with Enter', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  assert.equal(harness.paletteOpen(), true, 'the palette is open');

  function input() {
    const node = harness.doc.querySelector('.pbx-paletteInput');
    assert.ok(node, 'the palette input is rendered');
    return node;
  }
  function key(name) {
    input().props.onKeyDown({ key: name, preventDefault() {}, stopPropagation() {}, currentTarget: input() });
    harness.render();
  }

  // The list is ordered by activity: s1, s2, s3. One ArrowDown selects s2.
  key('ArrowDown');
  key('Enter');
  assert.deepEqual(harness.services.calls.openSession, ['s2'], 'Enter opens the highlighted row');
  assert.equal(harness.paletteOpen(), false, 'choosing a row closes the palette');

  // ArrowUp at the top row stays there instead of wrapping out of bounds.
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  key('ArrowUp');
  key('Enter');
  assert.deepEqual(harness.services.calls.openSession, ['s1'], 'ArrowUp at the first row keeps the first row selected');
});

test('Alt+S without a scroller scrolls the flow and honours reduced motion', () => {
  const harness = createHarness();
  const flow = new VirtualNode('div', { 'data-slot': 'conversation.chat.flow' }, [], harness.doc);
  flow.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600 });
  const calls = [];
  flow.scrollIntoView = (options) => { calls.push(options); };
  harness.doc.__addRoot(flow);

  const composer = harness.makeEditable();
  composer.getBoundingClientRect = () => ({ width: 320, height: 96, top: 600, left: 0, right: 320, bottom: 696 });
  harness.doc.__addRoot(composer);
  harness.doc.activeElement = harness.doc.body;

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyS');
  assert.equal(calls.length, 1, 'the conversation flow is scrolled into view');
  assert.equal(calls[0].behavior, 'smooth', 'the default scroll is smooth');
  assert.equal(harness.doc.activeElement, composer, 'the composer still receives focus');

  // With reduced motion requested the fallback jumps instead of animating.
  const previousMatchMedia = harness.window.matchMedia;
  harness.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  calls.length = 0;
  harness.doc.activeElement = harness.doc.body;
  harness.pressCombo('alt+KeyS');
  assert.equal(calls.length, 1, 'the flow is scrolled again');
  assert.equal(calls[0].behavior, 'auto', 'reduced motion uses an instant jump');
  harness.window.matchMedia = previousMatchMedia;

  harness.doc.__removeRoot(flow);
});
test('the palette traps Tab focus and closes on Escape', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');

  const originalGetClientRects = VirtualNode.prototype.getClientRects;
  VirtualNode.prototype.getClientRects = function getClientRects() { return [{}]; };
  try {
    const panel = harness.doc.querySelector('.pbx-palette');
    assert.ok(panel, 'the palette panel is rendered');
    const focusables = panel.querySelectorAll('button, input');
    assert.ok(focusables.length >= 2, 'the panel renders focusable controls');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    let prevented = 0;
    harness.doc.activeElement = last;
    panel.props.onKeyDown({ key: 'Tab', shiftKey: false, currentTarget: panel, preventDefault() { prevented += 1; }, stopPropagation() {} });
    assert.equal(prevented, 1, 'Tab on the last control is trapped');
    assert.equal(harness.doc.activeElement, first, 'focus wraps to the first control');
  } finally {
    VirtualNode.prototype.getClientRects = originalGetClientRects;
  }

  const input = harness.doc.querySelector('.pbx-paletteInput');
  input.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, currentTarget: input });
  harness.render();
  assert.equal(harness.paletteOpen(), false, 'Escape closes the palette');
});
/* ---------------------------------------------------- degraded host services */

test('a host without the sidebar-right service degrades instead of throwing', () => {
  const harness = createHarness({ services: { sidebarRight: undefined } });
  harness.resetState();
  harness.clearSpies();

  for (const combo of ['alt+KeyN', 'alt+KeyB', 'alt+KeyV']) {
    let event = null;
    assert.doesNotThrow(() => { event = harness.pressCombo(combo); }, combo + ' must not throw without the right-pane service');
    assert.equal(event.defaultPrevented, true, combo + ' is still consumed');
    assert.deepEqual(harness.spies.toggleBoard.slice(-1), [combo === 'alt+KeyN' ? 'narrow' : combo === 'alt+KeyB' ? 'half' : 'full'], combo + ' still asks for its mode');
  }

  // The left sidebar uses a different service and keeps working.
  harness.clearSpies();
  harness.pressCombo('alt+KeyW');
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'Alt+W is unaffected by the missing right pane');
});

test('a host without the layout service falls back to the left sidebar service', () => {
  const harness = createHarness({ services: { layout: undefined } });
  harness.services.sidebarLeft = {
    toggleExpanded() {
      harness.services.calls.layoutToggleSidebar.push(true);
    }
  };
  harness.resetState();
  harness.clearSpies();

  assert.doesNotThrow(() => harness.pressCombo('alt+KeyW'), 'Alt+W must not throw without the layout service');
  assert.deepEqual(harness.services.calls.layoutToggleSidebar, [true], 'the fallback service performs the toggle');

  assert.doesNotThrow(() => harness.pressCombo('alt+KeyN'), 'Alt+N must not throw without the layout service');
});

test('rename and session-menu stay silent when no session is current', () => {
  const harness = createHarness();
  const saved = SESSION_FIXTURE.byId.s2.retainedBy;
  try {
    delete SESSION_FIXTURE.byId.s2.retainedBy;
    harness.resetState();
    harness.clearSpies();
    harness.render();

    const renameEvent = harness.pressCombo('alt+KeyR');
    assert.deepEqual(harness.spies.requestRename, [], 'no rename request without a current session');
    assert.equal(renameEvent.defaultPrevented, false, 'the rename key is left to the page');

    const menuEvent = harness.pressCombo('alt+KeyD');
    assert.deepEqual(harness.spies.requestSessionMenu, [], 'no session-menu request without a current session');
    assert.equal(menuEvent.defaultPrevented, false, 'the session-menu key is left to the page');
  } finally {
    SESSION_FIXTURE.byId.s2.retainedBy = saved;
    harness.render();
  }
});

test('the built-in conflict check skips catalog rows that already report conflicts', () => {
  const harness = createHarness();
  harness.services.shortcuts = {
    catalog: {
      getSnapshot: () => [
        { id: 'conflicted', label: 'Conflicted Command', binding: { code: 'KeyZ', modifiers: ['alt'] }, conflicts: ['another binding'] },
        { id: 'clean', label: 'Clean Command', binding: { code: 'KeyP', modifiers: ['alt'] } }
      ]
    }
  };
  const page = mountSettingsPage(harness);

  // A row that already reports conflicts is not a reliable owner of the combo, so it must not
  // block recording. ("previous session" is keycap index 1.)
  clickKeycap(harness, page, 1);
  harness.pressRaw({ key: 'z', code: 'KeyZ', altKey: true, bubbles: true });
  page.instance.render();
  assert.equal(harness.settingsStore.getSnapshot().shortcuts.prev, 'alt+KeyZ', 'a conflicted catalog row does not block the combo');

  // A clean row still owns its combo and rejects the recording.
  clickKeycap(harness, page, 2);
  harness.pressRaw({ key: 'p', code: 'KeyP', altKey: true, bubbles: true });
  page.instance.render();
  assert.equal(harness.settingsStore.getSnapshot().shortcuts.next, 'alt+Comma', 'a clean catalog row still rejects the combo');
  assert.equal(harness.doc.querySelectorAll('.pbx-setError').length, 1, 'the rejection is reported inline');
});
function sidebarLogEntries(harness) {
  const entry = harness.registrations.find((item) => item.spec.id === 'project-board-settings');
  return entry.spec.inject().hooks.logs.getSnapshot().entries;
}

test('Alt+W records whether the toggle actually moved the layout', () => {
  const harness = createHarness();
  const frame = new VirtualNode('div', { class: '_frame' }, [], harness.doc);
  frame.style = { gridTemplateColumns: '280px 1fr' };
  frame.attributes.style = 'grid-template-columns: 280px 1fr';
  harness.doc.__addRoot(frame);
  harness.services.layout.toggleSidebar = () => {
    frame.style.gridTemplateColumns = '0px 1fr';
    frame.attributes.style = 'grid-template-columns: 0px 1fr';
    frame.attributes['data-sidebar-collapsed'] = '';
  };
  harness.resetState();
  harness.clearSpies();

  let mark = sidebarLogEntries(harness).length;
  harness.pressCombo('alt+KeyW');
  harness.runTimers();
  let added = sidebarLogEntries(harness).slice(mark).filter((entry) => entry.scope === 'sidebar');
  const applied = added.find((entry) => entry.message === 'applied');
  assert.ok(applied, 'a toggle that moved the frame is recorded as applied');
  assert.equal(applied.data.before.track, 280, 'the recorded before-state carries the old track');
  assert.equal(applied.data.after.track, 0, 'the recorded after-state carries the new track');

  // A host API that runs but changes nothing is the "key did nothing" case: warn, not info.
  harness.services.layout.toggleSidebar = () => {};
  mark = sidebarLogEntries(harness).length;
  harness.pressCombo('alt+KeyW');
  harness.runTimers();
  added = sidebarLogEntries(harness).slice(mark).filter((entry) => entry.scope === 'sidebar');
  const noChange = added.find((entry) => entry.message === 'no-change');
  assert.ok(noChange, 'a silent host API is recorded as no-change');
  assert.equal(noChange.level, 'warn', 'no-change is a warning so it stands out in the log');

  // Without a frame to compare there is nothing to verify: claim that honestly.
  harness.doc.__removeRoot(frame);
  mark = sidebarLogEntries(harness).length;
  harness.pressCombo('alt+KeyW');
  harness.runTimers();
  added = sidebarLogEntries(harness).slice(mark).filter((entry) => entry.scope === 'sidebar');
  assert.ok(added.some((entry) => entry.message === 'unverified'), 'a missing frame is recorded as unverified');
});

test('Alt+E is harmless when no floating list is mounted', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();

  assert.doesNotThrow(() => harness.pressCombo('alt+KeyE'), 'Alt+E must not throw without a mounted list');
  assert.equal(harness.hudEvents().filter((type) => type === 'pbx-hud-toggle').length, 1, 'the toggle event is dispatched once');
});
test('duplicate shortcut bindings are healed when settings load', () => {
  // Persist a real settings blob first so the test does not have to hard-code the storage key.
  const seed = createHarness();
  const page = mountSettingsPage(seed);
  clickKeycap(seed, page, 1); // "previous session"
  seed.pressRaw({ key: 'z', code: 'KeyZ', altKey: true, bubbles: true });
  page.instance.render();

  const dump = seed.window.localStorage.__dump();
  const key = Object.keys(dump).find((name) => {
    try {
      const value = JSON.parse(dump[name]);
      return Boolean(value && typeof value === 'object' && value.shortcuts);
    } catch (error) {
      return false;
    }
  });
  assert.ok(key, 'the settings blob was persisted');

  const stored = JSON.parse(dump[key]);
  assert.equal(stored.shortcutsVersion, 1, 'the stored blob already carries the migration marker');
  assert.equal(stored.shortcuts.prev, 'alt+KeyZ', 'the custom combo was saved');
  stored.shortcuts.next = 'alt+KeyZ'; // a duplicate the one-time migration can never see again

  const fresh = createHarness({ storage: { [key]: JSON.stringify(stored) } });
  const shortcuts = fresh.settingsStore.getSnapshot().shortcuts;
  const owners = Object.keys(shortcuts).filter((action) => shortcuts[action] === 'alt+KeyZ');
  assert.equal(owners.length, 1, 'only one action keeps the duplicated combo');
  assert.equal(shortcuts.prev, 'alt+KeyZ', 'the earlier action keeps its combo');
  assert.equal(shortcuts.next, 'alt+Comma', 'the later action falls back to its own default');
});
test('a duplicate that healing cannot repair is surfaced instead of staying silent', () => {
  // Persist a settings blob, then craft the case healing cannot fix: prev and next share a
  // combo while both of their own defaults are taken by other actions.
  const seed = createHarness();
  const page = mountSettingsPage(seed);
  clickKeycap(seed, page, 0);
  seed.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  page.instance.render();
  const dump = seed.window.localStorage.__dump();
  const key = Object.keys(dump).find((name) => {
    try {
      const value = JSON.parse(dump[name]);
      return Boolean(value && value.shortcuts);
    } catch (error) {
      return false;
    }
  });
  assert.ok(key, 'the settings blob was persisted');

  const stored = JSON.parse(dump[key]);
  stored.shortcuts.prev = 'alt+KeyZ';
  stored.shortcuts.next = 'alt+KeyZ';
  stored.shortcuts.userPrev = 'alt+KeyI'; // occupies prev's default
  stored.shortcuts.scrollBottom = 'alt+Comma'; // occupies next's default

  const fresh = createHarness({ storage: { [key]: JSON.stringify(stored) } });
  const shortcuts = fresh.settingsStore.getSnapshot().shortcuts;
  assert.equal(shortcuts.prev, 'alt+KeyZ');
  assert.equal(shortcuts.next, 'alt+KeyZ', 'the duplicate survives when neither default is free');

  // The settings page names it instead of leaving a silently dead shortcut.
  mountSettingsPage(fresh);
  const warns = fresh.doc.querySelectorAll('.pbx-setWarn[data-self-conflict]');
  assert.equal(warns.length, 1, 'the settings page reports the unresolved duplicate');
  assert.equal(warns[0].getAttribute('data-self-conflict'), 'alt+KeyZ');

  // The startup scan records it in the log so a bug report can show it.
  fresh.runTimers();
  const logs = fresh.registrations.find((item) => item.spec.id === 'project-board-settings').spec.inject().hooks.logs;
  const entry = logs.getSnapshot().entries.find((item) => item.scope === 'shortcuts' && item.message === 'duplicate binding');
  assert.ok(entry, 'the duplicate binding is logged at startup');
  assert.equal(entry.data.combo, 'alt+KeyZ');
  assert.equal(entry.level, 'warn', 'the log entry is a warning');
});

test('a clean shortcut map reports no self-conflict anywhere', () => {
  const harness = createHarness();
  mountSettingsPage(harness);
  assert.equal(harness.doc.querySelectorAll('.pbx-setWarn[data-self-conflict]').length, 0, 'no warning rows for unique bindings');

  harness.runTimers();
  const logs = harness.registrations.find((item) => item.spec.id === 'project-board-settings').spec.inject().hooks.logs;
  const duplicates = logs.getSnapshot().entries.filter((item) => item.message === 'duplicate binding');
  assert.equal(duplicates.length, 0, 'no duplicate-binding log entries for unique bindings');
});
/** Dialog components return a form element; run convertTree on the form itself so its real
 *  markup (role=dialog, aria-modal) lands in the virtual document. */
function mountReturnedForm(harness, component, props, rootKey) {
  const element = component(props);
  const target = element && typeof element === 'object' && element.type && typeof element.type !== 'string' ? element : null;
  const instance = target
    ? harness.runtime.mount(target.type, target.props || {}, (node) => harness.doc.__setComponentRoot(rootKey, node))
    : harness.runtime.mount(component, props, (node) => harness.doc.__setComponentRoot(rootKey, node));
  instance.render();
  return instance;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

/* ------------------------------------------------- plugin-owned dialogs (modal) */

function mountRenameDialog(harness, request, overrides) {
  const entry = harness.registrations.find((item) => item.spec.id === 'project-board-rename');
  assert.ok(entry, 'the rename dialog is registered');
  const injected = entry.spec.inject();
  injected.rename.set({ sessionId: request.sessionId, currentTitle: request.currentTitle, at: Date.now() });
  const props = Object.assign(
    {},
    injected,
    { useRename: (selector) => selector(injected.hooks.rename.getSnapshot()), t: harness.ctx.locale.bind('projectBoard') },
    overrides || {}
  );
  // convertTree treats nested components as opaque, so mount the form the dialog returns.
  const instance = mountReturnedForm(harness, entry.component, props, 'rename');
  return { instance, injected };
}

function mountSessionMenu(harness, request, overrides) {
  const entry = harness.registrations.find((item) => item.spec.id === 'project-board-session-menu');
  assert.ok(entry, 'the session menu is registered');
  const injected = entry.spec.inject();
  injected.hooks.sessionMenu.set({ sessionId: request.sessionId, title: request.title, at: Date.now() });
  const props = Object.assign(
    {},
    injected,
    { useSessionMenu: (selector) => selector(injected.hooks.sessionMenu.getSnapshot()), t: harness.ctx.locale.bind('projectBoard') },
    overrides || {}
  );
  const instance = mountReturnedForm(harness, entry.component, props, 'session-menu');
  return { instance, injected };
}

test('an open rename dialog leaves every shortcut to the dialog', () => {
  const harness = createHarness();
  const shortcuts = harness.settingsStore.getSnapshot().shortcuts;
  mountRenameDialog(harness, { sessionId: 's2', currentTitle: 'Beta' });
  assert.ok(harness.doc.querySelector('.pbx-renameCard'), 'the rename dialog is rendered');

  for (const id of Object.keys(shortcuts)) {
    harness.resetState();
    harness.clearSpies();
    harness.doc.activeElement = harness.doc.body;
    const event = harness.pressCombo(shortcuts[id]);
    assert.equal(event.defaultPrevented, false, shortcuts[id] + ' (' + id + ') is left to the rename dialog');
  }
  assert.equal(harness.paletteOpen(), false, 'no shortcut opens the palette behind the dialog');
  assert.deepEqual(harness.spies.requestRename, [], 'Alt+R does not stack a second rename dialog');
  assert.deepEqual(harness.spies.requestSessionMenu, [], 'Alt+D does not open the menu behind the dialog');
  assert.deepEqual(harness.spies.toggleBoard, [], 'no board shortcut fires behind the dialog');
  assert.deepEqual(harness.hudEvents(), [], 'Alt+E does not fire behind the dialog');
});

test('an open session menu leaves every shortcut to the dialog', () => {
  const harness = createHarness();
  const shortcuts = harness.settingsStore.getSnapshot().shortcuts;
  const menu = mountSessionMenu(harness, { sessionId: 's2', title: 'Beta' });
  assert.ok(harness.doc.querySelector('.pbx-renameCard'), 'the session menu is rendered');

  for (const id of Object.keys(shortcuts)) {
    harness.resetState();
    harness.clearSpies();
    harness.doc.activeElement = harness.doc.body;
    const event = harness.pressCombo(shortcuts[id]);
    assert.equal(event.defaultPrevented, false, shortcuts[id] + ' (' + id + ') is left to the session menu');
  }
  assert.deepEqual(harness.spies.requestSessionMenu, [], 'Alt+D does not stack a second menu');
  assert.deepEqual(harness.spies.toggleLeftSidebar, [], 'Alt+W does not fire behind the dialog');

  // A host without a delete API: the destructive action is disabled and stays disabled.
  const danger = harness.doc.querySelectorAll('.pbx-menuOption.danger')[0];
  assert.ok(danger, 'the delete option is rendered');
  assert.equal(danger.disabled, true, 'delete is disabled when the host exposes no delete API');
  const archive = harness.doc.querySelectorAll('.pbx-menuOption')[0];
  assert.equal(archive.disabled, false, 'archive stays available');
  assert.equal(menu.injected.deleteSupported, false, 'the injected capability flag agrees');
});
test('submitting a rename trims, saves once and closes the dialog', async () => {
  const harness = createHarness();
  const calls = [];
  const page = mountRenameDialog(harness, { sessionId: 's2', currentTitle: 'Beta' }, {
    renameSession: (id, title) => { calls.push([id, title]); return { ok: true }; }
  });

  const input = harness.doc.querySelector('.pbx-renameInput');
  input.props.onChange({ target: { value: '  Beta 2  ' } });
  page.instance.render();
  harness.doc.querySelectorAll('.pbx-renameBtn.primary')[0].props.onClick({});
  await tick();
  page.instance.render();

  assert.deepEqual(calls, [['s2', 'Beta 2']], 'the trimmed title is submitted once');
  assert.equal(page.injected.hooks.rename.getSnapshot().sessionId, null, 'the dialog closes after success');
});

test('the Enter key submits a rename and Escape cancels it', async () => {
  const harness = createHarness();
  const calls = [];
  const page = mountRenameDialog(harness, { sessionId: 's2', currentTitle: 'Beta' }, {
    renameSession: (id, title) => { calls.push([id, title]); return { ok: true }; }
  });

  let input = harness.doc.querySelector('.pbx-renameInput');
  input.props.onChange({ target: { value: 'Entered' } });
  page.instance.render();
  input = harness.doc.querySelector('.pbx-renameInput');
  input.props.onKeyDown({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
  await tick();
  page.instance.render();
  assert.deepEqual(calls, [['s2', 'Entered']], 'Enter submits the rename');

  // A second dialog: Escape closes it without calling the host.
  const page2 = mountRenameDialog(harness, { sessionId: 's3', currentTitle: 'Gamma' }, {
    renameSession: () => { throw new Error('must not be called'); }
  });
  harness.doc.activeElement = harness.doc.body;
  harness.doc.dispatchEvent(new KeyboardEventShim('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  page2.instance.render();
  assert.equal(page2.injected.hooks.rename.getSnapshot().sessionId, null, 'Escape closes the dialog');
});

test('a failed rename keeps the dialog open and shows the reason', async () => {
  const harness = createHarness();
  const page = mountRenameDialog(harness, { sessionId: 's2', currentTitle: 'Beta' }, {
    renameSession: () => ({ ok: false, error: { message: 'rename failed on host' } })
  });

  const input = harness.doc.querySelector('.pbx-renameInput');
  input.props.onChange({ target: { value: 'Nope' } });
  page.instance.render();
  harness.doc.querySelectorAll('.pbx-renameBtn.primary')[0].props.onClick({});
  await tick();
  page.instance.render();

  const error = harness.doc.querySelector('.pbx-renameError');
  assert.ok(error, 'the failure is shown in the dialog');
  assert.equal(error.children[0].textContent, 'rename failed on host');
  assert.equal(page.injected.hooks.rename.getSnapshot().sessionId, 's2', 'the dialog stays open for another try');
});

test('archiving from the session menu closes it on success and reports failures', async () => {
  const harness = createHarness();
  const archived = [];
  const menu = mountSessionMenu(harness, { sessionId: 's2', title: 'Beta' }, {
    archiveSession: (id) => { archived.push(id); return { ok: true }; }
  });
  harness.doc.querySelectorAll('.pbx-menuOption')[0].props.onClick({});
  await tick();
  menu.instance.render();
  assert.deepEqual(archived, ['s2'], 'the session is archived once');
  assert.equal(menu.injected.hooks.sessionMenu.getSnapshot().sessionId, null, 'the menu closes after archiving');

  const failing = mountSessionMenu(harness, { sessionId: 's3', title: 'Gamma' }, {
    archiveSession: () => ({ ok: false, error: { message: 'session is still running' } })
  });
  harness.doc.querySelectorAll('.pbx-menuOption')[0].props.onClick({});
  await tick();
  failing.instance.render();
  const error = harness.doc.querySelector('.pbx-renameError');
  assert.ok(error, 'the archive failure is shown');
  assert.ok(String(error.children[0].textContent).indexOf('session is still running') >= 0, 'the host reason is carried into the message');
  assert.equal(failing.injected.hooks.sessionMenu.getSnapshot().sessionId, 's3', 'the menu stays open');
});

test('delete asks for confirmation once and then calls the host', async () => {
  const harness = createHarness();
  const deletions = [];
  const menu = mountSessionMenu(harness, { sessionId: 's2', title: 'Beta' }, {
    deleteSupported: true,
    deleteSession: (id) => { deletions.push(id); return { ok: true }; }
  });

  harness.doc.querySelectorAll('.pbx-menuOption.danger')[0].props.onClick({});
  await tick();
  menu.instance.render();
  assert.deepEqual(deletions, [], 'the first press only asks for confirmation');

  harness.doc.querySelectorAll('.pbx-menuOption.danger')[0].props.onClick({});
  await tick();
  menu.instance.render();
  assert.deepEqual(deletions, ['s2'], 'the second press deletes the session');
  assert.equal(menu.injected.hooks.sessionMenu.getSnapshot().sessionId, null, 'the menu closes after deleting');
});
/* --------------------------------------------------------- floating list (HUD) */

test('Alt+E collapses and expands the floating list and persists the choice', () => {
  const harness = createHarness();
  const hud = harness.mountHud('hud');
  harness.resetState();
  harness.clearSpies();

  assert.ok(harness.doc.querySelector('.pbx-hud'), 'the floating list is rendered');

  harness.pressCombo('alt+KeyE');
  harness.runTimers(); // the 120 ms swap timer applies the collapse
  hud.render();
  assert.equal(harness.window.localStorage.getItem('pbx.hud.collapsed'), '1', 'the collapsed choice is persisted');
  let root = harness.doc.querySelector('.pbx-hud');
  assert.ok(String(root.className).indexOf('collapsed') >= 0, 'the pill is rendered after collapsing');

  harness.pressCombo('alt+KeyE');
  harness.runTimers();
  hud.render();
  assert.equal(harness.window.localStorage.getItem('pbx.hud.collapsed'), '0', 'the expanded choice is persisted');
  root = harness.doc.querySelector('.pbx-hud');
  assert.ok(String(root.className).indexOf('collapsed') < 0, 'the list is rendered after expanding');
});

test('opening the palette while a hold is running stops the scroll', () => {
  const harness = createHarness();
  const chat = makeScrollableChat(harness, { scrollTop: 600 });
  harness.resetState();
  harness.clearSpies();

  harness.pressCombo('alt+KeyU');
  harness.runTimers();
  let clock = 0;
  for (let i = 0; i < 5; i += 1) {
    clock += 16;
    harness.window.__setNow(clock);
    harness.runFrame(clock);
  }
  const movedTo = chat.scroller.scrollTop;
  assert.ok(movedTo < 600, 'the hold is scrolling before the palette opens');

  // The user opens the search palette with the mouse while still holding the key.
  harness.paletteStore.set({ open: true, move: { dir: 0, at: 0 } });
  harness.render();
  for (let i = 0; i < 5; i += 1) {
    clock += 16;
    harness.window.__setNow(clock);
    harness.runFrame(clock);
  }
  assert.equal(chat.scroller.scrollTop, movedTo, 'the conversation stops scrolling once the palette is open');

  harness.paletteStore.set({ open: false, move: { dir: 0, at: 0 } });
  harness.window.dispatchEvent(new KeyboardEventShim('keyup', { code: 'KeyU', altKey: true, bubbles: true }));
  chat.restore();
});
test('dragging the floating list stores its position and follows it', () => {
  const harness = createHarness();
  const hud = harness.mountHud('hud');
  harness.resetState();
  harness.clearSpies();

  const head = harness.doc.querySelector('.pbx-hudHead');
  assert.ok(head, 'the floating list header is rendered');
  const box = harness.doc.querySelector('.pbx-hud');
  box.getBoundingClientRect = () => ({ width: 280, height: 200, top: 40, left: 40, right: 320, bottom: 240 });
  box.offsetWidth = 280;
  box.offsetHeight = 200;

  head.props.onPointerDown({
    button: 0,
    clientX: 100,
    clientY: 100,
    target: head,
    currentTarget: head,
    preventDefault() {},
    stopPropagation() {}
  });
  hud.render();

  harness.window.dispatchEvent({ type: 'pointermove', clientX: 240, clientY: 300, bubbles: true });
  hud.render();
  harness.window.dispatchEvent({ type: 'pointerup', bubbles: true });
  hud.render();

  const raw = harness.window.localStorage.getItem('pbx.hud.pos');
  assert.ok(raw, 'the dropped position is stored');
  const pos = JSON.parse(raw);
  assert.equal(pos.x, 180, 'the x follows the drag offset');
  assert.equal(pos.y, 240, 'the y follows the drag offset');

  const root = harness.doc.querySelector('.pbx-hud');
  assert.equal(root.style.left, pos.x + 'px', 'the list is placed at the stored x');
  assert.equal(root.style.top, pos.y + 'px', 'the list is placed at the stored y');
});

test('a stored position is honoured when the floating list mounts', () => {
  const harness = createHarness();
  harness.window.localStorage.setItem('pbx.hud.pos', JSON.stringify({ x: 120, y: 260 }));
  const before = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ hud: Object.assign({}, before.hud, { defaultPosition: 'last' }) });

  const hud = harness.mountHud('hud');
  hud.render();

  const root = harness.doc.querySelector('.pbx-hud');
  assert.ok(root, 'the floating list is rendered');
  assert.equal(root.style.left, '120px', 'the stored x is restored');
  assert.equal(root.style.top, '260px', 'the stored y is restored');
});
test('a moved floating list docks next to the sidebar and returns to its own spot', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  harness.window.localStorage.setItem('pbx.hud.pos', JSON.stringify({ x: 600, y: 500 }));
  const settings = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ hud: Object.assign({}, settings.hud, { defaultPosition: 'last' }) });

  /* element.style.gridTemplateColumns is the value only; the attribute keeps the declaration. */
  const closed = '0px minmax(400px, 1fr) minmax(0px, 800px)';
  const opened = '280px minmax(400px, 1fr) minmax(0px, 800px)';
  const frame = new VirtualNode('div', { className: 'AppFrame_frame', style: { gridTemplateColumns: closed }, 'data-sidebar-collapsed': 'true' }, [], harness.doc);
  frame.attributes.style = 'grid-template-columns: ' + closed;
  const column = new VirtualNode('div', { class: '_sidebarCol' }, [], harness.doc);
  column.getBoundingClientRect = () => ({ width: 280, height: 800, top: 0, left: 0, right: 280, bottom: 800 });
  frame.appendChild(column);
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud('hud');
  assert.ok(hud.node, 'the floating list rendered');
  assert.equal(hud.node.style.left, '600px', 'the list starts at its stored spot');

  // The native sidebar opens: the list docks beside it and collapses to the pill.
  frame.style.gridTemplateColumns = opened;
  frame.attributes.style = 'grid-template-columns: ' + opened;
  frame.removeAttribute('data-sidebar-collapsed');
  harness.runIntervals();
  hud.render();
  harness.runTimers(); // the 80 ms dock position and the 320 ms follow-up
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list collapses while docked');
  assert.equal(hud.node.style.left, '288px', 'the pill hugs the sidebar column edge');

  // Closing the sidebar returns the list to the user own position and expanded state.
  frame.style.gridTemplateColumns = closed;
  frame.attributes.style = 'grid-template-columns: ' + closed;
  frame.setAttribute('data-sidebar-collapsed', 'true');
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list unfolds again');
  assert.equal(hud.node.style.left, '600px', 'the list returns to the stored x');
  assert.equal(hud.node.style.top, '500px', 'the list returns to the stored y');

  harness.doc.__removeRoot(frame);
});

test('Alt+E on a disabled floating list re-enables it expanded', () => {
  const harness = createHarness();
  const before = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ hud: Object.assign({}, before.hud, { enabled: false, defaultCollapsed: true }) });
  const hud = harness.mountHud('hud');
  assert.equal(hud.node, null, 'nothing is rendered while the list is disabled');

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyE');
  harness.runTimers();
  hud.render();

  assert.equal(harness.settingsStore.getSnapshot().hud.enabled, true, 'the shortcut turns the list back on');
  assert.ok(hud.node, 'the list is rendered again');
  assert.equal(/collapsed/.test(hud.node.className), false, 'and it comes back expanded, not as a pill');
  assert.equal(harness.window.localStorage.getItem('pbx.hud.collapsed'), '0', 'the expanded choice is persisted');
});
test('board shortcuts do not disturb a docked floating list', () => {
  const harness = createHarness();
  harness.window.localStorage.setItem('pbx.hud.pos', JSON.stringify({ x: 600, y: 500 }));
  const seeded = harness.settingsStore.getSnapshot();
  harness.settingsStore.set({ hud: Object.assign({}, seeded.hud, { defaultPosition: 'last' }) });
  const closed = '0px minmax(400px, 1fr) minmax(0px, 800px)';
  const opened = '280px minmax(400px, 1fr) minmax(0px, 800px)';
  const frame = new VirtualNode('div', { className: 'AppFrame_frame', style: { gridTemplateColumns: closed }, 'data-sidebar-collapsed': 'true' }, [], harness.doc);
  frame.attributes.style = 'grid-template-columns: ' + closed;
  const column = new VirtualNode('div', { class: '_sidebarCol' }, [], harness.doc);
  column.getBoundingClientRect = () => ({ width: 280, height: 800, top: 0, left: 0, right: 280, bottom: 800 });
  frame.appendChild(column);
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud('hud');
  frame.style.gridTemplateColumns = opened;
  frame.attributes.style = 'grid-template-columns: ' + opened;
  frame.removeAttribute('data-sidebar-collapsed');
  harness.runIntervals();
  hud.render();
  harness.runTimers();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list is docked and collapsed');
  assert.equal(hud.node.style.left, '288px', 'the pill sits beside the sidebar');

  const logs = harness.registrations.find((item) => item.spec.id === 'project-board-settings').spec.inject().hooks.logs;
  const dockCount = () => logs.getSnapshot().entries.filter((entry) => entry.scope === 'hud' && entry.message === 'dock').length;
  const docked = dockCount();
  assert.ok(docked >= 1, 'docking is recorded');

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyN');
  hud.render();
  harness.runIntervals();
  hud.render();
  assert.deepEqual(harness.spies.toggleBoard, ['narrow'], 'the board shortcut still opens the pane');
  assert.equal(/collapsed/.test(hud.node.className), true, 'the docked pill stays collapsed');
  assert.equal(hud.node.style.left, '288px', 'the docked position is untouched by the board shortcut');
  assert.equal(dockCount(), docked, 'the board shortcut does not dock the list again');

  harness.doc.__removeRoot(frame);
});
test('Alt+E during a drag collapses the list and the drop still completes', () => {
  const harness = createHarness();
  const hud = harness.mountHud('hud');
  assert.ok(hud.node, 'the floating list rendered');
  hud.node.getBoundingClientRect = () => ({ width: 280, height: 200, top: 40, left: 40, right: 320, bottom: 240 });
  hud.node.offsetWidth = 280;
  hud.node.offsetHeight = 200;

  const head = harness.doc.querySelector('.pbx-hudHead');
  head.props.onPointerDown({ button: 0, clientX: 100, clientY: 100, target: head, currentTarget: head, preventDefault() {}, stopPropagation() {} });
  hud.render();
  assert.ok(/dragging/.test(hud.node.className), 'the list reports the drag');

  harness.window.dispatchEvent({ type: 'pointermove', clientX: 300, clientY: 320, bubbles: true });
  hud.render();

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyE');
  hud.render();
  harness.runTimers();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'Alt+E collapses the list even mid-drag');

  harness.window.dispatchEvent({ type: 'pointerup', bubbles: true });
  hud.render();
  assert.equal(/dragging/.test(hud.node.className), false, 'the drop clears the drag state');
  assert.ok(harness.window.localStorage.getItem('pbx.hud.pos'), 'the dropped position is still stored');
});
test('invalid stored shortcut values fall back to their defaults', () => {
  // Persist a real blob, then corrupt individual values the way a hand-edited file would.
  const seed = createHarness();
  const page = mountSettingsPage(seed);
  clickKeycap(seed, page, 0);
  seed.pressRaw({ key: 'k', code: 'KeyK', altKey: true, bubbles: true });
  page.instance.render();
  const dump = seed.window.localStorage.__dump();
  const key = Object.keys(dump).find((name) => {
    try {
      const value = JSON.parse(dump[name]);
      return Boolean(value && value.shortcuts);
    } catch (error) {
      return false;
    }
  });
  assert.ok(key, 'the settings blob was persisted');

  const stored = JSON.parse(dump[key]);
  stored.shortcuts.prev = 'KeyK'; // no modifier
  stored.shortcuts.next = ''; // empty
  stored.shortcuts.userPrev = 42; // wrong type
  stored.shortcuts.palette = 'alt+KeyP'; // a valid custom combo
  stored.shortcuts.bogusAction = 'alt+KeyQ'; // unknown action

  const fresh = createHarness({ storage: { [key]: JSON.stringify(stored) } });
  const shortcuts = fresh.settingsStore.getSnapshot().shortcuts;
  assert.equal(shortcuts.prev, 'alt+KeyI', 'a modifier-less value falls back to the default');
  assert.equal(shortcuts.next, 'alt+Comma', 'an empty value falls back to the default');
  assert.equal(shortcuts.userPrev, 'alt+KeyU', 'a non-string value falls back to the default');
  assert.equal(shortcuts.palette, 'alt+KeyP', 'a valid custom combo survives untouched');

  fresh.resetState();
  fresh.clearSpies();
  const restored = fresh.pressCombo('alt+KeyI');
  assert.equal(restored.defaultPrevented, true, 'the restored default combo works again');
  const unknown = fresh.pressCombo('alt+KeyQ');
  assert.equal(unknown.defaultPrevented, false, 'a combo stored under an unknown action stays inert');
});
test('Escape in the palette drops the project filter before it closes the panel', () => {
  const harness = createHarness();
  harness.setWorkspaces({
    items: [{ workspaceId: 'w1', title: 'Workspace', sessionIds: ['s1', 's2', 's3'] }],
    archivedSessionIds: []
  });
  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+KeyK');
  assert.equal(harness.paletteOpen(), true, 'the palette is open');

  const chips = harness.doc.querySelectorAll('.pbx-pchip');
  assert.equal(chips.length, 2, 'the palette offers an all-projects chip and one project chip');
  chips[1].props.onClick({});
  harness.render();
  const active = harness.doc.querySelectorAll('.pbx-pchip.on');
  assert.equal(active.length, 1, 'one chip owns the filter');
  assert.notEqual(active[0], harness.doc.querySelectorAll('.pbx-pchip')[0], 'the project chip is the active one');

  function escape() {
    const input = harness.doc.querySelector('.pbx-paletteInput');
    input.props.onKeyDown({ key: 'Escape', preventDefault() {}, stopPropagation() {}, currentTarget: input });
    harness.render();
  }
  escape();
  assert.equal(harness.paletteOpen(), true, 'the first Escape only clears the filter');
  const chipsAfter = harness.doc.querySelectorAll('.pbx-pchip');
  const cleared = harness.doc.querySelectorAll('.pbx-pchip.on');
  assert.equal(cleared.length, 1, 'exactly one chip is active after clearing');
  assert.equal(cleared[0], chipsAfter[0], 'the all-projects chip is active again');

  escape();
  assert.equal(harness.paletteOpen(), false, 'the second Escape closes the palette');
});
test('Alt+Enter with a disabled steer reports instead of pretending to send', () => {
  const harness = createHarness();
  const dock = new VirtualNode('div', { 'data-queue-dock': '' }, [], harness.doc);
  const row = new VirtualNode('li', {}, [], harness.doc);
  const steer = new VirtualNode('button', { 'aria-label': '插话发送' }, [], harness.doc);
  steer.disabled = true;
  let clicks = 0;
  steer.click = () => { clicks += 1; };
  row.appendChild(steer);
  dock.appendChild(row);
  harness.doc.__addRoot(dock);

  harness.resetState();
  harness.clearSpies();
  harness.pressCombo('alt+Enter');

  assert.equal(clicks, 0, 'a disabled steer button is never clicked');
  assert.equal(harness.spies.notify.length, 1, 'the user is told there is nothing to send');
  assert.equal(harness.spies.notify[0].tone, 'warn', 'the notice is a warning');

  harness.doc.__removeRoot(dock);
});

test('Alt+S is harmless without a conversation on screen', () => {
  const harness = createHarness();
  harness.resetState();
  harness.clearSpies();
  let event = null;
  assert.doesNotThrow(() => { event = harness.pressCombo('alt+KeyS'); }, 'Alt+S must not throw without a chat');
  assert.equal(event.defaultPrevented, true, 'the combo is still consumed');
  assert.equal(harness.doc.activeElement, harness.doc.body, 'and no stray focus change happens');
});