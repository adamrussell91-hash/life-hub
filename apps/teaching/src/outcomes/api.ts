import { apiPost } from '@/api/client';
import type { CurriculumOutcome } from '@/schemas/outcome';

export function createCustomOutcome(body: {
  subject_id: string;
  code: string;
  title: string;
  description: string;
  group?: string;
}): Promise<CurriculumOutcome> {
  return apiPost('/api/outcomes', body);
}
