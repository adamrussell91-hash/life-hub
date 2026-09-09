/**
 * Ported from apps/tasks/src/domain/excursion-folder.ts — keep in sync by hand.
 */

export const DEFAULT_FOLDER_ITEM_NAMES = [
  'Excursion Checklist',
  'Emergency Response Card',
  'Excursion Running Sheet and Transport',
  'Transportation Details Log',
  'Student Roll',
  'Medical Notes',
  'Medical Plan',
  'Emergency Evacuation Plan from Venue',
  'Venue Risk Assessment / Public Liability',
  'Venue Map',
  'Risk Assessment',
  'Permission Forms',
  'Medications Administered Log',
  'Accident / Injury Log',
  'SAC Excursion Policy',
  'Medication Administration Policy'
];

export function cloneDefaultFolderItems() {
  return DEFAULT_FOLDER_ITEM_NAMES.map((name, index) => ({
    id: `folder_${index}`,
    name,
    on: false
  }));
}
