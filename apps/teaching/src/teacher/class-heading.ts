import type { Class, Subject, Year } from '@/schemas';

export function classDisplayTitle(
  cls: Class,
  yearsById: ReadonlyMap<string, Year>,
  subjectsById: ReadonlyMap<string, Subject>
): string {
  const ownTitle = cls.title?.trim();
  if (ownTitle) return ownTitle;
  const subject = subjectsById.get(cls.subject_id);
  if (subject?.display_title) return subject.display_title;
  const year = yearsById.get(cls.year_id);
  const composed = [year?.title, subject?.title].filter(Boolean).join(' ');
  return composed || cls.code;
}

export function classEyebrow(cls: Class): string {
  return cls.code;
}
