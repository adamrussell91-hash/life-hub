import type { JournalDocument } from '@/api/journal';

/** Derived photo notes — never burned into original media bytes. */
export const PHOTO_ANNOTATIONS_PREF_KEY = 'photo_annotations_v1';

export interface PhotoAnnotationRegion {
  id: string;
  /** Normalized 0–1 box from top-left of the image. */
  x: number;
  y: number;
  width: number;
  height: number;
  note: string;
}

export interface MediaPhotoAnnotations {
  media_id: string;
  regions: PhotoAnnotationRegion[];
  revision: number;
}

export type PhotoAnnotationsMap = Record<string, MediaPhotoAnnotations>;

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function newRegionId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = 'reg_';
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}

export function parsePhotoAnnotationRegion(raw: unknown): PhotoAnnotationRegion | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : '';
  const note = typeof row.note === 'string' ? row.note : '';
  if (!id) return null;
  const x = clamp01(Number(row.x));
  const y = clamp01(Number(row.y));
  let width = clamp01(Number(row.width));
  let height = clamp01(Number(row.height));
  if (width <= 0) width = 0.12;
  if (height <= 0) height = 0.12;
  if (x + width > 1) width = Math.max(0.04, 1 - x);
  if (y + height > 1) height = Math.max(0.04, 1 - y);
  return { id, x, y, width, height, note };
}

export function parseMediaPhotoAnnotations(raw: unknown): MediaPhotoAnnotations | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const media_id = typeof row.media_id === 'string' ? row.media_id.trim() : '';
  if (!media_id) return null;
  const revision = Number(row.revision);
  const regions = Array.isArray(row.regions)
    ? row.regions.map(parsePhotoAnnotationRegion).filter((r): r is PhotoAnnotationRegion => Boolean(r))
    : [];
  return {
    media_id,
    regions,
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0,
  };
}

export function readPhotoAnnotationsMap(journal: JournalDocument): PhotoAnnotationsMap {
  const raw = journal.preferences?.[PHOTO_ANNOTATIONS_PREF_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const map: PhotoAnnotationsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseMediaPhotoAnnotations(value);
    if (!parsed) continue;
    map[key] = { ...parsed, media_id: parsed.media_id || key };
  }
  return map;
}

export function getMediaPhotoAnnotations(
  journal: JournalDocument,
  mediaId: string,
): MediaPhotoAnnotations | null {
  const doc = readPhotoAnnotationsMap(journal)[mediaId];
  return doc ?? null;
}

export function listMediaPhotoAnnotations(journal: JournalDocument): MediaPhotoAnnotations[] {
  return Object.values(readPhotoAnnotationsMap(journal))
    .filter((doc) => doc.regions.length > 0)
    .sort((a, b) => a.media_id.localeCompare(b.media_id));
}

export function defaultPhotoAnnotationRegion(note = ''): PhotoAnnotationRegion {
  return {
    id: newRegionId(),
    x: 0.35,
    y: 0.35,
    width: 0.3,
    height: 0.22,
    note,
  };
}

export function upsertMediaPhotoAnnotations(
  journal: JournalDocument,
  doc: MediaPhotoAnnotations,
): JournalDocument {
  const map = { ...readPhotoAnnotationsMap(journal) };
  const nextRevision = (map[doc.media_id]?.revision ?? 0) + 1;
  const normalized: MediaPhotoAnnotations = {
    media_id: doc.media_id,
    regions: doc.regions.map((r) => parsePhotoAnnotationRegion(r)!),
    revision: nextRevision,
  };
  if (normalized.regions.length === 0) {
    delete map[doc.media_id];
  } else {
    map[doc.media_id] = normalized;
  }
  return {
    ...journal,
    revision: journal.revision + 1,
    preferences: {
      ...journal.preferences,
      [PHOTO_ANNOTATIONS_PREF_KEY]: map,
    },
  };
}

export function momentHasPhotoAnnotations(
  journal: JournalDocument,
  mediaIds: string[],
): boolean {
  const map = readPhotoAnnotationsMap(journal);
  return mediaIds.some((id) => (map[id]?.regions.length ?? 0) > 0);
}

export function formatMediaAnnotationsPlainText(doc: MediaPhotoAnnotations): string[] {
  return doc.regions
    .map((r) => r.note.trim())
    .filter(Boolean)
    .map((note) => `[photo note] ${note}`);
}

export function buildPhotoAnnotationsExportJson(journal: JournalDocument): string {
  const items = listMediaPhotoAnnotations(journal);
  return JSON.stringify({ schema_version: 1, items }, null, 2);
}

export function regionSvgAttrs(region: PhotoAnnotationRegion): {
  x: string;
  y: string;
  width: string;
  height: string;
} {
  return {
    x: `${region.x * 100}%`,
    y: `${region.y * 100}%`,
    width: `${region.width * 100}%`,
    height: `${region.height * 100}%`,
  };
}
