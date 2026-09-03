import { ExcursionTemplateSchema, type ExcursionTemplate } from '@/schemas/templates';

export const DEFAULT_EXCURSION_TEMPLATE_ID = 'ext_excursion';
export const DEFAULT_EXCURSION_TITLE = 'Excursion';

/** Git source of truth — one generic excursion template, not per-competition copies. */
export const DEFAULT_EXCURSION_TEMPLATE: ExcursionTemplate = ExcursionTemplateSchema.parse({
  schema_version: 1,
  id: DEFAULT_EXCURSION_TEMPLATE_ID,
  name: 'excursion template',
  default_lead_times: {
    permission_note_days: 21,
    staff_email_days: 21,
    risk_assessment_days: 42,
    payment_days: 28
  },
  checklist_items: [
    'Permission note drafted and sent',
    'Staff absence email sent',
    'Risk assessment lodged',
    'Payment confirmed',
    'Student list finalised'
  ]
});

const LEGACY_TEMPLATE_IDS = new Set(['ext_ethics_olympiad', 'ext_da_vinci']);

export function catalogExcursionTemplates(): ExcursionTemplate[] {
  return [DEFAULT_EXCURSION_TEMPLATE];
}

export function resolveExcursionTemplateId(id: string | null | undefined): string {
  if (!id || LEGACY_TEMPLATE_IDS.has(id)) return DEFAULT_EXCURSION_TEMPLATE_ID;
  return id;
}
