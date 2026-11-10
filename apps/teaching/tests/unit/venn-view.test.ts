import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/blocks/thinking-client', () => ({
  savedInitials: vi.fn(() => 'TC'),
  keepInitials: vi.fn((v: string) => v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4)),
  sendThinking: vi.fn(() => Promise.resolve({ saved: true })),
  fetchThinking: vi.fn(),
  resetThinking: vi.fn(() => Promise.resolve({ lesson_id: 'L1', block_id: 'v1', responses: [] }))
}));
vi.mock('@/teacher/confirm-dialog', () => ({ askConfirmCard: vi.fn(() => Promise.resolve(true)) }));

import { createBlock } from '@/blocks/create-block';
import { renderVenn, createVennEditor, type VennBlock } from '@/blocks/venn';
import { fillFrame, withPreload } from '@/blocks/venn/model';
import { fetchThinking, resetThinking, sendThinking } from '@/blocks/thinking-client';
import { askConfirmCard } from '@/teacher/confirm-dialog';

function venn(patch: Partial<VennBlock['content']> = {}): VennBlock {
  const base = createBlock('venn', 'v1') as VennBlock;
  return {
    ...base,
    content: {
      ...base.content,
      prompt: 'How do the two texts show waiting?',
      texts: [{ label: 'The Tide Clock' }, { label: 'Salt Roads' }],
      ...patch
    }
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const buttons = (root: ParentNode, text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.textContent === text);
const typeInto = (box: HTMLTextAreaElement | HTMLInputElement, value: string) => {
  box.value = value;
  box.dispatchEvent(new Event('input'));
};

function addPoint(root: HTMLElement, text: string, region: string, depth: 'Surface: plot, feature' | 'Deep: idea, concept, purpose', differs: string[] = []): void {
  root.querySelector<HTMLButtonElement>('.venn-add__open')!.click();
  const form = root.querySelector<HTMLElement>('.venn-add .venn-form')!;
  typeInto(form.querySelector('textarea')!, text);
  buttons(form, region)[0]!.click();
  buttons(form, depth)[0]!.click();
  const how = [...form.querySelectorAll<HTMLTextAreaElement>('textarea')].filter((t) => form.querySelector(`label[for="${t.id}"]`)?.textContent?.startsWith('How does'));
  differs.forEach((d, i) => typeInto(how[i]!, d));
  buttons(form, 'Add point')[0]!.click();
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Two-text Venn view', () => {
  it('print shows the prompt, a Venn outline with regions, lines, the frame and the key', () => {
    const root = renderVenn(venn(), 'print');
    expect(root.textContent).toContain('How do the two texts show waiting?');
    expect(root.querySelectorAll('circle')).toHaveLength(2);
    expect(root.textContent).toContain('The Tide Clock only');
    expect(root.textContent).toContain('Both');
    expect(root.querySelectorAll('.venn-print__region .pf-print__lines')).toHaveLength(3);
    expect(root.textContent).toContain('Your synthesis sentence');
    expect(root.textContent).toContain('where The Tide Clock …, Salt Roads …');
    expect(root.textContent).toContain('S = surface');
    expect(root.textContent).toContain('how each text treats it');
  });

  it('three texts draw three circles and seven regions', () => {
    const root = renderVenn(venn({ texts: [{ label: 'The Tide Clock' }, { label: 'Salt Roads' }, { label: 'Harbour Lights' }] }), 'student', { saveScope: 'home' });
    expect(root.querySelectorAll('circle')).toHaveLength(3);
    expect(root.querySelectorAll('.venn-spot')).toHaveLength(7);
    expect(root.querySelectorAll('.venn-column')).toHaveLength(7);
  });

  it('the teacher preview shows the diagram, the points to sort and the frame', () => {
    const root = renderVenn(venn({ preload: [{ id: 'p1', text: 'A clock that stops' }] }), 'teacher');
    expect(root.querySelector('.venn-diagram')).not.toBeNull();
    expect(root.textContent).toContain('A clock that stops');
    expect(root.textContent).toContain('Students build their Venn in the published lesson.');
    expect(fetchThinking).not.toHaveBeenCalled();
  });

  it('a student adds a point: it lands in its column, counts on the diagram, saves on the device and goes to the teacher', async () => {
    vi.useFakeTimers();
    const root = renderVenn(venn(), 'student', { lessonId: 'L1' });
    document.body.append(root);
    expect((root.querySelector('.venn-initials__input') as HTMLInputElement).value).toBe('TC');
    addPoint(root, 'The sea keeps time', 'The Tide Clock only', 'Deep: idea, concept, purpose');
    const col = root.querySelector('.venn-column[data-region="a"]')!;
    expect(col.textContent).toContain('The sea keeps time');
    expect(col.querySelector('.venn-point--open')).toBeNull();
    expect(root.querySelector('.venn-spot[data-region="a"] .venn-spot__count')!.textContent).toBe('1');
    const saved = JSON.parse(localStorage.getItem('teaching-hub.activity.L1.v1.venn')!);
    expect(saved.points[0]).toMatchObject({ text: 'The sea keeps time', region: 'a', depth: 'deep' });
    expect(sendThinking).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(sendThinking).toHaveBeenCalledWith('L1', 'v1', 'TC', expect.objectContaining({ points: [expect.objectContaining({ text: 'The sea keeps time' })] }));
    expect(root.querySelector('.venn-status')!.textContent).toBe('Saved for your teacher');
  });

  it('a failed send keeps the device copy and offers Try again', async () => {
    vi.useFakeTimers();
    vi.mocked(sendThinking).mockRejectedValueOnce(new Error('offline'));
    const root = renderVenn(venn(), 'student', { lessonId: 'L1' });
    addPoint(root, 'Both wait by water', 'Salt Roads only', 'Surface: plot, feature');
    await vi.advanceTimersByTimeAsync(1500);
    expect(root.querySelector('.venn-status')!.textContent).toContain('Kept on this device');
    expect(localStorage.getItem('teaching-hub.activity.L1.v1.venn')).toContain('Both wait by water');
    buttons(root, 'Try again')[0]!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sendThinking).toHaveBeenCalledTimes(2);
  });

  it('a shared point stays open until it says how each text treats it', () => {
    const root = renderVenn(venn(), 'student', { saveScope: 'home' });
    addPoint(root, 'Someone waits for a return', 'Both', 'Deep: idea, concept, purpose');
    const card = root.querySelector('.venn-column[data-region="ab"] .venn-point')!;
    expect(card.classList.contains('venn-point--open')).toBe(true);
    expect(card.textContent).toContain('Say how The Tide Clock treats it');
    expect(card.textContent).toContain('Say how Salt Roads treats it');

    buttons(card, 'Edit')[0]!.click();
    const form = root.querySelector<HTMLElement>('.venn-column[data-region="ab"] .venn-form')!;
    const how = [...form.querySelectorAll<HTMLTextAreaElement>('textarea')].filter((t) => form.querySelector(`label[for="${t.id}"]`)?.textContent?.startsWith('How does'));
    expect(how).toHaveLength(2);
    typeInto(how[0]!, 'as a stopped clock');
    typeInto(how[1]!, 'as an empty road');
    buttons(form, 'Save point')[0]!.click();
    const done = root.querySelector('.venn-column[data-region="ab"] .venn-point')!;
    expect(done.classList.contains('venn-point--open')).toBe(false);
    expect(done.textContent).toContain('How Salt Roads treats it');
  });

  it('suggests a deep point when surface points outnumber deep ones, and counts both', () => {
    const root = renderVenn(venn(), 'student', { saveScope: 'home' });
    expect(root.querySelector('.venn-nudge')).toBeNull();
    addPoint(root, 'Set by the sea', 'The Tide Clock only', 'Surface: plot, feature');
    addPoint(root, 'Opens at dawn', 'Salt Roads only', 'Surface: plot, feature');
    expect(root.querySelector('.venn-nudge')!.textContent).toContain('deep points carry the comparison');
    expect(root.querySelector('.venn-tally')!.textContent).toContain('Deep 0');
    expect(root.querySelector('.venn-tally')!.textContent).toContain('Surface 2');
    const off = renderVenn(venn({ nudge: false }), 'student', { saveScope: 'other' });
    addPoint(off, 'Set by the sea', 'The Tide Clock only', 'Surface: plot, feature');
    addPoint(off, 'Opens at dawn', 'Salt Roads only', 'Surface: plot, feature');
    expect(off.querySelector('.venn-nudge')).toBeNull();
  });

  it('preloaded points wait in the tray, move into a region when placed, and can be moved but not removed', () => {
    const root = renderVenn(venn({ preload: [{ id: 'p1', text: 'A clock that stops' }] }), 'student', { saveScope: 'home' });
    const tray = root.querySelector<HTMLElement>('.venn-tray')!;
    expect(tray.hidden).toBe(false);
    expect(tray.textContent).toContain('A clock that stops');
    buttons(tray, 'Both')[0]!.click();
    expect(root.querySelector<HTMLElement>('.venn-tray')!.hidden).toBe(true);
    // Placing opens the point's form so the student can tag it.
    const form = root.querySelector<HTMLElement>('.venn-column[data-region="ab"] .venn-form')!;
    expect(form.querySelector('.venn-form__given')!.textContent).toBe('A clock that stops');
    buttons(form, 'The Tide Clock only')[0]!.click();
    buttons(form, 'Save point')[0]!.click();
    const card = root.querySelector('.venn-column[data-region="a"] .venn-point')!;
    expect(card.textContent).toContain('A clock that stops');
    expect(buttons(card, 'Remove')).toHaveLength(0);
    expect(buttons(card, 'Edit or move')).toHaveLength(1);
  });

  it('a region on the diagram shows just that region', () => {
    const root = renderVenn(venn(), 'student', { saveScope: 'home' });
    root.querySelector<HTMLButtonElement>('.venn-spot[data-region="b"]')!.click();
    expect([...root.querySelectorAll<HTMLElement>('.venn-column')].map((c) => c.dataset.region)).toEqual(['b']);
    buttons(root, 'Show every region')[0]!.click();
    expect(root.querySelectorAll('.venn-column')).toHaveLength(3);
  });

  it('the synthesis box starts from the frame with the text names and saves edits', () => {
    const root = renderVenn(venn(), 'student', { saveScope: 'home' });
    const box = root.querySelector<HTMLTextAreaElement>('.venn-synthesis__input')!;
    expect(box.value).toBe('Both … explore …, but where The Tide Clock …, Salt Roads …');
    typeInto(box, 'Both explore waiting.');
    expect(JSON.parse(localStorage.getItem('teaching-hub.activity.home.v1.venn')!).synthesis).toBe('Both explore waiting.');
  });

  const responses = [
    { at: '2026-11-11T09:00:00Z', kind: 'venn', initials: 'QX', data: { synthesis: 'Both explore waiting.', points: [
      { id: 'x1', text: 'The sea keeps time', region: 'a', depth: 'deep', quotes: {}, differs: {} },
      { id: 'x2', text: 'Opens at dawn', region: 'b', depth: 'surface', quotes: {}, differs: {} }
    ] } },
    { at: '2026-11-11T09:01:00Z', kind: 'venn', initials: 'ZW', data: { synthesis: '', points: [
      { id: 'y1', text: 'Someone waits', region: 'ab', depth: 'deep', quotes: {}, differs: { a: 'a stopped clock' } }
    ] } }
  ];

  it('the teacher list shows each Venn with initials, counts, depth, completeness and the synthesis', async () => {
    vi.mocked(fetchThinking).mockResolvedValue({ lesson_id: 'L1', block_id: 'v1', responses });
    const root = renderVenn(venn(), 'teacher', { lessonId: 'L1' });
    await flush();
    const rows = root.querySelectorAll('.venn-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('QX');
    expect(rows[0]!.textContent).toContain('A 1 · A+B 0 · B 1');
    expect(rows[0]!.textContent).toContain('Deep 1 · Surface 1');
    expect(rows[0]!.textContent).toContain('2 of 2 complete');
    expect(rows[0]!.textContent).toContain('Both explore waiting.');
    expect(rows[1]!.textContent).toContain('0 of 1 complete');
    expect(root.querySelector('.venn-summary')!.textContent).toContain('Deep 2');

    const more = rows[0]!.querySelector('details')!;
    more.open = true;
    more.dispatchEvent(new Event('toggle'));
    expect(more.querySelector('.venn-full .venn-column[data-region="a"]')!.textContent).toContain('The sea keeps time');

    buttons(rows[1]!, 'Show large')[0]!.click();
    const spot = root.querySelector('.venn-spotlight')!;
    expect(spot.textContent).toContain('Student 2 of 2');
    expect(spot.textContent).not.toContain('ZW');

    buttons(root, 'Clear responses')[0]!.click();
    await flush();
    expect(askConfirmCard).toHaveBeenCalled();
    expect(resetThinking).toHaveBeenCalledWith('L1', 'v1');
    expect(root.querySelectorAll('.venn-row')).toHaveLength(0);
  });

  it('Display shows one Venn large without initials, steps through them and refreshes', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchThinking).mockResolvedValue({ lesson_id: 'L1', block_id: 'v1', responses });
    const root = renderVenn(venn(), 'teacher', { lessonId: 'L1', display: true });
    document.body.append(root);
    await vi.advanceTimersByTimeAsync(0);
    expect(root.querySelector('.venn-list')).toBeNull();
    expect(buttons(root, 'Clear responses')).toHaveLength(0);
    expect(root.textContent).toContain('Student 1 of 2');
    expect(root.textContent).not.toContain('QX');
    expect(root.textContent).toContain('The sea keeps time');
    root.querySelector<HTMLButtonElement>('[aria-label="Next Venn"]')!.click();
    expect(root.textContent).toContain('Student 2 of 2');
    expect(root.textContent).not.toContain('ZW');
    expect(fetchThinking).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchThinking).toHaveBeenCalledTimes(2);
    expect(root.textContent).toContain('Student 2 of 2');
    root.remove();
    await vi.advanceTimersByTimeAsync(8000);
    expect(fetchThinking).toHaveBeenCalledTimes(2);
  });

  it('the editor saves labels, a third text, points to sort, the frame and the nudge', () => {
    const changed = vi.fn();
    const editor = createVennEditor(venn({ texts: [{ label: '' }, { label: '' }] }), changed);
    const inputs = () => [...editor.querySelectorAll<HTMLInputElement>('.venn-editor__text input')];
    typeInto(inputs()[0]!, 'The Tide Clock');
    buttons(editor, '+ Add a third text')[0]!.click();
    expect(inputs()).toHaveLength(3);
    typeInto(inputs()[2]!, 'Harbour Lights');
    buttons(editor, '+ Add a point to sort')[0]!.click();
    typeInto(editor.querySelector<HTMLInputElement>('.cl-editor__statement input')!, 'A clock that stops');
    const nudge = editor.querySelector<HTMLInputElement>('.pf-switch input')!;
    nudge.checked = false;
    nudge.dispatchEvent(new Event('change'));
    const last = changed.mock.calls.at(-1)![0] as VennBlock;
    expect(last.content.texts.map((t) => t.label)).toEqual(['The Tide Clock', '', 'Harbour Lights']);
    expect(last.content.preload[0]!.text).toBe('A clock that stops');
    expect(last.content.nudge).toBe(false);
    editor.querySelector<HTMLButtonElement>('[aria-label="Remove the third text"]')!.click();
    expect((changed.mock.calls.at(-1)![0] as VennBlock).content.texts).toHaveLength(2);
  });
});

describe('Two-text Venn view helpers', () => {
  it('fillFrame swaps text letters for labels and leaves articles alone', () => {
    expect(fillFrame('Both … explore …, but where A …, B …', ['The Tide Clock', 'Salt Roads'])).toBe('Both … explore …, but where The Tide Clock …, Salt Roads …');
    expect(fillFrame('A clock in A …', ['Tide', 'Salt'])).toBe('A clock in Tide …');
    expect(fillFrame('where A …', ['', ''])).toBe('where A …');
  });

  it('withPreload adds new teacher points, drops removed ones and keeps placements', () => {
    const merged = withPreload(
      [{ id: 'p1', text: 'old', region: 'a', depth: 'deep', quotes: {}, differs: {}, preload: true },
       { id: 'gone', text: 'x', region: 'b', depth: null, quotes: {}, differs: {}, preload: true },
       { id: 'own', text: 'mine', region: 'b', depth: null, quotes: {}, differs: {} }],
      [{ id: 'p1', text: 'new words' }, { id: 'p2', text: 'second' }]
    );
    expect(merged.map((p) => p.id)).toEqual(['p2', 'p1', 'own']);
    expect(merged.find((p) => p.id === 'p1')).toMatchObject({ text: 'new words', region: 'a' });
  });
});
