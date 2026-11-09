/** Label/tone formatting shared by the board and the floating list. */
import type { Translate } from '../host';
import type { SessionStatusLike } from '../core/snapshot';

export type { SessionStatusLike };

export interface SessionSummaryLike {
  id?: string;
  title?: string;
  running?: boolean;
  updatedAt?: number;
}

export type Tone = 'attention' | 'running' | 'done' | 'idle';

export interface StatusInfo {
  tone: Tone;
  labelKey: string;
  rank: number;
}

export function workspaceLabel(title: string | undefined, t: Translate): string {
  if (!title || title === 'default-workspace') return t('workspace.default');
  return title;
}

export function sessionTitleOf(summary: { title?: string } | null | undefined, t: Translate): string {
  const title = summary && typeof summary.title === 'string' ? summary.title.trim() : '';
  return title || t('session.untitled');
}

export function statusInfo(status: SessionStatusLike | null | undefined, summary: SessionSummaryLike | null | undefined): StatusInfo {
  const kind = status && status.pendingInteraction ? status.pendingInteraction.kind : undefined;
  if (kind === 'approval') return { tone: 'attention', labelKey: 'status.approval', rank: 4 };
  if (kind === 'plan-review') return { tone: 'attention', labelKey: 'status.plan', rank: 4 };
  if (kind === 'question') return { tone: 'attention', labelKey: 'status.question', rank: 4 };
  const running = status ? status.running : undefined;
  if (running === undefined ? summary && summary.running : running) return { tone: 'running', labelKey: 'status.running', rank: 3 };
  if (status && status.completionUnread) return { tone: 'done', labelKey: 'status.done', rank: 2 };
  return { tone: 'idle', labelKey: 'status.idle', rank: 1 };
}

export function relTime(updatedAt: number | undefined, t: Translate): string {
  if (!updatedAt) return '—';
  const diff = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('time.now');
  if (minutes < 60) return t('time.min', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('time.hour', { n: hours });
  const days = Math.floor(hours / 24);
  /* Past a year, "1635 days" stops telling anyone anything useful. */
  if (days < 365) return t('time.day', { n: days });
  return t('time.year', { n: Math.floor(days / 365) });
}

/** Project attributes that can be shown as columns in the board's project table.
 *  The four "repo meta" columns (issues/prs/localVersion/latestVersion) have no live
 *  data source yet (the host does not expose them to client plugins); they render a
 *  `—` placeholder and are the seam a future host capability can fill. */
export interface ProjectColumn {
  key: string;
  labelKey: string;
  type: string;
  hintKey: string;
}

export const PROJECT_COLUMNS: ProjectColumn[] = [
  { key: 'total', labelKey: 'settings.pc.total', type: '#', hintKey: 'col.hint.total' },
  { key: 'issues', labelKey: 'settings.pc.issues', type: '#', hintKey: 'col.hint.issues' },
  { key: 'prs', labelKey: 'settings.pc.prs', type: '#', hintKey: 'col.hint.prs' },
  { key: 'localVersion', labelKey: 'settings.pc.localVersion', type: '#', hintKey: 'col.hint.localVersion' },
  { key: 'latestVersion', labelKey: 'settings.pc.latestVersion', type: '#', hintKey: 'col.hint.latestVersion' },
  { key: 'lastUpdated', labelKey: 'settings.pc.lastUpdated', type: '◷', hintKey: 'col.hint.lastUpdated' }
];

/** Compare dotted version strings numerically, so `1.10` sorts after `1.9` (a plain
 *  `localeCompare` would put `1.10` before `1.9`). Unknown/`—` sorts last. */
export function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const aParts = parseVersion(a);
  const bParts = parseVersion(b);
  if (aParts === null && bParts === null) return 0;
  if (aParts === null) return 1;
  if (bParts === null) return -1;
  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    const x = aParts[i] || 0;
    const y = bParts[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function parseVersion(value: string | null | undefined): number[] | null {
  if (!value) return null;
  const match = /^[vV]?(\d+(?:\.\d+)*)/.exec(value.trim());
  if (!match) return null;
  return match[1].split('.').map((part) => Number(part) || 0);
}

export const SORT_DIR_DEFAULT: Record<string, 'asc' | 'desc'> = {
  title: 'asc',
  project: 'asc',
  status: 'desc',
  kind: 'asc',
  running: 'desc',
  current: 'desc',
  preset: 'asc',
  updatedAt: 'desc',
  name: 'asc',
  appearance: 'asc',
  total: 'desc',
  issues: 'desc',
  prs: 'desc',
  localVersion: 'desc',
  latestVersion: 'desc',
  lastUpdated: 'desc'
};
