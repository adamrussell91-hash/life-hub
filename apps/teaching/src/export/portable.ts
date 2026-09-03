import type { Lesson } from '@/schemas/lesson';
import type { Unit } from '@/schemas/unit';

export const PORTABLE_PRODUCT = 'Teaching Hub';
export const PORTABLE_EXPORT_VERSION = 1 as const;

export type PortableKind = 'lesson' | 'unit' | 'archive';

export interface PortableExport {
  product: typeof PORTABLE_PRODUCT;
  export_version: typeof PORTABLE_EXPORT_VERSION;
  kind: PortableKind;
  created_at: string;
  schema_version: 1;
  objects: Record<string, number>;
  lesson?: Lesson;
  unit?: Unit;
  lessons?: Lesson[];
  years?: unknown[];
  subjects?: unknown[];
  units?: unknown[];
  classes?: unknown[];
  scheduled_lessons?: unknown[];
  scope_sequences?: unknown[];
  media?: unknown[];
  outcomes?: unknown[];
  compositions?: unknown[];
  lesson_templates?: unknown[];
  unit_templates?: unknown[];
  schedule_anchor_date?: string;
  media_files?: never;
  ai_jobs?: never;
}

export interface ArchiveBundle {
  years: unknown[];
  subjects: unknown[];
  units: unknown[];
  lessons: Lesson[];
  classes: unknown[];
  scheduled_lessons: unknown[];
  scope_sequences: unknown[];
  media: unknown[];
  outcomes: unknown[];
  compositions: unknown[];
  lesson_templates: unknown[];
  unit_templates: unknown[];
  schedule_anchor_date: string;
}

function envelope(
  kind: PortableKind,
  created_at: string,
  objects: Record<string, number>,
  rest: Omit<
    PortableExport,
    'product' | 'export_version' | 'kind' | 'created_at' | 'schema_version' | 'objects'
  >
): PortableExport {
  return {
    product: PORTABLE_PRODUCT,
    export_version: PORTABLE_EXPORT_VERSION,
    kind,
    created_at,
    schema_version: 1,
    objects,
    ...rest
  };
}

export function buildLessonExport(lesson: Lesson, createdAt: string): PortableExport {
  return envelope('lesson', createdAt, { lessons: 1 }, { lesson });
}

export function buildUnitExport(unit: Unit, lessons: Lesson[], createdAt: string): PortableExport {
  return envelope('unit', createdAt, { units: 1, lessons: lessons.length }, { unit, lessons });
}

export function buildArchiveExport(bundle: ArchiveBundle, createdAt: string): PortableExport {
  return envelope(
    'archive',
    createdAt,
    {
      years: bundle.years.length,
      subjects: bundle.subjects.length,
      units: bundle.units.length,
      lessons: bundle.lessons.length,
      classes: bundle.classes.length,
      scheduled_lessons: bundle.scheduled_lessons.length,
      scope_sequences: bundle.scope_sequences.length,
      media: bundle.media.length,
      outcomes: bundle.outcomes.length,
      compositions: bundle.compositions.length,
      lesson_templates: bundle.lesson_templates.length,
      unit_templates: bundle.unit_templates.length
    },
    {
      years: bundle.years,
      subjects: bundle.subjects,
      units: bundle.units,
      lessons: bundle.lessons,
      classes: bundle.classes,
      scheduled_lessons: bundle.scheduled_lessons,
      scope_sequences: bundle.scope_sequences,
      media: bundle.media,
      outcomes: bundle.outcomes,
      compositions: bundle.compositions,
      lesson_templates: bundle.lesson_templates,
      unit_templates: bundle.unit_templates,
      schedule_anchor_date: bundle.schedule_anchor_date
    }
  );
}

export function exportFilename(kind: PortableKind, slug = ''): string {
  const safe = slug.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || kind;
  if (kind === 'archive') return 'teaching-hub-archive.json';
  return `teaching-hub-${kind}-${safe}.json`;
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
