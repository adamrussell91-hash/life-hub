import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountWhyRoute, outcomesBlockId, routeLabel, type LessonRoute, type WhyRouteCalls, type ClassWhys } from '@/student/why-route';

const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };

const ROUTE: LessonRoute = {
  route: { before: 2, done: 1, here_index: 2, remaining: 2, assessment: { title: 'Monthly Review', short: 'Monthly Review', due_date: '2026-11-13', due_time: '09:00' } },
  reason: 'You\'ll need this for the Monthly Review on Friday.',
  big_idea: null
};

function page(sections: string[] = ['secA', 'secB']): HTMLElement {
  const root = document.createElement('div');
  const hero = document.createElement('header');
  hero.className = 'lesson-hero';
  const h1 = document.createElement('h1');
  h1.className = 'lesson-hero__title';
  h1.textContent = 'Close reading';
  hero.append(h1);
  root.append(hero);
  for (const id of sections) {
    const wrap = document.createElement('div');
    wrap.className = 'block';
    wrap.dataset.blockId = id;
    wrap.dataset.blockType = 'section';
    wrap.innerHTML = `<section class="block-section"><h2 class="block-section__title block-title">Part ${id}</h2><div class="block-section__body"></div></section>`;
    root.append(wrap);
  }
  document.body.append(root);
  return root;
}

const section = (id: string, blocks: unknown[] = []) => ({ id, block_type: 'section', visibility: 'student_teacher', content: { title: id, blocks } });

function fakeCalls(route: LessonRoute = ROUTE, whys: ClassWhys = { mine: null, others: [] }) {
  const calls: WhyRouteCalls = { route: vi.fn(async () => route), whys: vi.fn(async () => whys) };
  return calls;
}

afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); });

describe('why route', () => {
  it('puts one compass beside each top-level section title, with one request for the lesson', async () => {
    const root = page();
    const calls = fakeCalls();
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks: [section('secA'), section('secB')] }, classId: 'c1', calls, reducedMotion: true });
    await flush();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.wr-btn');
    expect(buttons).toHaveLength(2);
    expect(calls.route).toHaveBeenCalledTimes(1);
    const btn = buttons[0];
    expect(btn.getAttribute('aria-label')).toBe('Why this matters');
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.nextElementSibling?.classList.contains('block-section__title')).toBe(true);
    const panel = document.getElementById(btn.getAttribute('aria-controls') ?? '')!;
    expect(panel.hidden).toBe(true);
    btn.click();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    expect(panel.querySelector('.wr-reason')?.textContent).toBe('You\'ll need this for the Monthly Review on Friday.');
    expect(panel.querySelector('.wr-route')?.getAttribute('aria-label')).toBe('2 more lessons after this one, then Monthly Review.');
    const labels = [...panel.querySelectorAll('text')].map((t) => t.textContent);
    expect(labels).toEqual(expect.arrayContaining(['Done', 'You\'re here', '2 more lessons', 'Monthly Review']));
    expect(panel.querySelector('.wr-route__stop--goal')).not.toBeNull();
    btn.click();
    expect(panel.hidden).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows no button at all when there is no reason', async () => {
    const root = page();
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks: [section('secA')] }, classId: 'c1', calls: fakeCalls({ route: { ...ROUTE.route!, assessment: null }, reason: null, big_idea: null }) });
    await flush();
    expect(root.querySelector('.wr-btn')).toBeNull();
  });

  it('falls back to the lesson title when there are no sections', async () => {
    const root = page([]);
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks: [] }, classId: 'c1', calls: fakeCalls(), reducedMotion: true });
    await flush();
    const btn = root.querySelector<HTMLButtonElement>('.lesson-hero .wr-btn');
    expect(btn).not.toBeNull();
    // The panel sits under the hero, not inside it.
    expect(root.querySelector('.lesson-hero')?.nextElementSibling?.classList.contains('wr-panel')).toBe(true);
  });

  it('keeps the class whys hidden until the student has written their own', async () => {
    const root = page(['secA']);
    const blocks = [section('secA', [{ id: 'whw1', block_type: 'outcomes', visibility: 'student_teacher', content: {} }])];
    const calls = fakeCalls(ROUTE, { mine: null, others: [] });
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks }, classId: 'c1', calls, reducedMotion: true });
    await flush();
    root.querySelector<HTMLButtonElement>('.wr-btn')!.click();
    await flush();
    expect(calls.whys).toHaveBeenCalledWith('whw1');
    expect(root.querySelector('.wr-class')).toBeNull();
  });

  it('shows the class whys with the student\'s own marked, all at once under reduced motion', async () => {
    const root = page(['secA', 'secB']);
    const blocks = [{ id: 'whw1', block_type: 'outcomes', visibility: 'student_teacher', content: {} }, section('secA'), section('secB')];
    const calls = fakeCalls(ROUTE, { mine: 'So I can quote a few words', others: ['Because the poem turns', 'To explain, not retell'] });
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks }, classId: 'c1', calls, reducedMotion: true });
    await flush();
    const [a, b] = root.querySelectorAll<HTMLButtonElement>('.wr-btn');
    a.click();
    b.click();
    await flush();
    // One status read for the lesson, however many sections open.
    expect(calls.whys).toHaveBeenCalledTimes(1);
    const box = root.querySelector('.wr-class')!;
    expect(box.querySelector('.wr-lab')?.textContent).toBe('Why your class thinks it matters');
    const lines = [...box.querySelectorAll('.wr-fade')];
    expect(lines).toHaveLength(3);
    expect(box.querySelector('.wr-fade--mine')?.textContent).toBe('“So I can quote a few words”');
  });

  it('fades through the whys one at a time when motion is allowed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const micro = async () => { for (let i = 0; i < 10; i += 1) await Promise.resolve(); };
    const root = page(['secA']);
    const blocks = [{ id: 'whw1', block_type: 'outcomes', visibility: 'student_teacher', content: {} }, section('secA')];
    mountWhyRoute({ root, lesson: { lesson_id: 'l1', blocks }, classId: 'c1', calls: fakeCalls(ROUTE, { mine: 'Mine', others: ['Theirs'] }), reducedMotion: false });
    await micro();
    root.querySelector<HTMLButtonElement>('.wr-btn')!.click();
    await micro();
    const fade = () => root.querySelector('.wr-fade')!;
    expect(root.querySelectorAll('.wr-fade')).toHaveLength(1);
    expect(fade().textContent).toBe('“Mine”');
    vi.advanceTimersByTime(4600);
    expect(fade().classList.contains('wr-fade--out')).toBe(true);
    vi.advanceTimersByTime(600);
    expect(fade().textContent).toBe('“Theirs”');
    expect(fade().classList.contains('wr-fade--mine')).toBe(false);
  });

  it('helpers: finds a nested What, How, Why block; route sentence without an assessment', () => {
    expect(outcomesBlockId([{ id: 'c', block_type: 'columns', content: { columns: [{ blocks: [{ id: 'o', block_type: 'outcomes' }] }] } }])).toBe('o');
    expect(outcomesBlockId([{ id: 'o', block_type: 'outcomes', visibility: 'teacher_only' }])).toBeNull();
    expect(routeLabel({ before: 0, done: 0, here_index: 0, remaining: 1, assessment: null })).toBe('1 more lesson after this one in this unit.');
  });
});
