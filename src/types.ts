/** Shared domain types for the dsh-tac client bundle. */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LogEntry {
  at: number;
  level: LogLevel;
  scope: string;
  message: string;
  data?: unknown;
}

export interface LogConfig {
  enabled: boolean;
  level: LogLevel;
  max: number;
}

export type ShortcutAction =
  | 'palette'
  | 'prev'
  | 'next'
  | 'userPrev'
  | 'userNext'
  | 'scrollBottom'
  | 'sidebarBoard'
  | 'leftSidebar'
  | 'panelHalf'
  | 'panelFull'
  | 'rename'
  | 'interject'
  | 'hud'
  | 'sessionMenu';

export type ShortcutMap = Record<ShortcutAction, string>;

export interface HeaderButtonSetting {
  hidden: boolean;
  side: string;
  order: number;
}

export interface PaletteSettings {
  enabled: boolean;
  blur: number;
  includeArchived: boolean;
}

export interface HintsSettings {
  shortcuts: boolean;
}

/** Behaviour around the host conversation view (not the plugin's own panels). */
export interface ChatSettings {
  /** Drive the host's "load earlier" control when the reader scrolls to the top. */
  autoHistory: boolean;
}

export interface HudSettings {
  enabled: boolean;
  includeDone: boolean;
  defaultCollapsed: boolean;
  defaultPosition: string;
  recentEnabled: boolean;
  recentCount: number;
  recentExcludeAuto: boolean;
  maxSessions: number;
}

export interface NotifySettings {
  enabled: boolean;
  sound: boolean;
}

/** What the session table groups its rows by. `none` keeps the flat table. */
export type BoardGroupBy = 'none' | 'project' | 'status' | 'kind' | 'preset' | 'updated' | 'current';

export interface BoardSettings {
  enabled: boolean;
  wideThreshold: number;
  defaultView: string;
  /** Persisted so the grouping the reader picked survives a pane remount. */
  groupBy: BoardGroupBy;
}

export interface ProjectColumnsSettings {
  total: boolean;
  issues: boolean;
  prs: boolean;
  localVersion: boolean;
  latestVersion: boolean;
  lastUpdated: boolean;
}

/** GitHub repository metadata for one project. Keyed by the workspace path in `Settings.githubRepos`. */
export interface GithubRepoSetting {
  /** GitHub owner, e.g. `cgartlab`. */
  owner: string;
  /** Repository name, e.g. `dsh-tac`. */
  repo: string;
  /** Local package version the user knows the checkout is on; optional. */
  localVersion?: string;
}

export interface Settings {
  shortcuts: ShortcutMap;
  palette: PaletteSettings;
  header: { capsule: boolean; placement: string };
  hints: HintsSettings;
  hintsVersion: number;
  shortcutsVersion: number;
  headerButtonsVersion: number;
  /** Migration marker for the project-first board view. */
  boardProjVersion?: number;
  /** Migration marker for the project-column visibility set (column keys changed over time). */
  projectColumnsVersion?: number;
  /** Migration marker for the GitHub data source settings. */
  githubVersion?: number;
  headerButtons: Record<string, HeaderButtonSetting>;
  hud: HudSettings;
  notify: NotifySettings;
  log: LogConfig;
  board: BoardSettings;
  chat: ChatSettings;
  projectColumns: ProjectColumnsSettings;
  /** GitHub Personal Access Token (stored locally, never sent anywhere but api.github.com). */
  githubToken?: string;
  /** Per-workspace GitHub repository mapping, keyed by workspace path. */
  githubRepos?: Record<string, GithubRepoSetting>;
}

/** Minimal observable store used for the plugin's own UI state. */
export interface UiStore<T extends object> {
  getSnapshot(): T;
  subscribe(listener: () => void): () => void;
  set(patch: Partial<T>): void;
  toggle(key: keyof T & string): void;
}
