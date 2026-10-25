import type { Block, GroupSet } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { mapBlockById } from '@/blocks/block-pulse';
import { button, el } from '@/quiz/dom';

/**
 * The strip on a group set section: who it is for, Refresh, Write it myself
 * and Ann drafts. It rides on the canvas row like the lecture tools, so the
 * section and its question cards are edited as usual.
 */

/** Ann writing a handful of questions has cost about this much (see the quiz builder runs). */
export const ANN_SET_COST = 'about A$0.35';

type Section = Extract<Block, { block_type: 'section' }>;
const isSet = (block: Block): block is Section => block.block_type === 'section' && !!(block.content as { group_set?: GroupSet }).group_set;

export const refreshedStudents = (inSet: string[], active: string[]): string[] => [...new Set([...inSet, ...active])];

export const blankQuestions = (n: number, idFactory: () => string): Block[] => Array.from({ length: n }, () => createBlock('quiz_question', idFactory()));

export type BriefInput = { sectionId: string; config: GroupSet; label: (tag: string) => string; lessonTitle: string; mistakes: string[] };

/** What Ann is told. No names or initials leave the app. */
export function groupSetBrief(i: BriefInput): string {
  const need = i.config.tags.map(i.label).join(', ');
  return [
    'Go ahead and build without a plan: the teacher has already confirmed this group set.',
    `Fill the group set section ${i.sectionId} in "${i.lessonTitle}" with ${i.config.target} quiz_question blocks for students working on ${need}.`,
    'Use propose_replace_section on that section. Keep its id, its title and its group_set exactly as they are; only replace its blocks.',
    'Write the questions on this lesson’s own texts and content, so they sit naturally among the quiz’s other questions.',
    i.mistakes.length ? `These students made these mistakes:\n${i.mistakes.join('\n')}` : `These students scored low on ${need}.`,
    `Tag every question so its results land on ${i.config.tags.join(', ')}: for a technique use quote_technique or spot_technique with technique_id on the option that names it.`,
    'Keep each question to a single technique or idea.'
  ].join('\n\n');
}

export type GroupSetToolsOptions = {
  getBlocks: () => Block[];
  onBlocks: (blocks: Block[]) => void;
  idFactory: () => string;
  /** Initials by student id, for the strip. */
  names: () => ReadonlyMap<string, string>;
  /** The group's active members now (loads the markbook). */
  refreshMembers: (config: GroupSet) => Promise<string[] | void>;
  startAnn: (sectionId: string, config: GroupSet) => void;
  onError?: (error: unknown) => void;
};

export function createGroupSetTools(o: GroupSetToolsOptions) {
  const patchSet = (id: string, fn: (block: Section) => Block) => o.onBlocks(mapBlockById(o.getBlocks(), id, (b) => (isSet(b) ? fn(b) : b)));

  return {
    decorate(row: HTMLElement, block: Block): void {
      row.querySelector(':scope > .qz-gs-strip')?.remove();
      if (!isSet(block)) return;
      const config = (block.content as { group_set: GroupSet }).group_set;
      const strip = el('div', 'qz-gs-strip');
      const n = config.students.length;
      const who = config.students.map((s) => o.names().get(s) ?? '–').join(', ');
      strip.append(el('p', 'qz-gs-strip__for', `For ${config.name} · ${n} ${n === 1 ? 'student' : 'students'}`), el('p', 'qz-gs-strip__who', who));
      const tools = el('div', 'qz-gs-strip__tools');
      const refresh = button('Refresh', 'ghost', async () => {
        try {
          const active = await o.refreshMembers(config);
          if (!active) return;
          patchSet(block.id, (b) => ({ ...b, content: { ...b.content, group_set: { ...config, students: refreshedStudents(config.students, active) } } }) as Block);
        } catch (error) {
          o.onError?.(error);
        }
      });
      refresh.classList.add('qz-gs-strip__refresh');
      const have = (block.content.blocks ?? []).filter((b) => b.block_type === 'quiz_question').length;
      const write = button('Write it myself', 'ghost', () =>
        patchSet(block.id, (b) => ({ ...b, content: { ...b.content, blocks: [...(b.content.blocks ?? []), ...blankQuestions(config.target - have, o.idFactory)] } }) as Block)
      );
      write.classList.add('qz-gs-strip__write');
      write.disabled = have >= config.target;
      const confirm = el('div', 'qz-gs-strip__confirm');
      confirm.hidden = true;
      const ann = button('Ann drafts', 'secondary', () => {
        confirm.hidden = false;
        const go = button(`Ann writes ${config.target} (${ANN_SET_COST})`, 'primary', () => {
          confirm.hidden = true;
          o.startAnn(block.id, config);
        });
        go.classList.add('qz-gs-strip__go');
        const cancel = button('Not now', 'ghost', () => {
          confirm.hidden = true;
        });
        confirm.replaceChildren(el('p', 'qz-note', `Ann writes ${config.target} questions on this lesson for ${config.name}, ${ANN_SET_COST}. You review them before publishing.`), go, cancel);
      });
      ann.classList.add('qz-gs-strip__ann');
      tools.append(refresh, write, ann);
      strip.append(tools, confirm);
      row.prepend(strip);
    }
  };
}
