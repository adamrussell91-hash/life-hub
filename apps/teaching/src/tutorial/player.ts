import type { PublishedLesson } from '@/schemas/published-lesson';
import { el, readJSON, writeJSON } from '@/quiz/dom';
import { mountLecturePlayer, type LecturePlayerHandle } from '@/lecture/player';
import { mountStudentQuiz } from '@/quiz/student-quiz';
import { FADED_EVENT, type FadedDetail } from '@/blocks/faded-example';
import { splitAtTeacher } from './model';
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

const POLL_MS = 5000;
const NONE: DeviceProgress = { common: false, before: false, after: false, exit: false };

/**
 * A student's tutorial: Common (if any), their group's tab up to With teacher,
 * a calm wait until the teacher has sat with them, You do, then the exit check.
 * Each stretch plays in the lecture player; this file only moves between them.
 */
export function mountTutorialPlayer(host: HTMLElement, options: TutorialPlayerOptions): { dispose(): void } {
  const { lesson, client } = options;
  const lessonId = lesson.lesson_id;
  const doneKey = `tutorial:${lessonId}:done`;
  let done: DeviceProgress = { ...NONE, ...(readJSON<Partial<DeviceProgress>>(doneKey) ?? {}) };
  let status: TutorialStatus | null = null;
  let player: LecturePlayerHandle | null = null;
  let poll = 0;
  let disposed = false;
  /** Bumped on every paint, so a check-in sent before the screen changed can't repaint over it. */
  let paintId = 0;
  /** The last stage told to the server; progress is sent only when it changes. */
  let lastStage: TutorialStage | '' = '';
  const shell = el('div', 'tut');
  // Segments skip the lecture title card, so the hero sits once above every stage.
  const hero = el('div', 'tut__hero');
  options.renderHero(hero);
  const root = el('div', 'tut__body');
  shell.append(hero, root);
  host.replaceChildren(shell);

  const finish = (part: keyof DeviceProgress) => {
    done = { ...done, [part]: true };
    writeJSON(doneKey, done);
    paint();
  };

  // Faded answers go to the teacher's live board.
  root.addEventListener(FADED_EVENT, (e) => {
    const { blockId, parts, rating } = (e as CustomEvent<FadedDetail>).detail;
    void client?.answer(blockId, parts, rating).catch(() => {});
  });

  function segment(blocks: PublishedLesson['blocks'], key: string, doneLabel: string, part: keyof DeviceProgress): void {
    const stage = el('div', 'tut__segment');
    root.append(stage);
    player = mountLecturePlayer(stage, {
      lessonId,
      title: lesson.title,
      blocks,
      client: client ? client.forPlayer() : null,
      renderHero: () => {},
      segment: { saveKey: `tutorial:${lessonId}:${key}`, doneLabel, onDone: () => finish(part) }
    });
  }

  function paint(): void {
    if (disposed) return;
    paintId += 1;
    window.clearTimeout(poll);
    player?.dispose();
    player = null;
    root.replaceChildren();
    if (!client) return void root.append(el('p', 'tut__note', 'Open this tutorial from your class page.'));
    if (!status) return void root.append(el('p', 'tut__note', 'Loading…'));
    if (status.identity.need === 'initials') return void root.append(claimForm(client));
    // No lecture segment and no ✋ for anyone who isn't in a group today.
    if (status.anonymous) return void root.append(el('p', 'tut__note', 'Your teacher hasn’t added a class list yet.'));
    if (!status.group) return void root.append(el('p', 'tut__note', 'This one isn’t for you today.'));
    const tab = splitAtTeacher(status.group.blocks);
    const stage = studentStage(done, { unlocked: status.unlocked, hasCommon: lesson.blocks.length > 0, hasAfter: tab.after.length > 0 });
    if (stage !== lastStage) {
      lastStage = stage;
      void client.progress(stage).catch(() => {});
    }
    root.append(el('p', 'tut__goal', status.group.goal));
    if (stage === 'common') return segment(lesson.blocks, 'common', 'On to your group', 'common');
    if (stage === 'before') return segment(tab.before, 'before', 'I’m ready for my teacher', 'before');
    if (stage === 'waiting') return waiting(status);
    if (stage === 'after') return segment(tab.after, 'after', 'On to the check', 'after');
    // A tutorial with no exit questions publishes no quiz, so there's nothing to hand in.
    if (stage === 'exit' && lesson.quiz) {
      const quiz = el('div', 'tut__exit');
      quiz.append(mountStudentQuiz(lesson, { classId: options.classId, pickClass: false }));
      const end = el('button', 'btn btn--secondary tut__finish', 'I’ve handed it in');
      end.type = 'button';
      end.addEventListener('click', () => finish('exit'));
      root.append(quiz, end);
      return;
    }
    root.append(el('p', 'tut__note', 'All done. Nice work.'));
  }

  /** The With teacher screen. It checks in every few seconds, only while it's showing. */
  function waiting(s: TutorialStatus): void {
    const box = el('section', 'tut-wait');
    box.append(el('h2', 'tut-wait__title', s.sitting ? 'Your teacher is with your group.' : 'Your teacher will join you here.'));
    if (s.sitting && s.shown) {
      // The answer the teacher put up, with no name on it.
      const shown = el('blockquote', 'tut-shown');
      shown.append(el('p', 'tut-shown__label', s.shown.label), el('p', 'tut-shown__text', s.shown.text));
      box.append(shown);
    }
    root.append(box);
    poll = window.setTimeout(() => void refresh(), POLL_MS);
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
    const asked = paintId;
    let next: TutorialStatus | null = null;
    try {
      next = await client.status();
    } catch {
      // A dropped check-in tries again on the next tick.
    }
    if (disposed || asked !== paintId) return;
    if (next) status = next;
    paint();
  }

  paint();
  void refresh();
  return {
    dispose() {
      disposed = true;
      window.clearTimeout(poll);
      player?.dispose();
      player = null;
    }
  };
}
