import { afterEach, describe, expect, it, vi } from 'vitest';
import { openColumnForm } from '@/markbook/column-form';
import type { Column } from '@/markbook/schema';

const labels = [{ id: 'o1', code: 'EN12-1', title: 'Responds', group: 'A' }];
const field = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const type = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

afterEach(() => document.body.replaceChildren());

describe('column form', () => {
  it('builds an assessment with criteria, outcomes and bands', async () => {
    const onSave = vi.fn(async (_c: Column) => undefined);
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave, random: () => 0.1 });
    type(field(root, 'title'), 'Essay');
    type(field(root, 'weight'), '40');
    type(field(root, 'criterion-label'), 'Analysis');
    type(field(root, 'criterion-max'), '15');
    type(field(root, 'criterion-outcomes'), 'en12-1');
    type(field(root, 'criterion-bands'), 'A 13, B 10');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    const saved = onSave.mock.calls[0]![0];
    expect(saved).toMatchObject({ kind: 'assessment', title: 'Essay', date: '2026-11-03', weight: 40 });
    expect(saved.kind === 'assessment' && saved.criteria[0]).toMatchObject({ label: 'Analysis', max: 15, outcomes: ['o1'], bands: [{ label: 'A', min: 13 }, { label: 'B', min: 10 }] });
    expect(document.body.contains(root)).toBe(false);
  });

  it('names unknown outcome codes and bad bands without saving', async () => {
    const onSave = vi.fn();
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave });
    type(field(root, 'title'), 'Essay');
    type(field(root, 'criterion-label'), 'Analysis');
    type(field(root, 'criterion-max'), '15');
    type(field(root, 'criterion-outcomes'), 'EN99-1');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('EN99-1 isn’t an outcome code.');
    type(field(root, 'criterion-outcomes'), '');
    type(field(root, 'criterion-bands'), 'A, B 10');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('Write each band as a name then its lowest mark, like A 13.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds and removes criteria', () => {
    const root = openColumnForm({ kind: 'assessment', outcomes: [], today: '2026-11-03', onSave: vi.fn() });
    root.querySelector<HTMLButtonElement>('.mb-form__add-criterion')!.click();
    expect(root.querySelectorAll('.mb-form__criterion')).toHaveLength(2);
    root.querySelector<HTMLButtonElement>('.mb-form__remove-criterion')!.click();
    expect(root.querySelectorAll('.mb-form__criterion')).toHaveLength(1);
  });

  it('edits a hand-in and offers delete', async () => {
    const onSave = vi.fn(async (_c: Column) => undefined);
    const onDelete = vi.fn();
    const column: Column = { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' };
    const root = openColumnForm({ kind: 'handin', column, outcomes: [], today: '2026-11-03', onSave, onDelete });
    expect(field(root, 'title').value).toBe('Draft');
    type(field(root, 'date'), '2026-10-27');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-27' }));
  });

  it('builds a check with its scale', async () => {
    const onSave = vi.fn(async (_c: Column) => undefined);
    const root = openColumnForm({ kind: 'check', outcomes: [], today: '2026-11-03', onSave, random: () => 0.2 });
    type(field(root, 'title'), 'Bookwork');
    const scale = root.querySelector<HTMLSelectElement>('[name="scale"]')!;
    scale.value = 'four';
    scale.dispatchEvent(new Event('change'));
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave.mock.calls[0]![0]).toMatchObject({ kind: 'check', title: 'Bookwork', scale: 'four', date: '2026-11-03' }));
  });
});
