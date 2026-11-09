/** Toasts, desktop task notifications and the in-app notification dock. */
import { DEFAULT_SETTINGS } from '../constants';
import type { Translate, UseHook } from '../host';
import { h, useEffect, useRef, useState } from '../runtime';
import type { Settings } from '../types';
import { fallbackHook } from '../core/schedule';
import { Icon } from '../ui/icons';
import { findChatScroller } from './chat-dom';
import { sessionTitleOf } from './format';
import type { SessionListSnapshot, SessionStatusMap } from '../core/snapshot';

export interface ToastItem {
  id: number;
  tone: string;
  title: string;
  message: string;
}

export interface ToastSnapshot {
  items: ToastItem[];
}

export interface ToastStackProps {
  useToasts?: UseHook<ToastSnapshot>;
  dismissToast?: (id: number) => void;
  t: Translate;
}

export function ToastStack(props: ToastStackProps): unknown {
  const { t, dismissToast } = props;
  const useToasts = typeof props.useToasts === 'function' ? props.useToasts : fallbackHook<ToastSnapshot>();
  const snap = useToasts((value) => value);
  const items = (snap && snap.items) || [];
  if (items.length === 0) return null;
  return h(
    'div',
    { className: 'pbx-toasts', role: 'status', 'aria-live': 'polite' },
    items.map((item) =>
      h(
        'div',
        { key: item.id, className: 'pbx-toast', 'data-tone': item.tone || 'warn' },
        h('span', { className: 'pbx-toastIcon' }, h(Icon, { name: item.tone === 'success' ? 'check' : 'alert', size: 15 })),
        h(
          'div',
          { className: 'pbx-toastMain' },
          item.title ? h('div', { className: 'pbx-toastTitle' }, item.title) : null,
          item.message ? h('div', { className: 'pbx-toastMsg' }, item.message) : null
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'pbx-toastClose',
            title: t('toast.dismiss'),
            'aria-label': t('toast.dismiss'),
            onClick: () => {
              if (typeof dismissToast === 'function') dismissToast(item.id);
            }
          },
          h(Icon, { name: 'close', size: 12 })
        )
      )
    )
  );
}

let notificationAudio: AudioContext | null = null;

export function playNotifyChime(): void {
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (!notificationAudio) notificationAudio = new Ctor();
    const context = notificationAudio;
    if (context.state === 'suspended') {
      try {
        void context.resume();
      } catch (error) {
        /* ignore */
      }
    }
    const start = context.currentTime + 0.01;
    [880, 1174.66].forEach((frequency, index) => {
      const at = start + index * 0.13;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.34);
    });
  } catch (error) {
    /* ignore */
  }
}

export function notificationChannelFocused(): boolean {
  try {
    return document.visibilityState === 'visible' && document.hasFocus();
  } catch (error) {
    return true;
  }
}

export function showSystemNotification(
  title: string,
  body: string,
  sessionId: string | undefined,
  onOpen: (() => void) | null
): boolean {
  try {
    const Ctor = window.Notification as (typeof Notification & { permission?: NotificationPermission; requestPermission?: () => Promise<NotificationPermission> }) | undefined;
    if (typeof Ctor !== 'function') return false;
    const present = (): boolean => {
      try {
        const note = new Ctor(title, { body: body, tag: String(sessionId || 'dsh-task') });
        note.onclick = () => {
          try {
            window.focus();
          } catch (error) {
            /* ignore */
          }
          if (typeof onOpen === 'function') onOpen();
          try {
            note.close();
          } catch (error) {
            /* ignore */
          }
        };
        return true;
      } catch (error) {
        return false;
      }
    };
    if (Ctor.permission === 'granted') return present();
    if (Ctor.permission === 'default' && typeof Ctor.requestPermission === 'function') {
      Ctor.requestPermission()
        .then((result) => {
          if (result === 'granted') present();
        })
        .catch(() => {});
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

export interface PendingOption {
  label?: string;
  description?: string;
}

/**
 * Human-readable text for an approval reason, which the host may supply as a plain string, a
 * `{en, zh}` pair, or a message object. Rendering it with String() produced `[object Object]`
 * in the notification body.
 */
export function approvalReasonText(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'text', 'label', 'reason', 'description', 'summary']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
    /* Prefer the Chinese copy: this UI is Chinese-first, and the pair is all the host gives. */
    for (const key of ['zh', 'en']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }
  return '';
}

/** Readable failure text from a resident session snapshot, or '' when it did not fail. */
export function sessionFailureReason(snapshot: unknown): string {
  if (!snapshot || typeof snapshot !== 'object') return '';
  const record = snapshot as Record<string, unknown>;
  const lastAgentError = record.lastAgentError;
  if (typeof lastAgentError === 'string' && lastAgentError.trim()) return lastAgentError.trim().slice(0, 240);
  const promptError = record.promptError as { error?: { message?: unknown } } | null;
  const message = promptError && promptError.error ? promptError.error.message : undefined;
  if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 240);
  return '';
}

export interface PendingQuestion {
  question?: string;
  options?: PendingOption[];
  multiSelect?: boolean;
}

export interface PendingInteraction {
  kind?: string;
  key?: string;
  toolName?: string;
  displayReason?: string;
  reason?: string;
  questions?: PendingQuestion[];
}

/** Full question text plus every option, or the approval reason and choices. */
export function formatPendingNotification(pending: PendingInteraction | null | undefined, title: string, t: Translate): string {
  if (!pending) return '';
  if (pending.kind === 'approval') {
    const reason = approvalReasonText(pending.displayReason) || approvalReasonText(pending.reason);
    return (
      t('notif.approvalBody', { title: title, tool: pending.toolName || '' }) +
      (reason ? '\n' + reason : '') +
      '\n' +
      t('notif.approvalChoices')
    );
  }
  const questions = Array.isArray(pending.questions) ? pending.questions : [];
  const blocks = questions.map((question, index) => {
    const head = (questions.length > 1 ? String(index + 1) + '. ' : '') + String(question.question || '');
    const options = (Array.isArray(question.options) ? question.options : [])
      .map(
        (option, optionIndex) =>
          '  ' + String(optionIndex + 1) + ') ' + String(option.label || '') + (option.description ? ' — ' + String(option.description) : '')
      )
      .join('\n');
    return options ? head + '\n' + options : head;
  });
  const multi = questions.some((question) => question.multiSelect === true) ? '\n' + t('notif.multiSelect') : '';
  return t('notif.pendingPrefix', { title: title }) + (blocks.length > 0 ? '\n' + blocks.join('\n\n') : '') + multi;
}

export interface NotifyPayload {
  tone: string;
  title: string;
  body: string;
  ttl?: number;
  sessionId: string;
}

interface StatusLike {
  running?: boolean;
  completionUnread?: boolean;
  pendingInteraction?: PendingInteraction | null;
}

export interface NotificationWatcherProps {
  useSessions?: UseHook<SessionListSnapshot>;
  useSessionStatus?: UseHook<SessionStatusMap>;
  useSettings?: UseHook<Settings>;
  openSession?: (id: string) => void;
  notify?: (payload: NotifyPayload) => void;
  system?: (title: string, body: string, sessionId: string | undefined, onOpen: (() => void) | null) => boolean;
  /** Readable failure text for a session that just stopped running; '' means it completed. */
  failureOf?: (sessionId: string) => string;
  t: Translate;
}

interface StatusEntry {
  status: StatusLike | null | undefined;
  pending: PendingInteraction | null;
  sig: string;
}

export function NotificationWatcher(props: NotificationWatcherProps): unknown {
  const { t } = props;
  const useSessions = typeof props.useSessions === 'function' ? props.useSessions : fallbackHook<SessionListSnapshot>();
  const useStatus = typeof props.useSessionStatus === 'function' ? props.useSessionStatus : fallbackHook<SessionStatusMap>();
  const useSettings = typeof props.useSettings === 'function' ? props.useSettings : fallbackHook<Settings>();
  const sessionsSnap = useSessions((value) => value);
  const statuses = useStatus((value) => value);
  const config = useSettings((value) => value) || DEFAULT_SETTINGS;
  const previousRef = useRef<Map<string, StatusEntry> | null>(null);
  const configRef = useRef(config);
  configRef.current = config;
  useEffect(() => {
    if (!statuses) return;
    const previous = previousRef.current;
    const next = new Map<string, StatusEntry>();
    statuses.forEach((status, sessionId) => {
      const pending = status ? (status.pendingInteraction as PendingInteraction | null) : null;
      const sig =
        (status && status.running === true ? 'run' : 'idle') +
        '|' +
        (pending ? String(pending.kind) + ':' + String(pending.key || '') : '') +
        '|' +
        (status && status.completionUnread === true ? 'unread' : '');
      next.set(sessionId, { status: status as StatusLike, pending: pending, sig: sig });
    });
    previousRef.current = next;
    if (previous === null) return;
    const settings = configRef.current || DEFAULT_SETTINGS;
    if (settings.notify && settings.notify.enabled === false) return;
    const byId = (sessionsSnap && sessionsSnap.byId) || {};
    const focused = notificationChannelFocused();
    const typing = (function (): boolean {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      return el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable === true;
    })();
    const sound = !(settings.notify && settings.notify.sound === false);
    const openSession = typeof props.openSession === 'function' ? props.openSession : null;
    const emit = typeof props.notify === 'function' ? props.notify : null;
    const send = (sessionId: string, tone: string, title: string, body: string, ttl: number): void => {
      if (!body || !emit) return;
      if (!focused && !typing && typeof props.system === 'function') {
        const delivered = props.system(title, body, sessionId, openSession ? () => openSession(sessionId) : null);
        if (delivered) return;
      }
      emit({ tone: tone, title: title, body: body, ttl: ttl, sessionId: sessionId });
      if (sound) playNotifyChime();
    };
    previous.forEach((prev, sessionId) => {
      const cur = next.get(sessionId);
      if (!cur || !prev) return;
      if (prev.sig === cur.sig) return;
      const title = sessionTitleOf(byId[sessionId], t) || sessionId;
      const prevPending = prev.pending;
      const curPending = cur.pending;
      if (curPending && (!prevPending || prevPending.key !== curPending.key)) {
        const isApproval = curPending.kind === 'approval';
        const head = isApproval ? t('notif.approvalTitle') : t('notif.questionTitle');
        const body = isApproval ? t('notif.approvalSimple', { title: title }) : t('notif.pendingSimple', { title: title });
        send(sessionId, 'warn', head, body, 20000);
        return;
      }
      if (prev.status && prev.status.running === true && cur.status && cur.status.running !== true && !curPending) {
        /* The host clears unning before the turn-error row mounts, so a failed turn used to
           be announced as a completion. Ask for the failure text; only a clean run is a success. */
        const failure = typeof props.failureOf === 'function' ? props.failureOf(sessionId) : '';
        if (failure) {
          send(sessionId, 'error', t('notif.failTitle'), t('notif.failBodyReason', { title: title, reason: failure }), 14000);
          return;
        }
        send(sessionId, 'success', t('notif.completeTitle'), t('notif.completeBody', { title: title }), 9000);
      }
    });
  }, [statuses, sessionsSnap]);
  return null;
}

export interface NotificationItem {
  id: number;
  tone?: string;
  title?: string;
  body?: string;
  sessionId?: string;
}

export interface NotificationSnapshot {
  items: NotificationItem[];
}

export interface NotificationDockProps {
  useNotifications?: UseHook<NotificationSnapshot>;
  dismissNotif?: (id: number) => void;
  openSession?: (id: string) => void;
  t: Translate;
}

export function NotificationDock(props: NotificationDockProps): unknown {
  const { t } = props;
  const useNotifications = typeof props.useNotifications === 'function' ? props.useNotifications : fallbackHook<NotificationSnapshot>();
  const snap = useNotifications((value) => value);
  const items = (snap && snap.items) || [];
  const [bounds, setBounds] = useState({ right: 16, bottom: 16 });
  useEffect(() => {
    if (items.length === 0) return undefined;
    const update = (): void => {
      const scroller = findChatScroller();
      const rect = scroller ? scroller.getBoundingClientRect() : null;
      const right = rect && rect.width > 4 ? Math.max(12, window.innerWidth - rect.right + 12) : 16;
      const composer = document.querySelector('[data-composer-card]');
      const composerRect = composer ? composer.getBoundingClientRect() : null;
      const bottom = composerRect && composerRect.height > 0 ? Math.max(14, Math.round(window.innerHeight - composerRect.top + 8)) : 16;
      setBounds((previous) => (Math.abs(previous.right - right) < 1 && Math.abs(previous.bottom - bottom) < 1 ? previous : { right: right, bottom: bottom }));
    };
    update();
    window.addEventListener('resize', update);
    const timer = window.setInterval(update, 1000);
    return () => {
      window.removeEventListener('resize', update);
      window.clearInterval(timer);
    };
  }, [items.length]);
  if (items.length === 0) return null;
  const open = (item: NotificationItem): void => {
    if (typeof props.openSession === 'function' && item.sessionId) props.openSession(item.sessionId);
    if (typeof props.dismissNotif === 'function') props.dismissNotif(item.id);
  };
  return h(
    'div',
    { className: 'pbx-notifDock', style: { right: bounds.right + 'px', bottom: bounds.bottom + 'px' }, role: 'status', 'aria-live': 'polite' },
    items.map((item) =>
      h(
        'div',
        {
          key: item.id,
          className: 'pbx-notifCard',
          'data-tone': item.tone || 'success',
          role: 'button',
          tabIndex: 0,
          onClick: () => open(item),
          onKeyDown: (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              open(item);
            }
          }
        },
        h(
          'div',
          { className: 'pbx-notifHead' },
          h('span', { className: 'pbx-notifGlyph' }, h(Icon, { name: item.tone === 'success' ? 'check' : 'alert', size: 14 })),
          h('span', { className: 'pbx-notifTitle' }, item.title || ''),
          h(
            'button',
            {
              type: 'button',
              className: 'pbx-notifClose',
              title: t('notif.dismiss'),
              'aria-label': t('notif.dismiss'),
              onClick: (event: Event) => {
                event.stopPropagation();
                if (typeof props.dismissNotif === 'function') props.dismissNotif(item.id);
              }
            },
            h(Icon, { name: 'close', size: 12 })
          )
        ),
        item.body ? h('div', { className: 'pbx-notifBody' }, item.body) : null,
        h('div', { className: 'pbx-notifFoot' }, t('notif.openHint'))
      )
    )
  );
}
