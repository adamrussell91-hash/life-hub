import { beforeEach, describe, expect, it } from 'vitest';
import { verdictLine, changes, kindGroup } from '@/progress/verdict';
import { feedbackTimeline, pickPatterns, PATTERN_MAX } from '@/student/feedback-timeline';
import { feedbackTrends, trendSubject, focusLine } from '@/student/feedback-trends';
import { pieceView, returnedHome } from '@/student/returned-view';
import { renderProfile } from '@/student/profile-view';
import { RETURNED_TOUR_KEY } from '@/student/returned-tour';
import { BANNED } from '@/progress/story-text';
import type { FeedbackRow, ReturnedItem } from '@/progress/types';

const row = (code_id: string, positive: boolean, hit: number, extra: Partial<FeedbackRow> = {}): FeedbackRow => ({ code_id, code: code_id.toUpperCase(), label: `Label ${code_id}`, colour: 'peach', positive, cells: [], hit, of: 5, total: hit, trend: 'steady', hits: [], do: `Do ${code_id}.`, ...extra });
const item = (id: string, extra: Partial<ReturnedItem> = {}): ReturnedItem => ({ id, kind: 'written', title: `Piece ${id}`, date: '6 Oct', day: '2026-10-06', new: false, codes: [], good: [], work: [], verdict: null, ...extra });

describe('how a piece went', () => {
  it('reads against the student’s own last piece, by kind', () => {
    expect(verdictLine({ kind: 'better' }, 'written')).toBe('Better than your last piece.');
    expect(verdictLine({ kind: 'same' }, 'viva')).toBe('About the same as your last viva.');
    expect(verdictLine({ kind: 'lower' }, 'answer')).toBe('Your last short answers were stronger.');
    expect(verdictLine({ kind: 'first' }, 'quiz')).toBe('Your first short answers. This is your starting point.');
    expect(verdictLine({ kind: 'counts', good: 2, work: 1 }, 'written')).toBe('2 things done well, 1 thing to work on.');
    expect(verdictLine({ kind: 'counts', good: 0, work: 3 }, 'written')).toBe('3 things to work on.');
    expect(verdictLine(null, 'note')).toBe('');
  });
  it('never uses a word students are kept from reading about their learning', () => {
    const lines = (['first', 'better', 'same', 'mixed', 'lower'] as const).flatMap((kind) => ['written', 'viva', 'quiz'].map((k) => verdictLine({ kind }, k)));
    for (const line of lines) for (const word of BANNED) expect(new RegExp(`\\b${word}\\b`, 'i').test(line), `${word} in "${line}"`).toBe(false);
  });
  it('lists what moved, risen first', () => {
    expect(changes({ kind: 'mixed', up: ['Evidence'], same: ['Structure'], down: ['Spelling'] })).toEqual([{ name: 'Evidence', way: 'up' }, { name: 'Structure', way: 'same' }, { name: 'Spelling', way: 'work' }]);
    expect(['written', 'note', 'viva', 'quiz', 'answer'].map(kindGroup)).toEqual(['written', 'written', 'spoken', 'short', 'short']);
  });
});

describe('feedback timeline', () => {
  it('never shows more than a handful of buttons, however many codes there are', () => {
    const rows = [...Array.from({ length: 40 }, (_, i) => row(`w${i}`, false, (i % 5) + 1)), ...Array.from({ length: 40 }, (_, i) => row(`g${i}`, true, (i % 5) + 1)), row('none', false, 0)];
    const picked = pickPatterns(rows);
    expect(picked.length).toBe(PATTERN_MAX.work + PATTERN_MAX.good);
    expect(picked.every((r) => r.hit === 5)).toBe(true);
    expect(picked.filter((r) => r.positive).length).toBe(PATTERN_MAX.good);
  });
  const items = [
    item('w:c', { date: '13 Oct', day: '2026-10-13', new: true, work: ['ts'], codes: ['ts'], verdict: { kind: 'better' } }),
    item('v:b', { kind: 'viva', date: '6 Oct', work: ['ts'], codes: ['ts'] }),
    item('q:a', { kind: 'quiz', date: '6 Oct', good: ['ts'], codes: ['ts'] })
  ];
  it('runs oldest to newest, stacks a day’s pieces, and names each kind in words', () => {
    const tl = feedbackTimeline(items, [], () => undefined);
    const days = [...tl.querySelectorAll('.ft-day')];
    expect(days.map((d) => d.querySelector('.ft-day__date')!.textContent)).toEqual(['6 Oct', '13 Oct']);
    expect(days[0]!.querySelectorAll('.ft-dot').length).toBe(2);
    expect([...tl.querySelectorAll('.ft-dot')].map((d) => d.getAttribute('aria-label'))).toEqual(['Short answer: Piece q:a, 6 Oct', 'Spoken: Piece v:b, 6 Oct', 'Written: Piece w:c, 13 Oct, new']);
    expect(tl.querySelector('.ft-key')!.textContent).toBe('WrittenSpokenShort answerNew');
    expect(tl.querySelector('.ft-filter')).toBeNull();
  });
  it('previews the newest piece first; a dot previews its own, and Open opens it', () => {
    const opened: [string, boolean][] = [];
    const tl = feedbackTimeline(items, [], (id, wasNew) => opened.push([id, wasNew]));
    expect(tl.querySelector('.ft-peek__title')!.textContent).toBe('Piece w:c');
    expect(tl.querySelector('.ft-peek__meta')!.textContent).toBe('13 Oct · Better than your last piece. · New');
    (tl.querySelector('.ft-dot[data-piece="v:b"]') as HTMLElement).click();
    expect(tl.querySelector('.ft-dot.is-on')!.getAttribute('data-piece')).toBe('v:b');
    (tl.querySelector('.ft-peek__open') as HTMLElement).click();
    expect(opened).toEqual([['v:b', false]]);
  });
  it('a button keeps the dots bright where the teacher said it, in words, and lets go on a second tap', () => {
    const tl = feedbackTimeline(items, [row('ts', false, 2, { label: 'Topic sentence', trend: 'less', do: 'Open with your argument.' })], () => undefined);
    const chip = tl.querySelector('.ft-chip') as HTMLElement;
    expect(chip.textContent).toBe('Topic sentence');
    chip.click();
    expect(chip.getAttribute('aria-pressed')).toBe('true');
    expect([...tl.querySelectorAll('.ft-dot.is-dim')].map((d) => d.getAttribute('data-piece'))).toEqual(['q:a']);
    expect(tl.querySelector('.ft-say')!.textContent).toBe('Topic sentence came up on 2 of your last 5 pieces. That is less often than before. The bright dots are where.Do this next: Open with your argument.');
    chip.click();
    expect(tl.querySelectorAll('.ft-dot.is-dim').length).toBe(0);
    expect((tl.querySelector('.ft-say') as HTMLElement).hidden).toBe(true);
  });
});

describe('returned work in time order', () => {
  it('puts what is new, or asked for again, first as cards, then the timeline', () => {
    const home = returnedHome([item('w:c', { new: true, verdict: { kind: 'first' } }), item('w:b', { redraft: 'asked' }), item('w:a')], () => undefined);
    expect([...home.querySelectorAll('.pg-group')].map((n) => n.textContent)).toEqual(['New for you', 'All your feedback, oldest to newest']);
    expect([...home.querySelectorAll('.ru__card')].map((c) => c.getAttribute('data-piece'))).toEqual(['w:c', 'w:b']);
    expect(home.querySelector('.ru__verdict')!.textContent).toBe('Your first piece. This is your starting point.');
    expect(home.querySelectorAll('.ft-dot').length).toBe(3);
  });
  it('leaves the cards out when everything has been opened', () => {
    const home = returnedHome([item('w:a')], () => undefined);
    expect(home.querySelector('.ru')).toBeNull();
    expect(home.querySelector('.ft')).toBeTruthy();
  });
});

describe('a returned piece', () => {
  const piece = { id: 'w:l:b', kind: 'written', title: 'Flood', date: '16 Nov', comment: 'The figure does real work.', text: { answers: { q1: 'Floods are bad for towns.' } }, tags: [], criteria: [{ label: 'Structure', step: 'building' as const, was: 'building' as const }], verdict: { kind: 'better' as const, up: ['Using evidence'], same: ['Structure'], down: [] }, rubric: { next_step: 'End with a link back to the question.', skills: [{ ref: 'a.b', name: 'Using evidence', rung: 'skilled' }] } };
  it('opens with three lines, the next step said once, and the rest behind More detail', () => {
    const view = pieceView(piece, () => undefined, { practise: { title: 'Writing a conclusion', href: '/s/classes/c/lessons/l7' } });
    expect([...view.querySelectorAll('.fb3 dt')].map((n) => n.textContent)).toEqual(['How you went', 'What changed', 'Your next step']);
    expect(view.querySelector('.fb3__verdict')!.textContent).toBe('Better than your last piece.');
    expect([...view.querySelectorAll('.fb3 .fb-chip')].map((n) => n.textContent)).toEqual(['Using evidence: up', 'Structure: same']);
    expect(view.querySelector('.fb3__where')!.textContent).toBe('You practise this next in Writing a conclusion');
    expect(view.querySelector('.fb3__lesson')!.getAttribute('href')).toBe('/s/classes/c/lessons/l7');
    expect(view.textContent!.split('End with a link back to the question.').length - 1).toBe(1);
    expect(view.querySelector('.pg-piece__side > .pg-box .pg-box__comment')!.textContent).toBe('The figure does real work.');
    expect(view.querySelector('details.pg-more .rr')).toBeTruthy();
    expect(view.querySelector('details.pg-more .pg-ladder')).toBeTruthy();
    expect((view.querySelector('details.pg-more') as HTMLDetailsElement).open).toBe(false);
  });
  it('works its next step out from the codes when the teacher chose none', () => {
    const code = { id: 'ts', code: 'TS', label: 'Topic sentence', group: 'composition', colour: 'peach', descriptor: 'Open with your argument.' };
    const view = pieceView({ ...piece, rubric: undefined, verdict: null, tags: [{ code_id: 'ts', part: 'answers', field: 'q1', start: 0, end: 6, positive: false, code: 'TS', label: 'Topic sentence', colour: 'peach', action: 'Open with your argument.' }], codes: [code] } as never, () => undefined);
    expect(view.querySelector('.fb3__do')!.textContent).toBe('Open with your argument.');
    expect(view.querySelector('.fb3__where')).toBeNull();
    expect(view.querySelector('.voice-focus')).toBeNull();
  });
});

describe('how you’re going', () => {
  const skills = [{ strand: 'Composing', rows: [{ key: 'skill:a.b', name: 'Using evidence', counts: {} as never, now: 'skilled' as const, first: 'below' as const, story: { kind: 'now' as const, step: 'skilled' as const }, i_can: null, next_move: null, next_rung: null, rungs: { capable: 'I can name a fact.', skilled: 'I can back up a point.', accomplished: null, excellent: null } }] }];
  const outcomes = [{ key: 'out:a', name: 'Analysis', sub: '', cells: ['building', 'secure'] as never, now: 'secure' as const, story: { kind: 'now' as const, step: 'secure' as const }, looks: null }];
  it('picks what has risen furthest and tells it before, now and next', () => {
    expect(trendSubject({ skills, outcomes })!.name).toBe('Using evidence');
    const sec = feedbackTrends({ skills, outcomes, focus: { kind: 'do', line: 'Link back to the question.' }, feedback: { pieces: [], rows: [row('ev', true, 3), row('lk', false, 4)] } }, { title: 'Lesson 7', href: '/x' })!;
    expect([...sec.querySelectorAll('.pg-box__title')].map((n) => n.textContent)).toEqual(['Before', 'Now', 'Focus on next']);
    expect([...sec.querySelectorAll('.ftr__say')].map((n) => n.textContent)).toEqual(['Using evidence. You started here: On the way to Capable.', 'Using evidence. You are here now: Skilled.']);
    expect(sec.querySelector('.ftr__ican')!.textContent).toBe('I can back up a point.');
    expect([...sec.querySelectorAll('.fb-chip')].map((n) => n.textContent)).toEqual(['Label ev: on 3 of your last 5', 'Label lk: on 4 of your last 5']);
    expect(sec.querySelector('.fb3__do')!.textContent).toBe('Link back to the question.');
    expect(sec.querySelector('.fb3__lesson')!.textContent).toBe('Lesson 7');
  });
  it('falls back to the code that comes up most, and says nothing when there is nothing', () => {
    expect(focusLine({ next: [{ code_id: 'g', code: 'G', colour: 'sage', positive: true, hit: 2, of: 2, action: 'Keep it.' }, { code_id: 'w', code: 'W', colour: 'peach', positive: false, hit: 1, of: 2, action: 'Fix it.' }] })).toBe('Fix it.');
    expect(feedbackTrends({})).toBeNull();
  });
});

describe('the guide to the tab', () => {
  const payload = { need: null, initials: 'AR', map: { next: null, unit: { content: { version: 2, rail_stops: [], gates: [], nudges: {}, terminus: { label: 'Task' } }, lines: [], lessons: [], schedule: [], pre: [] }, lessons: [] }, pieces: [{ id: 'w:a', label: 'A', date: '6 Oct', kind: 'written' }], unseen: 1, next: [], outcomes: [], concepts: [], skills: [], codes: [] };
  const open = async (teacher?: { name: string }): Promise<HTMLElement> => {
    const h = renderProfile(payload as never, { classId: 'c', teacher, loadReturned: async () => [item('w:a', { new: true })] });
    document.body.replaceChildren(h);
    (h.querySelector('[data-tab="returned"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    return h;
  };
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });
  it('shows itself the first time a student opens the tab, then waits in the corner of that tab', async () => {
    const h = await open();
    expect(document.querySelector('.tour-card__title')!.textContent).toBe('Your feedback');
    for (const want of ['New for you', 'Every piece, in order']) {
      (document.querySelector('.tour-card__next') as HTMLElement).click();
      expect(document.querySelector('.tour-card__title')!.textContent).toBe(want);
    }
    (document.querySelector('.tour-card__skip') as HTMLElement).click();
    expect(localStorage.getItem(RETURNED_TOUR_KEY)).toBe('seen');
    const help = h.querySelector('.pg-panel .tour-help') as HTMLElement;
    expect(help.hidden).toBe(false);
    const again = await open();
    expect(document.querySelector('.tour-card')).toBeNull();
    expect((again.querySelector('.tour-help') as HTMLElement).hidden).toBe(false);
  });
  it('is the student’s only: a teacher looking in gets no guide', async () => {
    const h = await open({ name: 'Sam Teacher' });
    (h.querySelector('[data-tab="returned"]') as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('.tour-card')).toBeNull();
    expect(h.querySelector('.tour-help')).toBeNull();
  });
});
