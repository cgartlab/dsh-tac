/**
 * Host Service contracts used by the plugin. These mirror the public client surface the
 * harness exposes to client plugins (`ctx.*`); they are typed here instead of imported
 * because the host ships no declaration package for plugin authors.
 */
import type { Settings } from './types';

export interface Disposable {
  (): void;
}

export type Translate = (key: string, params?: Record<string, string | number>) => string;

export interface HostRemoteResult<T> {
  ok?: boolean;
  value?: T;
}

export interface ScheduleRecord {
  status?: string;
  sessionId?: string;
}

export interface AgentPreset {
  id?: string;
  name?: string;
}

export interface HostRemote {
  schedule: { catalog(): Promise<HostRemoteResult<ScheduleRecord[]>> };
  agentPresets: { list(): Promise<HostRemoteResult<{ presets?: AgentPreset[] }>> };
  $on?: (event: string, listener: () => void) => Disposable;
  session?: Record<string, unknown>;
}

export interface HostSidebarRight {
  active?: () => string | undefined;
  isExpanded?: () => boolean;
  openTab(kind: string): void;
  toggleExpanded(): void;
  commandTarget?: () => unknown;
  toggleFullscreen?(target: unknown): void;
  /** Removes the active tab of the current pane. Not always exposed; guarded at the call site. */
  closeTab?: () => void;
}

export interface HostLayout {
  selectPanel(panelId: string | null): void;
  toggleSidebar?: () => void;
  /**
   * DSH 0.2.2-rc.3+ frame-level right sidebar: `track` reserves a resizable grid column and
   * `fullscreen` overlays the frame. On those builds the dock's `toggleExpanded()` alone only
   * flips the panel's own flag, so the column never appears. Older hosts expose neither method
   * and are driven through `sidebarRight` instead.
   */
  openRightbar?: (track: boolean, fullscreen: boolean) => void;
  closeRightbar?: () => void;
  panels?: { toggleSidebar?: () => void; setRightbar?: (px: number) => void };
}

export interface HostLocale {
  register(namespace: string, dicts: { zh: Record<string, string>; en: Record<string, string> }): Disposable;
  bind(namespace: string): Translate;
}

export interface SkillSlotForm {
  kind?: string;
  scope?: string;
}

export interface SlotRegistrationOptions {
  name: string;
  id?: string;
  key?: string;
  order?: number;
  locale?: string;
  label?: () => string;
  inject?: () => Record<string, unknown>;
  children?: Record<string, SkillSlotForm>;
}

export interface HostSlots {
  register(options: SlotRegistrationOptions, component: (props: never) => unknown): Disposable;
  inject(key: string, factory: () => Disposable): Disposable;
  entries?(key: string): Array<{ options?: { key?: string } }>;
}

export interface HostShortcutsCommand {
  id: string;
  label?: () => string;
  aliases?: string[];
  defaults?: Record<string, { code: string; modifiers: string[] }>;
  regions?: string[];
  modals?: string[];
  resolve?: (context: unknown) => { status: string; run?: () => void };
}

export interface HostShortcuts {
  register(command: HostShortcutsCommand): Disposable;
  catalog?: { getSnapshot?: () => unknown; subscribe?: (listener: () => void) => Disposable };
  $config?: unknown;
}

export interface HostContext {
  slots: HostSlots;
  locale: HostLocale;
  sidebarRight: HostSidebarRight;
  sidebarRightTabs: { register(spec: Record<string, unknown>): Disposable };
  layout: HostLayout;
  uiWorkspace?: { openSession(target: unknown): void };
  remote: HostRemote;
  effect(factory: () => void | Disposable, label?: string): Disposable;
  on(event: string, listener: (...args: unknown[]) => void): Disposable;
  get(name: string): unknown;
  shortcuts?: HostShortcuts;
  [extra: string]: unknown;
}

/** Settings store handed to the plugin's own components by the host slot system. */
export interface SettingsStore {
  getSnapshot(): Settings;
  subscribe(listener: () => void): Disposable;
  set(patch: Partial<Settings>): void;
}

/** Host component hooks: `useX(selector)` reads a snapshot and re-renders on change. */
export type UseHook<S> = <R>(selector: (snapshot: S) => R) => R;
