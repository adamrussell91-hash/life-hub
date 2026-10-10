import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import { rebuildJournalSearchIndex, searchJournalIndex } from '@/journal/search-index';
import { buildJournalExportBundle, formatJournalPlainText } from '@/journal/export-bundle';
import {
  AUDIO_TRANSCRIPTS_PREF_KEY,
  buildAudioTranscriptsExportJson,
  isAudioMedia,
  readAudioTranscriptsMap,
  resolveMediaTranscriptText,
  upsertMediaAudioTranscript,
} from '@/journal/transcripts';

function miniJournal(): JournalDocument {
  return {
    id: 'jrn_tx',
    schema_version: 1,
    trip_id: 'trp_tx',
    title: 'Voice trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_tx',
        pattern_id: 'kul',
        destination: 'KL',
        timezone: 'Asia/Kuala_Lumpur',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments: [
      {
        id: 'mom_1',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: ['med_audio', 'med_photo'],
        display_order: 1,
        lifecycle: 'live',
      },
    ],
    media: [
      {
        id: 'med_audio',
        url: '/media/note.webm',
        width: 0,
        height: 0,
        lifecycle: 'live',
        content_type: 'audio/webm',
      } as JournalDocument['media'][number] & { content_type: string },
      {
        id: 'med_photo',
        url: '/media/shot.jpg',
        width: 400,
        height: 300,
        lifecycle: 'live',
      },
    ],
    transitions: [],
  };
}

describe('journal audio transcripts', () => {
  it('detects audio media by content type or extension', () => {
    const journal = miniJournal();
    expect(isAudioMedia(journal.media[0])).toBe(true);
    expect(isAudioMedia(journal.media[1])).toBe(false);
  });

  it('stores editable text in preferences without mutating media url', () => {
    const before = miniJournal();
    const next = upsertMediaAudioTranscript(before, 'med_audio', '  Ferry horn at dawn.  ');
    expect(next.media.find((m) => m.id === 'med_audio')?.url).toBe(before.media[0].url);
    const map = readAudioTranscriptsMap(next);
    expect(map.med_audio?.text).toBe('Ferry horn at dawn.');
    expect(next.preferences[AUDIO_TRANSCRIPTS_PREF_KEY]).toBeTruthy();
    expect(() => upsertMediaAudioTranscript(next, 'med_photo', 'nope')).toThrow(/audio media/);
  });

  it('clears transcript when text is empty', () => {
    let journal = upsertMediaAudioTranscript(miniJournal(), 'med_audio', 'Hello');
    journal = upsertMediaAudioTranscript(journal, 'med_audio', '   ');
    expect(readAudioTranscriptsMap(journal).med_audio).toBeUndefined();
  });

  it('indexes and exports derived transcripts', async () => {
    const journal = upsertMediaAudioTranscript(miniJournal(), 'med_audio', 'Platform announcement');
    expect(resolveMediaTranscriptText(journal, journal.media[0])).toBe('Platform announcement');

    const index = rebuildJournalSearchIndex(journal);
    const hits = searchJournalIndex(index, 'platform');
    expect(hits.some((h) => h.field === 'transcript')).toBe(true);

    const plain = formatJournalPlainText(journal);
    expect(plain).toContain('[transcript] Platform announcement');

    const { files } = await buildJournalExportBundle(journal);
    const tx = files.find((f) => f.path === 'data/transcripts.json');
    expect(tx?.content).toContain('Platform announcement');
    expect(buildAudioTranscriptsExportJson(journal)).toContain('med_audio');
  });
});
