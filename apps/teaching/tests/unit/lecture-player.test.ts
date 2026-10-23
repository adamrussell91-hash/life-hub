// apps/teaching/tests/unit/lecture-player.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Block } from '@/schemas/block';
import { mountLecturePlayer } from '@/lecture/player';
import { emitAnswered } from '@/lecture/answered';
import type { LectureClient } from '@/lecture/api';

const STAMP = '2026-10-23T00:00:00.000Z';
const b = (id: string, block_type: string, content: Record<string, unknown> = {}) =>
  ({
    id,
    type: 'block',
    block_type,
    variant: 'medium',
    visibility: 'student_teacher',
    schema_version: 1,
    created_at: STAMP,
    updated_at: STAMP,
    content
  }) as unknown as Block;
const heading = (id: string, extra: Record<string, unknown> = {}) => b(id, 'heading', { text: `Scene ${id}`, level: 2, ...extra });
const text = (id: string) => b(id, 'rich_text', { html: `<p>${id}</p>` });

const blocks: Block[] = [
  heading('h1', { narration: { url: '/a.webm', duration_s: 90, transcript: 'Hello class' } }), text('t1'), text('t2'),
  heading('h2'), b('k1', 'self_check', { mode: 'reveal', prompt: 'Why?', answer: 'Because' }), b('n1', 'note_cue', { kind: 'copy', prompt: 'Write it' })
];

function mount(client: LectureClient | null = null, list: Block[] = blocks) {
  const host = document.createElement('div');
  document.body.replaceChildren(host);
  const handle = mountLecturePlayer(host, { lessonId: 'l1', title: 'Tone', blocks: list, client, renderHero: (h) => h.append(document.createElement('header')) });
  const main = () => host.querySelector<HTMLButtonElement>('.lecture-bar__main')!;
  return { host, handle, main };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const start = (host: HTMLElement) => host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
type Status = Awaited<ReturnType<LectureClient['status']>>;
const known: Status = { identity: { need: null, initials: 'AB' }, handups: [] };
const needsInitials: Status = { identity: { need: 'initials', initials: null }, handups: [] };
function fakeClient(statusFn: () => Promise<Status>, claimFn: () => Promise<Status> = () => Promise.resolve(known)) {
  const sent: Array<{ finished: boolean }> = [];
  const handups: unknown[] = [];
  const client: LectureClient = {
    status: statusFn,
    claim: claimFn,
    handup: (input) => { handups.push(input); return Promise.resolve(known); },
    progress: (body) => { sent.push(body); }
  };
  return { client, sent, handups };
}
// Two short scenes, no gates or notes, so the recap is two taps away.
const short = [heading('s1'), heading('s2')];
function reachRecap(host: HTMLElement) {
  start(host);
  host.querySelector<HTMLButtonElement>('.lecture-bar__main')!.click();
  host.querySelector<HTMLButtonElement>('.lecture-bar__main')!.click();
}

describe('lecture player', () => {
  beforeEach(() => localStorage.clear());

  it('opens on a title card with running time and a book reminder', () => {
    const { host } = mount();
    expect(host.querySelector('.lecture-title__time')?.textContent).toBe('About 2 min');
    expect(host.textContent).toContain('You’ll need your book and a pen');
  });

  it('reveals beats one at a time with a counted button and placeholders', () => {
    const { host, main } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(main().textContent).toBe('Reveal · 2 of 2');
    expect(host.querySelectorAll('.lecture-beat--hidden')).toHaveLength(1);
    expect(host.querySelector('.lecture-beat--next')).not.toBeNull();
    main().click();
    expect(host.querySelectorAll('.lecture-beat--hidden')).toHaveLength(0);
    expect(main().textContent).toBe('Next scene →');
  });

  it('holds a gate until answered, then holds the note cue for three seconds', async () => {
    const { host, main } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    main().click();
    main().click();
    expect(main().textContent).toBe('Answer to continue');
    expect(main().disabled).toBe(true);
    emitAnswered(host.querySelector('[data-block-id="k1"]') as HTMLElement, 'k1', 'done');
    expect(main().textContent).toBe('Reveal · 2 of 2');
    main().click();
    expect(main().textContent).toBe('Done · I wrote it');
    expect(main().disabled).toBe(true);
  });

  it('shows the transcript as captions when CC is on', () => {
    const { host } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    const captions = host.querySelector<HTMLElement>('.lecture-captions')!;
    expect(captions.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('.lecture-bar__cc')!.click();
    expect(captions.hidden).toBe(false);
    expect(captions.textContent).toBe('Hello class');
  });

  it('comes back to the same scene', () => {
    const first = mount();
    first.host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    first.main().click();
    first.main().click();
    first.handle.dispose();
    const again = mount();
    expect(again.host.querySelector('.lecture-title__start')?.textContent).toBe('Pick up at Scene h2');
  });

  it('going back keeps how far a scene got, so a gate cannot be skipped', () => {
    const { host, main } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    main().click();
    main().click();
    expect(main().textContent).toBe('Answer to continue');
    host.querySelector<HTMLButtonElement>('.lecture-bar__back')!.click();
    expect(main().textContent).toBe('Next scene →');
    main().click();
    expect(main().textContent).toBe('Answer to continue');
  });

  it('hides the hand-up button when there is no class', () => {
    const { host } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(host.querySelector<HTMLElement>('.lecture-strip__hand')!.hidden).toBe(true);
  });

  it('keeps working when the status call fails', async () => {
    const sent: unknown[] = [];
    const client: LectureClient = {
      status: () => Promise.reject(new Error('not there yet')),
      claim: () => Promise.reject(new Error('no')),
      handup: () => Promise.reject(new Error('no')),
      progress: (body) => { sent.push(body); }
    };
    const { host, main } = mount(client);
    await flush();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(host.querySelector<HTMLElement>('.lecture-strip__hand')!.hidden).toBe(false);
    main().click();
    expect(main().textContent).toBe('Next scene →');
  });

  it('offers Raise it with ✋ on a question note cue inside the player', () => {
    const { host } = mount(null, [heading('h1'), b('q1', 'note_cue', { kind: 'question', prompt: 'What puzzles you?' })]);
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    const raise = host.querySelector<HTMLButtonElement>('.block-note-cue__raise');
    expect(raise?.textContent).toBe('Raise it with ✋');
    expect(raise?.dataset.prompt).toBe('What puzzles you?');
  });

  it('ends on a recap listing the book notes', () => {
    vi.useFakeTimers();
    try {
      const { host, main } = mount(null, [heading('h1'), b('n1', 'note_cue', { kind: 'copy', prompt: 'Write it' })]);
      host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
      expect(main().disabled).toBe(true);
      vi.advanceTimersByTime(3000);
      expect(main().disabled).toBe(false);
      main().click();
      expect(main().textContent).toBe('See your recap →');
      main().click();
      expect(host.querySelector('.lecture-recap__title')?.textContent).toBe('Recap');
      expect(host.querySelector('.lecture-recap__note--done')?.textContent).toContain('Write it');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reaching the recap does not finish; the Finish button does, and sends it', async () => {
    const { client, sent } = fakeClient(() => Promise.resolve(known));
    const { host, handle } = mount(client, short);
    await flush();
    reachRecap(host);
    expect(host.querySelector('.lecture-recap')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('lecture:l1:state')!).finished).toBe(false);
    expect(sent.every((body) => !body.finished)).toBe(true);
    host.querySelector<HTMLButtonElement>('.lecture-recap__finish')!.click();
    expect(JSON.parse(localStorage.getItem('lecture:l1:state')!).finished).toBe(true);
    expect(sent.at(-1)?.finished).toBe(true);
    handle.dispose();
  });

  it('reopening a finished lecture offers the recap or a fresh start', () => {
    const first = mount(null, short);
    reachRecap(first.host);
    first.host.querySelector<HTMLButtonElement>('.lecture-recap__finish')!.click();
    first.handle.dispose();
    const again = mount(null, short);
    expect(again.host.querySelector('.lecture-title__start')?.textContent).toBe('See your recap');
    again.host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(again.host.querySelector('.lecture-recap')).not.toBeNull();
    again.handle.dispose();
    const third = mount(null, short);
    third.host.querySelector<HTMLButtonElement>('.lecture-title__again')!.click();
    expect(third.host.querySelector('.lecture-stage')?.textContent).toContain('Scene s1');
    expect(JSON.parse(localStorage.getItem('lecture:l1:state')!)).toMatchObject({ scene: 0, finished: false });
  });

  it('Start again clears each gate block’s own saved answer', () => {
    localStorage.setItem('lecture:l1:state', JSON.stringify({ scene: 1, shown: 1, answered: { k1: 'done' }, reached: ['h1', 'h2'] }));
    localStorage.setItem('teaching-hub.activity.local.k1', JSON.stringify({ revealed: true }));
    localStorage.setItem('hinge:l1:k1:solo', JSON.stringify({ choice: 'a' }));
    localStorage.setItem('teaching-hub.activity.local.t1', JSON.stringify({ keep: true }));
    const { host } = mount();
    host.querySelector<HTMLButtonElement>('.lecture-title__again')!.click();
    expect(localStorage.getItem('teaching-hub.activity.local.k1')).toBeNull();
    expect(localStorage.getItem('hinge:l1:k1:solo')).toBeNull();
    expect(localStorage.getItem('teaching-hub.activity.local.t1')).not.toBeNull();
  });

  it('holds Start on Loading… until status settles, for up to three seconds', async () => {
    vi.useFakeTimers();
    try {
      const { client } = fakeClient(() => new Promise<Status>(() => {}));
      const { host } = mount(client, short);
      const btn = host.querySelector<HTMLButtonElement>('.lecture-title__start')!;
      expect(btn.disabled).toBe(true);
      expect(btn.textContent).toBe('Loading…');
      await vi.advanceTimersByTimeAsync(3000);
      const after = host.querySelector<HTMLButtonElement>('.lecture-title__start')!;
      expect(after.disabled).toBe(false);
      expect(after.textContent).toBe('Start');
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for initials above the stage when status arrives late, and ✋ opens that first', async () => {
    let resolve: (s: Status) => void = () => {};
    const { client, sent } = fakeClient(() => new Promise<Status>((r) => { resolve = r; }), () => Promise.resolve(needsInitials));
    vi.useFakeTimers();
    let host: HTMLElement;
    try {
      ({ host } = mount(client, short));
      await vi.advanceTimersByTimeAsync(3000);
    } finally {
      vi.useRealTimers();
    }
    start(host);
    resolve(needsInitials);
    await flush();
    const bar = host.querySelector<HTMLElement>('.lecture-who')!;
    expect(bar.hidden).toBe(false);
    host.querySelector<HTMLButtonElement>('.lecture-strip__hand')!.click();
    expect(host.querySelector('.lecture-sheet')).toBeNull();
    // A claim that still needs initials says so.
    const form = bar.querySelector('form')!;
    form.querySelector('input')!.value = 'ZZ';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(bar.querySelector<HTMLElement>('.lecture-title__err')!.hidden).toBe(false);
    host.querySelector<HTMLButtonElement>('.lecture-bar__main')!.click();
    expect(sent).toHaveLength(0);
  });

  it('a successful late claim hides the bar and opens hand-ups', async () => {
    let resolve: (s: Status) => void = () => {};
    const { client } = fakeClient(() => new Promise<Status>((r) => { resolve = r; }));
    const { host } = mount(client, short);
    await flush();
    resolve(needsInitials);
    await flush();
    // On the title card the claim sits on the card itself.
    const form = host.querySelector<HTMLFormElement>('.lecture-title form')!;
    form.querySelector('input')!.value = 'AB';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(host.querySelector<HTMLButtonElement>('.lecture-title__start')!.disabled).toBe(false);
    start(host);
    expect(host.querySelector<HTMLElement>('.lecture-who')!.hidden).toBe(true);
    host.querySelector<HTMLButtonElement>('.lecture-strip__hand')!.click();
    expect(host.querySelector('.lecture-sheet')).not.toBeNull();
  });

  it('→ moves on even when a button has focus, but not with modifiers, repeats or in a field', () => {
    const { host, main } = mount();
    start(host);
    const press = (init: KeyboardEventInit, target: HTMLElement = host.querySelector<HTMLButtonElement>('.lecture-bar__back')!) =>
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true, ...init }));
    press({ metaKey: true });
    press({ repeat: true });
    expect(main().textContent).toBe('Reveal · 2 of 2');
    const field = document.createElement('div');
    field.setAttribute('contenteditable', '');
    host.querySelector('.lecture-stage')!.append(field);
    press({}, field);
    expect(main().textContent).toBe('Reveal · 2 of 2');
    press({});
    expect(main().textContent).toBe('Next scene →');
  });

  it('leaves → to a block that already handled it, like tabs', () => {
    const { host, main } = mount();
    start(host);
    const tabs = document.createElement('div');
    tabs.addEventListener('keydown', (e) => e.preventDefault());
    host.querySelector('.lecture-stage')!.append(tabs);
    tabs.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(main().textContent).toBe('Reveal · 2 of 2');
  });

  it('marks the first scene of each chapter on the strip', () => {
    const chapter = b('c1', 'section', { title: 'Part one', blocks: [heading('ca'), text('x'), heading('cb')], takeaway: { enabled: false } });
    const { host } = mount(null, [heading('h0'), chapter]);
    start(host);
    const dots = [...host.querySelectorAll('.lecture-strip__dot')];
    expect(dots.map((d) => d.classList.contains('lecture-strip__dot--chapter'))).toEqual([false, true, false]);
  });

  it('lists each missed scene once under Look again, and keeps Finish as it was', async () => {
    const two = [heading('m1'), b('c1', 'cloze', { text: 'a' }), b('c2', 'cloze', { text: 'b' })];
    localStorage.setItem('lecture:l1:state', JSON.stringify({ scene: 0, shown: 2, answered: { c1: 'wrong', c2: 'wrong' }, missed: ['c1', 'c2'], reached: ['m1'], finished: true }));
    const { host } = mount(null, two);
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    const looks = [...host.querySelectorAll('.lecture-recap button')].filter((x) => x.textContent?.startsWith('Look again'));
    expect(looks).toHaveLength(1);
    (looks[0] as HTMLButtonElement).click();
    expect(JSON.parse(localStorage.getItem('lecture:l1:state')!).finished).toBe(true);
  });
});
