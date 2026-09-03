/** GitHub Contents read/write for agent repo edits (Tasks Hub itself or configured repo). */

export type RepoFile = {
  path: string;
  content: string;
  sha: string;
  html_url: string | null;
};

export type RepoClient = {
  getFile: (path: string) => Promise<RepoFile | null>;
  putFile: (input: {
    path: string;
    content: string;
    message: string;
    sha?: string;
  }) => Promise<{ ok: boolean; path: string; commit_url: string | null; note: string }>;
};

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

export function createGithubRepoClient(options: {
  token: string;
  repository: string;
  branch?: string;
  fetchImpl?: typeof fetch;
}): RepoClient {
  const branch = options.branch ?? 'main';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const base = `https://api.github.com/repos/${options.repository}/contents`;

  async function getFile(path: string): Promise<RepoFile | null> {
    const url = `${base}/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
    const response = await fetchImpl(url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'user-agent': 'tasks-hub-agents',
        'x-github-api-version': '2022-11-28'
      }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`GitHub GET ${response.status}: ${(await response.text()).slice(0, 160)}`);
    }
    const body = (await response.json()) as {
      content?: string;
      encoding?: string;
      sha?: string;
      html_url?: string;
      path?: string;
    };
    if (!body.content || !body.sha) return null;
    const raw =
      body.encoding === 'base64'
        ? Buffer.from(body.content.replace(/\n/g, ''), 'base64').toString('utf8')
        : body.content;
    return {
      path: body.path ?? path,
      content: raw,
      sha: body.sha,
      html_url: body.html_url ?? null
    };
  }

  async function putFile(input: {
    path: string;
    content: string;
    message: string;
    sha?: string;
  }): Promise<{ ok: boolean; path: string; commit_url: string | null; note: string }> {
    let sha = input.sha;
    if (!sha) {
      const existing = await getFile(input.path);
      sha = existing?.sha;
    }
    const url = `${base}/${encodePath(input.path)}`;
    const response = await fetchImpl(url, {
      method: 'PUT',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${options.token}`,
        'content-type': 'application/json',
        'user-agent': 'tasks-hub-agents',
        'x-github-api-version': '2022-11-28'
      },
      body: JSON.stringify({
        message: input.message.slice(0, 200) || `Agent update ${input.path}`,
        content: Buffer.from(input.content, 'utf8').toString('base64'),
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (!response.ok) {
      return {
        ok: false,
        path: input.path,
        commit_url: null,
        note: `GitHub PUT ${response.status}: ${(await response.text()).slice(0, 200)}`
      };
    }
    const body = (await response.json()) as {
      commit?: { html_url?: string };
      content?: { html_url?: string };
    };
    return {
      ok: true,
      path: input.path,
      commit_url: body.commit?.html_url ?? body.content?.html_url ?? null,
      note: `Wrote ${input.path} on ${branch}.`
    };
  }

  return { getFile, putFile };
}

export function defaultAgentRepoClient(
  env: NodeJS.ProcessEnv = process.env
): RepoClient | null {
  const token =
    env.AGENT_REPO_TOKEN?.trim() ||
    env.GITHUB_TOKEN?.trim() ||
    env.LIFE_HUB_DATA_TOKEN?.trim() ||
    '';
  if (!token) return null;
  return createGithubRepoClient({
    token,
    repository: env.AGENT_REPO?.trim() || 'adamrussell91-hash/Tasks-Hub',
    branch: env.AGENT_REPO_BRANCH?.trim() || 'main'
  });
}
