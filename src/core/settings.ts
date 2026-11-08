/**
 * Settings model: shipped defaults, merge/migration from whatever is stored, and persistence.
 * The merge is deliberately forgiving — a stored section is overlaid on the defaults key by
 * key, so a settings file written by an older build keeps working.
 */
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../constants';
import type { Settings, ShortcutMap } from '../types';
import { comboHasModifier } from './combos';
import { cloneJson, loadJson, saveJson } from './json';

type RawSettings = Partial<Record<keyof Settings, unknown>> & Record<string, unknown>;

export function mergeSettings(base: Settings, raw: unknown): Settings {
  const out = cloneJson(base);
  if (raw && typeof raw === 'object') {
    const stored = raw as RawSettings;
    for (const key of Object.keys(base) as (keyof Settings)[]) {
      const value = stored[key];
      if (value && typeof value === 'object') {
        Object.assign(out[key] as unknown as Record<string, unknown>, value as Record<string, unknown>);
      }
    }
    if (stored.headerButtons && typeof stored.headerButtons === 'object') {
      const buttons = stored.headerButtons as Record<string, Partial<Settings['headerButtons'][string]>>;
      for (const id of Object.keys(DEFAULT_SETTINGS.headerButtons)) {
        out.headerButtons[id] = Object.assign({}, DEFAULT_SETTINGS.headerButtons[id], buttons[id] || {});
      }
    }
    if (stored.headerButtonsVersion !== 3) {
      // Keep the per-button merge above (user side/hidden/order survive), only apply the
      // one-off legacy "capsule hidden" signal on top. Do NOT replace the whole group with
      // the defaults here: that would wipe every user tweak on upgrade to version 3.
      const header = stored.header as { capsule?: boolean } | undefined;
      if (header && header.capsule === false) out.headerButtons.capsule.hidden = true;
    }
    if (stored.hintsVersion !== 1) out.hints = cloneJson(DEFAULT_SETTINGS.hints);
    if (stored.boardProjVersion !== 1) {
      out.board.defaultView = 'projects';
      out.boardProjVersion = 1;
    }
    // Column visibility keys change as columns are added/removed. Older builds stored
    // keys (running/attention/done/idle/auto/presets) that no longer exist; keep only
    // the current columns so the settings page and project table never leak dead keys.
    const columnKeys = Object.keys(DEFAULT_SETTINGS.projectColumns);
    for (const key of Object.keys(out.projectColumns)) {
      if (!columnKeys.includes(key)) delete (out.projectColumns as unknown as Record<string, boolean>)[key];
    }
    if (stored.projectColumnsVersion !== 1) {
      // First cutover to the 6-column set: any key that was never stored defaults to the
      // shipped value (the new repo-meta columns are on by default), so a user's stored
      // "columns" object only overrides keys it actually wrote.
      out.projectColumnsVersion = 1;
    }
    // GitHub data source: the token is a sensitive scalar (copy as-is), and githubRepos is
    // the user's authoritative mapping — replace it wholesale so a deleted path is actually
    // removed (a shallow Object.assign would leave stale entries). githubVersion is only a
    // one-time migration marker.
    if (typeof stored.githubToken === 'string') out.githubToken = stored.githubToken;
    if (stored.githubRepos && typeof stored.githubRepos === 'object') {
      out.githubRepos = cloneJson(stored.githubRepos as Record<string, unknown>) as Settings['githubRepos'];
    }
    if (stored.githubVersion !== 1) out.githubVersion = 1;
    for (const key of Object.keys(DEFAULT_SETTINGS.shortcuts) as (keyof ShortcutMap)[]) {
      if (!comboHasModifier(out.shortcuts[key])) out.shortcuts[key] = DEFAULT_SETTINGS.shortcuts[key];
    }
    if (stored.shortcutsVersion !== 1) out.shortcuts = healShortcutConflicts(out.shortcuts);
  }
  /* Duplicates can appear without the one-time migration: a new action's default may collide
     with a combo the user had already remapped another action to (that is exactly how the
     left-sidebar action arrived). A duplicate is never legitimate — the first matching branch
     wins and the other shortcut looks dead — and the recorder itself rejects duplicates, so
     this only ever repairs. Healing is idempotent: unique bindings pass through untouched. */
  out.shortcuts = healShortcutConflicts(out.shortcuts);
  return out;
}

/** Older builds shipped overlapping defaults (scroll-to-bottom and the session menu both on
 *  Alt+D); repaired saved settings keep one owner per combination. */
export function healShortcutConflicts(shortcuts: ShortcutMap): ShortcutMap {
  const defaults = DEFAULT_SETTINGS.shortcuts;
  const owners = new Map<string, string[]>();
  for (const action of Object.keys(defaults) as (keyof ShortcutMap)[]) {
    const combo = shortcuts[action];
    if (!owners.has(combo)) owners.set(combo, [action]);
    else owners.get(combo)!.push(action);
  }
  for (const [combo, actions] of owners) {
    if (actions.length < 2) continue;
    const winner = actions.find((name) => defaults[name as keyof ShortcutMap] === combo) || actions[0];
    for (const action of actions) {
      if (action === winner) continue;
      const fallback = defaults[action as keyof ShortcutMap];
      const taken = Array.from(owners.keys()).includes(fallback) && fallback !== combo;
      if (!taken) {
        shortcuts[action as keyof ShortcutMap] = fallback;
        owners.set(fallback, [action]);
      }
    }
  }
  return shortcuts;
}

export function loadSettings(): Settings {
  const raw = loadJson<RawSettings | null>(SETTINGS_KEY, null);
  const merged = mergeSettings(DEFAULT_SETTINGS, raw);
  if (
    raw &&
    typeof raw === 'object' &&
    (raw.headerButtonsVersion !== 3 || raw.hintsVersion !== 1 || raw.shortcutsVersion !== 1 || raw.boardProjVersion !== 1 || raw.projectColumnsVersion !== 1 || raw.githubVersion !== 1)
  ) {
    try {
      persistSettings(merged);
    } catch (error) {
      /* ignore */
    }
  }
  return merged;
}

export function persistSettings(value: Settings): void {
  saveJson(SETTINGS_KEY, value);
}
