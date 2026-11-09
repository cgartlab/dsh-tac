/** Plugin identity, storage keys and the default settings every lookup falls back to. */
import type { Settings, ShortcutAction } from './types';

export const MODULE_ID = 'dsh-tac';
export const NS = 'projectBoard';
export const STORE_KEY = 'dsh.project-board.appearance.v1';
export const BOARD_ID = 'dsh-tac/tab';
export const BOARD_KIND = 'projectBoard';
export const SETTINGS_KEY = 'dsh.project-board.settings.v1';
export const LOG_KEY = 'pbx.logs.v1';

export const HUD_POS_KEY = 'pbx.hud.pos';
export const HUD_STARTS_KEY = 'pbx.hud.starts';
export const HUD_COLLAPSE_KEY = 'pbx.hud.collapsed';
/** Width the board pane was last left at; also cleared by "restore defaults". */
export const BOARD_WIDTH_KEY = 'pbx.board.width';

export const SHORTCUT_LABEL_KEYS: Record<ShortcutAction, string> = {
  palette: 'settings.shortcut.palette',
  prev: 'settings.shortcut.prev',
  next: 'settings.shortcut.next',
  userPrev: 'settings.shortcut.userPrev',
  userNext: 'settings.shortcut.userNext',
  scrollBottom: 'settings.shortcut.scrollBottom',
  sidebarBoard: 'settings.shortcut.sidebarBoard',
  leftSidebar: 'settings.shortcut.leftSidebar',
  panelHalf: 'settings.shortcut.panelHalf',
  panelFull: 'settings.shortcut.panelFull',
  rename: 'settings.shortcut.rename',
  interject: 'settings.shortcut.interject',
  hud: 'settings.shortcut.hud',
  sessionMenu: 'settings.shortcut.sessionMenu'
};

export const DEFAULT_SETTINGS: Settings = {
  shortcuts: {
    palette: 'alt+KeyK',
    prev: 'alt+KeyI',
    next: 'alt+Comma',
    userPrev: 'alt+KeyU',
    userNext: 'alt+KeyM',
    scrollBottom: 'alt+KeyS',
    sidebarBoard: 'alt+KeyN',
    leftSidebar: 'alt+KeyW',
    panelHalf: 'alt+KeyB',
    panelFull: 'alt+KeyV',
    rename: 'alt+KeyR',
    interject: 'alt+Enter',
    hud: 'alt+KeyE',
    sessionMenu: 'alt+KeyD'
  },
  palette: { enabled: true, blur: 15, includeArchived: true },
  header: { capsule: true, placement: 'header' },
  hints: { shortcuts: true },
  hintsVersion: 1,
  shortcutsVersion: 1,
  headerButtonsVersion: 3,
  headerButtons: {
    switch: { hidden: false, side: 'left', order: 10 },
    historyNav: { hidden: false, side: 'left', order: 20 },
    capsule: { hidden: false, side: 'left', order: 50 }
  },
  hud: {
    enabled: true,
    includeDone: true,
    defaultCollapsed: false,
    defaultPosition: 'top-right',
    recentEnabled: true,
    recentCount: 5,
    recentExcludeAuto: true,
    maxSessions: 6
  },
  notify: { enabled: true, sound: true },
  log: { enabled: true, level: 'info', max: 200 },
  board: { enabled: true, wideThreshold: 520, defaultView: 'projects' },
  chat: { autoHistory: true },
  projectColumnsVersion: 1,
  projectColumns: { total: true, issues: true, prs: true, localVersion: true, latestVersion: true, lastUpdated: true },
  githubVersion: 1,
  githubToken: undefined,
  githubRepos: {}
};
