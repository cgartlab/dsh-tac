/**
 * The bundle's apply(): dictionary/style installation, the plugin's stores and actions, the
 * native board and sidebar integrations, and every slot registration.
 */
import { BOARD_ID, BOARD_KIND, BOARD_WIDTH_KEY, DEFAULT_SETTINGS, LOG_KEY, NS } from './constants';
import { type HostContext } from './host';
import { loadJson, saveJson } from './core/json';
import { logConfigNow, logEvent, setLogConfigGetter, setLogSink } from './core/log';
import { mergeSettings, loadSettings, persistSettings } from './core/settings';
import { createPresetSource, createScheduleSource, type ObservableSnapshot, type PresetSnapshot, type ScheduleSnapshot } from './core/schedule';
import { createUiStore } from './core/store';
import type { UiStore } from './types';
import { PLUGIN_SECTION_ID, openSettingsTarget, pluginSettingEntries, readHostSections } from './core/settings-catalog';
import type { SettingEntry, SettingsCatalogSnapshot } from './core/settings-catalog';
import { bindingsOverlap, comboBindingOf, comboDisplay, IS_MAC } from './core/combos';
import { hostCentreColumnWidth, hostRightbarWidth, isRightPanelExpanded, isRightbarFullscreen, rightbarColumnElement, sidebarSignature } from './core/dom';
import { moveCaretToEnd } from './features/interject';
import { installChatScrollListeners } from './features/chat-scroll';
import { installChatHistoryAutoLoad } from './features/chat-history';
import type { LogEntry, Settings } from './types';
import { CSS } from './styles';
import { en } from './i18n/en';
import { zh } from './i18n/zh';
import { ProjectBoard } from './features/board';
import { ResponsiveBoard } from './features/responsive-board';
import { PanelIcon } from './ui/panel-icon';
import { HeaderLeading, HeaderUtilities, ComposerDockButtons } from './features/header';
import { Palette } from './features/palette';
import { FloatingStatus } from './features/hud';
import { RenameDialog, SessionMenuDialog } from './features/dialogs';
import { SettingsPage } from './features/settings';
import { NotificationDock, NotificationWatcher, ToastStack, showSystemNotification } from './features/notifications';
import { BoardSessionGuard, type BoardState } from './features/guard';

export const INJECT = ['slots', 'locale', 'uiWorkspace', 'remote', 'remote.session', 'remote.schedule', 'remote.agentPresets', 'sidebarRight', 'sidebarRightTabs', 'layout'];

/**
 * `INJECT` lists what the module cannot run without: a missing entry keeps it inactive in
 * that profile instead of throwing at first use. Two services are intentionally absent —
 * `shortcuts` and `workspaces` are optional in the host contract (`ctx.shortcuts?:`), and
 * the board, HUD and palette all work without them. Declaring them here would disable the
 * whole plugin on a profile that merely lacks the shortcut catalog. They are read through
 * `optionalService()` at each use instead, so only that extra degrades.
 */
const optionalService = <T>(ctx: HostContext, name: string): T | null => {
  try {
    const direct = (ctx as unknown as Record<string, unknown>)[name];
    if (direct) return direct as T;
    return typeof ctx.get === 'function' ? ((ctx.get(name) as T) ?? null) : null;
  } catch (error) {
    return null;
  }
};

interface BuiltinConflict {
  id?: string;
  label?: string;
}

interface CatalogRow {
  binding?: { code?: string; secondCode?: string; modifiers?: string[] };
  issue?: unknown;
  conflicts?: unknown[];
  id?: string;
  label?: string;
}

export function apply(ctx: HostContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh: zh as unknown as Record<string, string>, en }), 'project-board: dictionaries');
  /* Electron injects data-platform only in the native window; mark it ourselves so
     fixed-position UI honours the macOS menu bar / window-control clearance in
     both the desktop app and the web UI. */
  ctx.effect(() => {
    const root = document.documentElement;
    root.setAttribute('data-pbx-platform', IS_MAC ? 'darwin' : 'other');
    return () => {
      root.removeAttribute('data-pbx-platform');
    };
  }, 'project-board: platform marker');
  ctx.effect(() => {
    const tag = document.createElement('style');
    tag.dataset.plugin = '@dsh-tac';
    tag.textContent = CSS;
    document.head.appendChild(tag);
    return () => {
      tag.remove();
    };
  }, 'project-board: styles');

  let scheduleSource: ObservableSnapshot<ScheduleSnapshot> | null = null;
  ctx.effect(() => {
    if (!ctx.remote || !ctx.remote.schedule) return undefined;
    const created = createScheduleSource(ctx);
    scheduleSource = created.source;
    return () => {
      scheduleSource = null;
      created.dispose();
    };
  }, 'project-board: automation catalog');

  let presetSource: ObservableSnapshot<PresetSnapshot> | null = null;
  ctx.effect(() => {
    if (!ctx.remote || !ctx.remote.agentPresets) return undefined;
    const created = createPresetSource(ctx);
    presetSource = created.source;
    return () => {
      presetSource = null;
      created.dispose();
    };
  }, 'project-board: agent presets');

  /* Whenever focus lands in the composer with existing text, put the caret at the end.
     The click that focuses the textarea places the caret after focusin, so re-apply once
     more on the next ticks instead of only before the click lands. */
  ctx.effect(() => {
    const onFocusIn = (event: FocusEvent): void => {
      try {
        const target = event && (event.target as HTMLElement | null);
        if (!target || typeof target.matches !== 'function') return;
        if (!target.matches('textarea, [contenteditable="true"]')) return;
        const rect = target.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return;
        const value = (target as HTMLTextAreaElement).value;
        const hasText = typeof value === 'string' ? value.length > 0 : Boolean(target.textContent && target.textContent.trim().length > 0);
        if (!hasText) return;
        moveCaretToEnd(target);
        later(() => moveCaretToEnd(target), 0);
        later(() => moveCaretToEnd(target), 140);
      } catch (error) {
        /* ignore */
      }
    };
    document.addEventListener('focusin', onFocusIn, true);
    return () => document.removeEventListener('focusin', onFocusIn, true);
  }, 'project-board: composer caret');

  const uiWorkspace = optionalService<{ openSession(target: unknown): void }>(ctx, 'uiWorkspace');
  const shortcutsService = optionalService<{ catalog?: { getSnapshot?: () => unknown } }>(ctx, 'shortcuts');
  const openSession = (sessionId: string): void => {
    logEvent('debug', 'session', 'open', { id: String(sessionId || '').slice(-12) });
    try {
      if (uiWorkspace) uiWorkspace.openSession(sessionId);
    } catch (error) {
      logEvent('warn', 'session', 'open failed', { reason: String((error && (error as Error).message) || error) });
    }
  };

  /* ---------------------------------------------------------------- stores */
  const paletteStore = createUiStore({ open: false, move: { dir: 0, at: 0 } });
  const focusStore = createUiStore<{ id: string | null; at: number }>({ id: null, at: 0 });
  const hudOrderStore = createUiStore<{ ids: string[] }>({ ids: [] });
  const headerDragStore = createUiStore<{ id: string | null; side: string | null; index: number; width: number }>({
    id: null,
    side: null,
    index: -1,
    width: 0
  });
  const toastStore = createUiStore<{ items: Array<{ id: number; tone: string; title: string; message: string }>; seq: number }>({ items: [], seq: 0 });
  let toastSeq = 0;
  const dismissToast = (id: number): void => {
    toastStore.set({ items: toastStore.getSnapshot().items.filter((item) => item.id !== id) });
  };
  const pushToast = (input: { tone?: string; title?: string; message?: string; ttl?: number } | null | undefined): number => {
    const source = input || {};
    toastSeq += 1;
    const item = { id: toastSeq, tone: source.tone || 'warn', title: source.title || '', message: source.message || '' };
    toastStore.set({ seq: toastSeq, items: toastStore.getSnapshot().items.concat([item]).slice(-4) });
    window.setTimeout(() => dismissToast(item.id), Math.max(4000, Number(source.ttl) || 4800));
    return item.id;
  };
  const notifStore = createUiStore<{ items: Array<{ id: number; tone: string; title: string; body: string; sessionId: string | null }>; seq: number }>({
    items: [],
    seq: 0
  });
  let notifSeq = 0;
  const dismissNotif = (id: number): void => {
    notifStore.set({ items: notifStore.getSnapshot().items.filter((item) => item.id !== id) });
  };
  const pushNotif = (input: { tone?: string; title?: string; body?: string; sessionId?: string; ttl?: number } | null | undefined): number => {
    const source = input || {};
    logEvent('info', 'notify', 'queued', { tone: source.tone || 'success' });
    notifSeq += 1;
    const item = {
      id: notifSeq,
      tone: source.tone || 'success',
      title: source.title || '',
      body: source.body || '',
      sessionId: source.sessionId || null
    };
    notifStore.set({ seq: notifSeq, items: notifStore.getSnapshot().items.concat([item]).slice(-3) });
    window.setTimeout(() => dismissNotif(item.id), Math.max(4000, Number(source.ttl) || 9000));
    return item.id;
  };

  /** Read the DSH shortcut catalog and report the first built-in command already using this combo. */
  const findBuiltinConflict = (combo: string): BuiltinConflict | null => {
    try {
      const shortcuts = optionalService<{ catalog?: { getSnapshot?: () => CatalogRow[] } }>(ctx, 'shortcuts');
      const rows = shortcuts && shortcuts.catalog && typeof shortcuts.catalog.getSnapshot === 'function' ? shortcuts.catalog.getSnapshot() : null;
      if (!rows || !Array.isArray(rows)) return null;
      const target = comboBindingOf(combo);
      if (!target) return null;
      for (const row of rows) {
        if (!row || !row.binding || row.issue) continue;
        if (Array.isArray(row.conflicts) && row.conflicts.length > 0) continue;
        if (bindingsOverlap(target, row.binding as { code: string; secondCode?: string; modifiers: string[] })) {
          return { id: row.id, label: row.label || row.id };
        }
      }
    } catch (error) {
      /* ignore */
    }
    return null;
  };

  const settingsStore = createUiStore<Settings>(loadSettings());
  /* Settings search index for the command palette. Host sections come from the public
     `settings.section` ledger and are refreshed whenever that ledger changes, so a section
     contributed by the host or another plugin appears in search without a dsh-tac release. */
  const settingsCatalogStore = createUiStore<SettingsCatalogSnapshot>({ host: [], plugin: [], seq: 0 });
  const settingsTargetStore = createUiStore<{ key: string | null; at: number }>({ key: null, at: 0 });
  const refreshSettingsCatalog = (): void => {
    try {
      settingsCatalogStore.set({
        host: readHostSections(ctx),
        plugin: pluginSettingEntries(ctx.locale.bind(NS)),
        seq: Date.now()
      });
    } catch (error) {
      logEvent('warn', 'palette', 'settings-catalog', { reason: String((error && (error as Error).message) || error) });
    }
  };
  refreshSettingsCatalog();
  ctx.effect(() => {
    const slots = ctx.slots as unknown as { subscribe?: (name: string, listener: () => void) => () => void };
    if (typeof slots.subscribe !== 'function') return undefined;
    try {
      const off = slots.subscribe('settings.section', refreshSettingsCatalog);
      return () => {
        try { off(); } catch (error) { /* ignore */ }
      };
    } catch (error) {
      return undefined;
    }
  }, 'project-board: settings catalog');
  /** Palette -> Settings deep link. Returns false only when no host surface could open it. */
  const chooseSetting = (entry: SettingEntry): boolean => {
    const result = openSettingsTarget(ctx, entry.sectionId);
    settingsTargetStore.set({ key: entry.anchor || null, at: Date.now() });
    logEvent('info', 'settings', 'open-from-palette', { id: entry.id, result: result });
    if (result === 'failed') {
      pushToast({ tone: 'warn', title: '', message: ctx.locale.bind(NS)('toast.settingsOpenFailed') });
    } else if (result !== 'section') {
      /* The dialog opened but the host did not expose a way to preselect the section. Say so
         instead of letting the reader assume "search for a setting" landed on it. */
      pushToast({ tone: 'info', title: '', message: ctx.locale.bind(NS)('toast.settingsOpenPartial') });
    }
    return result !== 'failed';
  };
  const logStore = createUiStore<{ entries: LogEntry[] }>(loadJson(LOG_KEY, { entries: [] as LogEntry[] }));
  setLogConfigGetter(() => settingsStore.getSnapshot().log || DEFAULT_SETTINGS.log);
  /* Shortcut paths schedule follow-up work a frame or two later (resize after the host's
     own transition, caret placement after a remount, the sidebar-toggle verification log).
     Those timers outlive an unload: disabling or hot-reloading the plugin while one is
     pending used to let it fire against the host afterwards — resizing the pane or leaving
     fullscreen in a session that no longer has this plugin. Track them so one effect can
     clear everything on teardown. */
  const pendingTimers = new Set<number>();
  const later = (run: () => void, delay: number): number => {
    const id = window.setTimeout(() => {
      pendingTimers.delete(id);
      try {
        run();
      } catch (error) {
        /* ignore */
      }
    }, delay);
    pendingTimers.add(id);
    return id;
  };
  /** Drop a scheduled follow-up: a newer one supersedes it. */
  const cancelLater = (id: number): void => {
    if (!id) return;
    window.clearTimeout(id);
    pendingTimers.delete(id);
  };
  let logPersistTimer = 0;
  setLogSink((entry: LogEntry) => {
    try {
      const config = logConfigNow();
      const max = Math.max(20, Number(config.max) || 200);
      const entries = (logStore.getSnapshot().entries || []).concat([entry]).slice(-max);
      logStore.set({ entries: entries });
      if (logPersistTimer) return;
      logPersistTimer = window.setTimeout(() => {
        logPersistTimer = 0;
        try {
          saveJson(LOG_KEY, { entries: logStore.getSnapshot().entries.slice(-120) });
        } catch (error) {
          /* ignore */
        }
      }, 800);
    } catch (error) {
      /* ignore */
    }
  });
  /* Clear every deferred follow-up on teardown so an unload cannot act on the host. */
  ctx.effect(
    () => () => {
      for (const id of pendingTimers) window.clearTimeout(id);
      pendingTimers.clear();
      if (logPersistTimer) {
        window.clearTimeout(logPersistTimer);
        logPersistTimer = 0;
      }
    },
    'project-board: pending timers'
  );
  const writeSettings = (next: Settings): void => {
    const merged = mergeSettings(DEFAULT_SETTINGS, next);
    merged.headerButtonsVersion = 3;
    merged.hintsVersion = 1;
    merged.shortcutsVersion = 1;
    merged.boardProjVersion = 1;
    persistSettings(merged);
    settingsStore.set(merged);
    logEvent('info', 'settings', 'saved');
  };
  const toggleHud = (): void => {
    try {
      window.dispatchEvent(new CustomEvent('pbx-hud-toggle'));
    } catch (error) {
      console.warn('project-board: toggle hud failed', error);
    }
  };
  const boardHooks = (): Record<string, unknown> =>
    Object.assign({ settings: settingsStore }, scheduleSource ? { scheduleCatalog: scheduleSource } : {}, presetSource ? { presets: presetSource } : {});

  /* -------------------------------------------------- native right-pane board */
  const rightBoardActive = (): boolean => {
    try {
      const active = ctx.sidebarRight && typeof ctx.sidebarRight.active === 'function' ? ctx.sidebarRight.active() : undefined;
      return Boolean(active && (active as { kind?: string }).kind === BOARD_KIND);
    } catch (error) {
      return false;
    }
  };
  const collapseRightBoard = (): void => {
    try {
      const sidebarRight = ctx.sidebarRight;
      if (!sidebarRight) return;
      /* LESSONS: isExpanded() is unreliable (a build could leave Alt+N/B/V open-only).
         Decide visibility from the DOM panel marker + the active panel kind instead. */
      if (boardPanelVisible() && rightBoardActive()) sidebarRight.toggleExpanded();
    } catch (error) {
      /* ignore */
    }
  };
  /* Host-structure probes live in core/dom.ts so every selector the plugin depends on sits
     in one place; these aliases keep the call sites reading naturally. */
  const boardPanelVisible = (): boolean => isRightPanelExpanded();
  const rightbarWidthNow = (): number => hostRightbarWidth();
  /* Alt+N asks for "the narrow board", so narrow is a FIXED width, not the width the user
     last dragged. `boardStateNow()` classifies a pane by measured width (below `BOARD_NARROW_MAX`
     is narrow), so a restored 600px "narrow" pane reads as half: the next Alt+N then saw a
     different mode and resized the pane instead of closing it, and the key looked broken. */
  const BOARD_NARROW_WIDTH = 380;
  /** Width at or below which the pane counts as the narrow presentation. */
  const BOARD_NARROW_MAX = 460;
  /* The width the user last left a NON-narrow board at becomes the default for the next open. */
  const boardWidthDefault = (): number => {
    try {
      const saved = Number(window.localStorage.getItem(BOARD_WIDTH_KEY));
      if (Number.isFinite(saved) && saved >= 280) return Math.round(saved);
    } catch (error) {
      /* ignore */
    }
    const now = rightbarWidthNow();
    if (now >= 280) return Math.round(now);
    return 380;
  };
  const persistBoardWidth = (px: number): void => {
    if (!(px >= 280)) return;
    try {
      window.localStorage.setItem(BOARD_WIDTH_KEY, String(Math.round(px)));
    } catch (error) {
      /* ignore */
    }
  };
  const rightbarFullscreen = (): boolean => isRightbarFullscreen();
  const setRightbarWidth = (px: number): void => {
    try {
      const panels = ctx.layout && ctx.layout.panels;
      if (panels && typeof panels.setRightbar === 'function') panels.setRightbar(px);
    } catch (error) {
      /* ignore */
    }
  };
  ctx.effect(() => {
    let raf = 0;
    let last = 0;
    const read = (): void => {
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
    let observer: ResizeObserver | null = null;
    const column = rightbarColumnElement();
    if (column && typeof ResizeObserver !== 'undefined') {
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
  }, 'project-board: remember board width');
  const toggleRightbarFullscreen = (): void => {
    try {
      const sidebarRight = ctx.sidebarRight;
      const target = sidebarRight && typeof sidebarRight.commandTarget === 'function' ? sidebarRight.commandTarget() : undefined;
      if (target && typeof sidebarRight.toggleFullscreen === 'function') sidebarRight.toggleFullscreen(target);
    } catch (error) {
      /* ignore */
    }
  };
  let lastBoardIntentAt = 0;
  const boardIntentRecent = (): boolean => Date.now() - lastBoardIntentAt < 900;
  /** Whether the board pane is currently visible, regardless of the active session. */
  const boardOpenNow = (): boolean => {
    try {
      if (!ctx.sidebarRight) return false;
      return Boolean(boardPanelVisible() && rightBoardActive());
    } catch (error) {
      return false;
    }
  };
  /** Open or close the board pane without touching its width or presentation. */
  const setBoardOpen = (want: boolean): void => {
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
      /* ignore */
    }
  };
  /** Which UI surface a board instance is rendered in. The right-pane tab and the main panel
   *  are independent boards: they can be open at the same time, so a view request aimed at one
   *  must not move the other's tabs. Each surface therefore owns its own request store. */
  type BoardSurface = 'main' | 'right';
  const boardViewStores: Record<BoardSurface, UiStore<{ seq: number; view: 'projects' | 'sessions' }>> = {
    main: createUiStore<{ seq: number; view: 'projects' | 'sessions' }>({ seq: 0, view: 'projects' }),
    right: createUiStore<{ seq: number; view: 'projects' | 'sessions' }>({ seq: 0, view: 'projects' })
  };
  const requestBoardView = (view: 'projects' | 'sessions', surface: BoardSurface = 'right'): void => {
    const store = boardViewStores[surface];
    const snap = store.getSnapshot();
    store.set({ seq: snap.seq + 1, view });
  };
  /** Current board pane state: { open, mode: 'narrow' | 'half' | 'full' | null, width? }. */
  const boardStateNow = (): BoardState => {
    try {
      if (!boardOpenNow()) return { open: false, mode: null };
      /* Only the host's real fullscreen flag counts as "full". A pane merely dragged wide is
         still a sized pane: classifying it as full made a session switch restore it as 100%
         fullscreen instead of the width the user had chosen. */
      if (rightbarFullscreen()) return { open: true, mode: 'full' };
      const width = rightbarWidthNow();
      const mode = width <= BOARD_NARROW_MAX ? 'narrow' : 'half';
      /* Record the measured width so a restore can put back exactly what was there; the mode
         bucket alone cannot express "wider than half but not fullscreen". */
      return { open: true, mode: mode, width: Math.round(width) };
    } catch (error) {
      return { open: false, mode: null };
    }
  };
  /** Restore an exact board pane state: open/closed plus narrow, half or full size. */
  const setBoardState = (state: BoardState): void => {
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
      const mode = want.mode === 'narrow' || want.mode === 'full' ? want.mode : 'half';
      if (mode === 'full') {
        if (!rightbarFullscreen()) toggleRightbarFullscreen();
        return;
      }
      if (rightbarFullscreen()) toggleRightbarFullscreen();
      const viewport = window.innerWidth || 1200;
      const fallback = mode === 'narrow' ? BOARD_NARROW_WIDTH : Math.round(viewport * 0.5);
      /* Prefer the width that was actually on screen when the state was recorded: the mode
         alone cannot express a pane wider than half but not fullscreen. */
      const saved = typeof want.width === 'number' && want.width >= 280 ? Math.round(want.width) : 0;
      const width = saved || fallback;
      if (Math.abs(rightbarWidthNow() - width) > 24) setRightbarWidth(width);
    } catch (error) {
      /* ignore */
    }
  };
  /** Show the right-pane board at `mode`. `resetView` is false when the pane is already
   *  open and the user is only resizing it (Alt+B/V while it shows) — resizing must not
   *  throw away the view they picked (e.g. sessions). True means "this is an open". */
  /* One pending width follow-up at a time: whichever entry point acted last owns the final
     width, and a stale callback must never re-apply the previous presentation. */
  let boardWidthFollowUp = 0;
  const showNativeBoard = (mode: string, resetView = true): void => {
    /* Opening the board via a shortcut should land on the project view. */
    if (resetView) requestBoardView('projects');
    try {
      const sidebarRight = ctx.sidebarRight;
      if (!sidebarRight) return;
      if (!rightBoardActive()) sidebarRight.openTab(BOARD_KIND);
      if (!boardPanelVisible()) sidebarRight.toggleExpanded();
      if (mode === 'full') {
        if (!rightbarFullscreen()) toggleRightbarFullscreen();
        return;
      }
      if (rightbarFullscreen()) toggleRightbarFullscreen();
      const viewport = window.innerWidth || 1200;
      const width = mode === 'narrow' ? BOARD_NARROW_WIDTH : Math.round(viewport * 0.5);
      setRightbarWidth(width);
      /* A presentation persisted from a fullscreen open lands one render later. A newer
         presentation supersedes the pending one: pressing Alt+B then Alt+N inside 130ms used to
         leave the half-width follow-up alive, so it re-applied 50vw for a frame and flashed the
         pane back before the narrow width won. */
      cancelLater(boardWidthFollowUp);
      boardWidthFollowUp = later(() => {
        boardWidthFollowUp = 0;
        if (rightbarFullscreen()) toggleRightbarFullscreen();
        setRightbarWidth(width);
      }, 130);
    } catch (error) {
      console.warn('project-board: native board failed', error);
    }
  };
  /** Expand or collapse DSH's own left sidebar (the session list column). */
  const toggleNativeLeftSidebar = (): boolean => {
    /* A fullscreen board covers the whole frame, sidebar included, so toggling the sidebar
       under it looks like a dead key. Leave fullscreen first, then toggle. */
    if (rightbarFullscreen()) {
      toggleRightbarFullscreen();
      logEvent('info', 'sidebar', 'leave-fullscreen', {});
    }
    /* A toggle that returns without changing the layout is the failure mode that looks like
       "the key did nothing": the API ran, the store did not move. Compare the frame's own
       signature before and after so the log can tell the two apart. */
    const before = sidebarSignature();
    const verify = (): void => {
      const after = sidebarSignature();
      const comparable = Boolean(before && after);
      const changed = comparable && before !== null && after !== null && (before.collapsed !== after.collapsed || before.track !== after.track);
      logEvent(comparable && !changed ? 'warn' : 'info', 'sidebar', !comparable ? 'unverified' : changed ? 'applied' : 'no-change', { before: before, after: after });
    };
    const settled = (): boolean => {
      later(verify, 260);
      return true;
    };
    const attempt = (path: string, run: () => unknown): boolean => {
      try {
        const result = run();
        if (result === false) return false;
        logEvent('info', 'sidebar', 'toggle', { path: path, viewport: window.innerWidth || 0 });
        return true;
      } catch (error) {
        logEvent('warn', 'sidebar', 'toggle-failed', { path: path, message: String((error && (error as Error).message) || error) });
        return false;
      }
    };
    const service = (name: string): unknown => optionalService<unknown>(ctx, name);
    const layout = service('layout') as { toggleSidebar?: () => void; panels?: { toggleSidebar?: () => void } } | null;
    if (layout && typeof layout.toggleSidebar === 'function' && attempt('layout.toggleSidebar', () => layout.toggleSidebar!())) return settled();
    if (layout && layout.panels && typeof layout.panels.toggleSidebar === 'function' && attempt('layout.panels.toggleSidebar', () => layout.panels!.toggleSidebar!())) return settled();
    const left = service('sidebarLeft') as { toggleExpanded?: () => void } | null;
    if (left && typeof left.toggleExpanded === 'function' && attempt('sidebarLeft.toggleExpanded', () => left.toggleExpanded!())) return settled();
    logEvent('warn', 'sidebar', 'toggle-unavailable', { hasLayout: Boolean(layout) });
    return false;
  };
  const toggleNativeBoard = (mode: string): void => {
    logEvent('info', 'board', 'toggle', { mode: mode });
    lastBoardIntentAt = Date.now();
    try {
      const sidebarRight = ctx.sidebarRight;
      if (!sidebarRight) return;
      const visible = rightBoardActive();
      const expanded = boardPanelVisible();
      /* Each size key is its own toggle. While the board is showing in ANY size, pressing any
         size key closes it — "press again to close" then holds whatever size you are looking
         at, instead of turning Alt+B into a resize when the pane happens to be narrow. Opening
         always lands on the pressed key's own size. (A disabled board never reaches here: the
         dispatcher leaves those combos to the rest of the app.) */
      if (visible && expanded) {
        /* Leave the fullscreen presentation first for the same reason Alt+W does: collapsing a
           fullscreen right bar can otherwise leave it covering the page. */
        if (rightbarFullscreen()) toggleRightbarFullscreen();
        sidebarRight.toggleExpanded();
        return;
      }
      showNativeBoard(mode, !expanded);
    } catch (error) {
      console.warn('project-board: toggle native board failed', error);
    }
  };
  const openBoard = (): void => {
    /* "Bring the board to the front" must not throw away the tab the reader picked: only a
       board that is actually closed lands on the default project view. */
    if (!boardOpenNow()) requestBoardView('projects', 'right');
    try {
      const sidebarRight = ctx.sidebarRight;
      if (!sidebarRight) return;
      /* Same rule as the shortcut: the setting hides the board, so no entry point may open it. */
      if (settingsStore.getSnapshot().board.enabled === false) {
        logEvent('info', 'board', 'open-disabled', {});
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
      console.warn('project-board: open board tab failed', error);
    }
  };
  const openFullBoard = (): void => {
    requestBoardView('projects', 'main');
    collapseRightBoard();
    try {
      ctx.layout.selectPanel('project-board');
    } catch (error) {
      /* ignore */
    }
  };
  /** Leave the standalone main-panel board and return to the conversation. The `main` slot
   *  replaces the whole content area, so without this the user has no in-board way back. */
  const closeBoardPanel = (): void => {
    try {
      if (ctx.layout && typeof ctx.layout.selectPanel === 'function') ctx.layout.selectPanel(null);
      logEvent('info', 'board', 'close-main-panel', {});
    } catch (error) {
      /* ignore */
    }
  };

  /* ------------------------------------------------ session rename and actions */
  const renameStore = createUiStore<{ sessionId: string | null; currentTitle: string; at: number }>({ sessionId: null, currentTitle: '', at: 0 });
  const requestRename = (sessionId: string, currentTitle: string): void => {
    if (!sessionId) return;
    renameStore.set({ sessionId: sessionId, currentTitle: currentTitle || '', at: Date.now() });
  };
  const renameSession = async (sessionId: string, title: string): Promise<{ ok?: boolean; error?: { message?: string } }> => {
    try {
      const remote = ctx.remote as { session?: { rename?: (input: { sessionId: string; title: string }) => Promise<{ ok?: boolean; error?: { message?: string } }> } } | null;
      if (!remote || !remote.session || typeof remote.session.rename !== 'function') {
        return { ok: false, error: { message: 'session rename is unavailable' } };
      }
      return await remote.session.rename({ sessionId: sessionId, title: title });
    } catch (error) {
      return { ok: false, error: { message: String((error && (error as Error).message) || error) } };
    }
  };
  const boardInject = (surface: BoardSurface): Record<string, unknown> => ({
    openSession: openSession,
    openBoard: openBoard,
    openFullBoard: openFullBoard,
    hooks: boardHooks(),
    viewRequestStore: boardViewStores[surface]
  });

  const sessionMenuStore = createUiStore<{ sessionId: string | null; title: string; at: number }>({ sessionId: null, title: '', at: 0 });
  const requestSessionMenu = (sessionId: string, title: string): void => {
    if (sessionId) sessionMenuStore.set({ sessionId: sessionId, title: title || '', at: Date.now() });
  };
  const closeSessionMenu = (): void => {
    sessionMenuStore.set({ sessionId: null, title: '', at: 0 });
  };
  const archiveSession = async (sessionId: string): Promise<{ ok?: boolean; error?: { code?: string; message?: string } }> => {
    try {
      const workspaces = optionalService<{ archiveSession?: (id: string) => Promise<void> }>(ctx, 'workspaces');
      if (!workspaces || typeof workspaces.archiveSession !== 'function') {
        return { ok: false, error: { code: 'unsupported', message: 'session archive is unavailable' } };
      }
      await workspaces.archiveSession(sessionId);
      return { ok: true };
    } catch (error) {
      const rpc = (error as { rpcError?: { code?: string } } | null)?.rpcError;
      return { ok: false, error: { code: rpc && rpc.code ? rpc.code : '', message: String((error && (error as Error).message) || error) } };
    }
  };
  const sessionDeleteApi = (): ((input: { sessionId: string }) => Promise<{ ok?: boolean; error?: { message?: string } }>) | null => {
    const owns = (object: unknown, name: string): boolean => {
      try {
        return Boolean(object) && Object.prototype.hasOwnProperty.call(object, name) && typeof (object as Record<string, unknown>)[name] === 'function';
      } catch (error) {
        return false;
      }
    };
    try {
      const remote = ctx.remote as unknown as Record<string, unknown> | null;
      const session = remote && (remote.session as Record<string, unknown> | undefined);
      if (session && owns(session, 'delete')) return (session.delete as (input: { sessionId: string }) => Promise<{ ok?: boolean; error?: { message?: string } }>).bind(session);
      if (session && owns(session, 'remove')) return (session.remove as (input: { sessionId: string }) => Promise<{ ok?: boolean; error?: { message?: string } }>).bind(session);
      if (remote && owns(remote, 'deleteSession')) {
        return (remote.deleteSession as (input: { sessionId: string }) => Promise<{ ok?: boolean; error?: { message?: string } }>).bind(remote);
      }
    } catch (error) {
      /* ignore */
    }
    return null;
  };
  const deleteSession = async (sessionId: string): Promise<{ ok?: boolean; error?: { message?: string } }> => {
    const remove = sessionDeleteApi();
    if (!remove) return { ok: false, error: { message: 'session delete is unavailable' } };
    try {
      const result = await remove({ sessionId: sessionId });
      if (!result || result.ok !== false) return { ok: true };
      return { ok: false, error: result.error || { message: 'delete failed' } };
    } catch (error) {
      return { ok: false, error: { message: String((error && (error as Error).message) || error) } };
    }
  };

  /* -------------------------------------------------------- diagnostics */
  ctx.effect(() => {
    const timer = window.setTimeout(() => {
      try {
        const snapshot = settingsStore.getSnapshot();
        /* Record the environment a shortcut has to work in: the effective Alt+W binding (it may
           have been remapped), the window width that decides between the column, the rail and the
           drawer sidebar, and the sidebar state at startup. */
        logEvent('info', 'init', 'plugin ready', {
          shortcuts: Object.keys(snapshot.shortcuts || {}).length,
          hud: Boolean(snapshot.hud && snapshot.hud.enabled),
          board: Boolean(snapshot.board && snapshot.board.enabled),
          leftSidebar: snapshot.shortcuts && snapshot.shortcuts.leftSidebar,
          windowWidth: window.innerWidth || 0,
          frameWidth: hostCentreColumnWidth() || null,
          sidebar: sidebarSignature()
        });
        for (const key of Object.keys(snapshot.shortcuts || {})) {
          const conflict = findBuiltinConflict(snapshot.shortcuts[key as keyof typeof snapshot.shortcuts]);
          if (conflict) {
            logEvent('warn', 'shortcuts', 'also used by a built-in command', {
              key: key,
              combo: snapshot.shortcuts[key as keyof typeof snapshot.shortcuts],
              builtin: conflict.label
            });
          }
        }
      } catch (error) {
        logEvent('warn', 'init', 'diagnostics failed', { reason: String((error && (error as Error).message) || error) });
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, 'project-board: startup diagnostics');
  ctx.effect(() => {
    const onError = (event: ErrorEvent): void =>
      logEvent('error', 'window', String((event && event.message) || 'script error'), {
        source: String((event && event.filename) || '').slice(-120),
        line: event && event.lineno,
        column: event && event.colno
      });
    const onRejection = (event: PromiseRejectionEvent): void => {
      const reason = event && event.reason;
      logEvent('error', 'promise', String((reason && (reason.message || reason.code)) || reason || 'unhandled rejection').slice(0, 300));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, 'project-board: error hooks');

  /* Scrolling to the top of a conversation loads the previous page of history for you,
     instead of requiring a click on the host's "load earlier" control every time. The same
     setting gates the held-scroll loop's prefetch, so switching it off also stops a held
     Alt+U from pulling history in the background. */
  const autoHistoryEnabled = (): boolean => {
    try {
      const chat = settingsStore.getSnapshot().chat;
      return !chat || chat.autoHistory !== false;
    } catch (error) {
      return true;
    }
  };
  ctx.effect(() => installChatScrollListeners({ autoHistory: autoHistoryEnabled }), 'project-board: chat scroll listeners');
  ctx.effect(
    () => installChatHistoryAutoLoad({ enabled: autoHistoryEnabled }),
    'project-board: chat history auto-load'
  );

  /* Warn once at startup when saved shortcuts collide with built-in DSH commands. */
  ctx.effect(() => {
    const timer = window.setTimeout(() => {
      try {
        const snap = settingsStore.getSnapshot();
        const translate = ctx.locale.bind(NS);
        const conflicts: Array<{ key: string; combo: string; label?: string }> = [];
        for (const key of Object.keys(snap.shortcuts || {})) {
          const combo = snap.shortcuts[key as keyof typeof snap.shortcuts];
          const conflict = findBuiltinConflict(combo);
          if (conflict) conflicts.push({ key: key, combo: combo, label: conflict.label });
        }
        const owners = new Map<string, string[]>();
        for (const key of Object.keys(snap.shortcuts || {})) {
          const combo = snap.shortcuts[key as keyof typeof snap.shortcuts];
          const list = owners.get(combo);
          if (list) list.push(key);
          else owners.set(combo, [key]);
        }
        for (const [combo, actions] of owners) {
          if (actions.length > 1) logEvent('warn', 'shortcuts', 'duplicate binding', { combo: combo, actions: actions });
        }
        if (conflicts.length === 0) return;
        const first = conflicts[0];
        pushToast({
          tone: 'warn',
          title: translate('toast.conflictTitle'),
          message:
            conflicts.length === 1
              ? translate('toast.conflictExisting', { combo: comboDisplay(first.combo), name: first.label || '' })
              : translate('toast.conflictExistingMany', { n: conflicts.length })
        });
      } catch (error) {
        /* ignore */
      }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, 'project-board: shortcut conflict scan');

  /* ------------------------------------------------------------ slot wiring */
  ctx.slots.inject('sidebar.panellist', () =>
    ctx.slots.register(
      {
        name: 'sidebar.panellist',
        id: 'project-board',
        order: 50,
        locale: NS,
        label: () => {
          try {
            return ctx.locale.bind(NS)('panel.label');
          } catch (error) {
            return '项目看板';
          }
        }
      },
      PanelIcon as unknown as (props: never) => unknown
    )
  );

  ctx.slots.inject('main', () =>
    ctx.slots.register(
      { name: 'main', key: 'project-board', locale: NS, inject: (): Record<string, unknown> => Object.assign({}, boardInject('main'), { closePanel: closeBoardPanel }) },
      ProjectBoard as unknown as (props: never) => unknown
    )
  );

  ctx.effect(
    () =>
      ctx.sidebarRightTabs.register({
        id: BOARD_ID,
        kind: BOARD_KIND,
        priority: 'builtin',
        title: () => {
          try {
            return ctx.locale.bind(NS)('rightTab.title');
          } catch (error) {
            return '项目看板';
          }
        }
      }),
    'project-board: right tab type'
  );

  ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      { name: 'sidebar.right.pane.tab', key: BOARD_ID, locale: NS, inject: (): Record<string, unknown> => boardInject('right') },
      ResponsiveBoard as unknown as (props: never) => unknown
    )
  );

  const headerInject = (): Record<string, unknown> => ({
    openSession: openSession,
    openBoard: openBoard,
    palette: paletteStore,
    saveSettings: writeSettings,
    headerDrag: headerDragStore,
    hooks: { palette: paletteStore, settings: settingsStore, headerDrag: headerDragStore }
  });
  ctx.slots.inject('conversation.header.leading', () =>
    ctx.slots.register({ name: 'conversation.header.leading', locale: NS, inject: headerInject }, HeaderLeading as unknown as (props: never) => unknown)
  );
  ctx.slots.inject('conversation.session.header.utilities', () =>
    ctx.slots.register(
      { name: 'conversation.session.header.utilities', id: 'project-board-header-right', order: 40, locale: NS, inject: headerInject },
      HeaderUtilities as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('conversation.composer.dock', () =>
    ctx.slots.register(
      { name: 'conversation.composer.dock', id: 'project-board-buttons', order: 100, locale: NS, inject: headerInject },
      ComposerDockButtons as unknown as (props: never) => unknown
    )
  );

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-palette',
        order: 40,
        locale: NS,
        inject: () => ({
          openSession: openSession,
          palette: paletteStore,
          focus: focusStore,
          toggleBoard: toggleNativeBoard,
          toggleLeftSidebar: toggleNativeLeftSidebar,
          toggleHud: toggleHud,
          requestRename: requestRename,
          requestSessionMenu: requestSessionMenu,
          notify: pushToast,
          chooseSetting: chooseSetting,
          hooks: { palette: paletteStore, settings: settingsStore, settingsCatalog: settingsCatalogStore, focus: focusStore, hudOrder: hudOrderStore }
        })
      },
      Palette as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-session-menu',
        order: 41,
        locale: NS,
        inject: () => ({
          archiveSession: archiveSession,
          deleteSession: deleteSession,
          deleteSupported: Boolean(sessionDeleteApi()),
          closeSessionMenu: closeSessionMenu,
          hooks: { sessionMenu: sessionMenuStore }
        })
      },
      SessionMenuDialog as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'project-board-rename', order: 39, locale: NS, inject: () => ({ renameSession: renameSession, rename: renameStore, hooks: { rename: renameStore } }) },
      RenameDialog as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-hud',
        order: 35,
        locale: NS,
        inject: () => ({
          openSession: openSession,
          archiveSession: archiveSession,
          notify: pushToast,
          hudOrder: hudOrderStore,
          saveSettings: writeSettings,
          hooks: Object.assign({ settings: settingsStore, focus: focusStore }, scheduleSource ? { scheduleCatalog: scheduleSource } : {})
        })
      },
      FloatingStatus as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'project-board-toast', order: 45, locale: NS, inject: () => ({ dismissToast: dismissToast, hooks: { toasts: toastStore } }) },
      ToastStack as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-notifier',
        order: 36,
        locale: NS,
        inject: () => ({ notify: pushNotif, system: showSystemNotification, openSession: openSession, hooks: { settings: settingsStore } })
      },
      NotificationWatcher as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-notification-dock',
        order: 44,
        locale: NS,
        inject: () => ({ dismissNotif: dismissNotif, openSession: openSession, hooks: { notifications: notifStore } })
      },
      NotificationDock as unknown as (props: never) => unknown
    )
  );
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'project-board-session-guard',
        order: 34,
        locale: NS,
        inject: () => ({ boardStateNow: boardStateNow, setBoardState: setBoardState, intentRecent: boardIntentRecent })
      },
      BoardSessionGuard as unknown as (props: never) => unknown
    )
  );

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: PLUGIN_SECTION_ID,
        order: 60,
        locale: NS,
        label: () => {
          try {
            return ctx.locale.bind(NS)('settings.title');
          } catch (error) {
            return '项目看板设置';
          }
        },
        inject: () => ({
          settings: settingsStore,
          saveSettings: writeSettings,
          notify: pushToast,
          findBuiltinConflict: findBuiltinConflict,
          logs: logStore,
          hooks: Object.assign(
            { settings: settingsStore, logs: logStore, settingsTarget: settingsTargetStore },
            shortcutsService && shortcutsService.catalog ? { shortcutsCatalog: shortcutsService.catalog } : {}
          )
        })
      },
      SettingsPage as unknown as (props: never) => unknown
    )
  );
}
