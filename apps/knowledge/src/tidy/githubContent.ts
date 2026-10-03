import type { Page, PageManifestEntry } from "../domain/page";

/**
 * GitHub contents read/write for the knowledge data repo, written for the
 * research Worker (fetch + Web APIs only). Mirrors the umbrella's
 * netlify/functions/_shared/knowledge-data.mjs, which can't be bundled into a
 * Worker because its relationship code pulls in Netlify Blobs.
 */

const GITHUB = "https://api.github.com";

export class GitHubContentError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function headers(token: string, accept = "application/vnd.github+json"): Record<string, string> {
  return { accept, authorization: `Bearer ${token}`, "user-agent": "life-hub-knowledge-worker" };
}

function contentsUrl(repo: string, file: string) {
  return `${GITHUB}/repos/${repo}/contents/${file.split("/").map(encodeURIComponent).join("/")}`;
}

function fromBase64(value: string) {
  const binary = atob(value.replace(/\s+/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, ch => ch.charCodeAt(0)));
}

function toBase64(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function getContent(
  repo: string,
  token: string,
  file: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ sha: string; text: string } | null> {
  const response = await fetchImpl(contentsUrl(repo, file), { headers: headers(token) });
  if (response.status === 404) return null;
  if (!response.ok) throw new GitHubContentError(`GitHub read failed for ${file} (${response.status})`, response.status);
  const payload = (await response.json()) as { sha?: unknown; content?: unknown; encoding?: unknown; size?: unknown };
  if (typeof payload.sha !== "string") throw new GitHubContentError(`GitHub read failed for ${file}`, 502);
  let text = payload.encoding === "base64" && typeof payload.content === "string" ? fromBase64(payload.content) : "";
  const size = Number(payload.size) || 0;
  // Files over 1 MB (the manifest) come back without content: read the blob raw.
  if (!text && size > 0) {
    const blob = await fetchImpl(`${GITHUB}/repos/${repo}/git/blobs/${payload.sha}`, {
      headers: headers(token, "application/vnd.github.raw"),
    });
    if (!blob.ok) throw new GitHubContentError(`GitHub read failed for ${file} (${blob.status})`, blob.status);
    text = await blob.text();
  }
  return { sha: payload.sha, text };
}

export async function putContent(
  repo: string,
  token: string,
  file: string,
  text: string,
  sha?: string,
  message?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(contentsUrl(repo, file), {
    method: "PUT",
    headers: { ...headers(token), "content-type": "application/json" },
    body: JSON.stringify({ message: message || `Save ${file}`, content: toBase64(text), ...(sha ? { sha } : {}) }),
  });
  if (response.status === 409) throw new GitHubContentError("save collided, try again", 409);
  if (!response.ok) throw new GitHubContentError(`GitHub write failed for ${file} (${response.status})`, response.status);
}

export type ContentFns = {
  getContent: (file: string) => Promise<{ sha: string; text: string } | null>;
  putContent: (file: string, text: string, sha?: string, message?: string) => Promise<void>;
};

function excerptFromBody(body: string) {
  const plain = String(body ?? "").replace(/[#*_`[\]]/g, " ").replace(/\s+/g, " ").trim();
  return plain.length > 157 ? `${plain.slice(0, 157)}...` : plain;
}

/** The manifest row the umbrella's saveKnowledgePage writes, so both paths agree. */
export function manifestRow(page: Page): PageManifestEntry & { path: string; updated_at: string } {
  return {
    id: page.id,
    title: page.title,
    area: page.area,
    tags: page.tags,
    excerpt: excerptFromBody(page.body),
    created_at: page.created_at,
    updated_at: page.updated_at,
    path: `pages/${page.id}.json`,
    ...(page.origins?.length ? { origins: page.origins } : {}),
    ...(page.connected?.length ? { connected: page.connected } : {}),
  };
}

/** Saves a page and upserts its manifest row; refuses to overwrite a manifest it can't read. */
export async function savePageRecord(page: Page, fns: ContentFns): Promise<Page> {
  const file = `pages/${page.id}.json`;
  const current = await fns.getContent(file);
  await fns.putContent(file, JSON.stringify(page), current?.sha, `Save ${page.id}`);

  const write = async () => {
    const manifest = await fns.getContent("manifest.json");
    let rows: unknown[] = [];
    if (manifest) {
      try {
        const raw = JSON.parse(manifest.text) as unknown;
        rows = Array.isArray(raw) ? raw : Array.isArray((raw as { pages?: unknown })?.pages) ? (raw as { pages: unknown[] }).pages : [];
      } catch {
        throw new GitHubContentError("Knowledge manifest is unreadable; refusing to overwrite the archive.", 502);
      }
    }
    const merged = [...rows.filter(row => (row as { id?: unknown })?.id !== page.id), manifestRow(page)];
    await fns.putContent("manifest.json", JSON.stringify(merged), manifest?.sha, `Upsert ${page.id}`);
  };
  try {
    await write();
  } catch (error) {
    if (!(error instanceof GitHubContentError) || error.status !== 409) throw error;
    await write();
  }
  return page;
}
