import type { PublishedLesson } from '@/schemas/published-lesson';
import type { Block } from '@/schemas/block';
import { renderBlock } from '@/blocks/render';
import { isSidePath } from '@/lecture/scenes';
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import { FADED_EVENT, type FadedDetail } from '@/blocks/faded-example';
import { studentStage, type DeviceProgress } from './stage';
import type { TutorialStage } from './schema';
import type { TutorialClient, TutorialStatus } from './api';
import './tutorial.css';

export type TutorialPlayerOptions = {
  lesson: PublishedLesson;
  classId?: string;
  /** Null when opened without a class: the student is asked to open it from their class page. */
  client: TutorialClient | null;
  renderHero: (host: HTMLElement) => void;
};

const RETRY_MS = 5000;
const NONE: DeviceProgress = { common: false, exit: false };

/**
 * A student's tutorial is two pages: the Common demo, full width, then their
 * group's page with the exit check at the bottom. The teacher is sitting with
 * them, so there is nothing to wait for and nothing else to navigate.
 */
export function mountTutorialPlayer(host: HTMLElement, options: TutorialPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const lessonId = lesson.lesson_id;
  const doneKey = `tutorial:${lessonId}:done`;
  let done: DeviceProgress = { ...NONE, ...(readJSON<Partial<DeviceProgress>>(doneKey) ?? {}) };
  let status: TutorialStatus | null = null;
  let retry = 0;
  let disposed = false;
  /** The last stage told to the server; progress is sent only when it changes. */
  let lastStage: TutorialStage | '' = '';
  /** The first status check failed; the screen says so and keeps trying. */
  let unreachable = false;
  const shell = el('div', 'tut');
  const hero = el('div', 'tut__hero');
  options.renderHero(hero);
  const root = el('div', 'tut__body');
  shell.append(hero, root);
  host.replaceChildren(shell);

  const finish = (part: keyof DeviceProgress) => {
    done = { ...done, [part]: true };
    writeJSON(doneKey, done);
    paint();
    window.scrollTo?.({ top: 0 });
  };

  // Faded answers go to the teacher's live board.
  root.addEventListener(FADED_EVENT, (e) => {
    const { blockId, parts, rating } = (e as CustomEvent<FadedDetail>).detail;
    void client?.answer(blockId, parts, rating).catch(() => {});
  });

  /** A run of blocks as one scrolling page. */
  function page(blocks: Block[]): HTMLElement {
    const box = el('div', 'tut__page');
    for (const block of blocks) {
      // Side paths belong to the lecture player, and With teacher is the teacher's marker.
      if (isSidePath(block) || block.block_type === 'with_teacher') continue;
      box.append(renderBlock(block, 'student', { lessonId, pageBlocks: blocks }));
    }
    return box;
  }

  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'btn btn--primary tut__next', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      b.disabled = true;
      onClick();
    });
    return b;
  };

  function paint(): void {
    if (disposed) return;
    window.clearTimeout(retry);
    root.replaceChildren();
    hero.hidden = false;
    if (!client) return void root.append(el('p', 'tut__note', 'Open this tutorial from your class page.'));
    if (!status) {
      if (!unreachable) return void root.append(el('p', 'tut__note', 'Loading…'));
      root.append(el('p', 'tut__note', 'Couldn’t reach your teacher’s board. Trying again…'));
      retry = window.setTimeout(() => void refresh(), RETRY_MS);
      return;
    }
    if (status.identity.need === 'initials') return void root.append(claimForm(client));
    // No page for anyone who isn't in a group today.
    if (status.anonymous) return void root.append(el('p', 'tut__note', 'Your teacher hasn’t added a class list yet.'));
    if (!status.group) return void root.append(el('p', 'tut__note', 'This one isn’t for you today.'));
    const stage = studentStage(done, { hasCommon: lesson.blocks.length > 0 });
    if (stage !== lastStage) {
      lastStage = stage;
      void client.progress(stage).catch(() => {});
    }
    if (stage === 'common') {
      root.append(page(lesson.blocks), button('On to the next page', () => finish('common')));
      return;
    }
    hero.hidden = true;
    if (stage === 'waiting') {
      root.append(page(status.group.blocks));
      // A tutorial with no exit questions publishes no quiz, so its page just ends.
      if (lesson.quiz) {
        const quiz = el('div', 'tut__exit');
        quiz.append(mountStudentQuiz(lesson, { classId: options.classId, pickClass: false }));
        root.append(quiz);
      }
      root.append(button(lesson.quiz ? 'I’ve handed it in' : 'I’m finished', () => finish('exit')));
      return;
    }
    root.append(el('p', 'tut__note', 'All done. Nice work.'));
  }

  function claimForm(c: TutorialClient): HTMLElement {
    const form = el('form', 'tut-claim');
    const input = el('input', 'qz-input');
    input.maxLength = 5;
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Your initials');
    const go = el('button', 'btn btn--secondary', 'That’s me');
    go.type = 'submit';
    const err = el('p', 'tut-claim__err');
    err.setAttribute('role', 'alert');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const next = await c.claim(input.value.trim());
        if (disposed) return;
        if (next.identity.need === 'initials') err.textContent = 'Those initials aren’t on your class list. Check them and try again.';
        else {
          status = next;
          paint();
        }
      } catch (error) {
        err.textContent = error instanceof Error ? error.message : 'That didn’t work. Try again.';
      }
    });
    form.append(el('p', '', 'Type your initials so your teacher can see your work.'), input, go, err);
    return form;
  }

  async function refresh(): Promise<void> {
    if (!client || disposed) return;
    try {
      status = await client.status();
      unreachable = false;
    } catch {
      // Say so and try again; once there is a status, a dropped check is not worth a screen.
      if (status) return;
      unreachable = true;
    }
    if (disposed) return;
    paint();
  }

  paint();
  void refresh();
  return {
    dispose() {
      disposed = true;
      window.clearTimeout(retry);
    }
  };
}
