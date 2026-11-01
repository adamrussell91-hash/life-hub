import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveActivityState, storageKey } from '@/blocks/learning-activity';
import { mountWorkSync, parseWorkKey, writtenFields, type WorkCall } from '@/student/work-sync';
import { ApiClientError } from '@/api/client';

const lesson = 'lesson1';
const answersKey = `${storageKey(lesson, 'qset1')}.answers`;

type Sent = { action: string; extra: Record<string, unknown> };
function fakeServer(start: 'initials' | 'ready' | 'anonymous' = 'ready') {
  let known = start === 'ready';
  const sent: Sent[] = [];
  let failNext = 0;
  const call: WorkCall = async (action, extra = {}) => {
    sent.push({ action, extra });
    if (start === 'anonymous') return { need: null, anonymous: true };
    if (action === 'claim') {
      known = true;
      return { need: null, initials: 'BB' };
    }
    if (!known) {
      if (action === 'save') throw new ApiClientError({ code: 'need_initials', message: 'Type your initials first.' });
      return { need: 'initials' };
    }
    if (action === 'save' && failNext > 0) {
      failNext -= 1;
      throw new ApiClientError({ code: 'network_error', message: 'Couldn’t reach the server.' });
    }
    return { need: null, initials: 'BB', ...(action === 'save' ? { saved: true as const } : {}) };
  };
  return { call, sent, saves: () => sent.filter((s) => s.action === 'save').map((s) => s.extra), failOnce: () => { failNext = 1; }, claim: () => { known = true; } };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await tick();
}

function host(): HTMLElement {
  const content = document.createElement('div');
  content.append(document.createElement('h1'), Object.assign(document.createElement('div'), { className: 'lesson-blocks' }));
  document.body.append(content);
  return content;
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('work-sync helpers', () => {
  it('knows which saved keys are written work for this lesson', () => {
    expect(parseWorkKey(lesson, answersKey)).toEqual({ blockId: 'qset1', part: 'answers' });
    expect(parseWorkKey(lesson, `${storageKey(lesson, 'q2')}.format.because_but_so`)).toEqual({ blockId: 'q2', part: 'format.because_but_so' });
    expect(parseWorkKey(lesson, `${storageKey(lesson, 'q2')}.kaplan.see`)).toEqual({ blockId: 'q2', part: 'kaplan.see' });
    expect(parseWorkKey(lesson, `${storageKey(lesson, 'qset1')}.step.2`)).toEqual({ blockId: 'qset1', part: 'step.2' });
    expect(parseWorkKey(lesson, `${storageKey(lesson, 'qset1')}.step.x`)).toBeNull();
    expect(parseWorkKey(lesson, storageKey(lesson, 'cards'))).toBeNull();
    expect(parseWorkKey(lesson, `${storageKey(lesson, 'q2')}.discern`)).toBeNull();
    expect(parseWorkKey('other', answersKey)).toBeNull();
  });

  it('keeps the text and leaves out step, level and empty answers', () => {
    expect(writtenFields({ q1: 'The state', q2: '  ' })).toEqual({ q1: 'The state' });
    expect(writtenFields({ step: 2, level: 'core', done: true, notes: { s1: 'First', s2: '' }, answer: 'Yes' })).toEqual({ 'notes.s1': 'First', answer: 'Yes' });
    expect(writtenFields('loose')).toEqual({});
  });
});

describe('mountWorkSync', () => {
  it('sends what a student writes a moment after they stop, and what they wrote before it loaded', async () => {
    vi.useFakeTimers();
    localStorage.setItem(answersKey, JSON.stringify({ q1: 'Earlier' }));
    const server = fakeServer('ready');
    const sync = mountWorkSync(host(), { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 100 });
    await vi.runAllTimersAsync();
    expect(server.saves()).toEqual([{ block_id: 'qset1', part: 'answers', fields: { q1: 'Earlier' } }]);

    saveActivityState(answersKey, { q1: 'Earlier', q2: 'Then' });
    saveActivityState(answersKey, { q1: 'Earlier', q2: 'Then more' });
    await vi.advanceTimersByTimeAsync(50);
    expect(server.saves()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(server.saves()).toEqual([
      { block_id: 'qset1', part: 'answers', fields: { q1: 'Earlier' } },
      { block_id: 'qset1', part: 'answers', fields: { q1: 'Earlier', q2: 'Then more' } }
    ]);
    // Flashcards and the like aren't written work.
    saveActivityState(storageKey(lesson, 'cards'), { order: ['a'] });
    await vi.runAllTimersAsync();
    expect(server.saves()).toHaveLength(2);
    sync.dispose();
    saveActivityState(answersKey, { q1: 'After' });
    await vi.runAllTimersAsync();
    expect(server.saves()).toHaveLength(2);
  });

  it('sends a next-step pick after its answer, and never counts it as writing', async () => {
    vi.useFakeTimers();
    const stepKey = `${storageKey(lesson, 'qset1')}.step.0`;
    const server = fakeServer('ready');
    const sync = mountWorkSync(host(), { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 100 });
    await vi.runAllTimersAsync();
    // A pick from earlier is still waiting when the answer under it changes.
    saveActivityState(stepKey, { pick: '{"code_id":"ts","line":"L","start":0,"end":4}' });
    saveActivityState(answersKey, { q1: 'Kept. More.' });
    await vi.runAllTimersAsync();
    expect(server.saves().map((s) => s.part)).toEqual(['answers', 'step.0']);
    expect(sync.progress().written).toBe(1);
    sync.dispose();
  });

  it('asks a new device for initials once, then sends everything waiting', async () => {
    const server = fakeServer('initials');
    const page = host();
    const sync = mountWorkSync(page, { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 0 });
    await settle();
    const bar = page.querySelector<HTMLElement>('.ws-bar')!;
    expect(bar.hidden).toBe(false);
    expect(bar.nextElementSibling?.className).toBe('lesson-blocks');
    saveActivityState(answersKey, { q1: 'Kept' });
    await sync.flush();
    expect(server.saves()).toEqual([]);
    bar.querySelector<HTMLInputElement>('input')!.value = 'bb';
    bar.querySelector<HTMLButtonElement>('button')!.click();
    await settle();
    expect(server.sent.find((s) => s.action === 'claim')?.extra).toEqual({ initials: 'bb' });
    expect(bar.hidden).toBe(true);
    expect(server.saves()).toEqual([{ block_id: 'qset1', part: 'answers', fields: { q1: 'Kept' } }]);
    sync.dispose();
  });

  it('leaves the asking to a sprint, case study, tutorial or lecture player on the page', async () => {
    const server = fakeServer('initials');
    const page = host();
    page.querySelector('.lesson-blocks')!.append(Object.assign(document.createElement('div'), { className: 'sprint' }));
    const sync = mountWorkSync(page, { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 0 });
    await settle();
    expect(page.querySelector<HTMLElement>('.ws-bar')!.hidden).toBe(true);
    sync.dispose();
  });

  it('keeps work on the device and says so when the send fails, then tries again', async () => {
    vi.useFakeTimers();
    const server = fakeServer('ready');
    const page = host();
    const sync = mountWorkSync(page, { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 10, retryMs: 1000 });
    await vi.runAllTimersAsync();
    server.failOnce();
    saveActivityState(answersKey, { q1: 'Offline' });
    await vi.advanceTimersByTimeAsync(20);
    const bar = page.querySelector<HTMLElement>('.ws-bar')!;
    expect(bar.hidden).toBe(false);
    expect(bar.textContent).toContain('saved on this device');
    await vi.advanceTimersByTimeAsync(1000);
    expect(server.saves().at(-1)).toEqual({ block_id: 'qset1', part: 'answers', fields: { q1: 'Offline' } });
    expect(bar.hidden).toBe(true);
    sync.dispose();
  });

  it('picks up initials claimed by the quiz on the page, without asking again', async () => {
    vi.useFakeTimers();
    const server = fakeServer('initials');
    const page = host();
    const sync = mountWorkSync(page, { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 10, retryMs: 1000 });
    await vi.runAllTimersAsync();
    saveActivityState(answersKey, { q1: 'Typed' });
    server.claim();
    await vi.advanceTimersByTimeAsync(20);
    expect(server.saves(), 'too soon to look again').toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    saveActivityState(answersKey, { q1: 'Typed more' });
    await vi.advanceTimersByTimeAsync(20);
    expect(server.saves()).toEqual([{ block_id: 'qset1', part: 'answers', fields: { q1: 'Typed more' } }]);
    expect(page.querySelector<HTMLElement>('.ws-bar')!.hidden).toBe(true);
    sync.dispose();
  });

  it('records nothing for a class with no list', async () => {
    const server = fakeServer('anonymous');
    const page = host();
    const sync = mountWorkSync(page, { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 0 });
    await settle();
    saveActivityState(answersKey, { q1: 'x' });
    await sync.flush();
    expect(server.saves()).toEqual([]);
    expect(page.querySelector<HTMLElement>('.ws-bar')!.hidden).toBe(true);
    sync.dispose();
  });
});

describe('hand in', () => {
  it('adds a Hand in button under a marked block and turns it into Hand in again', async () => {
    const root = host();
    const block = Object.assign(document.createElement('div'), { className: 'block' });
    block.dataset.blockId = 'qset1';
    root.append(block);
    const call: WorkCall = async (action) =>
      action === 'handin' ? { need: null, handed_in_at: '2026-10-30T01:00:00Z' } : { need: null, initials: 'BB', handin_blocks: ['qset1'] };
    const handle = mountWorkSync(root, { lessonId: lesson, classId: 'class1', call, delayMs: 5 });
    await settle();
    const send = [...block.querySelectorAll('button')].find((b) => b.textContent === 'Hand in');
    expect(send).toBeTruthy();
    send!.click();
    await settle();
    expect(block.querySelector('button')!.textContent).toBe('Hand in again');
    handle.dispose();
  });
});

describe('mountWorkSync: the lesson footer’s handle', () => {
  it('counts what’s written, then sends it all and hands in the marked blocks with writing', async () => {
    localStorage.setItem(answersKey, JSON.stringify({ q1: 'One', q2: 'Two' }));
    localStorage.setItem(`${storageKey(lesson, 'qset2')}.answers`, JSON.stringify({ q1: 'Three' }));
    const sent: Array<[string, Record<string, unknown>]> = [];
    const call: WorkCall = async (action, extra = {}) => {
      sent.push([action, extra]);
      return action === 'handin' ? { need: null, handed_in_at: '2026-10-31T01:00:00Z' } : { need: null, initials: 'BB', handin_blocks: ['qset1', 'qset9'] };
    };
    const sync = mountWorkSync(host(), { lessonId: lesson, classId: 'class1', call, delayMs: 0 });
    await settle();
    expect(sync.progress()).toEqual({ written: 3, toHandIn: 1 });
    expect(await sync.handInAll()).toBe(true);
    expect(sent.filter(([a]) => a === 'handin').map(([, e]) => e)).toEqual([{ block_id: 'qset1' }]);
    expect(sent.filter(([a]) => a === 'save').length).toBe(2);
    sync.dispose();
  });

  it('says it couldn’t hand in while the device still needs initials', async () => {
    const server = fakeServer('initials');
    const sync = mountWorkSync(host(), { lessonId: lesson, classId: 'class1', call: server.call, delayMs: 0 });
    await settle();
    expect(await sync.handInAll()).toBe(false);
    server.claim();
    expect(await sync.handInAll()).toBe(true);
    sync.dispose();
  });
});
