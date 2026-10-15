/**
 * Classes that run the lesson currently open in the editor. A lesson belongs to
 * a unit and every class teaching that unit shares it, so class notes on a
 * toolkit block are kept per class (`teacher_jots[classId]`). The empty key
 * holds notes for every class.
 */

export type ToolkitClassOption = { id: string; label: string };

export const ALL_CLASSES_KEY = '';

let classes: ToolkitClassOption[] = [];
let activeClassId = ALL_CLASSES_KEY;

export function setToolkitClasses(next: ToolkitClassOption[]): void {
  classes = next;
  if (activeClassId && !classes.some((row) => row.id === activeClassId)) {
    activeClassId = ALL_CLASSES_KEY;
  }
}

export function toolkitClasses(): ToolkitClassOption[] {
  return classes;
}

export function activeToolkitClass(): string {
  return activeClassId;
}

export function setActiveToolkitClass(id: string): void {
  activeClassId = id;
}

export function classLabel(id: string): string {
  if (id === ALL_CLASSES_KEY) return 'All classes';
  return classes.find((row) => row.id === id)?.label ?? 'Another class';
}
