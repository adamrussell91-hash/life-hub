import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INSERT_MENU_DESCRIPTION, lessonPaletteFamilies } from '@/teacher/lesson-canvas/palette-catalog';
import { mountLessonPalette } from '@/teacher/lesson-canvas/mount-palette';

const MIME = 'application/x-teaching-hub-block';

class Dt {
  store = new Map<string, string>();
  effectAllowed = 'uninitialized';
  dropEffect = 'none';
  setData(type: string, value: string): void {
    this.store.set(type, value);
  }
  getData(type: string): string {
    return this.store.get(type) ?? '';
  }
}

function dispatchDragStart(el: Element): Dt {
  const dt = new Dt();
  const event = new Event('dragstart', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  el.dispatchEvent(event);
  return dt;
}

describe('mountLessonPalette', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
  });

  afterEach(() => {
    host.remove();
    document.body.replaceChildren();
  });

  it('renders family buttons including Visualisation', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    expect(host.querySelector('[data-family="Visualisation"]')).not.toBeNull();
    expect(host.querySelector('[data-family="Basic"]')).not.toBeNull();
    expect(host.querySelector('[data-family="Compositions"]')).not.toBeNull();
  });

  it('gives the toolkit families their own icons, the griffin for Thinking Toolkit', () => {
    mountLessonPalette(host, { families: lessonPaletteFamilies([]), onInsert: vi.fn() });

    const toolkit = host.querySelector('[data-family="Thinking Toolkit"] .lesson-palette__family-icon')!;
    expect(toolkit.querySelector('img')?.getAttribute('src')).toContain('badge-griffin.png');
    const analogy = host.querySelector('[data-family="Analogous Thinking"] .lesson-palette__family-icon svg')!;
    expect(analogy.querySelector('rect')).not.toBeNull();
    expect(analogy.innerHTML).not.toBe('<circle cx="10" cy="10" r="3"></circle>');
  });

  it('collapses the rail from a visible control and reopens from the tab', () => {
    const onShelved = vi.fn();
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn(),
      onShelved
    });

    const collapse = host.querySelector<HTMLButtonElement>('.lesson-palette__collapse');
    expect(collapse).not.toBeNull();

    collapse!.click();
    expect(host.classList.contains('lesson-palette--shelved')).toBe(true);
    expect(onShelved).toHaveBeenLastCalledWith(true);

    host.querySelector<HTMLButtonElement>('.lesson-palette__tab')!.click();
    expect(host.classList.contains('lesson-palette--shelved')).toBe(false);
    expect(onShelved).toHaveBeenLastCalledWith(false);
  });

  it('closes an open flyout when the rail collapses', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('[data-family="Basic"]')!.click();
    expect(host.querySelector('.lesson-palette__flyout')).not.toBeNull();

    host.querySelector<HTMLButtonElement>('.lesson-palette__collapse')!.click();
    expect(host.querySelector('.lesson-palette__flyout')).toBeNull();
  });

  it('opens a flyout of cards with descriptions on family click', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('[data-family="Visualisation"]')!.click();

    const flyout = host.querySelector('.lesson-palette__flyout');
    expect(flyout).not.toBeNull();
    const card = host.querySelector('[data-block-type="mind_map"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain(INSERT_MENU_DESCRIPTION.mind_map);
  });

  it('closes the flyout on a second family click', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    const family = host.querySelector<HTMLButtonElement>('[data-family="Visualisation"]')!;
    family.click();
    expect(host.querySelector('.lesson-palette__flyout')).not.toBeNull();
    family.click();
    expect(host.querySelector('.lesson-palette__flyout')).toBeNull();
  });

  it('closes the flyout on Escape', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('[data-family="Visualisation"]')!.click();
    expect(host.querySelector('.lesson-palette__flyout')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(host.querySelector('.lesson-palette__flyout')).toBeNull();
  });

  it('closes the flyout on click-away on document', () => {
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    host.querySelector<HTMLButtonElement>('[data-family="Visualisation"]')!.click();
    expect(host.querySelector('.lesson-palette__flyout')).not.toBeNull();

    const outside = document.createElement('div');
    document.body.append(outside);
    outside.click();
    expect(host.querySelector('.lesson-palette__flyout')).toBeNull();
  });

  it('sets data-dragging on the host during dragstart and recedes the flyout', () => {
    const onDragStart = vi.fn();
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn(),
      onDragStart
    });

    host.querySelector<HTMLButtonElement>('[data-family="Visualisation"]')!.click();
    const card = host.querySelector<HTMLElement>('[data-block-type="mind_map"]')!;
    const dt = dispatchDragStart(card);

    expect(host.dataset.dragging).toBe('true');
    expect(onDragStart).toHaveBeenCalled();
    expect(dt.effectAllowed).toBe('copy');
    expect(JSON.parse(dt.getData(MIME))).toEqual({ kind: 'block', type: 'mind_map' });

    const flyout = host.querySelector('.lesson-palette__flyout');
    const receded =
      flyout == null ||
      flyout.hasAttribute('hidden') ||
      flyout.classList.contains('lesson-palette__flyout--receded');
    expect(receded).toBe(true);
  });

  it('calls onInsert when a Basic heading card is clicked', () => {
    const onInsert = vi.fn();
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert
    });

    host.querySelector<HTMLButtonElement>('[data-family="Basic"]')!.click();
    host.querySelector<HTMLElement>('[data-block-type="heading"]')!.click();

    expect(onInsert).toHaveBeenCalledWith({ kind: 'block', type: 'heading' });
  });

  it('shelves the rail and unshelves from the Blocks edge tab', () => {
    const handle = mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert: vi.fn()
    });

    handle.setShelved(true);
    expect(host.classList.contains('lesson-palette--shelved')).toBe(true);

    const tab = [...host.querySelectorAll('button')].find((btn) => btn.textContent?.trim() === 'Blocks');
    expect(tab).toBeTruthy();
    tab!.click();
    expect(host.classList.contains('lesson-palette--shelved')).toBe(false);
  });

  it('shows Copy and Linked in the flyout footer via showCompositionConfirm', () => {
    const onCompositionChoice = vi.fn();
    const handle = mountLessonPalette(host, {
      families: lessonPaletteFamilies([{ id: 'composition_1', title: 'Exit ticket' }]),
      onInsert: vi.fn(),
      onCompositionChoice
    });

    host.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!.click();
    handle.showCompositionConfirm('composition_1');

    const flyout = host.querySelector('.lesson-palette__flyout');
    const copy = flyout?.querySelector<HTMLButtonElement>('.lesson-editor__insert-composition-copy');
    const linked = flyout?.querySelector<HTMLButtonElement>(
      '.lesson-editor__insert-composition-linked'
    );
    expect(copy).not.toBeNull();
    expect(linked).not.toBeNull();

    copy!.click();
    expect(onCompositionChoice).toHaveBeenCalledWith('composition_1', 'copy');
  });

  it('opens an explanatory empty compositions panel without inserting or dragging', () => {
    const onInsert = vi.fn();
    mountLessonPalette(host, {
      families: lessonPaletteFamilies([]),
      onInsert
    });

    const family = host.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!;
    expect(family.getAttribute('draggable')).not.toBe('true');
    expect(family.disabled).toBe(false);
    family.click();
    const flyout = host.querySelector('.lesson-palette__flyout');
    expect(flyout).not.toBeNull();
    expect(flyout?.textContent).toContain('No saved compositions');
    expect(flyout?.textContent).toContain('Save as composition');
    expect(flyout?.querySelectorAll('.lesson-palette__card')).toHaveLength(0);
    expect(onInsert).not.toHaveBeenCalled();

    const dt = dispatchDragStart(family);
    expect(host.dataset.dragging).not.toBe('true');
    expect(dt.getData(MIME)).toBe('');
  });

  it('shows a composition load failure in the panel instead of an empty library', () => {
    const handle = mountLessonPalette(host, {
      families: lessonPaletteFamilies([], 'Loading compositions…'),
      onInsert: vi.fn()
    });
    host.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!.click();
    handle.updateFamilies(lessonPaletteFamilies([], 'Unable to load compositions. Reload the page to try again.'));
    const flyout = host.querySelector('.lesson-palette__flyout');
    expect(flyout?.textContent).toContain('Unable to load compositions');
    expect(flyout?.textContent).not.toContain('No saved compositions');
  });

  it('keeps the open compositions panel through loading, empty, and saved results', () => {
    const onInsert = vi.fn();
    const handle = mountLessonPalette(host, {
      families: lessonPaletteFamilies([], 'Loading compositions…'),
      onInsert
    });
    host.querySelector<HTMLButtonElement>('[data-family="Compositions"]')!.click();
    expect(host.querySelector('.lesson-palette__flyout')?.textContent).toContain('Loading');
    handle.updateFamilies(lessonPaletteFamilies([]));
    expect(host.querySelector('.lesson-palette__flyout')?.textContent).toContain('No saved compositions');
    handle.updateFamilies(lessonPaletteFamilies([{ id: 'comp_1', title: 'Exit ticket' }]));
    const flyout = host.querySelector('.lesson-palette__flyout');
    expect(flyout?.textContent).not.toContain('No saved compositions');
    expect(flyout?.textContent).toContain('Exit ticket');
    flyout?.querySelector<HTMLButtonElement>('[data-composition-id="comp_1"]')?.click();
    expect(onInsert).toHaveBeenCalledWith({ kind: 'composition', id: 'comp_1' });
  });
});
