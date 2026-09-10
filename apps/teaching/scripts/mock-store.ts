import {
  yearKey,
  subjectKey,
  scopeSequenceKey,
  unitKey,
  draftLessonKey,
  classKey,
  scheduledLessonKey,
  scheduleAnchorKey,
  mediaKey,
  outcomeKey
} from '../src/storage/keys';

export type SeedData = {
  years: unknown[];
  subjects: unknown[];
  scope_sequences: unknown[];
  units: unknown[];
  lessons: unknown[];
  classes: unknown[];
  scheduled_lessons: unknown[];
  media?: unknown[];
  outcomes?: unknown[];
  schedule_anchor_date: string;
};

export class MockStore {
  private readonly blobs = new Map<string, string>();
  private readonly binaries = new Map<string, { bytes: Uint8Array; contentType: string }>();

  get(key: string): string | undefined {
    return this.blobs.get(key);
  }

  set(key: string, value: string): void {
    this.blobs.set(key, value);
  }

  delete(key: string): boolean {
    this.binaries.delete(key);
    return this.blobs.delete(key);
  }

  setBinary(key: string, bytes: Uint8Array, contentType: string): void {
    this.binaries.set(key, { bytes, contentType });
  }

  getBinary(key: string): { bytes: Uint8Array; contentType: string } | undefined {
    return this.binaries.get(key);
  }

  getJSON<T = unknown>(key: string): T | undefined {
    const raw = this.get(key);
    if (raw === undefined) {
      return undefined;
    }
    return JSON.parse(raw) as T;
  }

  setJSON(key: string, value: unknown): void {
    this.set(key, JSON.stringify(value));
  }

  listKeys(prefix = ''): string[] {
    return [...this.blobs.keys()].filter((key) => key.startsWith(prefix));
  }

  loadSeed(seed: SeedData): void {
    for (const year of seed.years) {
      const id = (year as { id: string }).id;
      this.setJSON(yearKey(id), year);
    }

    for (const subject of seed.subjects) {
      const id = (subject as { id: string }).id;
      this.setJSON(subjectKey(id), subject);
    }

    for (const scope of seed.scope_sequences ?? []) {
      const id = (scope as { id: string }).id;
      this.setJSON(scopeSequenceKey(id), scope);
    }

    for (const unit of seed.units) {
      const id = (unit as { id: string }).id;
      this.setJSON(unitKey(id), unit);
    }

    for (const lesson of seed.lessons) {
      const id = (lesson as { id: string }).id;
      this.setJSON(draftLessonKey(id), lesson);
    }

    for (const cls of seed.classes) {
      const id = (cls as { id: string }).id;
      this.setJSON(classKey(id), cls);
    }

    for (const scheduled of seed.scheduled_lessons) {
      const id = (scheduled as { id: string }).id;
      this.setJSON(scheduledLessonKey(id), scheduled);
    }

    for (const item of seed.media ?? []) {
      const id = (item as { id: string }).id;
      this.setJSON(mediaKey(id), item);
    }

    for (const item of seed.outcomes ?? []) {
      const id = (item as { id: string }).id;
      this.setJSON(outcomeKey(id), item);
    }

    this.setJSON(scheduleAnchorKey(), { date: seed.schedule_anchor_date });
  }
}
