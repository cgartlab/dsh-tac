/**
 * Hold-to-scroll the conversation: a tap jumps between user instructions, holding scrolls
 * continuously, prefetching older history before the boundary and falling back to anchor
 * stepping when the chat view reverts a position write.
 */
import { logEvent } from '../core/log';
import { findLoadEarlierButton, jumpUserMessage } from './chat-nav';
import { findChatScroller, visibleChatFlow } from './chat-dom';
import { focusComposerInput } from './interject';

const HOLD_SCROLL_DELAY = 300;

interface HoldScrollState {
  dir: number;
  code: string;
  mode: 'pending' | 'running' | 'done';
  timer: number;
  raf: number;
  speed: number;
  last: number;
  scroller: HTMLElement | null;
  restore: (() => void) | null;
  poll?: number;
  loading?: boolean;
  awaitingOlder?: boolean;
  exhausted?: boolean;
  stall?: number;
  retries?: number;
  pauseUntil?: number;
  bottomFocused?: boolean;
  kicked?: boolean;
}

let holdScrollState: HoldScrollState | null = null;
/** Injected by apply(): whether the user allows automatic history loading. */
let autoHistoryGate: (() => boolean) | null = null;

/** Stop the hold loop; a short tap (still pending) falls back to the message jump. */
export function stopHoldScroll(allowJump: boolean): void {
  const state = holdScrollState;
  if (!state) return;
  holdScrollState = null;
  window.clearTimeout(state.timer);
  if (state.poll) window.clearInterval(state.poll);
  if (state.raf) window.cancelAnimationFrame(state.raf);
  if (typeof state.restore === 'function') {
    try {
      state.restore();
    } catch (error) {
      /* ignore */
    }
  }
  if (allowJump && state.mode === 'pending') jumpUserMessage(state.dir);
  if (state.dir > 0 && state.bottomFocused) focusComposerInput();
}

function startHoldLoop(state: HoldScrollState): void {
  const initial = findChatScroller();
  if (!initial) {
    logEvent('debug', 'shortcut', 'hold:no-chat', { dir: state.dir });
    return;
  }
  state.mode = 'running';
  state.scroller = initial;
  state.speed = 9;
  state.loading = false;
  state.awaitingOlder = false;
  state.exhausted = false;
  state.stall = 0;
  state.retries = 0;
  state.pauseUntil = 0;
  state.poll = 0;
  state.bottomFocused = false;
  state.last = window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
  const previousBehavior = initial.style.scrollBehavior;
  initial.style.scrollBehavior = 'auto';
  state.restore = () => {
    const node = state.scroller || initial;
    try {
      node.style.scrollBehavior = previousBehavior;
    } catch (error) {
      /* ignore */
    }
  };

  /* The chat may remount its scroll container while history grows; always use the live node. */
  const current = (): HTMLElement | null => {
    const flow = visibleChatFlow();
    const node = state.scroller;
    if (node && node.isConnected && flow && node.contains(flow)) return node;
    const next = findChatScroller();
    if (next) {
      state.scroller = next;
      state.stall = 0;
    }
    return next;
  };
  const now = (): number =>
    window.performance && typeof window.performance.now === 'function' ? window.performance.now() : Date.now();
  /** Auto-loading older history is a user setting; the hold loop must honour it too. */
  const autoHistoryOn = (): boolean => {
    try {
      return autoHistoryGate ? autoHistoryGate() !== false : true;
    } catch (error) {
      return true;
    }
  };
  const schedule = (): void => {
    state.raf = window.requestAnimationFrame(step);
  };

  /** Click the history button and watch for growth without pausing the loop. */
  const requestOlder = (block?: boolean): boolean => {
    /* The "load history on scroll" setting is off: stop at the boundary instead of clicking
       the host control behind the user's back. */
    if (!autoHistoryOn()) {
      state.exhausted = true;
      return false;
    }
    const node = current();
    if (!node) {
      state.mode = 'done';
      return false;
    }
    const button = findLoadEarlierButton();
    if (!button || (button as HTMLButtonElement).disabled) return false;
    const beforeHeight = node.scrollHeight;
    state.loading = true;
    state.awaitingOlder = block === true;
    const started = now();
    try {
      button.click();
    } catch (error) {
      /* ignore */
    }
    if (state.poll) window.clearInterval(state.poll);
    state.poll = window.setInterval(() => {
      if (holdScrollState !== state || state.mode !== 'running') {
        window.clearInterval(state.poll);
        state.poll = 0;
        return;
      }
      const live = current();
      if (!live) {
        window.clearInterval(state.poll);
        state.poll = 0;
        state.mode = 'done';
        return;
      }
      if (live.scrollHeight > beforeHeight + 8) {
        const grew = live.scrollHeight - beforeHeight;
        window.clearInterval(state.poll);
        state.poll = 0;
        state.loading = false;
        state.awaitingOlder = false;
        if (block === true && live.scrollTop <= 2) live.scrollTop = grew;
        state.last = now();
        return;
      }
      if (now() - started > 2600) {
        window.clearInterval(state.poll);
        state.poll = 0;
        state.loading = false;
        state.awaitingOlder = false;
        state.exhausted = true;
        if (block) state.mode = 'done';
      }
    }, 120);
    return true;
  };

  /** Move up one rendered anchor when plain offset writes are reverted at a fold boundary. */
  const stepUpByAnchor = (): boolean => {
    const node = current();
    if (!node) return false;
    const viewportTop = node.getBoundingClientRect().top;
    const anchors = Array.prototype.slice.call(node.querySelectorAll('[data-chat-anchor-key]')) as HTMLElement[];
    if (anchors.length === 0) return false;
    let index = anchors.length - 1;
    for (let i = 0; i < anchors.length; i += 1) {
      if (anchors[i].getBoundingClientRect().bottom > viewportTop + 4) {
        index = i;
        break;
      }
    }
    const target = anchors[Math.max(0, index - 1)];
    if (!target) return false;
    const before = node.scrollTop;
    try {
      target.scrollIntoView({ block: 'start', behavior: 'auto' });
    } catch (error) {
      return false;
    }
    return Math.abs(node.scrollTop - before) > 1;
  };

  function step(timestamp?: number): void {
    if (holdScrollState !== state || state.mode !== 'running') return;
    const node = current();
    if (!node) {
      state.mode = 'done';
      return;
    }
    const ts = typeof timestamp === 'number' ? timestamp : now();
    const dt = Math.min(50, Math.max(0, ts - state.last));
    state.last = ts;
    if (state.awaitingOlder) {
      schedule();
      return;
    }
    if ((state.pauseUntil as number) > ts) {
      schedule();
      return;
    }
    const frames = dt / 16.6667;
    state.speed = Math.min(30, state.speed + 0.8 * frames);
    const max = Math.max(0, node.scrollHeight - node.clientHeight);
    if (state.dir > 0) {
      if (node.scrollTop >= max - 0.5) {
        /* Holding down past the end means the reader wants to reply: activate the
           composer once, and keep polling so streamed content stays in view. */
        if (!state.bottomFocused) {
          state.bottomFocused = true;
          focusComposerInput();
        }
        state.stall = 0;
        schedule();
        return;
      }
      const before = node.scrollTop;
      node.scrollTop = Math.min(max, before + state.speed * frames);
      if (Math.abs(node.scrollTop - before) < 0.5) {
        state.stall = (state.stall as number) + frames;
      } else {
        state.stall = 0;
      }
      if (node.scrollTop >= max - 0.5 && !state.bottomFocused) {
        state.bottomFocused = true;
        focusComposerInput();
      }
      schedule();
      return;
    }
    /* Prefetch the next history page one screen before the boundary so scrolling never stalls. */
    if (!state.kicked) {
      state.kicked = true;
      /* DSH may still hold a preserved scroll anchor; a wheel signal marks a reader
         gesture so the held scroll can take over. */
      try {
        node.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, deltaMode: 0, bubbles: true, cancelable: true, view: window }));
      } catch (error) {
        /* ignore */
      }
    }
    if (!state.loading && !state.exhausted && node.scrollTop < node.clientHeight * 1.2) requestOlder(false);
    if (node.scrollTop <= 0.5) {
      if (state.exhausted) {
        state.mode = 'done';
        return;
      }
      if (!state.loading) requestOlder(true);
      schedule();
      return;
    }
    const before = node.scrollTop;
    node.scrollTop = Math.max(0, before - state.speed * frames);
    if (Math.abs(node.scrollTop - before) < 0.5) {
      state.stall = (state.stall as number) + frames;
      if ((state.stall as number) > 24) {
        state.stall = 0;
        if (stepUpByAnchor()) {
          state.retries = 0;
          schedule();
          return;
        }
        state.retries = (state.retries as number) + 1;
        if ((state.retries as number) > 6) {
          state.mode = 'done';
          return;
        }
        state.pauseUntil = now() + 260;
      }
    } else {
      state.stall = 0;
      state.retries = 0;
    }
    schedule();
  }
  schedule();
}

export function beginHoldScroll(direction: number, code?: string): void {
  logEvent('debug', 'scroll', 'hold start', { dir: direction });
  stopHoldScroll(false);
  const state: HoldScrollState = {
    dir: direction,
    code: code || '',
    mode: 'pending',
    timer: 0,
    raf: 0,
    speed: 0,
    last: 0,
    scroller: null,
    restore: null
  };
  holdScrollState = state;
  state.timer = window.setTimeout(() => {
    if (holdScrollState === state) startHoldLoop(state);
  }, HOLD_SCROLL_DELAY);
}

/** Key/blur listeners that end a held scroll; installed once per plugin load.
 *  Returns a dispose function so the host can clean them up on hot-reload/unload. */
export function installChatScrollListeners(options?: { autoHistory?: () => boolean }): () => void {
  const previousGate = autoHistoryGate;
  autoHistoryGate = options && typeof options.autoHistory === 'function' ? options.autoHistory : null;
  const onKeyUp = (event: KeyboardEvent): void => {
    const state = holdScrollState;
    if (!state) return;
    if (state.code && event.code !== state.code) return;
    stopHoldScroll(true);
  };
  const onBlur = (): void => {
    stopHoldScroll(false);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (holdScrollState && event.key === 'Escape') stopHoldScroll(false);
  };
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur, true);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    autoHistoryGate = previousGate;
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}
