/** DOM-level questions the plugin asks the native shell: dialogs, the sidebar frame, pointers. */

/* ------------------------------------------------------------------------------------
 * Host structure probes.
 *
 * Everything below reads DSH's own markup, which the host does not publish as an API. The
 * official guidance is to take layout from slots and services instead; where the host
 * exposes no equivalent (right-pane geometry, fullscreen flag, the conversation column
 * width) a probe is the only option. Keeping every such selector in this one module means
 * a host rename is a single-file fix, and each probe already degrades to a safe default
 * (`false` / `0` / `null`) rather than throwing, so an unknown host build loses the feature
 * instead of breaking the page.
 * ---------------------------------------------------------------------------------- */

/** The right pane element; the host marks it in both its expanded and collapsed states. */
const rightPanelElement = (): Element | null => {
  try {
    return document.querySelector('[class*="_panel"][data-sidebar-right-open]');
  } catch (error) {
    return null;
  }
};

/**
 * Whether the right pane is expanded.
 *
 * The `data-sidebar-right-open` attribute is present in BOTH states, so testing for its
 * existence reads a collapsed pane as open. Only the value decides: absence or an explicit
 * falsy value means collapsed, while a bare attribute (empty string) is how React renders a
 * true boolean.
 */
export function isRightPanelExpanded(): boolean {
  const panel = rightPanelElement();
  if (!panel) return false;
  let value: string | null = null;
  try {
    value = panel.getAttribute('data-sidebar-right-open');
  } catch (error) {
    return false;
  }
  if (value === null) return false;
  const normalized = value.trim().toLowerCase();
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off';
}

/** The right pane's rendered width in CSS pixels, or 0 when it is not rendered. */
export function hostRightbarWidth(): number {
  try {
    const column = document.querySelector('[data-rightbar-col]') || document.querySelector('[class*="_rightbarCol"]');
    const own = column ? column.getBoundingClientRect().width : 0;
    if (own > 0) return own;
    const panel = rightPanelElement();
    return panel ? panel.getBoundingClientRect().width : 0;
  } catch (error) {
    return 0;
  }
}

/** Whether the right pane is currently showing fullscreen. */
export function isRightbarFullscreen(): boolean {
  try {
    return Boolean(document.querySelector('[data-sidebar-right-panel="fullscreen"]')) || Boolean(document.querySelector('[data-rightbar-fullscreen]'));
  } catch (error) {
    return false;
  }
}

/** The right pane's width-tracking column element, for a ResizeObserver. */
export function rightbarColumnElement(): Element | null {
  try {
    return document.querySelector('[data-rightbar-col]');
  } catch (error) {
    return null;
  }
}

/**
 * Width of the host's centre column (the conversation area).
 *
 * It is a real `minmax(0,1fr)` grid track that shrinks on window resize, sidebar collapse or
 * right-pane open, so it is the only stable signal for header layout: the slot anchor is
 * `display:contents` (no box) and measuring the plugin's own row would feed back into the
 * fold decision.
 */
export function hostCentreColumnWidth(): number {
  try {
    const box = document.querySelector('[class*="_centerCol"]') || document.querySelector('[class*="_frame"]');
    return box ? Math.round(box.getBoundingClientRect().width) : 0;
  } catch (error) {
    return 0;
  }
}

/** The element to observe for centre-column width changes, if the host renders one. */
export function centreColumnElement(): Element | null {
  try {
    return document.querySelector('[class*="_centerCol"]') || document.querySelector('[class*="_frame"]');
  } catch (error) {
    return null;
  }
}

/** Whether `node` sits inside the host's conversation column. */
export function isInsideCentreColumn(node: Element | null): boolean {
  try {
    return Boolean(node && node.closest && node.closest('[class*="_centerCol"]'));
  } catch (error) {
    return false;
  }
}

/** The host's frame element — the grid that carries the sidebar column and its flags. */
export function sidebarFrameElement(): HTMLElement | null {
  try {
    return (
      (document.querySelector('[class*="_frame"][style*="grid-template-columns"]') as HTMLElement | null) ||
      (document.querySelector('[data-sidebar-collapsed]') as HTMLElement | null)
    );
  } catch (error) {
    return null;
  }
}

/** The native session-list column element, if the host renders one. */
export function sidebarColumnElement(): Element | null {
  try {
    const own = document.querySelector('[class*="_sidebarCol"]');
    if (own) return own;
    const frame = sidebarFrameElement();
    return frame ? frame.firstElementChild : null;
  } catch (error) {
    return null;
  }
}

/** Host attributes that change when the sidebar/pane layout changes, for a MutationObserver. */
export const HOST_LAYOUT_ATTRIBUTES = ['data-sidebar-collapsed', 'data-sidebar-right-open', 'data-rightbar-collapsed', 'data-rightbar-fullscreen'];

/**
 * Whether the plugin's own command palette is on screen.
 *
 * The palette is modal and owns the keyboard while open. Anything that would move focus into
 * the conversation (the composer helpers behind a shortcut) has to stand down, otherwise it
 * pulls the caret out of the search field mid-word.
 */
export function isPaletteOpen(): boolean {
  try {
    return Boolean(document.querySelector('.pbx-paletteBackdrop'));
  } catch (error) {
    return false;
  }
}

/**
 * The host's own collapsed flag on the frame, or null when there is no frame to read.
 * Preferred over measured widths because it describes the layout's target state and so does
 * not read "collapsed" halfway through the width animation.
 */
export function sidebarCollapsedFlag(): boolean | null {
  const frame = sidebarFrameElement();
  if (!frame) return null;
  try {
    return frame.hasAttribute('data-sidebar-collapsed');
  } catch (error) {
    return null;
  }
}

/* The plugin's own palette is aria-modal too, but it owns its keys: it must not suppress
   Alt+K (close) or Alt+I / Alt+, (move). Only real dialogs block shortcuts. */
export function hasBlockingDialog(): boolean {
  try {
    const nodes = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
    for (const node of nodes) {
      if (node.getClientRects().length === 0) continue;
      if (node.getAttribute('data-pbx-overlay') === 'palette') continue;
      if (node.closest && node.closest('.pbx-paletteBackdrop')) continue;
      /* Below ~768px DSH renders the native left sidebar as a modal drawer and keeps its own
         toggle alive for exactly that state (`modals: ["sidebar"]` in its shortcut registry).
         Mirror that: the shortcut that opens the sidebar must be able to close it again. */
      if (node.getAttribute('data-shortcut-modal') === 'sidebar') continue;
      return true;
    }
  } catch (error) {
    /* ignore */
  }
  return false;
}

export interface SidebarSignature {
  track: number | null;
  collapsed: boolean;
}

/** The native frame's own view of the left sidebar: the first grid track (its column width)
 *  plus the collapsed flag. Used to prove a toggle actually moved the layout. */
export function sidebarSignature(): SidebarSignature | null {
  try {
    const frame =
      document.querySelector('[class*="_frame"][style*="grid-template-columns"]') || document.querySelector('[data-sidebar-collapsed]');
    if (!frame) return null;
    const template = ((frame as HTMLElement).style && (frame as HTMLElement).style.gridTemplateColumns) || '';
    const first = parseFloat(template);
    return {
      track: Number.isFinite(first) ? Math.round(first) : null,
      collapsed: frame.hasAttribute('data-sidebar-collapsed')
    };
  } catch (error) {
    return null;
  }
}

export interface PointerLike {
  ctrlKey?: boolean;
  button?: number;
  pointerId?: number;
  clientX: number;
  clientY: number;
  screenX?: number;
  currentTarget: EventTarget & { getBoundingClientRect(): DOMRect };
  preventDefault(): void;
  stopPropagation(): void;
}

export function pointerViewX(event: PointerLike): number {
  const screenX = typeof event.screenX === 'number' && event.screenX !== 0 ? event.screenX : event.clientX + window.screenX;
  return screenX - window.screenX;
}

/**
 * Last-resort "open Settings" action: click the host's own sidebar Settings control.
 *
 * The settings shell publishes `openSection` through its `sidebar.settings` slot store, and
 * `core/settings-catalog.ts` uses that first. This probe is only for hosts where the ledger
 * does not expose the store. It deliberately keys off the accessible name and dialog hint
 * rather than hashed CSS classes, and returns false (never throws) when no control matches,
 * so an unknown host build simply loses the fallback.
 */
export function clickHostSettingsTrigger(): boolean {
  try {
    const nodes = Array.prototype.slice.call(
      document.querySelectorAll('button[aria-haspopup="dialog"]')
    ) as HTMLElement[];
    const hit = nodes.find((node) => {
      const label = ((node.getAttribute('aria-label') || node.textContent || '') + '').trim();
      return /设置|偏好|设定|settings|preferences/i.test(label);
    });
    if (!hit) return false;
    hit.click();
    return true;
  } catch (error) {
    return false;
  }
}

export interface DropPosition {
  side: 'left' | 'right';
  index: number;
}

export function headerDropPosition(id: string, clientX: number): DropPosition {
  const side: 'left' | 'right' = clientX > window.innerWidth * 0.55 ? 'right' : 'left';
  const selector =
    side === 'right' ? '.pbx-navRight .pbx-navItem[data-hb-id]' : '.pbx-nav:not(.pbx-navRight) .pbx-navItem[data-hb-id]';
  let index = 0;
  const nodes = document.querySelectorAll(selector);
  for (const node of nodes) {
    const siblingId = node.getAttribute('data-hb-id');
    if (!siblingId || siblingId === id) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    if (rect.left + rect.width / 2 < clientX) index += 1;
    else break;
  }
  return { side: side, index: index };
}
