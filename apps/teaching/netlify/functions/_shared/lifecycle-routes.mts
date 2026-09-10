const STATUSES = new Set(['active', 'archived', 'trashed']);

export function parseStatusPatch(body: unknown): {
  ok: boolean;
  hasStatus?: boolean;
  status?: 'active' | 'archived' | 'trashed';
  trash_reason?: string;
  code?: string;
  message?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'validation_error', message: 'Request body must be a JSON object' };
  }
  const record = body as Record<string, unknown>;
  if (!('status' in record) || record.status === undefined) {
    return { ok: true, hasStatus: false };
  }
  if (typeof record.status !== 'string' || !STATUSES.has(record.status)) {
    return { ok: false, code: 'validation_error', message: 'status must be active, archived, or trashed' };
  }
  return {
    ok: true,
    hasStatus: true,
    status: record.status as 'active' | 'archived' | 'trashed',
    trash_reason: typeof record.trash_reason === 'string' ? record.trash_reason : undefined
  };
}
