import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  PHOTO_ANNOTATIONS_PREF_KEY,
  buildPhotoAnnotationsExportJson,
  parseMediaPhotoAnnotations,
  parsePhotoAnnotationRegion,
  readPhotoAnnotationsMap,
  upsertMediaPhotoAnnotations,
} from '@/journal/annotations';
import { buildJournalExportBundle, formatJournalPlainText } from '@/journal/export-bundle';

function miniJournal(preferences: Record<string, unknown> = {}): JournalDocument {
  return {
    id: 'jrn_ann',
    schema_version: 1,
    trip_id: 'trp_ann',
    title: 'Notes trip',
    revision: 1,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences,
    operations: [],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_ann',
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
        media_ids: ['med_1'],
        display_order: 1,
        lifecycle: 'live',
      },
    ],
    media: [
      {
        id: 'med_1',
        url: '/x.jpg',
        width: 400,
        height: 300,
        lifecycle: 'live',
      },
    ],
    transitions: [],
  };
}

describe('journal photo annotations', () => {
  it('parses and stores regions keyed by media_id', () => {
    const region = parsePhotoAnnotationRegion({
      id: 'reg_a',
      x: 0.1,
      y: 0.2,
      width: 0.3,
      height: 0.25,
      note: 'Temple gate',
    });
    expect(region?.note).toBe('Temple gate');
    const doc = parseMediaPhotoAnnotations({
      media_id: 'med_1',
      revision: 2,
      regions: [region],
    });
    expect(doc?.media_id).toBe('med_1');
    const next = upsertMediaPhotoAnnotations(miniJournal(), doc!);
    const map = readPhotoAnnotationsMap(next);
    expect(map.med_1?.revision).toBe(1);
    expect(map.med_1?.regions[0]?.note).toBe('Temple gate');
    expect(next.preferences[PHOTO_ANNOTATIONS_PREF_KEY]).toBeTruthy();
  });

  it('includes annotations in export JSON and plain text', async () => {
    const journal = upsertMediaPhotoAnnotations(miniJournal(), {
      media_id: 'med_1',
      revision: 0,
      regions: [
        {
          id: 'reg_1',
          x: 0.2,
          y: 0.2,
          width: 0.2,
          height: 0.2,
          note: 'Rain on the lens',
        },
      ],
    });
    const plain = formatJournalPlainText(journal);
    expect(plain).toContain('[photo note] Rain on the lens');
    const { files } = await buildJournalExportBundle(journal);
    const ann = files.find((f) => f.path === 'data/annotations.json');
    expect(ann?.content).toContain('Rain on the lens');
    expect(buildPhotoAnnotationsExportJson(journal)).toContain('med_1');
  });
});
