/**
 * The command palette: fuzzy session search with project chips, settings search, and the
 * plugin's global keyboard dispatcher (a single capture-phase listener that owns every
 * configured combo).
 */
import { DEFAULT_SETTINGS } from '../constants';
import type { Translate, UseHook } from '../host';
import { h, useEffect, useRef, useState } from '../runtime';
import type { Settings } from '../types';
import { comboDisplay, comboFromEvent, comboHasModifier, isComposingEvent, matchCombo, type KeyEventLike } from '../core/combos';
import { hasBlockingDialog } from '../core/dom';
import { logEvent } from '../core/log';
import { fallbackHook } from '../core/schedule';
import { shortcutState } from '../core/state';
import { EMPTY_CATALOG } from '../core/settings-catalog';
import type { SettingEntry, SettingsCatalogSnapshot } from '../core/settings-catalog';
import { hexToRgba, loadAppearance, paletteFor } from '../ui/appearance';
import { Icon, RunRing } from '../ui/icons';
import { beginHoldScroll, stopHoldScroll } from './chat-scroll';
import { relTime, sessionTitleOf, statusInfo, workspaceLabel, type StatusInfo } from './format';
import { interjectEarliestQueued, scrollToComposerAndFocus } from './interject';
import type { PaletteSnapshot, PaletteStore } from './header';
import type { SessionListSnapshot, SessionStatusMap, WorkspaceSnapshot } from '../core/snapshot';

/** Native keydown events carrying the plugin's own "this press was handled" marker. */
type PluginKeyEvent = KeyboardEvent & {
  pbxSidebarActed?: boolean;
  pbxBoardActed?: boolean;
  pbxPaletteActed?: boolean;
  pbxHudActed?: boolean;
};

export interface FocusStore {
  set(patch: { id?: string | null; at?: number }): void;
}

export interface HudOrderStore {
  getSnapshot(): { ids: string[] };
}

interface PaletteRow {
  id: string;
  title: string;
  project: string;
  projectId: string;
  projectColor: string;
  projectIcon: string;
  info: StatusInfo;
  updatedAt: number;
  archived: boolean;
}

/** A single selectable result. Settings and sessions share one index so arrow keys cross groups. */
type PaletteItem =
  | { kind: 'session'; row: PaletteRow }
  | { kind: 'setting'; entry: SettingEntry };

export interface PaletteProps {
  useSessions: UseHook<SessionListSnapshot>;
  useSessionStatus: UseHook<SessionStatusMap>;
  useWorkspaces: UseHook<WorkspaceSnapshot>;
  usePalette?: UseHook<PaletteSnapshot>;
  useSettings?: UseHook<Settings>;
  useSettingsCatalog?: UseHook<SettingsCatalogSnapshot>;
  useHudOrder?: UseHook<{ ids: string[] }>;
  palette?: PaletteStore;
  focus?: FocusStore;
  openSession?: (id: string) => void;
  chooseSetting?: (entry: SettingEntry) => boolean;
  toggleBoard?: (mode: string) => void;
  toggleLeftSidebar?: () => boolean;
  toggleHud?: () => void;
  requestRename?: (id: string, title: string) => void;
  requestSessionMenu?: (id: string, title: string) => void;
  notify?: (payload: { tone: string; title: string; message: string }) => void;
  t: Translate;
}

export function Palette(props: PaletteProps): unknown {
  const { useSessions, useSessionStatus, useWorkspaces, t, openSession } = props;
  const usePalette = typeof props.usePalette === 'function' ? props.usePalette : fallbackHook<PaletteSnapshot>();
  const useSettings = typeof props.useSettings === 'function' ? props.useSettings : fallbackHook<Settings>();
  const useHudOrder = typeof props.useHudOrder === 'function' ? props.useHudOrder : fallbackHook<{ ids: string[] }>();
  const useSettingsCatalog = typeof props.useSettingsCatalog === 'function' ? props.useSettingsCatalog : fallbackHook<SettingsCatalogSnapshot>();
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
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [scope, setScope] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [closing, setClosing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cycleRef = useRef<{ active: PaletteRow[]; current: string | undefined }>({ active: [], current: undefined });
  const listRef = useRef<HTMLElement | null>(null);
  const paletteOpenerRef = useRef<HTMLElement | null>(null);
  const openRef = useRef(props.openSession);
  const chooseSettingRef = useRef(props.chooseSetting);
  const paletteOpenRef = useRef(false);
  const renameRef = useRef<{ id: string; title: string } | null>(null);
  openRef.current = props.openSession;
  chooseSettingRef.current = props.chooseSetting;
  paletteOpenRef.current = state.open;

  const archived = new Set((wsSnap && wsSnap.archivedSessionIds) || []);
  const ids = (list && list.ids) || [];
  const byId = (list && list.byId) || {};
  const appearance = loadAppearance();
  const projectSpec = (workspaceId: string): { color: string; icon: string } => {
    const spec = appearance[workspaceId] || {};
    return { color: spec.color || paletteFor(workspaceId), icon: spec.icon || 'folder' };
  };
  const wsBySession = new Map<string, NonNullable<WorkspaceSnapshot['items']>[number]>();
  for (const workspace of (wsSnap && wsSnap.items) || []) {
    for (const sid of workspace.sessionIds || []) wsBySession.set(sid, workspace);
  }
  const projects = ((wsSnap && wsSnap.items) || []).map((workspace) => {
    const spec = projectSpec(workspace.workspaceId);
    return { id: workspace.workspaceId, name: workspaceLabel(workspace.title, t), color: spec.color, icon: spec.icon };
  });

  const rows: PaletteRow[] = [];
  const includeArchived = !config.palette || config.palette.includeArchived !== false;
  for (const id of ids) {
    const row = byId[id];
    if (!row || row.blank || row.origin === 'subagent') continue;
    const isArchived = archived.has(id);
    if (isArchived && !includeArchived) continue;
    const workspace = wsBySession.get(id);
    const spec = workspace ? projectSpec(workspace.workspaceId) : { color: paletteFor(''), icon: 'folder' };
    const info = statusInfo(statuses ? statuses.get(id) : undefined, row);
    rows.push({
      id: id,
      title: sessionTitleOf(row, t),
      project: workspace ? workspaceLabel(workspace.title, t) : '',
      projectId: workspace ? workspace.workspaceId : '',
      projectColor: spec.color,
      projectIcon: spec.icon,
      info: info,
      updatedAt: row.updatedAt || 0,
      archived: isArchived
    });
  }
  let currentId: string | undefined;
  for (const id of ids) {
    const row = byId[id];
    if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) {
      currentId = id;
      break;
    }
  }
  renameRef.current = currentId
    ? { id: currentId, title: (byId[currentId] && ((byId[currentId].displayTitle as string) || byId[currentId].title)) || '' }
    : null;
  const toneRank = (row: PaletteRow): number => (row.info.tone === 'running' ? 0 : row.info.tone === 'attention' ? 1 : 2);
  const cycleRows = rows
    .filter((row) => !row.archived)
    .sort((a, b) => {
      const diff = toneRank(a) - toneRank(b);
      return diff !== 0 ? diff : b.updatedAt - a.updatedAt;
    });
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const hudIds = (hudOrderSnap && hudOrderSnap.ids) || [];
  const orderedRows = hudIds.map((id) => rowById.get(id)).filter(Boolean) as PaletteRow[];
  cycleRef.current = { active: orderedRows.length > 0 ? orderedRows : cycleRows, current: currentId };

  const q = query.trim().toLowerCase();
  const visibleSessions = rows
    .filter((row) => (!scope || row.projectId === scope) && (!q || row.title.toLowerCase().includes(q) || row.project.toLowerCase().includes(q)))
    .sort((a, b) => {
      const diff = toneRank(a) - toneRank(b);
      return diff !== 0 ? diff : b.updatedAt - a.updatedAt;
    });
  /* Settings only join the results once the reader types: opening Alt+K still shows the
     familiar session list. Settings sit above sessions under their own group headers, so
     the two kinds never blur together. `scope` is a project filter and applies to sessions
     only — settings are global. */
  const matchesSetting = (entry: SettingEntry): boolean => {
    if (!q) return false;
    return entry.title.toLowerCase().includes(q) || entry.keywords.includes(q);
  };
  const hostSettings = (catalog.host || []).filter(matchesSetting);
  const pluginSettings = (catalog.plugin || []).filter(matchesSetting);
  const items: PaletteItem[] = [
    ...hostSettings.map((entry) => ({ kind: 'setting' as const, entry: entry })),
    ...pluginSettings.map((entry) => ({ kind: 'setting' as const, entry: entry })),
    ...visibleSessions.map((row) => ({ kind: 'session' as const, row: row }))
  ];

  useEffect(() => {
    if (!mounted || !state.open || !inputRef.current) return;
    inputRef.current.focus({ preventScroll: true });
  }, [mounted, state.open]);
  /* The palette is a modal search field, so typing must not be interrupted. Nothing here
     steals focus on purpose, yet the field still lost it while the list under it re-rendered
     (a session push, a status change): the keystrokes then landed wherever focus had gone.
     Put the caret back, but only when focus fell through to the document body — if it sits
     on a real element the reader moved it deliberately (a row, a chip, or another dialog) and
     pulling it back would fight them. */
  useEffect(() => {
    if (!mounted || !state.open) return undefined;
    let frame = 0;
    const restore = (): void => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        if (!state.open || !mounted) return;
        const input = inputRef.current;
        if (!input || !input.isConnected) return;
        const panel = input.closest ? input.closest('.pbx-palette') : null;
        if (!panel) return;
        const active = document.activeElement;
        if (active && panel.contains(active)) return;
        const escapedToBody = !active || active === document.body || active === document.documentElement;
        if (!escapedToBody) return;
        try {
          input.focus({ preventScroll: true });
        } catch (error) {
          /* ignore */
        }
      });
    };
    document.addEventListener('focusout', restore, true);
    document.addEventListener('focusin', restore, true);
    return () => {
      document.removeEventListener('focusout', restore, true);
      document.removeEventListener('focusin', restore, true);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [mounted, state.open]);
  useEffect(() => {
    if (!mounted || !state.open) return;
    const listNode = listRef.current;
    if (!listNode) return;
    const node = listNode.querySelectorAll('.pbx-prow')[index] as HTMLElement | undefined;
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest' });
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
      setQuery('');
      setScope(null);
      setIndex(0);
    }
  }, [state.open]);
  useEffect(() => {
    if (state.open) {
      paletteOpenerRef.current = document.activeElement as HTMLElement | null;
      return undefined;
    }
    const opener = paletteOpenerRef.current;
    paletteOpenerRef.current = null;
    if (opener && opener.isConnected && typeof opener.focus === 'function') {
      try {
        opener.focus({ preventScroll: true });
      } catch (error) {
        /* ignore */
      }
    }
    return undefined;
  }, [state.open]);
  useEffect(() => {
    if (state.open && config.palette.enabled !== false) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (!mounted) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setClosing(false);
      setMounted(false);
      setQuery('');
      setScope(null);
      setIndex(0);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [state.open, config.palette.enabled]);
  useEffect(() => {
    const onShortcut = (rawEvent: KeyboardEvent): void => {
      const event = rawEvent as PluginKeyEvent;
      const eventCombo = comboFromEvent(event as KeyEventLike);
      if (!eventCombo || !comboHasModifier(eventCombo)) return;
      const shortcuts = (settingsRef.current && settingsRef.current.shortcuts) || DEFAULT_SETTINGS.shortcuts;
      /* Alt+W is the shortcut people reach for when the layout surprises them, so record every
         stage of it: a press missing from the log never reached this listener (focus sat in a
         webview/IME/native menu), while a logged press names the gate that swallowed it. */
      const traceLeftSidebar = eventCombo === shortcuts.leftSidebar;
      if (traceLeftSidebar) {
        logEvent('info', 'shortcut', 'leftSidebar:key', {
          repeat: Boolean(event.repeat),
          composing: isComposingEvent(event as KeyEventLike),
          suppressed: shortcutState.suppressed
        });
      }
      if (isComposingEvent(event as KeyEventLike) || event.repeat || shortcutState.suppressed) return;
      if (hasBlockingDialog()) {
        if (traceLeftSidebar) logEvent('info', 'shortcut', 'leftSidebar:blocked', { reason: 'dialog' });
        return;
      }
      if (matchCombo(event as KeyEventLike, shortcuts.palette)) {
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        /* A second live listener (a leaked instance after a client-plugin hot reload) would
           toggle the same panel twice and cancel itself out. Every toggle-type shortcut needs
           this handshake, not just the ones that change the host layout. */
        if (event.pbxPaletteActed === true) {
          logEvent('info', 'shortcut', 'palette:duplicate', {});
          return;
        }
        try {
          event.pbxPaletteActed = true;
        } catch (error) {
          /* frozen event */
        }
        if (settingsRef.current.palette.enabled !== false && palette) palette.toggle('open');
        return;
      }
      if (paletteOpenRef.current && matchCombo(event as KeyEventLike, shortcuts.prev)) {
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        if (palette) palette.set({ move: { dir: -1, at: Date.now() } });
        return;
      }
      if (paletteOpenRef.current && matchCombo(event as KeyEventLike, shortcuts.next)) {
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        if (palette) palette.set({ move: { dir: 1, at: Date.now() } });
        return;
      }
      const isSidebarBoard = matchCombo(event as KeyEventLike, shortcuts.sidebarBoard);
      const isPanelHalf = matchCombo(event as KeyEventLike, shortcuts.panelHalf);
      const isPanelFull = matchCombo(event as KeyEventLike, shortcuts.panelFull);
      const isRename = matchCombo(event as KeyEventLike, shortcuts.rename);
      if (isRename) {
        const target = renameRef.current;
        if (!target || hasBlockingDialog()) return;
        stopHoldScroll(false);
        if (paletteOpenRef.current && palette) palette.set({ open: false });
        event.preventDefault();
        event.stopPropagation();
        if (typeof props.requestRename === 'function') props.requestRename(target.id, target.title);
        return;
      }
      const isSessionMenu = matchCombo(event as KeyEventLike, shortcuts.sessionMenu);
      if (isSessionMenu) {
        const target = renameRef.current;
        if (!target || hasBlockingDialog()) return;
        stopHoldScroll(false);
        if (paletteOpenRef.current && palette) palette.set({ open: false });
        event.preventDefault();
        event.stopPropagation();
        if (typeof props.requestSessionMenu === 'function') props.requestSessionMenu(target.id, target.title);
        return;
      }
      if (isSidebarBoard || isPanelHalf || isPanelFull) {
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        if (paletteOpenRef.current && palette) palette.set({ open: false });
        /* A second live listener (a leaked instance after a client-plugin hot reload) would
           toggle the same panel twice and cancel itself out. The listener that really acted
           owns the press. */
        if (event.pbxBoardActed === true) {
          logEvent('info', 'shortcut', 'board:duplicate', {});
          return;
        }
        if (typeof props.toggleBoard === 'function') {
          props.toggleBoard(isSidebarBoard ? 'narrow' : isPanelHalf ? 'half' : 'full');
        }
        try {
          event.pbxBoardActed = true;
        } catch (error) {
          /* frozen event */
        }
        return;
      }
      if (matchCombo(event as KeyEventLike, shortcuts.leftSidebar)) {
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        if (paletteOpenRef.current && palette) palette.set({ open: false });
        /* A second live listener (a leaked instance after a client-plugin hot reload) would
           toggle the same panel twice and cancel itself out. The listener that really acted
           owns the press. */
        if (event.pbxSidebarActed === true) {
          logEvent('info', 'shortcut', 'leftSidebar:duplicate', {});
          return;
        }
        const acted = typeof props.toggleLeftSidebar === 'function' ? props.toggleLeftSidebar() : false;
        if (acted) {
          try {
            event.pbxSidebarActed = true;
          } catch (error) {
            /* frozen event */
          }
        }
        logEvent('info', 'shortcut', 'leftSidebar:acted', { acted: Boolean(acted), combo: eventCombo });
        return;
      }
      const isHudToggle = matchCombo(event as KeyEventLike, shortcuts.hud);
      if (isHudToggle) {
        if (paletteOpenRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        /* Same duplicate-listener handshake as the palette and the layout toggles: two runs of
           this branch would collapse the HUD and expand it again on one keypress. */
        if (event.pbxHudActed === true) {
          logEvent('info', 'shortcut', 'hud:duplicate', {});
          return;
        }
        try {
          event.pbxHudActed = true;
        } catch (error) {
          /* frozen event */
        }
        if (typeof props.toggleHud === 'function') props.toggleHud();
        return;
      }
      const isInterject = matchCombo(event as KeyEventLike, shortcuts.interject);
      if (isInterject) {
        if (paletteOpenRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        const acted = interjectEarliestQueued();
        if (!acted && typeof props.notify === 'function') {
          props.notify({ tone: 'warn', title: '', message: t('toast.interjectNone') });
        }
        return;
      }
      const isUserNext = matchCombo(event as KeyEventLike, shortcuts.userNext);
      const isUserPrev = matchCombo(event as KeyEventLike, shortcuts.userPrev);
      if (isUserNext || isUserPrev) {
        if (paletteOpenRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        beginHoldScroll(isUserNext ? 1 : -1, event.code);
        return;
      }
      if (matchCombo(event as KeyEventLike, shortcuts.scrollBottom)) {
        if (paletteOpenRef.current) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        stopHoldScroll(false);
        scrollToComposerAndFocus();
        return;
      }
      const isNext = matchCombo(event as KeyEventLike, shortcuts.next);
      const isPrev = matchCombo(event as KeyEventLike, shortcuts.prev);
      if (isNext || isPrev) {
        if (paletteOpenRef.current) {
          event.preventDefault();
          return;
        }
        const cycle = cycleRef.current || { active: [], current: undefined };
        const active = cycle.active || [];
        if (active.length === 0) return;
        event.preventDefault();
        event.stopPropagation();
        const position = active.findIndex((row) => row.id === cycle.current);
        const count = active.length;
        const next = isNext ? (position < 0 ? 0 : (position + 1) % count) : position < 0 ? count - 1 : (position - 1 + count) % count;
        const target = active[next];
        if (target) {
          if (focusRef.current) focusRef.current.set({ id: target.id, at: Date.now() });
          if (typeof openRef.current === 'function') openRef.current(target.id);
        }
        return;
      }
      /* Reaching here means no branch claimed the combo: keep a debug breadcrumb so a broken
         shortcut can be diagnosed from the in-app log instead of guessing. */
      if (event.altKey) logEvent('debug', 'shortcut', 'unmatched', { combo: eventCombo });
    };
    document.addEventListener('keydown', onShortcut, true);
    return () => document.removeEventListener('keydown', onShortcut, true);
  }, [palette]);

  if (!mounted) return null;
  const close = (): void => {
    if (palette) palette.set({ open: false });
  };
  const choose = (item: PaletteItem | undefined): void => {
    if (!item) return;
    close();
    if (item.kind === 'setting') {
      logEvent('info', 'palette', 'setting', { id: item.entry.id, origin: item.entry.origin });
      if (typeof chooseSettingRef.current === 'function') chooseSettingRef.current(item.entry);
      return;
    }
    const row = item.row;
    logEvent('debug', 'palette', 'choose', { id: String(row.id || '').slice(-12) });
    if (focusRef.current) focusRef.current.set({ id: row.id, at: Date.now() });
    if (typeof openSession === 'function') openSession(row.id);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (isComposingEvent(event as KeyEventLike)) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIndex((value) => Math.min(value + 1, Math.max(0, items.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIndex((value) => Math.max(0, value - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (items.length > 0) choose(items[Math.min(index, items.length - 1)]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (scope) setScope(null);
      else close();
    }
  };

  const groupLabel = (item: PaletteItem): string => {
    if (item.kind === 'session') return t('palette.group.sessions');
    return item.entry.origin === 'host' ? t('palette.group.hostSettings') : t('palette.group.pluginSettings');
  };
  const rendered: unknown[] = [];
  let lastGroup = '';
  items.forEach((item, i) => {
    const group = groupLabel(item);
    if (group !== lastGroup) {
      lastGroup = group;
      rendered.push(
        h(
          'div',
          { key: 'group-' + i, className: 'pbx-paletteGroup', role: 'presentation' },
          h('span', { className: 'pbx-paletteGroupLabel' }, group)
        )
      );
    }
    const active = i === index;
    if (item.kind === 'setting') {
      const entry = item.entry;
      rendered.push(
        h(
          'button',
          {
            key: entry.id,
            type: 'button',
            role: 'option',
            'aria-selected': active ? 'true' : 'false',
            className: 'pbx-prow pbx-prowSetting' + (active ? ' active' : ''),
            onMouseEnter: () => setIndex(i),
            onClick: () => choose(item)
          },
          h(
            'span',
            { className: 'pbx-prowSettingIcon', 'data-origin': entry.origin },
            h(Icon, { name: entry.origin === 'host' ? 'sliders' : 'board', size: 13 })
          ),
          h('span', { className: 'pbx-prowTitle' }, entry.title),
          h('span', { className: 'pbx-prowMeta' }, t('palette.setting.open'))
        )
      );
    } else {
      const row = item.row;
      rendered.push(
        h(
          'button',
          {
            key: row.id,
            type: 'button',
            role: 'option',
            'aria-selected': active ? 'true' : 'false',
            className: 'pbx-prow' + (active ? ' active' : '') + (row.archived ? ' archived' : ''),
            onMouseEnter: () => setIndex(i),
            onClick: () => choose(item)
          },
          row.info.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.info.tone }),
          h('span', { className: 'pbx-prowTitle' }, row.title),
          row.archived ? h('span', { className: 'pbx-prowArchived' }, t('palette.archived')) : null,
          h(
            'span',
            { className: 'pbx-prowMeta' },
            h(
              'span',
              { className: 'pbx-prowWsIcon', style: { color: row.projectColor, background: hexToRgba(row.projectColor, 0.16) } },
              h(Icon, { name: row.projectIcon, size: 10 })
            ),
            row.project
          ),
          h('span', { className: 'pbx-prowTime' }, relTime(row.updatedAt, t))
        )
      );
    }
  });

  const blur = Math.min(32, Math.max(6, Number(config.palette.blur) || 15));
  const backdropStyle = {
    background: 'rgba(8,10,14,.20)',
    backdropFilter: 'blur(' + blur + 'px) saturate(1.35)',
    WebkitBackdropFilter: 'blur(' + blur + 'px) saturate(1.35)'
  };
  const panelStyle = {
    backdropFilter: 'blur(' + Math.round(blur * 1.7) + 'px) saturate(1.55)',
    WebkitBackdropFilter: 'blur(' + Math.round(blur * 1.7) + 'px) saturate(1.55)'
  };
  return h(
    'div',
    { className: 'pbx-paletteBackdrop' + (closing ? ' closing' : ''), style: backdropStyle, onClick: close },
    h(
      'div',
      {
        className: 'pbx-palette',
        style: panelStyle,
        role: 'dialog',
        'aria-modal': 'true',
        'data-pbx-overlay': 'palette',
        'aria-label': t('palette.placeholder'),
        onClick: (event: Event) => event.stopPropagation(),
        onKeyDown: (event: KeyboardEvent) => {
          if (isComposingEvent(event as KeyEventLike)) return;
          if (event.key === 'Tab') {
            const panel = event.currentTarget as HTMLElement;
            const nodes = (Array.prototype.slice.call(panel.querySelectorAll('button, input')) as HTMLElement[]).filter(
              (node) => !(node as HTMLButtonElement).disabled && node.getClientRects().length > 0
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
          if (event.key !== 'Escape') return;
          event.preventDefault();
          if (scope) setScope(null);
          else close();
        }
      },
      h(
        'div',
        { className: 'pbx-paletteHead' },
        h(Icon, { name: 'search', size: 16 }),
        h('input', {
          ref: inputRef,
          className: 'pbx-paletteInput',
          value: query,
          placeholder: t('palette.placeholder'),
          'aria-label': t('palette.placeholder'),
          onChange: (event: Event) => setQuery((event.target as HTMLInputElement).value),
          onKeyDown
        })
      ),
      h(
        'div',
        { className: 'pbx-paletteChips' },
        h(
          'button',
          {
            type: 'button',
            className: 'pbx-pchip' + (scope === null ? ' on' : ''),
            onClick: () => {
              setScope(null);
              if (inputRef.current) inputRef.current.focus();
            }
          },
          t('palette.allProjects')
        ),
        projects.map((project) =>
          h(
            'button',
            {
              key: project.id,
              type: 'button',
              className: 'pbx-pchip' + (scope === project.id ? ' on' : ''),
              onClick: () => {
                setScope(scope === project.id ? null : project.id);
                if (inputRef.current) inputRef.current.focus();
              }
            },
            h(
              'span',
              { className: 'pbx-pchipIcon', style: { color: project.color, background: hexToRgba(project.color, 0.16) } },
              h(Icon, { name: project.icon, size: 12 })
            ),
            project.name
          )
        )
      ),
      h(
        'div',
        { className: 'pbx-paletteList', ref: listRef },
        items.length === 0
          ? h('div', { className: 'pbx-paletteEmpty' }, t('palette.empty'))
          : rendered
      ),
      h('div', { className: 'pbx-paletteFoot' }, t('palette.hint', {
        prev: comboDisplay(config.shortcuts.prev),
        next: comboDisplay(config.shortcuts.next),
        palette: comboDisplay(config.shortcuts.palette)
      }))
    )
  );
}
