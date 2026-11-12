/**
 * The floating session list (HUD): live timers for running/attention sessions, a collapsible
 * pill, drag-to-move with edge snapping, archiving, the shortcut footer, and the automatic
 * dock/restore around the native left sidebar.
 */
import { DEFAULT_SETTINGS, HUD_COLLAPSE_KEY, HUD_POS_KEY, HUD_STARTS_KEY } from '../constants';
import type { Translate, UseHook } from '../host';
import { cloneJson } from '../core/json';
import { loadJson, saveJson } from '../core/json';
import { logEvent } from '../core/log';
import { HOST_LAYOUT_ATTRIBUTES, centreColumnElement, isInsideCentreColumn, isRightbarFullscreen, sidebarCollapsedFlag, sidebarColumnElement, sidebarFrameElement } from '../core/dom';
import { fallbackHook, type ScheduleSnapshot } from '../core/schedule';
import { h, useLayoutEffectSafe, useEffect, useRef, useState } from '../runtime';
import type { Settings } from '../types';
import { comboDisplay } from '../core/combos';
import { measureTextWidth } from '../ui/appearance';
import { Icon, RunRing } from '../ui/icons';
import { type SaveSettings } from '../core/header-drag';
import { findChatScroller } from './chat-dom';
import { relTime, sessionTitleOf, statusInfo, workspaceLabel, type Tone } from './format';
import type { SessionListSnapshot, SessionStatusMap, WorkspaceSnapshot } from '../core/snapshot';

export function fmtElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number): string => String(value).padStart(2, '0');
  return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
}

/** Top edge of the main chat panel, so the floating list never covers the header/title bar. */
export function hudContentTop(): number {
  try {
    const anchor = document.querySelector('[data-chat-anchor-key]');
    let node: Element | null = anchor ? anchor.parentElement : null;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      if (/(auto|scroll)/.test(style.overflowY) && node.getBoundingClientRect().height > 120) return node.getBoundingClientRect().top;
      node = node.parentElement;
    }
    const scroller = document.querySelector('.an3WzG_scrollBody');
    if (scroller) return scroller.getBoundingClientRect().top;
    const flow = document.querySelector('[data-slot="conversation.chat.flow"]');
    if (flow) {
      const rect = flow.getBoundingClientRect();
      if (rect.height > 0) return rect.top;
    }
  } catch (error) {
    /* ignore */
  }
  return 112;
}

export interface FocusSnapshot {
  id?: string | null;
  at?: number;
}

export interface HudOrderStore {
  set(patch: { ids: string[] }): void;
}

export interface FloatingStatusProps {
  useSessions: UseHook<SessionListSnapshot>;
  useSessionStatus: UseHook<SessionStatusMap>;
  useWorkspaces: UseHook<WorkspaceSnapshot>;
  useSettings?: UseHook<Settings>;
  useScheduleCatalog?: UseHook<ScheduleSnapshot | null>;
  useFocus?: UseHook<FocusSnapshot>;
  hudOrder?: HudOrderStore;
  openSession?: (id: string) => void;
  archiveSession?: (id: string) => Promise<{ ok?: boolean; error?: { message?: string } } | void> | { ok?: boolean } | void;
  notify?: (payload: { tone: string; title: string; message: string; ttl?: number }) => void;
  saveSettings?: SaveSettings;
  t: Translate;
}

interface HudRow {
  id: string;
  title: string;
  project: string;
  tone: Tone;
  labelKey: string;
  updatedAt: number;
  start: number;
  timed: boolean;
  auto: boolean;
  recent?: boolean;
  current?: boolean;
  spotlight?: boolean;
}

interface StartsState {
  running: Record<string, number>;
  attention: Record<string, number>;
}

interface Point {
  x: number;
  y: number;
}

interface DragState {
  dx: number;
  dy: number;
  startX: number;
  startY: number;
}

interface DockSaved {
  pos: Point | null;
  collapsed: boolean;
}

interface BoxState {
  collapsed: boolean | null;
  width: number;
  height: number;
  x: number;
  y: number;
}

const NO_AUTO = new Set<string>();

export function FloatingStatus(props: FloatingStatusProps): unknown {
  const { useSessions, useSessionStatus, useWorkspaces, t, openSession, saveSettings } = props;
  const useSettings = typeof props.useSettings === 'function' ? props.useSettings : fallbackHook<Settings>();
  const useScheduleCatalog = typeof props.useScheduleCatalog === 'function' ? props.useScheduleCatalog : fallbackHook<ScheduleSnapshot | null>();
  const useFocus = typeof props.useFocus === 'function' ? props.useFocus : fallbackHook<FocusSnapshot>();
  const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
  const list = useSessions((snapshot) => snapshot);
  const statuses = useSessionStatus((snapshot) => snapshot);
  const wsSnap = useWorkspaces((snapshot) => snapshot);
  const scheduleSnap = useScheduleCatalog((snapshot) => snapshot);
  const autoSet = (scheduleSnap && scheduleSnap.activeSessionIds) || NO_AUTO;
  const focusSnap = useFocus((snapshot) => snapshot);
  const hudMaxSessions = Math.min(20, Math.max(1, Number(config.hud.maxSessions) || 6));
  const hudListRowUnit = 51;
  const hudListChrome = 15;
  const hudListMaxHeight = Math.min(
    hudMaxSessions * hudListRowUnit + hudListChrome,
    Math.max(hudListRowUnit + hudListChrome, Math.floor(((window.innerHeight || 800) - 180) / hudListRowUnit) * hudListRowUnit + hudListChrome)
  );
  const [now, setNow] = useState<number>(() => Date.now());
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const saved = window.localStorage.getItem(HUD_COLLAPSE_KEY);
      if (saved === '1') return true;
      if (saved === '0') return false;
    } catch (error) {
      /* ignore */
    }
    return Boolean(config.hud.defaultCollapsed);
  });
  const [mounted, setMounted] = useState<boolean>(() => config.hud.enabled !== false);
  const [swap, setSwap] = useState('');
  /* Which way the collapse chevron points: it follows the edge the HUD is anchored to. */
  const [collapseDir, setCollapseDir] = useState('down');
  const swapTimersRef = useRef<number[]>([]);
  const [pos, setPos] = useState<Point | null>(() => {
    const value = loadJson<Point | null>(HUD_POS_KEY, null);
    return value && typeof value.x === 'number' ? value : null;
  });
  const [dragging, setDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  const hudDragMovedRef = useRef(false);
  const prevDefaultCollapsedRef = useRef(config.hud.defaultCollapsed);
  const hudRef = useRef<HTMLElement | null>(null);
  const listContentRef = useRef<HTMLElement | null>(null);
  const rowRectsRef = useRef<Map<string, { top: number; left: number }> | null>(null);
  const [listHeight, setListHeight] = useState(0);
  const [hintsHidden, setHintsHidden] = useState(false);
  const [listOverflow, setListOverflow] = useState(false);
  const [hudWidth, setHudWidth] = useState(0);
  const collapsedStateRef = useRef(collapsed);
  collapsedStateRef.current = collapsed;
  const autoDockRef = useRef(false);
  const sidebarSavedRef = useRef<DockSaved | null>(null);
  const [present, setPresent] = useState(false);
  const publishedOrderRef = useRef('');
  const prevCurrentRef = useRef<string | undefined>(undefined);
  const [localSpot, setLocalSpot] = useState<{ id: string | null; at: number }>({ id: null, at: 0 });
  const dragRef = useRef<DragState | null>(null);
  const posRef = useRef<Point | null>(pos);
  const startsRef = useRef<StartsState | null>(null);
  if (startsRef.current === null) {
    const stored = loadJson<Partial<StartsState>>(HUD_STARTS_KEY, {});
    startsRef.current = { running: (stored && stored.running) || {}, attention: (stored && stored.attention) || {} };
  }
  posRef.current = pos;

  useEffect(() => {
    if (config.hud.enabled === false) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [config.hud.enabled]);

  /* Keep the card mounted for one exit frame so hiding it can animate. */
  useEffect(() => {
    if (config.hud.enabled === false) {
      const timer = window.setTimeout(() => setMounted(false), 180);
      return () => window.clearTimeout(timer);
    }
    setMounted(true);
    return undefined;
  }, [config.hud.enabled]);

  /* Alt+E swaps the pill and the list with a short crossfade. */
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => {
    const runSwap = (mutate: () => void): void => {
      swapTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      setSwap('out');
      swapTimersRef.current = [
        window.setTimeout(() => {
          mutate();
          setSwap('in');
        }, 120),
        window.setTimeout(() => setSwap(''), 300)
      ];
    };
    const persist = (next: boolean): void => {
      try {
        window.localStorage.setItem(HUD_COLLAPSE_KEY, next ? '1' : '0');
      } catch (error) {
        /* ignore */
      }
    };
    const onToggle = (): void => {
      const current = configRef.current || DEFAULT_SETTINGS;
      if (current.hud.enabled === false) {
        if (typeof saveSettings === 'function') {
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
    window.addEventListener('pbx-hud-toggle', onToggle);
    return () => {
      window.removeEventListener('pbx-hud-toggle', onToggle);
      swapTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, [config.hud.enabled, saveSettings]);

  useEffect(() => {
    if (!pos) return undefined;
    const clamp = (): void => {
      if (dragging || autoDockRef.current) return;
      const box = hudRef.current;
      const width = box ? box.offsetWidth : 300;
      const height = box ? box.offsetHeight : 220;
      const minTop = hudContentTop() + 4;
      const current = posRef.current as Point;
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
    window.addEventListener('resize', clamp);
    return () => window.removeEventListener('resize', clamp);
  }, [pos, dragging]);

  useEffect(() => {
    const handler = (): void => {
      setCollapsed(Boolean(config.hud.defaultCollapsed));
      setPos(null);
      startsRef.current = { running: {}, attention: {} };
    };
    window.addEventListener('pbx-hud-reset', handler);
    return () => window.removeEventListener('pbx-hud-reset', handler);
  }, [config.hud.defaultCollapsed]);

  useEffect(() => {
    if (prevDefaultCollapsedRef.current === config.hud.defaultCollapsed) return;
    prevDefaultCollapsedRef.current = config.hud.defaultCollapsed;
    try {
      window.localStorage.removeItem(HUD_COLLAPSE_KEY);
    } catch (error) {
      /* ignore */
    }
    setCollapsed(Boolean(config.hud.defaultCollapsed));
  }, [config.hud.defaultCollapsed]);

  useLayoutEffectSafe(() => {
    const element = listContentRef.current;
    if (!element) return;
    const next = Math.min(element.scrollHeight, hudListMaxHeight);
    setListHeight((previous) => (Math.abs(previous - next) > 0.5 ? next : previous));
    setListOverflow((previous) => {
      const overflows = element.scrollHeight > hudListMaxHeight + 1;
      return previous === overflows ? previous : overflows;
    });
  });
  /* FLIP: when the rows reorder (e.g. after switching sessions) glide each row from its old
     spot to the new one, so the others visibly make way instead of jumping. */
  useLayoutEffectSafe(() => {
    const container = listContentRef.current;
    if (!container) return;
    const nodes = container.querySelectorAll('[data-hud-id]');
    const previous = rowRectsRef.current || new Map<string, { top: number; left: number }>();
    const next = new Map<string, { top: number; left: number }>();
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    nodes.forEach((node) => {
      const id = node.getAttribute('data-hud-id');
      if (!id) return;
      const element = node as HTMLElement;
      const top = element.offsetTop;
      const left = element.offsetLeft;
      next.set(id, { top: top, left: left });
      const before = previous.get(id);
      if (!before || reduce || dragging || typeof (element as HTMLElement & { animate?: unknown }).animate !== 'function') return;
      const dy = before.top - top;
      const dx = before.left - left;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      try {
        element.animate(
          [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
          { duration: 240, easing: 'cubic-bezier(0.00, 0.00, 0.20, 1)' }
        );
      } catch (error) {
        /* ignore */
      }
    });
    rowRectsRef.current = next;
  });
  useEffect(() => {
    if (!dragging) return undefined;
    const SNAP = 28;
    const move = (event: PointerEvent): void => {
      const drag = dragRef.current || ({ dx: 0, dy: 0, startX: 0, startY: 0 } as DragState);
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
      /* Glue to the nearest edge / corner while dragging; dropping there keeps the list open. */
      if (rawX <= SNAP) x = gap;
      else if (rawX + width >= window.innerWidth - SNAP) x = maxX;
      if (rawY <= SNAP) y = minTop;
      else if (rawY + height >= window.innerHeight - SNAP) y = maxY;
      const next = { x: x, y: y };
      posRef.current = next;
      setPos(next);
    };
    const up = (): void => {
      setDragging(false);
      if (!hudDragMovedRef.current) return;
      setHasDragged(true);
      if (posRef.current) saveJson(HUD_POS_KEY, posRef.current);
      if (config.hud.defaultPosition !== 'last' && typeof saveSettings === 'function') {
        const next = cloneJson(config);
        next.hud = Object.assign({}, next.hud, { defaultPosition: 'last' });
        saveSettings(next);
      }
      if (posRef.current) logEvent('debug', 'hud', 'drag drop', posRef.current as unknown as Record<string, unknown>);
      window.setTimeout(() => {
        hudDragMovedRef.current = false;
      }, 220);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]);

  /* Keep an edge-snapped HUD on its edge when the pill and the list swap sizes:
     a bottom-left list must collapse into a bottom-left pill, not float up. */
  const prevBoxRef = useRef<BoxState>({ collapsed: null, width: 0, height: 0, x: 0, y: 0 });
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
    prevBoxRef.current = { collapsed: collapsed, width: width, height: height, x: rect.left, y: rect.top };
    if (autoDockRef.current) return;
    const edge = 26;
    let direction = 'down';
    if (rect.bottom >= window.innerHeight - edge) direction = 'down';
    else if (rect.right >= window.innerWidth - edge) direction = 'right';
    else if (rect.top <= edge) direction = 'up';
    else if (rect.left <= edge) direction = 'left';
    setCollapseDir((current) => (current === direction ? current : direction));
  });

  /* When the native left sidebar opens, tuck the floating list away as a pill in the
     bottom-right corner; when that sidebar closes again, put it back where it was. */
  useEffect(() => {
    if (config.hud.enabled === false) return undefined;
    let last: boolean | null = null;
    const frameNow = (): HTMLElement | null => sidebarFrameElement();
    const sidebarColumn = (): Element | null => sidebarColumnElement();
    /* Judge by the frame's own grid template first. DSH renders the frame with an inline
       `gridTemplateColumns` whose first track IS the sidebar column ("280px …"), and a
       `data-sidebar-collapsed` attribute that flips with the collapsed flag. Both describe the
       layout's target state, so neither reads "collapsed" halfway through the width animation
       the way the column's measured width does. The measured width stays as a fallback for a
       frame we cannot parse, and a fullscreen board still counts as "not expanded" because it
       hides the column while `sidebarCollapsed` stays false. */
    const readExpanded = (): { expanded: boolean; source: string } | null => {
      if (isRightbarFullscreen()) return { expanded: false, source: 'fullscreen' };
      const frame = frameNow();
      if (frame) {
        const template = (frame.style && frame.style.gridTemplateColumns) || '';
        const first = parseFloat(template);
        if (Number.isFinite(first) && first >= 0) return { expanded: first > 120, source: 'grid' };
      }
      const column = sidebarColumn();
      if (column) {
        const width = column.getBoundingClientRect().width;
        if (width > 120) return { expanded: true, source: 'measured' };
        if (width > 0) return { expanded: false, source: 'measured' };
      }
      const collapsedFlag = sidebarCollapsedFlag();
      if (collapsedFlag === null) return null;
      return { expanded: !collapsedFlag, source: 'attribute' };
    };
    /* Right edge of the native session list, so the pill hugs that column instead of the window. */
    const sidebarRightEdge = (): number | null => {
      const column = sidebarColumn();
      const rect = column ? column.getBoundingClientRect() : null;
      if (!rect || rect.width < 60) return null;
      return rect.right;
    };
    /* Keep the pill's original vertical spot and just slide it to the sidebar's right edge, so the
       docked position corresponds to where it used to be instead of jumping to the corner. */
    const dockPos = (anchor: Point | null): Point => {
      const box = hudRef.current;
      const width = box ? box.offsetWidth : 120;
      const height = box ? box.offsetHeight : 34;
      const edge = sidebarRightEdge();
      const fallbackX = Math.max(6, window.innerWidth - width - 12);
      const x = edge == null ? fallbackX : Math.min(fallbackX, Math.max(6, edge + 8));
      const minTop = hudContentTop() + 4;
      const rect = box ? box.getBoundingClientRect() : null;
      const anchorY = anchor && typeof anchor.y === 'number' ? anchor.y : rect ? rect.top : minTop;
      const y = Math.min(Math.max(minTop, anchorY), Math.max(minTop, window.innerHeight - height - 8));
      return { x: x, y: y };
    };
    /* Timers owned by the dock/restore dance. A pending reposition must never run after the
       sidebar closed again, or the pill lands at the old docked spot while nothing is there. */
    let dockTimer = 0;
    let followTimer = 0;
    let settleTimer = 0;
    const clearDockTimers = (): void => {
      window.clearTimeout(dockTimer);
      window.clearTimeout(followTimer);
      dockTimer = 0;
      followTimer = 0;
    };
    const applyDockPos = (): void => {
      const saved = sidebarSavedRef.current;
      const next = dockPos(saved && saved.pos);
      posRef.current = next;
      setPos(next);
    };
    const dock = (): void => {
      if (autoDockRef.current) return;
      autoDockRef.current = true;
      sidebarSavedRef.current = { pos: posRef.current ? Object.assign({}, posRef.current) : null, collapsed: collapsedStateRef.current };
      setCollapsed(true);
      clearDockTimers();
      dockTimer = window.setTimeout(() => {
        dockTimer = 0;
        applyDockPos();
      }, 80);
      /* The column animates to its new width, so measure twice: once as the list collapses and
         once after the transition, otherwise the pill stops halfway across the screen. */
      followTimer = window.setTimeout(() => {
        followTimer = 0;
        if (autoDockRef.current) applyDockPos();
      }, 320);
      logEvent('info', 'hud', 'dock', {});
    };
    const restore = (): void => {
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
      logEvent('info', 'hud', 'restore', { hadSaved: Boolean(saved) });
    };
    /* The grid template and the collapsed attribute are authoritative, so act on them at once.
       A measured column width is the animated one, so require the same reading twice before
       believing it: a dock/restore must never fire halfway through the sidebar transition. */
    let sample: boolean | null = null;
    const tick = (): void => {
      const state = readExpanded();
      if (!state) return;
      const expanded = state.expanded;
      if (state.source === 'measured' && expanded !== sample) {
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
    const onResize = (): void => {
      if (!autoDockRef.current) return;
      applyDockPos();
    };
    let raf = 0;
    const schedule = (): void => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        tick();
      });
    };
    const observer = typeof MutationObserver !== 'undefined' ? new MutationObserver(schedule) : null;
    if (observer) {
      observer.observe(document.documentElement, {
        subtree: true,
        attributes: true,
        attributeFilter: HOST_LAYOUT_ATTRIBUTES
      });
    }
    const timer = window.setInterval(tick, 800);
    window.addEventListener('resize', onResize);
    tick();
    return () => {
      if (observer) observer.disconnect();
      window.clearInterval(timer);
      window.clearTimeout(settleTimer);
      clearDockTimers();
      window.removeEventListener('resize', onResize);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [config.hud.enabled]);

  const onDragStart = (event: PointerEvent): void => {
    const target = event.target as Element | null;
    const hitButton = target && target.closest ? target.closest('button') : null;
    if (event.button !== 0 || (hitButton && hitButton !== event.currentTarget)) return;
    const box = hudRef.current;
    if (!box) return;
    const rect = box.getBoundingClientRect();
    dragRef.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, startX: event.clientX, startY: event.clientY };
    hudDragMovedRef.current = false;
    setDragging(true);
    event.preventDefault();
  };

  const archived = new Set((wsSnap && wsSnap.archivedSessionIds) || []);
  const ids = (list && list.ids) || [];
  const byId = (list && list.byId) || {};
  const wsBySession = new Map<string, NonNullable<WorkspaceSnapshot['items']>[number]>();
  for (const workspace of (wsSnap && wsSnap.items) || []) {
    for (const sid of workspace.sessionIds || []) wsBySession.set(sid, workspace);
  }
  const starts = startsRef.current as StartsState;
  const seenRunning = new Set<string>();
  const seenAttention = new Set<string>();
  let dirty = false;
  const allRows: HudRow[] = [];
  for (const id of ids) {
    const row = byId[id];
    if (!row || row.blank || row.origin === 'subagent' || archived.has(id)) continue;
    const info = statusInfo(statuses ? statuses.get(id) : undefined, row);
    const workspace = wsBySession.get(id);
    let start = 0;
    let timed = false;
    if (info.tone === 'running') {
      seenRunning.add(id);
      if (!starts.running[id]) {
        starts.running[id] = now;
        dirty = true;
      }
      start = starts.running[id];
      timed = true;
    } else if (info.tone === 'attention') {
      seenAttention.add(id);
      if (!starts.attention[id]) {
        starts.attention[id] = now;
        dirty = true;
      }
      start = starts.attention[id];
      timed = true;
    }
    allRows.push({
      id: id,
      title: sessionTitleOf(row, t),
      project: workspace ? workspaceLabel(workspace.title, t) : '',
      tone: info.tone,
      labelKey: info.labelKey,
      updatedAt: row.updatedAt || 0,
      start: start,
      timed: timed,
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

  const nonIdle = allRows.filter((row) => row.tone !== 'idle' && !(row.tone === 'done' && config.hud.includeDone === false));
  const included = new Set(nonIdle.map((row) => row.id));
  let recent: HudRow[] = [];
  if (config.hud.recentEnabled !== false) {
    const limit = Math.min(20, Math.max(1, Number(config.hud.recentCount) || 5));
    recent = allRows
      .filter((row) => !included.has(row.id))
      .filter((row) => !(row.tone === 'done' && config.hud.includeDone === false))
      .filter((row) => !(config.hud.recentExcludeAuto !== false && row.auto))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit)
      .map((row) => Object.assign({}, row, { recent: true }));
  }
  let currentId: string | undefined;
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
    if (previous !== undefined && previous !== currentId) setLocalSpot({ id: currentId, at: Date.now() });
  }, [currentId]);

  const localSpotAt = localSpot.at || 0;
  const focusSpotAt = (focusSnap && focusSnap.at) || 0;
  const useLocalSpot = Boolean(localSpot.id) && localSpotAt >= focusSpotAt;
  const spotlightId = useLocalSpot ? localSpot.id : (focusSnap && focusSnap.id) || localSpot.id;
  const spotlightAt = useLocalSpot ? localSpotAt : focusSpotAt || localSpotAt;
  const spotlightActive = Boolean(spotlightId) && now - spotlightAt < 1800;
  const chosen = nonIdle.concat(recent);
  const chosenIds = new Set(chosen.map((row) => row.id));
  const rowById = new Map(allRows.map((row) => [row.id, row]));
  /* The current session and the just-opened one are always listed, but at their natural
     position — appending them at the end made the list jump while switching sessions. */
  for (const id of [currentId, spotlightActive ? spotlightId : null]) {
    if (id && !chosenIds.has(id) && rowById.has(id)) {
      chosen.push(Object.assign({}, rowById.get(id) as HudRow));
      chosenIds.add(id);
    }
  }
  const rows: HudRow[] = chosen.map((row) => {
    const decorated = Object.assign({}, row);
    if (row.id === currentId) decorated.current = true;
    if (spotlightActive && row.id === spotlightId) decorated.spotlight = true;
    return decorated;
  });
  /* One rule: active states first, then most recent activity. Timers never reorder rows. */
  const order: Record<string, number> = { running: 0, attention: 1, done: 2, idle: 3 };
  rows.sort((a, b) => {
    const rank = order[a.tone] - order[b.tone];
    if (rank !== 0) return rank;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
  /* Reserve a gutter for the floating list inside the conversation only: pad the chat scroller
     (never the header/title bar). Padding is the single mechanism — the native width variable is
     left alone — and the padded node is remembered so a session remount always restores it.
     Recompute on window resize and on the centre column's own size (panel/sidebar changes). */
  useLayoutEffectSafe(() => {
    const gap = 14;
    /* The mutation observer below fires for every transcript change, and a streaming reply
       re-renders the conversation constantly. Clearing and re-setting the padding on each
       callback invalidated layout while the chat view was animating its own jump, which can
       cancel that smooth scroll — the "the arrow sometimes stops short of the bottom" symptom.
       Remember what is applied and only write style when the target node or the reserve
       actually changes. */
    let padded: HTMLElement | null = null;
    let paddedLeft = '';
    let paddedRight = '';
    const release = (node: HTMLElement | null): void => {
      if (!node) return;
      if (node.style.paddingLeft) node.style.paddingLeft = '';
      if (node.style.paddingRight) node.style.paddingRight = '';
    };
    const apply = (): void => {
      const box = hudRef.current;
      const scroller = findChatScroller();
      let nextLeft = '';
      let nextRight = '';
      if (!collapsed && box && scroller && isInsideCentreColumn(scroller)) {
        const rect = box.getBoundingClientRect();
        const srect = scroller.getBoundingClientRect();
        if (srect.width) {
          const leftSide = rect.left + rect.width / 2 <= srect.left + srect.width / 2;
          const reserve = leftSide ? Math.round(rect.right + gap - srect.left) : Math.round(srect.right - (rect.left - gap));
          if (reserve > 0 && srect.width - reserve >= 360) {
            if (leftSide) nextLeft = reserve + 'px';
            else nextRight = reserve + 'px';
          }
        }
      }
      const target = nextLeft || nextRight ? scroller : null;
      if (padded && padded !== target) {
        release(padded);
        padded = null;
        paddedLeft = '';
        paddedRight = '';
      }
      if (!target) return;
      /* Idempotent: a no-op callback must not touch the style sheet at all. */
      if (padded === target && paddedLeft === nextLeft && paddedRight === nextRight) return;
      padded = target;
      paddedLeft = nextLeft;
      paddedRight = nextRight;
      if (target.style.paddingLeft !== nextLeft) target.style.paddingLeft = nextLeft;
      if (target.style.paddingRight !== nextRight) target.style.paddingRight = nextRight;
    };
    apply();
    let frame = 0;
    const schedule = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };
    window.addEventListener('resize', schedule);
    let observer: ResizeObserver | null = null;
    let mutationObserver: MutationObserver | null = null;
    const column = centreColumnElement();
    if (column && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(column);
    }
    /* A session switch replaces the conversation scroller inside the center column.
       The ResizeObserver only fires on column size changes, so a content swap that
       keeps the same column width leaves the new scroller unpadded — the HUD then
       overlaps the conversation. Watch childList too and apply padding directly in
       the callback (a microtask, runs before the next paint) so there is no 1-frame
       flash where the new scroller has no padding. apply() is idempotent, so calling
       it on every mutation is safe; ResizeObserver still uses schedule() (rAF) for
       column-size changes which are less urgent. */
    if (column && typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver((): void => apply());
      mutationObserver.observe(column, { childList: true, subtree: true });
    }
    return () => {
      window.removeEventListener('resize', schedule);
      if (observer) observer.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      if (frame) cancelAnimationFrame(frame);
      release(padded);
      padded = null;
    };
  }, [collapsed, hudWidth, pos && pos.x, pos && pos.y, rows.length, config.hud.enabled]);
  /* Fit the panel to the longest session title (bounded), so short lists do not waste width. */
  useLayoutEffectSafe(() => {
    if (!rows.length || collapsed) return;
    const titleEl = listContentRef.current ? listContentRef.current.querySelector('.pbx-hudRowTitle') : null;
    const font = titleEl ? window.getComputedStyle(titleEl).font || '' : '';
    let longest = 0;
    for (const row of rows) {
      const w = measureTextWidth(row.title, font);
      if (w > longest) longest = w;
    }
    if (!longest) return;
    const minWidth = 208;
    const maxWidth = Math.min(420, Math.max(260, window.innerWidth * 0.42));
    const next = Math.round(Math.min(maxWidth, Math.max(minWidth, longest + 124)));
    setHudWidth((previous) => (Math.abs(previous - next) > 1 ? next : previous));
  }, [rows.map((row) => row.title).join('|'), collapsed]);
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
    const target = Array.prototype.find.call(root.querySelectorAll('[data-hud-id]'), (node: HTMLElement) => node.getAttribute('data-hud-id') === spotlightId);
    if (target && typeof target.scrollIntoView === 'function') target.scrollIntoView({ block: 'nearest' });
  }, [spotlightActive, spotlightId]);

  useEffect(() => {
    if (rows.length > 0) {
      setPresent(true);
      return undefined;
    }
    const timer = window.setTimeout(() => setPresent(false), 180);
    return () => window.clearTimeout(timer);
  }, [rows.length]);

  const orderKey = fullOrderIds.join('|');
  useEffect(() => {
    const store = props.hudOrder;
    if (!store || typeof store.set !== 'function') return;
    if (config.hud.enabled === false) {
      publishedOrderRef.current = '';
      store.set({ ids: [] });
      return;
    }
    if (publishedOrderRef.current === orderKey) return;
    publishedOrderRef.current = orderKey;
    store.set({ ids: fullOrderIds });
  }, [orderKey, config.hud.enabled]);

  if (config.hud.enabled === false && !mounted) return null;
  const closing = config.hud.enabled === false || (rows.length === 0 && present);
  if (rows.length === 0 && !present) return null;

  const positionMode = config.hud.defaultPosition || 'top-right';
  const useSavedPosition = Boolean(pos) && (positionMode === 'last' || dragging || hasDragged);
  const style = Object.assign(
    {},
    useSavedPosition && pos ? { left: pos.x + 'px', top: pos.y + 'px' } : {},
    !collapsed && hudWidth ? { width: hudWidth + 'px' } : {}
  );
  const className =
    'pbx-hud' +
    (useSavedPosition ? ' moved' : ' default' + (positionMode === 'bottom-right' ? ' bottom' : '')) +
    (dragging ? ' dragging' : '') +
    (closing ? ' closing' : '');
  const runningCount = rows.filter((row) => row.tone === 'running').length;
  const attentionCount = rows.filter((row) => row.tone === 'attention').length;
  const archiveRow = async (row: HudRow): Promise<void> => {
    if (!row) return;
    /* Never swallow the click: if the host did not hand us an archive entry point, say so instead
       of leaving the row unchanged with no feedback (which reads as a broken button). */
    if (typeof props.archiveSession !== 'function') {
      logEvent('warn', 'hud', 'archive-unsupported', { id: String(row.id || '').slice(-12) });
      if (typeof props.notify === 'function') {
        props.notify({ tone: 'warn', title: t('hud.title'), message: t('hud.archiveUnavailable'), ttl: 5000 });
      }
      return;
    }
    logEvent('info', 'hud', 'archive', { id: String(row.id || '').slice(-12) });
    let result: { ok?: boolean; error?: { message?: string } } | void = null as unknown as void;
    try {
      result = await props.archiveSession(row.id);
    } catch (error) {
      result = { ok: false, error: { message: String((error && (error as Error).message) || error) } };
    }
    const ok = !result || (result as { ok?: boolean }).ok !== false;
    if (typeof props.notify === 'function') {
      props.notify(
        ok
          ? { tone: 'success', title: t('hud.title'), message: t('toast.archived'), ttl: 3200 }
          : {
              tone: 'warn',
              title: t('hud.title'),
              message: t('menu.failed', { message: ((result as { error?: { message?: string } }).error && (result as { error?: { message?: string } }).error?.message) || 'archive failed' }),
              ttl: 5000
            }
      );
    }
  };
  if (collapsed) {
    const pillTone = runningCount > 0 ? ' live' : attentionCount > 0 ? ' attention' : '';
    return h(
      'button',
      {
        ref: hudRef,
        type: 'button',
        className: className + ' collapsed',
        style: style,
        title: t('hud.expand'),
        onPointerDown: onDragStart,
        onClick: () => {
          if (hudDragMovedRef.current) {
            hudDragMovedRef.current = false;
            return;
          }
          setCollapsed(false);
          try {
            window.localStorage.setItem(HUD_COLLAPSE_KEY, '0');
          } catch (error) {
            /* ignore */
          }
        }
      },
      h('span', { className: 'pbx-hudPillIcon' + pillTone }, h(Icon, { name: 'grid', size: 13 })),
      h('span', { className: 'pbx-hudPillText' }, String(runningCount)),
      h('span', { className: 'pbx-hudPillLabel' }, t('hud.running')),
      attentionCount > 0 ? h('span', { className: 'pbx-hudPillAttn', title: t('stat.attention') }, String(attentionCount)) : null
    );
  }
  return h(
    'div',
    { ref: hudRef, className: className, style: style },
    h(
      'div',
      { className: 'pbx-hudInner' + (swap ? ' ' + swap : '') },
      h(
        'div',
        { className: 'pbx-hudHead', onPointerDown: onDragStart },
        h('span', { className: 'pbx-hudGrip', 'aria-hidden': 'true' }),
        h('span', { className: 'pbx-hudHeadTitle' }, t('hud.title')),
        h('span', { className: 'pbx-hudCount' }, String(rows.length)),
        h(
          'button',
          {
            type: 'button',
            className: 'pbx-hudCollapse',
            title: t('hud.collapse'),
            'aria-label': t('hud.collapse'),
            onClick: () => {
              logEvent('debug', 'hud', 'collapse', { dir: collapseDir });
              setCollapsed(true);
              try {
                window.localStorage.setItem(HUD_COLLAPSE_KEY, '1');
              } catch (error) {
                /* ignore */
              }
            }
          },
          h(Icon, { name: collapseDir, size: 14 })
        )
      ),
      h(
        'div',
        {
          className: 'pbx-hudList' + (listOverflow ? ' scrollable' : ''),
          style: Object.assign({ maxHeight: hudListMaxHeight + 'px' }, listHeight > 0 ? { height: listHeight + 'px' } : {})
        },
        h(
          'div',
          { ref: listContentRef, className: 'pbx-hudListInner' },
          rows.map((row) =>
            h(
              'div',
              {
                key: row.id,
                role: 'button',
                tabIndex: 0,
                'data-hud-id': row.id,
                className:
                  'pbx-hudRow' +
                  (row.auto ? ' auto' : '') +
                  (row.tone === 'running' ? ' live' : '') +
                  (row.current ? ' current' : '') +
                  (row.spotlight ? ' spotlight' : ''),
                title: t('card.open'),
                onClick: () => {
                  if (typeof openSession === 'function') openSession(row.id);
                },
                onKeyDown: (event: KeyboardEvent) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  if (typeof openSession === 'function') openSession(row.id);
                }
              },
              row.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.tone }),
              row.auto ? h('span', { className: 'pbx-hudAuto', title: t('kind.auto') }, h(Icon, { name: 'clock', size: 11 })) : null,
              h(
                'span',
                { className: 'pbx-hudRowMain' },
                h('span', { className: 'pbx-hudRowTitle' }, row.title),
                h(
                  'span',
                  { className: 'pbx-hudRowMeta' },
                  t(row.labelKey) +
                    (row.auto ? ' · ' + t('hud.auto') : '') +
                    (row.project ? ' · ' + row.project : '') +
                    (row.current ? ' · ' + t('card.current') : row.recent ? ' · ' + t('hud.recent') : '')
                )
              ),
              h('span', { className: 'pbx-hudTimer' }, row.timed ? fmtElapsed(now - row.start) : relTime(row.updatedAt, t)),
              h(
                'span',
                {
                  className: 'pbx-hudArchive',
                  role: 'button',
                  tabIndex: -1,
                  title: t('hud.archive'),
                  'aria-label': t('hud.archive'),
                  onClick: (event: Event) => {
                    event.stopPropagation();
                    void archiveRow(row);
                  },
                  onKeyDown: (event: KeyboardEvent) => {
                    event.stopPropagation();
                  }
                },
                h(Icon, { name: 'archive', size: 16 })
              )
            )
          )
        )
      ),
      !hintsHidden && config.hints && config.hints.shortcuts !== false
        ? h(
            'div',
            { className: 'pbx-hudFoot' },
            h(
              'div',
              { className: 'pbx-hudFootRow' },
              h('span', { className: 'pbx-hudFootTitle' }, t('hud.groupSession')),
              h(
                'span',
                { className: 'pbx-hudFootItem' },
                h('kbd', { className: 'pbx-hudKey' }, comboDisplay(config.shortcuts.prev)),
                h('span', { className: 'pbx-hudFootLabel' }, t('hud.prev'))
              ),
              h(
                'span',
                { className: 'pbx-hudFootItem' },
                h('kbd', { className: 'pbx-hudKey' }, comboDisplay(config.shortcuts.next)),
                h('span', { className: 'pbx-hudFootLabel' }, t('hud.next'))
              )
            ),
            h(
              'div',
              { className: 'pbx-hudFootRow' },
              h('span', { className: 'pbx-hudFootTitle' }, t('hud.groupMessage')),
              h(
                'span',
                { className: 'pbx-hudFootItem' },
                h('kbd', { className: 'pbx-hudKey' }, comboDisplay(config.shortcuts.userPrev)),
                h('span', { className: 'pbx-hudFootLabel' }, t('hud.prevInstruction'))
              ),
              h(
                'span',
                { className: 'pbx-hudFootItem' },
                h('kbd', { className: 'pbx-hudKey' }, comboDisplay(config.shortcuts.userNext)),
                h('span', { className: 'pbx-hudFootLabel' }, t('hud.nextInstruction'))
              ),
              h(
                'span',
                { className: 'pbx-hudFootItem' },
                h('kbd', { className: 'pbx-hudKey' }, comboDisplay(config.shortcuts.scrollBottom)),
                h('span', { className: 'pbx-hudFootLabel' }, t('hud.toBottom'))
              )
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'pbx-hudFootClose',
                title: t('hints.dismiss'),
                'aria-label': t('hints.dismiss'),
                onClick: (event: Event) => {
                  event.stopPropagation();
                  logEvent('debug', 'hud', 'hints hidden');
                  setHintsHidden(true);
                }
              },
              '×'
            )
          )
        : null
    )
  );
}
