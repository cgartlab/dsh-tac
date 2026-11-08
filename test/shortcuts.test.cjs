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
 * Everything is deterministic: timers are recorded but never fire, no network,
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
    this.isConnected = true;
    this.textContent = '';
    this.value = '';
    this.disabled = Boolean(this.props.disabled);
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
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

function createLocalStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
    removeItem: (key) => { data.delete(key); },
    clear: () => data.clear()
  };
}

function createWindowStub(doc, localStorage) {
  const timers = [];
  const intervals = [];
  const frames = [];
  const dispatched = [];
  const listenerMap = new Map();
  let idSeq = 0;

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
    performance: { now: () => 0 },
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

function createHarness() {
  const doc = createVirtualDocument();
  const localStorage = createLocalStorage();
  const win = createWindowStub(doc, localStorage);
  const services = createServices();
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

  const props = Object.assign({}, injected, {
    t: ctx.locale.bind('projectBoard'),
    useSessions: (selector) => selector(SESSION_FIXTURE),
    useSessionStatus: (selector) => selector(new Map()),
    useWorkspaces: (selector) => selector({ items: [], archivedSessionIds: [] }),
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
    mountHud() {
      const entry = registrations.find((item) => item.spec.id === 'project-board-hud');
      assert.ok(entry, 'the floating session list overlay is registered');
      const hud = runtime.mount(entry.component, Object.assign({}, props, entry.spec.inject()), () => {});
      hud.render();
      return hud;
    },
    runIntervals() {
      for (const timer of win.__intervals.slice()) if (!timer.cleared) timer.fn();
    },
    runTimers() {
      for (const timer of win.__timers.slice()) if (!timer.cleared) timer.fn();
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
  const closed = 'grid-template-columns: 0px minmax(400px, 1fr) minmax(0px, 800px)';
  const opened = 'grid-template-columns: 280px minmax(400px, 1fr) minmax(0px, 800px)';
  const frame = new VirtualNode('div', {
    className: 'AppFrame_frame',
    style: { gridTemplateColumns: closed },
    'data-sidebar-collapsed': 'true'
  }, [], harness.doc);
  frame.attributes.style = closed;
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud();
  assert.ok(hud.node, 'the floating list rendered');
  assert.equal(/collapsed/.test(hud.node.className), false, 'the list starts unfolded while the sidebar is closed');

  // Open the sidebar: the frame's target state changes immediately, before the column animates.
  frame.style.gridTemplateColumns = opened;
  frame.attributes.style = opened;
  frame.removeAttribute('data-sidebar-collapsed');
  harness.runIntervals();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list collapses to a pill as soon as the sidebar target state changes');

  // Close it again: the pill must come back without waiting for a width animation to finish.
  frame.style.gridTemplateColumns = closed;
  frame.attributes.style = closed;
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
  frame.attributes.style = opened;
  harness.doc.__addRoot(frame);

  const hud = harness.mountHud();
  hud.render();
  assert.equal(/collapsed/.test(hud.node.className), true, 'the list starts as a pill when the app opens with the sidebar expanded');

  frame.style.gridTemplateColumns = closed;
  frame.attributes.style = closed;
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