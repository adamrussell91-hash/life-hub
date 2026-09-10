import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export function formatStudentDate(iso: string): string {
  return formatDisplayDate(iso);
}
