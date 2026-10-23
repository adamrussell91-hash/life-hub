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
    await Promise.resolve();
    await Promise.resolve();
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    expect(host.querySelector<HTMLElement>('.lecture-strip__hand')!.hidden).toBe(false);
    main().click();
    expect(main().textContent).toBe('Next scene →');
  });

  it('offers Raise it with ✋ on a question note cue inside the player', () => {
    const { host } = mount(null, [heading('h1'), b('q1', 'note_cue', { kind: 'question', prompt: 'What puzzles you?' })]);
    host.querySelector<HTMLButtonElement>('.lecture-title__start')!.click();
    const raise = host.querySelector<HTMLButtonElement>('.lecture-raise');
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
});
