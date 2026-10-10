import type { JournalDocument } from '@/api/journal';
import type { JournalMedia } from '@/journal/types';

/** Editable derived transcript text — never burned into original audio bytes. */
export const AUDIO_TRANSCRIPTS_PREF_KEY = 'audio_transcripts_v1';

export interface MediaAudioTranscript {
  media_id: string;
  text: string;
  revision: number;
}

export type AudioTranscriptsMap = Record<string, MediaAudioTranscript>;

type JournalMediaAudioExtras = JournalMedia & {
  content_type?: string;
  /** Legacy inline field on fixtures; prefer preferences map for live edits. */
  transcript?: string;
};

const AUDIO_URL_RE = /\.(webm|m4a|mp3|ogg|wav|aac|flac)(\?|#|$)/i;

export function isAudioMedia(media: JournalMedia): boolean {
  const extras = media as JournalMediaAudioExtras;
  if (extras.content_type?.toLowerCase().startsWith('audio/')) return true;
  return AUDIO_URL_RE.test(media.url);
}

export function parseMediaAudioTranscript(raw: unknown): MediaAudioTranscript | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const media_id = typeof row.media_id === 'string' ? row.media_id.trim() : '';
  const text = typeof row.text === 'string' ? row.text : '';
  if (!media_id) return null;
  const revision = Number(row.revision);
  return {
    media_id,
    text,
    revision: Number.isFinite(revision) && revision >= 0 ? Math.floor(revision) : 0,
  };
}

export function readAudioTranscriptsMap(journal: JournalDocument): AudioTranscriptsMap {
  const raw = journal.preferences?.[AUDIO_TRANSCRIPTS_PREF_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const map: AudioTranscriptsMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseMediaAudioTranscript(value);
    if (!parsed) continue;
    map[key] = { ...parsed, media_id: parsed.media_id || key };
  }
  return map;
}

export function getMediaAudioTranscript(
  journal: JournalDocument,
  mediaId: string,
): MediaAudioTranscript | null {
  const doc = readAudioTranscriptsMap(journal)[mediaId];
  if (!doc?.text.trim()) return null;
  return doc;
}

/** Preference transcript wins; falls back to legacy inline media field when present. */
export function resolveMediaTranscriptText(journal: JournalDocument, media: JournalMedia): string {
  const derived = readAudioTranscriptsMap(journal)[media.id]?.text;
  if (derived?.trim()) return derived.trim();
  const legacy = (media as JournalMediaAudioExtras).transcript;
  if (legacy?.trim()) return legacy.trim();
  return '';
}

export function listMediaAudioTranscripts(journal: JournalDocument): MediaAudioTranscript[] {
  return Object.values(readAudioTranscriptsMap(journal))
    .filter((doc) => doc.text.trim())
    .sort((a, b) => a.media_id.localeCompare(b.media_id));
}

export function upsertMediaAudioTranscript(
  journal: JournalDocument,
  mediaId: string,
  text: string,
): JournalDocument {
  const media = journal.media.find((m) => m.id === mediaId);
  if (!media || media.lifecycle === 'deleted') {
    throw new Error(`Unknown media (${mediaId})`);
  }
  if (!isAudioMedia(media)) {
    throw new Error(`Transcripts apply only to audio media (${mediaId})`);
  }
  const map = { ...readAudioTranscriptsMap(journal) };
  const trimmed = text.trim();
  if (!trimmed) {
    delete map[mediaId];
  } else {
    const nextRevision = (map[mediaId]?.revision ?? 0) + 1;
    map[mediaId] = { media_id: mediaId, text: trimmed, revision: nextRevision };
  }
  return {
    ...journal,
    revision: journal.revision + 1,
    preferences: {
      ...journal.preferences,
      [AUDIO_TRANSCRIPTS_PREF_KEY]: map,
    },
  };
}

export function buildAudioTranscriptsExportJson(journal: JournalDocument): string {
  const items = listMediaAudioTranscripts(journal);
  return JSON.stringify({ schema_version: 1, items }, null, 2);
}
