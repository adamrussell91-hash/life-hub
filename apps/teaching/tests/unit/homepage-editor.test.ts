import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Block } from '@/schemas/block';
import type { ClassHomepage } from '@/schemas/class';
import {
  emptyHomepage,
  mountHomepageEditor,
  normalizeHomepage,
  renderHomepageRegionsView
} from '@/teacher/sections/homepage-editor';

const ISO = '2026-01-01T00:00:00.000Z';

const headingBlock: Block = {
  id: 'block_homepage_announcements_1',
  type: 'block',
  block_type: 'heading',
  variant: 'section',
  visibility: 'student_teacher',
  content: { text: 'Welcome back' },
  layout: {},
  print: {},
  settings: {},
  created_at: ISO,
  updated_at: ISO,
  schema_version: 1
};

describe('homepage-editor helpers', () => {
  it('emptyHomepage returns three empty arrays', () => {
    expect(emptyHomepage()).toEqual({
      announcements: [],
      resources: [],
      custom: []
    });
  });

  it('normalizeHomepage fills missing regions with empty arrays', () => {
    expect(normalizeHomepage(undefined)).toEqual(emptyHomepage());
    expect(normalizeHomepage({ announcements: [headingBlock] } as ClassHomepage)).toEqual({
      announcements: [headingBlock],
      resources: [],
      custom: []
    });
  });
});

describe('renderHomepageRegionsView', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
  });

  it('renders all three regions with empty copy when homepage is unset', () => {
    renderHomepageRegionsView(container, emptyHomepage());
    expect(container.querySelector('[data-homepage-region="announcements"]')).not.toBeNull();
    expect(container.querySelector('[data-homepage-region="resources"]')).not.toBeNull();
    expect(container.querySelector('[data-homepage-region="custom"]')).not.toBeNull();
    expect(container.textContent).toContain('No announcements yet.');
  });

  it('renders announcement blocks in teacher view mode', () => {
    renderHomepageRegionsView(container, {
      announcements: [headingBlock],
      resources: [],
      custom: []
    });

    const announcements = container.querySelector('[data-homepage-region="announcements"]');
    expect(announcements?.querySelector('.block[data-block-type="heading"]')).not.toBeNull();
    expect(announcements?.textContent).toContain('Welcome back');
  });
});

function insertPaletteType(root: HTMLElement, type: string, family = 'Basic'): void {
  root.querySelector<HTMLButtonElement>(`.lesson-palette__family[data-family="${family}"]`)?.click();
  root.querySelector<HTMLButtonElement>(`.lesson-palette__card[data-block-type="${type}"]`)?.click();
}

describe('mountHomepageEditor', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.append(container);
  });

  afterEach(() => {
    container.remove();
    document.body.replaceChildren();
  });

  it('does not offer learning activities in homepage block pickers', () => {
    mountHomepageEditor(container, emptyHomepage(), {
      classId: 'class_test',
      onSave: vi.fn().mockResolvedValue(undefined),
      onCancel: vi.fn()
    });

    expect(container.querySelector('.homepage-editor__add-block-select')).toBeNull();
    expect(container.querySelector('.lesson-palette')).not.toBeNull();
    const families = [...container.querySelectorAll('.lesson-palette__family')].map(
      (el) => el.getAttribute('data-family')
    );
    expect(families).not.toContain('Learning');
    expect(families).toContain('Layout');
    container.querySelector<HTMLButtonElement>('.lesson-palette__family[data-family="Layout"]')?.click();
    const types = [...container.querySelectorAll('.lesson-palette__card')].map(
      (el) => el.getAttribute('data-block-type')
    );
    expect(types).toContain('collection');
    expect(types).not.toEqual(expect.arrayContaining(['flashcards', 'cloze', 'self_check']));
  });

  it('calls onSave with the edited homepage', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    mountHomepageEditor(container, emptyHomepage(), {
      classId: 'class_test',
      onSave,
      onCancel
    });

    insertPaletteType(container, 'heading');

    container.querySelector<HTMLButtonElement>('.homepage-editor__save')?.click();

    await vi.waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    const saved = onSave.mock.calls[0]![0] as ClassHomepage;
    expect(saved.announcements).toHaveLength(1);
    expect(saved.announcements[0]?.block_type).toBe('heading');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel without saving', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();

    mountHomepageEditor(container, emptyHomepage(), {
      classId: 'class_test',
      onSave,
      onCancel
    });
    container.querySelector<HTMLButtonElement>('.homepage-editor__cancel')?.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
