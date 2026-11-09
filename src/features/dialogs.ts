/** The rename dialog and the session-actions dialog (archive / delete). */
import type { Translate, UseHook } from '../host';
import { isComposingEvent } from '../core/combos';
import { fallbackHook } from '../core/schedule';
import { h, useEffect, useRef, useState } from '../runtime';
import { Icon } from '../ui/icons';

export interface RenameSnapshot {
  sessionId?: string | null;
  currentTitle?: string;
  at?: number;
}

export interface RenameStore {
  set(patch: Partial<RenameSnapshot>): void;
}

export interface SessionMenuSnapshot {
  sessionId?: string | null;
  title?: string;
  at?: number;
}

export interface SessionMenuStore {
  set(patch: Partial<SessionMenuSnapshot>): void;
}

export interface ActionResult {
  ok?: boolean;
  error?: { code?: string; message?: string };
}

export interface RenameDialogProps {
  useRename?: UseHook<RenameSnapshot>;
  rename?: RenameStore;
  renameSession?: (sessionId: string, title: string) => Promise<ActionResult | void> | ActionResult | void;
  t: Translate;
}

export function RenameDialog(props: RenameDialogProps): unknown {
  const useRename = typeof props.useRename === 'function' ? props.useRename : fallbackHook<RenameSnapshot>();
  const snap = useRename((value) => value) || {};
  if (!snap.sessionId) return null;
  return h(
    RenameForm,
    Object.assign({}, props, {
      key: snap.sessionId + ':' + (snap.at || 0),
      request: { sessionId: snap.sessionId, currentTitle: snap.currentTitle || '', at: snap.at || 0 }
    })
  );
}

interface RenameRequest {
  sessionId: string;
  currentTitle: string;
  at: number;
}

interface RenameFormProps extends RenameDialogProps {
  request: RenameRequest;
}

function RenameForm(props: RenameFormProps): unknown {
  const { t, request } = props;
  const [draft, setDraft] = useState(request.currentTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const rename = props.rename as RenameStore;
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    if (inputRef.current) {
      inputRef.current.focus({ preventScroll: true });
      inputRef.current.select();
    }
    return () => {
      const opener = openerRef.current;
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        try {
          opener.focus({ preventScroll: true });
        } catch (caught) {
          /* ignore */
        }
      }
    };
  }, []);
  const close = (): void => {
    if (!busy) rename.set({ sessionId: null, currentTitle: '' });
  };
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || busy || isComposingEvent(event)) return;
      event.preventDefault();
      event.stopPropagation();
      rename.set({ sessionId: null, currentTitle: '' });
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy, rename]);
  const trimmed = draft.trim();
  const submit = (): void => {
    if (busy || !trimmed) return;
    setBusy(true);
    setError('');
    Promise.resolve(props.renameSession ? props.renameSession(request.sessionId, trimmed) : { ok: false })
      .then((result) => {
        if (result && result.ok === false) {
          setBusy(false);
          setError((result.error && result.error.message) || t('rename.failed'));
          return;
        }
        rename.set({ sessionId: null, currentTitle: '' });
      })
      .catch((reason: unknown) => {
        setBusy(false);
        setError(((reason as Error) && (reason as Error).message) || t('rename.failed'));
      });
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || isComposingEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
    submit();
  };
  const onCardKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab') return;
    const card = event.currentTarget as HTMLElement;
    const nodes = (Array.prototype.slice.call(card.querySelectorAll('input, button')) as HTMLElement[]).filter(
      (node) => !(node as HTMLButtonElement).disabled && node.getClientRects().length > 0
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return h(
    'div',
    { className: 'pbx-renameBackdrop', onClick: close },
    h(
      'div',
      {
        className: 'pbx-renameCard',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('rename.title'),
        onClick: (event: Event) => event.stopPropagation(),
        onKeyDown: onCardKeyDown
      },
      h('div', { className: 'pbx-renameTitle' }, t('rename.title')),
      h('div', { className: 'pbx-renameLabel' }, t('rename.label')),
      h('input', {
        ref: inputRef,
        className: 'pbx-renameInput',
        value: draft,
        spellCheck: false,
        'aria-label': t('rename.label'),
        placeholder: t('rename.placeholder'),
        onChange: (event: Event) => {
          setDraft((event.target as HTMLInputElement).value);
          if (error) setError('');
        },
        onKeyDown
      }),
      error ? h('div', { className: 'pbx-renameError' }, error) : null,
      h(
        'div',
        { className: 'pbx-renameActions' },
        h('button', { type: 'button', className: 'pbx-renameBtn', disabled: busy, onClick: close }, t('rename.cancel')),
        h(
          'button',
          { type: 'button', className: 'pbx-renameBtn primary', disabled: busy || !trimmed, onClick: submit },
          busy ? t('rename.saving') : t('rename.confirm')
        )
      )
    )
  );
}

export interface SessionMenuDialogProps {
  useSessionMenu?: UseHook<SessionMenuSnapshot>;
  closeSessionMenu?: () => void;
  archiveSession?: (sessionId: string) => Promise<ActionResult | void> | ActionResult | void;
  deleteSession?: (sessionId: string) => Promise<ActionResult | void> | ActionResult | void;
  /** Stop the running turn (`remote.session.cancel`); queued work survives. */
  cancelSession?: (sessionId: string) => Promise<ActionResult | void> | ActionResult | void;
  deleteSupported?: boolean;
  t: Translate;
}

export function SessionMenuDialog(props: SessionMenuDialogProps): unknown {
  const useMenu = typeof props.useSessionMenu === 'function' ? props.useSessionMenu : fallbackHook<SessionMenuSnapshot>();
  const snap = useMenu((value) => value) || {};
  if (!snap.sessionId) return null;
  return h(
    SessionMenuForm,
    Object.assign({}, props, {
      key: snap.sessionId + ':' + String(snap.at || ''),
      sessionId: snap.sessionId,
      sessionTitle: snap.title || ''
    })
  );
}

interface SessionMenuFormProps extends SessionMenuDialogProps {
  sessionId: string;
  sessionTitle: string;
}

function SessionMenuForm(props: SessionMenuFormProps): unknown {
  const { t, sessionId, sessionTitle } = props;
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const cardRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef<HTMLElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const close = (): void => {
    if (typeof props.closeSessionMenu === 'function') props.closeSessionMenu();
  };
  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;
    if (cancelRef.current) cancelRef.current.focus({ preventScroll: true });
    return () => {
      const opener = openerRef.current;
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || isComposingEvent(event) || busy) return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [busy]);
  const run = async (kind: 'archive' | 'delete' | 'cancel'): Promise<void> => {
    if (busy) return;
    if (kind === 'delete' && confirmDelete !== true) {
      setConfirmDelete(true);
      return;
    }
    setError('');
    setBusy(kind);
    try {
      const result =
        kind === 'archive'
          ? await (props.archiveSession ? props.archiveSession(sessionId) : null)
          : kind === 'cancel'
            ? await (props.cancelSession ? props.cancelSession(sessionId) : null)
            : await (props.deleteSession ? props.deleteSession(sessionId) : null);
      const value = result as ActionResult | null;
      if (value && value.ok) {
        close();
        return;
      }
      const code = value && value.error ? value.error.code : '';
      if (kind === 'delete' && (code === 'unsupported' || code === 'unavailable')) {
        setError(t('menu.deleteUnavailable'));
      } else if (kind === 'cancel' && (code === 'unsupported' || code === 'unavailable')) {
        setError(t('menu.stopUnavailable'));
      } else {
        setError(t('menu.failed', { message: (value && value.error && value.error.message) || code || 'failed' }));
      }
    } catch (errorValue) {
      setError(t('menu.failed', { message: String((errorValue as Error) && (errorValue as Error).message ? (errorValue as Error).message : errorValue) }));
    } finally {
      setBusy('');
    }
  };
  const onCardKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !cardRef.current) return;
    const nodes = (Array.prototype.slice.call(cardRef.current.querySelectorAll('button')) as HTMLElement[]).filter(
      (node) => !(node as HTMLButtonElement).disabled && node.getClientRects().length > 0
    );
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const deleteSupported = props.deleteSupported === true;
  return h(
    'div',
    { className: 'pbx-renameBackdrop', onClick: close },
    h(
      'div',
      {
        ref: cardRef,
        className: 'pbx-renameCard',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('menu.title'),
        onClick: (event: Event) => event.stopPropagation(),
        onKeyDown: onCardKeyDown
      },
      h('div', { className: 'pbx-renameTitle' }, t('menu.title')),
      h(
        'div',
        { className: 'pbx-menuSession' },
        h('div', { className: 'pbx-menuSessionLabel' }, t('menu.sessionLabel')),
        h('div', { className: 'pbx-menuSessionTitle', title: sessionTitle || sessionId }, sessionTitle || sessionId)
      ),
      h('div', { className: 'pbx-menuSubtitle' }, t('menu.subtitle')),
      h(
        'button',
        { type: 'button', className: 'pbx-menuOption', disabled: Boolean(busy), onClick: () => void run('archive') },
        h('span', { className: 'pbx-menuOptionIcon archive' }, h(Icon, { name: 'archive', size: 15 })),
        h(
          'span',
          { className: 'pbx-menuOptionBody' },
          h('span', { className: 'pbx-menuOptionTitle' }, busy === 'archive' ? t('menu.busy') : t('menu.archiveTitle')),
          h('span', { className: 'pbx-menuOptionDesc' }, t('menu.archiveDesc'))
        ),
        h('span', { className: 'pbx-menuOptionChev', 'aria-hidden': 'true' }, '›')
      ),
      /* Stopping is offered above deleting: it is the safe step when a turn is stuck. */
      h(
        'button',
        { type: 'button', className: 'pbx-menuOption', disabled: Boolean(busy), onClick: () => void run('cancel') },
        h('span', { className: 'pbx-menuOptionIcon' }, h(Icon, { name: 'alert', size: 15 })),
        h(
          'span',
          { className: 'pbx-menuOptionBody' },
          h('span', { className: 'pbx-menuOptionTitle' }, busy === 'cancel' ? t('menu.busy') : t('menu.stopTitle')),
          h('span', { className: 'pbx-menuOptionDesc' }, t('menu.stopHint'))
        ),
        h('span', { className: 'pbx-menuOptionChev', 'aria-hidden': 'true' }, '›')
      ),
      h(
        'button',
        {
          type: 'button',
          className: 'pbx-menuOption danger',
          disabled: Boolean(busy) || !deleteSupported,
          onClick: () => void run('delete')
        },
        h('span', { className: 'pbx-menuOptionIcon danger' }, h(Icon, { name: 'alert', size: 15 })),
        h(
          'span',
          { className: 'pbx-menuOptionBody' },
          h(
            'span',
            { className: 'pbx-menuOptionTitle' },
            busy === 'delete' ? t('menu.busy') : confirmDelete ? t('menu.deleteConfirm') : t('menu.deleteTitle')
          ),
          h(
            'span',
            { className: 'pbx-menuOptionDesc' },
            !deleteSupported ? t('menu.deleteUnsupportedDesc') : confirmDelete ? t('menu.confirmDesc') : t('menu.deleteDesc')
          )
        ),
        h('span', { className: 'pbx-menuOptionChev', 'aria-hidden': 'true' }, '›')
      ),
      error ? h('div', { className: 'pbx-renameError' }, error) : null,
      h(
        'div',
        { className: 'pbx-menuFoot' },
        h('span', { className: 'pbx-menuFootHint' }, t('menu.footerHint')),
        h('button', { ref: cancelRef, type: 'button', className: 'pbx-renameBtn', disabled: Boolean(busy), onClick: close }, t('menu.cancel'))
      )
    )
  );
}
