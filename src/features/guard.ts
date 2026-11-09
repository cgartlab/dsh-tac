/**
 * Keeps the board pane's open/closed state across session switches.
 *
 * The native right sidebar stores that state per session; here a switch only changes the
 * conversation and the pane stays exactly as the user left it.
 */
import type { UseHook } from '../host';
import { useEffect, useMemo, useRef } from '../runtime';
import { logEvent } from '../core/log';
import { fallbackHook } from '../core/schedule';
import type { SessionListSnapshot } from '../core/snapshot';

export interface BoardState {
  open: boolean;
  mode: string | null;
  /** Measured pane width at capture time. The mode bucket cannot express "wider than half but
   *  not fullscreen", so a restore uses this exact value when it is present. */
  width?: number;
}

export interface BoardSessionGuardProps {
  useSessions?: UseHook<SessionListSnapshot>;
  boardStateNow: () => BoardState;
  setBoardState: (state: BoardState) => void;
  intentRecent?: () => boolean;
}

interface GuardState {
  id: string | null;
  state: BoardState;
  settleUntil: number;
}

export function BoardSessionGuard(props: BoardSessionGuardProps): unknown {
  const useSessions = typeof props.useSessions === 'function' ? props.useSessions : fallbackHook<SessionListSnapshot>();
  const snapshot = useSessions((value) => value);
  const byId = (snapshot && snapshot.byId) || {};
  const currentId = useMemo(() => {
    for (const id of Object.keys(byId)) {
      const row = byId[id];
      if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return id;
    }
    return null;
  }, [byId]);
  const stateRef = useRef<GuardState>({ id: null, state: { open: false, mode: null }, settleUntil: 0 });
  const propsRef = useRef(props);
  propsRef.current = props;
  const sameState = (left: BoardState | null | undefined, right: BoardState | null | undefined): boolean => {
    const a = left || { open: false, mode: null };
    const b = right || { open: false, mode: null };
    if (Boolean(a.open) !== Boolean(b.open)) return false;
    if (!a.open) return true;
    if (a.mode !== b.mode) return false;
    /* The mode bucket is coarse on purpose (narrow covers everything up to 460), so two panes
       in the same bucket can still be 40px apart. Only claim "already the same" when the widths
       agree too; otherwise the recorded width the reader chose is silently replaced by whatever
       the bucket happens to restore to. */
    if (typeof a.width === 'number' && typeof b.width === 'number') return Math.abs(a.width - b.width) <= 24;
    return true;
  };

  useEffect(() => {
    if (!currentId) return undefined;
    const api = propsRef.current;
    const previous = stateRef.current;
    if (previous.id === currentId) return undefined;
    const want = previous.id === null ? api.boardStateNow() : previous.state;
    stateRef.current = { id: currentId, state: want, settleUntil: Date.now() + 3000 };
    if (previous.id === null) return undefined;
    let enforceTimer = 0;
    /* Restoring may only toggle the pane ONCE. Every extra attempt is a second toggle, and
       the host's own per-session state can move the pane between our probe and our action —
       that pair of toggles is exactly the visible "bouncing" on session switches. One
       action, one confirmation probe, then accept whatever the host decided. */
    let acted = false;
    const enforce = (): void => {
      const live = propsRef.current;
      if (typeof live.intentRecent === 'function' && live.intentRecent()) {
        stateRef.current = { id: currentId, state: live.boardStateNow(), settleUntil: Date.now() + 500 };
        return;
      }
      const observed = live.boardStateNow();
      if (sameState(observed, want)) {
        stateRef.current = { id: currentId, state: want, settleUntil: Date.now() + 500 };
        return;
      }
      if (acted) {
        /* We already moved it once and the host overrode us. Chasing it further is the
           bounce; keep the observed state so the next real toggle restarts from truth. */
        logEvent('info', 'board', 'restore kept host state', {
          want: want as unknown as Record<string, unknown>,
          observed: observed as unknown as Record<string, unknown>
        });
        stateRef.current = { id: currentId, state: observed, settleUntil: Date.now() + 500 };
        return;
      }
      acted = true;
      logEvent('info', 'board', 'restore after switch', want as unknown as Record<string, unknown>);
      live.setBoardState(want);
      /* One confirmation probe far enough out for the host's own transition to settle. */
      enforceTimer = window.setTimeout(enforce, 260);
    };
    /* Wait for the host to finish its own session-switch work before touching the pane. */
    enforceTimer = window.setTimeout(enforce, 320);
    return () => window.clearTimeout(enforceTimer);
  }, [currentId]);

  /* Refresh the remembered state from real user toggles while the session is stable. */
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = stateRef.current;
      if (Date.now() < current.settleUntil) return;
      const live = propsRef.current;
      if (!live || typeof live.boardStateNow !== 'function') return;
      stateRef.current = { id: current.id, state: live.boardStateNow(), settleUntil: current.settleUntil };
    }, 450);
    return () => window.clearInterval(timer);
  }, []);
  return null;
}
