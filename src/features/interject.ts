/** Composer focus, caret placement, native "back to bottom" and steering queued messages. */
import { findChatScroller, visibleChatFlow } from './chat-dom';
import { isPaletteOpen } from '../core/dom';
import { trackTimer } from '../core/lifecycle';
import { logEvent } from '../core/log';

const STEER_LABELS = ['插话发送', 'Steer queued message'];

export function queueDockElement(): Element | null {
  return document.querySelector('[data-queue-dock]');
}

/** The Steer button of the earliest still-pending queued row, or null. */
export function earliestSteerButton(): HTMLButtonElement | null {
  const dock = queueDockElement();
  if (!dock) return null;
  const rows = dock.querySelectorAll('li');
  for (const row of rows) {
    if (row.hasAttribute('data-submission-echo')) continue;
    const buttons = Array.prototype.slice.call(row.querySelectorAll('button')) as HTMLButtonElement[];
    if (buttons.length === 0) continue;
    let steer: HTMLButtonElement | null = null;
    for (const button of buttons) {
      const label = button.getAttribute('aria-label') || '';
      if (STEER_LABELS.indexOf(label) >= 0) {
        steer = button;
        break;
      }
    }
    if (!steer) steer = buttons[buttons.length - 1];
    if (!steer) continue;
    if (steer.disabled) return null;
    return steer;
  }
  return null;
}

/** Steer the first queued message into the running turn; expands a collapsed dock once. */
export function interjectEarliestQueued(): boolean {
  const steer = earliestSteerButton();
  if (steer) {
    steer.click();
    return true;
  }
  const dock = queueDockElement();
  if (!dock) return false;
  const header = dock.querySelector('button[aria-controls][aria-expanded="false"]') as HTMLButtonElement | null;
  if (!header || header.disabled) return false;
  header.click();
  /* The queue panel expands asynchronously; the retry must not fire after the plugin was
     torn down, or it clicks a host button nothing is waiting for any more. */
  trackTimer(() => {
    const retry = earliestSteerButton();
    if (retry) retry.click();
  }, 90);
  return true;
}

/** Native "back to bottom" control of the chat view, when it is showing. */
export function findScrollToBottomButton(): HTMLElement | null {
  const labels = ['回到底部', 'Scroll to bottom', 'Back to bottom', 'Jump to latest'];
  const buttons = document.querySelectorAll('button[aria-label]');
  for (const button of buttons) {
    if (button.closest('.pbx-root, .pbx-hud, .pbx-shortcutHints, .pbx-composerButtons')) continue;
    const label = button.getAttribute('aria-label') || '';
    if (!labels.some((text) => label === text || label.indexOf(text) === 0)) continue;
    const rect = button.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return button as HTMLElement;
  }
  return null;
}

/** Put the caret at the end of a composer input, for textarea and contenteditable alike. */
export function moveCaretToEnd(input: HTMLElement | null): boolean {
  if (!input) return false;
  try {
    const textarea = input as HTMLTextAreaElement;
    if (typeof textarea.value === 'string' && typeof textarea.setSelectionRange === 'function') {
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
      return true;
    }
    if (input.isContentEditable) {
      const range = document.createRange();
      range.selectNodeContents(input);
      range.collapse(false);
      const selection = window.getSelection();
      if (!selection) return false;
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
  } catch (error) {
    /* ignore */
  }
  return false;
}

/** Focus the conversation composer and put the caret at the end, without scrolling. */
export function focusComposerInput(): boolean {
  /* The command palette is modal: while it is open the search field owns the caret. */
  if (isPaletteOpen()) return false;
  const card = document.querySelector('[data-composer-card]');
  let input = (card ? card.querySelector('textarea, [contenteditable="true"]') : null) as HTMLElement | null;
  if (!input) {
    input =
      (Array.prototype.find.call(document.querySelectorAll('textarea, [contenteditable="true"]'), (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) as HTMLElement | undefined) || null;
  }
  if (!input) return false;
  try {
    input.focus({ preventScroll: true });
  } catch (error) {
    /* ignore */
  }
  moveCaretToEnd(input);
  return true;
}

/** Scroll the open conversation to its bottom and focus the composer input. */
export function scrollToComposerAndFocus(): void {
  const flow = visibleChatFlow();
  let scrollParent: Element | null = flow;
  while (scrollParent && scrollParent !== document.body) {
    const style = window.getComputedStyle(scrollParent);
    const element = scrollParent as HTMLElement;
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && element.scrollHeight > element.clientHeight + 4) break;
    scrollParent = scrollParent.parentElement;
  }
  if (scrollParent && scrollParent === document.body) scrollParent = null;
  /* The chat view restores a programmatic position, so press its own control first and
     then hold the bottom position across animation frames. */
  const nativeButton = findScrollToBottomButton();
  if (nativeButton) {
    try {
      nativeButton.click();
    } catch (error) {
      /* ignore */
    }
  }
  const target = (scrollParent as HTMLElement | null) || findChatScroller();
  if (!target) logEvent('debug', 'shortcut', 'scrollBottom:no-chat', {});
  if (target) {
    const pin = (left: number): void => {
      const node = target.isConnected ? target : findChatScroller();
      if (!node) return;
      node.scrollTop = node.scrollHeight;
      if (left > 0) window.requestAnimationFrame(() => pin(left - 1));
    };
    pin(30);
  } else if (flow) {
    flow.scrollIntoView({
      block: 'end',
      behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    });
  }
  focusComposerInput();
}
