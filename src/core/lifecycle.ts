/**
 * Deferred work that must not run after the plugin is torn down.
 *
 * Several paths schedule a follow-up a frame or two later: resize the board pane once the
 * host's own transition settles, click the queue's steer button after its panel expands,
 * clear a highlight we added to a host node. Those timers outlive an unload: disabling or
 * hot-reloading the plugin used to let them fire afterwards — resizing a pane, leaving
 * fullscreen, or clicking a host button in a session that no longer has this plugin.
 *
 * Everything deferred is registered here so a single teardown drains all of it. A hot reload
 * re-arms the module: `setDisposed(false)` runs on mount and the previous instance's pending
 * work is already gone.
 */

let disposed = false;
const timers = new Set<number>();

/** Mark the plugin live (on mount) or torn down (on teardown, draining pending work). */
export function setDisposed(value: boolean): void {
  disposed = value;
  if (!value) return;
  for (const id of timers) window.clearTimeout(id);
  timers.clear();
}

export function isDisposed(): boolean {
  return disposed;
}

/**
 * Run `run` after `delay`, unless the plugin was torn down meanwhile. Returns the timer id for
 * a caller that may want to supersede it with {@link cancelTimer}.
 */
export function trackTimer(run: () => void, delay: number): number {
  if (disposed) return 0;
  const id = window.setTimeout(() => {
    timers.delete(id);
    if (disposed) return;
    try {
      run();
    } catch (error) {
      /* ignore */
    }
  }, delay);
  timers.add(id);
  return id;
}

/** Drop a scheduled follow-up: a newer one supersedes it. */
export function cancelTimer(id: number): void {
  if (!id) return;
  window.clearTimeout(id);
  timers.delete(id);
}
