/**
 * Settings index for the command palette.
 *
 * Host settings sections are read from the public `settings.section` slot ledger, so a
 * section contributed by the host or another plugin appears in search without a dsh-tac
 * release. The plugin's own preferences are a small static index: they all live inside the
 * single `project-board-settings` section, so each entry carries an anchor the settings
 * page scrolls to and highlights.
 *
 * "Opening" a section uses only public surfaces: the `sidebar.settings` slot registration
 * publishes its shell store, whose actions expose `openSection(id)`. Every step is probed
 * and falls back to a narrower behaviour rather than assuming an internal host shape.
 */
import type { HostContext, Translate } from '../host';
import { clickHostSettingsTrigger } from './dom';

/** The id dsh-tac registers its own settings section under. */
export const PLUGIN_SECTION_ID = 'project-board-settings';

export type SettingOrigin = 'host' | 'plugin';

export interface SettingEntry {
  /** Stable id, unique across both origins. */
  id: string;
  title: string;
  /** Extra search terms (already lower-cased, zh + en). Not user-visible copy. */
  keywords: string;
  origin: SettingOrigin;
  /** `settings.section` id handed to `openSection`. */
  sectionId: string;
  /** Optional anchor inside the plugin settings page. */
  anchor?: string;
  order: number;
}

export interface SettingsCatalogSnapshot {
  host: SettingEntry[];
  plugin: SettingEntry[];
  seq: number;
}

export const EMPTY_CATALOG: SettingsCatalogSnapshot = { host: [], plugin: [], seq: 0 };

/** Result of trying to open a settings target; surfaced in the log so a degraded path is visible. */
export type SettingsOpenResult = 'section' | 'settings' | 'dom' | 'failed';

/**
 * The host slot ledger returns registration options verbatim. These are the fields we read;
 * everything else is ignored. `label` may be a locale-following thunk, and `store` is the
 * shell store the settings root publishes for its composed props (`useStore` / `actions`).
 */
interface SlotEntryLike {
  options?: {
    id?: string;
    order?: number;
    label?: string | (() => string);
    store?: { create?: () => { actions?: Record<string, unknown> } };
    [key: string]: unknown;
  };
}

const labelOf = (raw: string | (() => string) | undefined): string => {
  if (typeof raw === 'function') {
    try {
      return String(raw());
    } catch (error) {
      return '';
    }
  }
  return raw == null ? '' : String(raw);
};

const entriesOf = (ctx: HostContext, key: string): SlotEntryLike[] => {
  try {
    const slots = ctx.slots as HostContext['slots'] & { entries?: (name: string) => unknown };
    const list = typeof slots.entries === 'function' ? slots.entries(key) : null;
    return (Array.isArray(list) ? list : []) as SlotEntryLike[];
  } catch (error) {
    return [];
  }
};

/** Enumerate host/feature settings sections. The plugin's own section is excluded here. */
export function readHostSections(ctx: HostContext): SettingEntry[] {
  const out: SettingEntry[] = [];
  for (const entry of entriesOf(ctx, 'settings.section')) {
    const options = entry && entry.options;
    if (!options) continue;
    const id = typeof options.id === 'string' ? options.id : '';
    if (!id || id === PLUGIN_SECTION_ID) continue;
    const title = labelOf(options.label) || id;
    out.push({
      id: 'host:' + id,
      title: title,
      // Bare section ids are English ("models", "general"); keep them searchable alongside
      // the localized label, plus the generic words people actually type into a search box.
      keywords: ('设置 偏好 settings preferences ' + id + ' ' + title).toLowerCase(),
      origin: 'host',
      sectionId: id,
      order: typeof options.order === 'number' ? options.order : 0
    });
  }
  return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

interface PluginDef {
  anchor: string;
  labelKey: string;
  /** zh + en search terms; internal index data, not rendered copy. */
  keywords: string;
}

/** Anchors match `data-pbx-setting` attributes added to the plugin settings page sections. */
const PLUGIN_DEFS: PluginDef[] = [
  { anchor: 'shortcuts', labelKey: 'settings.shortcuts', keywords: '快捷键 组合键 键盘 shortcut keyboard hotkey keys' },
  { anchor: 'headerButtons', labelKey: 'settings.headerButtons', keywords: '标题栏 顶部 按钮 header button toolbar' },
  { anchor: 'behavior', labelKey: 'settings.behavior', keywords: '行为 界面 搜索 归档 面板 behavior ui search archived panel' },
  { anchor: 'github', labelKey: 'settings.githubTitle', keywords: 'github 仓库 数据源 令牌 token repo source' },
  { anchor: 'logging', labelKey: 'settings.logging', keywords: '日志 排查 级别 调试 log debug trace level' },
  { anchor: 'data', labelKey: 'settings.data', keywords: '数据 重置 外观 导入 导出 data reset appearance' }
];

export function pluginSettingEntries(t: Translate): SettingEntry[] {
  return PLUGIN_DEFS.map((def, index) => ({
    id: 'plugin:' + def.anchor,
    title: t(def.labelKey),
    keywords: (def.keywords + ' 项目看板 project board').toLowerCase(),
    origin: 'plugin' as SettingOrigin,
    sectionId: PLUGIN_SECTION_ID,
    anchor: def.anchor,
    order: index
  }));
}

/**
 * Open the host Settings dialog, ideally already showing `sectionId`.
 *
 * 1. `sidebar.settings` publishes its shell store; `actions.openSection(id)` opens AND selects.
 * 2. `actions.open()` still gets the reader into Settings, just without the section selected.
 * 3. Clicking the host's own sidebar Settings control is the last resort (host DOM probes
 *    live in `core/dom.ts`, per the project rule).
 *
 * Returns which path worked so the caller can log it and tell the user when only (3)/(4) happened.
 */
export function openSettingsTarget(ctx: HostContext, sectionId: string): SettingsOpenResult {
  for (const entry of entriesOf(ctx, 'sidebar.settings')) {
    const store = entry && entry.options && entry.options.store;
    const instance = store && typeof store.create === 'function' ? store.create() : null;
    const actions = instance && instance.actions;
    if (!actions) continue;
    if (typeof actions.openSection === 'function') {
      try {
        (actions.openSection as (id: string) => void)(sectionId);
        return 'section';
      } catch (error) {
        /* try the narrower path */
      }
    }
    if (typeof actions.open === 'function') {
      try {
        (actions.open as () => void)();
        return 'settings';
      } catch (error) {
        /* try the DOM fallback */
      }
    }
  }
  if (clickHostSettingsTrigger()) return 'dom';
  return 'failed';
}
