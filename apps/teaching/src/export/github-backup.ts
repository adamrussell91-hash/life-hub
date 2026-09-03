export const GITHUB_BACKUP_PATH = 'content_backup/teaching-hub-archive.json';
export const GITHUB_BACKUP_SCHEDULE = '@weekly';

export function githubBackupCommitMessage(createdAt: string): string {
  return `chore(content): Teaching Hub archive snapshot ${createdAt}`;
}

export function parseGithubRepo(repo: string): { owner: string; name: string } | null {
  const match = /^([^/\s]+)\/([^/\s]+)$/.exec(repo.trim());
  if (!match) return null;
  return { owner: match[1]!, name: match[2]! };
}

export function readGithubBackupConfig(env: Record<string, string | undefined>): {
  token: string;
  repo: string;
  branch: string;
} | null {
  const token = env.GITHUB_BACKUP_TOKEN?.trim();
  const repo = env.GITHUB_BACKUP_REPO?.trim();
  if (!token || !repo || !parseGithubRepo(repo)) return null;
  return { token, repo, branch: env.GITHUB_BACKUP_BRANCH?.trim() || 'main' };
}

export interface GithubBackupResult {
  path: string;
  sha: string;
  commit_url: string;
  html_url: string;
}

export class GithubBackupError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'GithubBackupError';
    this.status = status;
  }
}

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export async function putGithubFile(input: {
  token: string;
  repo: string;
  json: unknown;
  branch?: string;
  path?: string;
  fetchImpl?: typeof fetch;
}): Promise<GithubBackupResult> {
  const parsed = parseGithubRepo(input.repo);
  if (!parsed) throw new GithubBackupError('GITHUB_BACKUP_REPO must be owner/name', 503);

  const path = input.path ?? GITHUB_BACKUP_PATH;
  const branch = input.branch || 'main';
  const fetchImpl = input.fetchImpl ?? fetch;
  const apiBase = `https://api.github.com/repos/${parsed.owner}/${parsed.name}/contents/${encodePath(path)}`;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${input.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'teaching-hub'
  };

  const existing = await fetchImpl(`${apiBase}?ref=${encodeURIComponent(branch)}`, {
    method: 'GET',
    headers
  });
  let sha: string | undefined;
  if (existing.ok) {
    const body = (await existing.json()) as { sha?: string };
    if (typeof body.sha === 'string') sha = body.sha;
  } else if (existing.status !== 404) {
    throw new GithubBackupError('Unable to read the GitHub backup file', 502);
  }

  const content = Buffer.from(JSON.stringify(input.json, null, 2), 'utf8').toString('base64');
  const put = await fetchImpl(apiBase, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: githubBackupCommitMessage(
        typeof input.json === 'object' &&
          input.json !== null &&
          'created_at' in input.json &&
          typeof (input.json as { created_at?: unknown }).created_at === 'string'
          ? (input.json as { created_at: string }).created_at
          : new Date().toISOString()
      ),
      content,
      branch,
      ...(sha ? { sha } : {})
    })
  });

  if (!put.ok) {
    throw new GithubBackupError('Unable to commit the GitHub backup', 502);
  }

  const saved = (await put.json()) as {
    content?: { sha?: string; path?: string; html_url?: string };
    commit?: { html_url?: string; sha?: string };
  };
  return {
    path: saved.content?.path ?? path,
    sha: saved.content?.sha ?? saved.commit?.sha ?? '',
    commit_url: saved.commit?.html_url ?? '',
    html_url: saved.content?.html_url ?? ''
  };
}
