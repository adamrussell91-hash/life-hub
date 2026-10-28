import type { Block, LessonRouteRole } from '@/schemas/block';
import type { CaseDoc, CaseDocKind, CaseOption, CasePart, CaseSettings } from './schema';

type CaseLesson = { case?: CaseSettings | undefined };

/** The top-level section that holds the Brief's blocks. */
export const isCaseBriefSection = (b: Block): boolean => b.block_type === 'section' && b.content.case_brief === true;

/** The part a top-level section holds blocks for, if it is a case part section. */
export const casePartOf = (b: Block): string | undefined => (b.block_type === 'section' && typeof b.content.case_part === 'string' ? b.content.case_part : undefined);

/** The section holding one part's blocks. */
export const findCasePartSection = (blocks: Block[], partId: string): Block | undefined => blocks.find((b) => casePartOf(b) === partId);

const filled = (s: string | undefined): boolean => !!s && s.trim().length > 0;

/** Every id already used by a document, part or option, so new ones stay unique within the lesson. */
function usedIds(c: CaseSettings): Set<string> {
  const ids = new Set<string>();
  for (const p of c.parts) {
    ids.add(p.id);
    p.docs.forEach((d) => ids.add(d.id));
  }
  c.transfer?.docs.forEach((d) => ids.add(d.id));
  c.decision?.options.forEach((o) => ids.add(o.id));
  return ids;
}

function nextId(prefix: string, used: Set<string>): string {
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function newDoc(c: CaseSettings, kind: CaseDocKind = 'memo'): CaseDoc {
  const id = nextId('d', usedIds(c));
  return { id, kind, title: `Document ${id.slice(1)}`, source: '', text: '' };
}

export function newPart(c: CaseSettings): CasePart {
  const id = nextId('p', usedIds(c));
  const withPart = { ...c, parts: [...c.parts, { id, title: '', docs: [] }] };
  return { id, title: `Part ${c.parts.length + 1}`, docs: [newDoc(withPart)] };
}

export function newOption(c: CaseSettings): CaseOption {
  const used = usedIds(c);
  const id = nextId('o', used);
  const letter = String.fromCharCode(64 + Math.min(26, (c.decision?.options.length ?? 0) + 1));
  return { id, label: `Option ${letter}`, detail: '' };
}

/** Default settings for a new case lesson, from its place on the unit route. */
export function seedCase(lesson: { route_role?: LessonRouteRole | null | undefined }, pace?: CaseSettings['pace']): CaseSettings {
  const role = lesson.route_role;
  const base: CaseSettings = {
    purpose: '',
    outcomes: [],
    flow: 'A',
    pace: pace ?? (role === 'optional' ? 'own' : 'teacher'),
    support: role === 'support' ? 'guided' : role === 'extension' ? 'open' : 'standard',
    release: 'whole',
    parts: [],
    objections: [],
    decision: { prompt: '', options: [] }
  };
  const first = newPart(base);
  const seeded: CaseSettings = { ...base, parts: [first] };
  if (base.support === 'guided') {
    // A short Flow A: the whole case at once and two options to choose between.
    const options = [newOption(seeded)];
    options.push(newOption({ ...seeded, decision: { prompt: '', options } }));
    seeded.decision = { prompt: '', options };
  }
  if (base.pace === 'own') seeded.objections = [''];
  return seeded;
}

const docIssues = (docs: CaseDoc[]): boolean => docs.length > 0 && docs.every((d) => filled(d.title) && filled(d.text));

/** Publish blockers, in the order the editor tabs run. */
export function caseIssues(lesson: CaseLesson): string[] {
  const c = lesson.case;
  if (!c) return ['Set up the case: add a purpose, a case document, a decision and an outcome.'];
  const out: string[] = [];
  if (!filled(c.purpose)) out.push('Say what students will be able to do on a case they have not seen (Kit).');
  if (c.parts.length === 0 || !c.parts.some((p) => p.docs.length > 0)) out.push('Add at least one case part with a document.');
  else if (c.parts.some((p) => !docIssues(p.docs))) out.push('Every case document needs a title and text.');
  if (!filled(c.decision?.prompt)) out.push('Write the decision question.');
  const options = c.decision?.options.length ?? 0;
  if (c.support === 'guided' && (options < 2 || options > 4)) out.push('A guided case needs 2 to 4 options.');
  else if (options === 1) out.push('Add a second option, or remove the first for a free-text decision.');
  if (!filled(c.outcome?.text)) out.push('Write what actually happened (Outcome).');
  if (!filled(c.outcome?.source)) out.push('The outcome needs a source.');
  if (c.pace === 'own' && (c.objections.length < 1 || c.objections.length > 3 || c.objections.some((o) => !filled(o)))) out.push('At their own pace, add 1 to 3 objections.');
  if (c.release === 'layered' && c.parts.slice(0, -1).some((p) => !filled(p.question))) out.push('Layered release needs a question on every part except the last.');
  const t = c.transfer;
  if (!t || !filled(t.title) || !docIssues(t.docs) || !filled(t.question)) out.push('Write the unseen case: a title, a document and a question (Rules).');
  return out;
}

export type ChecklistItem = { label: string; ok: boolean; tab: 'kit' | 'brief' | 'case' | 'decide' | 'outcome' | 'rules' };

/** The publish checklist the editor shows beside the tabs. */
export function publishChecklist(c: CaseSettings | undefined): ChecklistItem[] {
  const s = c ?? seedCase({});
  const options = s.decision?.options.length ?? 0;
  const items: ChecklistItem[] = [
    { label: 'Purpose set', ok: filled(s.purpose), tab: 'kit' },
    { label: 'Decision question written', ok: filled(s.decision?.prompt), tab: 'brief' },
    { label: 'Case documents added', ok: s.parts.length > 0 && s.parts.every((p) => docIssues(p.docs)), tab: 'case' }
  ];
  if (s.release === 'layered') items.push({ label: 'A question on every part but the last', ok: s.parts.length > 1 && s.parts.slice(0, -1).every((p) => filled(p.question)), tab: 'case' });
  items.push({ label: s.support === 'guided' ? '2 to 4 options' : 'Options set, or a free-text decision', ok: s.support === 'guided' ? options >= 2 && options <= 4 : options !== 1, tab: 'decide' });
  items.push({ label: 'What happened written', ok: filled(s.outcome?.text), tab: 'outcome' });
  items.push({ label: 'Outcome has a source', ok: filled(s.outcome?.source), tab: 'outcome' });
  if (s.pace === 'own') items.push({ label: '1 to 3 objections', ok: s.objections.length >= 1 && s.objections.length <= 3 && s.objections.every(filled), tab: 'outcome' });
  items.push({ label: 'Unseen case written', ok: !!s.transfer && filled(s.transfer.title) && docIssues(s.transfer.docs) && filled(s.transfer.question), tab: 'rules' });
  return items;
}
