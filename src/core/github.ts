/**
 * GitHub REST data source for the project board's repo-meta columns (open issues, open PRs,
 * latest release).
 *
 * The host exposes no git remote or GitHub credentials to client plugins, so the plugin reads
 * these numbers straight from api.github.com with the user's Personal Access Token (optional
 * for public repos; required for private repos and for a higher rate limit). The functions
 * are pure so the board can call them from an effect and tests can stub the fetch.
 */

export interface RepoStats {
  status: 'loading' | 'ok' | 'error';
  issues?: number;
  prs?: number;
  latestVersion?: string;
  error?: string;
}

type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string>; signal?: AbortSignal }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; headers?: { get(name: string): string | null } }>;

/** GitHub normally answers in well under a second; leave headroom, but never hang forever. */
const REQUEST_TIMEOUT_MS = 8000;

function stripV(tag: string): string {
  return tag.replace(/^v(?=\d)/, '');
}

/** Read the `rel="last"` page number from a GitHub Link header (per_page=1 ⇒ it is the count). */
function countFromLink(link: string | null | undefined): number {
  if (!link) return 0;
  const match = /page=(\d+)>;\s*rel="last"/.exec(link);
  return match ? Number(match[1]) || 0 : 0;
}

function errorFor(status: number): RepoStats {
  let message = `HTTP ${status}`;
  if (status === 404) message = 'repo-not-found';
  else if (status === 401) message = 'token-invalid';
  /* GitHub reports an exhausted rate limit as 403 for the legacy core limit and 429 for
     secondary/abuse limits; both mean "wait and retry", not "the repo is broken". */
  else if (status === 403 || status === 429) message = 'rate-limited';
  return { status: 'error', error: message };
}

/** Resolve a GitHub release tag (e.g. `v0.3.0` → `0.3.0`) into a displayable version. */
export function normalizeVersion(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  return stripV(tag);
}

/**
 * Fetch open-issue count, open-PR count and the latest release tag for one repo.
 * `issues` is the repo's `open_issues_count` minus open PRs, because GitHub counts pull
 * requests inside that figure. Unknown / rate-limited responses map to an error RepoStats
 * so the board can show a hint instead of a wrong zero.
 */
export async function fetchRepoStats(
  owner: string,
  repo: string,
  token?: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<RepoStats> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token.trim()}`;
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  /* Without a deadline a stalled connection leaves the column on "loading…" forever, because
     nothing else in this path ever settles it. */
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer =
    controller && typeof window !== 'undefined' ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : 0;
  const init: { headers?: Record<string, string>; signal?: AbortSignal } = controller ? { headers, signal: controller.signal } : { headers };
  try {
    const [repoRes, pullsRes, releaseRes] = await Promise.all([
      fetchImpl(base, init),
      fetchImpl(`${base}/pulls?state=open&per_page=1`, init),
      fetchImpl(`${base}/releases/latest`, init)
    ]);
    if (!repoRes.ok) {
      // Drain the other two responses so their connections are released, not leaked.
      pullsRes.json().catch((): void => undefined);
      releaseRes.json().catch((): void => undefined);
      return errorFor(repoRes.status);
    }
    if (!pullsRes.ok) {
      repoRes.json().catch((): void => undefined);
      releaseRes.json().catch((): void => undefined);
      return errorFor(pullsRes.status);
    }
    const repoData = (await repoRes.json()) as { open_issues_count?: number };
    let prs = 0;
    // per_page=1 with a Link header gives the exact open-PR count (last page number),
    // which stays correct past 100. Without a Link header there are 0 or 1 open PRs.
    const lastPage = countFromLink(pullsRes.headers ? pullsRes.headers.get('link') : null);
    if (lastPage > 0) {
      prs = lastPage;
    } else {
      const pulls = (await pullsRes.json()) as unknown[];
      prs = Array.isArray(pulls) ? pulls.length : 0;
    }
    let latestVersion: string | undefined;
    if (releaseRes.ok) {
      const release = (await releaseRes.json()) as { tag_name?: string };
      latestVersion = normalizeVersion(release.tag_name);
    }
    const issues = Math.max(0, (repoData.open_issues_count ?? 0) - prs);
    return { status: 'ok', issues, prs, latestVersion };
  } catch (error) {
    /* An aborted request surfaces as AbortError (or whatever the platform names it); report it
       as a timeout so the cell explains itself instead of showing a raw DOMException name. */
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error || '');
    if (/abort/i.test(name) || /abort/i.test(message)) return { status: 'error', error: 'timeout' };
    return { status: 'error', error: message || 'network' };
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}
