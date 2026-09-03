import { SubjectSchema, type Subject } from '@/schemas';

const YEAR_PREFIX = /^Year\s+\d+\s+/i;

export type MigrateSubjectResult =
  | { ok: true; subject: Subject; changed: boolean }
  | { ok: false; error: string };

function asRecord(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return { ...(raw as Record<string, unknown>) };
}

export function migrateSubjectRecord(raw: unknown): MigrateSubjectResult {
  const record = asRecord(raw);
  if (!record) {
    return { ok: false, error: 'Malformed subject: expected an object' };
  }

  const hadYearId = Object.prototype.hasOwnProperty.call(record, 'year_id');
  const previousDisplay =
    typeof record.display_title === 'string' ? record.display_title : undefined;
  delete record.year_id;

  if (
    typeof record.title === 'string' &&
    typeof record.display_title === 'string' &&
    YEAR_PREFIX.test(record.display_title)
  ) {
    record.display_title = record.title;
  }

  const parsed = SubjectSchema.safeParse(record);
  if (!parsed.success) {
    return { ok: false, error: `Malformed subject: ${parsed.error.message}` };
  }

  const changed = hadYearId || previousDisplay !== parsed.data.display_title;
  return { ok: true, subject: parsed.data, changed };
}

export function migrateSubjectRecords(records: unknown[]): Subject[] {
  const migrated: Subject[] = [];
  for (const raw of records) {
    const result = migrateSubjectRecord(raw);
    if (!result.ok) {
      throw new Error(result.error);
    }
    migrated.push(result.subject);
  }
  return migrated;
}
