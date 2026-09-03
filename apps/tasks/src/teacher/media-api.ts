import type { Media } from '@/schemas/media';

function mediaTypeFor(file: File): Media['media_type'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  return 'other';
}

/** Local blob URL so image/file picks work without a Teaching Hub media library. */
export async function uploadMediaFile(
  file: File,
  opts?: { title?: string; provider_file_id?: string }
): Promise<Media> {
  const url = URL.createObjectURL(file);
  const now = new Date().toISOString();
  return {
    id: `media_${crypto.randomUUID()}`,
    title: opts?.title?.trim() || file.name,
    slug: file.name,
    status: 'active',
    created_at: now,
    updated_at: now,
    schema_version: 1,
    type: 'media',
    provider: 'direct',
    media_type: mediaTypeFor(file),
    mime_type: file.type || undefined,
    file_name: file.name,
    preview_url: url,
    download_url: url,
    provider_file_id: opts?.provider_file_id
  };
}
