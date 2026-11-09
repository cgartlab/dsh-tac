/*! dsh-tac 0.4.3 — generated from src/ by scripts/build.mjs; do not edit */
"use strict";
(() => {
  // src/constants.ts
  var MODULE_ID = "dsh-tac";
  var NS = "projectBoard";
  var STORE_KEY = "dsh.project-board.appearance.v1";
  var BOARD_ID = "dsh-tac/tab";
  var BOARD_KIND = "projectBoard";
  var SETTINGS_KEY = "dsh.project-board.settings.v1";
  var LOG_KEY = "pbx.logs.v1";
  var HUD_POS_KEY = "pbx.hud.pos";
  var HUD_STARTS_KEY = "pbx.hud.starts";
  var HUD_COLLAPSE_KEY = "pbx.hud.collapsed";
  var BOARD_WIDTH_KEY = "pbx.board.width";
  var SHORTCUT_LABEL_KEYS = {
    palette: "settings.shortcut.palette",
    prev: "settings.shortcut.prev",
    next: "settings.shortcut.next",
    userPrev: "settings.shortcut.userPrev",
    userNext: "settings.shortcut.userNext",
    scrollBottom: "settings.shortcut.scrollBottom",
    sidebarBoard: "settings.shortcut.sidebarBoard",
    leftSidebar: "settings.shortcut.leftSidebar",
    panelHalf: "settings.shortcut.panelHalf",
    panelFull: "settings.shortcut.panelFull",
    rename: "settings.shortcut.rename",
    interject: "settings.shortcut.interject",
    hud: "settings.shortcut.hud",
    sessionMenu: "settings.shortcut.sessionMenu"
  };
  var DEFAULT_SETTINGS = {
    shortcuts: {
      palette: "alt+KeyK",
      prev: "alt+KeyI",
      next: "alt+Comma",
      userPrev: "alt+KeyU",
      userNext: "alt+KeyM",
      scrollBottom: "alt+KeyS",
      sidebarBoard: "alt+KeyN",
      leftSidebar: "alt+KeyW",
      panelHalf: "alt+KeyB",
      panelFull: "alt+KeyV",
      rename: "alt+KeyR",
      interject: "alt+Enter",
      hud: "alt+KeyE",
      sessionMenu: "alt+KeyD"
    },
    palette: { enabled: true, blur: 15, includeArchived: true },
    header: { capsule: true, placement: "header" },
    hints: { shortcuts: true },
    hintsVersion: 1,
    shortcutsVersion: 1,
    headerButtonsVersion: 3,
    headerButtons: {
      switch: { hidden: false, side: "left", order: 10 },
      historyNav: { hidden: false, side: "left", order: 20 },
      capsule: { hidden: false, side: "left", order: 50 }
    },
    hud: {
      enabled: true,
      includeDone: true,
      defaultCollapsed: false,
      defaultPosition: "top-right",
      recentEnabled: true,
      recentCount: 5,
      recentExcludeAuto: true,
      maxSessions: 6
    },
    notify: { enabled: true, sound: true },
    log: { enabled: true, level: "info", max: 200 },
    board: { enabled: true, wideThreshold: 520, defaultView: "projects" },
    chat: { autoHistory: true },
    projectColumnsVersion: 1,
    projectColumns: { total: true, issues: true, prs: true, localVersion: true, latestVersion: true, lastUpdated: true },
    githubVersion: 1,
    githubToken: void 0,
    githubRepos: {}
  };

  // src/core/json.ts
  function cloneJson(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }
  function loadJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const value = JSON.parse(raw);
      return value && typeof value === "object" ? value : fallback;
    } catch (error) {
      return fallback;
    }
  }
  function saveJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
    }
  }

  // src/core/log.ts
  var LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
  var LOG_LIMIT_FALLBACK = 200;
  var logConfigGetter = null;
  var logSink = null;
  function setLogConfigGetter(getter) {
    logConfigGetter = typeof getter === "function" ? getter : null;
  }
  function setLogSink(sink) {
    logSink = typeof sink === "function" ? sink : null;
  }
  function logConfigNow() {
    let config = null;
    try {
      config = logConfigGetter ? logConfigGetter() : null;
    } catch (error) {
      config = null;
    }
    return Object.assign({ enabled: true, level: "info", max: LOG_LIMIT_FALLBACK }, config || {});
  }
  function cleanLogData(data) {
    if (data === void 0) return void 0;
    try {
      return JSON.parse(
        JSON.stringify(data, (_key, value) => {
          if (typeof value === "string") return value.length > 300 ? value.slice(0, 300) + "…" : value;
          if (typeof value === "function") return "[fn]";
          return value;
        })
      );
    } catch (error) {
      return String(data).slice(0, 300);
    }
  }
  function logEvent(level, scope, message, data) {
    try {
      const config = logConfigNow();
      if (config.enabled === false) return;
      const name = Object.prototype.hasOwnProperty.call(LOG_LEVELS, level) ? level : "info";
      const limit = LOG_LEVELS[config.level] === void 0 ? LOG_LEVELS.info : LOG_LEVELS[config.level];
      if (LOG_LEVELS[name] > limit) return;
      const entry = {
        at: Date.now(),
        level: name,
        scope: String(scope || "app").slice(0, 40),
        message: String(message === void 0 ? "" : message).slice(0, 400)
      };
      const payload = cleanLogData(data);
      if (payload !== void 0) entry.data = payload;
      if (logSink) {
        try {
          logSink(entry);
        } catch (error) {
        }
      }
      const writer = name === "error" ? console.error : name === "warn" ? console.warn : console.log;
      try {
        writer("[project-board][" + entry.scope + "] " + entry.message, payload === void 0 ? "" : payload);
      } catch (error) {
      }
    } catch (error) {
    }
  }

  // src/core/combos.ts
  var IS_MAC = (() => {
    try {
      const nav = window.navigator || {};
      const ua = nav.userAgent || "";
      if (/iphone|ipad|ipod/i.test(ua)) return false;
      const platform = nav.userAgentData && nav.userAgentData.platform || nav.platform || "";
      if (platform) return /mac/i.test(String(platform)) && !/iphone|ipad|ipod/i.test(String(platform));
      return /mac/i.test(ua);
    } catch {
      return false;
    }
  })();
  var MODIFIER_LABELS = IS_MAC ? { ctrl: "⌃", meta: "⌘", alt: "⌥", shift: "⇧" } : { ctrl: "Ctrl", meta: "Meta", alt: "Alt", shift: "Shift" };
  var MODIFIER_ORDER = ["ctrl", "alt", "shift", "meta"];
  function comboFromEvent(event) {
    const parts = [];
    if (event.ctrlKey) parts.push("ctrl");
    if (event.metaKey) parts.push("meta");
    if (event.altKey) parts.push("alt");
    if (event.shiftKey) parts.push("shift");
    const code = typeof event.code === "string" ? event.code : "";
    if (!code) return "";
    if (/^(Control|Alt|Shift|Meta)(Left|Right)$/.test(code)) return "";
    return parts.concat(code).join("+");
  }
  function comboDisplay(combo) {
    if (!combo) return "";
    const parts = String(combo).split("+");
    const code = parts.pop();
    let label = code;
    if (/^Key[A-Z]$/.test(code)) label = code.slice(3);
    else if (/^Digit[0-9]$/.test(code)) label = code.slice(5);
    else if (code === "Comma") label = ",";
    else if (code === "Period") label = ".";
    else if (code === "Space") label = "Space";
    else if (code === "ArrowUp") label = "↑";
    else if (code === "ArrowDown") label = "↓";
    const mods = parts.slice().sort((left, right) => MODIFIER_ORDER.indexOf(left) - MODIFIER_ORDER.indexOf(right)).map((part) => MODIFIER_LABELS[part] || part);
    return mods.concat(label).join("+");
  }
  function comboHasModifier(combo) {
    const parts = String(combo || "").split("+");
    return parts.includes("ctrl") || parts.includes("alt") || parts.includes("meta");
  }
  function matchCombo(event, combo) {
    return Boolean(combo) && comboFromEvent(event) === combo;
  }
  function isComposingEvent(event) {
    if (!event) return false;
    if (event.isComposing === true || event.keyCode === 229) return true;
    return Boolean(event.nativeEvent && event.nativeEvent.isComposing === true);
  }
  function comboBindingOf(combo) {
    const parts = String(combo || "").split("+");
    const code = parts.pop();
    if (!code || !/^[A-Za-z][A-Za-z0-9]*$/.test(code)) return null;
    return { code, modifiers: parts.map((part) => part === "ctrl" ? "control" : part) };
  }
  function bindingsOverlap(left, right) {
    if (!left || !right) return false;
    const modsLeft = left.modifiers.slice().sort().join("+");
    const modsRight = right.modifiers.slice().sort().join("+");
    if (modsLeft !== modsRight) return false;
    const leftCodes = [left.code, left.secondCode].filter(Boolean);
    const rightCodes = [right.code, right.secondCode].filter(Boolean);
    return leftCodes.some((code) => rightCodes.indexOf(code) >= 0);
  }

  // src/core/settings.ts
  function mergeSettings(base, raw) {
    const out = cloneJson(base);
    if (raw && typeof raw === "object") {
      const stored = raw;
      for (const key of Object.keys(base)) {
        const value = stored[key];
        if (value && typeof value === "object") {
          Object.assign(out[key], value);
        }
      }
      if (stored.headerButtons && typeof stored.headerButtons === "object") {
        const buttons = stored.headerButtons;
        for (const id of Object.keys(DEFAULT_SETTINGS.headerButtons)) {
          out.headerButtons[id] = Object.assign({}, DEFAULT_SETTINGS.headerButtons[id], buttons[id] || {});
        }
      }
      if (stored.headerButtonsVersion !== 3) {
        const header = stored.header;
        if (header && header.capsule === false) out.headerButtons.capsule.hidden = true;
      }
      if (stored.hintsVersion !== 1) out.hints = cloneJson(DEFAULT_SETTINGS.hints);
      if (stored.boardProjVersion !== 1) {
        out.board.defaultView = "projects";
        out.boardProjVersion = 1;
      }
      const columnKeys = Object.keys(DEFAULT_SETTINGS.projectColumns);
      for (const key of Object.keys(out.projectColumns)) {
        if (!columnKeys.includes(key)) delete out.projectColumns[key];
      }
      if (stored.projectColumnsVersion !== 1) {
        out.projectColumnsVersion = 1;
      }
      if (typeof stored.githubToken === "string") out.githubToken = stored.githubToken;
      if (stored.githubRepos && typeof stored.githubRepos === "object") {
        out.githubRepos = cloneJson(stored.githubRepos);
      }
      if (stored.githubVersion !== 1) out.githubVersion = 1;
      for (const key of Object.keys(DEFAULT_SETTINGS.shortcuts)) {
        if (!comboHasModifier(out.shortcuts[key])) out.shortcuts[key] = DEFAULT_SETTINGS.shortcuts[key];
      }
      if (stored.shortcutsVersion !== 1) out.shortcuts = healShortcutConflicts(out.shortcuts);
    }
    out.shortcuts = healShortcutConflicts(out.shortcuts);
    return out;
  }
  function healShortcutConflicts(shortcuts) {
    const defaults = DEFAULT_SETTINGS.shortcuts;
    const owners = /* @__PURE__ */ new Map();
    for (const action of Object.keys(defaults)) {
      const combo = shortcuts[action];
      if (!owners.has(combo)) owners.set(combo, [action]);
      else owners.get(combo).push(action);
    }
    for (const [combo, actions] of owners) {
      if (actions.length < 2) continue;
      const winner = actions.find((name) => defaults[name] === combo) || actions[0];
      for (const action of actions) {
        if (action === winner) continue;
        const fallback = defaults[action];
        const taken = Array.from(owners.keys()).includes(fallback) && fallback !== combo;
        if (!taken) {
          shortcuts[action] = fallback;
          owners.set(fallback, [action]);
        }
      }
    }
    return shortcuts;
  }
  function loadSettings() {
    const raw = loadJson(SETTINGS_KEY, null);
    const merged = mergeSettings(DEFAULT_SETTINGS, raw);
    if (raw && typeof raw === "object" && (raw.headerButtonsVersion !== 3 || raw.hintsVersion !== 1 || raw.shortcutsVersion !== 1 || raw.boardProjVersion !== 1 || raw.projectColumnsVersion !== 1 || raw.githubVersion !== 1)) {
      try {
        persistSettings(merged);
      } catch (error) {
      }
    }
    return merged;
  }
  function persistSettings(value) {
    saveJson(SETTINGS_KEY, value);
  }

  // src/core/schedule.ts
  var NO_AUTO = /* @__PURE__ */ new Set();
  function observable(initial) {
    let snapshot = initial;
    const listeners = /* @__PURE__ */ new Set();
    return {
      source: {
        getSnapshot: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        }
      },
      publish: (next) => {
        snapshot = next;
        for (const listener of listeners) {
          try {
            listener();
          } catch (error) {
          }
        }
      }
    };
  }
  function createScheduleSource(ctx) {
    const { source, publish } = observable({ status: "loading", activeSessionIds: NO_AUTO });
    let disposed2 = false;
    let epoch = 0;
    const read = async () => {
      const current = ++epoch;
      try {
        const result = await ctx.remote.schedule.catalog();
        if (disposed2 || current !== epoch) return;
        if (result && result.ok) {
          const active = /* @__PURE__ */ new Set();
          for (const record of result.value || []) {
            if (record && record.status === "active" && typeof record.sessionId === "string") active.add(record.sessionId);
          }
          publish({ status: "ready", activeSessionIds: active });
        } else {
          publish({ status: "error", activeSessionIds: source.getSnapshot().activeSessionIds });
        }
      } catch (error) {
        if (!disposed2 && current === epoch) publish({ status: "error", activeSessionIds: source.getSnapshot().activeSessionIds });
      }
    };
    const disposers = [];
    try {
      disposers.push(ctx.on("connection/reset", () => {
        void read();
      }));
    } catch (error) {
    }
    try {
      if (ctx.remote && ctx.remote.$on) disposers.push(ctx.remote.$on("schedule/changed", () => {
        void read();
      }));
    } catch (error) {
    }
    void read();
    return {
      source,
      dispose: () => {
        disposed2 = true;
        for (const dispose of disposers) {
          try {
            if (typeof dispose === "function") dispose();
          } catch (error) {
          }
        }
      }
    };
  }
  function createPresetSource(ctx) {
    const { source, publish } = observable({ status: "loading", names: {} });
    let disposed2 = false;
    let epoch = 0;
    const read = async () => {
      const current = ++epoch;
      try {
        const result = await ctx.remote.agentPresets.list();
        if (disposed2 || current !== epoch) return;
        if (result && result.ok) {
          const names = {};
          for (const preset of result.value && result.value.presets || []) {
            if (preset && typeof preset.id === "string" && typeof preset.name === "string" && preset.name.trim() !== "") {
              names[preset.id] = preset.name.trim();
            }
          }
          publish({ status: "ready", names });
        } else {
          publish({ status: "error", names: source.getSnapshot().names });
        }
      } catch (error) {
        if (!disposed2 && current === epoch) publish({ status: "error", names: source.getSnapshot().names });
      }
    };
    const disposers = [];
    try {
      disposers.push(ctx.on("connection/reset", () => {
        void read();
      }));
    } catch (error) {
    }
    void read();
    return {
      source,
      dispose: () => {
        disposed2 = true;
        for (const dispose of disposers) {
          try {
            if (typeof dispose === "function") dispose();
          } catch (error) {
          }
        }
      }
    };
  }
  function fallbackHook() {
    return ((_selector) => null);
  }

  // src/core/lifecycle.ts
  var disposed = false;
  var timers = /* @__PURE__ */ new Set();
  function setDisposed(value) {
    disposed = value;
    if (!value) return;
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  }
  function trackTimer(run, delay) {
    if (disposed) return 0;
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (disposed) return;
      try {
        run();
      } catch (error) {
      }
    }, delay);
    timers.add(id);
    return id;
  }
  function cancelTimer(id) {
    if (!id) return;
    window.clearTimeout(id);
    timers.delete(id);
  }

  // src/core/store.ts
  function createUiStore(initial) {
    let snapshot = initial;
    const listeners = /* @__PURE__ */ new Set();
    const emit = () => {
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
        }
      }
    };
    return {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      set: (patch) => {
        snapshot = Object.assign({}, snapshot, patch);
        emit();
      },
      toggle: (key) => {
        snapshot = Object.assign({}, snapshot, { [key]: !snapshot[key] });
        emit();
      }
    };
  }

  // src/core/dom.ts
  var rightPanelElement = () => {
    try {
      return document.querySelector('[class*="_panel"][data-sidebar-right-open]');
    } catch (error) {
      return null;
    }
  };
  function isRightPanelExpanded() {
    const panel = rightPanelElement();
    if (!panel) return false;
    let value = null;
    try {
      value = panel.getAttribute("data-sidebar-right-open");
    } catch (error) {
      return false;
    }
    if (value === null) return false;
    const normalized = value.trim().toLowerCase();
    return normalized !== "false" && normalized !== "0" && normalized !== "off";
  }
  function hostRightbarWidth() {
    try {
      const column = document.querySelector("[data-rightbar-col]") || document.querySelector('[class*="_rightbarCol"]');
      const own = column ? column.getBoundingClientRect().width : 0;
      if (own > 0) return own;
      const panel = rightPanelElement();
      return panel ? panel.getBoundingClientRect().width : 0;
    } catch (error) {
      return 0;
    }
  }
  function isRightbarFullscreen() {
    try {
      return Boolean(document.querySelector('[data-sidebar-right-panel="fullscreen"]')) || Boolean(document.querySelector("[data-rightbar-fullscreen]"));
    } catch (error) {
      return false;
    }
  }
  function rightbarColumnElement() {
    try {
      return document.querySelector("[data-rightbar-col]");
    } catch (error) {
      return null;
    }
  }
  function hostCentreColumnWidth() {
    try {
      const box = document.querySelector('[class*="_centerCol"]') || document.querySelector('[class*="_frame"]');
      return box ? Math.round(box.getBoundingClientRect().width) : 0;
    } catch (error) {
      return 0;
    }
  }
  function centreColumnElement() {
    try {
      return document.querySelector('[class*="_centerCol"]') || document.querySelector('[class*="_frame"]');
    } catch (error) {
      return null;
    }
  }
  function isInsideCentreColumn(node) {
    try {
      return Boolean(node && node.closest && node.closest('[class*="_centerCol"]'));
    } catch (error) {
      return false;
    }
  }
  function sidebarFrameElement() {
    try {
      return document.querySelector('[class*="_frame"][style*="grid-template-columns"]') || document.querySelector("[data-sidebar-collapsed]");
    } catch (error) {
      return null;
    }
  }
  function sidebarColumnElement() {
    try {
      const own = document.querySelector('[class*="_sidebarCol"]');
      if (own) return own;
      const frame = sidebarFrameElement();
      return frame ? frame.firstElementChild : null;
    } catch (error) {
      return null;
    }
  }
  var HOST_LAYOUT_ATTRIBUTES = ["data-sidebar-collapsed", "data-sidebar-right-open", "data-rightbar-collapsed", "data-rightbar-fullscreen"];
  function isPaletteOpen() {
    try {
      return Boolean(document.querySelector(".pbx-paletteBackdrop"));
    } catch (error) {
      return false;
    }
  }
  function sidebarCollapsedFlag() {
    const frame = sidebarFrameElement();
    if (!frame) return null;
    try {
      return frame.hasAttribute("data-sidebar-collapsed");
    } catch (error) {
      return null;
    }
  }
  function hasBlockingDialog() {
    try {
      const nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      for (const node of nodes) {
        if (node.getClientRects().length === 0) continue;
        if (node.getAttribute("data-pbx-overlay") === "palette") continue;
        if (node.closest && node.closest(".pbx-paletteBackdrop")) continue;
        if (node.getAttribute("data-shortcut-modal") === "sidebar") continue;
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  function sidebarSignature() {
    try {
      const frame = document.querySelector('[class*="_frame"][style*="grid-template-columns"]') || document.querySelector("[data-sidebar-collapsed]");
      if (!frame) return null;
      const template = frame.style && frame.style.gridTemplateColumns || "";
      const first = parseFloat(template);
      return {
        track: Number.isFinite(first) ? Math.round(first) : null,
        collapsed: frame.hasAttribute("data-sidebar-collapsed")
      };
    } catch (error) {
      return null;
    }
  }
  function pointerViewX(event) {
    const screenX = typeof event.screenX === "number" && event.screenX !== 0 ? event.screenX : event.clientX + window.screenX;
    return screenX - window.screenX;
  }
  function clickHostSettingsTrigger() {
    try {
      const nodes = Array.prototype.slice.call(
        document.querySelectorAll('button[aria-haspopup="dialog"]')
      );
      const hit = nodes.find((node) => {
        const label = ((node.getAttribute("aria-label") || node.textContent || "") + "").trim();
        return /设置|偏好|设定|settings|preferences/i.test(label);
      });
      if (!hit) return false;
      hit.click();
      return true;
    } catch (error) {
      return false;
    }
  }
  function headerDropPosition(id, clientX) {
    const side = clientX > window.innerWidth * 0.55 ? "right" : "left";
    const selector = side === "right" ? ".pbx-navRight .pbx-navItem[data-hb-id]" : ".pbx-nav:not(.pbx-navRight) .pbx-navItem[data-hb-id]";
    let index = 0;
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const siblingId = node.getAttribute("data-hb-id");
      if (!siblingId || siblingId === id) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (rect.left + rect.width / 2 < clientX) index += 1;
      else break;
    }
    return { side, index };
  }

  // src/core/settings-catalog.ts
  var PLUGIN_SECTION_ID = "project-board-settings";
  var EMPTY_CATALOG = { host: [], plugin: [], seq: 0 };
  var labelOf = (raw) => {
    if (typeof raw === "function") {
      try {
        return String(raw());
      } catch (error) {
        return "";
      }
    }
    return raw == null ? "" : String(raw);
  };
  var entriesOf = (ctx, key) => {
    try {
      const slots = ctx.slots;
      const list = typeof slots.entries === "function" ? slots.entries(key) : null;
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  };
  function readHostSections(ctx) {
    const out = [];
    for (const entry of entriesOf(ctx, "settings.section")) {
      const options = entry && entry.options;
      if (!options) continue;
      const id = typeof options.id === "string" ? options.id : "";
      if (!id || id === PLUGIN_SECTION_ID) continue;
      const title = labelOf(options.label) || id;
      out.push({
        id: "host:" + id,
        title,
        // Bare section ids are English ("models", "general"); keep them searchable alongside
        // the localized label, plus the generic words people actually type into a search box.
        keywords: ("设置 偏好 settings preferences " + id + " " + title).toLowerCase(),
        origin: "host",
        sectionId: id,
        order: typeof options.order === "number" ? options.order : 0
      });
    }
    return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  }
  var PLUGIN_DEFS = [
    { anchor: "shortcuts", labelKey: "settings.shortcuts", keywords: "快捷键 组合键 键盘 shortcut keyboard hotkey keys" },
    { anchor: "headerButtons", labelKey: "settings.headerButtons", keywords: "标题栏 顶部 按钮 header button toolbar" },
    { anchor: "behavior", labelKey: "settings.behavior", keywords: "行为 界面 搜索 归档 面板 behavior ui search archived panel" },
    { anchor: "github", labelKey: "settings.githubTitle", keywords: "github 仓库 数据源 令牌 token repo source" },
    { anchor: "logging", labelKey: "settings.logging", keywords: "日志 排查 级别 调试 log debug trace level" },
    { anchor: "data", labelKey: "settings.data", keywords: "数据 重置 外观 导入 导出 data reset appearance" }
  ];
  function pluginSettingEntries(t) {
    return PLUGIN_DEFS.map((def, index) => ({
      id: "plugin:" + def.anchor,
      title: t(def.labelKey),
      keywords: (def.keywords + " 项目看板 project board").toLowerCase(),
      origin: "plugin",
      sectionId: PLUGIN_SECTION_ID,
      anchor: def.anchor,
      order: index
    }));
  }
  function openSettingsTarget(ctx, sectionId) {
    for (const entry of entriesOf(ctx, "sidebar.settings")) {
      const store = entry && entry.options && entry.options.store;
      const instance = store && typeof store.create === "function" ? store.create() : null;
      const actions = instance && instance.actions;
      if (!actions) continue;
      if (typeof actions.openSection === "function") {
        try {
          actions.openSection(sectionId);
          return "section";
        } catch (error) {
        }
      }
      if (typeof actions.open === "function") {
        try {
          actions.open();
          return "settings";
        } catch (error) {
        }
      }
    }
    if (clickHostSettingsTrigger()) return "dom";
    return "failed";
  }

  // src/features/chat-dom.ts
  function visibleChatFlow() {
    const flows = document.querySelectorAll('[data-slot="conversation.chat.flow"]');
    let fallback = null;
    for (const flow of flows) {
      if (!fallback) fallback = flow;
      const rect = flow.getBoundingClientRect();
      if (rect.width > 4 && rect.height > 4) return flow;
      const turn = flow.querySelector(
        '[data-slot="conversation.chat.turn"], [data-slot="conversation.chat.user.content"], [data-slot="conversation.chat.assistant"]'
      );
      if (turn) {
        const turnRect = turn.getBoundingClientRect();
        if (turnRect.width > 4 && turnRect.height > 4) return flow;
      }
    }
    return fallback;
  }
  function findChatScroller() {
    const flow = visibleChatFlow();
    let node = flow;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const element = node;
      if ((style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowY === "overlay") && element.scrollHeight > element.clientHeight + 4) {
        return element;
      }
      node = node.parentElement;
    }
    const doc = document.scrollingElement || document.documentElement;
    return doc && doc.scrollHeight > doc.clientHeight + 4 ? doc : null;
  }

  // src/features/interject.ts
  var STEER_LABELS = ["插话发送", "Steer queued message"];
  function queueDockElement() {
    return document.querySelector("[data-queue-dock]");
  }
  function earliestSteerButton() {
    const dock = queueDockElement();
    if (!dock) return null;
    const rows = dock.querySelectorAll("li");
    for (const row of rows) {
      if (row.hasAttribute("data-submission-echo")) continue;
      const buttons = Array.prototype.slice.call(row.querySelectorAll("button"));
      if (buttons.length === 0) continue;
      let steer = null;
      for (const button of buttons) {
        const label = button.getAttribute("aria-label") || "";
        if (STEER_LABELS.indexOf(label) >= 0) {
          steer = button;
          break;
        }
      }
      if (!steer) steer = buttons[buttons.length - 1];
      if (!steer) continue;
      if (steer.disabled) return null;
      return steer;
    }
    return null;
  }
  function interjectEarliestQueued() {
    const steer = earliestSteerButton();
    if (steer) {
      steer.click();
      return true;
    }
    const dock = queueDockElement();
    if (!dock) return false;
    const header = dock.querySelector('button[aria-controls][aria-expanded="false"]');
    if (!header || header.disabled) return false;
    header.click();
    trackTimer(() => {
      const retry = earliestSteerButton();
      if (retry) retry.click();
    }, 90);
    return true;
  }
  function findScrollToBottomButton() {
    const labels = ["回到底部", "Scroll to bottom", "Back to bottom", "Jump to latest"];
    const buttons = document.querySelectorAll("button[aria-label]");
    for (const button of buttons) {
      if (button.closest(".pbx-root, .pbx-hud, .pbx-shortcutHints, .pbx-composerButtons")) continue;
      const label = button.getAttribute("aria-label") || "";
      if (!labels.some((text) => label === text || label.indexOf(text) === 0)) continue;
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return button;
    }
    return null;
  }
  function moveCaretToEnd(input) {
    if (!input) return false;
    try {
      const textarea = input;
      if (typeof textarea.value === "string" && typeof textarea.setSelectionRange === "function") {
        const end = textarea.value.length;
        textarea.setSelectionRange(end, end);
        return true;
      }
      if (input.isContentEditable) {
        const range = document.createRange();
        range.selectNodeContents(input);
        range.collapse(false);
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        return true;
      }
    } catch (error) {
    }
    return false;
  }
  function focusComposerInput() {
    if (isPaletteOpen()) return false;
    const card = document.querySelector("[data-composer-card]");
    let input = card ? card.querySelector('textarea, [contenteditable="true"]') : null;
    if (!input) {
      input = Array.prototype.find.call(document.querySelectorAll('textarea, [contenteditable="true"]'), (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || null;
    }
    if (!input) return false;
    try {
      input.focus({ preventScroll: true });
    } catch (error) {
    }
    moveCaretToEnd(input);
    return true;
  }
  function scrollToComposerAndFocus() {
    const flow = visibleChatFlow();
    let scrollParent = flow;
    while (scrollParent && scrollParent !== document.body) {
      const style = window.getComputedStyle(scrollParent);
      const element = scrollParent;
      if ((style.overflowY === "auto" || style.overflowY === "scroll") && element.scrollHeight > element.clientHeight + 4) break;
      scrollParent = scrollParent.parentElement;
    }
    if (scrollParent && scrollParent === document.body) scrollParent = null;
    const nativeButton = findScrollToBottomButton();
    if (nativeButton) {
      try {
        nativeButton.click();
      } catch (error) {
      }
    }
    const target = scrollParent || findChatScroller();
    if (!target) logEvent("debug", "shortcut", "scrollBottom:no-chat", {});
    if (target) {
      const pin = (left) => {
        const node = target.isConnected ? target : findChatScroller();
        if (!node) return;
        node.scrollTop = node.scrollHeight;
        if (left > 0) window.requestAnimationFrame(() => pin(left - 1));
      };
      pin(30);
    } else if (flow) {
      flow.scrollIntoView({
        block: "end",
        behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
      });
    }
    focusComposerInput();
  }

  // src/core/state.ts
  var shortcutState = { suppressed: false };
  var chatJumpState = {
    loading: false,
    lastTarget: null,
    lastAt: 0
  };
  var suppressHeaderClickUntil = 0;
  function suppressHeaderClicks(ms) {
    suppressHeaderClickUntil = Date.now() + ms;
  }
  function headerClickBlocked() {
    return Date.now() < suppressHeaderClickUntil;
  }

  // src/features/chat-nav.ts
  function collectUserMessageTargets() {
    const flow = visibleChatFlow() || document;
    let targets = Array.prototype.slice.call(flow.querySelectorAll('[data-slot="conversation.chat.user.content"]'));
    if (targets.length === 0) targets = Array.prototype.slice.call(flow.querySelectorAll('[class*="_userRow"]'));
    if (targets.length === 0) {
      const groups = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
      for (const group of groups) {
        const bubbles = group.querySelectorAll('[data-slot="conversation.chat.user.content"], [class*="_userRow"]');
        if (bubbles.length > 0) targets.push.apply(targets, bubbles);
        else targets.push(group);
      }
    }
    return targets.filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }
  function highlightUserTarget(target) {
    if (!target) return;
    target.scrollIntoView({
      behavior: window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "center"
    });
    target.classList.remove("pbx-user-jump-highlight");
    void target.offsetWidth;
    target.classList.add("pbx-user-jump-highlight");
    trackTimer(() => target.classList.remove("pbx-user-jump-highlight"), 1200);
  }
  function findLoadEarlierButton() {
    const candidates = document.querySelectorAll('button, [role="button"]');
    return Array.prototype.find.call(candidates, (element) => {
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
      if (!visible) return false;
      return /^(加载更早|加载更多历史|Load earlier|Load older|Load previous)/i.test((element.textContent || "").trim());
    }) || null;
  }
  function waitForMoreTargets(previousCount, timeout) {
    return new Promise((resolve) => {
      const started = Date.now();
      const timer = window.setInterval(() => {
        if (collectUserMessageTargets().length > previousCount || Date.now() - started > timeout) {
          window.clearInterval(timer);
          resolve();
        }
      }, 80);
    });
  }
  async function loadEarlierThenJump(anchor, previousCount) {
    if (chatJumpState.loading) return;
    chatJumpState.loading = true;
    try {
      const button = findLoadEarlierButton();
      if (!button) {
        highlightUserTarget(anchor);
        chatJumpState.lastTarget = anchor;
        chatJumpState.lastAt = Date.now();
        return;
      }
      button.click();
      await waitForMoreTargets(previousCount, 2500);
      const rows = collectUserMessageTargets();
      const prepended = rows.length - previousCount;
      if (prepended <= 0) {
        highlightUserTarget(anchor);
        chatJumpState.lastTarget = anchor;
        chatJumpState.lastAt = Date.now();
        return;
      }
      const target = rows[prepended - 1] || rows[0];
      highlightUserTarget(target);
      chatJumpState.lastTarget = target;
      chatJumpState.lastAt = Date.now();
    } finally {
      chatJumpState.loading = false;
    }
  }
  function jumpUserMessage(direction) {
    if (chatJumpState.loading) return;
    const rows = collectUserMessageTargets();
    if (rows.length === 0) {
      logEvent("debug", "shortcut", "userJump:no-target", { direction });
      return;
    }
    const scroller = findChatScroller();
    const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
    const viewportTop = Math.max(0, Math.min(bounds.top, window.innerHeight));
    const viewportBottom = Math.max(viewportTop, Math.min(bounds.bottom, window.innerHeight));
    const lastAt = Date.now();
    const recent = lastAt - chatJumpState.lastAt < 700;
    let target = null;
    if (direction < 0) {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        const row = rows[i];
        if (recent && row === chatJumpState.lastTarget) continue;
        if (row.getBoundingClientRect().top < viewportTop - 2) {
          target = row;
          break;
        }
      }
      if (!target) {
        void loadEarlierThenJump(rows[0], rows.length);
        return;
      }
    } else {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (recent && row === chatJumpState.lastTarget) continue;
        if (row.getBoundingClientRect().bottom > viewportBottom + 2) {
          target = row;
          break;
        }
      }
      if (!target) target = rows[rows.length - 1];
    }
    highlightUserTarget(target);
    chatJumpState.lastTarget = target;
    chatJumpState.lastAt = lastAt;
  }

  // src/features/chat-scroll.ts
  var HOLD_SCROLL_DELAY = 300;
  var holdScrollState = null;
  var autoHistoryGate = null;
  function stopHoldScroll(allowJump) {
    const state = holdScrollState;
    if (!state) return;
    holdScrollState = null;
    window.clearTimeout(state.timer);
    if (state.poll) window.clearInterval(state.poll);
    if (state.raf) window.cancelAnimationFrame(state.raf);
    if (typeof state.restore === "function") {
      try {
        state.restore();
      } catch (error) {
      }
    }
    if (allowJump && state.mode === "pending") jumpUserMessage(state.dir);
    if (state.dir > 0 && state.bottomFocused) focusComposerInput();
  }
  function startHoldLoop(state) {
    const initial = findChatScroller();
    if (!initial) {
      logEvent("debug", "shortcut", "hold:no-chat", { dir: state.dir });
      return;
    }
    state.mode = "running";
    state.scroller = initial;
    state.speed = 9;
    state.loading = false;
    state.awaitingOlder = false;
    state.exhausted = false;
    state.stall = 0;
    state.retries = 0;
    state.pauseUntil = 0;
    state.poll = 0;
    state.bottomFocused = false;
    state.last = window.performance && typeof window.performance.now === "function" ? window.performance.now() : Date.now();
    const previousBehavior = initial.style.scrollBehavior;
    initial.style.scrollBehavior = "auto";
    state.restore = () => {
      const node = state.scroller || initial;
      try {
        node.style.scrollBehavior = previousBehavior;
      } catch (error) {
      }
    };
    const current = () => {
      const flow = visibleChatFlow();
      const node = state.scroller;
      if (node && node.isConnected && flow && node.contains(flow)) return node;
      const next = findChatScroller();
      if (next) {
        state.scroller = next;
        state.stall = 0;
      }
      return next;
    };
    const now = () => window.performance && typeof window.performance.now === "function" ? window.performance.now() : Date.now();
    const autoHistoryOn = () => {
      try {
        return autoHistoryGate ? autoHistoryGate() !== false : true;
      } catch (error) {
        return true;
      }
    };
    const schedule = () => {
      state.raf = window.requestAnimationFrame(step);
    };
    const requestOlder = (block) => {
      if (!autoHistoryOn()) {
        state.exhausted = true;
        return false;
      }
      const node = current();
      if (!node) {
        state.mode = "done";
        return false;
      }
      const button = findLoadEarlierButton();
      if (!button || button.disabled) return false;
      const beforeHeight = node.scrollHeight;
      state.loading = true;
      state.awaitingOlder = block === true;
      const started = now();
      try {
        button.click();
      } catch (error) {
      }
      if (state.poll) window.clearInterval(state.poll);
      state.poll = window.setInterval(() => {
        if (holdScrollState !== state || state.mode !== "running") {
          window.clearInterval(state.poll);
          state.poll = 0;
          return;
        }
        const live = current();
        if (!live) {
          window.clearInterval(state.poll);
          state.poll = 0;
          state.mode = "done";
          return;
        }
        if (live.scrollHeight > beforeHeight + 8) {
          const grew = live.scrollHeight - beforeHeight;
          window.clearInterval(state.poll);
          state.poll = 0;
          state.loading = false;
          state.awaitingOlder = false;
          if (block === true && live.scrollTop <= 2) live.scrollTop = grew;
          state.last = now();
          return;
        }
        if (now() - started > 2600) {
          window.clearInterval(state.poll);
          state.poll = 0;
          state.loading = false;
          state.awaitingOlder = false;
          state.exhausted = true;
          if (block) state.mode = "done";
        }
      }, 120);
      return true;
    };
    const stepUpByAnchor = () => {
      const node = current();
      if (!node) return false;
      const viewportTop = node.getBoundingClientRect().top;
      const anchors = Array.prototype.slice.call(node.querySelectorAll("[data-chat-anchor-key]"));
      if (anchors.length === 0) return false;
      let index = anchors.length - 1;
      for (let i = 0; i < anchors.length; i += 1) {
        if (anchors[i].getBoundingClientRect().bottom > viewportTop + 4) {
          index = i;
          break;
        }
      }
      const target = anchors[Math.max(0, index - 1)];
      if (!target) return false;
      const before = node.scrollTop;
      try {
        target.scrollIntoView({ block: "start", behavior: "auto" });
      } catch (error) {
        return false;
      }
      return Math.abs(node.scrollTop - before) > 1;
    };
    function step(timestamp) {
      if (holdScrollState !== state || state.mode !== "running") return;
      const node = current();
      if (!node) {
        state.mode = "done";
        return;
      }
      const ts = typeof timestamp === "number" ? timestamp : now();
      const dt = Math.min(50, Math.max(0, ts - state.last));
      state.last = ts;
      if (state.awaitingOlder) {
        schedule();
        return;
      }
      if (state.pauseUntil > ts) {
        schedule();
        return;
      }
      const frames = dt / 16.6667;
      state.speed = Math.min(30, state.speed + 0.8 * frames);
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      if (state.dir > 0) {
        if (node.scrollTop >= max - 0.5) {
          if (!state.bottomFocused) {
            state.bottomFocused = true;
            focusComposerInput();
          }
          state.stall = 0;
          schedule();
          return;
        }
        const before2 = node.scrollTop;
        node.scrollTop = Math.min(max, before2 + state.speed * frames);
        if (Math.abs(node.scrollTop - before2) < 0.5) {
          state.stall = state.stall + frames;
        } else {
          state.stall = 0;
        }
        if (node.scrollTop >= max - 0.5 && !state.bottomFocused) {
          state.bottomFocused = true;
          focusComposerInput();
        }
        schedule();
        return;
      }
      if (!state.kicked) {
        state.kicked = true;
        try {
          node.dispatchEvent(new WheelEvent("wheel", { deltaY: -240, deltaMode: 0, bubbles: true, cancelable: true, view: window }));
        } catch (error) {
        }
      }
      if (!state.loading && !state.exhausted && node.scrollTop < node.clientHeight * 1.2) requestOlder(false);
      if (node.scrollTop <= 0.5) {
        if (state.exhausted) {
          state.mode = "done";
          return;
        }
        if (!state.loading) requestOlder(true);
        schedule();
        return;
      }
      const before = node.scrollTop;
      node.scrollTop = Math.max(0, before - state.speed * frames);
      if (Math.abs(node.scrollTop - before) < 0.5) {
        state.stall = state.stall + frames;
        if (state.stall > 24) {
          state.stall = 0;
          if (stepUpByAnchor()) {
            state.retries = 0;
            schedule();
            return;
          }
          state.retries = state.retries + 1;
          if (state.retries > 6) {
            state.mode = "done";
            return;
          }
          state.pauseUntil = now() + 260;
        }
      } else {
        state.stall = 0;
        state.retries = 0;
      }
      schedule();
    }
    schedule();
  }
  function beginHoldScroll(direction, code) {
    logEvent("debug", "scroll", "hold start", { dir: direction });
    stopHoldScroll(false);
    const state = {
      dir: direction,
      code: code || "",
      mode: "pending",
      timer: 0,
      raf: 0,
      speed: 0,
      last: 0,
      scroller: null,
      restore: null
    };
    holdScrollState = state;
    state.timer = window.setTimeout(() => {
      if (holdScrollState === state) startHoldLoop(state);
    }, HOLD_SCROLL_DELAY);
  }
  function installChatScrollListeners(options) {
    const previousGate = autoHistoryGate;
    autoHistoryGate = options && typeof options.autoHistory === "function" ? options.autoHistory : null;
    const onKeyUp = (event) => {
      const state = holdScrollState;
      if (!state) return;
      if (state.code && event.code !== state.code) return;
      stopHoldScroll(true);
    };
    const onBlur = () => {
      stopHoldScroll(false);
    };
    const onKeyDown = (event) => {
      if (holdScrollState && event.key === "Escape") stopHoldScroll(false);
    };
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      autoHistoryGate = previousGate;
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }

  // src/features/chat-history.ts
  var LOAD_OLDER_LABELS = [
    "加载更早",
    "载入更早",
    "Load earlier",
    "Load older",
    "以前を読み込む",
    "Cargar antes",
    "Charger plus tôt",
    "Früher laden",
    "Загрузить раньше",
    "Carregar mais cedo"
  ];
  var NEAR_TOP_PX = 120;
  var COOLDOWN_MS = 500;
  var labelOf2 = (node) => (node.textContent || "").replace(/\s+/g, " ").trim();
  var resolveScroller = (target) => {
    if (!target) return null;
    if (target instanceof HTMLElement) return target;
    if (target === document) {
      const root = document.scrollingElement;
      return root instanceof HTMLElement ? root : null;
    }
    return null;
  };
  var findLoadOlderControl = (root) => {
    const candidates = root.querySelectorAll('button, [role="button"]');
    for (const node of Array.from(candidates)) {
      const text = labelOf2(node);
      if (!text) continue;
      if (LOAD_OLDER_LABELS.indexOf(text) >= 0) return node;
    }
    return null;
  };
  var isVisible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight;
  };
  function installChatHistoryAutoLoad(options) {
    let lastTriggeredAt = 0;
    const onScroll = (event) => {
      if (!options.enabled()) return;
      const scroller = resolveScroller(event.target);
      if (!scroller) return;
      if (scroller.scrollTop > NEAR_TOP_PX) return;
      const now = Date.now();
      if (now - lastTriggeredAt < COOLDOWN_MS) return;
      let control = findLoadOlderControl(scroller);
      if (!control || !isVisible(control)) {
        const global = findLoadOlderControl(document);
        control = global && isVisible(global) ? global : control;
      }
      if (!control) return;
      lastTriggeredAt = now;
      logEvent("info", "chat", "auto-load-older", { scrollTop: Math.round(scroller.scrollTop) });
      try {
        control.click();
      } catch (error) {
        logEvent("warn", "chat", "auto-load-older-failed", {
          message: String(error && error.message || error)
        });
      }
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }

  // src/styles.ts
  var CSS = [
    ":root{--pbx-ease-standard:cubic-bezier(0.25,0.10,0.25,1);--pbx-ease-decelerate:cubic-bezier(0.00,0.00,0.20,1);--pbx-ease-accelerate:cubic-bezier(0.40,0.00,1.00,1);--pbx-ease-emphasized:cubic-bezier(0.20,0.00,0.00,1);--pbx-ease-breathe:cubic-bezier(0.45,0.00,0.55,1);--pbx-spring:cubic-bezier(0.34,1.56,0.64,1);--pbx-dur-micro:120ms;--pbx-dur-small:180ms;--pbx-dur-medium:240ms;--pbx-dur-large:320ms}",
    ".pbx-root{height:100%;overflow:auto;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:14px;line-height:1.45}",
    ".pbx-wrap{max-width:1400px;margin:0 auto;padding:26px 28px 40px}",
    ".pbx-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}",
    ".pbx-titleRow{display:flex;align-items:center;gap:9px;font-size:18px;font-weight:600}",
    ".pbx-glyph{display:inline-flex;color:var(--dsw-alias-brand-primary)}",
    ".pbx-subtitle{color:var(--dsw-alias-label-secondary);font-size:13px;margin-top:4px}",
    ".pbx-totals{display:flex;gap:8px;flex-wrap:wrap}",
    ".pbx-total{display:flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-total strong{color:var(--dsw-alias-label-primary);font-weight:600;font-size:13px}",
    ".pbx-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}",
    ".pbx-tabs{display:flex;gap:2px}",
    ".pbx-tab{display:inline-flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;font-weight:500;padding:6px 10px;border-radius:8px;cursor:pointer}",
    ".pbx-tab:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-tab.active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}",
    ".pbx-tabCount{font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border-radius:999px;padding:0 6px;line-height:16px}",
    ".pbx-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".pbx-input{height:30px;min-width:180px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font:inherit;font-size:13px;outline:none}",
    ".pbx-input:focus{border-color:var(--dsw-alias-brand-primary)}",
    ".pbx-select{height:30px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font:inherit;font-size:12.5px;outline:none;max-width:200px}",
    ".pbx-toggle{height:30px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border-radius:8px;padding:0 10px;font:inherit;font-size:12.5px;cursor:pointer}",
    ".pbx-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-toggle.on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,var(--dsw-alias-border-l1));color:var(--dsw-alias-brand-primary)}",
    ".pbx-sortHint{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;opacity:.8}",
    ".pbx-dbScroll{max-height:calc(100vh - 250px);overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}",
    ".pbx-table{width:100%;border-collapse:separate;border-spacing:0;table-layout:auto}",
    ".pbx-th{position:sticky;top:0;z-index:2;background:var(--dsw-alias-bg-layer-1);text-align:left;font-weight:500;font-size:12px;color:var(--dsw-alias-label-secondary);padding:9px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap;user-select:none}",
    ".pbx-th.sortable{cursor:pointer}",
    ".pbx-th.sortable:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-th.active{color:var(--dsw-alias-label-primary)}",
    ".pbx-th.num{text-align:right}",
    ".pbx-thType{opacity:.55;margin-right:5px;font-size:11px}",
    ".pbx-sortMark{margin-left:5px;color:var(--dsw-alias-brand-primary);font-size:11px}",
    ".pbx-tr{cursor:pointer}",
    ".pbx-tr-auto td{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 5%,transparent)}",
    ".pbx-tr:hover td{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-tr td{padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;color:var(--dsw-alias-label-primary);vertical-align:middle}",
    ".pbx-tr-current td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)}",
    ".pbx-tr-live td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent)}",
    ".pbx-tr-selected td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}",
    ".pbx-tr-selected:hover td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-interactive-bg-hover))}",
    ".pbx-tr-current:hover td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 11%,var(--dsw-alias-interactive-bg-hover))}",
    ".pbx-tr-live:hover td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,var(--dsw-alias-interactive-bg-hover))}",
    ".pbx-titleCell{display:flex;align-items:center;gap:8px;min-width:0}",
    ".pbx-titleText{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:420px}",
    ".pbx-subText{font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:360px}",
    ".pbx-twoLine{display:flex;flex-direction:column;min-width:0;gap:1px}",
    ".pbx-rdot{width:8px;height:8px;border-radius:50%;flex:none}",
    ".pbx-hudPillAttn{display:inline-flex;align-items:center;justify-content:center;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent);color:var(--dsw-alias-state-warn-primary);font-size:10px;font-weight:600;line-height:1}",
    '.pbx-root button:focus-visible,.pbx-root select:focus-visible,.pbx-root input:focus-visible,.pbx-root [role="button"]:focus-visible,.pbx-hud button:focus-visible,.pbx-toasts button:focus-visible,.pbx-notifDock [role="button"]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}',
    ".pbx-tr:focus-within .pbx-openBtn,.pbx-openBtn:focus-visible{opacity:1}",
    ".pbx-runRing{display:inline-block;position:relative;flex:none;border-radius:50%;box-sizing:border-box;border:1.6px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 22%,transparent)}",
    '.pbx-runRing::after{content:"";position:absolute;inset:-1.6px;border-radius:50%;border:1.6px solid transparent;border-top-color:var(--dsw-alias-brand-primary);animation:pbxRunSpin .85s linear infinite}',
    "@keyframes pbxRunSpin{to{transform:rotate(360deg)}}",
    ".pbx-kdot{width:7px;height:7px;border-radius:50%;flex:none}",
    ".pbx-rdot[data-tone=running],.pbx-kdot[data-tone=running]{background:var(--dsw-alias-brand-primary);box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent);animation:pbxRunningDotPulse 1.6s var(--pbx-ease-breathe) infinite}",
    ".pbx-rdot[data-tone=attention],.pbx-kdot[data-tone=attention]{background:var(--dsw-alias-state-warn-primary)}",
    ".pbx-rdot[data-tone=done],.pbx-kdot[data-tone=done]{background:var(--dsw-alias-state-success-primary)}",
    ".pbx-rdot[data-tone=idle],.pbx-kdot[data-tone=idle]{background:var(--dsw-alias-state-idle-primary)}",
    ".pbx-chip{display:inline-flex;align-items:center;gap:6px;max-width:220px}",
    ".pbx-chipIcon{width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none}",
    ".pbx-chipIcon.lg{width:24px;height:24px;border-radius:7px}",
    ".pbx-chipName{font-size:12.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-statusPill{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:500;white-space:nowrap}",
    ".pbx-statusPill[data-tone=running]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent);color:var(--dsw-alias-brand-primary);animation:pbxPillBreathe 2.2s var(--pbx-ease-breathe) infinite}",
    ".pbx-statusPill[data-tone=attention]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 16%,transparent);color:var(--dsw-alias-state-warn-primary)}",
    ".pbx-statusPill[data-tone=done]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 14%,transparent);color:var(--dsw-alias-state-success-primary)}",
    ".pbx-statusPill[data-tone=idle]{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
    ".pbx-curTag{font-size:10.5px;color:var(--dsw-alias-brand-primary);border:1px solid color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);border-radius:999px;padding:0 6px;line-height:16px;flex:none}",
    ".pbx-check{width:16px;height:16px;border-radius:4px;border:1.5px solid var(--dsw-alias-border-l2);display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-bg-base)}",
    ".pbx-check.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
    ".pbx-modeTag{display:inline-block;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;padding:2px 8px;border-radius:6px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-modeTag.empty{color:var(--dsw-alias-label-secondary);background:transparent;border-color:transparent;padding-left:2px}",
    ".pbx-kindTag{display:inline-flex;align-items:center;gap:5px;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
    ".pbx-kindTag.auto{color:var(--dsw-alias-state-warn-primary);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent);padding:2px 8px;border-radius:999px;font-weight:500}",
    ".pbx-autoGlyph{display:inline-flex;color:var(--dsw-alias-state-warn-primary);flex:none}",
    ".pbx-num{text-align:right;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}",
    ".pbx-num.pbx-strong{color:var(--dsw-alias-label-primary);font-weight:600}",
    ".pbx-num.pbx-numZero{color:var(--dsw-alias-label-secondary);opacity:.65}",
    ".pbx-num.pbx-numHot{color:var(--dsw-alias-label-primary);font-weight:600}",
    ".pbx-num.pbx-na{color:var(--dsw-alias-label-secondary);opacity:.6}",
    ".pbx-num.pbx-na.pbx-err{color:var(--dsw-alias-state-error-primary);opacity:.9}",
    ".pbx-num.pbx-ver{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);font-size:12px}",
    ".pbx-num.pbx-ver.pbx-verLag{color:var(--dsw-alias-state-warn-primary);font-weight:600}",
    ".pbx-num.pbx-time{color:var(--dsw-alias-label-secondary)}",
    ".pbx-center{text-align:center}",
    ".pbx-openBtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;opacity:0;transition:opacity var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-tr:hover .pbx-openBtn{opacity:1}",
    ".pbx-openBtn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}",
    ".pbx-groupRow td{background:var(--dsw-alias-bg-layer-2);padding:7px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);cursor:pointer;font-weight:600}",
    ".pbx-groupRow:hover td{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-groupChevron{display:inline-flex;color:var(--dsw-alias-label-secondary);transition:transform var(--pbx-dur-micro) var(--pbx-ease-standard);margin-right:6px;vertical-align:middle}",
    ".pbx-groupChevron.open{transform:rotate(90deg)}",
    ".pbx-chevron{display:inline-flex;flex:none;color:var(--dsw-alias-label-secondary);transition:transform var(--pbx-dur-micro) var(--pbx-ease-standard);margin-right:4px;align-self:center}",
    ".pbx-chevron.open{transform:rotate(90deg)}",
    ".pbx-tr-expanded td{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 5%,transparent)}",
    ".pbx-tr-inline td{padding:5px 10px 5px 32px;font-size:12.5px}",
    ".pbx-tr-inline:hover td{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-inlineSession{border-bottom:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-inlineRow{display:flex;align-items:center;gap:8px;min-width:0}",
    ".pbx-inlineRow .pbx-titleText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-inlineTime{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
    ".pbx-groupCount{margin-left:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary);font-weight:400}",
    ".pbx-appearCell{display:inline-flex;align-items:center;gap:7px}",
    ".pbx-iconField{display:inline-flex;align-items:center;flex:none}",
    ".pbx-iconTrigger{border:none;padding:0;cursor:pointer;transition:box-shadow var(--pbx-dur-micro) var(--pbx-ease-standard),filter var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-iconTrigger:hover{box-shadow:0 0 0 2px color-mix(in srgb,currentColor 30%,transparent);filter:brightness(1.05)}",
    ".pbx-iconTrigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
    ".pbx-miniSwatch{width:14px;height:14px;border-radius:4px;flex:none}",
    ".pbx-appearBtn{display:inline-flex;align-items:center;gap:5px;border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;padding:3px 7px;border-radius:6px;cursor:pointer}",
    ".pbx-appearBtn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}",
    ".pbx-emptyCell{text-align:center;color:var(--dsw-alias-label-secondary);padding:24px 10px;font-size:13px}",
    ".pbx-dbFoot{padding:8px 10px;font-size:12px;color:var(--dsw-alias-label-secondary);border-top:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-loading{padding:40px 8px;color:var(--dsw-alias-label-secondary);font-size:13px}",
    ".pbx-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:72px 24px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px dashed var(--dsw-alias-border-l2);border-radius:16px}",
    ".pbx-emptyIcon{opacity:.7}.pbx-emptyTitle{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}.pbx-emptyDesc{font-size:13px;text-align:center;max-width:340px}",
    ".pbx-pop{position:fixed;top:auto;left:auto;right:auto;z-index:1250;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:12px;width:236px;box-shadow:0 10px 30px rgba(0,0,0,.28)}",
    ".pbx-popLabel{font-size:12px;color:var(--dsw-alias-label-secondary);margin:0 0 8px}",
    ".pbx-swatches{display:grid;grid-template-columns:repeat(9,1fr);gap:6px;margin-bottom:12px}",
    ".pbx-swatchBtn{width:100%;aspect-ratio:1;border-radius:7px;border:2px solid transparent;cursor:pointer;padding:0}",
    ".pbx-swatchBtn.sel{border-color:var(--dsw-alias-label-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-overlay)}",
    ".pbx-icons{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}",
    ".pbx-iconBtn{display:flex;align-items:center;justify-content:center;height:34px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer}",
    ".pbx-iconBtn:hover{color:var(--dsw-alias-label-primary)}",
    ".pbx-iconBtn.sel{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
    ".pbx-reset{width:100%;padding:6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px}",
    ".pbx-reset:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    "@keyframes pbxDotPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 60%,transparent)}70%{box-shadow:0 0 0 6px color-mix(in srgb,var(--dsw-alias-brand-primary) 0%,transparent)}100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 0%,transparent)}}",
    "@keyframes pbxPillBreathe{0%,100%{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}50%{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent)}}",
    ".pbx-nav{display:flex;align-items:center;gap:8px;min-width:0}",
    ".pbx-navRight{gap:4px;margin-right:2px}",
    ".pbx-navItem{display:flex;align-items:center;flex:none}",
    ".pbx-navHistory{display:flex;align-items:center;height:26px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;overflow:hidden;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent)}",
    ".pbx-navSeg{display:inline-flex;align-items:center;justify-content:center;width:26px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}",
    ".pbx-navSeg+.pbx-navSeg{border-left:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-navMoreWrap{position:relative;display:inline-flex}",
    ".pbx-nav.pbx-tight{gap:4px}",
    ".pbx-nav.pbx-tight .pbx-navTitle,.pbx-nav.pbx-tight .pbx-kbd{display:none}",
    ".pbx-nav.pbx-tight .pbx-navSwitch{padding:0 9px}",
    ".pbx-nav.pbx-tight .pbx-capBoard{display:none}",
    ".pbx-nav.pbx-tight .pbx-navHistory{gap:2px}",
    ".pbx-navMore{display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;padding:0;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:8px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;transition:background var(--pbx-dur-micro) var(--pbx-ease-standard),color var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-navMore:hover,.pbx-navMore.open{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-navMenu{position:absolute;top:calc(100% + 6px);right:0;z-index:70;display:flex;flex-direction:column;gap:2px;min-width:200px;max-width:calc(100vw - 24px);padding:6px;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:10px;box-shadow:0 10px 26px rgba(0,0,0,.18)}",
    ".pbx-navMenuItem{display:flex;align-items:center;width:100%}",
    ".pbx-navMenuItem>*{width:100%}",
    ".pbx-navSeg:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-navEmpty{width:0;min-width:0;gap:0}",
    ".pbx-dockButtons{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;padding:2px 2px 0}",
    ".pbx-shortcutHints{display:flex;align-items:center;gap:7px;flex-wrap:wrap;min-width:0;color:var(--dsw-alias-label-secondary);order:9999;opacity:.5;transition:opacity var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-hintGroup{display:inline-flex;align-items:center;gap:4px;flex:none}",
    ".pbx-hintGroupLabel{font-size:9.5px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary)}",
    ".pbx-hintItem{display:inline-flex;align-items:center;gap:2px}",
    ".pbx-hintKey{font-family:inherit;font-size:9px;line-height:12px;padding:0 3px;border-radius:var(--dsw-radius-xs);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
    ".pbx-hintLabel{font-size:10px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-hintSep{width:1px;height:11px;background:var(--dsw-alias-border-l1);flex:none}",
    ".pbx-hintClose{width:16px;height:16px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);border-radius:var(--dsw-radius-xs);cursor:pointer;opacity:0;pointer-events:none;line-height:14px;font-size:13px;transition:opacity var(--pbx-dur-micro) var(--pbx-ease-standard),background var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-shortcutHints:hover{opacity:1}",
    ".pbx-shortcutHints:hover .pbx-hintClose,.pbx-hintClose:focus-visible{opacity:1;pointer-events:auto}",
    ".pbx-hintClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-navGap{flex:none;align-self:center;height:28px;box-sizing:border-box;border-radius:7px;border:1px dashed color-mix(in srgb,var(--dsw-alias-brand-primary) 40%,transparent);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent);transition:width var(--pbx-dur-medium) var(--pbx-ease-decelerate)}",
    ".pbx-dragGhost{border-radius:8px;overflow:hidden;filter:drop-shadow(0 8px 20px rgba(0,0,0,.25))}",
    ".pbx-setInline{display:flex;align-items:center;gap:8px}",
    ".pbx-setMuted{font-size:12px;color:var(--dsw-alias-label-tertiary)}",
    ".pbx-navSwitch{display:flex;align-items:center;gap:7px;height:30px;max-width:380px;padding:0 8px 0 9px;border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);color:var(--dsw-alias-label-secondary);border-radius:8px;cursor:pointer;font:inherit;font-size:12.5px;min-width:0}",
    ".pbx-navSwitch:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-navSwitch.active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary)}",
    ".pbx-navTitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:240px}",
    ".pbx-navJump{display:flex;align-items:center;gap:2px}",
    ".pbx-navIconBtn{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent);color:var(--dsw-alias-label-secondary);border-radius:7px;cursor:pointer}",
    ".pbx-navIconBtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-kbd{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:5px;padding:0 4px;line-height:14px;flex:none}",
    ".pbx-capsule{display:flex;align-items:center;gap:8px;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 78%,transparent);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);border-radius:999px;cursor:pointer;font:inherit;font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-capsule:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-capStat{display:inline-flex;align-items:center;gap:5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
    ".pbx-capStat.live{color:var(--dsw-alias-brand-primary)}",
    ".pbx-capStat.attn{color:var(--dsw-alias-state-warn-primary)}",
    ".pbx-liveDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}",
    ".pbx-capStat.live .pbx-liveDot{background:var(--dsw-alias-brand-primary);animation:pbxDotPulse 1.6s var(--pbx-ease-breathe) infinite}",
    ".pbx-capDot{width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}",
    ".pbx-capBoard{display:inline-flex;align-items:center;gap:5px;padding-left:8px;border-left:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}",
    ".pbx-paletteBackdrop{position:fixed;inset:0;z-index:1300;background:rgba(8,10,14,.20);backdrop-filter:blur(15px) saturate(1.35);-webkit-backdrop-filter:blur(15px) saturate(1.35);display:flex;justify-content:center;align-items:flex-start;padding-top:12vh;pointer-events:auto;animation:pbxBackdropIn var(--pbx-dur-medium) var(--pbx-ease-decelerate) both}",
    ".pbx-palette{width:min(700px,92vw);max-height:72vh;display:flex;flex-direction:column;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-overlay) 74%,transparent),color-mix(in srgb,var(--dsw-alias-bg-overlay) 56%,transparent));backdrop-filter:blur(26px) saturate(1.55);-webkit-backdrop-filter:blur(26px) saturate(1.55);border:1px solid color-mix(in srgb,var(--dsw-alias-border-l2) 62%,rgba(255,255,255,.26));border-radius:16px;box-shadow:0 28px 90px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.09);overflow:hidden;animation:pbxPaletteIn var(--pbx-dur-large) var(--pbx-ease-emphasized) both}",
    ".pbx-paletteHead{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary)}",
    ".pbx-paletteInput{flex:1;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:15px;line-height:22px;outline:none}",
    ".pbx-paletteChips{display:flex;gap:7px;flex-wrap:wrap;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-pchip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px 0 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer;transition:background var(--pbx-dur-small) var(--pbx-ease-standard),border-color var(--pbx-dur-small) var(--pbx-ease-standard),color var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-pchipIcon{width:17px;height:17px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;flex:none}",
    ".pbx-pchip:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-pchip.on{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,var(--dsw-alias-border-l1));color:var(--dsw-alias-brand-primary)}",
    ".pbx-paletteList{overflow:auto;padding:8px;flex:1 1 auto;min-height:0}",
    ".pbx-prow{display:flex;align-items:center;gap:10px;width:100%;padding:9px 11px;border:none;background:transparent;border-radius:9px;cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-primary)}",
    ".pbx-prow{animation:pbxProwIn var(--pbx-dur-small) var(--pbx-ease-decelerate) both;transition:background var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-prow.active{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-prowTitle{font-size:14px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
    ".pbx-prowMeta{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);flex:none;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-prowWsIcon{width:15px;height:15px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;flex:none}",
    ".pbx-prowTime{font-size:11.5px;color:var(--dsw-alias-label-secondary);flex:none;min-width:44px;text-align:right}",
    ".pbx-paletteGroup{display:flex;align-items:center;padding:10px 11px 4px;color:var(--dsw-alias-label-tertiary);font-size:10.5px;font-weight:600;letter-spacing:.04em}",
    ".pbx-paletteGroup:not(:first-child){margin-top:6px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:12px}",
    ".pbx-paletteGroupLabel{flex:none}",
    ".pbx-prowSettingIcon{width:20px;height:20px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:var(--dsw-alias-label-secondary);background:color-mix(in srgb,var(--dsw-alias-label-secondary) 12%,transparent)}",
    '.pbx-prowSettingIcon[data-origin="plugin"]{color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-label-primary) 12%,transparent)}',
    ".pbx-prowSetting .pbx-prowMeta{opacity:.75}",
    ".pbx-setSection.pbx-setHighlight{box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-label-primary) 35%,transparent)}",
    ".pbx-paletteEmpty{padding:24px;text-align:center;color:var(--dsw-alias-label-secondary);font-size:13.5px}",
    ".pbx-paletteFoot{padding:9px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-hud{position:fixed;z-index:1000;width:300px;max-width:calc(100vw - 16px);background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-overlay) 92%,transparent),color-mix(in srgb,var(--dsw-alias-bg-overlay) 84%,transparent));backdrop-filter:blur(24px) saturate(1.3);-webkit-backdrop-filter:blur(24px) saturate(1.3);border:1px solid var(--dsw-alias-border-l1);border-radius:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05);overflow:hidden;pointer-events:auto;transform-origin:top right}",
    ".pbx-hudInner{display:flex;flex-direction:column;min-height:0}",
    ".pbx-hudInner.swap-out{animation:pbxHudSwapOut var(--pbx-dur-micro) var(--pbx-ease-accelerate) both}",
    ".pbx-hudInner.swap-in{animation:pbxHudSwapIn var(--pbx-dur-medium) var(--pbx-ease-decelerate) both}",
    ".pbx-hud.default{right:18px;top:120px}",
    ".pbx-hud.moved{right:auto;top:auto}",
    ".pbx-hud.dragging{cursor:grabbing;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 18px 44px rgba(0,0,0,.26)}",
    ".pbx-hudHead{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent);cursor:grab;user-select:none}",
    ".pbx-hudGrip{width:6px;height:12px;background-image:radial-gradient(circle,var(--dsw-alias-label-secondary) 1px,transparent 1.1px);background-size:3px 4px;opacity:.45;flex:none;margin-right:0}",
    ".pbx-hudHeadTitle{font-size:12px;font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}",
    ".pbx-hudCount{margin-left:auto;min-width:20px;text-align:center;box-sizing:border-box;font-size:10.5px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;line-height:18px}",
    ".pbx-hudCollapse{width:22px;height:22px;margin-left:2px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;font:inherit;line-height:1;transition:background var(--pbx-dur-small) var(--pbx-ease-standard),color var(--pbx-dur-small) var(--pbx-ease-standard),transform var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-hudCollapse:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary) 14%,transparent);color:var(--dsw-alias-label-primary)}",
    ".pbx-hudCollapse:active{transform:scale(.92)}",
    ".pbx-hudCollapse:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".pbx-hudList{max-height:260px;overflow-x:hidden;overflow-y:auto;padding:8px 8px 10px;transition:height var(--pbx-dur-medium) var(--pbx-ease-decelerate);scrollbar-width:none;-ms-overflow-style:none}",
    ".pbx-hudList::-webkit-scrollbar{width:0;height:0}",
    ".pbx-hudList.scrollable{mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent);-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 12px),transparent)}",
    ".pbx-hud:hover .pbx-hudList{scrollbar-width:thin;scrollbar-color:var(--dsw-alias-border-l2) transparent}",
    ".pbx-hud:hover .pbx-hudList::-webkit-scrollbar{width:6px;height:6px}",
    ".pbx-hud:hover .pbx-hudList::-webkit-scrollbar-thumb{background:var(--dsw-alias-border-l2);border-radius:3px}",
    ".pbx-hud:hover .pbx-hudList::-webkit-scrollbar-track{background:transparent}",
    ".pbx-hudListInner{display:flex;flex-direction:column;gap:3px}",
    ".pbx-hudRow{position:relative;box-sizing:border-box;display:flex;align-items:center;gap:8px;width:100%;padding:7px 9px;border:none;background:transparent;border-radius:8px;cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-primary);outline:none;transition:background var(--pbx-dur-small) var(--pbx-ease-standard),box-shadow var(--pbx-dur-small) var(--pbx-ease-standard);animation:pbxHudRowIn var(--pbx-dur-medium) var(--pbx-ease-decelerate) both}",
    ".pbx-hudRow:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-hudRow.auto{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 6%,transparent)}",
    ".pbx-hudRow.auto:hover{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-interactive-bg-hover))}",
    ".pbx-hudAuto{display:inline-flex;align-items:center;color:var(--dsw-alias-state-warn-primary);flex:none}",
    ".pbx-hudRow.current{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent);box-shadow:none}",
    ".pbx-hudRow.spotlight{box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-brand-primary) 35%,transparent)}",
    ".pbx-hudRow.current:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent)}",
    ".pbx-hudRow:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}",
    "@keyframes pbxRunningDotPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 55%,transparent)}70%{box-shadow:0 0 0 6px transparent}100%{box-shadow:0 0 0 0 transparent}}",
    ".pbx-hudRow.live .pbx-hudTimer{color:var(--dsw-alias-brand-primary)}",
    ".pbx-hudRowMain{display:flex;flex-direction:column;min-width:0;flex:1;gap:2px}",
    ".pbx-hudRowTitle{font-size:12.8px;font-weight:500;line-height:17px;letter-spacing:.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-hudRowMeta{font-size:10.8px;line-height:15px;letter-spacing:.01em;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-hudTimer{font-size:11px;min-width:44px;text-align:right;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;flex:none;transition:opacity var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-hudArchive{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;pointer-events:none;transition:opacity var(--pbx-dur-micro) var(--pbx-ease-standard),background var(--pbx-dur-micro) var(--pbx-ease-standard),color var(--pbx-dur-micro) var(--pbx-ease-standard),border-color var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-hudRow:hover .pbx-hudTimer,.pbx-hudRow:focus-within .pbx-hudTimer{opacity:0}",
    ".pbx-hudRow:hover .pbx-hudArchive,.pbx-hudRow:focus-within .pbx-hudArchive{opacity:1;pointer-events:auto}",
    ".pbx-hudArchive:hover{background:color-mix(in srgb,var(--dsw-alias-label-secondary) 16%,transparent);border-color:var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary)}",
    ".pbx-hudArchive:focus-visible{opacity:1;pointer-events:auto;outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}",
    ".pbx-hudArchive:active{transform:translateY(-50%) scale(.92)}",
    ".pbx-prowArchived{font-size:10.5px;line-height:16px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 14%,transparent);color:var(--dsw-alias-label-secondary);flex:none;white-space:nowrap}",
    ".pbx-prow.archived .pbx-prowTitle{color:var(--dsw-alias-label-secondary)}",
    ".pbx-hudFoot{position:relative;display:flex;flex-direction:column;gap:4px;padding:7px 10px 8px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 65%,transparent);opacity:1;transition:opacity var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-hudFoot:hover{opacity:1}",
    ".pbx-hudFootRow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-right:16px;min-width:0}",
    ".pbx-hudFootTitle{font-size:9.5px;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-tertiary);flex:none;min-width:26px}",
    ".pbx-hudFootItem{display:inline-flex;align-items:center;gap:3px;flex:none}",
    ".pbx-hudKey{font-family:inherit;font-size:9px;line-height:12px;padding:0 3px;border-radius:var(--dsw-radius-xs);border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary)}",
    ".pbx-hudFootLabel{font-size:10px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
    ".pbx-hudFootClose{position:absolute;right:5px;top:6px;width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:var(--dsw-radius-xs);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:0;pointer-events:none;transition:opacity var(--pbx-dur-micro) var(--pbx-ease-standard),background var(--pbx-dur-micro) var(--pbx-ease-standard),color var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-hudFoot:hover .pbx-hudFootClose,.pbx-hudFootClose:focus-visible{opacity:1;pointer-events:auto}",
    ".pbx-hudFootClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-hud.collapsed{display:inline-flex;align-items:center;gap:7px;width:auto;padding:6px 12px;border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 88%,transparent);backdrop-filter:blur(24px) saturate(1.35);-webkit-backdrop-filter:blur(24px) saturate(1.35);border:1px solid var(--dsw-alias-border-l1);cursor:pointer;font:inherit;color:var(--dsw-alias-label-primary);transition:transform var(--pbx-dur-small) var(--pbx-ease-standard),box-shadow var(--pbx-dur-small) var(--pbx-ease-standard);animation:pbxHudPillIn var(--pbx-dur-small) var(--pbx-ease-decelerate) both}",
    ".pbx-hudPillIcon{width:19px;height:19px;border-radius:6px;display:inline-flex;align-items:center;justify-content:center;flex:none;background:color-mix(in srgb,var(--dsw-alias-label-secondary) 13%,transparent);color:var(--dsw-alias-label-secondary);transition:background var(--pbx-dur-small) var(--pbx-ease-standard),color var(--pbx-dur-small) var(--pbx-ease-standard),box-shadow var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-hudPillIcon.live{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 16%,transparent);color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 45%,transparent);animation:pbxPillIconPulse 2.2s var(--pbx-ease-breathe) infinite}",
    ".pbx-hudPillIcon.attention{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 18%,transparent);color:var(--dsw-alias-state-warn-primary)}",
    ".pbx-hud.collapsed:hover .pbx-hudPillIcon{background:color-mix(in srgb,var(--dsw-alias-label-secondary) 20%,transparent)}",
    ".pbx-hud.collapsed:hover .pbx-hudPillIcon.live{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 24%,transparent)}",
    "@keyframes pbxPillIconPulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--dsw-alias-brand-primary) 42%,transparent)}70%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}",
    ".pbx-hudPillText{font-size:12px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}",
    ".pbx-hudPillLabel{font-size:11px;letter-spacing:.01em;color:var(--dsw-alias-label-secondary)}",
    ".pbx-hud.collapsed:hover{transform:translateY(-1px)}",
    ".pbx-hud.collapsed:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}",
    ".pbx-responsive{height:100%;min-height:0;display:flex;flex-direction:column}",
    ".pbx-responsive>.pbx-root{flex:1;min-height:0}",
    ".pbx-headerRight{display:flex;align-items:center;gap:10px;flex-wrap:wrap}",
    ".pbx-headerClose{display:inline-flex;align-items:center;gap:5px;flex:none;padding:0 10px;height:28px;font-size:12.5px}",
    ".pbx-renameBackdrop{position:fixed;inset:0;z-index:1300;display:flex;justify-content:center;align-items:flex-start;padding-top:16vh;background:rgba(8,10,14,.34);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);pointer-events:auto;animation:pbxBackdropIn var(--pbx-dur-medium) var(--pbx-ease-decelerate) both}",
    ".pbx-renameCard{width:min(420px,calc(100vw - 32px));box-sizing:border-box;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-xl);box-shadow:0 24px 64px rgba(0,0,0,.32);padding:18px;display:flex;flex-direction:column;gap:7px;animation:pbxPaletteIn var(--pbx-dur-large) var(--pbx-ease-emphasized) both}",
    ".pbx-renameTitle{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:2px}",
    ".pbx-renameLabel{font-size:12px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-renameInput{height:34px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:var(--dsw-radius-sm);padding:0 10px;font:inherit;font-size:13px;outline:none}",
    ".pbx-renameInput:focus{border-color:var(--dsw-alias-brand-primary)}",
    ".pbx-renameError{font-size:12px;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}",
    ".pbx-renameActions{display:flex;justify-content:flex-end;gap:8px;margin-top:6px}",
    ".pbx-renameBtn{height:30px;padding:0 12px;border-radius:var(--dsw-radius-sm);border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer}",
    ".pbx-renameBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-renameBtn:disabled{opacity:.5;cursor:default}",
    ".pbx-renameBtn.primary{background:var(--dsw-alias-label-primary);border-color:transparent;color:var(--dsw-alias-bg-base);font-weight:600}",
    ".pbx-renameBtn.primary:hover:not(:disabled){opacity:.9}",
    ".pbx-renameBtn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 45%,var(--dsw-alias-border-l1))}",
    ".pbx-renameBtn.danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)}",
    ".pbx-menuHint{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.45;overflow-wrap:anywhere}",
    ".pbx-menuSession{display:flex;flex-direction:column;gap:2px;padding:9px 11px;margin:2px 0 12px;border-radius:9px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-menuSessionLabel{font-size:10.5px;color:var(--dsw-alias-label-tertiary);letter-spacing:.02em}",
    ".pbx-menuSessionTitle{font-size:13.5px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-menuSubtitle{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin:0 0 8px}",
    ".pbx-menuOption{display:flex;align-items:flex-start;gap:10px;width:100%;padding:11px 12px;margin:0 0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-primary);transition:background var(--pbx-dur-micro) var(--pbx-ease-standard),border-color var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-menuOption:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}",
    ".pbx-menuOption:disabled{opacity:.55;cursor:not-allowed}",
    ".pbx-menuOption.danger:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 8%,var(--dsw-alias-interactive-bg-hover));border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1))}",
    ".pbx-menuOptionIcon{width:26px;height:26px;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;flex:none;background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);color:var(--dsw-alias-brand-primary)}",
    ".pbx-menuOptionIcon.danger{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary)}",
    ".pbx-menuOptionBody{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".pbx-menuOptionTitle{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}",
    ".pbx-menuOptionDesc{font-size:11.5px;color:var(--dsw-alias-label-secondary);line-height:1.5;overflow-wrap:anywhere}",
    ".pbx-menuOptionChev{color:var(--dsw-alias-label-tertiary);font-size:16px;line-height:1;margin-top:3px;flex:none}",
    ".pbx-menuFoot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:2px}",
    ".pbx-menuFootHint{font-size:11px;color:var(--dsw-alias-label-tertiary)}",
    ".pbx-toasts{position:fixed;top:calc(var(--dsh-windows-titlebar-height,0px) + 12px);left:50%;transform:translateX(-50%);z-index:1260;display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none}",
    /* macOS reserves 48px under the menu bar / window controls. The host publishes it as
       --dsh-frame-top-clearance; fall back to 48px when the web UI does not set it.
       The HUD keeps its 120px design position (already below the clearance) and only
       follows a larger clearance; the toast stack and modal backdrops follow it fully. */
    'html[data-pbx-platform="darwin"] .pbx-toasts{top:calc(var(--dsh-frame-top-clearance,48px) + 20px)}',
    'html[data-pbx-platform="darwin"][data-fullscreen] .pbx-toasts{top:20px}',
    'html[data-pbx-platform="darwin"] .pbx-hud.default{top:max(120px,calc(var(--dsh-frame-top-clearance,48px) + 20px))}',
    'html[data-pbx-platform="darwin"] .pbx-paletteBackdrop{padding-top:max(12vh,calc(var(--dsh-frame-top-clearance,48px) + 20px))}',
    'html[data-pbx-platform="darwin"] .pbx-renameBackdrop{padding-top:max(16vh,calc(var(--dsh-frame-top-clearance,48px) + 20px))}',
    ".pbx-toast{pointer-events:auto;display:flex;align-items:flex-start;gap:10px;min-width:260px;max-width:min(520px,calc(100vw - 32px));box-sizing:border-box;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);box-shadow:0 12px 32px rgba(0,0,0,.28);animation:pbxToastIn var(--pbx-dur-small) var(--pbx-ease-decelerate) both}",
    ".pbx-toast[data-tone=warn]{border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 55%,var(--dsw-alias-border-l2))}",
    ".pbx-toastIcon{display:inline-flex;color:var(--dsw-alias-state-warn-primary);flex:none;padding-top:1px}",
    ".pbx-toastMain{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".pbx-toastTitle{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.4}",
    ".pbx-toastMsg{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.45;overflow-wrap:anywhere}",
    ".pbx-toastClose{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-xs);cursor:pointer;flex:none}",
    ".pbx-toastClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-notifDock{position:fixed;z-index:1240;display:flex;flex-direction:column;align-items:flex-end;gap:8px;pointer-events:none;max-width:min(420px,calc(100vw - 24px))}",
    ".pbx-notifCard{pointer-events:auto;box-sizing:border-box;min-width:280px;max-width:100%;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);box-shadow:0 16px 40px rgba(0,0,0,.32);padding:10px 12px;display:flex;flex-direction:column;gap:6px;cursor:pointer;animation:pbxNotifIn var(--pbx-dur-medium) var(--pbx-ease-decelerate) both;outline:none}",
    ".pbx-notifCard[data-tone=success]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 11%,var(--dsw-alias-bg-layer-2));border-color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 38%,var(--dsw-alias-border-l2))}",
    ".pbx-notifCard[data-tone=warn]{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,var(--dsw-alias-bg-layer-2));border-color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,var(--dsw-alias-border-l2))}",
    ".pbx-notifHead{display:flex;align-items:center;gap:8px}",
    ".pbx-notifGlyph{display:inline-flex;color:var(--dsw-alias-label-secondary);flex:none}",
    ".pbx-notifCard[data-tone=success] .pbx-notifGlyph{color:var(--dsw-alias-state-success-primary)}",
    ".pbx-notifCard[data-tone=warn] .pbx-notifGlyph{color:var(--dsw-alias-state-warn-primary)}",
    ".pbx-notifTitle{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);line-height:1.4}",
    ".pbx-notifClose{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:var(--dsw-radius-xs);cursor:pointer;flex:none}",
    ".pbx-notifClose:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-notifBody{font-size:12px;color:var(--dsw-alias-label-secondary);line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:220px;overflow:auto}",
    ".pbx-notifFoot{font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.78}",
    ".pbx-setWarn{font-size:11.5px;color:var(--dsw-alias-state-warn-primary);line-height:1.45;overflow-wrap:anywhere}",
    ".pbx-compact{padding:0}",
    ".pbx-compactWrap{padding:12px 10px 12px;max-width:none;display:flex;flex-direction:column;min-height:100%;box-sizing:border-box}",
    ".pbx-compactHead{display:flex;align-items:center;gap:8px;margin-bottom:10px;min-width:0}",
    ".pbx-compactTabs{display:flex;align-items:center;gap:2px;margin-bottom:10px;flex-wrap:wrap}",
    ".pbx-moreCell{padding:8px 10px;text-align:center}",
    ".pbx-setRowOff{opacity:.55}",
    ".pbx-showMore{margin:8px auto 0;display:block}",
    ".pbx-compactTitle{display:flex;align-items:center;gap:7px;font-weight:600;font-size:14px;color:var(--dsw-alias-label-primary);flex:1;min-width:0;overflow:hidden}",
    ".pbx-compactTitle>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}",
    ".pbx-compactMeta{margin-left:auto;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}",
    ".pbx-compactFull{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;flex:none}",
    ".pbx-compactFull:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-cgroup{margin:0 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:color-mix(in srgb,var(--pbx-tone,transparent) 6%,var(--dsw-alias-bg-layer-1));overflow:hidden}",
    ".pbx-cgroupHead{display:flex;align-items:center;gap:7px;padding:7px 10px;font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--pbx-tone,transparent) 10%,var(--dsw-alias-bg-layer-2));border-bottom:1px solid color-mix(in srgb,var(--pbx-tone,var(--dsw-alias-border-l1)) 22%,var(--dsw-alias-border-l1))}",
    ".pbx-cgroup.empty .pbx-cgroupHead{background:var(--dsw-alias-bg-layer-2);border-bottom-color:transparent}",
    ".pbx-cgroupTitle{letter-spacing:.02em}",
    ".pbx-cgroupCount{margin-left:auto;min-width:18px;text-align:center;font-size:10.5px;font-weight:600;line-height:16px;padding:0 6px;border-radius:999px;color:var(--pbx-tone,var(--dsw-alias-label-secondary));background:color-mix(in srgb,var(--pbx-tone,var(--dsw-alias-label-secondary)) 16%,transparent)}",
    ".pbx-cgroupEmpty{padding:8px 11px;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}",
    ".pbx-crow{display:flex;align-items:center;gap:7px;width:100%;padding:7px 10px;border:none;background:transparent;border-radius:0;cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-primary)}",
    ".pbx-crow + .pbx-crow{box-shadow:inset 0 1px 0 color-mix(in srgb,var(--dsw-alias-border-l1) 55%,transparent)}",
    ".pbx-pcard{display:flex;flex-direction:column;gap:5px;width:100%;padding:10px 11px;margin:0 0 8px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1);cursor:pointer;font:inherit;text-align:left;color:var(--dsw-alias-label-primary);transition:background var(--pbx-dur-small) var(--pbx-ease-standard),border-color var(--pbx-dur-small) var(--pbx-ease-standard)}",
    ".pbx-pcard:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}",
    ".pbx-pcardTop{display:flex;align-items:center;gap:8px;min-width:0}",
    ".pbx-pcardName{flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-pcardTotal{font-size:11px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:0 6px;line-height:16px;flex:none}",
    ".pbx-pcardPath{font-size:10.5px;color:var(--dsw-alias-label-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-pcardStats{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:10.5px;color:var(--dsw-alias-label-secondary)}",
    ".pbx-compactBack{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:6px;cursor:pointer;flex:none}",
    ".pbx-compactBack:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
    ".pbx-crow.archived{opacity:.72}",
    ".pbx-compactBody{display:flex;flex-direction:column;gap:2px;min-height:0;flex:1}",
    ".pbx-compactList{display:flex;flex-direction:column;gap:2px;flex:1;min-height:0}",
    ".pbx-compactPath{position:sticky;bottom:0;display:flex;align-items:center;gap:6px;margin-top:auto;padding:7px 2px 3px;border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent);background:var(--dsw-alias-bg-base);box-shadow:0 -1px 0 color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent);font-size:10.5px;color:var(--dsw-alias-label-tertiary);min-width:0}",
    ".pbx-compactPathLabel{flex:none;font-weight:600;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}",
    ".pbx-compactPathText{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;direction:rtl;unicode-bidi:plaintext;text-align:left}",
    ".pbx-setSubTitle{font-size:11.5px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:10px 0 2px;padding-top:8px;border-top:1px dashed color-mix(in srgb,var(--dsw-alias-border-l1) 70%,transparent)}",
    ".pbx-crow:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-crow.auto{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 5%,transparent)}",
    ".pbx-ctitle{flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-ctime{font-size:11px;color:var(--dsw-alias-label-secondary);flex:none}",
    ".pbx-setPage{padding:4px 2px 30px}",
    ".pbx-setTitle{font-size:16px;font-weight:600;margin:0 0 4px;color:var(--dsw-alias-label-primary)}",
    ".pbx-setIntro{font-size:12.5px;color:var(--dsw-alias-label-secondary);margin:0 0 18px}",
    ".pbx-setSection{margin-bottom:22px}",
    ".pbx-setSectionTitle{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary);margin:0 0 4px;padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-setRow{display:flex;align-items:center;gap:16px;padding:11px 2px;border-bottom:1px solid var(--dsw-alias-border-l1)}",
    ".pbx-setRowText{flex:1;min-width:0}",
    ".pbx-setLabel{font-size:13px;color:var(--dsw-alias-label-primary)}",
    ".pbx-setDesc{font-size:11.5px;color:var(--dsw-alias-label-secondary);margin-top:2px}",
    ".pbx-setControl{flex:none;display:flex;align-items:center;gap:8px}",
    ".pbx-keycap{min-width:68px;height:30px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;font:inherit;font-size:12px;cursor:pointer}",
    ".pbx-keycap:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-keycap.recording{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}",
    ".pbx-switch{position:relative;width:38px;height:22px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background var(--pbx-dur-micro) var(--pbx-ease-standard),border-color var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-switch.on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}",
    ".pbx-switchThumb{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-bg-base);transition:transform var(--pbx-dur-micro) var(--pbx-ease-standard)}",
    ".pbx-switch.on .pbx-switchThumb{transform:translateX(16px)}",
    ".pbx-setSelect{height:30px;min-width:120px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font:inherit;font-size:12.5px;outline:none}",
    ".pbx-setInput{height:30px;width:88px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 8px;font:inherit;font-size:12.5px;outline:none}",
    ".pbx-setRange{display:inline-flex;align-items:center;gap:8px}",
    ".pbx-setRange input{width:150px}",
    ".pbx-setRangeValue{font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;min-width:24px;text-align:right}",
    ".pbx-setHint{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:8px 2px 0}",
    ".pbx-setError{font-size:11.5px;color:var(--dsw-alias-state-error-primary);padding:8px 2px 0}",
    ".pbx-setActions{display:flex;gap:8px;flex-wrap:wrap;padding-top:8px}",
    ".pbx-setBtn{height:32px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;cursor:pointer}",
    ".pbx-setBtn:hover{background:var(--dsw-alias-interactive-bg-hover)}",
    ".pbx-setBtn.danger{color:var(--dsw-alias-state-error-primary);border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 40%,var(--dsw-alias-border-l1))}",
    ".pbx-githubToken{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
    ".pbx-githubTokenInput{flex:1;min-width:180px;width:auto}",
    ".pbx-githubOk{color:var(--dsw-alias-state-success-primary)}",
    ".pbx-githubRepo{display:flex;align-items:center;gap:8px;padding:6px 2px;border-bottom:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}",
    ".pbx-githubPath{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);min-width:140px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pbx-githubPathInput{min-width:140px;flex:1.2}",
    ".pbx-githubOwner{width:90px}",
    ".pbx-githubRepoName{width:110px}",
    ".pbx-githubLocal{width:84px}",
    ".pbx-githubRemove{width:30px;padding:0;flex:none}",
    ".pbx-disabled{display:flex;align-items:center;justify-content:center;padding:40px 16px;color:var(--dsw-alias-label-secondary);font-size:13px}",
    ".pbx-tab,.pbx-input,.pbx-select,.pbx-toggle,.pbx-setBtn,.pbx-setSelect,.pbx-setInput,.pbx-navSwitch,.pbx-prow,.pbx-hudRow{border-radius:var(--dsw-radius-md)}",
    ".pbx-navIconBtn,.pbx-navHistory,.pbx-hudCollapse,.pbx-openBtn,.pbx-appearBtn,.pbx-keycap,.pbx-dragGhost,.pbx-navGap,.pbx-modeTag{border-radius:var(--dsw-radius-sm)}",
    ".pbx-hud,.pbx-palette{border-radius:var(--dsw-radius-lg)}",
    ".pbx-dbScroll{border-radius:var(--dsw-radius-lg)}",
    ".pbx-pchipIcon,.pbx-prowWsIcon,.pbx-chipIcon,.pbx-miniSwatch,.pbx-check,.pbx-hudKey{border-radius:var(--dsw-radius-xs)}",
    ".pbx-chipIcon.lg{border-radius:var(--dsw-radius-sm)}",
    ".pbx-user-jump-highlight{animation:pbxUserJump 1.2s var(--pbx-ease-standard) both;border-radius:12px}",
    "@keyframes pbxUserJump{0%{background:transparent}22%{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)}100%{background:transparent}}",
    ".pbx-hud.default.bottom{top:auto;bottom:18px;right:18px}",
    ".pbx-hud.closing{animation:pbxHudOut var(--pbx-dur-small) var(--pbx-ease-accelerate) both;pointer-events:none}",
    ".pbx-paletteBackdrop.closing{animation:pbxBackdropOut var(--pbx-dur-small) var(--pbx-ease-accelerate) both;pointer-events:none}",
    ".pbx-paletteBackdrop.closing .pbx-palette{animation:pbxPaletteOut var(--pbx-dur-small) var(--pbx-ease-accelerate) both}",
    "@keyframes pbxToastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}",
    "@keyframes pbxNotifIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}",
    "@keyframes pbxHudPillIn{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:none}}",
    "@keyframes pbxHudSwapOut{from{opacity:1;transform:translateY(0)}to{opacity:0;transform:translateY(3px)}}",
    "@keyframes pbxHudSwapIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
    "@keyframes pbxHudOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-4px) scale(.99)}}",
    "@keyframes pbxHudRowIn{from{opacity:0;transform:translateX(-4px)}to{opacity:1;transform:none}}",
    "@keyframes pbxProwIn{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}",
    "@keyframes pbxBackdropOut{from{opacity:1}to{opacity:0}}",
    "@keyframes pbxPaletteOut{from{opacity:1;transform:none}to{opacity:0;transform:translateY(-6px) scale(.99)}}",
    "@keyframes pbxBackdropIn{from{opacity:0}to{opacity:1}}",
    "@keyframes pbxPaletteIn{from{opacity:0;transform:translateY(-10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}",
    "@media (prefers-reduced-motion: reduce){.pbx-runRing::after,.pbx-kdot,.pbx-rdot,.pbx-statusPill,.pbx-liveDot,.pbx-palette,.pbx-paletteBackdrop,.pbx-renameBackdrop,.pbx-renameCard,.pbx-toast,.pbx-notifCard,.pbx-hud,.pbx-hudInner,.pbx-hudRow,.pbx-prow,.pbx-user-jump-highlight{animation:none!important}.pbx-root *,.pbx-hud *,.pbx-toasts *,.pbx-notifDock *{transition-duration:1ms!important}}"
  ].join("\n");

  // src/i18n/en.ts
  var en = {
    "panel.label": "Project Board",
    "title": "Project Board",
    "panel.close": "Back to chat",
    "subtitle": "A database of sessions and projects: filter, group, and sort by properties.",
    "stat.workspaces": "workspaces",
    "stat.sessions": "sessions",
    "stat.attention": "attention",
    "stat.running": "running",
    "view.sessions": "Sessions",
    "view.projects": "Projects",
    "filter.all": "All",
    "filter.status": "Status",
    "filter.project": "Project",
    "filter.search": "Search…",
    "group.byProject": "Group by project",
    "sort.hint": "{shift}+click a column to add a sort",
    "col.title": "Name",
    "col.project": "Project",
    "col.status": "Status",
    "col.empty": "No sessions",
    "col.preset": "Mode",
    "col.updated": "Last activity",
    "col.appearance": "Appearance",
    "col.path": "Path",
    "col.na": "—",
    "col.naHint": "No data source configured — set the GitHub repo for this project in Settings",
    "col.loading": "Fetching from GitHub…",
    "col.errRepoNotFound": "GitHub repo not found, or private without a valid token",
    "col.errTokenInvalid": "GitHub token is invalid or expired",
    "col.errRateLimited": "GitHub API rate limit reached — retry later or configure a token",
    "col.errTimeout": "GitHub request timed out — check the network and retry",
    "col.errGeneric": "Failed to fetch GitHub data ({code})",
    "col.localBehind": "Local {local}, behind latest {latest}",
    "col.hint.name": "Project name, icon and color",
    "col.hint.total": "Total sessions under this project",
    "col.hint.issues": "Open issues in the repository",
    "col.hint.prs": "Open pull requests in the repository",
    "col.hint.localVersion": "Local internal version",
    "col.hint.latestVersion": "Latest published GitHub version",
    "col.hint.lastUpdated": "Most recent activity time for this project",
    "compact.allProjects": "All projects",
    "status.archived": "Archived",
    "col.kind": "Type",
    "kind.auto": "Automation",
    "kind.normal": "Session",
    "filter.kind": "Type",
    "stat.auto": "Automation",
    "nav.switch": "Switch session",
    "nav.switchLabel": "Sessions",
    "nav.board": "Board",
    "nav.openBoard": "Open project board",
    "nav.more": "More controls",
    "rightTab.title": "Project Board",
    "compact.full": "Open full screen",
    "palette.placeholder": "Search sessions, projects or settings…",
    "palette.allProjects": "All projects",
    "palette.empty": "No matching results",
    "palette.hint": "↑↓ or {prev} / {next} select · Enter open · {palette}/Esc close",
    "palette.group.hostSettings": "Settings",
    "palette.group.pluginSettings": "Project Board settings",
    "palette.group.sessions": "Sessions",
    "palette.setting.open": "Open settings",
    "toast.settingsOpenFailed": "Could not open Settings automatically; use the sidebar",
    "toast.settingsOpenPartial": "Settings opened, but the section could not be selected automatically",
    "hud.title": "Active & recent",
    "hud.running": "running",
    "hud.expand": "Expand",
    "hud.collapse": "Collapse",
    "hud.prev": "Previous",
    "hud.next": "Next",
    "hud.recent": "Recent",
    "hud.groupSession": "Session",
    "hud.groupMessage": "Instruction",
    "hud.prevInstruction": "Previous",
    "hud.nextInstruction": "Next",
    "hud.toBottom": "Bottom",
    "hud.auto": "Auto",
    "hud.archive": "Archive session",
    "hud.archiveUnavailable": "This DSH client exposes no archive entry point; use the session actions dialog instead.",
    "palette.archived": "Archived",
    "settings.paletteArchived": "Include archived sessions in search",
    "settings.paletteArchivedDesc": "On by default; turn it off to search only sessions that are not archived",
    "settings.title": "Project Board settings",
    "settings.intro": "Customize shortcuts, floating status, and board behavior.",
    "settings.shortcuts": "Shortcuts",
    "settings.shortcut.palette": "Open session search",
    "settings.shortcut.prev": "Previous session",
    "settings.shortcut.next": "Next session",
    "settings.shortcut.userPrev": "Previous user message (tap to jump, hold to scroll up)",
    "settings.shortcut.userNext": "Next user message (tap to jump, hold to scroll down)",
    "settings.shortcut.scrollBottom": "Scroll to bottom and focus input",
    "settings.shortcut.sidebarBoard": "Toggle narrow board (right sidebar, last width)",
    "settings.shortcut.leftSidebar": "Expand or collapse the native left sidebar",
    "settings.shortcut.panelHalf": "Toggle medium board (right sidebar, 50%)",
    "settings.shortcut.panelFull": "Toggle board fullscreen (right sidebar)",
    "settings.shortcut.rename": "Rename current session",
    "settings.shortcut.interject": "Interject the earliest queued message",
    "settings.shortcut.hud": "Collapse/expand floating list",
    "settings.shortcut.sessionMenu": "Open session actions dialog (archive / stop turn / delete)",
    "rename.title": "Rename session",
    "rename.label": "Session name",
    "rename.placeholder": "Enter a new session name",
    "rename.cancel": "Cancel",
    "rename.confirm": "Save",
    "rename.saving": "Saving…",
    "rename.failed": "Rename failed",
    "toast.conflictTitle": "Shortcut conflict",
    "toast.conflictOwn": `"{combo}" is already used by this plugin's "{name}".`,
    "toast.conflictBuiltin": '"{combo}" is already used by the built-in DSH command "{name}".',
    "toast.conflictExisting": 'Saved shortcut {combo} conflicts with the built-in command "{name}". Rebind it.',
    "toast.conflictExistingMany": "{n} shortcuts conflict with built-in commands. Rebind them in Settings.",
    "toast.dismiss": "Dismiss notification",
    "toast.interjectNone": "No queued message can be steered right now (available only while running).",
    "toast.archived": "Session archived",
    "menu.title": "Manage session",
    "menu.deleteConfirm": "Click again to confirm",
    "menu.cancel": "Cancel",
    "menu.sessionLabel": "Current session",
    "menu.subtitle": "Choose what to do with this session",
    "menu.stopTitle": "Stop turn",
    "menu.stopHint": "Stop the running turn; queued messages are preserved.",
    "menu.stopUnavailable": "This DSH client does not expose a stop API.",
    "menu.archiveTitle": "Archive session",
    "menu.archiveDesc": "Hides it from active and recent lists; the conversation is kept and can be restored later.",
    "menu.deleteTitle": "Delete session",
    "menu.deleteDesc": "Permanently deletes this session and its history. This cannot be undone.",
    "menu.deleteUnsupportedDesc": "This client does not expose session deletion yet, so archiving is the only option.",
    "menu.confirmDesc": "Click again to confirm deletion; this cannot be undone.",
    "menu.footerHint": "Press Esc or Cancel to close",
    "menu.deleteUnavailable": "This DSH client does not expose session deletion yet. Use archive instead.",
    "menu.failed": "Failed: {message}",
    "menu.busy": "Working…",
    "settings.selfConflict": "{combo} is bound to {names}; record one of them again.",
    "settings.shortcut.hint": "Click a keycap, then press the new combination; {ctrl} / {alt} / {meta} is required; Esc cancels. Combinations that clash with built-in DSH commands are rejected with a notice.",
    "settings.shortcutNeedModifier": "A shortcut must include {ctrl} / {alt} / {meta}; bare keys are not allowed.",
    "settings.shortcutResetHint": "Click to record, double-click to reset",
    "settings.recording": "Press keys…",
    "settings.behavior": "Interface and behavior",
    "settings.paletteEnabled": "Enable command palette",
    "settings.paletteEnabledDesc": "Shortcuts and the search panel",
    "settings.headerButtons": "Top function buttons",
    "settings.headerPlacement": "Button placement",
    "settings.placement.header": "Header bar",
    "settings.placement.composer": "Below composer status",
    "settings.headerButtonsHint": "Hold {ctrl} and drag a button with the left mouse button to move it between the left and right sides. Each button can also be hidden separately. Right docking requires an open session.",
    "settings.composerButtonsHint": "Buttons are shown below the composer in a fixed order; each button can still be hidden individually.",
    "settings.hb.switch": "Session search",
    "settings.hb.historyNav": "History & bottom",
    "settings.hb.capsule": "Status capsule",
    "settings.hb.sideLeft": "Left",
    "settings.hb.sideRight": "Right",
    "settings.hb.followPlacement": "Follows global placement",
    "settings.hudEnabled": "Enable floating status",
    "settings.hudEnabledDesc": "Live non-idle sessions and timers",
    "settings.notifyEnabled": "Enable task notifications",
    "settings.notifyEnabledDesc": "Notify on completion, questions, or approvals",
    "settings.notifySound": "Notification sound",
    "settings.notifySoundDesc": "Play a chime for in-app notifications",
    "settings.chatAutoHistory": "Load history on scroll",
    "settings.chatAutoHistoryDesc": 'When a conversation is scrolled to the top, load older messages automatically (same as clicking "Load earlier")',
    "notif.failTitle": "Task failed",
    "notif.failBodyReason": 'Session "{title}" failed this turn: {reason}',
    "notif.completeTitle": "Task complete",
    "notif.completeBody": 'Session "{title}" finished',
    "notif.questionTitle": "Waiting for your answer",
    "notif.approvalTitle": "Permission request",
    "notif.pendingPrefix": 'Session "{title}"',
    "notif.approvalBody": 'Session "{title}" requests permission for "{tool}"',
    "notif.approvalChoices": "Choose Allow or Deny in the app",
    "notif.pendingSimple": '"{title}" has a question for you — click to open',
    "notif.approvalSimple": '"{title}" needs your permission — click to open',
    "notif.multiSelect": "(multiple selection allowed)",
    "notif.openHint": "Click to open the session",
    "notif.dismiss": "Dismiss notification",
    "settings.shortcutHints": "Show shortcut hints",
    "settings.shortcutHintsDesc": "Show shortcut hints under the floating list; hover and click the close button to hide them",
    "hints.dismiss": "Never show shortcut hints",
    "settings.hudDone": "Include completed-unread in floating status",
    "settings.hudDoneDesc": "When off, only running and attention appear",
    "settings.hudRecent": "Show recent normal sessions",
    "settings.hudRecentDesc": "Also list recently active normal sessions (may be idle)",
    "settings.hudRecentCount": "Recent normal session count",
    "settings.hudMaxSessions": "Maximum sessions in floating list",
    "settings.hudRecentExcludeAuto": "Exclude automation from recent sessions",
    "settings.hudRecentExcludeAutoDesc": "Only non-automation sessions count toward the recent list",
    "settings.hudCollapsed": "Start floating status collapsed",
    "settings.hudCollapsedDesc": "Show only the count pill on launch",
    "settings.hudPosition": "Floating status default position",
    "settings.pos.top": "Top right",
    "settings.pos.bottom": "Bottom right",
    "settings.pos.last": "Last position",
    "settings.boardEnabled": "Enable right-pane board tab",
    "settings.boardEnabledDesc": "Open the board in the right sidebar",
    "settings.boardThreshold": "Full-board width threshold (px)",
    "settings.boardView": "Default full-board view",
    "settings.projectColumns": "Project board · visible attributes",
    "settings.projectColumnsHint": "Choose which project attributes appear as columns; name and icon/color always show.",
    "settings.pc.total": "Sessions",
    "settings.pc.issues": "Open Issues",
    "settings.pc.prs": "Open PRs",
    "settings.pc.localVersion": "Local version",
    "settings.pc.latestVersion": "Latest release",
    "settings.pc.lastUpdated": "Last activity",
    "settings.githubTitle": "GitHub data source",
    "settings.githubDesc": 'Enter a token and map each project to a repo to show real Open Issue / Open PR / version data; unmapped projects still show a "—" placeholder.',
    "settings.githubToken": "GitHub Personal Access Token",
    "settings.githubTokenDesc": "Optional: public repos work without it; fill it for private repos or a higher rate limit. Used only to call api.github.com; the token stays on this machine, never syncs with the workspace and is never uploaded — clear it anytime.",
    "settings.githubTokenPlaceholderWarn": "This looks like a DSH secret reference ({{...}}), not a GitHub PAT. The GitHub API needs a real ghp_... token — paste the PAT directly.",
    "settings.githubTest": "Test connection",
    "settings.githubTesting": "Testing…",
    "settings.githubTestOk": "Connected, token valid",
    "settings.githubTestOkNoToken": "Connected (public repos need no token)",
    "settings.githubTestFail": "Connection failed",
    "settings.githubReposTitle": "Project repository mapping",
    "settings.githubReposHint": "For each project path, set the GitHub repo (owner/repo) and the local version; columns with owner and repo filled show real data, local version is filled separately.",
    "settings.githubPath": "Project path",
    "settings.githubOwner": "Owner",
    "settings.githubRepo": "Repo",
    "settings.githubLocalVersion": "Local version",
    "settings.githubAddRepo": "Add project",
    "settings.githubRemoveRepo": "Remove",
    "settings.githubPlaceholderRepo": "owner/repo",
    "settings.githubNone": "No project repo mapped yet",
    "settings.blur": "Search panel blur strength (px)",
    "settings.logging": "Logs & diagnostics",
    "settings.logEnabled": "Record logs",
    "settings.logEnabledDesc": "Keep a local record of plugin activity for troubleshooting",
    "settings.logLevel": "Level",
    "settings.logLevelError": "Errors only",
    "settings.logLevelWarn": "Errors and warnings",
    "settings.logLevelInfo": "Normal (recommended)",
    "settings.logLevelDebug": "Everything (for debugging)",
    "settings.logMax": "Keep at most",
    "settings.logHint": "{count} entries now. Logs stay in this browser and are never uploaded.",
    "settings.logCopy": "Copy logs",
    "settings.logClear": "Clear logs",
    "settings.logCopied": "Logs copied to the clipboard",
    "settings.logCopyFailed": "Copy failed; check clipboard permission",
    "settings.data": "Data",
    "settings.reset": "Restore defaults",
    "settings.resetAppearance": "Clear project appearance (color/icon)",
    "settings.resetAppearanceHint": "Restores default colors and icons immediately.",
    "settings.boardDisabled": "Project Board is disabled in settings",
    "preset.standard": "Standard mode",
    "preset.ptc": "PTC mode",
    "preset.minimal": "Minimal mode",
    "preset.cordis": "Creator mode",
    "preset.none": "Not set",
    "count.row": "{n} row",
    "count.rows": "{n} rows",
    "board.showMore": "Show more ({n} left)",
    "empty.filtered": "No matching rows",
    "open": "Open",
    "card.current": "Current",
    "card.open": "Open",
    "status.attention": "Attention",
    "status.approval": "Waiting approval",
    "status.plan": "Plan review",
    "status.question": "Waiting answer",
    "status.running": "Running",
    "status.done": "Completed",
    "status.idle": "Idle",
    "appearance.color": "Color",
    "appearance.icon": "Icon",
    "appearance.reset": "Reset to default",
    "empty.title": "No workspaces yet",
    "empty.desc": "Add a workspace and its sessions and projects appear here.",
    "loading": "Loading workspaces…",
    "session.untitled": "Untitled session",
    "workspace.default": "Default workspace",
    "time.now": "now",
    "time.min": "{n}min",
    "time.hour": "{n}h",
    "time.day": "{n}d",
    "time.year": "{n}y"
  };

  // src/i18n/zh.ts
  var zh = {
    "panel.label": "项目看板",
    "title": "项目看板",
    "panel.close": "返回对话",
    "subtitle": "会话与项目的数据表：可筛选、分组、按属性排序。",
    "stat.workspaces": "工作区",
    "stat.sessions": "会话",
    "stat.attention": "待处理",
    "stat.running": "运行中",
    "view.sessions": "会话",
    "view.projects": "项目",
    "filter.all": "全部",
    "filter.status": "状态",
    "filter.project": "项目",
    "filter.search": "搜索…",
    "group.byProject": "按项目分组",
    "sort.hint": "{shift}+点击列头可叠加排序",
    "col.title": "名称",
    "col.project": "项目",
    "col.status": "状态",
    "col.empty": "暂无会话",
    "col.preset": "模式",
    "col.updated": "最后活动",
    "col.appearance": "外观",
    "col.path": "路径",
    "col.na": "—",
    "col.naHint": "未配置数据源，到设置里填写该项目的 GitHub 仓库",
    "col.loading": "正在从 GitHub 获取…",
    "col.errRepoNotFound": "GitHub 仓库不存在，或为私有且未提供有效 token",
    "col.errTokenInvalid": "GitHub token 无效或已过期",
    "col.errRateLimited": "触发 GitHub API 速率限制，请稍后重试或配置 token",
    "col.errTimeout": "GitHub 请求超时，请检查网络后重试",
    "col.errGeneric": "获取 GitHub 数据失败（{code}）",
    "col.localBehind": "本地 {local}，落后于最新 {latest}",
    "col.hint.name": "项目名称、图标与颜色",
    "col.hint.total": "该项目下的会话总数",
    "col.hint.issues": "仓库当前未关闭的 issue 数量",
    "col.hint.prs": "仓库当前未合并的 PR 数量",
    "col.hint.localVersion": "本地的内部版本号",
    "col.hint.latestVersion": "GitHub 最新发布版本号",
    "col.hint.lastUpdated": "项目最近一次活动时间",
    "compact.allProjects": "全部项目",
    "status.archived": "已归档",
    "col.kind": "类型",
    "kind.auto": "自动化任务",
    "kind.normal": "普通会话",
    "filter.kind": "类型",
    "stat.auto": "自动化",
    "nav.switch": "切换会话",
    "nav.switchLabel": "会话",
    "nav.board": "看板",
    "nav.openBoard": "打开项目看板",
    "nav.more": "更多操作",
    "rightTab.title": "项目看板",
    "compact.full": "全屏打开",
    "palette.placeholder": "搜索会话、项目或设置…",
    "palette.allProjects": "全部项目",
    "palette.empty": "没有匹配的结果",
    "palette.hint": "↑↓ / {prev} / {next} 选择 · Enter 打开 · {palette}/Esc 关闭",
    "palette.group.hostSettings": "设置",
    "palette.group.pluginSettings": "项目看板设置",
    "palette.group.sessions": "会话",
    "palette.setting.open": "打开设置",
    "toast.settingsOpenFailed": "无法自动打开设置，请从左侧栏进入",
    "toast.settingsOpenPartial": "已打开设置页，但无法自动定位到该分区",
    "hud.title": "活跃与最近会话",
    "hud.running": "进行中",
    "hud.expand": "展开",
    "hud.collapse": "收起",
    "hud.prev": "上一个",
    "hud.next": "下一个",
    "hud.recent": "最近",
    "hud.groupSession": "会话",
    "hud.groupMessage": "指令",
    "hud.prevInstruction": "上一条",
    "hud.nextInstruction": "下一条",
    "hud.toBottom": "到底部",
    "hud.auto": "自动化",
    "hud.archive": "归档会话",
    "hud.archiveUnavailable": "当前 DSH 客户端没有提供归档接口，请在会话操作弹窗里归档。",
    "palette.archived": "已归档",
    "settings.paletteArchived": "搜索时包含已归档会话",
    "settings.paletteArchivedDesc": "默认包含；关掉后搜索列表只显示未归档会话",
    "settings.title": "项目看板设置",
    "settings.intro": "自定义项目看板的快捷键、悬浮窗与视图行为。",
    "settings.shortcuts": "快捷键",
    "settings.shortcut.palette": "打开会话搜索",
    "settings.shortcut.prev": "上一个会话",
    "settings.shortcut.next": "下一个会话",
    "settings.shortcut.userPrev": "上一条用户指令（轻按跳转，按住连续向上滚动）",
    "settings.shortcut.userNext": "下一条用户指令（轻按跳转，按住连续向下滚动）",
    "settings.shortcut.scrollBottom": "滚动到底部并激活输入框",
    "settings.shortcut.sidebarBoard": "打开/关闭窄版项目看板（沿用上次宽度）",
    "settings.shortcut.leftSidebar": "展开/收起原生左侧会话栏",
    "settings.shortcut.panelHalf": "打开/关闭中等宽度项目看板（右侧栏 50%）",
    "settings.shortcut.panelFull": "切换项目看板全屏（右侧栏全屏）",
    "settings.shortcut.rename": "重命名当前会话",
    "settings.shortcut.interject": "插话发送最早排队的消息",
    "settings.shortcut.hud": "收起/展开悬浮列表",
    "settings.shortcut.sessionMenu": "打开会话操作对话框（归档 / 停止运行 / 删除）",
    "rename.title": "重命名会话",
    "rename.label": "会话名称",
    "rename.placeholder": "输入新的会话名称",
    "rename.cancel": "取消",
    "rename.confirm": "保存",
    "rename.saving": "保存中…",
    "rename.failed": "重命名失败",
    "toast.conflictTitle": "快捷键冲突",
    "toast.conflictOwn": "「{combo}」已被本插件的「{name}」占用。",
    "toast.conflictBuiltin": "「{combo}」已被 DSH 内置命令「{name}」占用。",
    "toast.conflictExisting": "当前快捷键 {combo} 与内置命令「{name}」冲突，建议改键。",
    "toast.conflictExistingMany": "有 {n} 个快捷键与内置命令冲突，请到设置中改键。",
    "toast.dismiss": "关闭通知",
    "toast.interjectNone": "当前没有可插话的排队消息（仅运行中可用）。",
    "toast.archived": "会话已归档",
    "menu.title": "管理当前会话",
    "menu.deleteConfirm": "再次点击确认删除",
    "menu.cancel": "取消",
    "menu.sessionLabel": "当前会话",
    "menu.subtitle": "选择要对这个会话执行的操作",
    "menu.stopTitle": "停止运行",
    "menu.stopHint": "停止当前运行中的回合，排队的消息会保留。",
    "menu.stopUnavailable": "当前 DSH 客户端未开放停止接口。",
    "menu.archiveTitle": "归档会话",
    "menu.archiveDesc": "从活跃与最近列表里隐藏；聊天记录完整保留，之后还能找回来。",
    "menu.deleteTitle": "删除会话",
    "menu.deleteDesc": "永久删除这个会话及其记录，无法恢复。",
    "menu.deleteUnsupportedDesc": "当前客户端还没有开放删除接口，只能先归档。",
    "menu.confirmDesc": "再点一次确认删除，这一步不可撤销。",
    "menu.footerHint": "按 Esc 或点「取消」关闭",
    "menu.deleteUnavailable": "当前 DSH 客户端未开放会话删除接口，请使用归档。",
    "menu.failed": "操作失败：{message}",
    "menu.busy": "处理中…",
    "settings.selfConflict": "{combo} 同时绑定给了 {names}，请重新录制其中一个。",
    "settings.shortcut.hint": "点击键帽后按下新的组合键；必须包含 {ctrl} / {alt} / {meta}，Esc 取消。与 DSH 内置命令冲突时会拒绝录制并弹出提示。",
    "settings.shortcutNeedModifier": "快捷键必须包含 {ctrl} / {alt} / {meta}，不能使用裸键。",
    "settings.shortcutResetHint": "点击录制，双击恢复默认",
    "settings.recording": "按下按键…",
    "settings.behavior": "界面与行为",
    "settings.paletteEnabled": "启用命令面板",
    "settings.paletteEnabledDesc": "搜索面板与快捷键",
    "settings.headerButtons": "顶部功能按钮",
    "settings.headerPlacement": "按钮显示位置",
    "settings.placement.header": "顶部标题栏",
    "settings.placement.composer": "输入框下方状态信息下方",
    "settings.headerButtonsHint": "按住 {ctrl} + 鼠标左键拖动按钮，可在左侧与右侧之间移动；每个按钮也可以单独隐藏。右侧停靠需要打开一个会话。",
    "settings.composerButtonsHint": "当前统一显示在输入框下方，按钮按固定顺序排列；每个按钮仍可单独隐藏。",
    "settings.hb.switch": "会话搜索",
    "settings.hb.historyNav": "历史指令与底部",
    "settings.hb.capsule": "状态胶囊",
    "settings.hb.sideLeft": "左侧",
    "settings.hb.sideRight": "右侧",
    "settings.hb.followPlacement": "跟随统一位置",
    "settings.hudEnabled": "启用悬浮窗",
    "settings.hudEnabledDesc": "实时显示非空闲会话与计时",
    "settings.notifyEnabled": "启用任务通知",
    "settings.notifyEnabledDesc": "会话完成、模型提问或权限请求时提醒",
    "settings.notifySound": "通知提示音",
    "settings.notifySoundDesc": "应用内通知播放提示音",
    "settings.chatAutoHistory": "滚动到顶自动加载历史",
    "settings.chatAutoHistoryDesc": "会话滚动到顶部时，自动加载更早的消息（等同点击「加载更早」）",
    "notif.failTitle": "任务失败",
    "notif.failBodyReason": "会话「{title}」本轮运行失败：{reason}",
    "notif.completeTitle": "任务完成",
    "notif.completeBody": "会话「{title}」已完成",
    "notif.questionTitle": "等待回答",
    "notif.approvalTitle": "权限请求",
    "notif.pendingPrefix": "会话「{title}」",
    "notif.approvalBody": "会话「{title}」请求使用「{tool}」权限",
    "notif.approvalChoices": "请在应用内选择：允许 / 拒绝",
    "notif.pendingSimple": "「{title}」有问题需要你回答，点击打开即可",
    "notif.approvalSimple": "「{title}」有权限请求需要你确认，点击打开即可",
    "notif.multiSelect": "（可多选）",
    "notif.openHint": "点击打开会话",
    "notif.dismiss": "关闭通知",
    "settings.shortcutHints": "显示快捷键提示",
    "settings.shortcutHintsDesc": "在悬浮列表下方显示快捷键提示，鼠标悬停时点关闭即可收起",
    "hints.dismiss": "不再显示快捷键提示",
    "settings.hudDone": "悬浮窗包含已完成未读",
    "settings.hudDoneDesc": "关闭后悬浮窗只显示运行中和待处理",
    "settings.hudRecent": "悬浮窗显示最近普通会话",
    "settings.hudRecentDesc": "额外列出最近活跃的普通会话（可包含空闲）",
    "settings.hudRecentCount": "最近普通会话数量",
    "settings.hudMaxSessions": "悬浮列表最多显示会话数",
    "settings.hudRecentExcludeAuto": "最近会话排除自动化任务",
    "settings.hudRecentExcludeAutoDesc": "只把非自动化的普通会话计入最近列表",
    "settings.hudCollapsed": "悬浮窗默认收起",
    "settings.hudCollapsedDesc": "打开应用时只显示数量小胶囊",
    "settings.hudPosition": "悬浮窗默认位置",
    "settings.pos.top": "右上角",
    "settings.pos.bottom": "右下角",
    "settings.pos.last": "上次位置",
    "settings.boardEnabled": "启用右侧看板页签",
    "settings.boardEnabledDesc": "在右侧栏打开「项目看板」",
    "settings.boardThreshold": "完整看板宽度阈值（px）",
    "settings.boardView": "完整看板默认视图",
    "settings.projectColumns": "项目看板 · 显示哪些项目属性",
    "settings.projectColumnsHint": "勾选要在项目表格里显示的项目属性；名称和图标/颜色始终显示。",
    "settings.pc.total": "会话总数",
    "settings.pc.issues": "未关闭问题",
    "settings.pc.prs": "未合并 PR",
    "settings.pc.localVersion": "本地内部版本",
    "settings.pc.latestVersion": "最新上线版本",
    "settings.pc.lastUpdated": "最近活动时间",
    "settings.githubTitle": "GitHub 数据源",
    "settings.githubDesc": "填入 token 并为每个项目配置仓库，就能在看板显示真实的 Open Issue / Open PR / 版本数据；未配置的项目仍显示「—」占位。",
    "settings.githubToken": "GitHub Personal Access Token",
    "settings.githubTokenDesc": "可选：公开仓库可不填；私有仓库或需要更高速率限制时填写。仅用于调用 api.github.com；token 只保存在本机，不随工作区同步，也不会上传，随时可清除。",
    "settings.githubTokenPlaceholderWarn": "当前值看起来是 DSH 密钥引用（{{...}}），不是 GitHub PAT。GitHub API 需要真实的 ghp_... 格式 token，请直接粘贴 PAT。",
    "settings.githubTest": "测试连接",
    "settings.githubTesting": "测试中…",
    "settings.githubTestOk": "连接成功，token 有效",
    "settings.githubTestOkNoToken": "连接成功（公开仓库无需 token）",
    "settings.githubTestFail": "连接失败",
    "settings.githubReposTitle": "项目仓库映射",
    "settings.githubReposHint": "按项目路径为每个项目指定 GitHub 仓库（owner/repo）与本地版本；填了 owner 和 repo 的列会显示真实数据，本地版本单独填写。",
    "settings.githubPath": "项目路径",
    "settings.githubOwner": "拥有者",
    "settings.githubRepo": "仓库名",
    "settings.githubLocalVersion": "本地版本",
    "settings.githubAddRepo": "添加项目",
    "settings.githubRemoveRepo": "移除",
    "settings.githubPlaceholderRepo": "owner/repo",
    "settings.githubNone": "尚未配置任何项目仓库",
    "settings.blur": "搜索面板模糊强度（px）",
    "settings.logging": "日志与排查",
    "settings.logEnabled": "记录日志",
    "settings.logEnabledDesc": "把插件运行情况记在本机，出问题时方便查看",
    "settings.logLevel": "记录级别",
    "settings.logLevelError": "只记错误",
    "settings.logLevelWarn": "错误和警告",
    "settings.logLevelInfo": "常规信息（推荐）",
    "settings.logLevelDebug": "全部细节（排查时用）",
    "settings.logMax": "最多保留条数",
    "settings.logHint": "当前 {count} 条。日志只存在本机浏览器里，不会上传。",
    "settings.logCopy": "复制日志",
    "settings.logClear": "清空日志",
    "settings.logCopied": "日志已复制到剪贴板",
    "settings.logCopyFailed": "复制失败，请检查剪贴板权限",
    "settings.data": "数据",
    "settings.reset": "恢复默认设置",
    "settings.resetAppearance": "清除项目外观（颜色/图标）",
    "settings.resetAppearanceHint": "清除后立即恢复默认颜色与图标。",
    "settings.boardDisabled": "项目看板已在设置中关闭",
    "preset.standard": "标准模式",
    "preset.ptc": "PTC 模式",
    "preset.minimal": "极简模式",
    "preset.cordis": "创造模式",
    "preset.none": "未设置",
    "count.row": "共 {n} 条",
    "count.rows": "共 {n} 条",
    "board.showMore": "显示更多（还有 {n} 条）",
    "empty.filtered": "没有符合条件的条目",
    "open": "打开",
    "card.current": "当前",
    "card.open": "打开",
    "status.attention": "待处理",
    "status.approval": "等待批准",
    "status.plan": "等待计划确认",
    "status.question": "等待回答",
    "status.running": "运行中",
    "status.done": "已完成",
    "status.idle": "空闲",
    "appearance.color": "颜色",
    "appearance.icon": "图标",
    "appearance.reset": "恢复默认",
    "empty.title": "还没有工作区",
    "empty.desc": "添加一个工作区后，这里会显示它的会话与项目。",
    "loading": "正在读取工作区…",
    "session.untitled": "未命名会话",
    "workspace.default": "默认工作区",
    "time.now": "刚刚",
    "time.min": "{n}分钟",
    "time.hour": "{n}小时",
    "time.day": "{n}天",
    "time.year": "{n}年"
  };

  // src/runtime.ts
  var h;
  var useState;
  var useEffect;
  var useMemo;
  var useRef;
  var useLayoutEffectSafe;
  function bindReact(react) {
    if (!react || typeof react.createElement !== "function") throw new Error("dsh-tac: the host did not provide React");
    h = react.createElement;
    useState = react.useState;
    useEffect = react.useEffect;
    useMemo = react.useMemo;
    useRef = react.useRef;
    useLayoutEffectSafe = typeof react.useLayoutEffect === "function" ? react.useLayoutEffect : react.useEffect;
  }

  // src/ui/appearance.ts
  function loadAppearance() {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }
  function saveAppearance(value) {
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify(value));
    } catch (error) {
    }
  }
  var PALETTE = ["#e5484d", "#f76b15", "#f5b301", "#30a46c", "#0ea5e9", "#3e63dd", "#8e4ec6", "#e93d82", "#6e7781"];
  var ICONS = ["folder", "code", "briefcase", "pen", "flask", "star", "bolt", "book", "globe", "grid"];
  var hudMeasureCanvas = null;
  function measureTextWidth(text, font) {
    try {
      if (!hudMeasureCanvas) hudMeasureCanvas = document.createElement("canvas");
      const ctx = hudMeasureCanvas.getContext("2d");
      if (!ctx) return String(text || "").length * 7;
      if (font) ctx.font = font;
      return ctx.measureText(String(text || "")).width;
    } catch (error) {
      return String(text || "").length * 7;
    }
  }
  function hashString(value) {
    let hash = 0;
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) hash = hash * 31 + text.charCodeAt(i) >>> 0;
    return hash;
  }
  function paletteFor(id) {
    return PALETTE[hashString(id) % PALETTE.length];
  }
  function hexToRgba(hex, alpha) {
    const value = String(hex).replace("#", "");
    const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return "rgba(110,119,129," + alpha + ")";
    return "rgba(" + (num >> 16 & 255) + "," + (num >> 8 & 255) + "," + (num & 255) + "," + alpha + ")";
  }

  // src/ui/icon-data.ts
  var PATHS = {
    chevron: ["M9 6l6 6-6 6"],
    board: ["M4 5h6v14H4z", "M14 5h6v8h-6z", "M14 17h6v2h-6z"],
    folder: ["M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h7A1.5 1.5 0 0 1 19 9.5v8A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5z"],
    code: ["M8.5 9L5.5 12l3 3", "M15.5 9l3 3-3 3", "M13 6l-2 12"],
    briefcase: ["M4 8h16v11H4z", "M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8"],
    pen: ["M4 20l4-1 10-10-3-3L5 16z", "M14 6l3 3"],
    flask: ["M9.5 3h5", "M10.5 3v6l-5 9a1 1 0 0 0 .9 1.5h12.2A1 1 0 0 0 19 18l-5-9V3"],
    star: ["M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 17l-5.2 2.6 1-5.8L3.5 9.7l5.9-.9z"],
    bolt: ["M13 2L4 14h7l-1 8 9-12h-7z"],
    book: ["M5 4h9a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z", "M8 4v16"],
    globe: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M3.5 9h17", "M3.5 15h17", "M12 3a14 14 0 0 1 0 18", "M12 3a14 14 0 0 0 0 18"],
    grid: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
    palette: ["M12 21a9 9 0 1 1 0-18c5 0 9 3.6 9 8 0 2.2-1.8 3.5-4 3.5h-1.6a1.7 1.7 0 0 0-1.2 2.9c.5.6.3 1.6-.7 1.6z", "M7.5 10.5h.01", "M11 8h.01", "M15 9h.01"],
    check: ["M5 12l4 4 10-10"],
    arrow: ["M5 12h14", "M13 6l6 6-6 6"],
    clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z", "M12 7v5l3 2"],
    search: ["M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z", "M21 21l-4.3-4.3"],
    expand: ["M4 9V4h5", "M20 15v5h-5", "M15 4h5v5", "M9 20H4v-5"],
    collapse: ["M9 4v5H4", "M15 20v-5h5", "M20 9h-5V4", "M4 15h5v5"],
    alert: ["M12 4l9 16H3z", "M12 10v4", "M12 17h.01"],
    close: ["M6 6l12 12", "M18 6L6 18"],
    up: ["M6 15l6-6 6 6"],
    down: ["M6 9l6 6 6-6"],
    bottom: ["M12 4v12", "M7 11l5 5 5-5", "M5 20h14"],
    left: ["M19 12H5", "M11 6l-6 6 6 6"],
    archive: ["M12 4.5v7.5", "M8.4 9L12 12.6 15.6 9", "M4.5 13v4.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V13"]
  };
  var NATIVE_ICONS = {
    sliders: {
      viewBox: "0 0 16 16",
      strokeWidth: 1.2,
      paths: ["M2.3 5h5.85M12.05 5h1.65", "M2.3 11h1.65M7.85 11h5.85"]
    },
    archive: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z",
        "M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5",
        "M6.5 9.5H9.5"
      ]
    },
    search: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M6.58727 11.8586C9.55061 11.8586 11.9529 9.45637 11.9529 6.49304C11.9529 3.5297 9.55061 1.12744 6.58727 1.12744C3.62394 1.12744 1.22168 3.5297 1.22168 6.49304C1.22168 9.45637 3.62394 11.8586 6.58727 11.8586Z",
        "M10.2991 10.3933L14.7783 14.8725"
      ]
    },
    close: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M2.5 2.5L13.5 13.5",
        "M13.5 2.5L2.5 13.5"
      ]
    },
    up: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M12 10L8.70711 6.70711C8.31658 6.31658 7.68342 6.31658 7.29289 6.70711L4 10"
      ]
    },
    down: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6"
      ]
    },
    left: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M10 4L6.70711 7.29289C6.31658 7.68342 6.31658 8.31658 6.70711 8.70711L10 12"
      ]
    },
    arrow: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M6 12L9.29289 8.70711C9.68342 8.31658 9.68342 7.68342 9.29289 7.29289L6 4"
      ]
    },
    chevron: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M4 6L7.29289 9.29289C7.68342 9.68342 8.31658 9.68342 8.70711 9.29289L12 6"
      ]
    },
    clock: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M8 14C11.3137 14 14 11.3137 14 8C14 4.68629 11.3137 2 8 2C4.68629 2 2 4.68629 2 8C2 11.3137 4.68629 14 8 14Z",
        "M8 4.31V8.46L11 10.08"
      ]
    },
    check: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M2.25 8.5L5.49732 11.7473C5.90519 12.1552 6.57263 12.1344 6.95426 11.7018L13.75 4"
      ]
    },
    alert: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M6.87 2.6a1.33 1.33 0 0 1 2.26 0l5.34 9.33A1.33 1.33 0 0 1 13.33 14H2.67a1.33 1.33 0 0 1-1.14-2.07Z",
        "M8 6v3m0 2.33h.01"
      ]
    },
    bottom: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M8 1.95317V10.0469",
        "M4.25 6.29688L8 10.0469L11.75 6.29688",
        "M1.5 10.0469V13.158C1.5 13.3937 1.60536 13.6198 1.79289 13.7865C1.98043 13.9532 2.23478 14.0469 2.5 14.0469H13.5C13.7652 14.0469 14.0196 13.9532 14.2071 13.7865C14.3946 13.6198 14.5 13.3937 14.5 13.158V10.0469"
      ]
    },
    grid: {
      viewBox: "0 0 16 16",
      strokeWidth: 1,
      paths: [
        "M6 3.5h7.5M6 8h7.5M6 12.5h7.5",
        "M2.6 3.5h.01M2.6 8h.01M2.6 12.5h.01"
      ]
    }
  };

  // src/ui/icons.ts
  function Icon(props) {
    const name = props.name || "folder";
    const native = NATIVE_ICONS[name];
    const size = props.size || 16;
    const strokeWidth = props.strokeWidth || (native ? native.strokeWidth : 1.7);
    const paths = native ? native.paths : PATHS[name] || PATHS.folder;
    const cap = native ? "butt" : "round";
    const join = native ? "miter" : "round";
    return h(
      "svg",
      {
        width: size,
        height: size,
        viewBox: native ? native.viewBox : "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth,
        strokeLinecap: cap,
        strokeLinejoin: join,
        "aria-hidden": "true",
        focusable: "false"
      },
      paths.map((d, i) => h("path", { key: i, d }))
    );
  }
  function RunRing(props) {
    const size = props.size || 9;
    return h("span", {
      className: "pbx-runRing" + (props.className ? " " + props.className : ""),
      style: { width: size + "px", height: size + "px" },
      "aria-hidden": "true"
    });
  }

  // src/features/format.ts
  function workspaceLabel(title, t) {
    if (!title || title === "default-workspace") return t("workspace.default");
    return title;
  }
  function sessionTitleOf(summary, t) {
    const title = summary && typeof summary.title === "string" ? summary.title.trim() : "";
    return title || t("session.untitled");
  }
  function statusInfo(status, summary) {
    const kind = status && status.pendingInteraction ? status.pendingInteraction.kind : void 0;
    if (kind === "approval") return { tone: "attention", labelKey: "status.approval", rank: 4 };
    if (kind === "plan-review") return { tone: "attention", labelKey: "status.plan", rank: 4 };
    if (kind === "question") return { tone: "attention", labelKey: "status.question", rank: 4 };
    const running = status ? status.running : void 0;
    if (running === void 0 ? summary && summary.running : running) return { tone: "running", labelKey: "status.running", rank: 3 };
    if (status && status.completionUnread) return { tone: "done", labelKey: "status.done", rank: 2 };
    return { tone: "idle", labelKey: "status.idle", rank: 1 };
  }
  function relTime(updatedAt, t) {
    if (!updatedAt) return "—";
    const diff = Math.max(0, Date.now() - updatedAt);
    const minutes = Math.floor(diff / 6e4);
    if (minutes < 1) return t("time.now");
    if (minutes < 60) return t("time.min", { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hour", { n: hours });
    const days = Math.floor(hours / 24);
    if (days < 365) return t("time.day", { n: days });
    return t("time.year", { n: Math.floor(days / 365) });
  }
  var PROJECT_COLUMNS = [
    { key: "total", labelKey: "settings.pc.total", type: "#", hintKey: "col.hint.total" },
    { key: "issues", labelKey: "settings.pc.issues", type: "#", hintKey: "col.hint.issues" },
    { key: "prs", labelKey: "settings.pc.prs", type: "#", hintKey: "col.hint.prs" },
    { key: "localVersion", labelKey: "settings.pc.localVersion", type: "#", hintKey: "col.hint.localVersion" },
    { key: "latestVersion", labelKey: "settings.pc.latestVersion", type: "#", hintKey: "col.hint.latestVersion" },
    { key: "lastUpdated", labelKey: "settings.pc.lastUpdated", type: "◷", hintKey: "col.hint.lastUpdated" }
  ];
  function compareVersions(a, b) {
    const aParts = parseVersion(a);
    const bParts = parseVersion(b);
    if (aParts === null && bParts === null) return 0;
    if (aParts === null) return 1;
    if (bParts === null) return -1;
    const len = Math.max(aParts.length, bParts.length);
    for (let i = 0; i < len; i += 1) {
      const x = aParts[i] || 0;
      const y = bParts[i] || 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }
  function parseVersion(value) {
    if (!value) return null;
    const match = /^[vV]?(\d+(?:\.\d+)*)/.exec(value.trim());
    if (!match) return null;
    return match[1].split(".").map((part) => Number(part) || 0);
  }
  var SORT_DIR_DEFAULT = {
    title: "asc",
    project: "asc",
    status: "desc",
    kind: "asc",
    running: "desc",
    current: "desc",
    preset: "asc",
    updatedAt: "desc",
    name: "asc",
    appearance: "asc",
    total: "desc",
    issues: "desc",
    prs: "desc",
    localVersion: "desc",
    latestVersion: "desc",
    lastUpdated: "desc"
  };

  // src/core/github.ts
  var REQUEST_TIMEOUT_MS = 8e3;
  function stripV(tag) {
    return tag.replace(/^v(?=\d)/, "");
  }
  function countFromLink(link) {
    if (!link) return 0;
    const match = /page=(\d+)>;\s*rel="last"/.exec(link);
    return match ? Number(match[1]) || 0 : 0;
  }
  function errorFor(status) {
    let message = `HTTP ${status}`;
    if (status === 404) message = "repo-not-found";
    else if (status === 401) message = "token-invalid";
    else if (status === 403 || status === 429) message = "rate-limited";
    return { status: "error", error: message };
  }
  function normalizeVersion(tag) {
    if (!tag) return void 0;
    return stripV(tag);
  }
  async function fetchRepoStats(owner, repo, token, fetchImpl = fetch) {
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = `Bearer ${token.trim()}`;
    const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller && typeof window !== "undefined" ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : 0;
    const init = controller ? { headers, signal: controller.signal } : { headers };
    try {
      const [repoRes, pullsRes, releaseRes] = await Promise.all([
        fetchImpl(base, init),
        fetchImpl(`${base}/pulls?state=open&per_page=1`, init),
        fetchImpl(`${base}/releases/latest`, init)
      ]);
      if (!repoRes.ok) {
        pullsRes.json().catch(() => void 0);
        releaseRes.json().catch(() => void 0);
        return errorFor(repoRes.status);
      }
      if (!pullsRes.ok) {
        repoRes.json().catch(() => void 0);
        releaseRes.json().catch(() => void 0);
        return errorFor(pullsRes.status);
      }
      const repoData = await repoRes.json();
      let prs = 0;
      const lastPage = countFromLink(pullsRes.headers ? pullsRes.headers.get("link") : null);
      if (lastPage > 0) {
        prs = lastPage;
      } else {
        const pulls = await pullsRes.json();
        prs = Array.isArray(pulls) ? pulls.length : 0;
      }
      let latestVersion;
      if (releaseRes.ok) {
        const release = await releaseRes.json();
        latestVersion = normalizeVersion(release.tag_name);
      }
      const issues = Math.max(0, (repoData.open_issues_count ?? 0) - prs);
      return { status: "ok", issues, prs, latestVersion };
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const message = error instanceof Error ? error.message : String(error || "");
      if (/abort/i.test(name) || /abort/i.test(message)) return { status: "error", error: "timeout" };
      return { status: "error", error: message || "network" };
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  // src/features/board.ts
  var BUILTIN_PRESET_COPY = {
    standard: "preset.standard",
    ptc: "preset.ptc",
    minimal: "preset.minimal",
    cordis: "preset.cordis"
  };
  function versionSortKey(value) {
    const parts = parseVersion(value);
    if (!parts) return -1;
    let key = 0;
    for (let i = 0; i < 6; i += 1) key = key * 1e3 + (parts[i] || 0);
    return key;
  }
  var NO_AUTO2 = /* @__PURE__ */ new Set();
  var EMPTY_REPOS = {};
  function ProjectBoard(props) {
    const { useWorkspaces, useSessions, useSessionStatus, openSession, t } = props;
    const useScheduleCatalog = typeof props.useScheduleCatalog === "function" ? props.useScheduleCatalog : fallbackHook();
    const usePresets = typeof props.usePresets === "function" ? props.usePresets : fallbackHook();
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const wsSnap = useWorkspaces((snapshot) => snapshot);
    const list = useSessions((snapshot) => snapshot);
    const statuses = useSessionStatus((snapshot) => snapshot);
    const scheduleSnap = useScheduleCatalog((snapshot) => snapshot);
    const presetSnap = usePresets((snapshot) => snapshot);
    const presetNames = presetSnap && presetSnap.names || {};
    const presetText = (preset) => {
      if (!preset) return t("preset.none");
      if (presetNames[preset]) return presetNames[preset];
      return BUILTIN_PRESET_COPY[preset] ? t(BUILTIN_PRESET_COPY[preset]) : preset;
    };
    const autoSet = scheduleSnap && scheduleSnap.activeSessionIds || NO_AUTO2;
    const compact = props.compact === true;
    const openFullBoard = props.openFullBoard;
    const [appearance, setAppearance] = useState(() => loadAppearance());
    useEffect(() => {
      const handler = () => setAppearance(loadAppearance());
      window.addEventListener("pbx-appearance-reset", handler);
      return () => window.removeEventListener("pbx-appearance-reset", handler);
    }, []);
    const [editingProject, setEditingProject] = useState(null);
    const [expandedProject, setExpandedProject] = useState(null);
    const popRef = useRef(null);
    const [view, setView] = useState(() => {
      const store = props.viewRequestStore;
      if (store) {
        const snap = store.getSnapshot();
        if (snap.view === "sessions" || snap.view === "projects") return snap.view;
      }
      return config.board.defaultView === "projects" ? "projects" : "sessions";
    });
    const applyView = (next) => {
      setView(next);
      const store = props.viewRequestStore;
      if (store && store.getSnapshot().view !== next) {
        store.set({ seq: store.getSnapshot().seq + 1, view: next });
      }
    };
    const [viewReqSeq, setViewReqSeq] = useState(0);
    useEffect(() => {
      const store = props.viewRequestStore;
      if (!store) return void 0;
      setViewReqSeq(store.getSnapshot().seq);
      return store.subscribe(() => setViewReqSeq(store.getSnapshot().seq));
    }, [props.viewRequestStore]);
    useEffect(() => {
      if (viewReqSeq > 0 && props.viewRequestStore) {
        setView(props.viewRequestStore.getSnapshot().view);
      }
    }, [viewReqSeq]);
    const [sessionSorts, setSessionSorts] = useState([{ key: "updatedAt", dir: "desc" }]);
    const [projectSorts, setProjectSorts] = useState([{ key: "lastUpdated", dir: "desc" }]);
    const sorts = view === "sessions" ? sessionSorts : projectSorts;
    const [statusFilter, setStatusFilter] = useState("all");
    const [kindFilter, setKindFilter] = useState("all");
    const [projectFilter, setProjectFilter] = useState("all");
    const [query, setQuery] = useState("");
    const [grouped, setGrouped] = useState(false);
    const [collapsed, setCollapsed] = useState({});
    const [compactProjectId, setCompactProjectId] = useState(null);
    const [popoverPos, setPopoverPos] = useState(null);
    const githubRepos = config.githubRepos || EMPTY_REPOS;
    const repoFingerprint = Object.keys(githubRepos).map((path) => `${path}\0${githubRepos[path] ? githubRepos[path].owner || "" : ""}\0${githubRepos[path] ? githubRepos[path].repo || "" : ""}`).sort().join("\n");
    const [repoStats, setRepoStats] = useState({});
    const SESSION_RENDER_BATCH = 200;
    const [sessionLimit, setSessionLimit] = useState(SESSION_RENDER_BATCH);
    useEffect(() => {
      let cancelled = false;
      const targets = Object.keys(githubRepos).filter((path) => {
        const cfg = githubRepos[path];
        return cfg && cfg.owner && cfg.repo;
      });
      if (targets.length === 0) {
        setRepoStats({});
        return void 0;
      }
      const loading = {};
      for (const path of targets) loading[path] = { status: "loading" };
      setRepoStats(loading);
      for (const path of targets) {
        const cfg = githubRepos[path];
        fetchRepoStats(cfg.owner, cfg.repo, config.githubToken).then((stats) => {
          if (cancelled) return;
          setRepoStats((prev) => ({ ...prev, [path]: stats }));
        });
      }
      return () => {
        cancelled = true;
      };
    }, [repoFingerprint, config.githubToken]);
    useEffect(() => {
      if (editingProject === null) return void 0;
      const onDown = (event) => {
        if (popRef.current && !popRef.current.contains(event.target)) setEditingProject(null);
      };
      const onScroll = () => setEditingProject(null);
      document.addEventListener("pointerdown", onDown, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onScroll);
      return () => {
        document.removeEventListener("pointerdown", onDown, true);
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onScroll);
      };
    }, [editingProject]);
    const updateAppearance = (id, patch) => {
      setAppearance((prev) => {
        const next = Object.assign({}, prev);
        next[id] = Object.assign({}, prev[id] || {}, patch);
        saveAppearance(next);
        return next;
      });
    };
    const resetAppearance = (id) => {
      setAppearance((prev) => {
        const next = Object.assign({}, prev);
        delete next[id];
        saveAppearance(next);
        return next;
      });
    };
    const specOf = (workspaceId) => {
      const spec = appearance[workspaceId] || {};
      return { color: spec.color || paletteFor(workspaceId), icon: spec.icon || "folder" };
    };
    const workspaces = wsSnap && wsSnap.items || [];
    const archived = useMemo(() => new Set(wsSnap && wsSnap.archivedSessionIds || []), [wsSnap]);
    const byId = list && list.byId || {};
    const ids = list && list.ids || [];
    const ready = Boolean(list && list.phase === "ready");
    const currentId = useMemo(() => {
      for (const id of ids) {
        const row = byId[id];
        if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return id;
      }
      return void 0;
    }, [ids, byId]);
    const allSessions = useMemo(() => {
      const out = [];
      for (const workspace of workspaces) {
        for (const sessionId of workspace.sessionIds || []) {
          const summary = byId[sessionId];
          if (!summary || summary.origin === "subagent" || summary.blank) continue;
          if (archived.has(sessionId)) continue;
          const status = statuses ? statuses.get(sessionId) : void 0;
          const info = statusInfo(status, summary);
          out.push({
            id: sessionId,
            title: sessionTitleOf(summary, t),
            workspaceId: workspace.workspaceId,
            workspaceLabel: workspaceLabel(workspace.title, t),
            workspacePath: workspace.path || "",
            info,
            updatedAt: summary.updatedAt || 0,
            running: info.tone === "running",
            current: sessionId === currentId,
            preset: summary.projectionValues && typeof summary.projectionValues.agentPreset === "string" ? summary.projectionValues.agentPreset : "",
            auto: autoSet.has(sessionId)
          });
        }
      }
      return out;
    }, [workspaces, byId, archived, statuses, currentId, t, autoSet]);
    const projectModels = useMemo(() => {
      return workspaces.map((workspace) => {
        const rows = allSessions.filter((s) => s.workspaceId === workspace.workspaceId);
        const counts = { total: rows.length, running: 0, attention: 0, done: 0, idle: 0, auto: 0 };
        const presets = /* @__PURE__ */ new Set();
        let last = 0;
        let hasCurrent = false;
        for (const row of rows) {
          if (counts[row.info.tone] !== void 0) counts[row.info.tone] += 1;
          if (row.auto) counts.auto += 1;
          if (row.preset) presets.add(row.preset);
          if (row.current) hasCurrent = true;
          last = Math.max(last, row.updatedAt);
        }
        if (!last) last = Date.parse(workspace.updatedAt || "") || 0;
        const pathKey = workspace.path || "";
        const repoSetting = githubRepos[pathKey];
        const stats = repoSetting ? repoStats[pathKey] : void 0;
        const seam = workspace;
        const issues = stats?.status === "ok" ? stats.issues : typeof seam.openIssues === "number" ? seam.openIssues : void 0;
        const prs = stats?.status === "ok" ? stats.prs : typeof seam.openPRs === "number" ? seam.openPRs : void 0;
        const latestVersion = stats?.status === "ok" ? stats.latestVersion : seam.latestVersion;
        const localVersion = repoSetting?.localVersion || seam.localVersion;
        const model = {
          workspaceId: workspace.workspaceId,
          name: workspaceLabel(workspace.title, t),
          path: workspace.path || "",
          counts,
          presets,
          hasCurrent,
          lastUpdated: last,
          issues,
          prs,
          localVersion,
          latestVersion,
          repo: repoSetting,
          repoStats: stats
        };
        return model;
      });
    }, [workspaces, allSessions, t, githubRepos, repoStats]);
    const compactStatusRank = (row) => row.archived ? 9 : row.info.tone === "running" ? 0 : row.info.tone === "attention" ? 1 : row.info.tone === "done" ? 2 : 3;
    const compactSessionsOf = (workspaceId) => {
      const workspace = workspaces.find((item) => item.workspaceId === workspaceId);
      if (!workspace) return [];
      const rows = [];
      for (const sessionId of workspace.sessionIds || []) {
        const summary = byId[sessionId];
        if (!summary || summary.origin === "subagent" || summary.blank) continue;
        const isArchived = archived.has(sessionId);
        const info = isArchived ? { tone: "idle", labelKey: "status.archived", rank: 9 } : statusInfo(statuses ? statuses.get(sessionId) : void 0, summary);
        rows.push({
          id: sessionId,
          title: sessionTitleOf(summary, t),
          info,
          archived: isArchived,
          auto: autoSet.has(sessionId),
          updatedAt: summary.updatedAt || 0
        });
      }
      rows.sort((a, b) => compactStatusRank(a) - compactStatusRank(b) || b.updatedAt - a.updatedAt);
      return rows;
    };
    const totals = useMemo(() => {
      const acc = { workspaces: workspaces.length, sessions: allSessions.length, attention: 0, running: 0 };
      for (const s of allSessions) {
        if (s.info.tone === "running") acc.running += 1;
        if (s.info.tone === "attention") acc.attention += 1;
      }
      return acc;
    }, [workspaces, allSessions]);
    const open = (id) => {
      if (typeof openSession === "function") openSession(id);
    };
    const sortBy = (key, additive) => {
      const setter = view === "sessions" ? setSessionSorts : setProjectSorts;
      setter((previous) => {
        const existing = previous.findIndex((entry) => entry.key === key);
        if (!additive) {
          if (previous.length === 1 && previous[0].key === key) {
            return [{ key, dir: previous[0].dir === "asc" ? "desc" : "asc" }];
          }
          return [{ key, dir: SORT_DIR_DEFAULT[key] || "asc" }];
        }
        if (existing >= 0) {
          const next = previous.slice();
          next[existing] = { key, dir: previous[existing].dir === "asc" ? "desc" : "asc" };
          return next;
        }
        if (previous.length >= 4) return previous;
        return previous.concat([{ key, dir: SORT_DIR_DEFAULT[key] || "asc" }]);
      });
    };
    const sessionSortValue = (row, key) => {
      if (key === "title") return row.title.toLowerCase();
      if (key === "project") return row.workspaceLabel.toLowerCase();
      if (key === "status") return row.info.rank;
      if (key === "kind") return row.auto ? 0 : 1;
      if (key === "preset") return presetText(row.preset).toLowerCase();
      if (key === "updatedAt") return row.updatedAt;
      return 0;
    };
    const projectSortValue = (project, key) => {
      if (key === "name") return project.name.toLowerCase();
      if (key === "lastUpdated") return project.lastUpdated;
      if (key === "issues") return project.issues ?? -1;
      if (key === "prs") return project.prs ?? -1;
      if (key === "localVersion") return versionSortKey(project.localVersion);
      if (key === "latestVersion") return versionSortKey(project.latestVersion);
      if (key === "presets") return project.presets ? project.presets.size : 0;
      return project.counts[key] !== void 0 ? project.counts[key] : 0;
    };
    const compareBySorts = (sortList, valueOf) => (a, b) => {
      for (const entry of sortList) {
        const va = valueOf(a, entry.key);
        const vb = valueOf(b, entry.key);
        const dir = entry.dir === "asc" ? 1 : -1;
        if (va < vb) return -dir;
        if (va > vb) return dir;
      }
      return 0;
    };
    const filteredSessions = useMemo(() => {
      const q = query.trim().toLowerCase();
      let rows = allSessions.filter((s) => {
        if (statusFilter !== "all" && s.info.tone !== statusFilter) return false;
        if (kindFilter === "auto" && !s.auto) return false;
        if (kindFilter === "normal" && s.auto) return false;
        if (projectFilter !== "all" && s.workspaceId !== projectFilter) return false;
        if (q && !(s.title.toLowerCase().includes(q) || s.workspaceLabel.toLowerCase().includes(q))) return false;
        return true;
      });
      rows = rows.slice().sort(compareBySorts(sessionSorts, sessionSortValue));
      return rows;
    }, [allSessions, statusFilter, kindFilter, projectFilter, query, sessionSorts, presetNames, t]);
    useEffect(() => {
      setSessionLimit(SESSION_RENDER_BATCH);
    }, [query, statusFilter, kindFilter, projectFilter, sessionSorts]);
    const shownSessions = filteredSessions.length > sessionLimit ? filteredSessions.slice(0, sessionLimit) : filteredSessions;
    const hiddenSessionCount = filteredSessions.length - shownSessions.length;
    const filteredProjects = useMemo(() => {
      const q = query.trim().toLowerCase();
      let rows = projectModels.filter((p) => !q || p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
      rows = rows.slice().sort(compareBySorts(projectSorts, projectSortValue));
      return rows;
    }, [projectModels, query, projectSorts]);
    const renderPopover = (workspaceId, color, icon) => {
      const spec = appearance[workspaceId] || {};
      const popStyle = popoverPos ? { left: popoverPos.left + "px", top: popoverPos.top + "px" } : void 0;
      return h(
        "div",
        { className: "pbx-pop", ref: popRef, style: popStyle, onClick: (event) => event.stopPropagation() },
        h("div", { className: "pbx-popLabel" }, t("appearance.color")),
        h(
          "div",
          { className: "pbx-swatches" },
          PALETTE.map(
            (value) => h("button", {
              key: value,
              type: "button",
              className: "pbx-swatchBtn" + ((spec.color || color) === value ? " sel" : ""),
              style: { background: value },
              "aria-label": value,
              onClick: (event) => {
                event.stopPropagation();
                updateAppearance(workspaceId, { color: value });
              }
            })
          )
        ),
        h("div", { className: "pbx-popLabel" }, t("appearance.icon")),
        h(
          "div",
          { className: "pbx-icons" },
          ICONS.map(
            (name) => h(
              "button",
              {
                key: name,
                type: "button",
                className: "pbx-iconBtn" + ((spec.icon || icon) === name ? " sel" : ""),
                "aria-label": name,
                onClick: (event) => {
                  event.stopPropagation();
                  updateAppearance(workspaceId, { icon: name });
                }
              },
              h(Icon, { name, size: 16 })
            )
          )
        ),
        h(
          "button",
          {
            type: "button",
            className: "pbx-reset",
            onClick: (event) => {
              event.stopPropagation();
              resetAppearance(workspaceId);
            }
          },
          t("appearance.reset")
        )
      );
    };
    const projectChip = (workspaceId, label, size) => {
      const spec = specOf(workspaceId);
      return h(
        "span",
        { className: "pbx-chip" },
        h(
          "span",
          { className: "pbx-chipIcon" + (size === "lg" ? " lg" : ""), style: { color: spec.color, background: hexToRgba(spec.color, 0.16) } },
          h(Icon, { name: spec.icon, size: size === "lg" ? 15 : 12 })
        ),
        h("span", { className: "pbx-chipName" }, label)
      );
    };
    const statusPill = (info) => h(
      "span",
      { className: "pbx-statusPill", "data-tone": info.tone },
      info.tone === "running" ? h(RunRing, { size: 8 }) : h("span", { className: "pbx-kdot", "data-tone": info.tone }),
      t(info.labelKey)
    );
    const th = (key, label, type, options) => {
      const opts = options || {};
      const position = sorts.findIndex((entry) => entry.key === key);
      const active = position >= 0;
      const direction = active ? sorts[position].dir : null;
      const title = opts.sortable === false ? opts.hint : opts.hint ? opts.hint + " · " + t("sort.hint", MODIFIER_LABELS) : t("sort.hint", MODIFIER_LABELS);
      return h(
        "th",
        {
          className: "pbx-th" + (opts.sortable === false ? "" : " sortable") + (active ? " active" : "") + (opts.num ? " num" : ""),
          title,
          "aria-sort": opts.sortable === false ? void 0 : active ? direction === "asc" ? "ascending" : "descending" : "none",
          tabIndex: opts.sortable === false ? void 0 : 0,
          onClick: opts.sortable === false ? void 0 : (event) => sortBy(key, Boolean(event.shiftKey)),
          onKeyDown: opts.sortable === false ? void 0 : (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            sortBy(key, Boolean(event.shiftKey));
          }
        },
        h("span", { className: "pbx-thType", "aria-hidden": "true" }, type || ""),
        h("span", { className: "pbx-thLabel" }, label),
        active ? h("span", { className: "pbx-sortMark", "aria-hidden": "true" }, direction === "asc" ? "↑" : "↓") : null
      );
    };
    const renderSessionRow = (row) => h(
      "tr",
      {
        key: row.id,
        className: "pbx-tr" + (row.running ? " pbx-tr-live" : "") + (row.current ? " pbx-tr-current" : "") + (row.auto ? " pbx-tr-auto" : ""),
        onClick: () => open(row.id),
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open(row.id);
          }
        }
      },
      h("td", null, projectChip(row.workspaceId, row.workspaceLabel)),
      h(
        "td",
        null,
        h(
          "div",
          { className: "pbx-titleCell" },
          row.auto ? h("span", { className: "pbx-autoGlyph", title: t("kind.auto") }, h(Icon, { name: "clock", size: 13 })) : null,
          row.info.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.info.tone }),
          h("span", { className: "pbx-titleText" }, row.title),
          row.current ? h("span", { className: "pbx-curTag" }, t("card.current")) : null
        )
      ),
      h("td", null, statusPill(row.info)),
      h(
        "td",
        null,
        row.auto ? h("span", { className: "pbx-kindTag auto" }, h(Icon, { name: "clock", size: 12 }), t("kind.auto")) : h("span", { className: "pbx-kindTag" }, t("kind.normal"))
      ),
      h("td", null, row.preset ? h("span", { className: "pbx-modeTag" }, presetText(row.preset)) : h("span", { className: "pbx-modeTag empty" }, t("preset.none"))),
      h("td", { className: "pbx-num" }, relTime(row.updatedAt, t)),
      h(
        "td",
        { className: "pbx-center" },
        h(
          "button",
          {
            type: "button",
            className: "pbx-openBtn",
            title: t("open"),
            "aria-label": t("open"),
            onClick: (e) => {
              e.stopPropagation();
              open(row.id);
            }
          },
          h(Icon, { name: "arrow", size: 14 })
        )
      )
    );
    const renderGroupHeader = (workspaceId, label, count) => {
      const isCollapsed = collapsed[workspaceId] === true;
      return h(
        "tr",
        { key: "g-" + workspaceId, className: "pbx-groupRow" },
        h(
          "td",
          { colSpan: 7, onClick: () => setCollapsed((prev) => Object.assign({}, prev, { [workspaceId]: !isCollapsed })) },
          h("span", { className: "pbx-groupChevron" + (isCollapsed ? "" : " open") }, h(Icon, { name: "chevron", size: 13 })),
          projectChip(workspaceId, label, "lg"),
          h("span", { className: "pbx-groupCount" }, t(count === 1 ? "count.row" : "count.rows", { n: count }))
        )
      );
    };
    const renderSessionsBody = () => {
      if (filteredSessions.length === 0) {
        return h("tr", null, h("td", { colSpan: 7, className: "pbx-emptyCell" }, t("empty.filtered")));
      }
      const moreRow = hiddenSessionCount > 0 ? h(
        "tr",
        { key: "show-more" },
        h(
          "td",
          { colSpan: 7, className: "pbx-moreCell" },
          h(
            "button",
            {
              type: "button",
              className: "pbx-setBtn",
              onClick: () => setSessionLimit((n) => n + SESSION_RENDER_BATCH)
            },
            t("board.showMore", { n: hiddenSessionCount })
          )
        )
      ) : null;
      if (!grouped) {
        const rendered = shownSessions.map(renderSessionRow);
        return moreRow ? rendered.concat([moreRow]) : rendered;
      }
      const rows = [];
      for (const project of projectModels) {
        const groupRows = shownSessions.filter((s) => s.workspaceId === project.workspaceId);
        if (groupRows.length === 0) continue;
        rows.push(renderGroupHeader(project.workspaceId, project.name, filteredSessions.filter((s) => s.workspaceId === project.workspaceId).length));
        if (collapsed[project.workspaceId] !== true) rows.push.apply(rows, groupRows.map(renderSessionRow));
      }
      if (moreRow) rows.push(moreRow);
      return rows;
    };
    const projectCols = PROJECT_COLUMNS.filter((def) => !config.projectColumns || config.projectColumns[def.key] !== false);
    const cellRepoState = (project) => {
      if (!project.repo || !project.repo.owner || !project.repo.repo) return null;
      const stats = project.repoStats;
      if (!stats || stats.status === "loading") return "loading";
      if (stats.status === "error") return "error";
      return null;
    };
    const repoErrorText = (code) => {
      if (code === "repo-not-found") return t("col.errRepoNotFound");
      if (code === "token-invalid") return t("col.errTokenInvalid");
      if (code === "rate-limited") return t("col.errRateLimited");
      if (code === "timeout") return t("col.errTimeout");
      return t("col.errGeneric", { code: code || "?" });
    };
    const projectCell = (project, def) => {
      if (def.key === "lastUpdated") {
        const absolute = project.lastUpdated ? new Date(project.lastUpdated).toLocaleString() : "";
        return h("td", { className: "pbx-num pbx-time", title: absolute }, relTime(project.lastUpdated, t));
      }
      if (def.key === "issues" || def.key === "prs") {
        const value2 = def.key === "issues" ? project.issues : project.prs;
        const state = cellRepoState(project);
        if (state === "loading") return h("td", { className: "pbx-num pbx-na", "aria-busy": true, title: t("col.loading") }, "…");
        if (state === "error") return h("td", { className: "pbx-num pbx-na pbx-err", "aria-label": repoErrorText(project.repoStats?.error), title: repoErrorText(project.repoStats?.error) }, "⚠");
        if (value2 === void 0) {
          return h("td", { className: "pbx-num pbx-na", title: t("col.naHint") }, t("col.na"));
        }
        const cls2 = "pbx-num" + (value2 > 0 ? " pbx-numHot" : " pbx-numZero");
        return h("td", { className: cls2 }, String(value2));
      }
      if (def.key === "localVersion" || def.key === "latestVersion") {
        const value2 = def.key === "localVersion" ? project.localVersion : project.latestVersion;
        const state = cellRepoState(project);
        if (state === "loading") return h("td", { className: "pbx-num pbx-ver pbx-na", "aria-busy": true, title: t("col.loading") }, "…");
        if (state === "error") return h("td", { className: "pbx-num pbx-ver pbx-na pbx-err", "aria-label": repoErrorText(project.repoStats?.error), title: repoErrorText(project.repoStats?.error) }, "⚠");
        if (!value2) return h("td", { className: "pbx-num pbx-ver pbx-na", title: t("col.naHint") }, t("col.na"));
        const latest = project.latestVersion;
        const lagging = def.key === "localVersion" && !!latest && compareVersions(value2, latest) < 0;
        const cls2 = "pbx-num pbx-ver" + (lagging ? " pbx-verLag" : "");
        const title = lagging ? t("col.localBehind", { local: value2, latest: latest || "" }) : value2;
        return h("td", { className: cls2, title }, h("span", null, value2));
      }
      const value = project.counts[def.key] ?? 0;
      const cls = "pbx-num" + (def.key === "total" ? " pbx-strong" : "");
      return h("td", { className: cls }, String(value));
    };
    const renderInlineSessionRow = (row) => h(
      "tr",
      {
        key: "s-" + row.id,
        className: "pbx-tr pbx-tr-inline" + (row.running ? " pbx-tr-live" : "") + (row.current ? " pbx-tr-current" : ""),
        onClick: () => open(row.id),
        tabIndex: 0,
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open(row.id);
          }
        }
      },
      h(
        "td",
        { colSpan: 1 + projectCols.length, className: "pbx-inlineSession" },
        h(
          "div",
          { className: "pbx-inlineRow" },
          row.info.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.info.tone }),
          h("span", { className: "pbx-titleText" }, row.title),
          row.current ? h("span", { className: "pbx-curTag" }, t("card.current")) : null,
          h("span", { className: "pbx-inlineTime" }, relTime(row.updatedAt, t)),
          h(
            "button",
            {
              type: "button",
              className: "pbx-openBtn",
              title: t("open"),
              "aria-label": t("open"),
              onClick: (e) => {
                e.stopPropagation();
                open(row.id);
              }
            },
            h(Icon, { name: "arrow", size: 14 })
          )
        )
      )
    );
    const renderProjectRow = (project) => {
      const spec = specOf(project.workspaceId);
      const isEditing = editingProject === project.workspaceId;
      const isExpanded = expandedProject === project.workspaceId;
      const projectRow = h(
        "tr",
        {
          key: project.workspaceId,
          className: "pbx-tr" + (isExpanded ? " pbx-tr-expanded" : "") + (projectFilter === project.workspaceId ? " pbx-tr-selected" : ""),
          "aria-current": projectFilter === project.workspaceId ? "true" : void 0,
          "aria-selected": projectFilter === project.workspaceId ? "true" : "false",
          "aria-expanded": isExpanded ? "true" : "false",
          tabIndex: 0,
          onClick: () => {
            setExpandedProject(isExpanded ? null : project.workspaceId);
          },
          onKeyDown: (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpandedProject(isExpanded ? null : project.workspaceId);
            }
          }
        },
        h(
          "td",
          null,
          h(
            "div",
            { className: "pbx-titleCell" },
            h("span", { className: "pbx-chevron" + (isExpanded ? " open" : "") }, h(Icon, { name: "chevron", size: 13 })),
            h(
              "span",
              { className: "pbx-iconField", style: { position: "relative" } },
              h(
                "button",
                {
                  type: "button",
                  className: "pbx-chipIcon lg pbx-iconTrigger",
                  title: t("col.appearance"),
                  "aria-label": t("col.appearance"),
                  style: { color: spec.color, background: hexToRgba(spec.color, 0.16) },
                  onPointerDown: (e) => e.stopPropagation(),
                  onClick: (e) => {
                    e.stopPropagation();
                    if (isEditing) {
                      setEditingProject(null);
                      return;
                    }
                    const rect = e.currentTarget.getBoundingClientRect();
                    setPopoverPos({
                      left: Math.max(12, Math.min(window.innerWidth - 248, Math.round(rect.left))),
                      top: Math.max(12, Math.min(window.innerHeight - 300, Math.round(rect.bottom + 8)))
                    });
                    setEditingProject(project.workspaceId);
                  }
                },
                h(Icon, { name: spec.icon, size: 15 })
              ),
              isEditing ? renderPopover(project.workspaceId, spec.color, spec.icon) : null
            ),
            h(
              "div",
              { className: "pbx-twoLine" },
              h("div", { className: "pbx-titleText" }, project.name),
              h("div", { className: "pbx-subText" }, project.path)
            )
          )
        ),
        projectCols.map((def) => projectCell(project, def))
      );
      if (!isExpanded) return projectRow;
      const projectSessions = allSessions.filter((s) => s.workspaceId === project.workspaceId).sort((a, b) => b.updatedAt - a.updatedAt);
      if (projectSessions.length === 0) return projectRow;
      return [projectRow, ...projectSessions.map(renderInlineSessionRow)];
    };
    const header = h(
      "div",
      { className: "pbx-header" },
      h(
        "div",
        null,
        h("div", { className: "pbx-titleRow" }, h("span", { className: "pbx-glyph" }, h(Icon, { name: "board", size: 20 })), h("span", null, t("title"))),
        h("div", { className: "pbx-subtitle" }, t("subtitle"))
      ),
      h(
        "div",
        { className: "pbx-headerRight" },
        h(
          "div",
          { className: "pbx-totals" },
          h("span", { className: "pbx-total" }, h("strong", null, String(totals.workspaces)), t("stat.workspaces")),
          h("span", { className: "pbx-total" }, h("strong", null, String(totals.sessions)), t("stat.sessions")),
          totals.attention > 0 ? h("span", { className: "pbx-total" }, h("strong", { style: { color: "var(--dsw-alias-state-warn-primary)" } }, String(totals.attention)), t("stat.attention")) : null,
          totals.running > 0 ? h(
            "span",
            { className: "pbx-total" },
            h("strong", { style: { color: "var(--dsw-alias-brand-primary)" } }, String(totals.running)),
            t("stat.running")
          ) : null
        ),
        /* The main-panel instance covers the whole content area; without this the only way
           back to the conversation is the host's own panel switch. Give it an explicit exit. */
        typeof props.closePanel === "function" ? h(
          "button",
          {
            type: "button",
            className: "pbx-setBtn pbx-headerClose",
            title: t("panel.close"),
            "aria-label": t("panel.close"),
            onClick: () => {
              const close = props.closePanel;
              if (typeof close === "function") close();
            }
          },
          h(Icon, { name: "close", size: 13 }),
          h("span", null, t("panel.close"))
        ) : null
      )
    );
    const toolbar = h(
      "div",
      { className: "pbx-toolbar" },
      h(
        "div",
        { className: "pbx-tabs", role: "tablist" },
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": view === "projects" ? "true" : "false",
            className: "pbx-tab" + (view === "projects" ? " active" : ""),
            onClick: () => applyView("projects")
          },
          t("view.projects"),
          h("span", { className: "pbx-tabCount" }, String(projectModels.length))
        ),
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": view === "sessions" ? "true" : "false",
            className: "pbx-tab" + (view === "sessions" ? " active" : ""),
            onClick: () => {
              applyView("sessions");
              setExpandedProject(null);
            }
          },
          t("view.sessions"),
          h("span", { className: "pbx-tabCount" }, String(allSessions.length))
        )
      ),
      h(
        "div",
        { className: "pbx-tools" },
        h("input", {
          className: "pbx-input",
          type: "text",
          placeholder: t("filter.search"),
          "aria-label": t("filter.search"),
          value: query,
          onChange: (e) => setQuery(e.target.value)
        }),
        view === "sessions" ? h(
          "select",
          {
            className: "pbx-select",
            value: statusFilter,
            onChange: (e) => setStatusFilter(e.target.value),
            "aria-label": t("filter.status")
          },
          h("option", { value: "all" }, t("filter.status") + ": " + t("filter.all")),
          h("option", { value: "running" }, t("status.running")),
          h("option", { value: "attention" }, t("status.attention")),
          h("option", { value: "done" }, t("status.done")),
          h("option", { value: "idle" }, t("status.idle"))
        ) : null,
        view === "sessions" ? h(
          "select",
          {
            className: "pbx-select",
            value: kindFilter,
            onChange: (e) => setKindFilter(e.target.value),
            "aria-label": t("filter.kind")
          },
          h("option", { value: "all" }, t("filter.kind") + ": " + t("filter.all")),
          h("option", { value: "auto" }, t("kind.auto")),
          h("option", { value: "normal" }, t("kind.normal"))
        ) : null,
        view === "sessions" ? h(
          "select",
          {
            className: "pbx-select",
            value: projectFilter,
            onChange: (e) => setProjectFilter(e.target.value),
            "aria-label": t("filter.project")
          },
          h("option", { value: "all" }, t("filter.project") + ": " + t("filter.all")),
          projectModels.map((p) => h("option", { key: p.workspaceId, value: p.workspaceId }, p.name))
        ) : null,
        view === "sessions" ? h("button", { type: "button", className: "pbx-toggle" + (grouped ? " on" : ""), onClick: () => setGrouped((v) => !v) }, t("group.byProject")) : null,
        h("span", { className: "pbx-sortHint" }, t("sort.hint", MODIFIER_LABELS))
      )
    );
    let body;
    if (!ready && workspaces.length === 0) {
      body = h("div", { className: "pbx-loading" }, t("loading"));
    } else if (workspaces.length === 0) {
      body = h(
        "div",
        { className: "pbx-empty" },
        h("div", { className: "pbx-emptyIcon" }, h(Icon, { name: "board", size: 30 })),
        h("div", { className: "pbx-emptyTitle" }, t("empty.title")),
        h("div", { className: "pbx-emptyDesc" }, t("empty.desc"))
      );
    } else if (view === "sessions") {
      body = h(
        "div",
        { className: "pbx-dbScroll" },
        h(
          "table",
          { className: "pbx-table" },
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              th("project", t("col.project"), "↗"),
              th("title", t("col.title"), "Aa"),
              th("status", t("col.status"), "◉"),
              th("kind", t("col.kind"), "◇"),
              th("preset", t("col.preset"), "◈"),
              th("updatedAt", t("col.updated"), "◷", { num: true }),
              th("open", "", "", { sortable: false })
            )
          ),
          h("tbody", null, renderSessionsBody())
        ),
        h("div", { className: "pbx-dbFoot" }, t(filteredSessions.length === 1 ? "count.row" : "count.rows", { n: filteredSessions.length }))
      );
    } else {
      body = h(
        "div",
        { className: "pbx-dbScroll" },
        h(
          "table",
          { className: "pbx-table" },
          h(
            "thead",
            null,
            h("tr", null, th("name", t("col.project"), "Aa", { hint: t("col.hint.name") }), projectCols.map((def) => th(def.key, t(def.labelKey), def.type, { num: true, hint: t(def.hintKey) })))
          ),
          h(
            "tbody",
            null,
            filteredProjects.length === 0 ? h("tr", null, h("td", { colSpan: 1 + projectCols.length, className: "pbx-emptyCell" }, t("empty.filtered"))) : filteredProjects.map(renderProjectRow).flat()
          )
        ),
        h("div", { className: "pbx-dbFoot" }, t(filteredProjects.length === 1 ? "count.row" : "count.rows", { n: filteredProjects.length }))
      );
    }
    if (compact) {
      const statChip = (label, value, color) => value > 0 ? h("span", { className: "pbx-pcardStat", style: { color } }, String(value) + " " + label) : null;
      const activeProject = compactProjectId ? projectModels.find((item) => item.workspaceId === compactProjectId) : null;
      const activeRows = activeProject ? compactSessionsOf(activeProject.workspaceId) : [];
      const compactTabs = h(
        "div",
        { className: "pbx-compactTabs", role: "tablist" },
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": view === "projects" ? "true" : "false",
            className: "pbx-tab" + (view === "projects" ? " active" : ""),
            onClick: () => {
              applyView("projects");
              setCompactProjectId(null);
            }
          },
          t("view.projects"),
          h("span", { className: "pbx-tabCount" }, String(projectModels.length))
        ),
        h(
          "button",
          {
            type: "button",
            role: "tab",
            "aria-selected": view === "sessions" ? "true" : "false",
            className: "pbx-tab" + (view === "sessions" ? " active" : ""),
            onClick: () => {
              applyView("sessions");
              setCompactProjectId(null);
            }
          },
          t("view.sessions"),
          h("span", { className: "pbx-tabCount" }, String(filteredSessions.length))
        )
      );
      const compactRow = (row) => h(
        "button",
        {
          key: row.id,
          type: "button",
          className: "pbx-crow" + (row.auto ? " auto" : "") + (row.info.tone === "running" ? " live" : ""),
          title: t("card.open"),
          onClick: () => open(row.id)
        },
        row.info.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.info.tone }),
        row.auto ? h("span", { className: "pbx-autoGlyph" }, h(Icon, { name: "clock", size: 12 })) : null,
        h("span", { className: "pbx-ctitle" }, row.title),
        h("span", { className: "pbx-ctime" }, relTime(row.updatedAt, t))
      );
      const compactSessionList = filteredSessions.length === 0 ? h("div", { className: "pbx-cgroupEmpty" }, t("empty.filtered")) : h(
        "div",
        { className: "pbx-compactList" },
        shownSessions.map(compactRow),
        hiddenSessionCount > 0 ? h(
          "button",
          {
            type: "button",
            className: "pbx-setBtn pbx-showMore",
            onClick: () => setSessionLimit((n) => n + SESSION_RENDER_BATCH)
          },
          t("board.showMore", { n: hiddenSessionCount })
        ) : null
      );
      return h(
        "div",
        { className: "pbx-root pbx-compact" },
        h(
          "div",
          { className: "pbx-compactWrap" },
          h(
            "div",
            { className: "pbx-compactHead" },
            activeProject ? h(
              "button",
              {
                type: "button",
                className: "pbx-compactBack",
                title: t("compact.allProjects"),
                "aria-label": t("compact.allProjects"),
                onClick: () => setCompactProjectId(null)
              },
              h(Icon, { name: "left", size: 14 })
            ) : null,
            h(
              "div",
              { className: "pbx-compactTitle" },
              h(Icon, { name: "board", size: 16 }),
              h("span", null, activeProject ? activeProject.name : t("title"))
            ),
            h(
              "div",
              { className: "pbx-compactMeta" },
              activeProject ? String(activeRows.length) + " " + t("stat.sessions") : String(projectModels.length) + " " + t("stat.workspaces") + " · " + String(totals.running) + " " + t("stat.running")
            ),
            typeof openFullBoard === "function" ? h(
              "button",
              { type: "button", className: "pbx-compactFull", title: t("compact.full"), onClick: () => openFullBoard() },
              h(Icon, { name: "expand", size: 14 })
            ) : null
          ),
          activeProject ? null : compactTabs,
          activeProject ? h(
            "div",
            { className: "pbx-compactBody" },
            activeRows.length === 0 ? h("div", { className: "pbx-cgroupEmpty" }, t("col.empty")) : h(
              "div",
              { className: "pbx-compactList" },
              activeRows.map(
                (row) => h(
                  "button",
                  {
                    key: row.id,
                    type: "button",
                    className: "pbx-crow" + (row.auto ? " auto" : "") + (row.archived ? " archived" : "") + (row.info.tone === "running" ? " live" : ""),
                    title: t("card.open"),
                    onClick: () => open(row.id)
                  },
                  row.info.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.info.tone }),
                  row.auto ? h("span", { className: "pbx-autoGlyph" }, h(Icon, { name: "clock", size: 12 })) : null,
                  h("span", { className: "pbx-ctitle" }, row.title),
                  row.archived ? h("span", { className: "pbx-prowArchived" }, t("palette.archived")) : null,
                  h("span", { className: "pbx-ctime" }, relTime(row.updatedAt, t))
                )
              )
            ),
            activeProject.path ? h(
              "div",
              { className: "pbx-compactPath", title: activeProject.path },
              h("span", { className: "pbx-compactPathLabel" }, t("col.path")),
              h("span", { className: "pbx-compactPathText" }, activeProject.path)
            ) : null
          ) : view === "sessions" ? compactSessionList : filteredProjects.length === 0 ? h("div", { className: "pbx-cgroupEmpty" }, t("empty.filtered")) : filteredProjects.map((project) => {
            const spec = specOf(project.workspaceId);
            return h(
              "button",
              {
                key: project.workspaceId,
                type: "button",
                className: "pbx-pcard",
                title: t("card.open"),
                onClick: () => {
                  setCompactProjectId(project.workspaceId);
                  setStatusFilter("all");
                }
              },
              h(
                "span",
                { className: "pbx-pcardTop" },
                h(
                  "span",
                  { className: "pbx-chipIcon", style: { color: spec.color, background: hexToRgba(spec.color, 0.16) } },
                  h(Icon, { name: spec.icon, size: 13 })
                ),
                h("span", { className: "pbx-pcardName" }, project.name),
                h("span", { className: "pbx-pcardTotal" }, String(project.counts.total))
              ),
              h(
                "span",
                { className: "pbx-pcardStats" },
                statChip(t("stat.running"), project.counts.running, "var(--dsw-alias-brand-primary)"),
                statChip(t("stat.attention"), project.counts.attention, "var(--dsw-alias-state-warn-primary)"),
                statChip(t("status.done"), project.counts.done, "var(--dsw-alias-state-success-primary)"),
                statChip(t("stat.auto"), project.counts.auto, "var(--dsw-alias-state-warn-primary)")
              )
            );
          })
        )
      );
    }
    return h("div", { className: "pbx-root" }, h("div", { className: "pbx-wrap" }, header, toolbar, body));
  }

  // src/features/responsive-board.ts
  function ResponsiveBoard(props) {
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const threshold = Math.min(1e3, Math.max(320, Number(props.wideThreshold) || Number(config.board.wideThreshold) || 520));
    const boxRef = useRef(null);
    const [wide, setWide] = useState(false);
    useEffect(() => {
      const element = boxRef.current;
      if (!element) return void 0;
      const update = () => {
        setWide(element.clientWidth >= threshold);
      };
      update();
      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
      }
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }, [threshold]);
    if (config.board.enabled === false) {
      return h("div", { className: "pbx-responsive" }, h("div", { className: "pbx-disabled" }, props.t("settings.boardDisabled")));
    }
    return h("div", { ref: boxRef, className: "pbx-responsive" }, h(ProjectBoard, Object.assign({}, props, { compact: !wide })));
  }

  // src/ui/panel-icon.ts
  function PanelIcon(props) {
    return h(Icon, { name: "board", size: props && props.size ? props.size : 16 });
  }

  // src/core/header-drag.ts
  function startHeaderButtonDrag(id, event, saveSettings, config, dragStore) {
    if (!event.ctrlKey || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const source = event.currentTarget;
    const rect = source.getBoundingClientRect();
    const ghost = source.cloneNode(true);
    ghost.classList.add("pbx-dragGhost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.position = "fixed";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "2147483647";
    ghost.style.opacity = "0.85";
    document.body.appendChild(ghost);
    try {
      source.setPointerCapture(event.pointerId);
    } catch (error) {
    }
    const setDrag = dragStore && typeof dragStore.set === "function" ? dragStore.set.bind(dragStore) : function() {
    };
    const resetDrag = () => setDrag({ id: null, side: null, index: -1, width: 0 });
    const currentSide = config.headerButtons && config.headerButtons[id] && config.headerButtons[id].side || "left";
    ghost.style.display = "none";
    const startX = event.clientX;
    const startY = event.clientY;
    let moved = false;
    let dragStarted = false;
    let lastSide = currentSide;
    let lastIndex = -1;
    const move = (moveEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      ghost.style.left = rect.left + dx + "px";
      ghost.style.top = rect.top + dy + "px";
      if (!moved) return;
      if (!dragStarted) {
        dragStarted = true;
        ghost.style.display = "";
        setDrag({ id, side: currentSide, index: -1, width: 0 });
        window.requestAnimationFrame(() => setDrag({ width: rect.width }));
      }
      const drop = headerDropPosition(id, pointerViewX(moveEvent));
      if (drop.side !== lastSide || drop.index !== lastIndex) {
        lastSide = drop.side;
        lastIndex = drop.index;
        setDrag({ side: drop.side, index: drop.index });
      }
    };
    const finish = (upEvent) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", cancel, true);
      ghost.remove();
      resetDrag();
      if (!moved) return;
      suppressHeaderClicks(350);
      const viewX = pointerViewX(upEvent);
      const drop = headerDropPosition(id, viewX);
      let side = drop.side;
      if (side === "right" && !document.querySelector(".pbx-navRight")) side = "left";
      const current = config.headerButtons && config.headerButtons[id] || { hidden: false, side: "left", order: 0 };
      const next = cloneJson(config);
      const selector = side === "right" ? ".pbx-navRight .pbx-navItem[data-hb-id]" : ".pbx-nav:not(.pbx-navRight) .pbx-navItem[data-hb-id]";
      const siblings = Array.prototype.filter.call(document.querySelectorAll(selector), (element) => {
        const siblingId = element.getAttribute("data-hb-id");
        if (!siblingId || siblingId === id) return false;
        const rect2 = element.getBoundingClientRect();
        return rect2.width > 0 && rect2.height > 0;
      });
      let order = null;
      for (const sibling of siblings) {
        const rect2 = sibling.getBoundingClientRect();
        if (rect2.left + rect2.width / 2 > viewX) {
          const siblingId = sibling.getAttribute("data-hb-id");
          const siblingOrder = Number(next.headerButtons[siblingId] && next.headerButtons[siblingId].order) || 0;
          order = siblingOrder - 5;
          break;
        }
      }
      if (order === null) {
        let maxOrder = 0;
        for (const key of Object.keys(next.headerButtons || {})) {
          const item = next.headerButtons[key];
          if (key !== id && item && item.side === side) maxOrder = Math.max(maxOrder, Number(item.order) || 0);
        }
        order = maxOrder + 10;
      }
      next.headerButtons[id] = Object.assign({}, current, { side, order });
      if (typeof saveSettings === "function") saveSettings(next);
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", cancel, true);
      ghost.remove();
      resetDrag();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", finish, true);
    window.addEventListener("pointercancel", finish, true);
    window.addEventListener("blur", cancel, true);
  }

  // src/features/header.ts
  function HeaderLeading(props) {
    return h(HeaderButtons, Object.assign({}, props, { side: "left", placement: "header" }));
  }
  function HeaderUtilities(props) {
    return h(HeaderButtons, Object.assign({}, props, { side: "right", placement: "header" }));
  }
  function ComposerDockButtons(props) {
    return h(HeaderButtons, Object.assign({}, props, { side: "composer", placement: "composer" }));
  }
  function HeaderButtons(props) {
    const { useSessions, useSessionStatus, useWorkspaces, t, openBoard } = props;
    const usePalette = typeof props.usePalette === "function" ? props.usePalette : fallbackHook();
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const useHeaderDrag = typeof props.useHeaderDrag === "function" ? props.useHeaderDrag : fallbackHook();
    const palette = props.palette;
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const dragSnap = useHeaderDrag((snapshot) => snapshot) || { id: null, side: null, index: -1, width: 0 };
    const list = useSessions((snapshot) => snapshot);
    const statuses = useSessionStatus((snapshot) => snapshot);
    const wsSnap = useWorkspaces((snapshot) => snapshot);
    const paletteSnap = usePalette((snapshot) => snapshot);
    const open = Boolean(paletteSnap && paletteSnap.open);
    const [navSpace, setNavSpace] = useState(null);
    const [moreOpen, setMoreOpen] = useState(false);
    useEffect(() => {
      const read = () => {
        const width = hostCentreColumnWidth();
        if (width <= 0) return;
        setNavSpace((previous) => previous === null || Math.abs(previous - width) > 2 ? width : previous);
      };
      read();
      let observer = null;
      const box = centreColumnElement();
      if (box && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(read);
        observer.observe(box);
      }
      window.addEventListener("resize", read);
      return () => {
        if (observer) observer.disconnect();
        window.removeEventListener("resize", read);
      };
    }, []);
    const headerPlacement = config && config.header && config.header.placement === "composer" ? "composer" : "header";
    const foldedNav = headerPlacement !== "composer" && navSpace !== null && navSpace < (props.side === "right" ? 700 : 620);
    const tightNav = headerPlacement !== "composer" && navSpace !== null && navSpace < 900;
    useEffect(() => {
      if (!foldedNav) setMoreOpen(false);
    }, [foldedNav]);
    useEffect(() => {
      if (!moreOpen) return void 0;
      const onDown = (event) => {
        const target = event.target;
        if (target && typeof target.closest === "function" && target.closest(".pbx-navMoreWrap")) return;
        setMoreOpen(false);
      };
      const onKey = (event) => {
        if (event.key === "Escape") setMoreOpen(false);
      };
      document.addEventListener("pointerdown", onDown, true);
      document.addEventListener("keydown", onKey, true);
      return () => {
        document.removeEventListener("pointerdown", onDown, true);
        document.removeEventListener("keydown", onKey, true);
      };
    }, [moreOpen]);
    const archived = new Set(wsSnap && wsSnap.archivedSessionIds || []);
    const ids = list && list.ids || [];
    const byId = list && list.byId || {};
    let currentId;
    for (const id of ids) {
      const row = byId[id];
      if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) {
        currentId = id;
        break;
      }
    }
    let running = 0;
    let attention = 0;
    for (const id of ids) {
      const row = byId[id];
      if (!row || row.blank || row.origin === "subagent" || archived.has(id)) continue;
      const info = statusInfo(statuses ? statuses.get(id) : void 0, row);
      if (info.tone === "running") running += 1;
      else if (info.tone === "attention") attention += 1;
    }
    const title = currentId ? sessionTitleOf(byId[currentId], t) : "";
    const showSwitch = config.palette.enabled !== false;
    const showStats = true;
    const showBoard = config.board.enabled !== false;
    const placement = headerPlacement;
    const buttons = config.headerButtons || DEFAULT_SETTINGS.headerButtons;
    const nodes = {
      switch: showSwitch ? h(
        "button",
        {
          type: "button",
          className: "pbx-navSwitch" + (open ? " active" : ""),
          title: t("nav.switch") + " (" + comboDisplay(config.shortcuts.palette || DEFAULT_SETTINGS.shortcuts.palette) + ")" + (title ? " · " + title : ""),
          onClick: () => {
            if (palette) palette.set({ open: true });
          }
        },
        h(Icon, { name: "search", size: 14 }),
        h("span", { className: "pbx-navTitle" }, t("nav.switchLabel")),
        h("kbd", { className: "pbx-kbd" }, comboDisplay(config.shortcuts.palette || DEFAULT_SETTINGS.shortcuts.palette))
      ) : null,
      historyNav: h(
        "div",
        { className: "pbx-navHistory" },
        h(
          "button",
          {
            type: "button",
            className: "pbx-navSeg",
            title: t("settings.shortcut.userPrev") + " (" + comboDisplay(config.shortcuts.userPrev) + ")",
            "aria-label": t("settings.shortcut.userPrev"),
            onClick: () => jumpUserMessage(-1)
          },
          h(Icon, { name: "up", size: 14 })
        ),
        h(
          "button",
          {
            type: "button",
            className: "pbx-navSeg",
            title: t("settings.shortcut.userNext") + " (" + comboDisplay(config.shortcuts.userNext) + ")",
            "aria-label": t("settings.shortcut.userNext"),
            onClick: () => jumpUserMessage(1)
          },
          h(Icon, { name: "down", size: 14 })
        )
      ),
      capsule: showStats || showBoard ? h(
        "button",
        {
          type: "button",
          className: "pbx-capsule",
          title: t("nav.openBoard") + " · " + comboDisplay(config.shortcuts.prev) + " / " + comboDisplay(config.shortcuts.next),
          onClick: () => {
            if (showBoard && openBoard) openBoard();
          }
        },
        showStats ? h(
          "span",
          { className: "pbx-capStat" + (running > 0 ? " live" : "") },
          running > 0 ? h(RunRing, { size: 8 }) : h("span", { className: "pbx-liveDot" }),
          String(running)
        ) : null,
        showStats && attention > 0 ? h("span", { className: "pbx-capStat attn" }, h("span", { className: "pbx-capDot" }), String(attention)) : null,
        showBoard ? h("span", { className: "pbx-capBoard" }, h(Icon, { name: "board", size: 14 }), t("nav.board")) : null
      ) : null
    };
    if (props.placement === "composer") {
      if (placement !== "composer") return null;
      const dockIds = Object.keys(DEFAULT_SETTINGS.headerButtons).filter((id) => buttons[id] && buttons[id].hidden !== true && Boolean(nodes[id])).sort((a, b) => (buttons[a].order || 0) - (buttons[b].order || 0));
      if (dockIds.length === 0) return null;
      return h(
        "div",
        { className: "pbx-dockButtons" },
        dockIds.map((id) => h("div", { key: id, className: "pbx-navItem", "data-hb-id": id }, nodes[id]))
      );
    }
    if (placement === "composer") {
      if (!currentId && props.side === "left") {
        const fallbackIds = Object.keys(DEFAULT_SETTINGS.headerButtons).filter((id) => buttons[id] && buttons[id].hidden !== true && Boolean(nodes[id])).sort((a, b) => (buttons[a].order || 0) - (buttons[b].order || 0));
        if (fallbackIds.length > 0) {
          return h(
            "div",
            { className: "pbx-nav" },
            fallbackIds.map((id) => h("div", { key: id, className: "pbx-navItem" }, nodes[id]))
          );
        }
      }
      return null;
    }
    if (foldedNav) {
      const menuIds = Object.keys(DEFAULT_SETTINGS.headerButtons).filter((id) => buttons[id] && buttons[id].hidden !== true && Boolean(nodes[id])).sort((a, b) => (buttons[a].order || 0) - (buttons[b].order || 0));
      if (menuIds.length === 0) return null;
      return h(
        "div",
        { className: "pbx-navMoreWrap" },
        h(
          "button",
          {
            type: "button",
            className: "pbx-navMore" + (moreOpen ? " open" : ""),
            title: t("nav.more"),
            "aria-label": t("nav.more"),
            "aria-expanded": moreOpen ? "true" : "false",
            "aria-haspopup": "menu",
            onClick: () => setMoreOpen((value) => !value)
          },
          h(Icon, { name: "sliders", size: 16 })
        ),
        moreOpen ? h(
          "div",
          { className: "pbx-navMenu", role: "menu" },
          menuIds.map((id) => h("div", { key: id, className: "pbx-navMenuItem", onClickCapture: () => setMoreOpen(false) }, nodes[id]))
        ) : null
      );
    }
    const sideIds = Object.keys(DEFAULT_SETTINGS.headerButtons).filter((id) => {
      const side = buttons[id] && buttons[id].side || "left";
      if (props.side === "right") return Boolean(currentId) && side === "right";
      return side === "left" || !currentId && side === "right";
    }).filter((id) => buttons[id] && buttons[id].hidden !== true).filter((id) => Boolean(nodes[id])).filter((id) => id !== dragSnap.id).sort((a, b) => (buttons[a].order || 0) - (buttons[b].order || 0));
    const children = sideIds.map(
      (id) => h(
        "div",
        {
          key: id,
          className: "pbx-navItem",
          "data-hb-id": id,
          onPointerDown: (event) => startHeaderButtonDrag(id, event, props.saveSettings, config, props.headerDrag),
          onClickCapture: (event) => {
            if (headerClickBlocked()) {
              event.preventDefault();
              event.stopPropagation();
            }
          }
        },
        nodes[id]
      )
    );
    if (dragSnap.id && dragSnap.index >= 0 && dragSnap.side === props.side) {
      const gapIndex = Math.max(0, Math.min(dragSnap.index < 0 ? children.length : dragSnap.index, children.length));
      children.splice(
        gapIndex,
        0,
        h("div", { key: "__headerGap", className: "pbx-navGap", style: { width: (dragSnap.width || 0) + "px" } })
      );
    }
    return h(
      "div",
      {
        className: "pbx-nav" + (props.side === "right" ? " pbx-navRight" : "") + (tightNav ? " pbx-tight" : "") + (children.length === 0 ? " pbx-navEmpty" : "")
      },
      children
    );
  }

  // src/features/palette.ts
  function claimPress(event) {
    if (event.pbxShortcutActed === true) return false;
    try {
      event.pbxShortcutActed = true;
    } catch (error) {
    }
    return true;
  }
  function Palette(props) {
    const { useSessions, useSessionStatus, useWorkspaces, t, openSession } = props;
    const usePalette = typeof props.usePalette === "function" ? props.usePalette : fallbackHook();
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const useHudOrder = typeof props.useHudOrder === "function" ? props.useHudOrder : fallbackHook();
    const useSettingsCatalog = typeof props.useSettingsCatalog === "function" ? props.useSettingsCatalog : fallbackHook();
    const palette = props.palette;
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const catalog = useSettingsCatalog((snapshot) => snapshot) || EMPTY_CATALOG;
    const hudOrderSnap = useHudOrder((snapshot) => snapshot) || { ids: [] };
    const settingsRef = useRef(config);
    settingsRef.current = config;
    const focusRef = useRef(props.focus);
    focusRef.current = props.focus;
    const state = usePalette((snapshot) => snapshot) || { open: false, move: { dir: 0, at: 0 } };
    const list = useSessions((snapshot) => snapshot);
    const statuses = useSessionStatus((snapshot) => snapshot);
    const wsSnap = useWorkspaces((snapshot) => snapshot);
    const [query, setQuery] = useState("");
    const [index, setIndex] = useState(0);
    const [scope, setScope] = useState(null);
    const [mounted, setMounted] = useState(false);
    const [closing, setClosing] = useState(false);
    const inputRef = useRef(null);
    const cycleRef = useRef({ active: [], current: void 0 });
    const listRef = useRef(null);
    const paletteOpenerRef = useRef(null);
    const openRef = useRef(props.openSession);
    const chooseSettingRef = useRef(props.chooseSetting);
    const paletteOpenRef = useRef(false);
    const renameRef = useRef(null);
    openRef.current = props.openSession;
    chooseSettingRef.current = props.chooseSetting;
    paletteOpenRef.current = state.open;
    const archived = new Set(wsSnap && wsSnap.archivedSessionIds || []);
    const ids = list && list.ids || [];
    const byId = list && list.byId || {};
    const appearance = loadAppearance();
    const projectSpec = (workspaceId) => {
      const spec = appearance[workspaceId] || {};
      return { color: spec.color || paletteFor(workspaceId), icon: spec.icon || "folder" };
    };
    const wsBySession = /* @__PURE__ */ new Map();
    for (const workspace of wsSnap && wsSnap.items || []) {
      for (const sid of workspace.sessionIds || []) wsBySession.set(sid, workspace);
    }
    const projects = (wsSnap && wsSnap.items || []).map((workspace) => {
      const spec = projectSpec(workspace.workspaceId);
      return { id: workspace.workspaceId, name: workspaceLabel(workspace.title, t), color: spec.color, icon: spec.icon };
    });
    const rows = [];
    const includeArchived = !config.palette || config.palette.includeArchived !== false;
    for (const id of ids) {
      const row = byId[id];
      if (!row || row.blank || row.origin === "subagent") continue;
      const isArchived = archived.has(id);
      if (isArchived && !includeArchived) continue;
      const workspace = wsBySession.get(id);
      const spec = workspace ? projectSpec(workspace.workspaceId) : { color: paletteFor(""), icon: "folder" };
      const info = statusInfo(statuses ? statuses.get(id) : void 0, row);
      rows.push({
        id,
        title: sessionTitleOf(row, t),
        project: workspace ? workspaceLabel(workspace.title, t) : "",
        projectId: workspace ? workspace.workspaceId : "",
        projectColor: spec.color,
        projectIcon: spec.icon,
        info,
        updatedAt: row.updatedAt || 0,
        archived: isArchived
      });
    }
    let currentId;
    for (const id of ids) {
      const row = byId[id];
      if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) {
        currentId = id;
        break;
      }
    }
    renameRef.current = currentId ? { id: currentId, title: byId[currentId] && (byId[currentId].displayTitle || byId[currentId].title) || "" } : null;
    const toneRank = (row) => row.info.tone === "running" ? 0 : row.info.tone === "attention" ? 1 : 2;
    const cycleRows = rows.filter((row) => !row.archived).sort((a, b) => {
      const diff = toneRank(a) - toneRank(b);
      return diff !== 0 ? diff : b.updatedAt - a.updatedAt;
    });
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const hudIds = hudOrderSnap && hudOrderSnap.ids || [];
    const orderedRows = hudIds.map((id) => rowById.get(id)).filter(Boolean);
    cycleRef.current = { active: orderedRows.length > 0 ? orderedRows : cycleRows, current: currentId };
    const q = query.trim().toLowerCase();
    const visibleSessions = rows.filter((row) => (!scope || row.projectId === scope) && (!q || row.title.toLowerCase().includes(q) || row.project.toLowerCase().includes(q))).sort((a, b) => {
      const diff = toneRank(a) - toneRank(b);
      return diff !== 0 ? diff : b.updatedAt - a.updatedAt;
    });
    const matchesSetting = (entry) => {
      if (!q) return false;
      return entry.title.toLowerCase().includes(q) || entry.keywords.includes(q);
    };
    const hostSettings = (catalog.host || []).filter(matchesSetting);
    const pluginSettings = (catalog.plugin || []).filter(matchesSetting);
    const items = [
      ...hostSettings.map((entry) => ({ kind: "setting", entry })),
      ...pluginSettings.map((entry) => ({ kind: "setting", entry })),
      ...visibleSessions.map((row) => ({ kind: "session", row }))
    ];
    useEffect(() => {
      if (!mounted || !state.open || !inputRef.current) return;
      inputRef.current.focus({ preventScroll: true });
    }, [mounted, state.open]);
    useEffect(() => {
      if (!mounted || !state.open) return void 0;
      let frame = 0;
      const restore = () => {
        if (frame) return;
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!state.open || !mounted) return;
          const input = inputRef.current;
          if (!input || !input.isConnected) return;
          const panel = input.closest ? input.closest(".pbx-palette") : null;
          if (!panel) return;
          const active = document.activeElement;
          if (active && panel.contains(active)) return;
          const escapedToBody = !active || active === document.body || active === document.documentElement;
          if (!escapedToBody) return;
          try {
            input.focus({ preventScroll: true });
          } catch (error) {
          }
        });
      };
      document.addEventListener("focusout", restore, true);
      document.addEventListener("focusin", restore, true);
      return () => {
        document.removeEventListener("focusout", restore, true);
        document.removeEventListener("focusin", restore, true);
        if (frame) window.cancelAnimationFrame(frame);
      };
    }, [mounted, state.open]);
    useEffect(() => {
      if (!mounted || !state.open) return;
      const listNode = listRef.current;
      if (!listNode) return;
      const node = listNode.querySelectorAll(".pbx-prow")[index];
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ block: "nearest" });
    }, [index, mounted, state.open, query, scope]);
    useEffect(() => {
      setIndex(0);
    }, [query, scope]);
    useEffect(() => {
      const move = state.move;
      if (!state.open || !move || !move.at) return;
      setIndex((previous) => {
        const max = Math.max(0, items.length - 1);
        return Math.min(max, Math.max(0, previous + move.dir));
      });
    }, [state.move && state.move.at, state.open]);
    useEffect(() => {
      if (state.open) {
        setQuery("");
        setScope(null);
        setIndex(0);
      }
    }, [state.open]);
    useEffect(() => {
      if (state.open) {
        paletteOpenerRef.current = document.activeElement;
        return void 0;
      }
      const opener = paletteOpenerRef.current;
      paletteOpenerRef.current = null;
      if (opener && opener.isConnected && typeof opener.focus === "function") {
        try {
          opener.focus({ preventScroll: true });
        } catch (error) {
        }
      }
      return void 0;
    }, [state.open]);
    useEffect(() => {
      if (state.open && config.palette.enabled !== false) {
        setMounted(true);
        setClosing(false);
        return void 0;
      }
      if (!mounted) return void 0;
      setClosing(true);
      const timer = window.setTimeout(() => {
        setClosing(false);
        setMounted(false);
        setQuery("");
        setScope(null);
        setIndex(0);
      }, 180);
      return () => window.clearTimeout(timer);
    }, [state.open, config.palette.enabled]);
    useEffect(() => {
      const onShortcut = (rawEvent) => {
        const event = rawEvent;
        const eventCombo = comboFromEvent(event);
        if (!eventCombo || !comboHasModifier(eventCombo)) return;
        const shortcuts = settingsRef.current && settingsRef.current.shortcuts || DEFAULT_SETTINGS.shortcuts;
        const traceLeftSidebar = eventCombo === shortcuts.leftSidebar;
        if (traceLeftSidebar) {
          logEvent("info", "shortcut", "leftSidebar:key", {
            repeat: Boolean(event.repeat),
            composing: isComposingEvent(event),
            suppressed: shortcutState.suppressed
          });
        }
        if (isComposingEvent(event) || event.repeat || shortcutState.suppressed) return;
        if (hasBlockingDialog()) {
          if (traceLeftSidebar) logEvent("info", "shortcut", "leftSidebar:blocked", { reason: "dialog" });
          return;
        }
        if (matchCombo(event, shortcuts.palette)) {
          if (settingsRef.current.palette.enabled === false) return;
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (palette) palette.toggle("open");
          return;
        }
        if (paletteOpenRef.current && matchCombo(event, shortcuts.prev)) {
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (palette) palette.set({ move: { dir: -1, at: Date.now() } });
          return;
        }
        if (paletteOpenRef.current && matchCombo(event, shortcuts.next)) {
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (palette) palette.set({ move: { dir: 1, at: Date.now() } });
          return;
        }
        const isSidebarBoard = matchCombo(event, shortcuts.sidebarBoard);
        const isPanelHalf = matchCombo(event, shortcuts.panelHalf);
        const isPanelFull = matchCombo(event, shortcuts.panelFull);
        const isRename = matchCombo(event, shortcuts.rename);
        if (isRename) {
          const target = renameRef.current;
          if (!target || hasBlockingDialog()) {
            logEvent("debug", "shortcut", "rename:blocked", { target: Boolean(target), dialog: hasBlockingDialog() });
            return;
          }
          stopHoldScroll(false);
          if (paletteOpenRef.current && palette) palette.set({ open: false });
          event.preventDefault();
          event.stopPropagation();
          if (typeof props.requestRename === "function") props.requestRename(target.id, target.title);
          return;
        }
        const isSessionMenu = matchCombo(event, shortcuts.sessionMenu);
        if (isSessionMenu) {
          const target = renameRef.current;
          if (!target || hasBlockingDialog()) {
            logEvent("debug", "shortcut", "sessionMenu:blocked", { target: Boolean(target), dialog: hasBlockingDialog() });
            return;
          }
          stopHoldScroll(false);
          if (paletteOpenRef.current && palette) palette.set({ open: false });
          event.preventDefault();
          event.stopPropagation();
          if (typeof props.requestSessionMenu === "function") props.requestSessionMenu(target.id, target.title);
          return;
        }
        if (isSidebarBoard || isPanelHalf || isPanelFull) {
          const boardSettings = settingsRef.current && settingsRef.current.board;
          if (boardSettings && boardSettings.enabled === false) return;
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (paletteOpenRef.current && palette) palette.set({ open: false });
          if (event.pbxBoardActed === true) {
            logEvent("info", "shortcut", "board:duplicate", {});
            return;
          }
          if (typeof props.toggleBoard === "function") {
            props.toggleBoard(isSidebarBoard ? "narrow" : isPanelHalf ? "half" : "full");
          }
          try {
            event.pbxBoardActed = true;
          } catch (error) {
          }
          return;
        }
        if (matchCombo(event, shortcuts.leftSidebar)) {
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (paletteOpenRef.current && palette) palette.set({ open: false });
          if (event.pbxSidebarActed === true) {
            logEvent("info", "shortcut", "leftSidebar:duplicate", {});
            return;
          }
          const acted = typeof props.toggleLeftSidebar === "function" ? props.toggleLeftSidebar() : false;
          if (acted) {
            try {
              event.pbxSidebarActed = true;
            } catch (error) {
            }
          }
          logEvent("info", "shortcut", "leftSidebar:acted", { acted: Boolean(acted), combo: eventCombo });
          return;
        }
        const isHudToggle = matchCombo(event, shortcuts.hud);
        if (isHudToggle) {
          if (paletteOpenRef.current && palette) palette.set({ open: false });
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (!claimPress(event)) {
            logEvent("info", "shortcut", "hud:duplicate", {});
            return;
          }
          if (typeof props.toggleHud === "function") props.toggleHud();
          return;
        }
        const isInterject = matchCombo(event, shortcuts.interject);
        if (isInterject) {
          if (paletteOpenRef.current) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (!claimPress(event)) {
            logEvent("info", "shortcut", "interject:duplicate", {});
            return;
          }
          const acted = interjectEarliestQueued();
          if (!acted && typeof props.notify === "function") {
            props.notify({ tone: "warn", title: "", message: t("toast.interjectNone") });
          }
          return;
        }
        const isUserNext = matchCombo(event, shortcuts.userNext);
        const isUserPrev = matchCombo(event, shortcuts.userPrev);
        if (isUserNext || isUserPrev) {
          if (paletteOpenRef.current) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          if (!claimPress(event)) {
            logEvent("info", "shortcut", "hold:duplicate", {});
            return;
          }
          beginHoldScroll(isUserNext ? 1 : -1, event.code);
          return;
        }
        if (matchCombo(event, shortcuts.scrollBottom)) {
          if (paletteOpenRef.current) {
            event.preventDefault();
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          stopHoldScroll(false);
          if (!claimPress(event)) {
            logEvent("info", "shortcut", "scrollBottom:duplicate", {});
            return;
          }
          scrollToComposerAndFocus();
          return;
        }
        const isNext = matchCombo(event, shortcuts.next);
        const isPrev = matchCombo(event, shortcuts.prev);
        if (isNext || isPrev) {
          if (paletteOpenRef.current) {
            event.preventDefault();
            return;
          }
          const cycle = cycleRef.current || { active: [], current: void 0 };
          const active = cycle.active || [];
          if (active.length === 0) return;
          event.preventDefault();
          event.stopPropagation();
          if (!claimPress(event)) {
            logEvent("info", "shortcut", "cycle:duplicate", {});
            return;
          }
          const position = active.findIndex((row) => row.id === cycle.current);
          const count = active.length;
          const next = isNext ? position < 0 ? 0 : (position + 1) % count : position < 0 ? count - 1 : (position - 1 + count) % count;
          const target = active[next];
          if (target) {
            if (focusRef.current) focusRef.current.set({ id: target.id, at: Date.now() });
            if (typeof openRef.current === "function") openRef.current(target.id);
          }
          return;
        }
        if (event.altKey) logEvent("debug", "shortcut", "unmatched", { combo: eventCombo });
      };
      document.addEventListener("keydown", onShortcut, true);
      return () => document.removeEventListener("keydown", onShortcut, true);
    }, [palette]);
    useEffect(() => {
      if (!state.open) return void 0;
      stopHoldScroll(false);
      return void 0;
    }, [state.open]);
    if (!mounted) return null;
    const close = () => {
      if (palette) palette.set({ open: false });
    };
    const choose = (item) => {
      if (!item) return;
      close();
      if (item.kind === "setting") {
        logEvent("info", "palette", "setting", { id: item.entry.id, origin: item.entry.origin });
        if (typeof chooseSettingRef.current === "function") chooseSettingRef.current(item.entry);
        return;
      }
      const row = item.row;
      logEvent("debug", "palette", "choose", { id: String(row.id || "").slice(-12) });
      if (focusRef.current) focusRef.current.set({ id: row.id, at: Date.now() });
      if (typeof openSession === "function") openSession(row.id);
    };
    const onKeyDown = (event) => {
      if (isComposingEvent(event)) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setIndex((value) => Math.min(value + 1, Math.max(0, items.length - 1)));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (items.length > 0) choose(items[Math.min(index, items.length - 1)]);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (scope) setScope(null);
        else close();
      }
    };
    const groupLabel = (item) => {
      if (item.kind === "session") return t("palette.group.sessions");
      return item.entry.origin === "host" ? t("palette.group.hostSettings") : t("palette.group.pluginSettings");
    };
    const rendered = [];
    let lastGroup = "";
    items.forEach((item, i) => {
      const group = groupLabel(item);
      if (group !== lastGroup) {
        lastGroup = group;
        rendered.push(
          h(
            "div",
            { key: "group-" + i, className: "pbx-paletteGroup", role: "presentation" },
            h("span", { className: "pbx-paletteGroupLabel" }, group)
          )
        );
      }
      const active = i === index;
      if (item.kind === "setting") {
        const entry = item.entry;
        rendered.push(
          h(
            "button",
            {
              key: entry.id,
              type: "button",
              role: "option",
              "aria-selected": active ? "true" : "false",
              className: "pbx-prow pbx-prowSetting" + (active ? " active" : ""),
              onMouseEnter: () => setIndex(i),
              onClick: () => choose(item)
            },
            h(
              "span",
              { className: "pbx-prowSettingIcon", "data-origin": entry.origin },
              h(Icon, { name: entry.origin === "host" ? "sliders" : "board", size: 13 })
            ),
            h("span", { className: "pbx-prowTitle" }, entry.title),
            h("span", { className: "pbx-prowMeta" }, t("palette.setting.open"))
          )
        );
      } else {
        const row = item.row;
        rendered.push(
          h(
            "button",
            {
              key: row.id,
              type: "button",
              role: "option",
              "aria-selected": active ? "true" : "false",
              className: "pbx-prow" + (active ? " active" : "") + (row.archived ? " archived" : ""),
              onMouseEnter: () => setIndex(i),
              onClick: () => choose(item)
            },
            row.info.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.info.tone }),
            h("span", { className: "pbx-prowTitle" }, row.title),
            row.archived ? h("span", { className: "pbx-prowArchived" }, t("palette.archived")) : null,
            h(
              "span",
              { className: "pbx-prowMeta" },
              h(
                "span",
                { className: "pbx-prowWsIcon", style: { color: row.projectColor, background: hexToRgba(row.projectColor, 0.16) } },
                h(Icon, { name: row.projectIcon, size: 10 })
              ),
              row.project
            ),
            h("span", { className: "pbx-prowTime" }, relTime(row.updatedAt, t))
          )
        );
      }
    });
    const blur = Math.min(32, Math.max(6, Number(config.palette.blur) || 15));
    const backdropStyle = {
      background: "rgba(8,10,14,.20)",
      backdropFilter: "blur(" + blur + "px) saturate(1.35)",
      WebkitBackdropFilter: "blur(" + blur + "px) saturate(1.35)"
    };
    const panelStyle = {
      backdropFilter: "blur(" + Math.round(blur * 1.7) + "px) saturate(1.55)",
      WebkitBackdropFilter: "blur(" + Math.round(blur * 1.7) + "px) saturate(1.55)"
    };
    return h(
      "div",
      { className: "pbx-paletteBackdrop" + (closing ? " closing" : ""), style: backdropStyle, onClick: close },
      h(
        "div",
        {
          className: "pbx-palette",
          style: panelStyle,
          role: "dialog",
          "aria-modal": "true",
          "data-pbx-overlay": "palette",
          "aria-label": t("palette.placeholder"),
          onClick: (event) => event.stopPropagation(),
          onKeyDown: (event) => {
            if (isComposingEvent(event)) return;
            if (event.key === "Tab") {
              const panel = event.currentTarget;
              const nodes = Array.prototype.slice.call(panel.querySelectorAll("button, input")).filter(
                (node) => !node.disabled && node.getClientRects().length > 0
              );
              if (nodes.length === 0) return;
              const first = nodes[0];
              const last = nodes[nodes.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
              }
              return;
            }
            if (event.key !== "Escape") return;
            event.preventDefault();
            if (scope) setScope(null);
            else close();
          }
        },
        h(
          "div",
          { className: "pbx-paletteHead" },
          h(Icon, { name: "search", size: 16 }),
          h("input", {
            ref: inputRef,
            className: "pbx-paletteInput",
            value: query,
            placeholder: t("palette.placeholder"),
            "aria-label": t("palette.placeholder"),
            onChange: (event) => setQuery(event.target.value),
            onKeyDown
          })
        ),
        h(
          "div",
          { className: "pbx-paletteChips" },
          h(
            "button",
            {
              type: "button",
              className: "pbx-pchip" + (scope === null ? " on" : ""),
              onClick: () => {
                setScope(null);
                if (inputRef.current) inputRef.current.focus();
              }
            },
            t("palette.allProjects")
          ),
          projects.map(
            (project) => h(
              "button",
              {
                key: project.id,
                type: "button",
                className: "pbx-pchip" + (scope === project.id ? " on" : ""),
                onClick: () => {
                  setScope(scope === project.id ? null : project.id);
                  if (inputRef.current) inputRef.current.focus();
                }
              },
              h(
                "span",
                { className: "pbx-pchipIcon", style: { color: project.color, background: hexToRgba(project.color, 0.16) } },
                h(Icon, { name: project.icon, size: 12 })
              ),
              project.name
            )
          )
        ),
        h(
          "div",
          { className: "pbx-paletteList", ref: listRef },
          items.length === 0 ? h("div", { className: "pbx-paletteEmpty" }, t("palette.empty")) : rendered
        ),
        h("div", { className: "pbx-paletteFoot" }, t("palette.hint", {
          prev: comboDisplay(config.shortcuts.prev),
          next: comboDisplay(config.shortcuts.next),
          palette: comboDisplay(config.shortcuts.palette)
        }))
      )
    );
  }

  // src/features/hud.ts
  function fmtElapsed(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds / 1e3));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor(total % 3600 / 60);
    const seconds = total % 60;
    const pad = (value) => String(value).padStart(2, "0");
    return hours > 0 ? hours + ":" + pad(minutes) + ":" + pad(seconds) : minutes + ":" + pad(seconds);
  }
  function hudContentTop() {
    try {
      const anchor = document.querySelector("[data-chat-anchor-key]");
      let node = anchor ? anchor.parentElement : null;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.getBoundingClientRect().height > 120) return node.getBoundingClientRect().top;
        node = node.parentElement;
      }
      const scroller = document.querySelector(".an3WzG_scrollBody");
      if (scroller) return scroller.getBoundingClientRect().top;
      const flow = document.querySelector('[data-slot="conversation.chat.flow"]');
      if (flow) {
        const rect = flow.getBoundingClientRect();
        if (rect.height > 0) return rect.top;
      }
    } catch (error) {
    }
    return 112;
  }
  var NO_AUTO3 = /* @__PURE__ */ new Set();
  function FloatingStatus(props) {
    const { useSessions, useSessionStatus, useWorkspaces, t, openSession, saveSettings } = props;
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const useScheduleCatalog = typeof props.useScheduleCatalog === "function" ? props.useScheduleCatalog : fallbackHook();
    const useFocus = typeof props.useFocus === "function" ? props.useFocus : fallbackHook();
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const list = useSessions((snapshot) => snapshot);
    const statuses = useSessionStatus((snapshot) => snapshot);
    const wsSnap = useWorkspaces((snapshot) => snapshot);
    const scheduleSnap = useScheduleCatalog((snapshot) => snapshot);
    const autoSet = scheduleSnap && scheduleSnap.activeSessionIds || NO_AUTO3;
    const focusSnap = useFocus((snapshot) => snapshot);
    const hudMaxSessions = Math.min(20, Math.max(1, Number(config.hud.maxSessions) || 6));
    const hudListRowUnit = 51;
    const hudListChrome = 15;
    const hudListMaxHeight = Math.min(
      hudMaxSessions * hudListRowUnit + hudListChrome,
      Math.max(hudListRowUnit + hudListChrome, Math.floor(((window.innerHeight || 800) - 180) / hudListRowUnit) * hudListRowUnit + hudListChrome)
    );
    const [now, setNow] = useState(() => Date.now());
    const [collapsed, setCollapsed] = useState(() => {
      try {
        const saved = window.localStorage.getItem(HUD_COLLAPSE_KEY);
        if (saved === "1") return true;
        if (saved === "0") return false;
      } catch (error) {
      }
      return Boolean(config.hud.defaultCollapsed);
    });
    const [mounted, setMounted] = useState(() => config.hud.enabled !== false);
    const [swap, setSwap] = useState("");
    const [collapseDir, setCollapseDir] = useState("down");
    const swapTimersRef = useRef([]);
    const [pos, setPos] = useState(() => {
      const value = loadJson(HUD_POS_KEY, null);
      return value && typeof value.x === "number" ? value : null;
    });
    const [dragging, setDragging] = useState(false);
    const [hasDragged, setHasDragged] = useState(false);
    const hudDragMovedRef = useRef(false);
    const prevDefaultCollapsedRef = useRef(config.hud.defaultCollapsed);
    const hudRef = useRef(null);
    const listContentRef = useRef(null);
    const rowRectsRef = useRef(null);
    const [listHeight, setListHeight] = useState(0);
    const [hintsHidden, setHintsHidden] = useState(false);
    const [listOverflow, setListOverflow] = useState(false);
    const [hudWidth, setHudWidth] = useState(0);
    const collapsedStateRef = useRef(collapsed);
    collapsedStateRef.current = collapsed;
    const autoDockRef = useRef(false);
    const sidebarSavedRef = useRef(null);
    const [present, setPresent] = useState(false);
    const publishedOrderRef = useRef("");
    const prevCurrentRef = useRef(void 0);
    const [localSpot, setLocalSpot] = useState({ id: null, at: 0 });
    const dragRef = useRef(null);
    const posRef = useRef(pos);
    const startsRef = useRef(null);
    if (startsRef.current === null) {
      const stored = loadJson(HUD_STARTS_KEY, {});
      startsRef.current = { running: stored && stored.running || {}, attention: stored && stored.attention || {} };
    }
    posRef.current = pos;
    useEffect(() => {
      if (config.hud.enabled === false) return void 0;
      const timer = window.setInterval(() => setNow(Date.now()), 1e3);
      return () => window.clearInterval(timer);
    }, [config.hud.enabled]);
    useEffect(() => {
      if (config.hud.enabled === false) {
        const timer = window.setTimeout(() => setMounted(false), 180);
        return () => window.clearTimeout(timer);
      }
      setMounted(true);
      return void 0;
    }, [config.hud.enabled]);
    const configRef = useRef(config);
    configRef.current = config;
    useEffect(() => {
      const runSwap = (mutate) => {
        swapTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        setSwap("out");
        swapTimersRef.current = [
          window.setTimeout(() => {
            mutate();
            setSwap("in");
          }, 120),
          window.setTimeout(() => setSwap(""), 300)
        ];
      };
      const persist = (next) => {
        try {
          window.localStorage.setItem(HUD_COLLAPSE_KEY, next ? "1" : "0");
        } catch (error) {
        }
      };
      const onToggle = () => {
        const current = configRef.current || DEFAULT_SETTINGS;
        if (current.hud.enabled === false) {
          if (typeof saveSettings === "function") {
            const next = cloneJson(current);
            next.hud = Object.assign({}, current.hud, { enabled: true });
            saveSettings(next);
          }
          setCollapsed(false);
          persist(false);
          return;
        }
        runSwap(() => {
          setCollapsed((value) => {
            const next = !value;
            persist(next);
            return next;
          });
        });
      };
      window.addEventListener("pbx-hud-toggle", onToggle);
      return () => {
        window.removeEventListener("pbx-hud-toggle", onToggle);
        swapTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      };
    }, [config.hud.enabled, saveSettings]);
    useEffect(() => {
      if (!pos) return void 0;
      const clamp = () => {
        if (dragging || autoDockRef.current) return;
        const box = hudRef.current;
        const width = box ? box.offsetWidth : 300;
        const height = box ? box.offsetHeight : 220;
        const minTop = hudContentTop() + 4;
        const current = posRef.current;
        const next = {
          x: Math.min(Math.max(4, current.x), Math.max(4, window.innerWidth - width - 4)),
          y: Math.min(Math.max(minTop, current.y), Math.max(minTop, window.innerHeight - height - 4))
        };
        if (next.x !== current.x || next.y !== current.y) {
          setPos(next);
          saveJson(HUD_POS_KEY, next);
        }
      };
      clamp();
      window.addEventListener("resize", clamp);
      return () => window.removeEventListener("resize", clamp);
    }, [pos, dragging]);
    useEffect(() => {
      const handler = () => {
        setCollapsed(Boolean(config.hud.defaultCollapsed));
        setPos(null);
        startsRef.current = { running: {}, attention: {} };
      };
      window.addEventListener("pbx-hud-reset", handler);
      return () => window.removeEventListener("pbx-hud-reset", handler);
    }, [config.hud.defaultCollapsed]);
    useEffect(() => {
      if (prevDefaultCollapsedRef.current === config.hud.defaultCollapsed) return;
      prevDefaultCollapsedRef.current = config.hud.defaultCollapsed;
      try {
        window.localStorage.removeItem(HUD_COLLAPSE_KEY);
      } catch (error) {
      }
      setCollapsed(Boolean(config.hud.defaultCollapsed));
    }, [config.hud.defaultCollapsed]);
    useLayoutEffectSafe(() => {
      const element = listContentRef.current;
      if (!element) return;
      const next = Math.min(element.scrollHeight, hudListMaxHeight);
      setListHeight((previous) => Math.abs(previous - next) > 0.5 ? next : previous);
      setListOverflow((previous) => {
        const overflows = element.scrollHeight > hudListMaxHeight + 1;
        return previous === overflows ? previous : overflows;
      });
    });
    useLayoutEffectSafe(() => {
      const container = listContentRef.current;
      if (!container) return;
      const nodes = container.querySelectorAll("[data-hud-id]");
      const previous = rowRectsRef.current || /* @__PURE__ */ new Map();
      const next = /* @__PURE__ */ new Map();
      const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      nodes.forEach((node) => {
        const id = node.getAttribute("data-hud-id");
        if (!id) return;
        const element = node;
        const top = element.offsetTop;
        const left = element.offsetLeft;
        next.set(id, { top, left });
        const before = previous.get(id);
        if (!before || reduce || dragging || typeof element.animate !== "function") return;
        const dy = before.top - top;
        const dx = before.left - left;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
        try {
          element.animate(
            [{ transform: "translate(" + dx + "px," + dy + "px)" }, { transform: "translate(0,0)" }],
            { duration: 240, easing: "cubic-bezier(0.00, 0.00, 0.20, 1)" }
          );
        } catch (error) {
        }
      });
      rowRectsRef.current = next;
    });
    useEffect(() => {
      if (!dragging) return void 0;
      const SNAP = 28;
      const move = (event) => {
        const drag = dragRef.current || { dx: 0, dy: 0, startX: 0, startY: 0 };
        if (Math.abs(event.clientX - (drag.startX || 0)) + Math.abs(event.clientY - (drag.startY || 0)) <= 4) return;
        hudDragMovedRef.current = true;
        const box = hudRef.current;
        const width = box ? box.offsetWidth : 280;
        const height = box ? box.offsetHeight : 160;
        const gap = 4;
        const rawX = event.clientX - (drag.dx || 0);
        const rawY = event.clientY - (drag.dy || 0);
        const minTop = hudContentTop() + gap;
        const maxX = Math.max(gap, window.innerWidth - width - gap);
        const maxY = Math.max(minTop, window.innerHeight - height - gap);
        let x = Math.min(Math.max(gap, rawX), maxX);
        let y = Math.min(Math.max(minTop, rawY), maxY);
        if (rawX <= SNAP) x = gap;
        else if (rawX + width >= window.innerWidth - SNAP) x = maxX;
        if (rawY <= SNAP) y = minTop;
        else if (rawY + height >= window.innerHeight - SNAP) y = maxY;
        const next = { x, y };
        posRef.current = next;
        setPos(next);
      };
      const up = () => {
        setDragging(false);
        if (!hudDragMovedRef.current) return;
        setHasDragged(true);
        if (posRef.current) saveJson(HUD_POS_KEY, posRef.current);
        if (config.hud.defaultPosition !== "last" && typeof saveSettings === "function") {
          const next = cloneJson(config);
          next.hud = Object.assign({}, next.hud, { defaultPosition: "last" });
          saveSettings(next);
        }
        if (posRef.current) logEvent("debug", "hud", "drag drop", posRef.current);
        window.setTimeout(() => {
          hudDragMovedRef.current = false;
        }, 220);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      return () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
    }, [dragging]);
    const prevBoxRef = useRef({ collapsed: null, width: 0, height: 0, x: 0, y: 0 });
    useLayoutEffectSafe(() => {
      const box = hudRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const previous = prevBoxRef.current;
      if (previous.collapsed !== null && previous.collapsed !== collapsed && posRef.current && width > 0 && height > 0) {
        const gap = 4;
        const rightAnchored = previous.x + previous.width >= window.innerWidth - 10;
        const bottomAnchored = previous.y + previous.height >= window.innerHeight - 10;
        if (rightAnchored || bottomAnchored) {
          const current = posRef.current;
          const next = {
            x: rightAnchored ? Math.max(gap, window.innerWidth - width - gap) : current.x,
            y: bottomAnchored ? Math.max(gap, window.innerHeight - height - gap) : current.y
          };
          setPos(next);
          saveJson(HUD_POS_KEY, next);
        }
      }
      prevBoxRef.current = { collapsed, width, height, x: rect.left, y: rect.top };
      if (autoDockRef.current) return;
      const edge = 26;
      let direction = "down";
      if (rect.bottom >= window.innerHeight - edge) direction = "down";
      else if (rect.right >= window.innerWidth - edge) direction = "right";
      else if (rect.top <= edge) direction = "up";
      else if (rect.left <= edge) direction = "left";
      setCollapseDir((current) => current === direction ? current : direction);
    });
    useEffect(() => {
      if (config.hud.enabled === false) return void 0;
      let last = null;
      const frameNow = () => sidebarFrameElement();
      const sidebarColumn = () => sidebarColumnElement();
      const readExpanded = () => {
        if (isRightbarFullscreen()) return { expanded: false, source: "fullscreen" };
        const frame = frameNow();
        if (frame) {
          const template = frame.style && frame.style.gridTemplateColumns || "";
          const first = parseFloat(template);
          if (Number.isFinite(first) && first >= 0) return { expanded: first > 120, source: "grid" };
        }
        const column = sidebarColumn();
        if (column) {
          const width = column.getBoundingClientRect().width;
          if (width > 120) return { expanded: true, source: "measured" };
          if (width > 0) return { expanded: false, source: "measured" };
        }
        const collapsedFlag = sidebarCollapsedFlag();
        if (collapsedFlag === null) return null;
        return { expanded: !collapsedFlag, source: "attribute" };
      };
      const sidebarRightEdge = () => {
        const column = sidebarColumn();
        const rect = column ? column.getBoundingClientRect() : null;
        if (!rect || rect.width < 60) return null;
        return rect.right;
      };
      const dockPos = (anchor) => {
        const box = hudRef.current;
        const width = box ? box.offsetWidth : 120;
        const height = box ? box.offsetHeight : 34;
        const edge = sidebarRightEdge();
        const fallbackX = Math.max(6, window.innerWidth - width - 12);
        const x = edge == null ? fallbackX : Math.min(fallbackX, Math.max(6, edge + 8));
        const minTop = hudContentTop() + 4;
        const rect = box ? box.getBoundingClientRect() : null;
        const anchorY = anchor && typeof anchor.y === "number" ? anchor.y : rect ? rect.top : minTop;
        const y = Math.min(Math.max(minTop, anchorY), Math.max(minTop, window.innerHeight - height - 8));
        return { x, y };
      };
      let dockTimer = 0;
      let followTimer = 0;
      let settleTimer = 0;
      const clearDockTimers = () => {
        window.clearTimeout(dockTimer);
        window.clearTimeout(followTimer);
        dockTimer = 0;
        followTimer = 0;
      };
      const applyDockPos = () => {
        const saved = sidebarSavedRef.current;
        const next = dockPos(saved && saved.pos);
        posRef.current = next;
        setPos(next);
      };
      const dock = () => {
        if (autoDockRef.current) return;
        autoDockRef.current = true;
        sidebarSavedRef.current = { pos: posRef.current ? Object.assign({}, posRef.current) : null, collapsed: collapsedStateRef.current };
        setCollapsed(true);
        clearDockTimers();
        dockTimer = window.setTimeout(() => {
          dockTimer = 0;
          applyDockPos();
        }, 80);
        followTimer = window.setTimeout(() => {
          followTimer = 0;
          if (autoDockRef.current) applyDockPos();
        }, 320);
        logEvent("info", "hud", "dock", {});
      };
      const restore = () => {
        if (!autoDockRef.current) return;
        autoDockRef.current = false;
        clearDockTimers();
        const saved = sidebarSavedRef.current;
        sidebarSavedRef.current = null;
        if (saved) {
          setCollapsed(Boolean(saved.collapsed));
          if (saved.pos) {
            posRef.current = Object.assign({}, saved.pos);
            setPos(Object.assign({}, saved.pos));
          }
        }
        logEvent("info", "hud", "restore", { hadSaved: Boolean(saved) });
      };
      let sample = null;
      const tick = () => {
        const state = readExpanded();
        if (!state) return;
        const expanded = state.expanded;
        if (state.source === "measured" && expanded !== sample) {
          sample = expanded;
          window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(() => {
            settleTimer = 0;
            tick();
          }, 160);
          return;
        }
        sample = expanded;
        window.clearTimeout(settleTimer);
        if (last === null) {
          last = expanded;
          if (expanded) dock();
          return;
        }
        if (expanded === last) return;
        last = expanded;
        if (expanded) dock();
        else restore();
      };
      const onResize = () => {
        if (!autoDockRef.current) return;
        applyDockPos();
      };
      let raf = 0;
      const schedule = () => {
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          tick();
        });
      };
      const observer = typeof MutationObserver !== "undefined" ? new MutationObserver(schedule) : null;
      if (observer) {
        observer.observe(document.documentElement, {
          subtree: true,
          attributes: true,
          attributeFilter: HOST_LAYOUT_ATTRIBUTES
        });
      }
      const timer = window.setInterval(tick, 800);
      window.addEventListener("resize", onResize);
      tick();
      return () => {
        if (observer) observer.disconnect();
        window.clearInterval(timer);
        window.clearTimeout(settleTimer);
        clearDockTimers();
        window.removeEventListener("resize", onResize);
        if (raf) window.cancelAnimationFrame(raf);
      };
    }, [config.hud.enabled]);
    const onDragStart = (event) => {
      const target = event.target;
      const hitButton = target && target.closest ? target.closest("button") : null;
      if (event.button !== 0 || hitButton && hitButton !== event.currentTarget) return;
      const box = hudRef.current;
      if (!box) return;
      const rect = box.getBoundingClientRect();
      dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, startX: event.clientX, startY: event.clientY };
      hudDragMovedRef.current = false;
      setDragging(true);
      event.preventDefault();
    };
    const archived = new Set(wsSnap && wsSnap.archivedSessionIds || []);
    const ids = list && list.ids || [];
    const byId = list && list.byId || {};
    const wsBySession = /* @__PURE__ */ new Map();
    for (const workspace of wsSnap && wsSnap.items || []) {
      for (const sid of workspace.sessionIds || []) wsBySession.set(sid, workspace);
    }
    const starts = startsRef.current;
    const seenRunning = /* @__PURE__ */ new Set();
    const seenAttention = /* @__PURE__ */ new Set();
    let dirty = false;
    const allRows = [];
    for (const id of ids) {
      const row = byId[id];
      if (!row || row.blank || row.origin === "subagent" || archived.has(id)) continue;
      const info = statusInfo(statuses ? statuses.get(id) : void 0, row);
      const workspace = wsBySession.get(id);
      let start = 0;
      let timed = false;
      if (info.tone === "running") {
        seenRunning.add(id);
        if (!starts.running[id]) {
          starts.running[id] = now;
          dirty = true;
        }
        start = starts.running[id];
        timed = true;
      } else if (info.tone === "attention") {
        seenAttention.add(id);
        if (!starts.attention[id]) {
          starts.attention[id] = now;
          dirty = true;
        }
        start = starts.attention[id];
        timed = true;
      }
      allRows.push({
        id,
        title: sessionTitleOf(row, t),
        project: workspace ? workspaceLabel(workspace.title, t) : "",
        tone: info.tone,
        labelKey: info.labelKey,
        updatedAt: row.updatedAt || 0,
        start,
        timed,
        auto: autoSet.has(id)
      });
    }
    for (const key of Object.keys(starts.running)) {
      if (!seenRunning.has(key)) {
        delete starts.running[key];
        dirty = true;
      }
    }
    for (const key of Object.keys(starts.attention)) {
      if (!seenAttention.has(key)) {
        delete starts.attention[key];
        dirty = true;
      }
    }
    if (dirty) saveJson(HUD_STARTS_KEY, starts);
    const nonIdle = allRows.filter((row) => row.tone !== "idle" && !(row.tone === "done" && config.hud.includeDone === false));
    const included = new Set(nonIdle.map((row) => row.id));
    let recent = [];
    if (config.hud.recentEnabled !== false) {
      const limit = Math.min(20, Math.max(1, Number(config.hud.recentCount) || 5));
      recent = allRows.filter((row) => !included.has(row.id)).filter((row) => !(row.tone === "done" && config.hud.includeDone === false)).filter((row) => !(config.hud.recentExcludeAuto !== false && row.auto)).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit).map((row) => Object.assign({}, row, { recent: true }));
    }
    let currentId;
    for (const id of ids) {
      const row = byId[id];
      if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) {
        currentId = id;
        break;
      }
    }
    useEffect(() => {
      if (!currentId) return;
      const previous = prevCurrentRef.current;
      prevCurrentRef.current = currentId;
      if (previous !== void 0 && previous !== currentId) setLocalSpot({ id: currentId, at: Date.now() });
    }, [currentId]);
    const localSpotAt = localSpot.at || 0;
    const focusSpotAt = focusSnap && focusSnap.at || 0;
    const useLocalSpot = Boolean(localSpot.id) && localSpotAt >= focusSpotAt;
    const spotlightId = useLocalSpot ? localSpot.id : focusSnap && focusSnap.id || localSpot.id;
    const spotlightAt = useLocalSpot ? localSpotAt : focusSpotAt || localSpotAt;
    const spotlightActive = Boolean(spotlightId) && now - spotlightAt < 1800;
    const chosen = nonIdle.concat(recent);
    const chosenIds = new Set(chosen.map((row) => row.id));
    const rowById = new Map(allRows.map((row) => [row.id, row]));
    for (const id of [currentId, spotlightActive ? spotlightId : null]) {
      if (id && !chosenIds.has(id) && rowById.has(id)) {
        chosen.push(Object.assign({}, rowById.get(id)));
        chosenIds.add(id);
      }
    }
    const rows = chosen.map((row) => {
      const decorated = Object.assign({}, row);
      if (row.id === currentId) decorated.current = true;
      if (spotlightActive && row.id === spotlightId) decorated.spotlight = true;
      return decorated;
    });
    const order = { running: 0, attention: 1, done: 2, idle: 3 };
    rows.sort((a, b) => {
      const rank = order[a.tone] - order[b.tone];
      if (rank !== 0) return rank;
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    useLayoutEffectSafe(() => {
      const gap = 14;
      let padded = null;
      const clear = () => {
        if (!padded) return;
        padded.style.paddingLeft = "";
        padded.style.paddingRight = "";
        padded = null;
      };
      const apply2 = () => {
        clear();
        const box = hudRef.current;
        const scroller = findChatScroller();
        if (collapsed || !box || !scroller) return;
        if (!isInsideCentreColumn(scroller)) return;
        const rect = box.getBoundingClientRect();
        const srect = scroller.getBoundingClientRect();
        if (!srect.width) return;
        const leftSide = rect.left + rect.width / 2 <= srect.left + srect.width / 2;
        const reserve = leftSide ? Math.round(rect.right + gap - srect.left) : Math.round(srect.right - (rect.left - gap));
        if (reserve <= 0) return;
        if (srect.width - reserve < 360) return;
        padded = scroller;
        if (leftSide) scroller.style.paddingLeft = reserve + "px";
        else scroller.style.paddingRight = reserve + "px";
      };
      apply2();
      let frame = 0;
      const schedule = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          apply2();
        });
      };
      window.addEventListener("resize", schedule);
      let observer = null;
      let mutationObserver = null;
      const column = centreColumnElement();
      if (column && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(schedule);
        observer.observe(column);
      }
      if (column && typeof MutationObserver !== "undefined") {
        mutationObserver = new MutationObserver(() => apply2());
        mutationObserver.observe(column, { childList: true, subtree: true });
      }
      return () => {
        window.removeEventListener("resize", schedule);
        if (observer) observer.disconnect();
        if (mutationObserver) mutationObserver.disconnect();
        if (frame) cancelAnimationFrame(frame);
        clear();
      };
    }, [collapsed, hudWidth, pos && pos.x, pos && pos.y, rows.length, config.hud.enabled]);
    useLayoutEffectSafe(() => {
      if (!rows.length || collapsed) return;
      const titleEl = listContentRef.current ? listContentRef.current.querySelector(".pbx-hudRowTitle") : null;
      const font = titleEl ? window.getComputedStyle(titleEl).font || "" : "";
      let longest = 0;
      for (const row of rows) {
        const w = measureTextWidth(row.title, font);
        if (w > longest) longest = w;
      }
      if (!longest) return;
      const minWidth = 208;
      const maxWidth = Math.min(420, Math.max(260, window.innerWidth * 0.42));
      const next = Math.round(Math.min(maxWidth, Math.max(minWidth, longest + 124)));
      setHudWidth((previous) => Math.abs(previous - next) > 1 ? next : previous);
    }, [rows.map((row) => row.title).join("|"), collapsed]);
    const fullOrderIds = rows.map((row) => row.id);
    if (rows.length > hudMaxSessions) {
      const keep = rows.slice(0, hudMaxSessions);
      const pinId = currentId || (spotlightActive ? spotlightId : null);
      if (pinId && !keep.some((row) => row.id === pinId)) {
        const pinRow = rows.find((row) => row.id === pinId);
        if (pinRow) {
          keep[hudMaxSessions - 1] = pinRow;
          keep.sort((a, b) => rows.indexOf(a) - rows.indexOf(b));
        }
      }
      rows.length = 0;
      for (const row of keep) rows.push(row);
    }
    useEffect(() => {
      if (!spotlightActive || !spotlightId) return;
      const root = listContentRef.current;
      if (!root) return;
      const target = Array.prototype.find.call(root.querySelectorAll("[data-hud-id]"), (node) => node.getAttribute("data-hud-id") === spotlightId);
      if (target && typeof target.scrollIntoView === "function") target.scrollIntoView({ block: "nearest" });
    }, [spotlightActive, spotlightId]);
    useEffect(() => {
      if (rows.length > 0) {
        setPresent(true);
        return void 0;
      }
      const timer = window.setTimeout(() => setPresent(false), 180);
      return () => window.clearTimeout(timer);
    }, [rows.length]);
    const orderKey = fullOrderIds.join("|");
    useEffect(() => {
      const store = props.hudOrder;
      if (!store || typeof store.set !== "function") return;
      if (config.hud.enabled === false) {
        publishedOrderRef.current = "";
        store.set({ ids: [] });
        return;
      }
      if (publishedOrderRef.current === orderKey) return;
      publishedOrderRef.current = orderKey;
      store.set({ ids: fullOrderIds });
    }, [orderKey, config.hud.enabled]);
    if (config.hud.enabled === false && !mounted) return null;
    const closing = config.hud.enabled === false || rows.length === 0 && present;
    if (rows.length === 0 && !present) return null;
    const positionMode = config.hud.defaultPosition || "top-right";
    const useSavedPosition = Boolean(pos) && (positionMode === "last" || dragging || hasDragged);
    const style = Object.assign(
      {},
      useSavedPosition && pos ? { left: pos.x + "px", top: pos.y + "px" } : {},
      !collapsed && hudWidth ? { width: hudWidth + "px" } : {}
    );
    const className = "pbx-hud" + (useSavedPosition ? " moved" : " default" + (positionMode === "bottom-right" ? " bottom" : "")) + (dragging ? " dragging" : "") + (closing ? " closing" : "");
    const runningCount = rows.filter((row) => row.tone === "running").length;
    const attentionCount = rows.filter((row) => row.tone === "attention").length;
    const archiveRow = async (row) => {
      if (!row) return;
      if (typeof props.archiveSession !== "function") {
        logEvent("warn", "hud", "archive-unsupported", { id: String(row.id || "").slice(-12) });
        if (typeof props.notify === "function") {
          props.notify({ tone: "warn", title: t("hud.title"), message: t("hud.archiveUnavailable"), ttl: 5e3 });
        }
        return;
      }
      logEvent("info", "hud", "archive", { id: String(row.id || "").slice(-12) });
      let result = null;
      try {
        result = await props.archiveSession(row.id);
      } catch (error) {
        result = { ok: false, error: { message: String(error && error.message || error) } };
      }
      const ok = !result || result.ok !== false;
      if (typeof props.notify === "function") {
        props.notify(
          ok ? { tone: "success", title: t("hud.title"), message: t("toast.archived"), ttl: 3200 } : {
            tone: "warn",
            title: t("hud.title"),
            message: t("menu.failed", { message: result.error && result.error?.message || "archive failed" }),
            ttl: 5e3
          }
        );
      }
    };
    if (collapsed) {
      const pillTone = runningCount > 0 ? " live" : attentionCount > 0 ? " attention" : "";
      return h(
        "button",
        {
          ref: hudRef,
          type: "button",
          className: className + " collapsed",
          style,
          title: t("hud.expand"),
          onPointerDown: onDragStart,
          onClick: () => {
            if (hudDragMovedRef.current) {
              hudDragMovedRef.current = false;
              return;
            }
            setCollapsed(false);
            try {
              window.localStorage.setItem(HUD_COLLAPSE_KEY, "0");
            } catch (error) {
            }
          }
        },
        h("span", { className: "pbx-hudPillIcon" + pillTone }, h(Icon, { name: "grid", size: 13 })),
        h("span", { className: "pbx-hudPillText" }, String(runningCount)),
        h("span", { className: "pbx-hudPillLabel" }, t("hud.running")),
        attentionCount > 0 ? h("span", { className: "pbx-hudPillAttn", title: t("stat.attention") }, String(attentionCount)) : null
      );
    }
    return h(
      "div",
      { ref: hudRef, className, style },
      h(
        "div",
        { className: "pbx-hudInner" + (swap ? " " + swap : "") },
        h(
          "div",
          { className: "pbx-hudHead", onPointerDown: onDragStart },
          h("span", { className: "pbx-hudGrip", "aria-hidden": "true" }),
          h("span", { className: "pbx-hudHeadTitle" }, t("hud.title")),
          h("span", { className: "pbx-hudCount" }, String(rows.length)),
          h(
            "button",
            {
              type: "button",
              className: "pbx-hudCollapse",
              title: t("hud.collapse"),
              "aria-label": t("hud.collapse"),
              onClick: () => {
                logEvent("debug", "hud", "collapse", { dir: collapseDir });
                setCollapsed(true);
                try {
                  window.localStorage.setItem(HUD_COLLAPSE_KEY, "1");
                } catch (error) {
                }
              }
            },
            h(Icon, { name: collapseDir, size: 14 })
          )
        ),
        h(
          "div",
          {
            className: "pbx-hudList" + (listOverflow ? " scrollable" : ""),
            style: Object.assign({ maxHeight: hudListMaxHeight + "px" }, listHeight > 0 ? { height: listHeight + "px" } : {})
          },
          h(
            "div",
            { ref: listContentRef, className: "pbx-hudListInner" },
            rows.map(
              (row) => h(
                "div",
                {
                  key: row.id,
                  role: "button",
                  tabIndex: 0,
                  "data-hud-id": row.id,
                  className: "pbx-hudRow" + (row.auto ? " auto" : "") + (row.tone === "running" ? " live" : "") + (row.current ? " current" : "") + (row.spotlight ? " spotlight" : ""),
                  title: t("card.open"),
                  onClick: () => {
                    if (typeof openSession === "function") openSession(row.id);
                  },
                  onKeyDown: (event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (typeof openSession === "function") openSession(row.id);
                  }
                },
                row.tone === "running" ? h(RunRing, { size: 9 }) : h("span", { className: "pbx-rdot", "data-tone": row.tone }),
                row.auto ? h("span", { className: "pbx-hudAuto", title: t("kind.auto") }, h(Icon, { name: "clock", size: 11 })) : null,
                h(
                  "span",
                  { className: "pbx-hudRowMain" },
                  h("span", { className: "pbx-hudRowTitle" }, row.title),
                  h(
                    "span",
                    { className: "pbx-hudRowMeta" },
                    t(row.labelKey) + (row.auto ? " · " + t("hud.auto") : "") + (row.project ? " · " + row.project : "") + (row.current ? " · " + t("card.current") : row.recent ? " · " + t("hud.recent") : "")
                  )
                ),
                h("span", { className: "pbx-hudTimer" }, row.timed ? fmtElapsed(now - row.start) : relTime(row.updatedAt, t)),
                h(
                  "span",
                  {
                    className: "pbx-hudArchive",
                    role: "button",
                    tabIndex: -1,
                    title: t("hud.archive"),
                    "aria-label": t("hud.archive"),
                    onClick: (event) => {
                      event.stopPropagation();
                      void archiveRow(row);
                    },
                    onKeyDown: (event) => {
                      event.stopPropagation();
                    }
                  },
                  h(Icon, { name: "archive", size: 16 })
                )
              )
            )
          )
        ),
        !hintsHidden && config.hints && config.hints.shortcuts !== false ? h(
          "div",
          { className: "pbx-hudFoot" },
          h(
            "div",
            { className: "pbx-hudFootRow" },
            h("span", { className: "pbx-hudFootTitle" }, t("hud.groupSession")),
            h(
              "span",
              { className: "pbx-hudFootItem" },
              h("kbd", { className: "pbx-hudKey" }, comboDisplay(config.shortcuts.prev)),
              h("span", { className: "pbx-hudFootLabel" }, t("hud.prev"))
            ),
            h(
              "span",
              { className: "pbx-hudFootItem" },
              h("kbd", { className: "pbx-hudKey" }, comboDisplay(config.shortcuts.next)),
              h("span", { className: "pbx-hudFootLabel" }, t("hud.next"))
            )
          ),
          h(
            "div",
            { className: "pbx-hudFootRow" },
            h("span", { className: "pbx-hudFootTitle" }, t("hud.groupMessage")),
            h(
              "span",
              { className: "pbx-hudFootItem" },
              h("kbd", { className: "pbx-hudKey" }, comboDisplay(config.shortcuts.userPrev)),
              h("span", { className: "pbx-hudFootLabel" }, t("hud.prevInstruction"))
            ),
            h(
              "span",
              { className: "pbx-hudFootItem" },
              h("kbd", { className: "pbx-hudKey" }, comboDisplay(config.shortcuts.userNext)),
              h("span", { className: "pbx-hudFootLabel" }, t("hud.nextInstruction"))
            ),
            h(
              "span",
              { className: "pbx-hudFootItem" },
              h("kbd", { className: "pbx-hudKey" }, comboDisplay(config.shortcuts.scrollBottom)),
              h("span", { className: "pbx-hudFootLabel" }, t("hud.toBottom"))
            )
          ),
          h(
            "button",
            {
              type: "button",
              className: "pbx-hudFootClose",
              title: t("hints.dismiss"),
              "aria-label": t("hints.dismiss"),
              onClick: (event) => {
                event.stopPropagation();
                logEvent("debug", "hud", "hints hidden");
                setHintsHidden(true);
              }
            },
            "×"
          )
        ) : null
      )
    );
  }

  // src/features/dialogs.ts
  function RenameDialog(props) {
    const useRename = typeof props.useRename === "function" ? props.useRename : fallbackHook();
    const snap = useRename((value) => value) || {};
    if (!snap.sessionId) return null;
    return h(
      RenameForm,
      Object.assign({}, props, {
        key: snap.sessionId + ":" + (snap.at || 0),
        request: { sessionId: snap.sessionId, currentTitle: snap.currentTitle || "", at: snap.at || 0 }
      })
    );
  }
  function RenameForm(props) {
    const { t, request } = props;
    const [draft, setDraft] = useState(request.currentTitle);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef(null);
    const openerRef = useRef(null);
    const rename = props.rename;
    useEffect(() => {
      openerRef.current = document.activeElement;
      if (inputRef.current) {
        inputRef.current.focus({ preventScroll: true });
        inputRef.current.select();
      }
      return () => {
        const opener = openerRef.current;
        if (opener && opener.isConnected && typeof opener.focus === "function") {
          try {
            opener.focus({ preventScroll: true });
          } catch (caught) {
          }
        }
      };
    }, []);
    const close = () => {
      if (!busy) rename.set({ sessionId: null, currentTitle: "" });
    };
    useEffect(() => {
      const onKey = (event) => {
        if (event.key !== "Escape" || busy || isComposingEvent(event)) return;
        event.preventDefault();
        event.stopPropagation();
        rename.set({ sessionId: null, currentTitle: "" });
      };
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, [busy, rename]);
    const trimmed = draft.trim();
    const submit = () => {
      if (busy || !trimmed) return;
      setBusy(true);
      setError("");
      Promise.resolve(props.renameSession ? props.renameSession(request.sessionId, trimmed) : { ok: false }).then((result) => {
        if (result && result.ok === false) {
          setBusy(false);
          setError(result.error && result.error.message || t("rename.failed"));
          return;
        }
        rename.set({ sessionId: null, currentTitle: "" });
      }).catch((reason) => {
        setBusy(false);
        setError(reason && reason.message || t("rename.failed"));
      });
    };
    const onKeyDown = (event) => {
      if (event.key !== "Enter" || isComposingEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      submit();
    };
    const onCardKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const card = event.currentTarget;
      const nodes = Array.prototype.slice.call(card.querySelectorAll("input, button")).filter(
        (node) => !node.disabled && node.getClientRects().length > 0
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    return h(
      "div",
      { className: "pbx-renameBackdrop", onClick: close },
      h(
        "div",
        {
          className: "pbx-renameCard",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": t("rename.title"),
          onClick: (event) => event.stopPropagation(),
          onKeyDown: onCardKeyDown
        },
        h("div", { className: "pbx-renameTitle" }, t("rename.title")),
        h("div", { className: "pbx-renameLabel" }, t("rename.label")),
        h("input", {
          ref: inputRef,
          className: "pbx-renameInput",
          value: draft,
          spellCheck: false,
          "aria-label": t("rename.label"),
          placeholder: t("rename.placeholder"),
          onChange: (event) => {
            setDraft(event.target.value);
            if (error) setError("");
          },
          onKeyDown
        }),
        error ? h("div", { className: "pbx-renameError" }, error) : null,
        h(
          "div",
          { className: "pbx-renameActions" },
          h("button", { type: "button", className: "pbx-renameBtn", disabled: busy, onClick: close }, t("rename.cancel")),
          h(
            "button",
            { type: "button", className: "pbx-renameBtn primary", disabled: busy || !trimmed, onClick: submit },
            busy ? t("rename.saving") : t("rename.confirm")
          )
        )
      )
    );
  }
  function SessionMenuDialog(props) {
    const useMenu = typeof props.useSessionMenu === "function" ? props.useSessionMenu : fallbackHook();
    const snap = useMenu((value) => value) || {};
    if (!snap.sessionId) return null;
    return h(
      SessionMenuForm,
      Object.assign({}, props, {
        key: snap.sessionId + ":" + String(snap.at || ""),
        sessionId: snap.sessionId,
        sessionTitle: snap.title || ""
      })
    );
  }
  function SessionMenuForm(props) {
    const { t, sessionId, sessionTitle } = props;
    const [busy, setBusy] = useState("");
    const [error, setError] = useState("");
    const [confirmDelete, setConfirmDelete] = useState(false);
    const cardRef = useRef(null);
    const cancelRef = useRef(null);
    const openerRef = useRef(null);
    const close = () => {
      if (typeof props.closeSessionMenu === "function") props.closeSessionMenu();
    };
    useEffect(() => {
      openerRef.current = document.activeElement;
      if (cancelRef.current) cancelRef.current.focus({ preventScroll: true });
      return () => {
        const opener = openerRef.current;
        if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus({ preventScroll: true });
      };
    }, []);
    useEffect(() => {
      const onKey = (event) => {
        if (event.key !== "Escape" || isComposingEvent(event) || busy) return;
        event.preventDefault();
        event.stopPropagation();
        close();
      };
      document.addEventListener("keydown", onKey, true);
      return () => document.removeEventListener("keydown", onKey, true);
    }, [busy]);
    const run = async (kind) => {
      if (busy) return;
      if (kind === "delete" && confirmDelete !== true) {
        setConfirmDelete(true);
        return;
      }
      setError("");
      setBusy(kind);
      try {
        const result = kind === "archive" ? await (props.archiveSession ? props.archiveSession(sessionId) : null) : kind === "cancel" ? await (props.cancelSession ? props.cancelSession(sessionId) : null) : await (props.deleteSession ? props.deleteSession(sessionId) : null);
        const value = result;
        if (value && value.ok) {
          close();
          return;
        }
        const code = value && value.error ? value.error.code : "";
        if (kind === "delete" && (code === "unsupported" || code === "unavailable")) {
          setError(t("menu.deleteUnavailable"));
        } else if (kind === "cancel" && (code === "unsupported" || code === "unavailable")) {
          setError(t("menu.stopUnavailable"));
        } else {
          setError(t("menu.failed", { message: value && value.error && value.error.message || code || "failed" }));
        }
      } catch (errorValue) {
        setError(t("menu.failed", { message: String(errorValue && errorValue.message ? errorValue.message : errorValue) }));
      } finally {
        setBusy("");
      }
    };
    const onCardKeyDown = (event) => {
      if (event.key !== "Tab" || !cardRef.current) return;
      const nodes = Array.prototype.slice.call(cardRef.current.querySelectorAll("button")).filter(
        (node) => !node.disabled && node.getClientRects().length > 0
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const deleteSupported = props.deleteSupported === true;
    return h(
      "div",
      { className: "pbx-renameBackdrop", onClick: close },
      h(
        "div",
        {
          ref: cardRef,
          className: "pbx-renameCard",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": t("menu.title"),
          onClick: (event) => event.stopPropagation(),
          onKeyDown: onCardKeyDown
        },
        h("div", { className: "pbx-renameTitle" }, t("menu.title")),
        h(
          "div",
          { className: "pbx-menuSession" },
          h("div", { className: "pbx-menuSessionLabel" }, t("menu.sessionLabel")),
          h("div", { className: "pbx-menuSessionTitle", title: sessionTitle || sessionId }, sessionTitle || sessionId)
        ),
        h("div", { className: "pbx-menuSubtitle" }, t("menu.subtitle")),
        h(
          "button",
          { type: "button", className: "pbx-menuOption", disabled: Boolean(busy), onClick: () => void run("archive") },
          h("span", { className: "pbx-menuOptionIcon archive" }, h(Icon, { name: "archive", size: 15 })),
          h(
            "span",
            { className: "pbx-menuOptionBody" },
            h("span", { className: "pbx-menuOptionTitle" }, busy === "archive" ? t("menu.busy") : t("menu.archiveTitle")),
            h("span", { className: "pbx-menuOptionDesc" }, t("menu.archiveDesc"))
          ),
          h("span", { className: "pbx-menuOptionChev", "aria-hidden": "true" }, "›")
        ),
        /* Stopping is offered above deleting: it is the safe step when a turn is stuck. */
        h(
          "button",
          { type: "button", className: "pbx-menuOption", disabled: Boolean(busy), onClick: () => void run("cancel") },
          h("span", { className: "pbx-menuOptionIcon" }, h(Icon, { name: "alert", size: 15 })),
          h(
            "span",
            { className: "pbx-menuOptionBody" },
            h("span", { className: "pbx-menuOptionTitle" }, busy === "cancel" ? t("menu.busy") : t("menu.stopTitle")),
            h("span", { className: "pbx-menuOptionDesc" }, t("menu.stopHint"))
          ),
          h("span", { className: "pbx-menuOptionChev", "aria-hidden": "true" }, "›")
        ),
        h(
          "button",
          {
            type: "button",
            className: "pbx-menuOption danger",
            disabled: Boolean(busy) || !deleteSupported,
            onClick: () => void run("delete")
          },
          h("span", { className: "pbx-menuOptionIcon danger" }, h(Icon, { name: "alert", size: 15 })),
          h(
            "span",
            { className: "pbx-menuOptionBody" },
            h(
              "span",
              { className: "pbx-menuOptionTitle" },
              busy === "delete" ? t("menu.busy") : confirmDelete ? t("menu.deleteConfirm") : t("menu.deleteTitle")
            ),
            h(
              "span",
              { className: "pbx-menuOptionDesc" },
              !deleteSupported ? t("menu.deleteUnsupportedDesc") : confirmDelete ? t("menu.confirmDesc") : t("menu.deleteDesc")
            )
          ),
          h("span", { className: "pbx-menuOptionChev", "aria-hidden": "true" }, "›")
        ),
        error ? h("div", { className: "pbx-renameError" }, error) : null,
        h(
          "div",
          { className: "pbx-menuFoot" },
          h("span", { className: "pbx-menuFootHint" }, t("menu.footerHint")),
          h("button", { ref: cancelRef, type: "button", className: "pbx-renameBtn", disabled: Boolean(busy), onClick: close }, t("menu.cancel"))
        )
      )
    );
  }

  // src/features/settings.ts
  function SettingsPage(props) {
    const { t } = props;
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
    const saveSettings = typeof props.saveSettings === "function" ? props.saveSettings : function() {
    };
    const useLogs = typeof props.useLogs === "function" ? props.useLogs : fallbackHook();
    const logsSnap = useLogs((value) => value) || { entries: [] };
    const logEntries = Array.isArray(logsSnap.entries) ? logsSnap.entries : [];
    const [recording, setRecording] = useState(null);
    const [recordError, setRecordError] = useState("");
    const [builtinWarnings, setBuiltinWarnings] = useState([]);
    const scannedConflictsRef = useRef(/* @__PURE__ */ new Set());
    const selfConflicts = (() => {
      const owners = /* @__PURE__ */ new Map();
      for (const action of Object.keys(config.shortcuts || {})) {
        const combo = config.shortcuts[action];
        if (!owners.has(combo)) owners.set(combo, [action]);
        else owners.get(combo).push(action);
      }
      const found = [];
      for (const [combo, actions] of owners) {
        if (actions.length < 2) continue;
        found.push({ combo, names: actions.map((action) => t(SHORTCUT_LABEL_KEYS[action] || "settings.shortcut.palette")) });
      }
      return found;
    })();
    const useWorkspaces = typeof props.useWorkspaces === "function" ? props.useWorkspaces : fallbackHook();
    const wsSnap = useWorkspaces((value) => value);
    const ghWorkspaces = (wsSnap && wsSnap.items || []).filter((item) => item && item.path);
    const [ghTesting, setGhTesting] = useState(false);
    const [ghTest, setGhTest] = useState(null);
    const useSettingsTarget = typeof props.useSettingsTarget === "function" ? props.useSettingsTarget : fallbackHook();
    const settingsTarget = useSettingsTarget((snapshot) => snapshot) || { key: null, at: 0 };
    const ANCHOR_LABEL_KEYS = {
      shortcuts: "settings.shortcuts",
      headerButtons: "settings.headerButtons",
      behavior: "settings.behavior",
      github: "settings.githubTitle",
      logging: "settings.logging",
      data: "settings.data"
    };
    useEffect(() => {
      const key = settingsTarget.key;
      if (!key || !settingsTarget.at || !ANCHOR_LABEL_KEYS[key]) return void 0;
      let raf = 0;
      let timer = 0;
      const reveal = () => {
        const wanted = t(ANCHOR_LABEL_KEYS[key]).trim();
        const heads = document.querySelectorAll(".pbx-setSectionTitle");
        for (const head of Array.prototype.slice.call(heads)) {
          if ((head.textContent || "").trim() !== wanted) continue;
          const section = head.closest(".pbx-setSection");
          if (!section) continue;
          if (typeof section.scrollIntoView === "function") section.scrollIntoView({ block: "center" });
          section.classList.add("pbx-setHighlight");
          timer = window.setTimeout(() => section.classList.remove("pbx-setHighlight"), 2200);
          break;
        }
      };
      raf = window.requestAnimationFrame(reveal);
      return () => {
        if (raf) window.cancelAnimationFrame(raf);
        if (timer) window.clearTimeout(timer);
      };
    }, [settingsTarget.key, settingsTarget.at]);
    useEffect(() => {
      if (!recording) return void 0;
      shortcutState.suppressed = true;
      const onKey = (event) => {
        if (isComposingEvent(event)) return;
        if (event.key === "Escape" && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
          event.preventDefault();
          event.stopPropagation();
          setRecording(null);
          setRecordError("");
          return;
        }
        const combo = comboFromEvent(event);
        if (!combo) return;
        event.preventDefault();
        event.stopPropagation();
        if (!comboHasModifier(combo)) {
          setRecordError(t("settings.shortcutNeedModifier", MODIFIER_LABELS));
          return;
        }
        const next = cloneJson(config);
        const conflict = Object.keys(next.shortcuts).find((key) => key !== recording && next.shortcuts[key] === combo);
        if (conflict) {
          const message = t("toast.conflictOwn", {
            combo: comboDisplay(combo),
            name: t(SHORTCUT_LABEL_KEYS[conflict] || "settings.shortcut.palette")
          });
          setRecordError(message);
          if (typeof props.notify === "function") props.notify({ tone: "warn", title: t("toast.conflictTitle"), message });
          return;
        }
        if (typeof props.findBuiltinConflict === "function") {
          const builtin = props.findBuiltinConflict(combo);
          if (builtin) {
            const message = t("toast.conflictBuiltin", { combo: comboDisplay(combo), name: builtin.label });
            setRecordError(message);
            if (typeof props.notify === "function") props.notify({ tone: "warn", title: t("toast.conflictTitle"), message });
            return;
          }
        }
        setRecordError("");
        next.shortcuts[recording] = combo;
        saveSettings(next);
        setRecording(null);
      };
      document.addEventListener("keydown", onKey, true);
      return () => {
        shortcutState.suppressed = false;
        document.removeEventListener("keydown", onKey, true);
      };
    }, [recording, config, saveSettings]);
    const useShortcutsCatalog = typeof props.useShortcutsCatalog === "function" ? props.useShortcutsCatalog : fallbackHook();
    const shortcutsCatalog = useShortcutsCatalog((value) => value);
    useEffect(() => {
      if (typeof props.findBuiltinConflict !== "function") return;
      const found = [];
      for (const key of Object.keys(config.shortcuts || {})) {
        const combo = config.shortcuts[key];
        const conflict = props.findBuiltinConflict(combo);
        if (conflict) found.push({ key, combo, label: conflict.label });
      }
      setBuiltinWarnings(found);
      const present = new Set(found.map((item) => item.key + ":" + item.combo));
      for (const signature of Array.from(scannedConflictsRef.current)) {
        if (!present.has(signature)) scannedConflictsRef.current.delete(signature);
      }
      for (const item of found) {
        const signature = item.key + ":" + item.combo;
        if (scannedConflictsRef.current.has(signature)) continue;
        scannedConflictsRef.current.add(signature);
        if (typeof props.notify === "function") {
          props.notify({
            tone: "warn",
            title: t("toast.conflictTitle"),
            message: t("toast.conflictExisting", { combo: comboDisplay(item.combo), name: item.label })
          });
        }
      }
    }, [config.shortcuts, shortcutsCatalog]);
    const readSection = (section) => {
      const live = config[section];
      if (live && typeof live === "object") return live;
      const fallback = DEFAULT_SETTINGS[section];
      return fallback && typeof fallback === "object" ? fallback : {};
    };
    const numberIn = (section, key, min, max) => {
      const raw = Number(readSection(section)[key]);
      if (Number.isFinite(raw)) return Math.min(max, Math.max(min, raw));
      const shipped = Number(DEFAULT_SETTINGS[section]?.[key]);
      return Number.isFinite(shipped) ? Math.min(max, Math.max(min, shipped)) : min;
    };
    const update = (section, patch) => {
      const next = cloneJson(config);
      const current = next[section];
      const base = current && typeof current === "object" ? current : cloneJson(DEFAULT_SETTINGS[section] || {});
      Object.assign(base, patch);
      next[section] = base;
      saveSettings(next);
    };
    const resetAll = () => {
      saveSettings(cloneJson(DEFAULT_SETTINGS));
      try {
        window.localStorage.removeItem(HUD_COLLAPSE_KEY);
        window.localStorage.removeItem(HUD_POS_KEY);
        window.localStorage.removeItem(HUD_STARTS_KEY);
        window.localStorage.removeItem(BOARD_WIDTH_KEY);
        window.dispatchEvent(new Event("pbx-hud-reset"));
      } catch (error) {
      }
    };
    const githubRepos = config.githubRepos || {};
    const repoNameFromPath = (path) => path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
    const setGithubToken = (value) => {
      const next = cloneJson(config);
      if (value) next.githubToken = value;
      else delete next.githubToken;
      saveSettings(next);
    };
    const updateGithubRepo = (path, patch) => {
      const next = cloneJson(config);
      const repos = { ...next.githubRepos || {} };
      const existing = repos[path] || { owner: "", repo: "" };
      repos[path] = { ...existing, ...patch };
      next.githubRepos = repos;
      saveSettings(next);
    };
    const renameRepoPath = (oldPath, newPath) => {
      if (!oldPath || oldPath === newPath) return;
      const next = cloneJson(config);
      const repos = { ...next.githubRepos || {} };
      const value = repos[oldPath];
      if (!value) return;
      delete repos[oldPath];
      repos[newPath] = value;
      next.githubRepos = repos;
      saveSettings(next);
    };
    const removeGithubRepo = (path) => {
      const next = cloneJson(config);
      const repos = { ...next.githubRepos || {} };
      delete repos[path];
      next.githubRepos = repos;
      saveSettings(next);
    };
    const addGithubRepo = () => {
      const next = cloneJson(config);
      const repos = { ...next.githubRepos || {} };
      const candidate = ghWorkspaces.find((item) => item.path && !repos[item.path]);
      if (candidate && candidate.path) {
        repos[candidate.path] = { owner: "", repo: repoNameFromPath(candidate.path) };
      } else if (!repos[""]) {
        repos[""] = { owner: "", repo: "" };
      } else {
        return;
      }
      next.githubRepos = repos;
      saveSettings(next);
    };
    const githubErrorText = (code) => {
      if (code === "token-invalid") return t("col.errTokenInvalid");
      if (code === "rate-limited") return t("col.errRateLimited");
      if (code === "repo-not-found") return t("col.errRepoNotFound");
      return t("settings.githubTestFail");
    };
    const testGithub = async () => {
      setGhTesting(true);
      setGhTest(null);
      try {
        const stats = await fetchRepoStats("octocat", "hello-world", config.githubToken);
        setGhTest(stats.status === "ok" ? { ok: true, text: config.githubToken ? t("settings.githubTestOk") : t("settings.githubTestOkNoToken") } : { ok: false, text: githubErrorText(stats.error) });
      } catch (error) {
        setGhTest({ ok: false, text: t("settings.githubTestFail") });
      } finally {
        setGhTesting(false);
      }
    };
    const renderGithubRepos = () => {
      const listed = ghWorkspaces.length > 0 ? ghWorkspaces.map((item) => item.path) : Object.keys(githubRepos);
      if (listed.length === 0) return [h("div", { className: "pbx-setHint" }, t("settings.githubNone"))];
      return listed.map((path) => {
        const setting = githubRepos[path] || { owner: "", repo: repoNameFromPath(path) };
        return h(
          "div",
          { className: "pbx-githubRepo", key: "gh-" + path },
          ghWorkspaces.length > 0 ? h("div", { className: "pbx-githubPath", title: path }, path) : h("input", {
            type: "text",
            className: "pbx-setInput pbx-githubPathInput",
            "aria-label": t("settings.githubPath"),
            defaultValue: path,
            onBlur: (event) => renameRepoPath(path, event.target.value)
          }),
          h("input", {
            type: "text",
            className: "pbx-setInput pbx-githubOwner",
            "aria-label": t("settings.githubOwner"),
            placeholder: t("settings.githubOwner"),
            value: setting.owner,
            onInput: (event) => updateGithubRepo(path, { owner: event.target.value })
          }),
          h("input", {
            type: "text",
            className: "pbx-setInput pbx-githubRepoName",
            "aria-label": t("settings.githubRepo"),
            placeholder: t("settings.githubPlaceholderRepo"),
            value: setting.repo,
            onInput: (event) => updateGithubRepo(path, { repo: event.target.value })
          }),
          h("input", {
            type: "text",
            className: "pbx-setInput pbx-githubLocal",
            "aria-label": t("settings.githubLocalVersion"),
            placeholder: t("settings.githubLocalVersion"),
            value: setting.localVersion || "",
            onInput: (event) => updateGithubRepo(path, { localVersion: event.target.value })
          }),
          h(
            "button",
            { type: "button", className: "pbx-setBtn pbx-githubRemove", "aria-label": t("settings.githubRemoveRepo"), title: t("settings.githubRemoveRepo"), onClick: () => removeGithubRepo(path) },
            "×"
          )
        );
      });
    };
    const resetAppearance = () => {
      try {
        window.localStorage.removeItem(STORE_KEY);
      } catch (error) {
      }
      try {
        window.dispatchEvent(new Event("pbx-appearance-reset"));
      } catch (error) {
      }
    };
    const copyLogs = async () => {
      const text = JSON.stringify(logEntries, null, 1);
      try {
        await navigator.clipboard.writeText(text);
        if (typeof props.notify === "function") {
          props.notify({ tone: "success", title: t("settings.logging"), message: t("settings.logCopied"), ttl: 5e3 });
        }
      } catch (error) {
        if (typeof props.notify === "function") {
          props.notify({ tone: "warn", title: t("settings.logging"), message: t("settings.logCopyFailed"), ttl: 6e3 });
        }
      }
    };
    const clearLogs = () => {
      try {
        if (props.logs && typeof props.logs.set === "function") props.logs.set({ entries: [] });
      } catch (error) {
      }
      try {
        window.localStorage.removeItem(LOG_KEY);
      } catch (error) {
      }
      logEvent("info", "settings", "logs cleared");
    };
    const row = (key, labelKey, descKey, control, disabled = false) => h(
      "div",
      { className: "pbx-setRow" + (disabled ? " pbx-setRowOff" : ""), key, "data-setting": key },
      h("div", { className: "pbx-setRowText" }, h("div", { className: "pbx-setLabel" }, t(labelKey)), descKey ? h("div", { className: "pbx-setDesc" }, t(descKey)) : null),
      h("div", { className: "pbx-setControl" }, control)
    );
    const shortcutRow = (key, labelKey) => row(
      "sc-" + key,
      labelKey,
      null,
      h(
        "button",
        {
          type: "button",
          className: "pbx-keycap" + (recording === key ? " recording" : ""),
          title: t("settings.shortcutResetHint"),
          onClick: () => {
            setRecordError("");
            setRecording(recording === key ? null : key);
          },
          onDoubleClick: () => {
            const next = cloneJson(config);
            next.shortcuts[key] = DEFAULT_SETTINGS.shortcuts[key];
            setRecordError("");
            setRecording(null);
            saveSettings(next);
          }
        },
        recording === key ? t("settings.recording") : comboDisplay(config.shortcuts[key])
      )
    );
    const toggleRow = (section, key, labelKey, descKey, disabled = false) => {
      const values = readSection(section);
      return row(
        section + "-" + key,
        labelKey,
        descKey || null,
        h(
          "button",
          {
            type: "button",
            role: "switch",
            "aria-checked": Boolean(values[key]),
            "aria-label": t(labelKey),
            disabled,
            className: "pbx-switch" + (values[key] ? " on" : ""),
            onClick: () => update(section, { [key]: !values[key] })
          },
          h("span", { className: "pbx-switchThumb" })
        ),
        disabled
      );
    };
    const selectRow = (section, key, labelKey, options, disabled = false) => {
      const values = readSection(section);
      return row(
        section + "-" + key,
        labelKey,
        null,
        h(
          "select",
          {
            className: "pbx-setSelect",
            disabled,
            value: String(values[key]),
            onChange: (event) => update(section, { [key]: event.target.value })
          },
          options.map((option) => h("option", { key: option.value, value: option.value }, t(option.labelKey)))
        ),
        disabled
      );
    };
    const numberRow = (section, key, labelKey, min, max, step, disabled = false) => {
      const value = numberIn(section, key, min, max);
      return row(
        section + "-" + key,
        labelKey,
        null,
        h("input", {
          key: section + "-" + key + "-" + value,
          type: "number",
          className: "pbx-setInput",
          disabled,
          defaultValue: value,
          min,
          max,
          step,
          onBlur: (event) => {
            const target = event.target;
            const raw = String(target.value || "").trim();
            const parsed = Number(raw);
            if (raw === "" || !Number.isFinite(parsed)) {
              target.value = String(value);
              return;
            }
            const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
            target.value = String(clamped);
            if (clamped !== value) update(section, { [key]: clamped });
          },
          onKeyDown: (event) => {
            const target = event.currentTarget;
            if (event.key === "Enter") target.blur();
            if (event.key === "Escape") {
              target.value = String(value);
              target.blur();
            }
          }
        }),
        disabled
      );
    };
    const rangeRow = (section, key, labelKey, min, max, step, disabled = false) => {
      const value = numberIn(section, key, min, max);
      return row(
        section + "-" + key,
        labelKey,
        null,
        h(
          "span",
          { className: "pbx-setRange" },
          h("input", {
            type: "range",
            disabled,
            min,
            max,
            step,
            value,
            onChange: (event) => update(section, { [key]: Number(event.target.value) })
          }),
          h("span", { className: "pbx-setRangeValue" }, String(value))
        ),
        disabled
      );
    };
    const headerButtonRow = (id, labelKey) => {
      const item = config.headerButtons && config.headerButtons[id] || DEFAULT_SETTINGS.headerButtons[id];
      const patchItem = (patch) => {
        const next = cloneJson(config);
        next.headerButtons = next.headerButtons || cloneJson(DEFAULT_SETTINGS.headerButtons);
        next.headerButtons[id] = Object.assign({}, item, patch);
        saveSettings(next);
      };
      return row(
        "hb-" + id,
        labelKey,
        null,
        h(
          "span",
          { className: "pbx-setInline" },
          config.header && config.header.placement === "composer" ? h("span", { className: "pbx-setMuted" }, t("settings.hb.followPlacement")) : h(
            "select",
            {
              className: "pbx-setSelect",
              value: item.side,
              onChange: (event) => patchItem({ side: event.target.value })
            },
            h("option", { value: "left" }, t("settings.hb.sideLeft")),
            h("option", { value: "right" }, t("settings.hb.sideRight"))
          ),
          h(
            "button",
            {
              type: "button",
              role: "switch",
              "aria-checked": !item.hidden,
              className: "pbx-switch" + (item.hidden ? "" : " on"),
              onClick: () => patchItem({ hidden: !item.hidden })
            },
            h("span", { className: "pbx-switchThumb" })
          )
        )
      );
    };
    const sectionOn = (section) => readSection(section).enabled !== false;
    const boardOn = () => sectionOn("board");
    const hudOn = () => sectionOn("hud");
    const paletteOn = () => sectionOn("palette");
    const notifyOn = () => sectionOn("notify");
    const logOn = () => sectionOn("log");
    const hudRecentOn = () => hudOn() && readSection("hud").recentEnabled !== false;
    return h(
      "div",
      { className: "pbx-setPage" },
      h("h2", { className: "pbx-setTitle" }, t("settings.title")),
      h("p", { className: "pbx-setIntro" }, t("settings.intro")),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.shortcuts")),
        shortcutRow("palette", "settings.shortcut.palette"),
        shortcutRow("prev", "settings.shortcut.prev"),
        shortcutRow("next", "settings.shortcut.next"),
        shortcutRow("userPrev", "settings.shortcut.userPrev"),
        shortcutRow("userNext", "settings.shortcut.userNext"),
        shortcutRow("scrollBottom", "settings.shortcut.scrollBottom"),
        shortcutRow("sidebarBoard", "settings.shortcut.sidebarBoard"),
        shortcutRow("leftSidebar", "settings.shortcut.leftSidebar"),
        shortcutRow("panelHalf", "settings.shortcut.panelHalf"),
        shortcutRow("panelFull", "settings.shortcut.panelFull"),
        shortcutRow("rename", "settings.shortcut.rename"),
        shortcutRow("sessionMenu", "settings.shortcut.sessionMenu"),
        shortcutRow("interject", "settings.shortcut.interject"),
        shortcutRow("hud", "settings.shortcut.hud"),
        builtinWarnings.map(
          (item) => h(
            "div",
            { key: "warn-" + item.key, className: "pbx-setWarn" },
            t("toast.conflictExisting", { combo: comboDisplay(item.combo), name: item.label })
          )
        ),
        selfConflicts.map(
          (item) => h(
            "div",
            { key: "self-" + item.combo, className: "pbx-setWarn", "data-self-conflict": item.combo },
            t("settings.selfConflict", { combo: comboDisplay(item.combo), names: item.names.join(" / ") })
          )
        ),
        recordError ? h("div", { className: "pbx-setError" }, recordError) : null,
        h("div", { className: "pbx-setHint" }, t("settings.shortcut.hint", MODIFIER_LABELS))
      ),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.headerButtons")),
        selectRow("header", "placement", "settings.headerPlacement", [
          { value: "header", labelKey: "settings.placement.header" },
          { value: "composer", labelKey: "settings.placement.composer" }
        ]),
        ["switch", "historyNav", "capsule"].map((id) => headerButtonRow(id, "settings.hb." + id)),
        h("div", { className: "pbx-setHint" }, config.header.placement === "composer" ? t("settings.composerButtonsHint") : t("settings.headerButtonsHint", MODIFIER_LABELS))
      ),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.behavior")),
        toggleRow("palette", "enabled", "settings.paletteEnabled", "settings.paletteEnabledDesc"),
        toggleRow("palette", "includeArchived", "settings.paletteArchived", "settings.paletteArchivedDesc", !paletteOn()),
        toggleRow("hints", "shortcuts", "settings.shortcutHints", "settings.shortcutHintsDesc"),
        toggleRow("hud", "enabled", "settings.hudEnabled", "settings.hudEnabledDesc"),
        toggleRow("hud", "includeDone", "settings.hudDone", "settings.hudDoneDesc", !hudOn()),
        toggleRow("hud", "recentEnabled", "settings.hudRecent", "settings.hudRecentDesc", !hudOn()),
        numberRow("hud", "recentCount", "settings.hudRecentCount", 1, 20, 1, !hudRecentOn()),
        numberRow("hud", "maxSessions", "settings.hudMaxSessions", 1, 20, 1, !hudOn()),
        toggleRow("hud", "recentExcludeAuto", "settings.hudRecentExcludeAuto", "settings.hudRecentExcludeAutoDesc", !hudRecentOn()),
        toggleRow("hud", "defaultCollapsed", "settings.hudCollapsed", "settings.hudCollapsedDesc", !hudOn()),
        selectRow("hud", "defaultPosition", "settings.hudPosition", [
          { value: "top-right", labelKey: "settings.pos.top" },
          { value: "bottom-right", labelKey: "settings.pos.bottom" },
          { value: "last", labelKey: "settings.pos.last" }
        ], !hudOn()),
        toggleRow("board", "enabled", "settings.boardEnabled", "settings.boardEnabledDesc"),
        numberRow("board", "wideThreshold", "settings.boardThreshold", 320, 1e3, 20, !boardOn()),
        selectRow("board", "defaultView", "settings.boardView", [
          { value: "sessions", labelKey: "view.sessions" },
          { value: "projects", labelKey: "view.projects" }
        ], !boardOn()),
        h("div", { className: "pbx-setSubTitle" }, t("settings.projectColumns")),
        PROJECT_COLUMNS.map((def) => toggleRow("projectColumns", def.key, def.labelKey, void 0, !boardOn())),
        h("div", { className: "pbx-setHint" }, t("settings.projectColumnsHint")),
        toggleRow("notify", "enabled", "settings.notifyEnabled", "settings.notifyEnabledDesc"),
        toggleRow("notify", "sound", "settings.notifySound", "settings.notifySoundDesc", !notifyOn()),
        toggleRow("chat", "autoHistory", "settings.chatAutoHistory", "settings.chatAutoHistoryDesc"),
        rangeRow("palette", "blur", "settings.blur", 6, 32, 1, !paletteOn())
      ),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.githubTitle")),
        h("div", { className: "pbx-setHint" }, t("settings.githubDesc")),
        row(
          "gh-token",
          "settings.githubToken",
          "settings.githubTokenDesc",
          h(
            "div",
            { className: "pbx-githubToken" },
            h("input", {
              type: "password",
              className: "pbx-setInput pbx-githubTokenInput",
              "aria-label": t("settings.githubToken"),
              value: config.githubToken || "",
              placeholder: "ghp_…",
              onInput: (event) => setGithubToken(event.target.value)
            }),
            h("button", { type: "button", className: "pbx-setBtn", disabled: ghTesting, onClick: () => void testGithub() }, ghTesting ? t("settings.githubTesting") : t("settings.githubTest"))
          )
        ),
        ghTest ? h("div", { role: "status", className: "pbx-setHint" + (ghTest.ok ? " pbx-githubOk" : " pbx-setError") }, ghTest.text) : null,
        config.githubToken && config.githubToken.startsWith("{{") && config.githubToken.endsWith("}}") ? h("div", { className: "pbx-setHint pbx-setError" }, t("settings.githubTokenPlaceholderWarn")) : null,
        h("div", { className: "pbx-setSubTitle" }, t("settings.githubReposTitle")),
        h("div", { className: "pbx-setHint" }, t("settings.githubReposHint")),
        ...renderGithubRepos(),
        h("div", { className: "pbx-setActions" }, h("button", { type: "button", className: "pbx-setBtn", onClick: addGithubRepo }, t("settings.githubAddRepo")))
      ),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.logging")),
        toggleRow("log", "enabled", "settings.logEnabled", "settings.logEnabledDesc"),
        selectRow("log", "level", "settings.logLevel", [
          { value: "error", labelKey: "settings.logLevelError" },
          { value: "warn", labelKey: "settings.logLevelWarn" },
          { value: "info", labelKey: "settings.logLevelInfo" },
          { value: "debug", labelKey: "settings.logLevelDebug" }
        ], !logOn()),
        numberRow("log", "max", "settings.logMax", 20, 500, 10, !logOn()),
        h("div", { className: "pbx-setHint" }, t("settings.logHint", { count: String(logEntries.length) })),
        h(
          "div",
          { className: "pbx-setActions" },
          h("button", { type: "button", className: "pbx-setBtn", onClick: () => void copyLogs() }, t("settings.logCopy")),
          h("button", { type: "button", className: "pbx-setBtn danger", onClick: clearLogs }, t("settings.logClear"))
        )
      ),
      h(
        "section",
        { className: "pbx-setSection" },
        h("h3", { className: "pbx-setSectionTitle" }, t("settings.data")),
        h(
          "div",
          { className: "pbx-setActions" },
          h("button", { type: "button", className: "pbx-setBtn", onClick: resetAll }, t("settings.reset")),
          h("button", { type: "button", className: "pbx-setBtn danger", onClick: resetAppearance }, t("settings.resetAppearance"))
        ),
        h("div", { className: "pbx-setHint" }, t("settings.resetAppearanceHint"))
      )
    );
  }

  // src/features/notifications.ts
  var EMPTY_TOASTS = { items: [] };
  function useStoreSnapshot(store, empty) {
    const [snapshot, setSnapshot] = useState(() => store ? store.getSnapshot() : empty);
    useEffect(() => {
      if (!store) return void 0;
      setSnapshot(store.getSnapshot());
      return store.subscribe(() => setSnapshot(store.getSnapshot()));
    }, [store]);
    return store ? snapshot : empty;
  }
  function ToastStack(props) {
    const { t, dismissToast } = props;
    const snap = useStoreSnapshot(props.toasts, EMPTY_TOASTS);
    const items = snap && snap.items || [];
    if (items.length === 0) return null;
    return h(
      "div",
      { className: "pbx-toasts", role: "status", "aria-live": "polite" },
      items.map(
        (item) => h(
          "div",
          { key: item.id, className: "pbx-toast", "data-tone": item.tone || "warn" },
          h("span", { className: "pbx-toastIcon" }, h(Icon, { name: item.tone === "success" ? "check" : "alert", size: 15 })),
          h(
            "div",
            { className: "pbx-toastMain" },
            item.title ? h("div", { className: "pbx-toastTitle" }, item.title) : null,
            item.message ? h("div", { className: "pbx-toastMsg" }, item.message) : null
          ),
          h(
            "button",
            {
              type: "button",
              className: "pbx-toastClose",
              title: t("toast.dismiss"),
              "aria-label": t("toast.dismiss"),
              onClick: () => {
                if (typeof dismissToast === "function") dismissToast(item.id);
              }
            },
            h(Icon, { name: "close", size: 12 })
          )
        )
      )
    );
  }
  var notificationAudio = null;
  function playNotifyChime() {
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!notificationAudio) notificationAudio = new Ctor();
      const context = notificationAudio;
      if (context.state === "suspended") {
        try {
          void context.resume();
        } catch (error) {
        }
      }
      const start = context.currentTime + 0.01;
      [880, 1174.66].forEach((frequency, index) => {
        const at = start + index * 0.13;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(1e-4, at);
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
        gain.gain.exponentialRampToValueAtTime(1e-4, at + 0.32);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.34);
      });
    } catch (error) {
    }
  }
  function notificationChannelFocused() {
    try {
      return document.visibilityState === "visible" && document.hasFocus();
    } catch (error) {
      return true;
    }
  }
  function showSystemNotification(title, body, sessionId, onOpen) {
    try {
      const Ctor = window.Notification;
      if (typeof Ctor !== "function") return false;
      const present = () => {
        try {
          const note = new Ctor(title, { body, tag: String(sessionId || "dsh-task") });
          note.onclick = () => {
            try {
              window.focus();
            } catch (error) {
            }
            if (typeof onOpen === "function") onOpen();
            try {
              note.close();
            } catch (error) {
            }
          };
          return true;
        } catch (error) {
          return false;
        }
      };
      if (Ctor.permission === "granted") return present();
      if (Ctor.permission === "default" && typeof Ctor.requestPermission === "function") {
        Ctor.requestPermission().then((result) => {
          if (result === "granted") present();
        }).catch(() => {
        });
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }
  function sessionFailureReason(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return "";
    const record = snapshot;
    const lastAgentError = record.lastAgentError;
    if (typeof lastAgentError === "string" && lastAgentError.trim()) return lastAgentError.trim().slice(0, 240);
    const promptError = record.promptError;
    const message = promptError && promptError.error ? promptError.error.message : void 0;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 240);
    return "";
  }
  function NotificationWatcher(props) {
    const { t } = props;
    const useSessions = typeof props.useSessions === "function" ? props.useSessions : fallbackHook();
    const useStatus = typeof props.useSessionStatus === "function" ? props.useSessionStatus : fallbackHook();
    const useSettings = typeof props.useSettings === "function" ? props.useSettings : fallbackHook();
    const sessionsSnap = useSessions((value) => value);
    const statuses = useStatus((value) => value);
    const config = useSettings((value) => value) || DEFAULT_SETTINGS;
    const previousRef = useRef(null);
    const configRef = useRef(config);
    configRef.current = config;
    useEffect(() => {
      if (!statuses) return;
      const previous = previousRef.current;
      const next = /* @__PURE__ */ new Map();
      statuses.forEach((status, sessionId) => {
        const pending = status ? status.pendingInteraction : null;
        const sig = (status && status.running === true ? "run" : "idle") + "|" + (pending ? String(pending.kind) + ":" + String(pending.key || "") : "") + "|" + (status && status.completionUnread === true ? "unread" : "");
        next.set(sessionId, { status, pending, sig });
      });
      previousRef.current = next;
      if (previous === null) return;
      const settings = configRef.current || DEFAULT_SETTINGS;
      if (settings.notify && settings.notify.enabled === false) return;
      const byId = sessionsSnap && sessionsSnap.byId || {};
      const focused = notificationChannelFocused();
      const typing = (function() {
        const el = document.activeElement;
        if (!el) return false;
        return el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable === true;
      })();
      const sound = !(settings.notify && settings.notify.sound === false);
      const openSession = typeof props.openSession === "function" ? props.openSession : null;
      const emit = typeof props.notify === "function" ? props.notify : null;
      const send = (sessionId, tone, title, body, ttl) => {
        if (!body || !emit) return;
        if (!focused && !typing && typeof props.system === "function") {
          const delivered = props.system(title, body, sessionId, openSession ? () => openSession(sessionId) : null);
          if (delivered) return;
        }
        emit({ tone, title, body, ttl, sessionId });
        if (sound) playNotifyChime();
      };
      previous.forEach((prev, sessionId) => {
        const cur = next.get(sessionId);
        if (!cur || !prev) return;
        if (prev.sig === cur.sig) return;
        const title = sessionTitleOf(byId[sessionId], t) || sessionId;
        const prevPending = prev.pending;
        const curPending = cur.pending;
        if (curPending && (!prevPending || prevPending.key !== curPending.key)) {
          const isApproval = curPending.kind === "approval";
          const head = isApproval ? t("notif.approvalTitle") : t("notif.questionTitle");
          const body = isApproval ? t("notif.approvalSimple", { title }) : t("notif.pendingSimple", { title });
          send(sessionId, "warn", head, body, 2e4);
          return;
        }
        if (prev.status && prev.status.running === true && cur.status && cur.status.running !== true && !curPending) {
          const failure = typeof props.failureOf === "function" ? props.failureOf(sessionId) : "";
          if (failure) {
            send(sessionId, "error", t("notif.failTitle"), t("notif.failBodyReason", { title, reason: failure }), 14e3);
            return;
          }
          send(sessionId, "success", t("notif.completeTitle"), t("notif.completeBody", { title }), 9e3);
        }
      });
    }, [statuses, sessionsSnap]);
    return null;
  }
  function NotificationDock(props) {
    const { t } = props;
    const useNotifications = typeof props.useNotifications === "function" ? props.useNotifications : fallbackHook();
    const snap = useNotifications((value) => value);
    const items = snap && snap.items || [];
    const [bounds, setBounds] = useState({ right: 16, bottom: 16 });
    useEffect(() => {
      if (items.length === 0) return void 0;
      const update = () => {
        const scroller = findChatScroller();
        const rect = scroller ? scroller.getBoundingClientRect() : null;
        const right = rect && rect.width > 4 ? Math.max(12, window.innerWidth - rect.right + 12) : 16;
        const composer = document.querySelector("[data-composer-card]");
        const composerRect = composer ? composer.getBoundingClientRect() : null;
        const bottom = composerRect && composerRect.height > 0 ? Math.max(14, Math.round(window.innerHeight - composerRect.top + 8)) : 16;
        setBounds((previous) => Math.abs(previous.right - right) < 1 && Math.abs(previous.bottom - bottom) < 1 ? previous : { right, bottom });
      };
      update();
      window.addEventListener("resize", update);
      const timer = window.setInterval(update, 1e3);
      return () => {
        window.removeEventListener("resize", update);
        window.clearInterval(timer);
      };
    }, [items.length]);
    if (items.length === 0) return null;
    const open = (item) => {
      if (typeof props.openSession === "function" && item.sessionId) props.openSession(item.sessionId);
      if (typeof props.dismissNotif === "function") props.dismissNotif(item.id);
    };
    return h(
      "div",
      { className: "pbx-notifDock", style: { right: bounds.right + "px", bottom: bounds.bottom + "px" }, role: "status", "aria-live": "polite" },
      items.map(
        (item) => h(
          "div",
          {
            key: item.id,
            className: "pbx-notifCard",
            "data-tone": item.tone || "success",
            role: "button",
            tabIndex: 0,
            onClick: () => open(item),
            onKeyDown: (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open(item);
              }
            }
          },
          h(
            "div",
            { className: "pbx-notifHead" },
            h("span", { className: "pbx-notifGlyph" }, h(Icon, { name: item.tone === "success" ? "check" : "alert", size: 14 })),
            h("span", { className: "pbx-notifTitle" }, item.title || ""),
            h(
              "button",
              {
                type: "button",
                className: "pbx-notifClose",
                title: t("notif.dismiss"),
                "aria-label": t("notif.dismiss"),
                onClick: (event) => {
                  event.stopPropagation();
                  if (typeof props.dismissNotif === "function") props.dismissNotif(item.id);
                }
              },
              h(Icon, { name: "close", size: 12 })
            )
          ),
          item.body ? h("div", { className: "pbx-notifBody" }, item.body) : null,
          h("div", { className: "pbx-notifFoot" }, t("notif.openHint"))
        )
      )
    );
  }

  // src/features/guard.ts
  function BoardSessionGuard(props) {
    const useSessions = typeof props.useSessions === "function" ? props.useSessions : fallbackHook();
    const snapshot = useSessions((value) => value);
    const byId = snapshot && snapshot.byId || {};
    const currentId = useMemo(() => {
      for (const id of Object.keys(byId)) {
        const row = byId[id];
        if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return id;
      }
      return null;
    }, [byId]);
    const stateRef = useRef({ id: null, state: { open: false, mode: null }, settleUntil: 0 });
    const propsRef = useRef(props);
    propsRef.current = props;
    const sameState = (left, right) => {
      const a = left || { open: false, mode: null };
      const b = right || { open: false, mode: null };
      if (Boolean(a.open) !== Boolean(b.open)) return false;
      if (!a.open) return true;
      if (a.mode !== b.mode) return false;
      if (typeof a.width === "number" && typeof b.width === "number") return Math.abs(a.width - b.width) <= 24;
      return true;
    };
    useEffect(() => {
      if (!currentId) return void 0;
      const api = propsRef.current;
      const previous = stateRef.current;
      if (previous.id === currentId) return void 0;
      const want = previous.id === null ? api.boardStateNow() : previous.state;
      stateRef.current = { id: currentId, state: want, settleUntil: Date.now() + 3e3 };
      if (previous.id === null) return void 0;
      let enforceTimer = 0;
      let acted = false;
      const enforce = () => {
        const live = propsRef.current;
        if (typeof live.intentRecent === "function" && live.intentRecent()) {
          stateRef.current = { id: currentId, state: live.boardStateNow(), settleUntil: Date.now() + 500 };
          return;
        }
        const observed = live.boardStateNow();
        if (sameState(observed, want)) {
          stateRef.current = { id: currentId, state: want, settleUntil: Date.now() + 500 };
          return;
        }
        if (acted) {
          logEvent("info", "board", "restore kept host state", {
            want,
            observed
          });
          stateRef.current = { id: currentId, state: observed, settleUntil: Date.now() + 500 };
          return;
        }
        acted = true;
        logEvent("info", "board", "restore after switch", want);
        live.setBoardState(want);
        enforceTimer = window.setTimeout(enforce, 260);
      };
      enforceTimer = window.setTimeout(enforce, 320);
      return () => window.clearTimeout(enforceTimer);
    }, [currentId]);
    useEffect(() => {
      const timer = window.setInterval(() => {
        const current = stateRef.current;
        if (Date.now() < current.settleUntil) return;
        const live = propsRef.current;
        if (!live || typeof live.boardStateNow !== "function") return;
        stateRef.current = { id: current.id, state: live.boardStateNow(), settleUntil: current.settleUntil };
      }, 450);
      return () => window.clearInterval(timer);
    }, []);
    return null;
  }

  // src/apply.ts
  var INJECT = ["slots", "locale", "uiWorkspace", "remote", "remote.session", "remote.schedule", "remote.agentPresets", "sidebarRight", "sidebarRightTabs", "layout"];
  var optionalService = (ctx, name) => {
    try {
      const direct = ctx[name];
      if (direct) return direct;
      return typeof ctx.get === "function" ? ctx.get(name) ?? null : null;
    } catch (error) {
      return null;
    }
  };
  function apply(ctx) {
    setDisposed(false);
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), "project-board: dictionaries");
    ctx.effect(() => {
      const root = document.documentElement;
      root.setAttribute("data-pbx-platform", IS_MAC ? "darwin" : "other");
      return () => {
        root.removeAttribute("data-pbx-platform");
      };
    }, "project-board: platform marker");
    ctx.effect(() => {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@dsh-tac";
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        tag.remove();
      };
    }, "project-board: styles");
    let scheduleSource = null;
    ctx.effect(() => {
      if (!ctx.remote || !ctx.remote.schedule) return void 0;
      const created = createScheduleSource(ctx);
      scheduleSource = created.source;
      return () => {
        scheduleSource = null;
        created.dispose();
      };
    }, "project-board: automation catalog");
    let presetSource = null;
    ctx.effect(() => {
      if (!ctx.remote || !ctx.remote.agentPresets) return void 0;
      const created = createPresetSource(ctx);
      presetSource = created.source;
      return () => {
        presetSource = null;
        created.dispose();
      };
    }, "project-board: agent presets");
    ctx.effect(() => {
      const onFocusIn = (event) => {
        try {
          const target = event && event.target;
          if (!target || typeof target.matches !== "function") return;
          if (!target.matches('textarea, [contenteditable="true"]')) return;
          const rect = target.getBoundingClientRect();
          if (rect.width < 8 || rect.height < 8) return;
          const value = target.value;
          const hasText = typeof value === "string" ? value.length > 0 : Boolean(target.textContent && target.textContent.trim().length > 0);
          if (!hasText) return;
          moveCaretToEnd(target);
          later(() => moveCaretToEnd(target), 0);
          later(() => moveCaretToEnd(target), 140);
        } catch (error) {
        }
      };
      document.addEventListener("focusin", onFocusIn, true);
      return () => document.removeEventListener("focusin", onFocusIn, true);
    }, "project-board: composer caret");
    const uiWorkspace = optionalService(ctx, "uiWorkspace");
    const shortcutsService = optionalService(ctx, "shortcuts");
    const openSession = (sessionId) => {
      logEvent("debug", "session", "open", { id: String(sessionId || "").slice(-12) });
      try {
        if (uiWorkspace) uiWorkspace.openSession(sessionId);
      } catch (error) {
        logEvent("warn", "session", "open failed", { reason: String(error && error.message || error) });
      }
    };
    const paletteStore = createUiStore({ open: false, move: { dir: 0, at: 0 } });
    const focusStore = createUiStore({ id: null, at: 0 });
    const hudOrderStore = createUiStore({ ids: [] });
    const headerDragStore = createUiStore({
      id: null,
      side: null,
      index: -1,
      width: 0
    });
    const toastStore = createUiStore({ items: [], seq: 0 });
    let toastSeq = 0;
    const dismissToast = (id) => {
      toastStore.set({ items: toastStore.getSnapshot().items.filter((item) => item.id !== id) });
    };
    const pushToast = (input) => {
      const source = input || {};
      toastSeq += 1;
      const item = { id: toastSeq, tone: source.tone || "warn", title: source.title || "", message: source.message || "" };
      toastStore.set({ seq: toastSeq, items: toastStore.getSnapshot().items.concat([item]).slice(-4) });
      window.setTimeout(() => dismissToast(item.id), Math.max(4e3, Number(source.ttl) || 4800));
      return item.id;
    };
    const notifStore = createUiStore({
      items: [],
      seq: 0
    });
    let notifSeq = 0;
    const dismissNotif = (id) => {
      notifStore.set({ items: notifStore.getSnapshot().items.filter((item) => item.id !== id) });
    };
    const pushNotif = (input) => {
      const source = input || {};
      logEvent("info", "notify", "queued", { tone: source.tone || "success" });
      notifSeq += 1;
      const item = {
        id: notifSeq,
        tone: source.tone || "success",
        title: source.title || "",
        body: source.body || "",
        sessionId: source.sessionId || null
      };
      notifStore.set({ seq: notifSeq, items: notifStore.getSnapshot().items.concat([item]).slice(-3) });
      window.setTimeout(() => dismissNotif(item.id), Math.max(4e3, Number(source.ttl) || 9e3));
      return item.id;
    };
    const findBuiltinConflict = (combo) => {
      try {
        const shortcuts = optionalService(ctx, "shortcuts");
        const rows = shortcuts && shortcuts.catalog && typeof shortcuts.catalog.getSnapshot === "function" ? shortcuts.catalog.getSnapshot() : null;
        if (!rows || !Array.isArray(rows)) return null;
        const target = comboBindingOf(combo);
        if (!target) return null;
        for (const row of rows) {
          if (!row || !row.binding || row.issue) continue;
          if (Array.isArray(row.conflicts) && row.conflicts.length > 0) continue;
          if (bindingsOverlap(target, row.binding)) {
            return { id: row.id, label: row.label || row.id };
          }
        }
      } catch (error) {
      }
      return null;
    };
    const settingsStore = createUiStore(loadSettings());
    const settingsCatalogStore = createUiStore({ host: [], plugin: [], seq: 0 });
    const settingsTargetStore = createUiStore({ key: null, at: 0 });
    const refreshSettingsCatalog = () => {
      try {
        settingsCatalogStore.set({
          host: readHostSections(ctx),
          plugin: pluginSettingEntries(ctx.locale.bind(NS)),
          seq: Date.now()
        });
      } catch (error) {
        logEvent("warn", "palette", "settings-catalog", { reason: String(error && error.message || error) });
      }
    };
    refreshSettingsCatalog();
    ctx.effect(() => {
      const slots = ctx.slots;
      if (typeof slots.subscribe !== "function") return void 0;
      try {
        const off = slots.subscribe("settings.section", refreshSettingsCatalog);
        return () => {
          try {
            off();
          } catch (error) {
          }
        };
      } catch (error) {
        return void 0;
      }
    }, "project-board: settings catalog");
    const chooseSetting = (entry) => {
      const result = openSettingsTarget(ctx, entry.sectionId);
      settingsTargetStore.set({ key: entry.anchor || null, at: Date.now() });
      logEvent("info", "settings", "open-from-palette", { id: entry.id, result });
      if (result === "failed") {
        pushToast({ tone: "warn", title: "", message: ctx.locale.bind(NS)("toast.settingsOpenFailed") });
      } else if (result !== "section") {
        pushToast({ tone: "info", title: "", message: ctx.locale.bind(NS)("toast.settingsOpenPartial") });
      }
      return result !== "failed";
    };
    const logStore = createUiStore(loadJson(LOG_KEY, { entries: [] }));
    setLogConfigGetter(() => settingsStore.getSnapshot().log || DEFAULT_SETTINGS.log);
    const later = (run, delay) => trackTimer(run, delay);
    const cancelLater = (id) => cancelTimer(id);
    let logPersistTimer = 0;
    setLogSink((entry) => {
      try {
        const config = logConfigNow();
        const max = Math.max(20, Number(config.max) || 200);
        const entries = (logStore.getSnapshot().entries || []).concat([entry]).slice(-max);
        logStore.set({ entries });
        if (logPersistTimer) return;
        logPersistTimer = window.setTimeout(() => {
          logPersistTimer = 0;
          try {
            saveJson(LOG_KEY, { entries: logStore.getSnapshot().entries.slice(-120) });
          } catch (error) {
          }
        }, 800);
      } catch (error) {
      }
    });
    ctx.effect(
      () => () => {
        setDisposed(true);
        if (logPersistTimer) {
          window.clearTimeout(logPersistTimer);
          logPersistTimer = 0;
        }
      },
      "project-board: pending timers"
    );
    const writeSettings = (next) => {
      const merged = mergeSettings(DEFAULT_SETTINGS, next);
      merged.headerButtonsVersion = 3;
      merged.hintsVersion = 1;
      merged.shortcutsVersion = 1;
      merged.boardProjVersion = 1;
      persistSettings(merged);
      settingsStore.set(merged);
      logEvent("info", "settings", "saved");
    };
    const toggleHud = () => {
      try {
        window.dispatchEvent(new CustomEvent("pbx-hud-toggle"));
      } catch (error) {
        console.warn("project-board: toggle hud failed", error);
      }
    };
    const boardHooks = () => Object.assign({ settings: settingsStore }, scheduleSource ? { scheduleCatalog: scheduleSource } : {}, presetSource ? { presets: presetSource } : {});
    const rightBoardActive = () => {
      try {
        const active = ctx.sidebarRight && typeof ctx.sidebarRight.active === "function" ? ctx.sidebarRight.active() : void 0;
        return Boolean(active && active.kind === BOARD_KIND);
      } catch (error) {
        return false;
      }
    };
    const collapseRightBoard = () => {
      try {
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        if (boardPanelVisible() && rightBoardActive()) sidebarRight.toggleExpanded();
      } catch (error) {
      }
    };
    const boardPanelVisible = () => isRightPanelExpanded();
    const rightbarWidthNow = () => hostRightbarWidth();
    const BOARD_NARROW_WIDTH = 380;
    const BOARD_NARROW_MAX = 460;
    const boardWidthDefault = () => {
      try {
        const saved = Number(window.localStorage.getItem(BOARD_WIDTH_KEY));
        if (Number.isFinite(saved) && saved >= 280) return Math.round(saved);
      } catch (error) {
      }
      const now = rightbarWidthNow();
      if (now >= 280) return Math.round(now);
      return 380;
    };
    const persistBoardWidth = (px) => {
      if (!(px >= 280)) return;
      try {
        window.localStorage.setItem(BOARD_WIDTH_KEY, String(Math.round(px)));
      } catch (error) {
      }
    };
    const rightbarFullscreen = () => isRightbarFullscreen();
    const setRightbarWidth = (px) => {
      try {
        const panels = ctx.layout && ctx.layout.panels;
        if (panels && typeof panels.setRightbar === "function") panels.setRightbar(px);
      } catch (error) {
      }
    };
    ctx.effect(() => {
      let raf = 0;
      let last = 0;
      const read = () => {
        if (raf) return;
        raf = window.requestAnimationFrame(() => {
          raf = 0;
          if (rightbarFullscreen()) return;
          const width = Math.round(rightbarWidthNow());
          if (width < 280 || Math.abs(width - last) < 2) return;
          last = width;
          persistBoardWidth(width);
        });
      };
      const kick = window.setTimeout(read, 0);
      let observer = null;
      const column = rightbarColumnElement();
      if (column && typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(read);
        observer.observe(column);
      }
      const timer = window.setInterval(read, 1500);
      return () => {
        if (observer) observer.disconnect();
        window.clearInterval(timer);
        window.clearTimeout(kick);
        if (raf) window.cancelAnimationFrame(raf);
      };
    }, "project-board: remember board width");
    const toggleRightbarFullscreen = () => {
      try {
        const sidebarRight = ctx.sidebarRight;
        const target = sidebarRight && typeof sidebarRight.commandTarget === "function" ? sidebarRight.commandTarget() : void 0;
        if (target && typeof sidebarRight.toggleFullscreen === "function") sidebarRight.toggleFullscreen(target);
      } catch (error) {
      }
    };
    let lastBoardIntentAt = 0;
    const boardIntentRecent = () => Date.now() - lastBoardIntentAt < 900;
    const boardOpenNow = () => {
      try {
        if (!ctx.sidebarRight) return false;
        return Boolean(boardPanelVisible() && rightBoardActive());
      } catch (error) {
        return false;
      }
    };
    const setBoardOpen = (want) => {
      try {
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        if (want) {
          if (!rightBoardActive()) sidebarRight.openTab(BOARD_KIND);
          if (!boardPanelVisible()) sidebarRight.toggleExpanded();
          return;
        }
        if (boardPanelVisible()) sidebarRight.toggleExpanded();
      } catch (error) {
      }
    };
    const boardViewStores = {
      main: createUiStore({ seq: 0, view: "projects" }),
      right: createUiStore({ seq: 0, view: "projects" })
    };
    const requestBoardView = (view, surface = "right") => {
      const store = boardViewStores[surface];
      const snap = store.getSnapshot();
      store.set({ seq: snap.seq + 1, view });
    };
    ctx.effect(() => {
      let wasOpen = boardOpenNow();
      const timer = window.setInterval(() => {
        let nowOpen = false;
        try {
          nowOpen = boardOpenNow();
        } catch (error) {
          nowOpen = wasOpen;
        }
        if (!wasOpen && nowOpen && !boardIntentRecent()) {
          logEvent("info", "board", "opened-externally", {});
          requestBoardView("projects", "right");
        }
        wasOpen = nowOpen;
      }, 400);
      return () => window.clearInterval(timer);
    }, "project-board: external open view");
    const boardStateNow = () => {
      try {
        if (!boardOpenNow()) return { open: false, mode: null };
        if (rightbarFullscreen()) return { open: true, mode: "full" };
        const width = rightbarWidthNow();
        const mode = width <= BOARD_NARROW_MAX ? "narrow" : "half";
        return { open: true, mode, width: Math.round(width) };
      } catch (error) {
        return { open: false, mode: null };
      }
    };
    const setBoardState = (state) => {
      lastBoardIntentAt = Date.now();
      try {
        const want = state || { open: false, mode: null };
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        if (!want.open) {
          setBoardOpen(false);
          return;
        }
        if (!rightBoardActive()) sidebarRight.openTab(BOARD_KIND);
        if (!boardPanelVisible()) sidebarRight.toggleExpanded();
        const mode = want.mode === "narrow" || want.mode === "full" ? want.mode : "half";
        if (mode === "full") {
          if (!rightbarFullscreen()) toggleRightbarFullscreen();
          return;
        }
        if (rightbarFullscreen()) toggleRightbarFullscreen();
        const viewport = window.innerWidth || 1200;
        const fallback = mode === "narrow" ? BOARD_NARROW_WIDTH : Math.round(viewport * 0.5);
        const saved = typeof want.width === "number" && want.width >= 280 ? Math.round(want.width) : 0;
        const width = saved || fallback;
        if (Math.abs(rightbarWidthNow() - width) > 24) setRightbarWidth(width);
      } catch (error) {
      }
    };
    let boardWidthFollowUp = 0;
    const showNativeBoard = (mode, resetView = true) => {
      if (resetView) requestBoardView("projects");
      try {
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        if (!rightBoardActive()) sidebarRight.openTab(BOARD_KIND);
        if (!boardPanelVisible()) sidebarRight.toggleExpanded();
        if (mode === "full") {
          if (!rightbarFullscreen()) toggleRightbarFullscreen();
          return;
        }
        if (rightbarFullscreen()) toggleRightbarFullscreen();
        const viewport = window.innerWidth || 1200;
        const width = mode === "narrow" ? BOARD_NARROW_WIDTH : Math.round(viewport * 0.5);
        setRightbarWidth(width);
        cancelLater(boardWidthFollowUp);
        boardWidthFollowUp = later(() => {
          boardWidthFollowUp = 0;
          if (rightbarFullscreen()) toggleRightbarFullscreen();
          setRightbarWidth(width);
        }, 130);
      } catch (error) {
        console.warn("project-board: native board failed", error);
      }
    };
    const toggleNativeLeftSidebar = () => {
      if (rightbarFullscreen()) {
        toggleRightbarFullscreen();
        logEvent("info", "sidebar", "leave-fullscreen", {});
      }
      const before = sidebarSignature();
      const verify = () => {
        const after = sidebarSignature();
        const comparable = Boolean(before && after);
        const changed = comparable && before !== null && after !== null && (before.collapsed !== after.collapsed || before.track !== after.track);
        logEvent(comparable && !changed ? "warn" : "info", "sidebar", !comparable ? "unverified" : changed ? "applied" : "no-change", { before, after });
      };
      const settled = () => {
        later(verify, 260);
        return true;
      };
      const attempt = (path, run) => {
        try {
          const result = run();
          if (result === false) return false;
          logEvent("info", "sidebar", "toggle", { path, viewport: window.innerWidth || 0 });
          return true;
        } catch (error) {
          logEvent("warn", "sidebar", "toggle-failed", { path, message: String(error && error.message || error) });
          return false;
        }
      };
      const service = (name) => optionalService(ctx, name);
      const layout = service("layout");
      if (layout && typeof layout.toggleSidebar === "function" && attempt("layout.toggleSidebar", () => layout.toggleSidebar())) return settled();
      if (layout && layout.panels && typeof layout.panels.toggleSidebar === "function" && attempt("layout.panels.toggleSidebar", () => layout.panels.toggleSidebar())) return settled();
      const left = service("sidebarLeft");
      if (left && typeof left.toggleExpanded === "function" && attempt("sidebarLeft.toggleExpanded", () => left.toggleExpanded())) return settled();
      logEvent("warn", "sidebar", "toggle-unavailable", { hasLayout: Boolean(layout) });
      return false;
    };
    const toggleNativeBoard = (mode) => {
      logEvent("info", "board", "toggle", { mode });
      lastBoardIntentAt = Date.now();
      try {
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        const visible = rightBoardActive();
        const expanded = boardPanelVisible();
        if (visible && expanded) {
          if (rightbarFullscreen()) toggleRightbarFullscreen();
          sidebarRight.toggleExpanded();
          return;
        }
        showNativeBoard(mode, !expanded);
      } catch (error) {
        console.warn("project-board: toggle native board failed", error);
      }
    };
    const openBoard = () => {
      if (!boardOpenNow()) requestBoardView("projects", "right");
      try {
        const sidebarRight = ctx.sidebarRight;
        if (!sidebarRight) return;
        if (settingsStore.getSnapshot().board.enabled === false) {
          logEvent("info", "board", "open-disabled", {});
          return;
        }
        sidebarRight.openTab(BOARD_KIND);
        if (!boardPanelVisible()) {
          sidebarRight.toggleExpanded();
          const width = boardWidthDefault();
          cancelLater(boardWidthFollowUp);
          boardWidthFollowUp = later(() => {
            boardWidthFollowUp = 0;
            if (!rightbarFullscreen()) setRightbarWidth(width);
          }, 60);
        }
      } catch (error) {
        console.warn("project-board: open board tab failed", error);
      }
    };
    const openFullBoard = () => {
      requestBoardView("projects", "main");
      collapseRightBoard();
      try {
        ctx.layout.selectPanel("project-board");
      } catch (error) {
      }
    };
    const closeBoardPanel = () => {
      try {
        if (ctx.layout && typeof ctx.layout.selectPanel === "function") ctx.layout.selectPanel(null);
        logEvent("info", "board", "close-main-panel", {});
      } catch (error) {
      }
    };
    const renameStore = createUiStore({ sessionId: null, currentTitle: "", at: 0 });
    const requestRename = (sessionId, currentTitle) => {
      if (!sessionId) return;
      renameStore.set({ sessionId, currentTitle: currentTitle || "", at: Date.now() });
    };
    const renameSession = async (sessionId, title) => {
      try {
        const remote = ctx.remote;
        if (!remote || !remote.session || typeof remote.session.rename !== "function") {
          return { ok: false, error: { message: "session rename is unavailable" } };
        }
        return await remote.session.rename({ sessionId, title });
      } catch (error) {
        return { ok: false, error: { message: String(error && error.message || error) } };
      }
    };
    const boardInject = (surface) => ({
      openSession,
      openBoard,
      openFullBoard,
      hooks: boardHooks(),
      viewRequestStore: boardViewStores[surface]
    });
    const sessionMenuStore = createUiStore({ sessionId: null, title: "", at: 0 });
    const requestSessionMenu = (sessionId, title) => {
      if (sessionId) sessionMenuStore.set({ sessionId, title: title || "", at: Date.now() });
    };
    const closeSessionMenu = () => {
      sessionMenuStore.set({ sessionId: null, title: "", at: 0 });
    };
    const archiveSession = async (sessionId) => {
      try {
        const workspaces = optionalService(ctx, "workspaces");
        if (!workspaces || typeof workspaces.archiveSession !== "function") {
          return { ok: false, error: { code: "unsupported", message: "session archive is unavailable" } };
        }
        await workspaces.archiveSession(sessionId);
        return { ok: true };
      } catch (error) {
        const rpc = error?.rpcError;
        return { ok: false, error: { code: rpc && rpc.code ? rpc.code : "", message: String(error && error.message || error) } };
      }
    };
    const sessionDeleteApi = () => {
      const owns = (object, name) => {
        try {
          return Boolean(object) && Object.prototype.hasOwnProperty.call(object, name) && typeof object[name] === "function";
        } catch (error) {
          return false;
        }
      };
      try {
        const remote = ctx.remote;
        const session = remote && remote.session;
        if (session && owns(session, "delete")) return session.delete.bind(session);
        if (session && owns(session, "remove")) return session.remove.bind(session);
        if (remote && owns(remote, "deleteSession")) {
          return remote.deleteSession.bind(remote);
        }
      } catch (error) {
      }
      return null;
    };
    const deleteSession = async (sessionId) => {
      const remove = sessionDeleteApi();
      if (!remove) return { ok: false, error: { message: "session delete is unavailable" } };
      try {
        const result = await remove({ sessionId });
        if (!result || result.ok !== false) return { ok: true };
        return { ok: false, error: result.error || { message: "delete failed" } };
      } catch (error) {
        return { ok: false, error: { message: String(error && error.message || error) } };
      }
    };
    const sessionFailureOf = (sessionId) => {
      try {
        const sessions = optionalService(ctx, "sessions");
        if (!sessions || typeof sessions.binding !== "function") return "";
        const binding = sessions.binding(sessionId);
        const session = binding && binding.session;
        if (!session || typeof session.getSnapshot !== "function") return "";
        return sessionFailureReason(session.getSnapshot());
      } catch (error) {
        return "";
      }
    };
    const cancelSession = async (sessionId) => {
      try {
        const remote = ctx.remote;
        const session = remote && remote.session ? remote.session : null;
        const cancel = session && typeof session.cancel === "function" ? session.cancel : null;
        if (!cancel) return { ok: false, error: { code: "unsupported", message: "stopping a turn is unavailable" } };
        const attempts = [
          () => cancel.call(session, { sessionId }),
          () => cancel.call(session)
        ];
        let code = "";
        let message = "";
        for (const attempt of attempts) {
          try {
            const result = await attempt();
            if (!result || result.ok !== false) return { ok: true };
            const error = result.error;
            code = error && error.code || "cancel-failed";
            message = error && error.message || "the host rejected the stop request";
            if (code !== "invalid" && code !== "unsupported" && code !== "invalid-argument") break;
          } catch (error) {
            const rpc = error?.rpcError;
            code = rpc && rpc.code || "";
            message = String(error && error.message || error);
          }
        }
        return { ok: false, error: { code, message } };
      } catch (error) {
        const rpc = error?.rpcError;
        return {
          ok: false,
          error: {
            code: rpc && rpc.code ? rpc.code : "",
            message: String(error && error.message || error)
          }
        };
      }
    };
    ctx.effect(() => {
      const timer = window.setTimeout(() => {
        try {
          const snapshot = settingsStore.getSnapshot();
          logEvent("info", "init", "plugin ready", {
            shortcuts: Object.keys(snapshot.shortcuts || {}).length,
            hud: Boolean(snapshot.hud && snapshot.hud.enabled),
            board: Boolean(snapshot.board && snapshot.board.enabled),
            leftSidebar: snapshot.shortcuts && snapshot.shortcuts.leftSidebar,
            windowWidth: window.innerWidth || 0,
            frameWidth: hostCentreColumnWidth() || null,
            sidebar: sidebarSignature()
          });
          for (const key of Object.keys(snapshot.shortcuts || {})) {
            const conflict = findBuiltinConflict(snapshot.shortcuts[key]);
            if (conflict) {
              logEvent("warn", "shortcuts", "also used by a built-in command", {
                key,
                combo: snapshot.shortcuts[key],
                builtin: conflict.label
              });
            }
          }
        } catch (error) {
          logEvent("warn", "init", "diagnostics failed", { reason: String(error && error.message || error) });
        }
      }, 1500);
      return () => window.clearTimeout(timer);
    }, "project-board: startup diagnostics");
    ctx.effect(() => {
      const onError = (event) => logEvent("error", "window", String(event && event.message || "script error"), {
        source: String(event && event.filename || "").slice(-120),
        line: event && event.lineno,
        column: event && event.colno
      });
      const onRejection = (event) => {
        const reason = event && event.reason;
        logEvent("error", "promise", String(reason && (reason.message || reason.code) || reason || "unhandled rejection").slice(0, 300));
      };
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onRejection);
      return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
      };
    }, "project-board: error hooks");
    const autoHistoryEnabled = () => {
      try {
        const chat = settingsStore.getSnapshot().chat;
        return !chat || chat.autoHistory !== false;
      } catch (error) {
        return true;
      }
    };
    ctx.effect(() => installChatScrollListeners({ autoHistory: autoHistoryEnabled }), "project-board: chat scroll listeners");
    ctx.effect(
      () => installChatHistoryAutoLoad({ enabled: autoHistoryEnabled }),
      "project-board: chat history auto-load"
    );
    ctx.effect(() => {
      const timer = window.setTimeout(() => {
        try {
          const snap = settingsStore.getSnapshot();
          const translate = ctx.locale.bind(NS);
          const conflicts = [];
          for (const key of Object.keys(snap.shortcuts || {})) {
            const combo = snap.shortcuts[key];
            const conflict = findBuiltinConflict(combo);
            if (conflict) conflicts.push({ key, combo, label: conflict.label });
          }
          const owners = /* @__PURE__ */ new Map();
          for (const key of Object.keys(snap.shortcuts || {})) {
            const combo = snap.shortcuts[key];
            const list = owners.get(combo);
            if (list) list.push(key);
            else owners.set(combo, [key]);
          }
          for (const [combo, actions] of owners) {
            if (actions.length > 1) logEvent("warn", "shortcuts", "duplicate binding", { combo, actions });
          }
          if (conflicts.length === 0) return;
          const first = conflicts[0];
          pushToast({
            tone: "warn",
            title: translate("toast.conflictTitle"),
            message: conflicts.length === 1 ? translate("toast.conflictExisting", { combo: comboDisplay(first.combo), name: first.label || "" }) : translate("toast.conflictExistingMany", { n: conflicts.length })
          });
        } catch (error) {
        }
      }, 1500);
      return () => window.clearTimeout(timer);
    }, "project-board: shortcut conflict scan");
    ctx.slots.inject(
      "sidebar.panellist",
      () => ctx.slots.register(
        {
          name: "sidebar.panellist",
          id: "project-board",
          order: 50,
          locale: NS,
          label: () => {
            try {
              return ctx.locale.bind(NS)("panel.label");
            } catch (error) {
              return "项目看板";
            }
          }
        },
        PanelIcon
      )
    );
    ctx.slots.inject(
      "main",
      () => ctx.slots.register(
        { name: "main", key: "project-board", locale: NS, inject: () => Object.assign({}, boardInject("main"), { closePanel: closeBoardPanel }) },
        ProjectBoard
      )
    );
    ctx.effect(
      () => ctx.sidebarRightTabs.register({
        id: BOARD_ID,
        kind: BOARD_KIND,
        priority: "builtin",
        title: () => {
          try {
            return ctx.locale.bind(NS)("rightTab.title");
          } catch (error) {
            return "项目看板";
          }
        }
      }),
      "project-board: right tab type"
    );
    ctx.slots.inject(
      "sidebar.right.pane.tab",
      () => ctx.slots.register(
        { name: "sidebar.right.pane.tab", key: BOARD_ID, locale: NS, inject: () => boardInject("right") },
        ResponsiveBoard
      )
    );
    const headerInject = () => ({
      openSession,
      openBoard,
      palette: paletteStore,
      saveSettings: writeSettings,
      headerDrag: headerDragStore,
      hooks: { palette: paletteStore, settings: settingsStore, headerDrag: headerDragStore }
    });
    ctx.slots.inject(
      "conversation.header.leading",
      () => ctx.slots.register({ name: "conversation.header.leading", locale: NS, inject: headerInject }, HeaderLeading)
    );
    ctx.slots.inject(
      "conversation.session.header.utilities",
      () => ctx.slots.register(
        { name: "conversation.session.header.utilities", id: "project-board-header-right", order: 40, locale: NS, inject: headerInject },
        HeaderUtilities
      )
    );
    ctx.slots.inject(
      "conversation.composer.dock",
      () => ctx.slots.register(
        { name: "conversation.composer.dock", id: "project-board-buttons", order: 100, locale: NS, inject: headerInject },
        ComposerDockButtons
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-palette",
          order: 40,
          locale: NS,
          inject: () => ({
            openSession,
            palette: paletteStore,
            focus: focusStore,
            toggleBoard: toggleNativeBoard,
            toggleLeftSidebar: toggleNativeLeftSidebar,
            toggleHud,
            requestRename,
            requestSessionMenu,
            notify: pushToast,
            chooseSetting,
            hooks: { palette: paletteStore, settings: settingsStore, settingsCatalog: settingsCatalogStore, focus: focusStore, hudOrder: hudOrderStore }
          })
        },
        Palette
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-session-menu",
          order: 41,
          locale: NS,
          inject: () => ({
            archiveSession,
            deleteSession,
            cancelSession,
            deleteSupported: Boolean(sessionDeleteApi()),
            closeSessionMenu,
            hooks: { sessionMenu: sessionMenuStore }
          })
        },
        SessionMenuDialog
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        { name: "shell.overlay", id: "project-board-rename", order: 39, locale: NS, inject: () => ({ renameSession, rename: renameStore, hooks: { rename: renameStore } }) },
        RenameDialog
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-hud",
          order: 35,
          locale: NS,
          inject: () => ({
            openSession,
            archiveSession,
            notify: pushToast,
            hudOrder: hudOrderStore,
            saveSettings: writeSettings,
            hooks: Object.assign({ settings: settingsStore, focus: focusStore }, scheduleSource ? { scheduleCatalog: scheduleSource } : {})
          })
        },
        FloatingStatus
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        { name: "shell.overlay", id: "project-board-toast", order: 45, locale: NS, inject: () => ({ dismissToast, toasts: toastStore }) },
        ToastStack
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-notifier",
          order: 36,
          locale: NS,
          inject: () => ({
            notify: pushNotif,
            system: showSystemNotification,
            openSession,
            failureOf: sessionFailureOf,
            hooks: { settings: settingsStore }
          })
        },
        NotificationWatcher
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-notification-dock",
          order: 44,
          locale: NS,
          inject: () => ({ dismissNotif, openSession, hooks: { notifications: notifStore } })
        },
        NotificationDock
      )
    );
    ctx.slots.inject(
      "shell.overlay",
      () => ctx.slots.register(
        {
          name: "shell.overlay",
          id: "project-board-session-guard",
          order: 34,
          locale: NS,
          inject: () => ({ boardStateNow, setBoardState, intentRecent: boardIntentRecent })
        },
        BoardSessionGuard
      )
    );
    ctx.slots.inject(
      "settings.section",
      () => ctx.slots.register(
        {
          name: "settings.section",
          id: PLUGIN_SECTION_ID,
          order: 60,
          locale: NS,
          label: () => {
            try {
              return ctx.locale.bind(NS)("settings.title");
            } catch (error) {
              return "项目看板设置";
            }
          },
          inject: () => ({
            settings: settingsStore,
            saveSettings: writeSettings,
            notify: pushToast,
            findBuiltinConflict,
            logs: logStore,
            hooks: Object.assign(
              { settings: settingsStore, logs: logStore, settingsTarget: settingsTargetStore },
              shortcutsService && shortcutsService.catalog ? { shortcutsCatalog: shortcutsService.catalog } : {}
            )
          })
        },
        SettingsPage
      )
    );
  }

  // src/index.ts
  var loader = window.__ModuleLoader__;
  if (!loader || typeof loader.load !== "function") throw new Error("dsh-tac: window.__ModuleLoader__ is missing");
  loader.load({
    id: MODULE_ID,
    factory(require2) {
      bindReact(require2("react"));
      return { inject: INJECT, apply };
    }
  });
})();
