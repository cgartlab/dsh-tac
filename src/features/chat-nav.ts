/** Jumping between user instructions in the rendered conversation. */
import { chatJumpState } from '../core/state';
import { logEvent } from '../core/log';
import { trackTimer } from '../core/lifecycle';
import { findChatScroller, visibleChatFlow } from './chat-dom';

/** Every rendered user-instruction bubble, in document order. */
export function collectUserMessageTargets(): HTMLElement[] {
  const flow = visibleChatFlow() || document;
  let targets: Element[] = Array.prototype.slice.call(flow.querySelectorAll('[data-slot="conversation.chat.user.content"]'));
  if (targets.length === 0) targets = Array.prototype.slice.call(flow.querySelectorAll('[class*="_userRow"]'));
  if (targets.length === 0) {
    const groups = document.querySelectorAll('[data-chat-flow-kind="user"], [data-chat-flow-kind="steering"]');
    for (const group of groups) {
      const bubbles = group.querySelectorAll('[data-slot="conversation.chat.user.content"], [class*="_userRow"]');
      if (bubbles.length > 0) targets.push.apply(targets, bubbles as unknown as Element[]);
      else targets.push(group);
    }
  }
  return targets.filter((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) as HTMLElement[];
}

export function highlightUserTarget(target: HTMLElement | null): void {
  if (!target) return;
  target.scrollIntoView({
    behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'center'
  });
  target.classList.remove('pbx-user-jump-highlight');
  void target.offsetWidth;
  target.classList.add('pbx-user-jump-highlight');
  /* Clearing the highlight touches a host node; keep it inside the tracked timers so a
     teardown does not leave the plugin mutating the host afterwards. */
  trackTimer(() => target.classList.remove('pbx-user-jump-highlight'), 1200);
}

export function findLoadEarlierButton(): HTMLElement | null {
  const candidates = document.querySelectorAll('button, [role="button"]');
  return (
    (Array.prototype.find.call(candidates, (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0 && element.offsetParent !== null;
      if (!visible) return false;
      return /^(加载更早|加载更多历史|Load earlier|Load older|Load previous)/i.test((element.textContent || '').trim());
    }) as HTMLElement | undefined) || null
  );
}

function waitForMoreTargets(previousCount: number, timeout: number): Promise<void> {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (collectUserMessageTargets().length > previousCount || Date.now() - started > timeout) {
        window.clearInterval(timer);
        resolve();
      }
    }, 80);
  });
}

async function loadEarlierThenJump(anchor: HTMLElement, previousCount: number): Promise<void> {
  if (chatJumpState.loading) return;
  chatJumpState.loading = true;
  try {
    const button = findLoadEarlierButton();
    if (!button) {
      highlightUserTarget(anchor);
      chatJumpState.lastTarget = anchor;
      chatJumpState.lastAt = Date.now();
      return;
    }
    button.click();
    await waitForMoreTargets(previousCount, 2500);
    const rows = collectUserMessageTargets();
    const prepended = rows.length - previousCount;
    if (prepended <= 0) {
      highlightUserTarget(anchor);
      chatJumpState.lastTarget = anchor;
      chatJumpState.lastAt = Date.now();
      return;
    }
    const target = rows[prepended - 1] || rows[0];
    highlightUserTarget(target);
    chatJumpState.lastTarget = target;
    chatJumpState.lastAt = Date.now();
  } finally {
    chatJumpState.loading = false;
  }
}

/** Jump to the previous/next user instruction relative to whatever is visible right now. */
export function jumpUserMessage(direction: number): void {
  if (chatJumpState.loading) return;
  const rows = collectUserMessageTargets();
  if (rows.length === 0) {
    logEvent('debug', 'shortcut', 'userJump:no-target', { direction: direction });
    return;
  }
  const scroller = findChatScroller();
  const bounds = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  const viewportTop = Math.max(0, Math.min(bounds.top, window.innerHeight));
  const viewportBottom = Math.max(viewportTop, Math.min(bounds.bottom, window.innerHeight));
  const lastAt = Date.now();
  const recent = lastAt - chatJumpState.lastAt < 700;
  let target: HTMLElement | null = null;
  if (direction < 0) {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (recent && row === chatJumpState.lastTarget) continue;
      if (row.getBoundingClientRect().top < viewportTop - 2) {
        target = row;
        break;
      }
    }
    if (!target) {
      void loadEarlierThenJump(rows[0], rows.length);
      return;
    }
  } else {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (recent && row === chatJumpState.lastTarget) continue;
      if (row.getBoundingClientRect().bottom > viewportBottom + 2) {
        target = row;
        break;
      }
    }
    if (!target) target = rows[rows.length - 1];
  }
  highlightUserTarget(target);
  chatJumpState.lastTarget = target;
  chatJumpState.lastAt = lastAt;
}
