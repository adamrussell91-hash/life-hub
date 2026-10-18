// apps/teaching/tests/unit/notion-import-modal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/notion-import/api', async (orig) => {
  const actual = await orig<typeof import('@/teacher/notion-import/api')>();
  return {
    ...actual,
    startPlan: vi.fn(async () => 'nij_plan0001'),
    startApply: vi.fn(async () => 'nij_appl0001'),
    waitForJob: vi.fn(async (id: string, onUpdate: (j: any) => void) => {
      const job = id === 'nij_plan0001'
        ? { id, kind: 'plan', status: 'planned', plan: {
            root_page_id: 'u1', new_subjects: [], media_count: 0, html_apps: [], skipped: [],
            warnings: [{ page_id: 'l1', notion_block_id: 'b', rule: 'flattened', message: 'Columns stacked.' }],
            entities: [
              { page_id: 'u1', parent_page_id: null, kind: 'unit', label: 'Unit', id: 'unit_n_u1', title: 'Made-up Unit', existing: false, needs: [], suggested: { year_id: 'year_7', subject_id: 'subject_1' } },
              { page_id: 'l1', parent_page_id: 'u1', kind: 'lesson', label: 'Lesson', id: 'lesson_n_l1', title: 'Made-up Lesson', existing: false, needs: [], suggested: {} }
            ] } }
        : { id, kind: 'apply', status: 'done', report: { written: ['unit_n_u1', 'lesson_n_l1'], skipped: [], warnings: [] } };
      onUpdate(job);
      return job;
    }),
    searchNotion: vi.fn(async () => ({ items: [] }))
  };
});

import { openNotionImportModal } from '@/teacher/notion-import/modal';
import { startApply } from '@/teacher/notion-import/api';

const curriculum: any = {
  years: [{ id: 'year_7', title: 'Year 7', year_level: 7 }],
  subjects: [{ id: 'subject_1', title: 'Made-up Subject', display_title: 'Made-up Subject' }],
  units: [], lessons: [], classes: [], scheduled_lessons: [], scope_sequences: [], media: [], schedule_anchor_date: '2026-10-18'
};
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('notion import modal', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('previews a pasted link, then imports with the chosen options', async () => {
    const onDone = vi.fn();
    openNotionImportModal({ curriculum, onDone });
    const input = document.querySelector<HTMLInputElement>('[data-notion-link]')!;
    input.value = 'https://www.notion.so/Made-up-0123456789abcdef0123456789abcdef';
    document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
    await flush(); await flush();

    const rows = [...document.querySelectorAll('[data-notion-row]')].map((r) => r.textContent);
    expect(rows[0]).toContain('Made-up Unit');
    expect(rows[1]).toContain('Made-up Lesson');
    expect(document.querySelector('[data-notion-warnings]')!.textContent).toContain('Columns stacked.');

    document.querySelector<HTMLInputElement>('[data-notion-include="l1"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-notion-import]')!.click();
    await flush(); await flush();

    expect(startApply).toHaveBeenCalledWith('01234567-89ab-cdef-0123-456789abcdef', expect.objectContaining({ excluded_page_ids: ['l1'] }));
    expect(document.querySelector('[data-notion-done]')!.textContent).toContain('2');
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ written: ['unit_n_u1', 'lesson_n_l1'] }));
  });

  it('shows an error for text that is not a Notion link', async () => {
    openNotionImportModal({ curriculum, onDone: vi.fn() });
    document.querySelector<HTMLInputElement>('[data-notion-link]')!.value = 'hello';
    document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
    await flush();
    expect(document.querySelector('[data-notion-error]')!.textContent).toMatch(/Notion link/);
  });

  it('closes on Escape, but not while typing in the link field', async () => {
    openNotionImportModal({ curriculum, onDone: vi.fn() });
    const input = document.querySelector<HTMLInputElement>('[data-notion-link]')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps Import off until a lesson that needs a unit has one', async () => {
    const { waitForJob } = await import('@/teacher/notion-import/api');
    vi.mocked(waitForJob).mockImplementationOnce(async (id: string, onUpdate: (j: any) => void) => {
      const job: any = { id, kind: 'plan', status: 'planned', plan: {
        root_page_id: 'l9', new_subjects: [], media_count: 0, html_apps: [], skipped: [], warnings: [],
        entities: [{ page_id: 'l9', parent_page_id: null, kind: 'lesson', label: 'Lesson', id: 'lesson_n_l9', title: 'Loose lesson', existing: false, needs: ['unit'], suggested: {} }] } };
      onUpdate(job);
      return job;
    });
    openNotionImportModal({ curriculum: { ...curriculum, units: [{ id: 'unit_a', title: 'Unit A' }] }, onDone: vi.fn() });
    document.querySelector<HTMLInputElement>('[data-notion-link]')!.value = '0123456789abcdef0123456789abcdef';
    document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
    await flush(); await flush();
    const importBtn = document.querySelector<HTMLButtonElement>('[data-notion-import]')!;
    expect(importBtn.disabled).toBe(true);
    const pick = document.querySelector<HTMLSelectElement>('[data-notion-picker="unit:l9"]')!;
    pick.value = 'unit_a';
    pick.dispatchEvent(new Event('change'));
    expect(importBtn.disabled).toBe(false);
  });
});
