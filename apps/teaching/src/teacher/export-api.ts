import { apiGet, apiPost } from '@/api/client';
import {
  downloadJson,
  exportFilename,
  type PortableExport,
  type PortableKind
} from '@/export/portable';

export async function downloadPortableExport(
  kind: PortableKind,
  id?: string,
  slug?: string
): Promise<void> {
  const query = new URLSearchParams({ kind });
  if (id) query.set('id', id);
  const pack = await apiGet<PortableExport>(`/api/export?${query.toString()}`);
  downloadJson(exportFilename(kind, slug ?? pack.lesson?.slug ?? pack.unit?.slug), pack);
}

export async function pushGithubBackup(): Promise<{ path: string; commit_url: string }> {
  return apiPost('/api/backup/github', {});
}
