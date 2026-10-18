// apps/teaching/src/teacher/notion-import/preview-model.ts
import type { EntityOverride, ImportChoices, ImportPlanPreview, ImportWarning, WarningRule } from '@/notion-import/types';

export interface PreviewRow {
  page_id: string;
  depth: number;
  title: string;
  label: string;
  included: boolean;
  skipped_reason?: string;
  badge?: string;
  needs: string[];
  warning_count: number;
}

const RULE_TITLES: Partial<Record<WarningRule, string>> = {
  flattened: 'Layouts that were flattened',
  skipped: 'Skipped blocks',
  unsupported: 'Unsupported blocks',
  file_too_big: 'Files too big to store',
  file_failed: 'Files that failed',
  html_app: 'HTML that will run as an interactive',
  mermaid: 'Mermaid diagrams kept as code',
  alt_text: 'Images without alt text',
  outcome_unmatched: 'Outcomes not in the catalogue',
  limit: 'Limits reached',
  needs_choice: 'Choices needed',
  invalid: 'Not imported'
};

function childrenOf(plan: ImportPlanPreview, pageId: string): string[] {
  return [
    ...plan.entities.filter((e) => e.parent_page_id === pageId).map((e) => e.page_id),
    ...plan.skipped.filter((s) => s.parent_page_id === pageId).map((s) => s.page_id)
  ];
}

export function buildRows(plan: ImportPlanPreview, excluded: Set<string>): PreviewRow[] {
  const rows: PreviewRow[] = [];
  const walk = (pageId: string, depth: number) => {
    const entity = plan.entities.find((e) => e.page_id === pageId);
    const skipped = plan.skipped.find((s) => s.page_id === pageId);
    if (entity) {
      rows.push({
        page_id: pageId, depth, title: entity.title, label: entity.label, included: !excluded.has(pageId),
        badge: entity.existing ? 'Updates existing copy' : undefined, needs: entity.needs,
        warning_count: plan.warnings.filter((w) => w.page_id === pageId && w.rule !== 'needs_choice').length
      });
    } else if (skipped) {
      rows.push({ page_id: pageId, depth, title: skipped.title, label: 'Skipped', included: false, skipped_reason: skipped.reason, needs: [], warning_count: 0 });
    }
    for (const child of childrenOf(plan, pageId)) walk(child, depth + 1);
  };
  walk(plan.root_page_id, 0);
  return rows;
}

export function toggleExcluded(plan: ImportPlanPreview, excluded: Set<string>, pageId: string): Set<string> {
  const next = new Set(excluded);
  const subtree: string[] = [];
  // Skipped pages are never imported, so they stay out of the exclusion set.
  const collect = (id: string) => {
    subtree.push(id);
    plan.entities.filter((e) => e.parent_page_id === id).forEach((e) => collect(e.page_id));
  };
  collect(pageId);
  const exclude = !excluded.has(pageId);
  for (const id of subtree) {
    if (exclude) next.add(id);
    else next.delete(id);
  }
  return next;
}

export function groupWarnings(plan: ImportPlanPreview, excluded: Set<string>): Array<{ rule: WarningRule; title: string; items: ImportWarning[] }> {
  const groups = new Map<WarningRule, ImportWarning[]>();
  for (const w of plan.warnings) {
    if (excluded.has(w.page_id) || w.rule === 'needs_choice') continue;
    groups.set(w.rule, [...(groups.get(w.rule) ?? []), w]);
  }
  return [...groups].map(([rule, items]) => ({ rule, title: RULE_TITLES[rule] ?? rule, items }));
}

export function choicesFrom(excluded: Set<string>, overrides: Record<string, EntityOverride>, htmlAsCode: Set<string>): ImportChoices {
  return { excluded_page_ids: [...excluded], overrides, html_as_code: [...htmlAsCode] };
}
