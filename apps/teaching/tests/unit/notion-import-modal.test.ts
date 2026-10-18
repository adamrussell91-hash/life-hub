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
    openNotionImportModal({ curriculum: { ...curriculum, units: [{ id: 'unit_a', title: 'Unit A', status: 'active' }] }, onDone: vi.fn() });
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

// ---- Review fixes ----
import { JobTimeoutError, waitForJob } from '@/teacher/notion-import/api';

const ent = (page_id: string, parent_page_id: string | null, kind: string, extra: Record<string, unknown> = {}) => ({
  page_id, parent_page_id, kind, label: kind, id: `${kind}_n_${page_id}`, title: `Title ${page_id}`,
  existing: false, needs: [], suggested: {}, ...extra
});
const planOf = (entities: any[], extra: Record<string, unknown> = {}) => ({
  root_page_id: entities[0].page_id, entities, skipped: [], warnings: [], html_apps: [], new_subjects: [], media_count: 0, ...extra
});
const LINK = '0123456789abcdef0123456789abcdef';
const PAGE = '01234567-89ab-cdef-0123-456789abcdef';

async function openWith(plan: any, curr: any = curriculum, onDone: any = vi.fn()) {
  vi.mocked(waitForJob).mockImplementationOnce(async (id: string, onUpdate: (j: any) => void) => {
    const job: any = { id, kind: 'plan', status: 'planned', plan };
    onUpdate(job);
    return job;
  });
  openNotionImportModal({ curriculum: curr, onDone });
  document.querySelector<HTMLInputElement>('[data-notion-link]')!.value = LINK;
  document.querySelector<HTMLButtonElement>('[data-notion-preview]')!.click();
  await flush(); await flush();
}
const importBtn = () => document.querySelector<HTMLButtonElement>('[data-notion-import]')!;
const pickerEl = (hook: string) => document.querySelector<HTMLSelectElement>(`[data-notion-picker="${hook}"]`)!;
const choose = (hook: string, value: string) => {
  const sel = pickerEl(hook);
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
};

describe('notion import modal review fixes', () => {
  beforeEach(() => { document.body.innerHTML = ''; vi.mocked(startApply).mockClear(); });

  it('imports a root unit with a suggested new subject without touching the picker', async () => {
    await openWith(planOf([ent('u1', null, 'unit', { needs: ['subject'], suggested: { year_id: 'year_7', subject_title: 'Brand new' } })]));
    expect(importBtn().disabled).toBe(false);
    importBtn().click();
    await flush();
    expect(startApply).toHaveBeenCalledWith(PAGE, expect.objectContaining({ overrides: { u1: { create_subject_title: 'Brand new' } } }));
  });

  it('a root choice satisfies children that inherit year and subject', async () => {
    await openWith(planOf([
      ent('c1', null, 'class', { needs: ['year', 'subject'] }),
      ent('u1', 'c1', 'unit', { needs: ['year', 'subject'] })
    ]));
    expect(importBtn().disabled).toBe(true);
    choose('year:c1', 'year_7');
    expect(importBtn().disabled).toBe(true);
    choose('subject:c1', 'subject_1');
    expect(importBtn().disabled).toBe(false);
  });

  it('pluralises the choices hint', async () => {
    await openWith(planOf([ent('l1', null, 'lesson', { needs: ['unit'] })]));
    expect(document.querySelector('.notion-import__hint')!.textContent).toBe('1 item still needs a choice.');
    document.body.innerHTML = '';
    await openWith(planOf([ent('c1', null, 'class', { needs: ['year'] }), ent('c2', 'c1', 'lesson', { needs: ['unit'] })]));
    expect(document.querySelector('.notion-import__hint')!.textContent).toBe('2 items still need a choice.');
  });

  it('shows children of an excluded parent unticked and disabled', async () => {
    await openWith(planOf([ent('u1', null, 'unit'), ent('l1', 'u1', 'lesson')]));
    document.querySelector<HTMLInputElement>('[data-notion-include="u1"]')!.click();
    const child = document.querySelector<HTMLInputElement>('[data-notion-include="l1"]')!;
    expect(child.checked).toBe(false);
    expect(child.disabled).toBe(true);
    expect(child.title).toMatch(/parent/i);
  });

  it('moves focus into the dialog after each step', async () => {
    await openWith(planOf([ent('u1', null, 'unit')]));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('aborts polling on close and never calls onDone', async () => {
    const onDone = vi.fn();
    await openWith(planOf([ent('u1', null, 'unit')]), curriculum, onDone);
    let signal: AbortSignal | undefined;
    let finish!: (j: any) => void;
    vi.mocked(waitForJob).mockImplementationOnce((_id: string, _u: any, o: any) => {
      signal = o?.signal;
      return new Promise((resolve) => { finish = resolve; });
    });
    importBtn().click();
    await flush();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(signal?.aborted).toBe(true);
    finish({ id: 'x', kind: 'apply', status: 'done', report: { written: ['unit_n_u1'], skipped: [], warnings: [] } });
    await flush(); await flush();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('lists only active units and subjects', async () => {
    const curr = {
      ...curriculum,
      units: [{ id: 'unit_a', title: 'Live unit', status: 'active' }, { id: 'unit_b', title: 'Old unit', status: 'archived' }],
      subjects: [{ id: 's1', title: 'Live subject', status: 'active' }, { id: 's2', title: 'Old subject', status: 'archived' }]
    };
    await openWith(planOf([ent('l1', null, 'lesson', { needs: ['unit'] }), ent('u9', 'l1', 'unit', { needs: ['subject'] })]), curr);
    const unitOptions = [...pickerEl('unit:l1').options].map((o) => o.textContent);
    expect(unitOptions).toContain('Live unit');
    expect(unitOptions).not.toContain('Old unit');
    const subjectOptions = [...pickerEl('subject:u9').options].map((o) => o.textContent);
    expect(subjectOptions).toContain('Live subject');
    expect(subjectOptions).not.toContain('Old subject');
  });

  it('labels pickers for screen readers', async () => {
    await openWith(planOf([ent('l1', null, 'lesson', { title: 'Cell walls', needs: ['unit'] })]));
    expect(pickerEl('unit:l1').getAttribute('aria-label')).toBe('Unit for Cell walls');
  });

  it('Escape in a checkbox closes the dialog', async () => {
    await openWith(planOf([ent('l1', null, 'lesson', { needs: ['unit'] })]));
    document.querySelector('[data-notion-include="l1"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows the import report with skipped items and warnings', async () => {
    await openWith(planOf([ent('u1', null, 'unit'), ent('l1', 'u1', 'lesson')], { skipped: [{ page_id: 'm1', parent_page_id: 'u1', title: 'Map page', reason: 'Not imported.' }] }));
    vi.mocked(waitForJob).mockImplementationOnce(async (id: string, onUpdate: (j: any) => void) => {
      const job: any = { id, kind: 'apply', status: 'done', report: {
        written: ['unit_n_u1'], skipped: [{ page_id: 'l1', reason: 'Needs a unit.' }],
        warnings: [{ page_id: 'u1', notion_block_id: 'b', rule: 'file_too_big', message: 'Big file left behind.' }] } };
      onUpdate(job);
      return job;
    });
    importBtn().click();
    await flush(); await flush();
    const done = document.querySelector('[data-notion-done]')!;
    expect(done.textContent).toContain('Imported 1 item.');
    const details = [...done.querySelectorAll('details')].map((d) => d.textContent);
    expect(details.some((t) => t!.includes('Title l1') && t!.includes('Needs a unit.'))).toBe(true);
    expect(details.some((t) => t!.includes('Big file left behind.'))).toBe(true);
  });

  it('offers Check again after a timeout and polls the same job', async () => {
    await openWith(planOf([ent('u1', null, 'unit')]));
    vi.mocked(waitForJob).mockRejectedValueOnce(new JobTimeoutError());
    importBtn().click();
    await flush(); await flush();
    expect(document.querySelector('[data-notion-error]')!.textContent).toMatch(/too long/);
    expect(document.querySelector('[data-notion-import]')).toBeNull();
    vi.mocked(waitForJob).mockClear();
    vi.mocked(waitForJob).mockImplementationOnce(async (id: string, onUpdate: (j: any) => void) => {
      const job: any = { id, kind: 'apply', status: 'done', report: { written: ['unit_n_u1'], skipped: [], warnings: [] } };
      onUpdate(job);
      return job;
    });
    document.querySelector<HTMLButtonElement>('[data-notion-check-again]')!.click();
    await flush(); await flush();
    expect(vi.mocked(waitForJob).mock.calls[0]![0]).toBe('nij_appl0001');
    expect(document.querySelector('[data-notion-done]')).not.toBeNull();
  });

  it('shows reading progress in one persistent status node', async () => {
    await openWith(planOf([ent('u1', null, 'unit')]));
    let update!: (j: any) => void;
    let finish!: (j: any) => void;
    vi.mocked(waitForJob).mockImplementationOnce((_id: string, u: any) => { update = u; return new Promise((r) => { finish = r; }); });
    importBtn().click();
    await flush();
    update({ id: 'x', kind: 'apply', status: 'running', progress: { phase: 'media', done: 2, total: 5 } });
    const status = document.querySelector('[role="status"]')!;
    expect(status.textContent).toBe('Copying files 2 of 5…');
    update({ id: 'x', kind: 'apply', status: 'running', progress: { phase: 'write', done: 3, total: 5 } });
    expect(document.querySelector('[role="status"]')).toBe(status);
    expect(status.textContent).toBe('Saving 3 of 5…');
    finish({ id: 'x', kind: 'apply', status: 'failed', error: 'x' });
  });
});
