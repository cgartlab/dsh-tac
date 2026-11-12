/**
 * The project/session board: a database view of the current workspace's sessions and a
 * project view with per-project attribute columns. Rendered both in the right sidebar pane
 * (narrow/full) and as a standalone main panel.
 */
import { DEFAULT_SETTINGS } from '../constants';
import type { Translate, UseHook } from '../host';
import { h, useEffect, useMemo, useRef, useState } from '../runtime';
import type { Settings, UiStore } from '../types';
import type { AppearanceMap } from '../ui/appearance';
import { ICONS, PALETTE, hexToRgba, loadAppearance, paletteFor, saveAppearance } from '../ui/appearance';
import { Icon, RunRing } from '../ui/icons';
import { MODIFIER_LABELS } from '../core/combos';
import type { SessionListSnapshot, SessionStatusMap, SessionSummary, WorkspaceSnapshot, WorkspaceView } from '../core/snapshot';
import { fallbackHook, type PresetSnapshot, type ScheduleSnapshot } from '../core/schedule';
import { PROJECT_COLUMNS, SORT_DIR_DEFAULT, compareVersions, parseVersion, relTime, sessionTitleOf, statusInfo, workspaceLabel, type ProjectColumn, type SessionStatusLike, type StatusInfo } from './format';
import { mergeSettings } from '../core/settings';
import type { BoardGroupBy } from '../types';
import { fetchRepoStats, type RepoStats } from '../core/github';
import type { GithubRepoSetting } from '../types';

export interface ProjectBoardProps {
  useWorkspaces: UseHook<WorkspaceSnapshot>;
  useSessions: UseHook<SessionListSnapshot>;
  useSessionStatus: UseHook<SessionStatusMap>;
  useSettings?: UseHook<Settings>;
  useScheduleCatalog?: UseHook<ScheduleSnapshot | null>;
  usePresets?: UseHook<PresetSnapshot | null>;
  openSession?: (id: string) => void;
  openFullBoard?: () => void;
  /** Close the standalone main-panel instance and return to the conversation.
   *  Only supplied for the `main` slot registration (where the board occupies the
   *  whole content area and the user would otherwise be stuck with no way back). */
  closePanel?: () => void;
  t: Translate;
  compact?: boolean;
  /** External request to switch the board to a view (e.g. opening it via a shortcut
   *  should land on "projects"). The board subscribes to this store; when `seq` changes
   *  it switches the view — reliable even when the component stays mounted, because a
   *  store `set()` produces a new snapshot that triggers the subscription. */
  viewRequestStore?: UiStore<{ seq: number; view: 'projects' | 'sessions' }>;
  /** Persist a settings patch; the grouping select writes through so a pane remount keeps it. */
  saveSettings?: (next: Settings) => void;
}

interface SortEntry {
  key: string;
  dir: 'asc' | 'desc';
}

/** One grouping bucket: identity, header label, sort order and (for project groups) the workspace. */
interface GroupInfo {
  id: string;
  label: string;
  order: number;
  workspaceId?: string;
}

interface SessionRow {
  id: string;
  title: string;
  workspaceId: string;
  workspaceLabel: string;
  workspacePath: string;
  info: StatusInfo;
  updatedAt: number;
  running: boolean;
  current: boolean;
  preset: string;
  auto: boolean;
}

interface ProjectModel {
  workspaceId: string;
  name: string;
  path: string;
  counts: Record<string, number>;
  presets: Set<string>;
  hasCurrent: boolean;
  lastUpdated: number;
  /** Open issue count; `undefined` means no source yet (renders `—`). */
  issues?: number;
  /** Open pull-request count; `undefined` means no source yet (renders `—`). */
  prs?: number;
  /** Local package version; `undefined` when unknown (renders `—`). */
  localVersion?: string;
  /** Latest published version; `undefined` when unknown (renders `—`). */
  latestVersion?: string;
  /** GitHub mapping configured for this workspace (owner/repo/localVersion). */
  repo?: GithubRepoSetting;
  /** Live GitHub stats; `undefined` when no repo is configured or it has not been fetched. */
  repoStats?: RepoStats;
}

const BUILTIN_PRESET_COPY: Record<string, string> = {
  standard: 'preset.standard',
  ptc: 'preset.ptc',
  minimal: 'preset.minimal',
  cordis: 'preset.cordis'
};

/** Numeric sort key for a dotted version string, so `1.10` sorts after `1.9` (a plain
 *  string comparison would not). Segments are padded to a fixed count so different-length
 *  versions compare numerically (missing segments count as 0, matching compareVersions).
 *  Unknown/`—` maps to -1 and sinks to the bottom. Pre-release suffixes are ignored. */
function versionSortKey(value: string | undefined): number {
  const parts = parseVersion(value);
  if (!parts) return -1;
  let key = 0;
  for (let i = 0; i < 6; i += 1) key = key * 1000 + (parts[i] || 0);
  return key;
}

const NO_AUTO = new Set<string>();
const EMPTY_REPOS: Record<string, GithubRepoSetting> = {};

interface PopoverPosition {
  left: number;
  top: number;
}

interface CompactRow {
  id: string;
  title: string;
  info: StatusInfo;
  archived: boolean;
  auto: boolean;
  updatedAt: number;
}

export function ProjectBoard(props: ProjectBoardProps): unknown {
  const { useWorkspaces, useSessions, useSessionStatus, openSession, t } = props;
  const useScheduleCatalog = typeof props.useScheduleCatalog === 'function' ? props.useScheduleCatalog : fallbackHook<ScheduleSnapshot | null>();
  const usePresets = typeof props.usePresets === 'function' ? props.usePresets : fallbackHook<PresetSnapshot | null>();
  const useSettings = typeof props.useSettings === 'function' ? props.useSettings : fallbackHook<Settings>();
  const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
  const wsSnap = useWorkspaces((snapshot) => snapshot);
  const list = useSessions((snapshot) => snapshot);
  const statuses = useSessionStatus((snapshot) => snapshot);
  const scheduleSnap = useScheduleCatalog((snapshot) => snapshot);
  const presetSnap = usePresets((snapshot) => snapshot);
  const presetNames: Record<string, string> = (presetSnap && presetSnap.names) || {};
  const presetText = (preset: string | undefined): string => {
    if (!preset) return t('preset.none');
    if (presetNames[preset]) return presetNames[preset];
    return BUILTIN_PRESET_COPY[preset] ? t(BUILTIN_PRESET_COPY[preset]) : preset;
  };
  const autoSet = (scheduleSnap && scheduleSnap.activeSessionIds) || NO_AUTO;
  const compact = props.compact === true;
  const openFullBoard = props.openFullBoard;

  const [appearance, setAppearance] = useState<AppearanceMap>(() => loadAppearance());
  useEffect(() => {
    const handler = (): void => setAppearance(loadAppearance());
    window.addEventListener('pbx-appearance-reset', handler);
    return () => window.removeEventListener('pbx-appearance-reset', handler);
  }, []);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [expandedProject, setExpandedProject] = useState<string | null>(null);
  const popRef = useRef<HTMLElement | null>(null);
  const [view, setView] = useState<'projects' | 'sessions'>(() => {
    /* A session switch can unmount and remount the pane while the guard restores it. Seed
       from the shared store so the tab the user picked survives that remount instead of
       snapping back to the configured default. */
    const store = props.viewRequestStore;
    if (store) {
      const snap = store.getSnapshot();
      if (snap.view === 'sessions' || snap.view === 'projects') return snap.view;
    }
    return config.board.defaultView === 'projects' ? 'projects' : 'sessions';
  });
  /* Every view change writes through to the store, so a remount (and the other board
     instance, e.g. the main panel) sees the tab the user actually chose. */
  const applyView = (next: 'projects' | 'sessions'): void => {
    setView(next);
    const store = props.viewRequestStore;
    if (store && store.getSnapshot().view !== next) {
      store.set({ seq: store.getSnapshot().seq + 1, view: next });
    }
  };
  // Subscribe to an external view-request store. When the board is opened via a
  // shortcut, requestBoardView() calls store.set() which produces a new snapshot and
  // fires the subscriber — reliably re-rendering even though the component stays mounted.
  const [viewReqSeq, setViewReqSeq] = useState(0);
  useEffect(() => {
    const store = props.viewRequestStore;
    if (!store) return undefined;
    setViewReqSeq(store.getSnapshot().seq);
    return store.subscribe(() => setViewReqSeq(store.getSnapshot().seq));
  }, [props.viewRequestStore]);
  useEffect(() => {
    // seq === 0 is the untouched initial value: do not override the configured default
    // view on mount. Only an actual open request (seq >= 1) forces the project view.
    if (viewReqSeq > 0 && props.viewRequestStore) {
      setView(props.viewRequestStore.getSnapshot().view);
    }
  }, [viewReqSeq]);
  const [sessionSorts, setSessionSorts] = useState<SortEntry[]>([{ key: 'updatedAt', dir: 'desc' }]);
  const [projectSorts, setProjectSorts] = useState<SortEntry[]>([{ key: 'lastUpdated', dir: 'desc' }]);
  const sorts = view === 'sessions' ? sessionSorts : projectSorts;
  const [statusFilter, setStatusFilter] = useState('all');
  const [kindFilter, setKindFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [query, setQuery] = useState('');
  /* Grouping is a persisted preference: the toolbar select writes through to the settings
     store so a session switch (which rebuilds the right pane) keeps the reader's choice. */
  const groupBy = (config.board && config.board.groupBy ? config.board.groupBy : 'none') as BoardGroupBy;
  const setGroupBy = (next: BoardGroupBy): void => {
    const save = props.saveSettings;
    if (typeof save !== 'function') return;
    save(mergeSettings(config, { board: Object.assign({}, config.board, { groupBy: next }) }));
  };
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [compactProjectId, setCompactProjectId] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<PopoverPosition | null>(null);

  const githubRepos = (config.githubRepos || EMPTY_REPOS) as Record<string, GithubRepoSetting>;
  // Stable fingerprint of the owner/repo mappings. `githubRepos` itself is a fresh object
  // reference on every settings save (mergeSettings clones it), so depending on it directly
  // would re-fetch every configured repo on ANY settings change. Only owner/repo affect the
  // fetch (localVersion does not), so they are the fingerprint's content.
  const repoFingerprint = Object.keys(githubRepos)
    .map((path) => `${path}\u0000${githubRepos[path] ? githubRepos[path].owner || '' : ''}\u0000${githubRepos[path] ? githubRepos[path].repo || '' : ''}`)
    .sort()
    .join('\n');
  const [repoStats, setRepoStats] = useState<Record<string, RepoStats>>({});
  /* Rendering every session row at once is fine for the usual few dozen, but a profile with
     hundreds of sessions pays for all of them on every keystroke in the search box. Render in
     batches above this size and let the reader ask for more. */
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
      return undefined;
    }
    const loading: Record<string, RepoStats> = {};
    for (const path of targets) loading[path] = { status: 'loading' };
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
    if (editingProject === null) return undefined;
    const onDown = (event: Event): void => {
      if (popRef.current && !popRef.current.contains(event.target as Node)) setEditingProject(null);
    };
    const onScroll = (): void => setEditingProject(null);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [editingProject]);

  const updateAppearance = (id: string, patch: { color?: string; icon?: string }): void => {
    setAppearance((prev) => {
      const next = Object.assign({}, prev);
      next[id] = Object.assign({}, prev[id] || {}, patch);
      saveAppearance(next);
      return next;
    });
  };
  const resetAppearance = (id: string): void => {
    setAppearance((prev) => {
      const next = Object.assign({}, prev);
      delete next[id];
      saveAppearance(next);
      return next;
    });
  };
  const specOf = (workspaceId: string): { color: string; icon: string } => {
    const spec = appearance[workspaceId] || {};
    return { color: spec.color || paletteFor(workspaceId), icon: spec.icon || 'folder' };
  };

  const workspaces = (wsSnap && wsSnap.items) || [];
  const archived = useMemo(() => new Set((wsSnap && wsSnap.archivedSessionIds) || []), [wsSnap]);
  const byId = (list && list.byId) || {};
  const ids = (list && list.ids) || [];
  const ready = Boolean(list && list.phase === 'ready');

  const currentId = useMemo(() => {
    for (const id of ids) {
      const row = byId[id];
      if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return id;
    }
    return undefined;
  }, [ids, byId]);

  const allSessions = useMemo(() => {
    const out: SessionRow[] = [];
    for (const workspace of workspaces) {
      for (const sessionId of workspace.sessionIds || []) {
        const summary = byId[sessionId];
        if (!summary || summary.origin === 'subagent' || summary.blank) continue;
        if (archived.has(sessionId)) continue;
        const status = statuses ? statuses.get(sessionId) : undefined;
        const info = statusInfo(status, summary);
        out.push({
          id: sessionId,
          title: sessionTitleOf(summary, t),
          workspaceId: workspace.workspaceId,
          workspaceLabel: workspaceLabel(workspace.title, t),
          workspacePath: workspace.path || '',
          info: info,
          updatedAt: summary.updatedAt || 0,
          running: info.tone === 'running',
          current: sessionId === currentId,
          preset:
            summary.projectionValues && typeof summary.projectionValues.agentPreset === 'string'
              ? summary.projectionValues.agentPreset
              : '',
          auto: autoSet.has(sessionId)
        });
      }
    }
    return out;
  }, [workspaces, byId, archived, statuses, currentId, t, autoSet]);

  const projectModels = useMemo(() => {
    return workspaces.map((workspace) => {
      const rows = allSessions.filter((s) => s.workspaceId === workspace.workspaceId);
      const counts: Record<string, number> = { total: rows.length, running: 0, attention: 0, done: 0, idle: 0, auto: 0 };
      const presets = new Set<string>();
      let last = 0;
      let hasCurrent = false;
      for (const row of rows) {
        if (counts[row.info.tone] !== undefined) counts[row.info.tone] += 1;
        if (row.auto) counts.auto += 1;
        if (row.preset) presets.add(row.preset);
        if (row.current) hasCurrent = true;
        last = Math.max(last, row.updatedAt);
      }
      if (!last) last = Date.parse(workspace.updatedAt || '') || 0;
      // Repo-meta fields: the user-configured GitHub mapping (settings.githubRepos, keyed by
      // workspace path) wins; if none is configured we fall back to the workspace-snapshot
      // seam so a future host that adds these fields lights up without a plugin change.
      const pathKey = workspace.path || '';
      const repoSetting = githubRepos[pathKey];
      const stats = repoSetting ? repoStats[pathKey] : undefined;
      const seam = workspace as unknown as {
        openIssues?: number;
        openPRs?: number;
        localVersion?: string;
        latestVersion?: string;
      };
      const issues = stats?.status === 'ok' ? stats.issues : typeof seam.openIssues === 'number' ? seam.openIssues : undefined;
      const prs = stats?.status === 'ok' ? stats.prs : typeof seam.openPRs === 'number' ? seam.openPRs : undefined;
      const latestVersion = stats?.status === 'ok' ? stats.latestVersion : seam.latestVersion;
      const localVersion = repoSetting?.localVersion || seam.localVersion;
      const model: ProjectModel = {
        workspaceId: workspace.workspaceId,
        name: workspaceLabel(workspace.title, t),
        path: workspace.path || '',
        counts: counts,
        presets: presets,
        hasCurrent: hasCurrent,
        lastUpdated: last,
        issues: issues,
        prs: prs,
        localVersion: localVersion,
        latestVersion: latestVersion,
        repo: repoSetting,
        repoStats: stats
      };
      return model;
    });
  }, [workspaces, allSessions, t, githubRepos, repoStats]);

  const compactStatusRank = (row: CompactRow): number =>
    row.archived ? 9 : row.info.tone === 'running' ? 0 : row.info.tone === 'attention' ? 1 : row.info.tone === 'done' ? 2 : 3;
  const compactSessionsOf = (workspaceId: string): CompactRow[] => {
    const workspace = workspaces.find((item) => item.workspaceId === workspaceId);
    if (!workspace) return [];
    const rows: CompactRow[] = [];
    for (const sessionId of workspace.sessionIds || []) {
      const summary = byId[sessionId];
      if (!summary || summary.origin === 'subagent' || summary.blank) continue;
      const isArchived = archived.has(sessionId);
      const info: StatusInfo = isArchived
        ? { tone: 'idle', labelKey: 'status.archived', rank: 9 }
        : statusInfo(statuses ? statuses.get(sessionId) : undefined, summary);
      rows.push({
        id: sessionId,
        title: sessionTitleOf(summary, t),
        info: info,
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
      if (s.info.tone === 'running') acc.running += 1;
      if (s.info.tone === 'attention') acc.attention += 1;
    }
    return acc;
  }, [workspaces, allSessions]);

  const open = (id: string): void => {
    if (typeof openSession === 'function') openSession(id);
  };

  const sortBy = (key: string, additive: boolean): void => {
    const setter = view === 'sessions' ? setSessionSorts : setProjectSorts;
    setter((previous) => {
      const existing = previous.findIndex((entry) => entry.key === key);
      if (!additive) {
        if (previous.length === 1 && previous[0].key === key) {
          return [{ key: key, dir: previous[0].dir === 'asc' ? 'desc' : 'asc' }];
        }
        return [{ key: key, dir: SORT_DIR_DEFAULT[key] || 'asc' }];
      }
      if (existing >= 0) {
        const next = previous.slice();
        next[existing] = { key: key, dir: previous[existing].dir === 'asc' ? 'desc' : 'asc' };
        return next;
      }
      if (previous.length >= 4) return previous;
      return previous.concat([{ key: key, dir: SORT_DIR_DEFAULT[key] || 'asc' }]);
    });
  };
  const sessionSortValue = (row: SessionRow, key: string): string | number => {
    if (key === 'title') return row.title.toLowerCase();
    if (key === 'project') return row.workspaceLabel.toLowerCase();
    if (key === 'status') return row.info.rank;
    if (key === 'kind') return row.auto ? 0 : 1;
    if (key === 'preset') return presetText(row.preset).toLowerCase();
    if (key === 'updatedAt') return row.updatedAt;
    return 0;
  };
  const projectSortValue = (project: ProjectModel, key: string): string | number => {
    if (key === 'name') return project.name.toLowerCase();
    if (key === 'lastUpdated') return project.lastUpdated;
    if (key === 'issues') return project.issues ?? -1;
    if (key === 'prs') return project.prs ?? -1;
    if (key === 'localVersion') return versionSortKey(project.localVersion);
    if (key === 'latestVersion') return versionSortKey(project.latestVersion);
    if (key === 'presets') return project.presets ? project.presets.size : 0;
    return project.counts[key] !== undefined ? project.counts[key] : 0;
  };
  const compareBySorts =
    <T,>(sortList: SortEntry[], valueOf: (row: T, key: string) => string | number) =>
    (a: T, b: T): number => {
      for (const entry of sortList) {
        const va = valueOf(a, entry.key);
        const vb = valueOf(b, entry.key);
        const dir = entry.dir === 'asc' ? 1 : -1;
        if (va < vb) return -dir;
        if (va > vb) return dir;
      }
      return 0;
    };

  const filteredSessions = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = allSessions.filter((s) => {
      if (statusFilter !== 'all' && s.info.tone !== statusFilter) return false;
      if (kindFilter === 'auto' && !s.auto) return false;
      if (kindFilter === 'normal' && s.auto) return false;
      if (projectFilter !== 'all' && s.workspaceId !== projectFilter) return false;
      if (q && !(s.title.toLowerCase().includes(q) || s.workspaceLabel.toLowerCase().includes(q))) return false;
      return true;
    });
    rows = rows.slice().sort(compareBySorts(sessionSorts, sessionSortValue));
    return rows;
  }, [allSessions, statusFilter, kindFilter, projectFilter, query, sessionSorts, presetNames, t]);

  /* A new filter or search starts from the first batch again, otherwise a previous "show more"
     would keep a narrow result fully expanded and defeat the point. */
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

  const renderPopover = (workspaceId: string, color: string, icon: string): unknown => {
    const spec = appearance[workspaceId] || {};
    const popStyle = popoverPos ? { left: popoverPos.left + 'px', top: popoverPos.top + 'px' } : undefined;
    return h(
      'div',
      { className: 'pbx-pop', ref: popRef, style: popStyle, onClick: (event: Event) => event.stopPropagation() },
      h('div', { className: 'pbx-popLabel' }, t('appearance.color')),
      h(
        'div',
        { className: 'pbx-swatches' },
        PALETTE.map((value) =>
          h('button', {
            key: value,
            type: 'button',
            className: 'pbx-swatchBtn' + ((spec.color || color) === value ? ' sel' : ''),
            style: { background: value },
            'aria-label': value,
            onClick: (event: Event) => {
              event.stopPropagation();
              updateAppearance(workspaceId, { color: value });
            }
          })
        )
      ),
      h('div', { className: 'pbx-popLabel' }, t('appearance.icon')),
      h(
        'div',
        { className: 'pbx-icons' },
        ICONS.map((name) =>
          h(
            'button',
            {
              key: name,
              type: 'button',
              className: 'pbx-iconBtn' + ((spec.icon || icon) === name ? ' sel' : ''),
              'aria-label': name,
              onClick: (event: Event) => {
                event.stopPropagation();
                updateAppearance(workspaceId, { icon: name });
              }
            },
            h(Icon, { name: name, size: 16 })
          )
        )
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'pbx-reset',
          onClick: (event: Event) => {
            event.stopPropagation();
            resetAppearance(workspaceId);
          }
        },
        t('appearance.reset')
      )
    );
  };

  const projectChip = (workspaceId: string, label: string, size?: 'lg'): unknown => {
    const spec = specOf(workspaceId);
    return h(
      'span',
      { className: 'pbx-chip' },
      h(
        'span',
        { className: 'pbx-chipIcon' + (size === 'lg' ? ' lg' : ''), style: { color: spec.color, background: hexToRgba(spec.color, 0.16) } },
        h(Icon, { name: spec.icon, size: size === 'lg' ? 15 : 12 })
      ),
      h('span', { className: 'pbx-chipName' }, label)
    );
  };

  const statusPill = (info: StatusInfo): unknown =>
    h(
      'span',
      { className: 'pbx-statusPill', 'data-tone': info.tone },
      info.tone === 'running' ? h(RunRing, { size: 8 }) : h('span', { className: 'pbx-kdot', 'data-tone': info.tone }),
      t(info.labelKey)
    );

  const th = (key: string, label: string, type: string, options?: { num?: boolean; sortable?: boolean; hint?: string }): unknown => {
    const opts = options || {};
    const position = sorts.findIndex((entry) => entry.key === key);
    const active = position >= 0;
    const direction = active ? sorts[position].dir : null;
    const title = opts.sortable === false ? opts.hint : opts.hint ? opts.hint + ' · ' + t('sort.hint', MODIFIER_LABELS) : t('sort.hint', MODIFIER_LABELS);
    return h(
      'th',
      {
        className: 'pbx-th' + (opts.sortable === false ? '' : ' sortable') + (active ? ' active' : '') + (opts.num ? ' num' : ''),
        title: title,
        'aria-sort': opts.sortable === false ? undefined : active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none',
        tabIndex: opts.sortable === false ? undefined : 0,
        onClick: opts.sortable === false ? undefined : (event: MouseEvent) => sortBy(key, Boolean(event.shiftKey)),
        onKeyDown:
          opts.sortable === false
            ? undefined
            : (event: KeyboardEvent) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                sortBy(key, Boolean(event.shiftKey));
              }
      },
      h('span', { className: 'pbx-thType', 'aria-hidden': 'true' }, type || ''),
      h('span', { className: 'pbx-thLabel' }, label),
      active ? h('span', { className: 'pbx-sortMark', 'aria-hidden': 'true' }, direction === 'asc' ? '↑' : '↓') : null
    );
  };

  const renderSessionRow = (row: SessionRow): unknown =>
    h(
      'tr',
      {
        key: row.id,
        className: 'pbx-tr' + (row.running ? ' pbx-tr-live' : '') + (row.current ? ' pbx-tr-current' : '') + (row.auto ? ' pbx-tr-auto' : ''),
        onClick: () => open(row.id),
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(row.id);
          }
        }
      },
      h('td', null, projectChip(row.workspaceId, row.workspaceLabel)),
      h(
        'td',
        null,
        h(
          'div',
          { className: 'pbx-titleCell' },
          row.auto ? h('span', { className: 'pbx-autoGlyph', title: t('kind.auto') }, h(Icon, { name: 'clock', size: 13 })) : null,
          row.info.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.info.tone }),
          h('span', { className: 'pbx-titleText' }, row.title),
          row.current ? h('span', { className: 'pbx-curTag' }, t('card.current')) : null
        )
      ),
      h('td', null, statusPill(row.info)),
      h(
        'td',
        null,
        row.auto
          ? h('span', { className: 'pbx-kindTag auto' }, h(Icon, { name: 'clock', size: 12 }), t('kind.auto'))
          : h('span', { className: 'pbx-kindTag' }, t('kind.normal'))
      ),
      h('td', null, row.preset ? h('span', { className: 'pbx-modeTag' }, presetText(row.preset)) : h('span', { className: 'pbx-modeTag empty' }, t('preset.none'))),
      h('td', { className: 'pbx-num' }, relTime(row.updatedAt, t)),
      h(
        'td',
        { className: 'pbx-center' },
        h(
          'button',
          {
            type: 'button',
            className: 'pbx-openBtn',
            title: t('open'),
            'aria-label': t('open'),
            onClick: (e: Event) => {
              e.stopPropagation();
              open(row.id);
            }
          },
          h(Icon, { name: 'arrow', size: 14 })
        )
      )
    );

  const renderGroupHeader = (groupId: string, label: string, count: number, workspaceId?: string): unknown => {
    const isCollapsed = collapsed[groupId] === true;
    return h(
      'tr',
      { key: 'g-' + groupId, className: 'pbx-groupRow' },
      h(
        'td',
        { colSpan: 7, onClick: () => setCollapsed((prev) => Object.assign({}, prev, { [groupId]: !isCollapsed })) },
        h('span', { className: 'pbx-groupChevron' + (isCollapsed ? '' : ' open') }, h(Icon, { name: 'chevron', size: 13 })),
        workspaceId ? projectChip(workspaceId, label, 'lg') : h('span', { className: 'pbx-groupLabel' }, label),
        h('span', { className: 'pbx-groupCount' }, t(count === 1 ? 'count.row' : 'count.rows', { n: count }))
      )
    );
  };

  /* One row per distinct value of the chosen attribute. `order` decides the group order and
     `label` is what the header shows; project groups keep their workspace id as the group id so
     the existing collapse memory keeps working. */
  const projectOrder = new Map(projectModels.map((project, index) => [project.workspaceId, index]));
  const timeGroup = (updatedAt: number): GroupInfo => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const mondayOffset = (now.getDay() + 6) % 7;
    const startOfWeek = startOfToday - mondayOffset * 86400000;
    const at = Number(updatedAt) || 0;
    if (at >= startOfToday) return { id: 'updated:today', label: t('group.today'), order: 0 };
    if (at >= startOfYesterday) return { id: 'updated:yesterday', label: t('group.yesterday'), order: 1 };
    if (at >= startOfWeek) return { id: 'updated:thisWeek', label: t('group.thisWeek'), order: 2 };
    return { id: 'updated:earlier', label: t('group.earlier'), order: 3 };
  };
  const groupOf = (session: SessionRow): GroupInfo => {
    switch (groupBy) {
      case 'project':
        return {
          id: session.workspaceId,
          label: session.workspaceLabel,
          order: projectOrder.has(session.workspaceId) ? (projectOrder.get(session.workspaceId) as number) : 999,
          workspaceId: session.workspaceId
        };
      case 'status':
        return { id: 'status:' + session.info.labelKey, label: t(session.info.labelKey), order: 10 - session.info.rank };
      case 'kind':
        return session.auto
          ? { id: 'kind:auto', label: t('kind.auto'), order: 0 }
          : { id: 'kind:normal', label: t('kind.normal'), order: 1 };
      case 'preset':
        return { id: 'preset:' + (session.preset || ''), label: presetText(session.preset), order: 0 };
      case 'updated':
        return timeGroup(session.updatedAt);
      case 'current':
        return session.current
          ? { id: 'current:yes', label: t('group.currentYes'), order: 0 }
          : { id: 'current:no', label: t('group.currentNo'), order: 1 };
      default:
        return { id: session.workspaceId, label: session.workspaceLabel, order: 0, workspaceId: session.workspaceId };
    }
  };

  const renderSessionsBody = (): unknown => {
    if (filteredSessions.length === 0) {
      return h('tr', null, h('td', { colSpan: 7, className: 'pbx-emptyCell' }, t('empty.filtered')));
    }
    const moreRow =
      hiddenSessionCount > 0
        ? h(
            'tr',
            { key: 'show-more' },
            h(
              'td',
              { colSpan: 7, className: 'pbx-moreCell' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'pbx-setBtn',
                  onClick: () => setSessionLimit((n) => n + SESSION_RENDER_BATCH)
                },
                t('board.showMore', { n: hiddenSessionCount })
              )
            )
          )
        : null;
    if (groupBy === 'none') {
      const rendered = shownSessions.map(renderSessionRow);
      return moreRow ? rendered.concat([moreRow]) : rendered;
    }
    /* Counts describe the filtered set (what the reader can see), while rows are the rendered
       subset — the "show more" batch must not make a group's header claim a smaller count. */
    const groupCounts = new Map<string, number>();
    for (const session of filteredSessions) {
      const key = groupOf(session).id;
      groupCounts.set(key, (groupCounts.get(key) || 0) + 1);
    }
    const groups: Array<GroupInfo & { rows: SessionRow[] }> = [];
    const positionOf = new Map<string, number>();
    for (const session of shownSessions) {
      const info = groupOf(session);
      const position = positionOf.get(info.id);
      if (position === undefined) {
        positionOf.set(info.id, groups.length);
        groups.push({ id: info.id, label: info.label, order: info.order, workspaceId: info.workspaceId, rows: [session] });
      } else {
        groups[position].rows.push(session);
      }
    }
    groups.sort((a, b) => a.order - b.order || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
    const rows: unknown[] = [];
    for (const group of groups) {
      rows.push(renderGroupHeader(group.id, group.label, groupCounts.get(group.id) || group.rows.length, group.workspaceId));
      if (collapsed[group.id] !== true) rows.push.apply(rows, group.rows.map(renderSessionRow));
    }
    if (moreRow) rows.push(moreRow);
    return rows;
  };

  const projectCols: ProjectColumn[] = PROJECT_COLUMNS.filter((def) => !config.projectColumns || (config.projectColumns as unknown as Record<string, boolean>)[def.key] !== false);
  const cellRepoState = (project: ProjectModel): 'loading' | 'error' | null => {
    // A mapped path with an empty owner/repo is not a real target: treat it as unconfigured
    // (show "—") instead of leaving the cell stuck at "loading" forever.
    if (!project.repo || !project.repo.owner || !project.repo.repo) return null;
    const stats = project.repoStats;
    if (!stats || stats.status === 'loading') return 'loading';
    if (stats.status === 'error') return 'error';
    return null;
  };
  const repoErrorText = (code: string | undefined): string => {
    if (code === 'repo-not-found') return t('col.errRepoNotFound');
    if (code === 'token-invalid') return t('col.errTokenInvalid');
    if (code === 'rate-limited') return t('col.errRateLimited');
    if (code === 'timeout') return t('col.errTimeout');
    return t('col.errGeneric', { code: code || '?' });
  };
  const projectCell = (project: ProjectModel, def: ProjectColumn): unknown => {
    if (def.key === 'lastUpdated') {
      const absolute = project.lastUpdated ? new Date(project.lastUpdated).toLocaleString() : '';
      return h('td', { className: 'pbx-num pbx-time', title: absolute }, relTime(project.lastUpdated, t));
    }
    if (def.key === 'issues' || def.key === 'prs') {
      const value = def.key === 'issues' ? project.issues : project.prs;
      const state = cellRepoState(project);
      if (state === 'loading') return h('td', { className: 'pbx-num pbx-na', 'aria-busy': true, title: t('col.loading') }, '…');
      if (state === 'error') return h('td', { className: 'pbx-num pbx-na pbx-err', 'aria-label': repoErrorText(project.repoStats?.error), title: repoErrorText(project.repoStats?.error) }, '⚠');
      if (value === undefined) {
        return h('td', { className: 'pbx-num pbx-na', title: t('col.naHint') }, t('col.na'));
      }
      const cls = 'pbx-num' + (value > 0 ? ' pbx-numHot' : ' pbx-numZero');
      return h('td', { className: cls }, String(value));
    }
    if (def.key === 'localVersion' || def.key === 'latestVersion') {
      const value = def.key === 'localVersion' ? project.localVersion : project.latestVersion;
      const state = cellRepoState(project);
      if (state === 'loading') return h('td', { className: 'pbx-num pbx-ver pbx-na', 'aria-busy': true, title: t('col.loading') }, '…');
      if (state === 'error') return h('td', { className: 'pbx-num pbx-ver pbx-na pbx-err', 'aria-label': repoErrorText(project.repoStats?.error), title: repoErrorText(project.repoStats?.error) }, '⚠');
      if (!value) return h('td', { className: 'pbx-num pbx-ver pbx-na', title: t('col.naHint') }, t('col.na'));
      const latest = project.latestVersion;
      const lagging = def.key === 'localVersion' && !!latest && compareVersions(value, latest) < 0;
      const cls = 'pbx-num pbx-ver' + (lagging ? ' pbx-verLag' : '');
      const title = lagging ? t('col.localBehind', { local: value, latest: latest || '' }) : value;
      return h('td', { className: cls, title: title }, h('span', null, value));
    }
    // `total` and any future numeric count column.
    const value = project.counts[def.key] ?? 0;
    const cls = 'pbx-num' + (def.key === 'total' ? ' pbx-strong' : '');
    return h('td', { className: cls }, String(value));
  };
  const renderInlineSessionRow = (row: SessionRow): unknown =>
    h(
      'tr',
      {
        key: 's-' + row.id,
        className: 'pbx-tr pbx-tr-inline' + (row.running ? ' pbx-tr-live' : '') + (row.current ? ' pbx-tr-current' : ''),
        onClick: () => open(row.id),
        tabIndex: 0,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open(row.id);
          }
        }
      },
      h(
        'td',
        { colSpan: 1 + projectCols.length, className: 'pbx-inlineSession' },
        h(
          'div',
          { className: 'pbx-inlineRow' },
          row.info.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.info.tone }),
          h('span', { className: 'pbx-titleText' }, row.title),
          row.current ? h('span', { className: 'pbx-curTag' }, t('card.current')) : null,
          h('span', { className: 'pbx-inlineTime' }, relTime(row.updatedAt, t)),
          h(
            'button',
            {
              type: 'button',
              className: 'pbx-openBtn',
              title: t('open'),
              'aria-label': t('open'),
              onClick: (e: Event) => {
                e.stopPropagation();
                open(row.id);
              }
            },
            h(Icon, { name: 'arrow', size: 14 })
          )
        )
      )
    );

  const renderProjectRow = (project: ProjectModel): unknown => {
    const spec = specOf(project.workspaceId);
    const isEditing = editingProject === project.workspaceId;
    const isExpanded = expandedProject === project.workspaceId;
    const projectRow = h(
      'tr',
      {
        key: project.workspaceId,
        className: 'pbx-tr' + (isExpanded ? ' pbx-tr-expanded' : '') + (projectFilter === project.workspaceId ? ' pbx-tr-selected' : ''),
        'aria-current': projectFilter === project.workspaceId ? 'true' : undefined,
        'aria-selected': projectFilter === project.workspaceId ? 'true' : 'false',
        'aria-expanded': isExpanded ? 'true' : 'false',
        tabIndex: 0,
        onClick: () => {
          setExpandedProject(isExpanded ? null : project.workspaceId);
        },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpandedProject(isExpanded ? null : project.workspaceId);
          }
        }
      },
      h(
        'td',
        null,
        h(
          'div',
          { className: 'pbx-titleCell' },
          h('span', { className: 'pbx-chevron' + (isExpanded ? ' open' : '') }, h(Icon, { name: 'chevron', size: 13 })),
          h(
            'span',
            { className: 'pbx-iconField', style: { position: 'relative' } },
            h(
              'button',
              {
                type: 'button',
                className: 'pbx-chipIcon lg pbx-iconTrigger',
                title: t('col.appearance'),
                'aria-label': t('col.appearance'),
                style: { color: spec.color, background: hexToRgba(spec.color, 0.16) },
                onPointerDown: (e: Event) => e.stopPropagation(),
                onClick: (e: MouseEvent) => {
                  e.stopPropagation();
                  if (isEditing) {
                    setEditingProject(null);
                    return;
                  }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
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
            'div',
            { className: 'pbx-twoLine' },
            h('div', { className: 'pbx-titleText' }, project.name),
            h('div', { className: 'pbx-subText' }, project.path)
          )
        )
      ),
      projectCols.map((def) => projectCell(project, def))
    );
    if (!isExpanded) return projectRow;
    const projectSessions = allSessions
      .filter((s) => s.workspaceId === project.workspaceId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
    if (projectSessions.length === 0) return projectRow;
    return [projectRow, ...projectSessions.map(renderInlineSessionRow)];
  };

  const header = h(
    'div',
    { className: 'pbx-header' },
    h(
      'div',
      null,
      h('div', { className: 'pbx-titleRow' }, h('span', { className: 'pbx-glyph' }, h(Icon, { name: 'board', size: 20 })), h('span', null, t('title'))),
      h('div', { className: 'pbx-subtitle' }, t('subtitle'))
    ),
    h(
      'div',
      { className: 'pbx-headerRight' },
      h(
        'div',
        { className: 'pbx-totals' },
        h('span', { className: 'pbx-total' }, h('strong', null, String(totals.workspaces)), t('stat.workspaces')),
        h('span', { className: 'pbx-total' }, h('strong', null, String(totals.sessions)), t('stat.sessions')),
        totals.attention > 0
          ? h('span', { className: 'pbx-total' }, h('strong', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, String(totals.attention)), t('stat.attention'))
          : null,
        totals.running > 0
          ? h(
              'span',
              { className: 'pbx-total' },
              h('strong', { style: { color: 'var(--dsw-alias-brand-primary)' } }, String(totals.running)),
              t('stat.running')
            )
          : null
      ),
      /* The main-panel instance covers the whole content area; without this the only way
         back to the conversation is the host's own panel switch. Give it an explicit exit. */
      typeof props.closePanel === 'function'
        ? h(
            'button',
            {
              type: 'button',
              className: 'pbx-setBtn pbx-headerClose',
              title: t('panel.close'),
              'aria-label': t('panel.close'),
              onClick: () => {
                const close = props.closePanel;
                if (typeof close === 'function') close();
              }
            },
            h(Icon, { name: 'close', size: 13 }),
            h('span', null, t('panel.close'))
          )
        : null
    )
  );

  const toolbar = h(
    'div',
    { className: 'pbx-toolbar' },
    h(
      'div',
      { className: 'pbx-tabs', role: 'tablist' },
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': view === 'projects' ? 'true' : 'false',
          className: 'pbx-tab' + (view === 'projects' ? ' active' : ''),
          onClick: () => applyView('projects')
        },
        t('view.projects'),
        h('span', { className: 'pbx-tabCount' }, String(projectModels.length))
      ),
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': view === 'sessions' ? 'true' : 'false',
          className: 'pbx-tab' + (view === 'sessions' ? ' active' : ''),
          onClick: () => { applyView('sessions'); setExpandedProject(null); }
        },
        t('view.sessions'),
        h('span', { className: 'pbx-tabCount' }, String(allSessions.length))
      )
    ),
    h(
      'div',
      { className: 'pbx-tools' },
      h('input', {
        className: 'pbx-input',
        type: 'text',
        placeholder: t('filter.search'),
        'aria-label': t('filter.search'),
        value: query,
        onChange: (e: Event) => setQuery((e.target as HTMLInputElement).value)
      }),
      view === 'sessions'
        ? h(
            'select',
            {
              className: 'pbx-select',
              value: statusFilter,
              onChange: (e: Event) => setStatusFilter((e.target as HTMLSelectElement).value),
              'aria-label': t('filter.status')
            },
            h('option', { value: 'all' }, t('filter.status') + ': ' + t('filter.all')),
            h('option', { value: 'running' }, t('status.running')),
            h('option', { value: 'attention' }, t('status.attention')),
            h('option', { value: 'done' }, t('status.done')),
            h('option', { value: 'idle' }, t('status.idle'))
          )
        : null,
      view === 'sessions'
        ? h(
            'select',
            {
              className: 'pbx-select',
              value: kindFilter,
              onChange: (e: Event) => setKindFilter((e.target as HTMLSelectElement).value),
              'aria-label': t('filter.kind')
            },
            h('option', { value: 'all' }, t('filter.kind') + ': ' + t('filter.all')),
            h('option', { value: 'auto' }, t('kind.auto')),
            h('option', { value: 'normal' }, t('kind.normal'))
          )
        : null,
      view === 'sessions'
        ? h(
            'select',
            {
              className: 'pbx-select',
              value: projectFilter,
              onChange: (e: Event) => setProjectFilter((e.target as HTMLSelectElement).value),
              'aria-label': t('filter.project')
            },
            h('option', { value: 'all' }, t('filter.project') + ': ' + t('filter.all')),
            projectModels.map((p) => h('option', { key: p.workspaceId, value: p.workspaceId }, p.name))
          )
        : null,
      view === 'sessions'
        ? h(
            'select',
            {
              className: 'pbx-select',
              value: groupBy,
              onChange: (e: Event) => setGroupBy((e.target as HTMLSelectElement).value as BoardGroupBy),
              'aria-label': t('group.label')
            },
            h('option', { value: 'none' }, t('group.label') + ': ' + t('group.none')),
            h('option', { value: 'project' }, t('group.project')),
            h('option', { value: 'status' }, t('group.status')),
            h('option', { value: 'kind' }, t('group.kind')),
            h('option', { value: 'preset' }, t('group.preset')),
            h('option', { value: 'updated' }, t('group.updated')),
            h('option', { value: 'current' }, t('group.current'))
          )
        : null,
      h('span', { className: 'pbx-sortHint' }, t('sort.hint', MODIFIER_LABELS))
    )
  );

  let body: unknown;
  if (!ready && workspaces.length === 0) {
    body = h('div', { className: 'pbx-loading' }, t('loading'));
  } else if (workspaces.length === 0) {
    body = h(
      'div',
      { className: 'pbx-empty' },
      h('div', { className: 'pbx-emptyIcon' }, h(Icon, { name: 'board', size: 30 })),
      h('div', { className: 'pbx-emptyTitle' }, t('empty.title')),
      h('div', { className: 'pbx-emptyDesc' }, t('empty.desc'))
    );
  } else if (view === 'sessions') {
    body = h(
      'div',
      { className: 'pbx-dbScroll' },
      h(
        'table',
        { className: 'pbx-table' },
        h(
          'thead',
          null,
          h(
            'tr',
            null,
            th('project', t('col.project'), '↗'),
            th('title', t('col.title'), 'Aa'),
            th('status', t('col.status'), '◉'),
            th('kind', t('col.kind'), '◇'),
            th('preset', t('col.preset'), '◈'),
            th('updatedAt', t('col.updated'), '◷', { num: true }),
            th('open', '', '', { sortable: false })
          )
        ),
        h('tbody', null, renderSessionsBody())
      ),
      h('div', { className: 'pbx-dbFoot' }, t(filteredSessions.length === 1 ? 'count.row' : 'count.rows', { n: filteredSessions.length }))
    );
  } else {
    body = h(
      'div',
      { className: 'pbx-dbScroll' },
      h(
        'table',
        { className: 'pbx-table' },
        h(
          'thead',
          null,
          h('tr', null, th('name', t('col.project'), 'Aa', { hint: t('col.hint.name') }), projectCols.map((def) => th(def.key, t(def.labelKey), def.type, { num: true, hint: t(def.hintKey) })))
        ),
        h(
          'tbody',
          null,
          filteredProjects.length === 0
            ? h('tr', null, h('td', { colSpan: 1 + projectCols.length, className: 'pbx-emptyCell' }, t('empty.filtered')))
            : filteredProjects.map(renderProjectRow).flat()
        )
      ),
      h('div', { className: 'pbx-dbFoot' }, t(filteredProjects.length === 1 ? 'count.row' : 'count.rows', { n: filteredProjects.length }))
    );
  }

  if (compact) {
    const statChip = (label: string, value: number, color?: string): unknown =>
      value > 0 ? h('span', { className: 'pbx-pcardStat', style: { color: color } }, String(value) + ' ' + label) : null;
    const activeProject = compactProjectId ? projectModels.find((item) => item.workspaceId === compactProjectId) : null;
    const activeRows = activeProject ? compactSessionsOf(activeProject.workspaceId) : [];
    /* The narrow pane used to drop the project/session switch entirely, leaving no way to
       reach the conversation list. Keep the same two tabs here; the project side stays a
       card list (six columns do not fit) while the session side reuses the compact row. */
    const compactTabs = h(
      'div',
      { className: 'pbx-compactTabs', role: 'tablist' },
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': view === 'projects' ? 'true' : 'false',
          className: 'pbx-tab' + (view === 'projects' ? ' active' : ''),
          onClick: () => {
            applyView('projects');
            setCompactProjectId(null);
          }
        },
        t('view.projects'),
        h('span', { className: 'pbx-tabCount' }, String(projectModels.length))
      ),
      h(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': view === 'sessions' ? 'true' : 'false',
          className: 'pbx-tab' + (view === 'sessions' ? ' active' : ''),
          onClick: () => {
            applyView('sessions');
            setCompactProjectId(null);
          }
        },
        t('view.sessions'),
        h('span', { className: 'pbx-tabCount' }, String(filteredSessions.length))
      )
    );
    const compactRow = (row: SessionRow): unknown =>
      h(
        'button',
        {
          key: row.id,
          type: 'button',
          className: 'pbx-crow' + (row.auto ? ' auto' : '') + (row.info.tone === 'running' ? ' live' : ''),
          title: t('card.open'),
          onClick: () => open(row.id)
        },
        row.info.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.info.tone }),
        row.auto ? h('span', { className: 'pbx-autoGlyph' }, h(Icon, { name: 'clock', size: 12 })) : null,
        h('span', { className: 'pbx-ctitle' }, row.title),
        h('span', { className: 'pbx-ctime' }, relTime(row.updatedAt, t))
      );
    const compactSessionList =
      filteredSessions.length === 0
        ? h('div', { className: 'pbx-cgroupEmpty' }, t('empty.filtered'))
        : h(
            'div',
            { className: 'pbx-compactList' },
            shownSessions.map(compactRow),
            hiddenSessionCount > 0
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'pbx-setBtn pbx-showMore',
                    onClick: () => setSessionLimit((n) => n + SESSION_RENDER_BATCH)
                  },
                  t('board.showMore', { n: hiddenSessionCount })
                )
              : null
          );
    return h(
      'div',
      { className: 'pbx-root pbx-compact' },
      h(
        'div',
        { className: 'pbx-compactWrap' },
        h(
          'div',
          { className: 'pbx-compactHead' },
          activeProject
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'pbx-compactBack',
                  title: t('compact.allProjects'),
                  'aria-label': t('compact.allProjects'),
                  onClick: () => setCompactProjectId(null)
                },
                h(Icon, { name: 'left', size: 14 })
              )
            : null,
          h(
            'div',
            { className: 'pbx-compactTitle' },
            h(Icon, { name: 'board', size: 16 }),
            h('span', null, activeProject ? activeProject.name : t('title'))
          ),
          h(
            'div',
            { className: 'pbx-compactMeta' },
            activeProject
              ? String(activeRows.length) + ' ' + t('stat.sessions')
              : String(projectModels.length) + ' ' + t('stat.workspaces') + ' · ' + String(totals.running) + ' ' + t('stat.running')
          ),
          typeof openFullBoard === 'function'
            ? h(
                'button',
                { type: 'button', className: 'pbx-compactFull', title: t('compact.full'), onClick: () => openFullBoard() },
                h(Icon, { name: 'expand', size: 14 })
              )
            : null
        ),
        activeProject ? null : compactTabs,
        activeProject
          ? h(
              'div',
              { className: 'pbx-compactBody' },
              activeRows.length === 0
                ? h('div', { className: 'pbx-cgroupEmpty' }, t('col.empty'))
                : h(
                    'div',
                    { className: 'pbx-compactList' },
                    activeRows.map((row) =>
                      h(
                        'button',
                        {
                          key: row.id,
                          type: 'button',
                          className:
                            'pbx-crow' +
                            (row.auto ? ' auto' : '') +
                            (row.archived ? ' archived' : '') +
                            (row.info.tone === 'running' ? ' live' : ''),
                          title: t('card.open'),
                          onClick: () => open(row.id)
                        },
                        row.info.tone === 'running' ? h(RunRing, { size: 9 }) : h('span', { className: 'pbx-rdot', 'data-tone': row.info.tone }),
                        row.auto ? h('span', { className: 'pbx-autoGlyph' }, h(Icon, { name: 'clock', size: 12 })) : null,
                        h('span', { className: 'pbx-ctitle' }, row.title),
                        row.archived ? h('span', { className: 'pbx-prowArchived' }, t('palette.archived')) : null,
                        h('span', { className: 'pbx-ctime' }, relTime(row.updatedAt, t))
                      )
                    )
                  ),
              activeProject.path
                ? h(
                    'div',
                    { className: 'pbx-compactPath', title: activeProject.path },
                    h('span', { className: 'pbx-compactPathLabel' }, t('col.path')),
                    h('span', { className: 'pbx-compactPathText' }, activeProject.path)
                  )
                : null
            )
          : view === 'sessions'
            ? compactSessionList
            : filteredProjects.length === 0
            ? h('div', { className: 'pbx-cgroupEmpty' }, t('empty.filtered'))
            : filteredProjects.map((project) => {
                const spec = specOf(project.workspaceId);
                return h(
                  'button',
                  {
                    key: project.workspaceId,
                    type: 'button',
                    className: 'pbx-pcard',
                    title: t('card.open'),
                    onClick: () => {
                      /* The compact detail page reads `activeRows` (its own per-workspace
                         slice), so it does not need `projectFilter`. Setting it here used to
                         leak into the session tab: after opening and leaving a card, the
                         session list stayed filtered to that one project. */
                      setCompactProjectId(project.workspaceId);
                      setStatusFilter('all');
                    }
                  },
                  h(
                    'span',
                    { className: 'pbx-pcardTop' },
                    h(
                      'span',
                      { className: 'pbx-chipIcon', style: { color: spec.color, background: hexToRgba(spec.color, 0.16) } },
                      h(Icon, { name: spec.icon, size: 13 })
                    ),
                    h('span', { className: 'pbx-pcardName' }, project.name),
                    h('span', { className: 'pbx-pcardTotal' }, String(project.counts.total))
                  ),
                  h(
                    'span',
                    { className: 'pbx-pcardStats' },
                    statChip(t('stat.running'), project.counts.running, 'var(--dsw-alias-brand-primary)'),
                    statChip(t('stat.attention'), project.counts.attention, 'var(--dsw-alias-state-warn-primary)'),
                    statChip(t('status.done'), project.counts.done, 'var(--dsw-alias-state-success-primary)'),
                    statChip(t('stat.auto'), project.counts.auto, 'var(--dsw-alias-state-warn-primary)')
                  )
                );
              })
      )
    );
  }

  return h('div', { className: 'pbx-root' }, h('div', { className: 'pbx-wrap' }, header, toolbar, body));
}
