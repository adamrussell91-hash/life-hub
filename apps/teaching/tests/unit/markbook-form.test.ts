import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn() }));

import { askConfirmCard } from '@/teacher/confirm-dialog';
import { openColumnForm } from '@/markbook/column-form';
import type { Column } from '@/markbook/schema';

const labels = [{ id: 'o1', code: 'EN12-1', title: 'Responds', group: 'A' }];
const field = (root: HTMLElement, name: string) => root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
const type = (input: HTMLInputElement | HTMLSelectElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

/** Distinct ids every call, so criteria never share one. */
const counter = () => {
  let n = 0;
  return () => ((Math.floor(n / 12) * 5 + n++) % 36) / 36;
};
const rows = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.mb-form__criterion')];
const inRow = (row: HTMLElement, name: string) => row.querySelector<HTMLInputElement>(`[name="${name}"]`)!;

afterEach(() => document.body.replaceChildren());

describe('column form', () => {
  it('builds an assessment with criteria, outcomes and bands', async () => {
    const onSave = vi.fn(async (_c: Column) => undefined);
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave, random: counter() });
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
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave, random: counter() });
    type(field(root, 'title'), 'Essay');
    type(field(root, 'criterion-label'), 'Analysis');
    type(field(root, 'criterion-max'), '15');
    type(field(root, 'criterion-outcomes'), 'EN99-1');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('In Analysis: EN99-1 isn’t an outcome code.');
    type(field(root, 'criterion-outcomes'), '');
    type(field(root, 'criterion-bands'), 'A, B 10');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('In Analysis: Write each band as a name then its lowest mark, like A 13.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('adds and removes criteria', () => {
    const root = openColumnForm({ kind: 'assessment', outcomes: [], today: '2026-11-03', onSave: vi.fn(), random: counter() });
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
    const root = openColumnForm({ kind: 'check', outcomes: [], today: '2026-11-03', onSave, random: counter() });
    type(field(root, 'title'), 'Bookwork');
    const scale = root.querySelector<HTMLSelectElement>('[name="scale"]')!;
    scale.value = 'four';
    scale.dispatchEvent(new Event('change'));
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave.mock.calls[0]![0]).toMatchObject({ kind: 'check', title: 'Bookwork', scale: 'four', date: '2026-11-03' }));
  });

  it('keeps typed text in the rows that stay when another is removed', () => {
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave: vi.fn(), random: counter() });
    root.querySelector<HTMLButtonElement>('.mb-form__add-criterion')!.click();
    const [first, second] = rows(root);
    type(inRow(first!, 'criterion-label'), 'Analysis');
    type(inRow(first!, 'criterion-max'), '15');
    type(inRow(first!, 'criterion-outcomes'), 'en12-1, EN99-9');
    type(inRow(first!, 'criterion-bands'), 'A 13, B');
    type(inRow(second!, 'criterion-label'), 'Spare');
    second!.querySelector<HTMLButtonElement>('.mb-form__remove-criterion')!.click();
    const [kept] = rows(root);
    expect(rows(root)).toHaveLength(1);
    expect(inRow(kept!, 'criterion-label').value).toBe('Analysis');
    expect(inRow(kept!, 'criterion-max').value).toBe('15');
    expect(inRow(kept!, 'criterion-outcomes').value).toBe('en12-1, EN99-9');
    expect(inRow(kept!, 'criterion-bands').value).toBe('A 13, B');
  });

  it('keeps a bad code and bad bands through Add criterion, and Save still names them', () => {
    const onSave = vi.fn();
    const root = openColumnForm({ kind: 'assessment', outcomes: labels, today: '2026-11-03', onSave, random: counter() });
    type(field(root, 'title'), 'Essay');
    const [first] = rows(root);
    type(inRow(first!, 'criterion-label'), 'Analysis');
    type(inRow(first!, 'criterion-outcomes'), 'EN99-1');
    type(inRow(first!, 'criterion-bands'), 'A, B 10');
    root.querySelector<HTMLButtonElement>('.mb-form__add-criterion')!.click();
    const [again, added] = rows(root);
    expect(inRow(again!, 'criterion-outcomes').value).toBe('EN99-1');
    expect(inRow(again!, 'criterion-bands').value).toBe('A, B 10');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('In Analysis: EN99-1 isn’t an outcome code.');
    type(inRow(again!, 'criterion-outcomes'), '');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('In Analysis: Write each band as a name then its lowest mark, like A 13.');
    type(inRow(again!, 'criterion-bands'), '');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('In criterion 2: Name each criterion.');
    void added;
    expect(onSave).not.toHaveBeenCalled();
  });

  it('asks for a weight when it is empty', () => {
    const onSave = vi.fn();
    const root = openColumnForm({ kind: 'assessment', outcomes: [], today: '2026-11-03', onSave, random: counter() });
    type(field(root, 'title'), 'Essay');
    type(field(root, 'weight'), '');
    type(field(root, 'criterion-label'), 'Analysis');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('Give a weight from 0 to 100.');
    type(field(root, 'weight'), '120');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    expect(root.querySelector('.mb-form__error')?.textContent).toBe('Weight is at most 100.');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('is a labelled modal dialog that Escape closes', () => {
    const root = openColumnForm({ kind: 'check', outcomes: [], today: '2026-11-03', onSave: vi.fn(), random: counter() });
    const form = root.querySelector<HTMLElement>('.mb-form')!;
    expect(form.getAttribute('role')).toBe('dialog');
    expect(form.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(form.getAttribute('aria-labelledby')!)?.textContent).toBe('Add check');
    field(root, 'title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.body.contains(root)).toBe(false);
  });

  it('won’t close while a save is in flight', async () => {
    let finish: () => void = () => {};
    const onSave = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    const root = openColumnForm({ kind: 'check', outcomes: [], today: '2026-11-03', onSave, random: counter() });
    type(field(root, 'title'), 'Bookwork');
    root.querySelector<HTMLButtonElement>('.mb-form__save')!.click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    field(root, 'title').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    root.querySelector<HTMLButtonElement>('.mb-form__actions .btn--secondary')!.click();
    expect(document.body.contains(root)).toBe(true);
    finish();
    await vi.waitFor(() => expect(document.body.contains(root)).toBe(false));
  });

  it('deletes only after the confirm card says yes', async () => {
    const column: Column = { id: 'hand00001', kind: 'handin', title: 'Draft', due: '2026-10-25' };
    const onDelete = vi.fn();
    vi.mocked(askConfirmCard).mockResolvedValueOnce(false);
    const root = openColumnForm({ kind: 'handin', column, outcomes: [], today: '2026-11-03', onSave: vi.fn(), onDelete });
    root.querySelector<HTMLButtonElement>('.mb-form__delete')!.click();
    await vi.waitFor(() => expect(askConfirmCard).toHaveBeenCalledWith(expect.objectContaining({ title: 'Delete Draft and every mark in it?' })));
    await new Promise((r) => setTimeout(r, 0));
    expect(onDelete).not.toHaveBeenCalled();
    expect(document.body.contains(root)).toBe(true);
    vi.mocked(askConfirmCard).mockResolvedValueOnce(true);
    root.querySelector<HTMLButtonElement>('.mb-form__delete')!.click();
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalled());
    expect(document.body.contains(root)).toBe(false);
  });
});
