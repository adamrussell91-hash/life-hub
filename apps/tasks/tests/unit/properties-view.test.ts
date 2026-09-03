import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TASK_PROPERTY_CONFIG } from '@/domain/task-properties-defaults';
import { loadTaskProperties, saveTaskProperties } from '@/services/task-properties';
import { renderPropertiesView } from '@/views/properties';

vi.mock('@/services/task-properties', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/task-properties')>();
  return {
    ...actual,
    loadTaskProperties: vi.fn(),
    saveTaskProperties: vi.fn()
  };
});

describe('properties view', () => {
  beforeEach(() => {
    vi.mocked(loadTaskProperties).mockReset();
    vi.mocked(saveTaskProperties).mockReset();
    vi.mocked(loadTaskProperties).mockResolvedValue(structuredClone(DEFAULT_TASK_PROPERTY_CONFIG));
    vi.mocked(saveTaskProperties).mockImplementation(async (config) => structuredClone(config));
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  it('explains each category and hides the technical id', async () => {
    const canvas = document.createElement('div');
    await renderPropertiesView(canvas);

    const sections = [...canvas.querySelectorAll('.property-section')];
    expect(sections).toHaveLength(7);
    expect(sections.map((section) => section.querySelector('.section-title')?.textContent)).toEqual([
      'Domains',
      'Urgency / priority',
      'Statuses',
      'Kinds',
      'Buckets',
      'Sources',
      'Tag vocabulary'
    ]);
    expect(sections[0]?.querySelector('.property-section__lede')?.textContent).toMatch(/Life and work areas/);
    expect(sections[1]?.querySelector('.property-section__lede')?.textContent).toMatch(/How soon a task/);

    const domains = canvas.querySelector('.property-section');
    expect(
      [...domains!.querySelectorAll('.property-list__head .hub-field__label')].map(
        (node) => node.textContent
      )
    ).toEqual(['Name', 'Colour', 'Actions']);
    const domainRow = canvas.querySelector('.property-row--colour');
    expect(domainRow).not.toBeNull();
    expect(domainRow?.querySelectorAll('input[type="text"]')).toHaveLength(1);
    expect(domainRow?.querySelector('input[type="color"]')).not.toBeNull();
    expect(canvas.querySelector('input[placeholder="id"]')).toBeNull();
    expect(canvas.textContent).not.toContain('technical id');
  });

  it('keeps existing ids when a name changes and slugs new rows', async () => {
    const canvas = document.createElement('div');
    await renderPropertiesView(canvas);

    const firstName = canvas.querySelector<HTMLInputElement>(
      '.property-row--colour input[type="text"]'
    );
    expect(firstName?.value).toBe('teaching');
    firstName!.value = 'School';
    firstName!.dispatchEvent(new Event('input'));

    const add = canvas.querySelector<HTMLButtonElement>('.property-section .btn--secondary');
    add?.click();

    const domainRows = canvas.querySelectorAll('.property-section .property-row--colour');
    const newest = domainRows[domainRows.length - 1]?.querySelector<HTMLInputElement>(
      'input[type="text"]'
    );
    expect(newest?.value).toBe('new item');
    newest!.value = 'Studio';
    newest!.dispatchEvent(new Event('input'));

    canvas.querySelector<HTMLButtonElement>('.btn--primary')?.click();
    await vi.waitFor(() => expect(saveTaskProperties).toHaveBeenCalled());

    const saved = vi.mocked(saveTaskProperties).mock.calls[0]![0];
    expect(saved.domains.find((entry) => entry.label === 'School')?.id).toBe('teaching');
    expect(saved.domains.find((entry) => entry.label === 'Studio')?.id).toBe('studio');
  });
});
