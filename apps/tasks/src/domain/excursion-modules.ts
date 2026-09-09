import type { ComplianceModule, ComplianceModuleCategory } from '@/schemas/project';

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceModuleCategory, string> = {
  staff: 'Staff & supervision',
  medical: 'Student safety & medical',
  transport: 'Transport & running sheet',
  docs: 'Documentation & risk',
  dayof: 'Day-of',
  post: 'Post-excursion'
};

export const COMPLIANCE_CATEGORY_ORDER: ComplianceModuleCategory[] = [
  'staff',
  'medical',
  'transport',
  'docs',
  'dayof',
  'post'
];

/**
 * The excursion compliance checklist, sourced from the actual SAC Excursion
 * Checklist / Excursion Folder — not the four generic admin tasks. Attached
 * once per excursion (see excursions.ts), on by default; every item toggles
 * independently and drives excursionClearance() for the critical subset.
 */
export const DEFAULT_COMPLIANCE_MODULES: ComplianceModule[] = [
  {
    id: 'wwcc',
    category: 'staff',
    label: 'WWCC verified for all supervising staff',
    sub: 'Cross-checked against Manresa',
    on: true,
    critical: true
  },
  {
    id: 'first_aid_currency',
    category: 'staff',
    label: 'First Aid / CPR / Anaphylaxis currency confirmed',
    sub: null,
    on: true,
    critical: true
  },
  {
    id: 'medical_cross_check',
    category: 'medical',
    label: 'Medical cross-check completed',
    sub: 'Against Manresa, permission forms, and the school nurse',
    on: false,
    critical: true
  },
  {
    id: 'medication_confirmed',
    category: 'medical',
    label: 'Anaphylaxis / asthma / Schedule 8 students confirmed carrying medication',
    sub: null,
    on: false,
    critical: true
  },
  {
    id: 'permission_notes_tracked',
    category: 'medical',
    label: 'Permission notes sent & tracked',
    sub: null,
    on: true,
    critical: false
  },
  {
    id: 'running_sheet_built',
    category: 'transport',
    label: 'Running sheet built with roll-call points',
    sub: null,
    on: true,
    critical: false
  },
  {
    id: 'transport_documented',
    category: 'transport',
    label: 'Coach / bus hire (or public transport) documented',
    sub: null,
    on: true,
    critical: false
  },
  {
    id: 'risk_assessment_lodged',
    category: 'docs',
    label: 'Risk assessment lodged',
    sub: null,
    on: false,
    critical: true
  },
  {
    id: 'venue_risk_sighted',
    category: 'docs',
    label: 'Venue risk assessment & public liability sighted',
    sub: null,
    on: false,
    critical: false
  },
  {
    id: 'safety_sheet_generated',
    category: 'dayof',
    label: 'Student safety sheet generated & printed',
    sub: null,
    on: true,
    critical: false
  },
  {
    id: 'emergency_card_generated',
    category: 'dayof',
    label: 'Emergency response card generated',
    sub: null,
    on: true,
    critical: false
  },
  {
    id: 'logs_scanned',
    category: 'post',
    label: 'Medication/accident logs scanned to nurse & line manager',
    sub: null,
    on: false,
    critical: false
  },
  {
    id: 'records_destroyed',
    category: 'post',
    label: 'Confidential student information destroyed',
    sub: null,
    on: false,
    critical: false
  }
];

export function cloneDefaultComplianceModules(): ComplianceModule[] {
  return DEFAULT_COMPLIANCE_MODULES.map((module) => ({ ...module }));
}

export function complianceModulesByCategory(
  modules: ComplianceModule[]
): Array<{ category: ComplianceModuleCategory; label: string; modules: ComplianceModule[] }> {
  return COMPLIANCE_CATEGORY_ORDER.map((category) => ({
    category,
    label: COMPLIANCE_CATEGORY_LABELS[category],
    modules: modules.filter((module) => module.category === category)
  })).filter((group) => group.modules.length > 0);
}
