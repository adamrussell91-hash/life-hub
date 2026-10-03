import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Page } from "../src/domain/page";
import { getContent } from "../src/tidy/githubContent";
import { mapInBatches } from "./loadLocalPages";

/**
 * Every page in the knowledge data repo, for the Node build scripts. Replaces
 * the standalone app's netlify/functions/_lib/dataRepo, which the umbrella
 * didn't bring over. Same env names as the research Worker
 * (GITHUB_DATA_REPO / GITHUB_DATA_REPO_TOKEN); without them, reads
 * fixtures/seed.json like the old fixture repo did.
 */

const READ_BATCH = 32;

async function readJson<T>(repo: string, token: string, file: string, fetchImpl: typeof fetch): Promise<T> {
  const current = await getContent(repo, token, file, fetchImpl);
  if (!current) throw new Error(`GitHub data repo error 404: ${file}`);
  try {
    return JSON.parse(current.text) as T;
  } catch {
    throw new Error(`GitHub data repo error: ${file} is not JSON`);
  }
}

export async function listDataRepoPages(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
): Promise<Page[]> {
  const repo = env.GITHUB_DATA_REPO;
  const token = env.GITHUB_DATA_REPO_TOKEN;
  if (!repo || !token) {
    return JSON.parse(await readFile(path.join(process.cwd(), "fixtures/seed.json"), "utf8")) as Page[];
  }
  const manifest = await readJson<unknown>(repo, token, "manifest.json", fetchImpl);
  const rows = Array.isArray(manifest) ? manifest : [];
  const files = rows
    .map(row => (row as { id?: unknown; path?: unknown }) ?? {})
    .map(row => (typeof row.path === "string" ? row.path : typeof row.id === "string" ? `pages/${row.id}.json` : null))
    .filter((file): file is string => Boolean(file));
  return mapInBatches(files, READ_BATCH, chunk =>
    Promise.all(chunk.map(file => readJson<Page>(repo, token, file, fetchImpl))),
  );
}
