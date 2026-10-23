import { describe, it, expect, vi } from 'vitest';
import { mountLecturePlayer } from '@/lecture/player';
import type { Block } from '@/schemas/block';

const b = (id: string, block_type: string, content: Record<string, unknown>): Block =>
  ({ id, type: 'block', block_type, variant: 'medium', visibility: 'student_teacher', content }) as Block;

describe('lecture player as a segment', () => {
  it('skips the title card, ends on a Done button and calls onDone', () => {
    const host = document.createElement('div');
    const onDone = vi.fn();
    mountLecturePlayer(host, {
      lessonId: 'tut1', title: 'Structure', blocks: [b('h1', 'heading', { text: 'Demo' }), b('r1', 'rich_text', { text: 'Watch.' })],
      client: null, renderHero: () => {},
      segment: { saveKey: 'tutorial:tut1:common', doneLabel: 'On to your group', onDone }
    });
    expect(host.querySelector('.lecture-title')).toBeNull();
    expect(host.querySelector('.lecture-stage')).not.toBeNull();
    const main = host.querySelector('.lecture-bar__main') as HTMLButtonElement;
    for (let i = 0; i < 5 && !host.querySelector('.lecture-recap'); i += 1) main.click();
    const finish = host.querySelector('.lecture-recap__finish') as HTMLButtonElement;
    expect(finish.textContent).toBe('On to your group');
    finish.click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('a stretch finished on this device still reaches its Done button', () => {
    const blocks = [b('h1', 'heading', { text: 'Demo' }), b('r1', 'rich_text', { text: 'Watch.' })];
    const mount = (onDone: () => void) => {
      const host = document.createElement('div');
      mountLecturePlayer(host, { lessonId: 'tut2', title: 'T', blocks, client: null, renderHero: () => {}, segment: { saveKey: 'tutorial:tut2:before', doneLabel: 'Next', onDone } });
      return host;
    };
    const first = mount(() => {});
    const main = first.querySelector('.lecture-bar__main') as HTMLButtonElement;
    for (let i = 0; i < 5 && !first.querySelector('.lecture-recap'); i += 1) main.click();
    (first.querySelector('.lecture-recap__finish') as HTMLButtonElement).click();
    const onDone = vi.fn();
    const again = mount(onDone);
    const finish = again.querySelector('.lecture-recap__finish') as HTMLButtonElement;
    expect(finish.textContent).toBe('Next');
    finish.click();
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
