import { describe, expect, it } from 'vitest';
import { klIstanbulFixture } from '@/journal/fixtures/kl-istanbul';
import { applyReimport } from '@/journal/reimport-guard';
import type { JournalDocument } from '@/api/journal';

const CHECKSUM_A = 'a'.repeat(64);
const CHECKSUM_B = 'b'.repeat(64);

function asDoc(): JournalDocument {
  const fixture = klIstanbulFixture();
  return {
    ...fixture,
    leg_ids: fixture.legs.map((l) => l.id),
    preferences: {},
    operations: [],
  };
}

describe('applyReimport', () => {
  it('preserves manual place, time, order, and text on matching moments', () => {
    const existing = asDoc();
    const moment = existing.moments.find((m) => m.id === 'mom_kul_long_place')!;
    moment.location_source = 'manual';
    moment.place = { name: 'Manual market' };
    moment.local_time = '17:30';
    moment.text = 'Kept reflection';
    moment.display_order = 99;

    const incoming = asDoc();
    const incomingMoment = incoming.moments.find((m) => m.id === moment.id)!;
    incomingMoment.place = { name: 'EXIF market' };
    incomingMoment.local_time = '09:00';
    incomingMoment.text = 'Incoming';
    incomingMoment.display_order = 1;
    incomingMoment.location_source = 'exif';

    const merged = applyReimport(existing, incoming);
    const row = merged.moments.find((m) => m.id === moment.id)!;
    expect(row.place?.name).toBe('Manual market');
    expect(row.local_time).toBe('17:30');
    expect(row.text).toBe('Kept reflection');
    expect(row.display_order).toBe(99);
  });

  it('skips duplicate checksum media and keeps owner captions', () => {
    const existing = asDoc();
    existing.media.push({
      id: 'med_dup',
      url: '/a',
      width: 1,
      height: 1,
      lifecycle: 'live',
      checksum: CHECKSUM_A,
      caption: 'Owner caption',
    });

    const incoming = asDoc();
    incoming.media.push(
      {
        id: 'med_dup_incoming',
        url: '/b',
        width: 2,
        height: 2,
        lifecycle: 'live',
        checksum: CHECKSUM_A,
        caption: 'Import caption',
      },
      {
        id: 'med_new',
        url: '/c',
        width: 3,
        height: 3,
        lifecycle: 'live',
        checksum: CHECKSUM_B,
      },
    );

    const merged = applyReimport(existing, incoming);
    expect(merged.media.filter((m) => m.checksum === CHECKSUM_A)).toHaveLength(1);
    expect(merged.media.find((m) => m.id === 'med_dup')?.caption).toBe('Owner caption');
    expect(merged.media.some((m) => m.id === 'med_new')).toBe(true);
  });

  it('does not resurrect deleted media or moments', () => {
    const existing = asDoc();
    const deleted = existing.media[0]!;
    deleted.lifecycle = 'deleted';
    deleted.checksum = CHECKSUM_A;

    const incoming = asDoc();
    incoming.media.push({
      id: 'med_resurrect',
      url: '/z',
      width: 1,
      height: 1,
      lifecycle: 'live',
      checksum: CHECKSUM_A,
    });

    const merged = applyReimport(existing, incoming);
    expect(merged.media.some((m) => m.id === 'med_resurrect')).toBe(false);
    expect(merged.media.find((m) => m.id === deleted.id)?.lifecycle).toBe('deleted');
  });

  it('keeps transition display_override across reimport', () => {
    const existing = asDoc();
    existing.transitions[0] = {
      ...existing.transitions[0]!,
      display_override: { departure_label: 'Owner dep' },
    };
    const incoming = asDoc();
    incoming.transitions[0] = {
      ...incoming.transitions[0]!,
      display_override: undefined,
      departure_label: 'Import dep',
    };
    const merged = applyReimport(existing, incoming);
    expect(merged.transitions[0]?.display_override?.departure_label).toBe('Owner dep');
  });
});
