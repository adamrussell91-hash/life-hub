import { describe, expect, it, vi } from 'vitest';
import {
  GITHUB_BACKUP_PATH,
  GITHUB_BACKUP_SCHEDULE,
  githubBackupCommitMessage,
  parseGithubRepo,
  putGithubFile,
  readGithubBackupConfig
} from '@/export/github-backup';

describe('GitHub backup helpers', () => {
  it('targets a content_backup JSON path and a snapshot commit message', () => {
    expect(GITHUB_BACKUP_PATH).toBe('content_backup/teaching-hub-archive.json');
    expect(githubBackupCommitMessage('2026-08-15T00:00:00.000Z')).toContain(
      '2026-08-15T00:00:00.000Z'
    );
    expect(parseGithubRepo('adam/teaching-hub-content')).toEqual({
      owner: 'adam',
      name: 'teaching-hub-content'
    });
    expect(parseGithubRepo('nope')).toBeNull();
    expect(GITHUB_BACKUP_SCHEDULE).toBe('@weekly');
    expect(
      readGithubBackupConfig({
        GITHUB_BACKUP_TOKEN: 'ghp_secret',
        GITHUB_BACKUP_REPO: 'adam/teaching-hub-content'
      })
    ).toEqual({
      token: 'ghp_secret',
      repo: 'adam/teaching-hub-content',
      branch: 'main'
    });
    expect(readGithubBackupConfig({})).toBeNull();
  });

  it('creates then updates a file without sending secrets in the commit body', async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, body });
      if (method === 'GET') {
        if (calls.filter((c) => c.method === 'GET').length === 1) {
          return new Response('Not Found', { status: 404 });
        }
        return Response.json({ sha: 'abc123' });
      }
      return Response.json({
        content: { sha: 'def456', path: GITHUB_BACKUP_PATH, html_url: 'https://github.com/x' },
        commit: { html_url: 'https://github.com/x/commit/1', sha: 'c1' }
      });
    });

    const pack = { kind: 'archive', product: 'Teaching Hub', token: undefined };
    const created = await putGithubFile({
      token: 'ghp_secret',
      repo: 'adam/teaching-hub-content',
      json: pack,
      fetchImpl
    });
    expect(created.path).toBe(GITHUB_BACKUP_PATH);
    expect(created.commit_url).toContain('commit');
    const putBody = calls.find((c) => c.method === 'PUT')?.body as { content: string; sha?: string };
    expect(putBody.sha).toBeUndefined();
    expect(Buffer.from(putBody.content, 'base64').toString('utf8')).not.toContain('ghp_secret');

    await putGithubFile({
      token: 'ghp_secret',
      repo: 'adam/teaching-hub-content',
      json: pack,
      fetchImpl
    });
    const update = calls.filter((c) => c.method === 'PUT').at(-1)?.body as { sha?: string };
    expect(update.sha).toBe('abc123');
  });
});
