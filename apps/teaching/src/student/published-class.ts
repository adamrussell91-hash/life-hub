import { apiGet } from '@/api/client';
import type { Block, Cover } from '@/schemas';

export interface PublishedClassScheduleRow {
  id: string;
  date: string;
  schedule_order: number;
  lesson_id: string;
  unit_id: string;
  title: string;
  published: boolean;
  delivery_status?: 'planned' | 'current' | 'delivered' | 'skipped' | 'rescheduled';
}

export interface PublishedClass {
  id: string;
  code: string;
  title: string;
  display_name?: string;
  cover?: Cover;
  homepage: {
    announcements: Block[];
    resources: Block[];
    custom: Block[];
  };
  current_unit?: {
    id: string;
    title: string;
    lessons: Array<{ id: string; title: string }>;
    cover?: Cover;
  };
  current_lesson?: { id: string; title: string; lesson_id: string };
  schedule: PublishedClassScheduleRow[];
  active_units: Array<{ id: string; title: string; cover?: Cover }>;
}

export function fetchPublishedClass(classId: string): Promise<PublishedClass> {
  return apiGet(`/api/published/classes/${classId}`);
}
