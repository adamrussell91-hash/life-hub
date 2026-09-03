import type { CurriculumOutcome } from '@/schemas/outcome';

export type OutcomeStripHandle = {
  update(next?: unknown): void;
  element: HTMLElement;
  dispose(): void;
};

export function publicOutcomesForPage(
  _page: { outcome_ids?: string[]; syllabus_outcomes?: string[] },
  _catalog: CurriculumOutcome[] = []
): never[] {
  return [];
}

/** Curriculum outcomes stay on Teaching Hub. Tasks pages skip the strip. */
export function mountOutcomeStrip(
  host: HTMLElement,
  _options?: {
    catalog?: CurriculumOutcome[];
    subject?: { id: string; outcome_ids: string[] };
    attached?: { outcome_ids?: string[]; syllabus_outcomes?: string[] };
    editable?: boolean;
    onChange?: (ids: string[]) => void;
    onCatalogChange?: (created: CurriculumOutcome) => void;
  }
): OutcomeStripHandle {
  const element = document.createElement('div');
  element.hidden = true;
  host.append(element);
  return {
    update(_next?: unknown) {},
    element,
    dispose() {
      element.remove();
    }
  };
}
