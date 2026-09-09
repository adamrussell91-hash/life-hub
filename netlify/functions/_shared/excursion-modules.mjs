/**
 * Ported from apps/tasks/src/domain/excursion-modules.ts — keep the two in
 * sync by hand (see excursion-plan.mjs for why Netlify Functions port
 * TypeScript domain logic instead of importing it).
 */

export const DEFAULT_COMPLIANCE_MODULES = [
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

export function cloneDefaultComplianceModules() {
  return DEFAULT_COMPLIANCE_MODULES.map((module) => ({ ...module }));
}
