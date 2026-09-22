import type { BlockSuiteSnapshot } from './blocksuite-adapter';

export type WhiteboardDocument = {
  id: string;
  snapshot: BlockSuiteSnapshot;
  schema_version: 1;
  updated_at: string;
};

function endpoint(baseUrl: string, documentId: string): string {
  const root = baseUrl.replace(/\/$/, '');
  return `${root}/api/whiteboards/${encodeURIComponent(documentId)}`;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as
    | { ok: true; data: T }
    | { ok: false; error?: { code?: string; message?: string } };
  if (body.ok) return body.data;
  const error = new Error(body.error?.message || `Whiteboard request failed (HTTP ${response.status}).`);
  (error as Error & { code?: string }).code = body.error?.code;
  throw error;
}

export async function loadWhiteboardDocument(
  baseUrl: string,
  documentId: string
): Promise<WhiteboardDocument | null> {
  const response = await fetch(endpoint(baseUrl, documentId), {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' }
  });
  if (response.status === 404) return null;
  return parseResponse<WhiteboardDocument>(response);
}

export async function saveWhiteboardDocument(
  baseUrl: string,
  documentId: string,
  snapshot: BlockSuiteSnapshot
): Promise<WhiteboardDocument> {
  const response = await fetch(endpoint(baseUrl, documentId), {
    method: 'PUT',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ snapshot })
  });
  return parseResponse<WhiteboardDocument>(response);
}
