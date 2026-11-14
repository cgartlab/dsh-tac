/**
 * Live Host catalogs the plugin projects into its own UI: active automation tasks and the
 * Agent-preset roster. Both are small observable sources so components can subscribe.
 */
import type { Disposable, HostContext } from '../host';

export interface ObservableSnapshot<T> {
  getSnapshot(): T;
  subscribe(listener: () => void): Disposable;
}

export interface ScheduleSnapshot {
  status: 'loading' | 'ready' | 'error';
  activeSessionIds: Set<string>;
}

/**
 * One task from `remote.schedule.catalog()`.
 *
 * DSH 0.2.2-rc.3 replaced the flat `sessionId` with a `target` union
 * (`{kind:'session'|'new_once'|'new', sessionId?}`); a `new` target creates a fresh Session
 * per delivery and owns none. Hosts before that release (and the migration path inside the
 * newer one) still carry the flat field, so both shapes are read.
 */
export interface ScheduleRecord {
  status?: string;
  sessionId?: string;
  target?: ({ kind?: string; sessionId?: string } & Record<string, unknown>) | null;
}

/** The Session a task delivers to, or undefined when it owns no fixed Session. */
export function scheduleSessionId(record: ScheduleRecord): string | undefined {
  if (typeof record.sessionId === 'string' && record.sessionId) return record.sessionId;
  const target = record.target;
  if (target && typeof target.sessionId === 'string' && target.sessionId) return target.sessionId;
  return undefined;
}

export interface PresetSnapshot {
  status: 'loading' | 'ready' | 'error';
  names: Record<string, string>;
}

const NO_AUTO = new Set<string>();

function observable<T>(initial: T): {
  source: ObservableSnapshot<T>;
  publish(next: T): void;
} {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }
    },
    publish: (next: T) => {
      snapshot = next;
      for (const listener of listeners) {
        try {
          listener();
        } catch (error) {
          /* ignore */
        }
      }
    }
  };
}

/** Does this Session own at least one active automation task? Reads the same Host catalog the sidebar mark uses. */
export function createScheduleSource(ctx: HostContext): { source: ObservableSnapshot<ScheduleSnapshot>; dispose: Disposable } {
  const { source, publish } = observable<ScheduleSnapshot>({ status: 'loading', activeSessionIds: NO_AUTO });
  let disposed = false;
  let epoch = 0;
  const read = async (): Promise<void> => {
    const current = ++epoch;
    try {
      const result = await ctx.remote.schedule.catalog();
      if (disposed || current !== epoch) return;
      if (result && result.ok) {
        const active = new Set<string>();
        for (const record of result.value || []) {
          if (!record || record.status !== 'active') continue;
          const sessionId = scheduleSessionId(record);
          if (sessionId) active.add(sessionId);
        }
        publish({ status: 'ready', activeSessionIds: active });
      } else {
        publish({ status: 'error', activeSessionIds: source.getSnapshot().activeSessionIds });
      }
    } catch (error) {
      if (!disposed && current === epoch) publish({ status: 'error', activeSessionIds: source.getSnapshot().activeSessionIds });
    }
  };
  const disposers: Disposable[] = [];
  try {
    disposers.push(ctx.on('connection/reset', () => { void read(); }));
  } catch (error) {
    /* ignore */
  }
  try {
    if (ctx.remote && ctx.remote.$on) disposers.push(ctx.remote.$on('schedule/changed', () => { void read(); }));
  } catch (error) {
    /* ignore */
  }
  void read();
  return {
    source,
    dispose: () => {
      disposed = true;
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose();
        } catch (error) {
          /* ignore */
        }
      }
    }
  };
}

/** Load the authoritative Agent-preset roster (id -> display name). */
export function createPresetSource(ctx: HostContext): { source: ObservableSnapshot<PresetSnapshot>; dispose: Disposable } {
  const { source, publish } = observable<PresetSnapshot>({ status: 'loading', names: {} });
  let disposed = false;
  let epoch = 0;
  const read = async (): Promise<void> => {
    const current = ++epoch;
    try {
      const result = await ctx.remote.agentPresets.list();
      if (disposed || current !== epoch) return;
      if (result && result.ok) {
        const names: Record<string, string> = {};
        for (const preset of (result.value && result.value.presets) || []) {
          if (preset && typeof preset.id === 'string' && typeof preset.name === 'string' && preset.name.trim() !== '') {
            names[preset.id] = preset.name.trim();
          }
        }
        publish({ status: 'ready', names: names });
      } else {
        publish({ status: 'error', names: source.getSnapshot().names });
      }
    } catch (error) {
      if (!disposed && current === epoch) publish({ status: 'error', names: source.getSnapshot().names });
    }
  };
  const disposers: Disposable[] = [];
  try {
    disposers.push(ctx.on('connection/reset', () => { void read(); }));
  } catch (error) {
    /* ignore */
  }
  void read();
  return {
    source,
    dispose: () => {
      disposed = true;
      for (const dispose of disposers) {
        try {
          if (typeof dispose === 'function') dispose();
        } catch (error) {
          /* ignore */
        }
      }
    }
  };
}

export const NO_SCHEDULE_HOOK = <T,>(_selector?: (snapshot: unknown) => T): T | null => null;

/** A hook that always reports "nothing", for optional host hooks the plugin can live without. */
export function fallbackHook<S>(): import('../host').UseHook<S> {
  return ((_selector: (snapshot: S) => unknown) => null) as unknown as import('../host').UseHook<S>;
}
