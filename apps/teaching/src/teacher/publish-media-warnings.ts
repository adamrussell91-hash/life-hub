import type { Media, MediaSharing } from '@/schemas/media';

const RESTRICTED_SHARING = new Set<MediaSharing | 'unknown'>([
  'restricted',
  'unavailable',
  'unknown'
]);

function effectiveSharing(media: Media): MediaSharing {
  return media.sharing ?? 'unknown';
}

function isCandidate(media: Media): boolean {
  return (
    media.provider === 'google_drive' &&
    media.status === 'active' &&
    RESTRICTED_SHARING.has(effectiveSharing(media))
  );
}

function referenceNeedles(media: Media): string[] {
  return [media.preview_url, media.download_url, media.thumbnail_url, media.provider_file_id].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
}

function isReferencedInBlocks(blocksJson: string, media: Media): boolean {
  return referenceNeedles(media).some((needle) => blocksJson.includes(needle));
}

/**
 * Returns teacher-facing warnings when active restricted Drive media is
 * referenced by lesson blocks. Non-blocking — callers may still allow publish.
 */
export function collectRestrictedDriveMediaWarnings(input: {
  blocks: unknown;
  media: ReadonlyArray<Media>;
}): string[] {
  const blocksJson = JSON.stringify(input.blocks ?? null);
  const warnings: string[] = [];

  for (const media of input.media) {
    if (!isCandidate(media)) continue;
    if (!isReferencedInBlocks(blocksJson, media)) continue;
    const sharing = effectiveSharing(media);
    warnings.push(
      `Drive media "${media.title}" may not be accessible to students (${sharing}).`
    );
  }

  return warnings;
}

/** Joins warning lines for confirm dialogs / status panels. */
export function formatPublishMediaWarnings(warnings: string[]): string {
  return warnings.join('\n');
}
