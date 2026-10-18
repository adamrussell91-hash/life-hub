import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let captured: { onDone: (r: any) => void } | null = null;
vi.mock('@/teacher/notion-import/modal', () => ({
  openNotionImportModal: vi.fn((o: any) => { captured = o; return { close: () => {} }; })
}));
vi.mock('@/app/router', () => ({ navigate: vi.fn() }));
vi.mock('@/app/curriculum-state', () => ({ reconcileCurriculum: vi.fn(async () => ({})) }));

import { navigate } from '@/app/router';
import { reconcileCurriculum } from '@/app/curriculum-state';
import { mountCreateControl } from '@/teacher/create/control';

describe('create menu: Import from Notion onDone', () => {
  const onCreated = vi.fn();
  let host: HTMLElement;
  beforeEach(() => {
    onCreated.mockReset();
    vi.mocked(reconcileCurriculum).mockClear();
    vi.mocked(navigate).mockClear();
    host = document.createElement('div');
    document.body.append(host);
    mountCreateControl(host, { context: 'home', curriculum: { years: [], subjects: [], units: [], lessons: [], classes: [] } as any, onCreated });
    host.querySelector<HTMLButtonElement>('[data-create-trigger]')!.click();
    host.querySelector<HTMLButtonElement>('[data-create-import="notion"]')!.click();
  });
  afterEach(() => { document.body.replaceChildren(); });
  const report = (written: string[]) => ({ written, skipped: [], warnings: [] });

  it('opens a class', () => {
    captured!.onDone(report(['class_n_a']));
    expect(onCreated).toHaveBeenCalledWith('class', 'class_n_a');
  });
  it('otherwise opens the first unit or lesson', () => {
    captured!.onDone(report(['document_n_x', 'lesson_n_y', 'unit_n_z']));
    expect(onCreated).toHaveBeenCalledWith('lesson', 'lesson_n_y');
  });
  it('opens the syllabus when it is the only navigable record', async () => {
    captured!.onDone(report(['document_n_x']));
    expect(onCreated).not.toHaveBeenCalled();
    expect(reconcileCurriculum).toHaveBeenCalled();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/documents/document_n_x'));
  });
  it('only refreshes when there is nothing to open', () => {
    captured!.onDone(report(['subject_n_x']));
    expect(reconcileCurriculum).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
