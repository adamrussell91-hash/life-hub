import { describe, expect, it, vi } from 'vitest';
import { applyAttachmentEdits, mountMomentAttachments } from '@/journal/moment-attachments';
import type { JournalDocument } from '@/api/journal';
import type { JournalMedia, JournalMoment } from '@/journal/types';

function media(id: string, extra: Partial<JournalMedia> = {}): JournalMedia {
  return { id, lifecycle: 'live', content_type: 'image/jpeg', upload_state: 'backed_up', ...extra } as JournalMedia;
}

function moment(id: string, media_ids: string[]): JournalMoment {
  return { id, leg_id: 'leg_test01', local_date: '2027-03-04', media_ids, display_order: 1, lifecycle: 'live' };
}

function journal(): JournalDocument {
  return {
    id: 'jrn_testjournal',
    schema_version: 1,
    trip_id: 'trp_test01',
    title: '',
    revision: 3,
    lifecycle: 'live',
    leg_ids: ['leg_test01'],
    preferences: {},
    legs: [],
    days: [],
    moments: [moment('mom_a', ['med_photo1', 'med_shared', 'med_sound1']), moment('mom_b', ['med_shared'])],
    media: [
      media('med_photo1'),
      media('med_shared'),
      media('med_sound1', { content_type: 'audio/mp4', duration_s: 42 })
    ],
    transitions: [],
    operations: []
  } as unknown as JournalDocument;
}

describe('applyAttachmentEdits', () => {
  it('adds new rows and soft-deletes only media no other moment uses', () => {
    const added = [{ mediaId: 'med_new1', row: media('med_new1', { upload_state: 'pending' }), blob: new Blob(['x']) }];
    const next = applyAttachmentEdits(journal(), 'mom_a', added, ['med_photo1', 'med_shared']);

    expect(next.moments.find((m) => m.id === 'mom_a')!.media_ids).toEqual(['med_sound1', 'med_new1']);
    expect(next.moments.find((m) => m.id === 'mom_b')!.media_ids).toEqual(['med_shared']);
    const byId = new Map(next.media.map((m) => [m.id, m]));
    expect(byId.get('med_photo1')!.lifecycle).toBe('deleted');
    expect(byId.get('med_photo1')!.deleted_at).toBeTruthy();
    expect(byId.get('med_shared')!.lifecycle).toBe('live');
    expect(byId.get('med_new1')!.upload_state).toBe('pending');
  });
});

describe('Edit moment sheet with attachments', () => {
  it('removes a photo on Save and makes no promises about later updates', async () => {
    const { klIstanbulFixture } = await import('@/journal/fixtures/kl-istanbul');
    const { openEditMomentSheet } = await import('@/journal/edit-moment-sheet');
    const fixture = klIstanbulFixture() as unknown as JournalDocument;
    const target = fixture.moments.find((m) => m.lifecycle === 'live' && m.media_ids.length >= 2)!;
    const anchor = document.createElement('div');
    document.body.append(anchor);
    const onSaved = vi.fn();
    openEditMomentSheet({ tripId: fixture.trip_id, journal: fixture, version: 'fixture', moment: target, anchor, onSaved });

    const sheet = document.querySelector('.journal-edit-moment-sheet')!;
    expect(sheet.textContent).not.toMatch(/later update|Crop and metadata/);
    expect(sheet.textContent).toContain('Photos and sound');
    (sheet.querySelector('[aria-label="Remove photo 1"]') as HTMLButtonElement).click();
    sheet.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());

    const saved = onSaved.mock.calls[0]![0].journal as JournalDocument;
    const after = saved.moments.find((m) => m.id === target.id)!;
    expect(after.media_ids).toEqual(target.media_ids.slice(1));
  });
});

describe('moment attachments row', () => {
  function mount(onChange = vi.fn()) {
    const host = document.createElement('div');
    document.body.append(host);
    const doc = journal();
    const handle = mountMomentAttachments(host, {
      tripId: 'trp_test01',
      journal: doc,
      moment: doc.moments[0]!,
      onChange
    });
    return { host, handle, onChange };
  }

  it('shows the photos and sound already on the moment, with quiet add buttons', () => {
    const { host } = mount();
    expect(host.querySelectorAll('.journal-capture__thumb img')).toHaveLength(2);
    expect(host.querySelector('.journal-attachments__sound')?.textContent).toContain('Sound · 0:42');
    const labels = [...host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).toContain('Add photo');
    expect(labels).toContain('Record');
    expect(host.textContent).not.toMatch(/later update/i);
  });

  it('removes an attachment and reports the change', () => {
    const { host, handle, onChange } = mount();
    expect(handle.changed()).toBe(false);
    (host.querySelector('[aria-label="Remove photo 1"]') as HTMLButtonElement).click();
    expect(host.querySelectorAll('.journal-capture__thumb img')).toHaveLength(1);
    expect(handle.removed()).toEqual(['med_photo1']);
    expect(handle.changed()).toBe(true);
    expect(onChange).toHaveBeenCalled();
  });

  it('adds a picked photo as a pending attachment', async () => {
    const { host, handle } = mount();
    const input = host.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.hidden).toBe(true);
    const file = new File([new Uint8Array(64)], 'beach.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    await handle.settle();
    expect(handle.added()).toHaveLength(1);
    expect(handle.added()[0]!.row.content_type).toBe('image/jpeg');
    expect(handle.added()[0]!.row.upload_state).toBe('pending');
    expect(host.querySelectorAll('.journal-capture__thumb img')).toHaveLength(3);
    expect(handle.changed()).toBe(true);
  });
});
