import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  yearKey,
  subjectKey,
  scopeSequenceKey,
  unitKey,
  draftLessonKey,
  publishedLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  mediaKey,
  mediaFileKey,
  compositionKey,
  aiJobKey,
  aiJobsInboxKey,
  aiTranscriptKey
} from '@/storage/keys';
import { MockStore } from '../../scripts/mock-store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(join(__dirname, '../../fixtures/seed.json'), 'utf-8')
);

describe('storage key helpers', () => {
  it('builds draft lesson keys', () => {
    expect(draftLessonKey('lesson_aotfw_008')).toBe(
      'lessons/lesson_aotfw_008'
    );
  });

  it('builds published lesson keys', () => {
    expect(publishedLessonKey('lesson_aotfw_008')).toBe(
      'published/lessons/lesson_aotfw_008'
    );
  });

  it('builds curriculum entity keys', () => {
    expect(yearKey('year_12')).toBe('years/year_12');
    expect(subjectKey('subject_y12_engadv')).toBe(
      'subjects/subject_y12_engadv'
    );
    expect(unitKey('unit_aotfw')).toBe('units/unit_aotfw');
    expect(scopeSequenceKey('scope_y12_engadv_2026')).toBe(
      'scope_sequences/scope_y12_engadv_2026'
    );
  });

  it('builds class and scheduled lesson keys', () => {
    expect(classKey('class_2026_12engadv1')).toBe('classes/class_2026_12engadv1');
    expect(scheduledLessonKey('scheduled_aotfw_008')).toBe(
      'scheduled_lessons/scheduled_aotfw_008'
    );
  });

  it('builds schedule anchor key', () => {
    expect(scheduleAnchorKey()).toBe('meta/schedule_anchor_date');
  });

  it('builds media keys', () => {
    expect(mediaKey('media_ono_extract')).toBe('media/media_ono_extract');
    expect(mediaFileKey('media_1')).toBe('media_files/media_1');
  });

  it('builds composition keys', () => {
    expect(compositionKey('composition_1')).toBe('templates/compositions/composition_1');
  });

  it('builds AI job and transcript keys', () => {
    expect(aiJobKey('job_1')).toBe('ai_jobs/job_1');
    expect(aiJobsInboxKey()).toBe('ai_jobs/_inbox');
    expect(aiTranscriptKey('lesson_aotfw_008', 'clementine')).toBe(
      'ai_transcripts/lesson_aotfw_008/clementine'
    );
  });
});

describe('MockStore', () => {
  let store: MockStore;

  beforeEach(() => {
    store = new MockStore();
  });

  it('get/set/delete string values', () => {
    store.set('foo', '{"a":1}');
    expect(store.get('foo')).toBe('{"a":1}');
    expect(store.delete('foo')).toBe(true);
    expect(store.get('foo')).toBeUndefined();
    expect(store.delete('foo')).toBe(false);
  });

  it('getJSON/setJSON round-trips objects', () => {
    store.setJSON('years/year_12', { id: 'year_12', title: 'Year 12' });
    expect(store.getJSON('years/year_12')).toEqual({
      id: 'year_12',
      title: 'Year 12'
    });
  });

  it('loadSeed writes curriculum and lessons to draft keys', () => {
    store.loadSeed(seed);

    expect(store.getJSON(yearKey('year_12'))).toMatchObject({
      id: 'year_12'
    });
    expect(store.getJSON(subjectKey('subject_y12_engadv'))).toMatchObject({
      id: 'subject_y12_engadv'
    });
    expect(store.getJSON(scopeSequenceKey('scope_y12_engadv_2026'))).toMatchObject({
      id: 'scope_y12_engadv_2026',
      subject_id: 'subject_y12_engadv'
    });
    expect(store.getJSON(unitKey('unit_aotfw'))).toMatchObject({
      id: 'unit_aotfw'
    });
    expect(store.getJSON(draftLessonKey('lesson_aotfw_008'))).toMatchObject({
      id: 'lesson_aotfw_008'
    });
    expect(store.getJSON(classKey('class_2026_12engadv1'))).toMatchObject({
      id: 'class_2026_12engadv1',
      code: '12ENGADV1'
    });
    expect(store.getJSON(scheduledLessonKey('scheduled_aotfw_008'))).toMatchObject({
      id: 'scheduled_aotfw_008',
      lesson_id: 'lesson_aotfw_008'
    });
    expect(store.getJSON(scheduleAnchorKey())).toEqual({ date: '2026-08-12' });
    expect(store.getJSON(mediaKey('media_ono_extract'))).toMatchObject({
      id: 'media_ono_extract',
      media_type: 'pdf'
    });
    expect(store.getJSON(mediaKey('media_syllabus_link'))).toMatchObject({
      id: 'media_syllabus_link',
      media_type: 'link'
    });
    expect(store.getJSON(mediaKey('media_cover_image'))).toMatchObject({
      id: 'media_cover_image',
      media_type: 'image'
    });
  });

  it('keeps draft and published lesson keys distinct', () => {
    store.loadSeed(seed);

    const draftKey = draftLessonKey('lesson_aotfw_008');
    const publishedKey = publishedLessonKey('lesson_aotfw_008');

    expect(store.get(publishedKey)).toBeUndefined();

    store.setJSON(draftKey, {
      ...(store.getJSON(draftKey) as object),
      title: 'Updated draft title'
    });

    expect(store.getJSON(draftKey)).toMatchObject({
      title: 'Updated draft title'
    });
    expect(store.get(publishedKey)).toBeUndefined();
  });
});
