import { afterEach, describe, expect, it } from 'vitest';
import { LessonSchema, type Lesson } from '@/schemas/lesson';
import type { Block } from '@/schemas/block';
import { mountRotationEditor, type RotationEditorHandle } from '@/rotation/editor';
import { stationTab } from '@/rotation/editor-tabs';
import { findStationSection, lockOf, sectionBlocks } from '@/rotation/model';
import type { Station } from '@/rotation/schema';
import { rotationLesson } from '../../../../tests/unit/helpers/rotation-fixture.mjs';

let handle: RotationEditorHandle | null = null;
afterEach(() => { handle?.dispose(); handle = null; document.body.replaceChildren(); });

function mount(opts: { locks?: boolean } = {}) {
  let n = 0;
  const state = { lesson: LessonSchema.parse(rotationLesson({}, opts)) as Lesson };
  handle = mountRotationEditor({
    getLesson: () => state.lesson,
    emitLesson: (next) => { state.lesson = next; },
    redrawCanvas: () => undefined,
    idFactory: () => `new${++n}`
  });
  document.body.append(handle.root);
  const station = (id: string): Station => state.lesson.rotation!.stations.find((s) => s.id === id)!;
  const blocks = (id: string): Block[] => sectionBlocks(findStationSection(state.lesson.blocks, id));
  return { state, station, blocks, root: handle.root, open: (id: string) => handle!.tabs.set(stationTab(id)) };
}

const button = (root: HTMLElement, text: string): HTMLButtonElement => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.trim() === text);
  if (!b) throw new Error(`No button “${text}”`);
  return b as HTMLButtonElement;
};
const byLabel = <T extends HTMLElement>(root: HTMLElement, label: string): T => {
  const e = root.querySelector(`[aria-label="${label}"]`);
  if (!e) throw new Error(`Nothing labelled “${label}”`);
  return e as T;
};
const type = (i: HTMLInputElement | HTMLTextAreaElement, v: string) => { i.value = v; i.dispatchEvent(new Event('input')); };
const choose = (s: HTMLSelectElement, v: string) => { s.value = v; s.dispatchEvent(new Event('change')); };

describe('rotation editor: station locks', () => {
  it('adds a lock as an unfinished rush and marks the station tab', () => {
    const t = mount();
    t.open('s1');
    expect(t.root.querySelector('.rot-lock')).toBeNull();
    button(t.root, '+ Add the first lock').click();
    const locks = t.station('s1').locks!;
    expect(locks).toHaveLength(1);
    expect(locks[0]!.check).toMatchObject({ kind: 'rush', items: [], streak: 6, seconds: 90 });
    expect(t.root.querySelectorAll('.rot-lock')).toHaveLength(1);
    expect(t.root.textContent).toContain('Rush: a fast round. They open the lock with 6 right in a row');
    const pill = t.root.querySelector(`[data-tab="${stationTab('s1')}"]`)!;
    expect(pill.querySelector('.rot-tab-dot')).not.toBeNull();
  });

  it('stops at six locks', () => {
    const t = mount();
    t.open('s1');
    button(t.root, '+ Add the first lock').click();
    for (let k = 0; k < 5; k++) button(t.root, '+ Add a lock').click();
    expect(t.station('s1').locks).toHaveLength(6);
    expect(button(t.root, '+ Add a lock').disabled).toBe(true);
  });

  it('switches the check kind, and switching back brings the rush questions back', () => {
    const t = mount();
    t.open('s1');
    button(t.root, '+ Add the first lock').click();
    button(t.root, '+ Add a question').click();
    expect(t.station('s1').locks![0]!.check).toMatchObject({ kind: 'rush' });
    expect((t.station('s1').locks![0]!.check as { items: unknown[] }).items).toHaveLength(1);
    expect(t.root.querySelector('.qz-builder')).not.toBeNull();

    button(t.root, 'AI check').click();
    expect(t.station('s1').locks![0]!.check).toEqual({ kind: 'ai', prompt: '', model_answer: '', criteria: [] });
    expect(t.root.textContent).toContain('AI check: they write a sentence or two');
    type(byLabel(t.root, 'What the answer must do, one a line'), 'Links warm water to bleaching\n\nNames the fish\nA\nB\nC');
    expect((t.station('s1').locks![0]!.check as { criteria: string[] }).criteria).toEqual(['Links warm water to bleaching', 'Names the fish', 'A', 'B']);

    button(t.root, 'Rush').click();
    const back = t.station('s1').locks![0]!.check as { kind: string; items: unknown[] };
    expect(back.kind).toBe('rush');
    expect(back.items).toHaveLength(1);
  });

  it('edits the reward without repainting, so focus stays', () => {
    const t = mount();
    t.open('s1');
    button(t.root, '+ Add the first lock').click();
    const title = byLabel<HTMLInputElement>(t.root, 'Lock 1 card title');
    title.focus();
    type(title, 'The key parts');
    type(byLabel(t.root, 'Lock 1 card text'), 'Name all three.');
    expect(t.station('s1').locks![0]!.reward).toEqual({ title: 'The key parts', text: 'Name all three.' });
    expect(title.isConnected).toBe(true);
    expect(document.activeElement).toBe(title);
  });

  it('moves a lock down', () => {
    const t = mount({ locks: true });
    t.open('s4');
    button(t.root, 'Down').click();
    expect(t.station('s4').locks!.map((l) => l.id)).toEqual(['k2', 'k1', 'k3']);
  });

  it('assigns a block to a lock from the station card list', () => {
    const t = mount({ locks: true });
    t.open('s4');
    const goalAt = t.blocks('s4').findIndex((b) => b.id === 's4goal');
    const selects = [...t.root.querySelectorAll<HTMLSelectElement>('select[aria-label="Which lock"]')];
    expect(selects).toHaveLength(t.blocks('s4').length);
    expect(selects[goalAt]!.value).toBe('');
    expect([...selects[goalAt]!.options].map((op) => op.textContent)).toEqual(['Before the locks', 'Lock 1: Which parts matter?', 'Lock 2: Explain the chain', 'Lock 3: Order the rescue']);
    choose(selects[goalAt]!, 'k2');
    expect(lockOf(t.blocks('s4').find((b) => b.id === 's4goal')!)).toBe('k2');
    const again = [...t.root.querySelectorAll<HTMLSelectElement>('select[aria-label="Which lock"]')];
    choose(again[goalAt]!, '');
    expect(lockOf(t.blocks('s4').find((b) => b.id === 's4goal')!)).toBeUndefined();
  });

  it('shows no lock select on a station without locks', () => {
    const t = mount();
    t.open('s1');
    expect(t.root.querySelector('select[aria-label="Which lock"]')).toBeNull();
  });

  it('removes a lock after a confirm and clears its block tags', () => {
    const t = mount({ locks: true });
    t.open('s4');
    byLabel<HTMLButtonElement>(t.root, 'Remove Explain the chain').click();
    expect(t.station('s4').locks).toHaveLength(3);
    expect(t.root.textContent).toContain('Remove Explain the chain? Its blocks go back to showing before the locks.');
    button(t.root, 'Keep it').click();
    expect(t.root.textContent).not.toContain('Remove Explain the chain?');

    byLabel<HTMLButtonElement>(t.root, 'Remove Explain the chain').click();
    const confirm = t.root.querySelector<HTMLElement>('.rot-lock__confirm')!;
    button(confirm, 'Remove').click();
    expect(t.station('s4').locks!.map((l) => l.id)).toEqual(['k1', 'k3']);
    const tags = Object.fromEntries(t.blocks('s4').map((b) => [b.id, lockOf(b)]));
    expect(tags.s4k2a).toBeUndefined();
    expect(tags.s4k2b).toBeUndefined();
    expect(tags.s4k1a).toBe('k1');
    expect(tags.s4k3a).toBe('k3');
  });
});
