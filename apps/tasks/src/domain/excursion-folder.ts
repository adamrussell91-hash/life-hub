import type { FolderItem } from '@/schemas/project';

/**
 * The real Excursion Folder contents (SAC Excursion Folder cover sheet) —
 * what actually has to be assembled and filed after the trip, not a generic
 * "documentation done" checkbox.
 */
export const DEFAULT_FOLDER_ITEM_NAMES: string[] = [
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

export function cloneDefaultFolderItems(): FolderItem[] {
  return DEFAULT_FOLDER_ITEM_NAMES.map((name, index) => ({
    id: `folder_${index}`,
    name,
    on: false
  }));
}
