import { buildLifeContextDigest, type LifeContextDigest } from '@/domain/life-context';

export type LifeContextProvider = () => Promise<LifeContextDigest | null>;

/** Reads Life Hub's central-node.md straight from the (private) life-hub-data repo via the GitHub API — same pattern Life Hub itself uses to read its own data. */
export function createLifeContextProvider(options: {
  token: string;
  repository: string;
  path?: string;
  branch?: string;
  fetchImpl?: typeof fetch;
}): LifeContextProvider {
  const path = options.path ?? 'central-node.md';
  const branch = options.branch ?? 'main';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return async () => {
    try {
      const url = `https://api.github.com/repos/${options.repository}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`;
      const response = await fetchImpl(url, {
        headers: {
          accept: 'application/vnd.github.raw+json',
          authorization: `Bearer ${options.token}`,
          'user-agent': 'tasks-hub',
          'x-github-api-version': '2022-11-28'
        }
      });
      if (!response.ok) return null;
      const markdown = await response.text();
      if (!markdown.trim()) return null;
      return buildLifeContextDigest(markdown);
    } catch {
      return null;
    }
  };
}

export function defaultLifeContextProvider(
  env: NodeJS.ProcessEnv = process.env
): LifeContextProvider | null {
  const token = env.LIFE_HUB_DATA_TOKEN?.trim();
  if (!token) return null;
  return createLifeContextProvider({
    token,
    repository: env.LIFE_HUB_DATA_REPOSITORY?.trim() || 'adamrussell91-hash/life-hub-data',
    path: env.LIFE_HUB_DATA_PATH?.trim() || 'central-node.md',
    branch: env.LIFE_HUB_DATA_BRANCH?.trim() || 'main'
  });
}
