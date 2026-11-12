/** The plugin's settings page: shortcut recording, header buttons, behaviour, logs and data. */
import { BOARD_WIDTH_KEY, DEFAULT_SETTINGS, HUD_COLLAPSE_KEY, HUD_POS_KEY, HUD_STARTS_KEY, LOG_KEY, SHORTCUT_LABEL_KEYS, STORE_KEY } from '../constants';
import type { Translate, UseHook } from '../host';
import { comboDisplay, comboFromEvent, comboHasModifier, isComposingEvent, MODIFIER_LABELS } from '../core/combos';
import { cloneJson } from '../core/json';
import { logEvent } from '../core/log';
import { fallbackHook } from '../core/schedule';
import { shortcutState } from '../core/state';
import { fetchRepoStats } from '../core/github';
import { h, useEffect, useRef, useState } from '../runtime';
import type { LogEntry, Settings, ShortcutAction, GithubRepoSetting } from '../types';
import type { SaveSettings } from '../core/header-drag';
import { PROJECT_COLUMNS } from './format';
import type { WorkspaceSnapshot } from '../core/snapshot';

export interface SettingsPageProps {
  useSettings?: UseHook<Settings>;
  saveSettings?: SaveSettings;
  useLogs?: UseHook<{ entries: LogEntry[] }>;
  logs?: { set(patch: { entries: LogEntry[] }): void };
  notify?: (payload: { tone: string; title: string; message: string; ttl?: number }) => void;
  findBuiltinConflict?: (combo: string) => { label: string } | null;
  useShortcutsCatalog?: UseHook<unknown>;
  /** Host slot hook; when present the GitHub section lists real workspaces to map. */
  useWorkspaces?: UseHook<WorkspaceSnapshot>;
  /** Palette -> settings deep link: which section to reveal and highlight. */
  useSettingsTarget?: UseHook<{ key: string | null; at: number }>;
  t: Translate;
}

type SettingsSection = 'palette' | 'header' | 'hints' | 'hud' | 'notify' | 'log' | 'board' | 'projectColumns' | 'chat';

interface SelectOption {
  value: string;
  labelKey: string;
}

interface BuiltinWarning {
  key: string;
  combo: string;
  label: string;
}

export function SettingsPage(props: SettingsPageProps): unknown {
  const { t } = props;
  const useSettings = typeof props.useSettings === 'function' ? props.useSettings : fallbackHook<Settings>();
  const config = useSettings((snapshot) => snapshot) || DEFAULT_SETTINGS;
  const saveSettings: SaveSettings = typeof props.saveSettings === 'function' ? props.saveSettings : function (): void {};
  const useLogs = typeof props.useLogs === 'function' ? props.useLogs : fallbackHook<{ entries: LogEntry[] }>();
  const logsSnap = useLogs((value) => value) || { entries: [] };
  const logEntries = Array.isArray(logsSnap.entries) ? logsSnap.entries : [];
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [recordError, setRecordError] = useState('');
  const [builtinWarnings, setBuiltinWarnings] = useState<BuiltinWarning[]>([]);
  const scannedConflictsRef = useRef(new Set<string>());
  /* settings-from-storage healing is best effort: when both colliding actions have their own
     defaults taken by other actions, a duplicate cannot be repaired without inventing a
     binding. Show it here instead of leaving a silently dead shortcut. */
  const selfConflicts: Array<{ combo: string; names: string[] }> = (() => {
    const owners = new Map<string, ShortcutAction[]>();
    for (const action of Object.keys(config.shortcuts || {}) as ShortcutAction[]) {
      const combo = config.shortcuts[action];
      if (!owners.has(combo)) owners.set(combo, [action]);
      else owners.get(combo)!.push(action);
    }
    const found: Array<{ combo: string; names: string[] }> = [];
    for (const [combo, actions] of owners) {
      if (actions.length < 2) continue;
      found.push({ combo: combo, names: actions.map((action) => t(SHORTCUT_LABEL_KEYS[action] || 'settings.shortcut.palette')) });
    }
    return found;
  })();
  const useWorkspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces : fallbackHook<WorkspaceSnapshot>();
  const wsSnap = useWorkspaces((value) => value);
  const ghWorkspaces = ((wsSnap && wsSnap.items) || []).filter((item) => item && item.path);
  const [ghTesting, setGhTesting] = useState(false);
  const [ghTest, setGhTest] = useState<{ ok: boolean; text: string } | null>(null);
  /* Deep link from the command palette: open this settings section and briefly highlight
     the matching block. Anchors map to the same dictionary keys the section headings use,
     so matching the rendered text works in either locale without extra DOM markers.
     The timer is owned by this effect's cleanup, so unloading mid-highlight cannot leave a
     stray timeout writing into a page that no longer hosts the plugin. */
  const useSettingsTarget = typeof props.useSettingsTarget === 'function'
    ? props.useSettingsTarget
    : fallbackHook<{ key: string | null; at: number }>();
  const settingsTarget = useSettingsTarget((snapshot) => snapshot) || { key: null, at: 0 };
  const ANCHOR_LABEL_KEYS: Record<string, string> = {
    shortcuts: 'settings.shortcuts',
    headerButtons: 'settings.headerButtons',
    behavior: 'settings.behavior',
    github: 'settings.githubTitle',
    logging: 'settings.logging',
    data: 'settings.data'
  };
  useEffect(() => {
    const key = settingsTarget.key;
    if (!key || !settingsTarget.at || !ANCHOR_LABEL_KEYS[key]) return undefined;
    let raf = 0;
    let timer = 0;
    const reveal = (): void => {
      const wanted = t(ANCHOR_LABEL_KEYS[key]).trim();
      const heads = document.querySelectorAll('.pbx-setSectionTitle');
      for (const head of Array.prototype.slice.call(heads) as HTMLElement[]) {
        if ((head.textContent || '').trim() !== wanted) continue;
        const section = head.closest('.pbx-setSection') as HTMLElement | null;
        if (!section) continue;
        if (typeof section.scrollIntoView === 'function') section.scrollIntoView({ block: 'center' });
        section.classList.add('pbx-setHighlight');
        timer = window.setTimeout(() => section.classList.remove('pbx-setHighlight'), 2200);
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
    if (!recording) return undefined;
    shortcutState.suppressed = true;
    const onKey = (event: KeyboardEvent): void => {
      if (isComposingEvent(event)) return;
      if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        setRecording(null);
        setRecordError('');
        return;
      }
      const combo = comboFromEvent(event);
      if (!combo) return;
      event.preventDefault();
      event.stopPropagation();
      if (!comboHasModifier(combo)) {
        setRecordError(t('settings.shortcutNeedModifier', MODIFIER_LABELS));
        return;
      }
      const next = cloneJson(config);
      const conflict = (Object.keys(next.shortcuts) as ShortcutAction[]).find((key) => key !== recording && next.shortcuts[key] === combo);
      if (conflict) {
        const message = t('toast.conflictOwn', {
          combo: comboDisplay(combo),
          name: t(SHORTCUT_LABEL_KEYS[conflict] || 'settings.shortcut.palette')
        });
        setRecordError(message);
        if (typeof props.notify === 'function') props.notify({ tone: 'warn', title: t('toast.conflictTitle'), message: message });
        return;
      }
      if (typeof props.findBuiltinConflict === 'function') {
        const builtin = props.findBuiltinConflict(combo);
        if (builtin) {
          const message = t('toast.conflictBuiltin', { combo: comboDisplay(combo), name: builtin.label });
          setRecordError(message);
          if (typeof props.notify === 'function') props.notify({ tone: 'warn', title: t('toast.conflictTitle'), message: message });
          return;
        }
      }
      setRecordError('');
      next.shortcuts[recording] = combo;
      saveSettings(next);
      setRecording(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      shortcutState.suppressed = false;
      document.removeEventListener('keydown', onKey, true);
    };
  }, [recording, config, saveSettings]);

  const useShortcutsCatalog = typeof props.useShortcutsCatalog === 'function' ? props.useShortcutsCatalog : fallbackHook<unknown>();
  const shortcutsCatalog = useShortcutsCatalog((value) => value);
  useEffect(() => {
    if (typeof props.findBuiltinConflict !== 'function') return;
    const found: BuiltinWarning[] = [];
    for (const key of Object.keys(config.shortcuts || {})) {
      const combo = config.shortcuts[key as ShortcutAction];
      const conflict = props.findBuiltinConflict(combo);
      if (conflict) found.push({ key: key, combo: combo, label: conflict.label });
    }
    setBuiltinWarnings(found);
    const present = new Set(found.map((item) => item.key + ':' + item.combo));
    for (const signature of Array.from(scannedConflictsRef.current)) {
      if (!present.has(signature)) scannedConflictsRef.current.delete(signature);
    }
    for (const item of found) {
      const signature = item.key + ':' + item.combo;
      if (scannedConflictsRef.current.has(signature)) continue;
      scannedConflictsRef.current.add(signature);
      if (typeof props.notify === 'function') {
        props.notify({
          tone: 'warn',
          title: t('toast.conflictTitle'),
          message: t('toast.conflictExisting', { combo: comboDisplay(item.combo), name: item.label })
        });
      }
    }
  }, [config.shortcuts, shortcutsCatalog]);

  /* A settings object saved before this section existed has no key for it (migration may
     not have back-filled it yet), and reading through undefined would throw while the page
     renders. Fall back to the shipped defaults so the section still shows, and a change
     writes it into place. */
  const readSection = (section: SettingsSection): Record<string, unknown> => {
    const live = (config as unknown as Record<string, unknown>)[section];
    if (live && typeof live === 'object') return live as Record<string, unknown>;
    const fallback = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[section];
    return fallback && typeof fallback === 'object' ? (fallback as Record<string, unknown>) : {};
  };
  /* A stored value can be corrupt or from a hand-edited config: Number('abc') is NaN, and
     rendering NaN into a number input shows the literal text "NaN". Coerce into the legal
     range, falling back to the shipped default so the field still communicates something. */
  const numberIn = (section: SettingsSection, key: string, min: number, max: number): number => {
    const raw = Number(readSection(section)[key]);
    if (Number.isFinite(raw)) return Math.min(max, Math.max(min, raw));
    const shipped = Number(((DEFAULT_SETTINGS as unknown as Record<string, unknown>)[section] as Record<string, unknown> | undefined)?.[key]);
    return Number.isFinite(shipped) ? Math.min(max, Math.max(min, shipped)) : min;
  };
  const update = (section: SettingsSection, patch: Record<string, unknown>): void => {
    const next = cloneJson(config);
    const current = (next as unknown as Record<string, unknown>)[section];
    const base = current && typeof current === 'object' ? current : cloneJson((DEFAULT_SETTINGS as unknown as Record<string, unknown>)[section] || {});
    Object.assign(base as Record<string, unknown>, patch);
    (next as unknown as Record<string, unknown>)[section] = base;
    saveSettings(next);
  };
  const resetAll = (): void => {
    saveSettings(cloneJson(DEFAULT_SETTINGS));
    try {
      window.localStorage.removeItem(HUD_COLLAPSE_KEY);
      window.localStorage.removeItem(HUD_POS_KEY);
      window.localStorage.removeItem(HUD_STARTS_KEY);
      window.localStorage.removeItem(BOARD_WIDTH_KEY);
      window.dispatchEvent(new Event('pbx-hud-reset'));
    } catch (error) {
      /* ignore */
    }
  };
  const githubRepos = (config.githubRepos || {}) as Record<string, GithubRepoSetting>;
  const repoNameFromPath = (path: string): string => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  const setGithubToken = (value: string): void => {
    const next = cloneJson(config);
    if (value) next.githubToken = value;
    else delete next.githubToken;
    saveSettings(next);
  };
  const updateGithubRepo = (path: string, patch: Partial<GithubRepoSetting>): void => {
    const next = cloneJson(config);
    const repos = { ...(next.githubRepos || {}) };
    const existing = repos[path] || { owner: '', repo: '' };
    repos[path] = { ...existing, ...patch };
    next.githubRepos = repos;
    saveSettings(next);
  };
  const renameRepoPath = (oldPath: string, newPath: string): void => {
    if (!oldPath || oldPath === newPath) return;
    const next = cloneJson(config);
    const repos = { ...(next.githubRepos || {}) };
    const value = repos[oldPath];
    if (!value) return;
    delete repos[oldPath];
    repos[newPath] = value;
    next.githubRepos = repos;
    saveSettings(next);
  };
  const removeGithubRepo = (path: string): void => {
    const next = cloneJson(config);
    const repos = { ...(next.githubRepos || {}) };
    delete repos[path];
    next.githubRepos = repos;
    saveSettings(next);
  };
  const addGithubRepo = (): void => {
    const next = cloneJson(config);
    const repos = { ...(next.githubRepos || {}) };
    const candidate = ghWorkspaces.find((item) => item.path && !repos[item.path]);
    if (candidate && candidate.path) {
      repos[candidate.path] = { owner: '', repo: repoNameFromPath(candidate.path) };
    } else if (!repos['']) {
      // No unmapped workspace available — allow one manual entry with an empty path
      // (the user types the path in fallback mode), but never duplicate it.
      repos[''] = { owner: '', repo: '' };
    } else {
      return;
    }
    next.githubRepos = repos;
    saveSettings(next);
  };
  const githubErrorText = (code: string | undefined): string => {
    if (code === 'token-invalid') return t('col.errTokenInvalid');
    if (code === 'rate-limited') return t('col.errRateLimited');
    if (code === 'repo-not-found') return t('col.errRepoNotFound');
    return t('settings.githubTestFail');
  };
  const testGithub = async (): Promise<void> => {
    setGhTesting(true);
    setGhTest(null);
    try {
      const stats = await fetchRepoStats('octocat', 'hello-world', config.githubToken);
      setGhTest(stats.status === 'ok' ? { ok: true, text: config.githubToken ? t('settings.githubTestOk') : t('settings.githubTestOkNoToken') } : { ok: false, text: githubErrorText(stats.error) });
    } catch (error) {
      setGhTest({ ok: false, text: t('settings.githubTestFail') });
    } finally {
      setGhTesting(false);
    }
  };
  const renderGithubRepos = (): unknown[] => {
    const listed = ghWorkspaces.length > 0 ? ghWorkspaces.map((item) => item.path as string) : Object.keys(githubRepos);
    if (listed.length === 0) return [h('div', { className: 'pbx-setHint' }, t('settings.githubNone'))];
    return listed.map((path) => {
      const setting = githubRepos[path] || { owner: '', repo: repoNameFromPath(path) };
      return h(
        'div',
        { className: 'pbx-githubRepo', key: 'gh-' + path },
        ghWorkspaces.length > 0
          ? h('div', { className: 'pbx-githubPath', title: path }, path)
          : h('input', {
              type: 'text',
              className: 'pbx-setInput pbx-githubPathInput',
              'aria-label': t('settings.githubPath'),
              defaultValue: path,
              onBlur: (event: Event) => renameRepoPath(path, (event.target as HTMLInputElement).value)
            }),
        h('input', {
          type: 'text',
          className: 'pbx-setInput pbx-githubOwner',
          'aria-label': t('settings.githubOwner'),
          placeholder: t('settings.githubOwner'),
          value: setting.owner,
          onInput: (event: Event) => updateGithubRepo(path, { owner: (event.target as HTMLInputElement).value })
        }),
        h('input', {
          type: 'text',
          className: 'pbx-setInput pbx-githubRepoName',
          'aria-label': t('settings.githubRepo'),
          placeholder: t('settings.githubPlaceholderRepo'),
          value: setting.repo,
          onInput: (event: Event) => updateGithubRepo(path, { repo: (event.target as HTMLInputElement).value })
        }),
        h('input', {
          type: 'text',
          className: 'pbx-setInput pbx-githubLocal',
          'aria-label': t('settings.githubLocalVersion'),
          placeholder: t('settings.githubLocalVersion'),
          value: setting.localVersion || '',
          onInput: (event: Event) => updateGithubRepo(path, { localVersion: (event.target as HTMLInputElement).value })
        }),
        h(
          'button',
          { type: 'button', className: 'pbx-setBtn pbx-githubRemove', 'aria-label': t('settings.githubRemoveRepo'), title: t('settings.githubRemoveRepo'), onClick: () => removeGithubRepo(path) },
          '×'
        )
      );
    });
  };
  const resetAppearance = (): void => {
    try {
      window.localStorage.removeItem(STORE_KEY);
    } catch (error) {
      /* ignore */
    }
    try {
      window.dispatchEvent(new Event('pbx-appearance-reset'));
    } catch (error) {
      /* ignore */
    }
  };
  const copyLogs = async (): Promise<void> => {
    const text = JSON.stringify(logEntries, null, 1);
    try {
      await navigator.clipboard.writeText(text);
      if (typeof props.notify === 'function') {
        props.notify({ tone: 'success', title: t('settings.logging'), message: t('settings.logCopied'), ttl: 5000 });
      }
    } catch (error) {
      if (typeof props.notify === 'function') {
        props.notify({ tone: 'warn', title: t('settings.logging'), message: t('settings.logCopyFailed'), ttl: 6000 });
      }
    }
  };
  const clearLogs = (): void => {
    try {
      if (props.logs && typeof props.logs.set === 'function') props.logs.set({ entries: [] });
    } catch (error) {
      /* ignore */
    }
    try {
      window.localStorage.removeItem(LOG_KEY);
    } catch (error) {
      /* ignore */
    }
    logEvent('info', 'settings', 'logs cleared');
  };

  const row = (key: string, labelKey: string, descKey: string | null, control: unknown, disabled = false): unknown =>
    h(
      'div',
      { className: 'pbx-setRow' + (disabled ? ' pbx-setRowOff' : ''), key: key, 'data-setting': key },
      h('div', { className: 'pbx-setRowText' }, h('div', { className: 'pbx-setLabel' }, t(labelKey)), descKey ? h('div', { className: 'pbx-setDesc' }, t(descKey)) : null),
      h('div', { className: 'pbx-setControl' }, control)
    );
  const shortcutRow = (key: ShortcutAction, labelKey: string): unknown =>
    row(
      'sc-' + key,
      labelKey,
      null,
      h(
        'button',
        {
          type: 'button',
          className: 'pbx-keycap' + (recording === key ? ' recording' : ''),
          title: t('settings.shortcutResetHint'),
          onClick: () => {
            setRecordError('');
            setRecording(recording === key ? null : key);
          },
          onDoubleClick: () => {
            const next = cloneJson(config);
            next.shortcuts[key] = DEFAULT_SETTINGS.shortcuts[key];
            setRecordError('');
            setRecording(null);
            saveSettings(next);
          }
        },
        recording === key ? t('settings.recording') : comboDisplay(config.shortcuts[key])
      )
    );
  const toggleRow = (section: SettingsSection, key: string, labelKey: string, descKey?: string, disabled = false): unknown => {
    const values = readSection(section);
    return row(
      section + '-' + key,
      labelKey,
      descKey || null,
      h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': Boolean(values[key]),
          'aria-label': t(labelKey),
          disabled: disabled,
          className: 'pbx-switch' + (values[key] ? ' on' : ''),
          onClick: () => update(section, { [key]: !values[key] })
        },
        h('span', { className: 'pbx-switchThumb' })
      ),
      disabled
    );
  };
  const selectRow = (section: SettingsSection, key: string, labelKey: string, options: SelectOption[], disabled = false): unknown => {
    const values = readSection(section);
    return row(
      section + '-' + key,
      labelKey,
      null,
      h(
        'select',
        {
          className: 'pbx-setSelect',
          disabled: disabled,
          value: String(values[key]),
          onChange: (event: Event) => update(section, { [key]: (event.target as HTMLSelectElement).value })
        },
        options.map((option) => h('option', { key: option.value, value: option.value }, t(option.labelKey)))
      ),
      disabled
    );
  };
  const numberRow = (section: SettingsSection, key: string, labelKey: string, min: number, max: number, step: number, disabled = false): unknown => {
    const value = numberIn(section, key, min, max);
    return row(
      section + '-' + key,
      labelKey,
      null,
      h('input', {
        key: section + '-' + key + '-' + value,
        type: 'number',
        className: 'pbx-setInput',
        disabled: disabled,
        defaultValue: value,
        min: min,
        max: max,
        step: step,
        onBlur: (event: Event) => {
          const target = event.target as HTMLInputElement;
          const raw = String(target.value || '').trim();
          const parsed = Number(raw);
          if (raw === '' || !Number.isFinite(parsed)) {
            target.value = String(value);
            return;
          }
          const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
          target.value = String(clamped);
          if (clamped !== value) update(section, { [key]: clamped });
        },
        onKeyDown: (event: KeyboardEvent) => {
          const target = event.currentTarget as HTMLInputElement;
          if (event.key === 'Enter') target.blur();
          if (event.key === 'Escape') {
            target.value = String(value);
            target.blur();
          }
        }
      }),
      disabled
    );
  };
  const rangeRow = (section: SettingsSection, key: string, labelKey: string, min: number, max: number, step: number, disabled = false): unknown => {
    const value = numberIn(section, key, min, max);
    return row(
      section + '-' + key,
      labelKey,
      null,
      h(
        'span',
        { className: 'pbx-setRange' },
        h('input', {
          type: 'range',
          disabled: disabled,
          min: min,
          max: max,
          step: step,
          value: value,
          onChange: (event: Event) => update(section, { [key]: Number((event.target as HTMLInputElement).value) })
        }),
        h('span', { className: 'pbx-setRangeValue' }, String(value))
      ),
      disabled
    );
  };
  const headerButtonRow = (id: string, labelKey: string): unknown => {
    const item = (config.headerButtons && config.headerButtons[id]) || DEFAULT_SETTINGS.headerButtons[id];
    const patchItem = (patch: Record<string, unknown>): void => {
      const next = cloneJson(config);
      next.headerButtons = next.headerButtons || cloneJson(DEFAULT_SETTINGS.headerButtons);
      next.headerButtons[id] = Object.assign({}, item, patch);
      saveSettings(next);
    };
    return row(
      'hb-' + id,
      labelKey,
      null,
      h(
        'span',
        { className: 'pbx-setInline' },
        config.header && config.header.placement === 'composer'
          ? h('span', { className: 'pbx-setMuted' }, t('settings.hb.followPlacement'))
          : h(
              'select',
              {
                className: 'pbx-setSelect',
                value: item.side,
                onChange: (event: Event) => patchItem({ side: (event.target as HTMLSelectElement).value })
              },
              h('option', { value: 'left' }, t('settings.hb.sideLeft')),
              h('option', { value: 'right' }, t('settings.hb.sideRight'))
            ),
        h(
          'button',
          {
            type: 'button',
            role: 'switch',
            'aria-checked': !item.hidden,
            className: 'pbx-switch' + (item.hidden ? '' : ' on'),
            onClick: () => patchItem({ hidden: !item.hidden })
          },
          h('span', { className: 'pbx-switchThumb' })
        )
      )
    );
  };

  /* A feature that is switched off makes its own sub-settings meaningless — the reader can still
     change them and nothing happens, which reads as a broken setting. Grey those out instead.
     The switch itself is never disabled, or there would be no way back. */
  const sectionOn = (section: SettingsSection): boolean => readSection(section).enabled !== false;
  const boardOn = (): boolean => sectionOn('board');
  const hudOn = (): boolean => sectionOn('hud');
  const paletteOn = (): boolean => sectionOn('palette');
  const notifyOn = (): boolean => sectionOn('notify');
  const logOn = (): boolean => sectionOn('log');
  const hudRecentOn = (): boolean => hudOn() && readSection('hud').recentEnabled !== false;

  return h(
    'div',
    { className: 'pbx-setPage' },
    h('h2', { className: 'pbx-setTitle' }, t('settings.title')),
    h('p', { className: 'pbx-setIntro' }, t('settings.intro')),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.shortcuts')),
      shortcutRow('palette', 'settings.shortcut.palette'),
      shortcutRow('prev', 'settings.shortcut.prev'),
      shortcutRow('next', 'settings.shortcut.next'),
      shortcutRow('userPrev', 'settings.shortcut.userPrev'),
      shortcutRow('userNext', 'settings.shortcut.userNext'),
      shortcutRow('scrollBottom', 'settings.shortcut.scrollBottom'),
      shortcutRow('sidebarBoard', 'settings.shortcut.sidebarBoard'),
      shortcutRow('leftSidebar', 'settings.shortcut.leftSidebar'),
      shortcutRow('panelHalf', 'settings.shortcut.panelHalf'),
      shortcutRow('panelFull', 'settings.shortcut.panelFull'),
      shortcutRow('rename', 'settings.shortcut.rename'),
      shortcutRow('sessionMenu', 'settings.shortcut.sessionMenu'),
      shortcutRow('interject', 'settings.shortcut.interject'),
      shortcutRow('hud', 'settings.shortcut.hud'),
      builtinWarnings.map((item) =>
        h(
          'div',
          { key: 'warn-' + item.key, className: 'pbx-setWarn' },
          t('toast.conflictExisting', { combo: comboDisplay(item.combo), name: item.label })
        )
      ),
      selfConflicts.map((item) =>
        h(
          'div',
          { key: 'self-' + item.combo, className: 'pbx-setWarn', 'data-self-conflict': item.combo },
          t('settings.selfConflict', { combo: comboDisplay(item.combo), names: item.names.join(' / ') })
        )
      ),
      recordError ? h('div', { className: 'pbx-setError' }, recordError) : null,
      h('div', { className: 'pbx-setHint' }, t('settings.shortcut.hint', MODIFIER_LABELS))
    ),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.headerButtons')),
      selectRow('header', 'placement', 'settings.headerPlacement', [
        { value: 'header', labelKey: 'settings.placement.header' },
        { value: 'composer', labelKey: 'settings.placement.composer' }
      ]),
      ['switch', 'historyNav', 'capsule'].map((id) => headerButtonRow(id, 'settings.hb.' + id)),
      h('div', { className: 'pbx-setHint' }, config.header.placement === 'composer'
        ? t('settings.composerButtonsHint')
        : t('settings.headerButtonsHint', MODIFIER_LABELS))
    ),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.behavior')),
      toggleRow('palette', 'enabled', 'settings.paletteEnabled', 'settings.paletteEnabledDesc'),
      toggleRow('palette', 'includeArchived', 'settings.paletteArchived', 'settings.paletteArchivedDesc', !paletteOn()),
      toggleRow('hints', 'shortcuts', 'settings.shortcutHints', 'settings.shortcutHintsDesc'),
      toggleRow('hud', 'enabled', 'settings.hudEnabled', 'settings.hudEnabledDesc'),
      toggleRow('hud', 'includeDone', 'settings.hudDone', 'settings.hudDoneDesc', !hudOn()),
      toggleRow('hud', 'recentEnabled', 'settings.hudRecent', 'settings.hudRecentDesc', !hudOn()),
      numberRow('hud', 'recentCount', 'settings.hudRecentCount', 1, 20, 1, !hudRecentOn()),
      numberRow('hud', 'maxSessions', 'settings.hudMaxSessions', 1, 20, 1, !hudOn()),
      toggleRow('hud', 'recentExcludeAuto', 'settings.hudRecentExcludeAuto', 'settings.hudRecentExcludeAutoDesc', !hudRecentOn()),
      toggleRow('hud', 'defaultCollapsed', 'settings.hudCollapsed', 'settings.hudCollapsedDesc', !hudOn()),
      selectRow('hud', 'defaultPosition', 'settings.hudPosition', [
        { value: 'top-right', labelKey: 'settings.pos.top' },
        { value: 'bottom-right', labelKey: 'settings.pos.bottom' },
        { value: 'last', labelKey: 'settings.pos.last' }
      ], !hudOn()),
      toggleRow('board', 'enabled', 'settings.boardEnabled', 'settings.boardEnabledDesc'),
      numberRow('board', 'wideThreshold', 'settings.boardThreshold', 320, 1000, 20, !boardOn()),
      selectRow('board', 'defaultView', 'settings.boardView', [
        { value: 'sessions', labelKey: 'view.sessions' },
        { value: 'projects', labelKey: 'view.projects' }
      ], !boardOn()),
      selectRow('board', 'groupBy', 'settings.boardGroupBy', [
        { value: 'none', labelKey: 'group.none' },
        { value: 'project', labelKey: 'group.project' },
        { value: 'status', labelKey: 'group.status' },
        { value: 'kind', labelKey: 'group.kind' },
        { value: 'preset', labelKey: 'group.preset' },
        { value: 'updated', labelKey: 'group.updated' },
        { value: 'current', labelKey: 'group.current' }
      ], !boardOn()),
      h('div', { className: 'pbx-setSubTitle' }, t('settings.projectColumns')),
      PROJECT_COLUMNS.map((def) => toggleRow('projectColumns', def.key, def.labelKey, undefined, !boardOn())),
      h('div', { className: 'pbx-setHint' }, t('settings.projectColumnsHint')),
      toggleRow('notify', 'enabled', 'settings.notifyEnabled', 'settings.notifyEnabledDesc'),
      toggleRow('notify', 'sound', 'settings.notifySound', 'settings.notifySoundDesc', !notifyOn()),
      toggleRow('chat', 'autoHistory', 'settings.chatAutoHistory', 'settings.chatAutoHistoryDesc'),
      rangeRow('palette', 'blur', 'settings.blur', 6, 32, 1, !paletteOn())
    ),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.githubTitle')),
      h('div', { className: 'pbx-setHint' }, t('settings.githubDesc')),
      row(
        'gh-token',
        'settings.githubToken',
        'settings.githubTokenDesc',
        h(
          'div',
          { className: 'pbx-githubToken' },
          h('input', {
            type: 'password',
            className: 'pbx-setInput pbx-githubTokenInput',
            'aria-label': t('settings.githubToken'),
            value: config.githubToken || '',
            placeholder: 'ghp_…',
            onInput: (event: Event) => setGithubToken((event.target as HTMLInputElement).value)
          }),
          h('button', { type: 'button', className: 'pbx-setBtn', disabled: ghTesting, onClick: () => void testGithub() }, ghTesting ? t('settings.githubTesting') : t('settings.githubTest'))
        )
      ),
      ghTest ? h('div', { role: 'status', className: 'pbx-setHint' + (ghTest.ok ? ' pbx-githubOk' : ' pbx-setError') }, ghTest.text) : null,
      config.githubToken && config.githubToken.startsWith('{{') && config.githubToken.endsWith('}}') ? h('div', { className: 'pbx-setHint pbx-setError' }, t('settings.githubTokenPlaceholderWarn')) : null,
      h('div', { className: 'pbx-setSubTitle' }, t('settings.githubReposTitle')),
      h('div', { className: 'pbx-setHint' }, t('settings.githubReposHint')),
      ...renderGithubRepos(),
      h('div', { className: 'pbx-setActions' }, h('button', { type: 'button', className: 'pbx-setBtn', onClick: addGithubRepo }, t('settings.githubAddRepo')))
    ),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.logging')),
      toggleRow('log', 'enabled', 'settings.logEnabled', 'settings.logEnabledDesc'),
      selectRow('log', 'level', 'settings.logLevel', [
        { value: 'error', labelKey: 'settings.logLevelError' },
        { value: 'warn', labelKey: 'settings.logLevelWarn' },
        { value: 'info', labelKey: 'settings.logLevelInfo' },
        { value: 'debug', labelKey: 'settings.logLevelDebug' }
      ], !logOn()),
      numberRow('log', 'max', 'settings.logMax', 20, 500, 10, !logOn()),
      h('div', { className: 'pbx-setHint' }, t('settings.logHint', { count: String(logEntries.length) })),
      h(
        'div',
        { className: 'pbx-setActions' },
        h('button', { type: 'button', className: 'pbx-setBtn', onClick: () => void copyLogs() }, t('settings.logCopy')),
        h('button', { type: 'button', className: 'pbx-setBtn danger', onClick: clearLogs }, t('settings.logClear'))
      )
    ),

    h(
      'section',
      { className: 'pbx-setSection' },
      h('h3', { className: 'pbx-setSectionTitle' }, t('settings.data')),
      h(
        'div',
        { className: 'pbx-setActions' },
        h('button', { type: 'button', className: 'pbx-setBtn', onClick: resetAll }, t('settings.reset')),
        h('button', { type: 'button', className: 'pbx-setBtn danger', onClick: resetAppearance }, t('settings.resetAppearance'))
      ),
      h('div', { className: 'pbx-setHint' }, t('settings.resetAppearanceHint'))
    )
  );
}
