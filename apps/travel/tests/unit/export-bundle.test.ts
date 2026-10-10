import { describe, expect, it } from 'vitest';
import type { JournalDocument } from '@/api/journal';
import {
  buildJournalExportBundle,
  buildJournalRouteGeoJson,
  exportReaderHasNoExternalNetwork,
  formatJournalPlainText,
  parseJournalJsonFromExportFiles,
  restoreJournalFromExport,
  stripJournalForExport,
} from '@/journal/export-bundle';
import exportReaderHtml from '@/journal/export-reader/index.html?raw';

function miniJournal(overrides: Partial<JournalDocument> = {}): JournalDocument {
  return {
    id: 'jrn_export',
    schema_version: 1,
    trip_id: 'trp_export01',
    title: 'Export trip',
    revision: 2,
    lifecycle: 'live',
    leg_ids: ['leg_a'],
    preferences: {},
    operations: [{ id: 'op_1' }],
    legs: [
      {
        id: 'leg_a',
        trip_id: 'trp_export01',
        pattern_id: 'kul',
        destination: 'Kuala Lumpur',
        timezone: 'Asia/Kuala_Lumpur',
        order: 1,
        lifecycle: 'live',
      },
    ],
    days: [],
    moments: [
      {
        id: 'mom_live',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: ['med_1'],
        display_order: 1,
        lifecycle: 'live',
        coordinates: { lat: 3.15, lon: 101.7 },
        text: 'Morning walk',
      },
      {
        id: 'mom_deleted',
        leg_id: 'leg_a',
        local_date: '2026-03-01',
        media_ids: [],
        display_order: 2,
        lifecycle: 'deleted',
        text: 'hidden',
      },
    ],
    media: [
      {
        id: 'med_1',
        url: '/fixtures/1.jpg',
        width: 800,
        height: 600,
        lifecycle: 'live',
        checksum: 'b'.repeat(64),
        caption: 'Street',
        transcript: 'Birdsong',
      },
      {
        id: 'med_deleted',
        url: '/fixtures/x.jpg',
        width: 100,
        height: 100,
        lifecycle: 'deleted',
      },
    ],
    transitions: [],
    ...overrides,
  };
}

describe('stripJournalForExport', () => {
  it('removes deleted rows and clears operations', () => {
    const stripped = stripJournalForExport(miniJournal());
    expect(stripped.moments.map((m) => m.id)).toEqual(['mom_live']);
    expect(stripped.media.map((m) => m.id)).toEqual(['med_1']);
    expect(stripped.operations).toEqual([]);
  });
});

describe('buildJournalExportBundle', () => {
  it('produces versioned manifest, checksums, geojson, patterns, and licences', async () => {
    const { manifest, files } = await buildJournalExportBundle(miniJournal(), '2026-10-10T00:00:00.000Z');
    expect(manifest.bundle_version).toBe(1);
    expect(manifest.trip_id).toBe('trp_export01');
    expect(manifest.pattern_ids).toEqual(['kul']);
    expect(manifest.media).toHaveLength(1);
    expect(manifest.media[0]?.bundle_paths.original).toBe('media/med_1/original');

    const paths = new Set(files.map((f) => f.path));
    expect(paths.has('data/journal.json')).toBe(true);
    expect(paths.has('data/journal.txt')).toBe(true);
    expect(paths.has('data/checksums.json')).toBe(true);
    expect(paths.has('geo/route.geojson')).toBe(true);
    expect(paths.has('reader/index.html')).toBe(true);
    expect(paths.has('licences/patterns.md')).toBe(true);
    expect(paths.has('patterns/kul.svg')).toBe(true);
    expect(paths.has('media/index.json')).toBe(true);

    const journalFile = files.find((f) => f.path === 'data/journal.json')!;
    const parsed = JSON.parse(journalFile.content) as JournalDocument;
    expect(parsed.moments.some((m) => m.id === 'mom_deleted')).toBe(false);

    const checksums = JSON.parse(files.find((f) => f.path === 'data/checksums.json')!.content) as Record<
      string,
      string
    >;
    for (const file of files) {
      if (file.path === 'data/checksums.json') continue;
      expect(checksums[file.path]).toBe(file.sha256);
    }

    const geo = JSON.parse(files.find((f) => f.path === 'geo/route.geojson')!.content);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features.length).toBeGreaterThan(0);
  });
});

describe('plain text export', () => {
  it('includes live moment copy and transcript', () => {
    const text = formatJournalPlainText(stripJournalForExport(miniJournal()));
    expect(text).toContain('Morning walk');
    expect(text).toContain('[transcript] Birdsong');
    expect(text).not.toContain('hidden');
  });
});

describe('export reader offline', () => {
  it('has no external CDN or remote script dependencies', () => {
    expect(exportReaderHasNoExternalNetwork(exportReaderHtml)).toBe(true);
  });
});

describe('restore stub', () => {
  it('imports journal JSON through ensureJournal + saveJournal', async () => {
    const { files } = await buildJournalExportBundle(miniJournal());
    const fileMap = Object.fromEntries(files.map((f) => [f.path, f.content]));
    const ensureJournal = async () => ({
      journal: { ...miniJournal(), id: 'jrn_target', revision: 0, title: 'Existing' },
      version: 'ver_a',
    });
    let saved: JournalDocument | null = null;
    const saveJournal = async (_trip: string, ifVersion: string, journal: JournalDocument) => {
      expect(ifVersion).toBe('ver_a');
      saved = journal;
      return { journal, version: 'ver_b' };
    };
    const result = await restoreJournalFromExport('trp_target', fileMap, {
      ensureJournal,
      saveJournal,
    });
    expect(result.gaps.length).toBeGreaterThan(0);
    expect(saved?.title).toBe('Export trip');
    expect(saved?.trip_id).toBe('trp_target');
    expect(saved?.id).toBe('jrn_target');
    expect(parseJournalJsonFromExportFiles(fileMap).journal.moments).toHaveLength(1);
  });
});

describe('buildJournalRouteGeoJson', () => {
  it('includes stop points for located live moments', () => {
    const geo = buildJournalRouteGeoJson(stripJournalForExport(miniJournal()));
    const kinds = geo.features.map((f) => f.properties?.kind);
    expect(kinds).toContain('stop');
  });
});
