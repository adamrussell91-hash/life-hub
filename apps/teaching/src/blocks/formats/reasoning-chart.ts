import type { Block } from '@/schemas/block';
import { loadActivityState, saveActivityState, storageKey } from '../learning-activity';
import { LENS_LEVELS, STUDENT_LEVEL_LABELS, type LensLevel } from '../lenses/types';
import { renderReasoningChart } from '../reasoning/chart';
import { LOGIC_LABELS, reasoningSteps, type LogicSetting } from '../reasoning/content';
import { createReasoningWalk, readWalkState, renderReasoningPrint, type WalkState } from '../reasoning/walk';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
type Mode = 'student' | 'teacher' | 'print';
type Ctx = { lessonId?: string };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Reasoning chart: each question walks its own logic chart, set by the
 * teacher per question. One question's walk is open at a time; the others
 * show their chart so far. Answers stay on this device for the student only.
 */
export function renderReasoningChartFormat(block: QuestionSet, mode: Mode, ctx: Ctx = {}): HTMLElement {
  const wrap = el('div', 'block-question-set block-question-set--reasoning');
  if (block.content.title?.trim()) wrap.append(el('p', 'block-question-set__title', block.content.title));
  const settings = block.content.reasoning ?? { level: 'core' as LensLevel, student_level: true };
  const logicOf = (question: QuestionSet['content']['questions'][number]): LogicSetting => question.logic ?? 'choice';

  if (mode === 'print') {
    const list = el('ol', 'block-question-set__list');
    for (const question of block.content.questions) {
      const li = el('li', 'block-question-set__question');
      li.append(el('p', 'block-question-set__prompt block-body', question.prompt), renderReasoningPrint(logicOf(question), settings.level));
      list.append(li);
    }
    wrap.append(list);
    return wrap;
  }

  const base = mode === 'student' && ctx.lessonId ? `${storageKey(ctx.lessonId, block.id)}.format.reasoning_chart` : undefined;
  let level: LensLevel = settings.level;
  if (base && settings.student_level) {
    const saved = loadActivityState<string>(`${base}.level`);
    if (LENS_LEVELS.includes(saved as LensLevel)) level = saved as LensLevel;
  }
  const states = new Map<string, WalkState>();
  for (const question of block.content.questions) {
    states.set(question.id, readWalkState(base ? loadActivityState(`${base}.${question.id}`) : null));
  }
  let openId = block.content.questions.find((q) => !states.get(q.id)!.done)?.id ?? block.content.questions[0]?.id;

  const levelRow = el('div', 'lens-levels block-reasoning__levels');
  const list = el('ol', 'block-question-set__list');
  wrap.append(levelRow, list);

  function paintLevels(): void {
    levelRow.replaceChildren();
    levelRow.hidden = !settings.student_level;
    levelRow.setAttribute('role', 'group');
    levelRow.setAttribute('aria-label', 'How much help');
    for (const option of LENS_LEVELS) {
      const pick = el('button', 'lens-levels__option', STUDENT_LEVEL_LABELS[option]);
      pick.type = 'button';
      pick.setAttribute('aria-pressed', String(option === level));
      pick.addEventListener('click', () => {
        level = option;
        if (base) saveActivityState(`${base}.level`, option);
        paint();
      });
      levelRow.append(pick);
    }
  }

  function paint(): void {
    paintLevels();
    list.replaceChildren();
    block.content.questions.forEach((question, i) => {
      const state = states.get(question.id)!;
      const logic = logicOf(question);
      const li = el('li', 'block-question-set__question');
      li.dataset.questionId = question.id;
      li.append(el('p', 'block-question-set__prompt block-body', question.prompt));
      const persist = () => { if (base) saveActivityState(`${base}.${question.id}`, state); };
      if (question.id === openId) {
        li.append(createReasoningWalk({
          logic, level, state, persist, preview: mode !== 'student',
          onDone: () => {
            const next = block.content.questions.slice(i + 1).find((q) => !states.get(q.id)!.done);
            if (next) { openId = next.id; paint(); }
          }
        }));
      } else {
        // A closed question shows its chart so far, and a way back in.
        const chosen = logic === 'choice' ? state.choice : logic;
        if (chosen) {
          const steps = reasoningSteps(chosen, level);
          const logics = chosen === 'all_three' ? [...new Set(steps.map((s) => s.logic))] : [chosen];
          for (const each of logics) li.append(renderReasoningChart({ logic: each, steps, answers: state.answers }));
        }
        const meta = el('p', 'kaplan-caption', `${LOGIC_LABELS[logic]}${state.done ? ' · written down' : ''}`);
        const open = el('button', 'btn btn--secondary', state.done ? 'Look again' : 'Work on this question');
        open.type = 'button';
        open.addEventListener('click', () => { openId = question.id; paint(); });
        li.append(meta, open);
      }
      list.append(li);
    });
  }

  paint();
  return wrap;
}
