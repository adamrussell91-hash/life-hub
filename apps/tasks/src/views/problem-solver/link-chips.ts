import './link-chips.css';
import { el } from '@/views/hub-kit';
import { apiGet } from '@/api/client';
import { changeBookApi, collaborationBookApi, communicationBookApi, decisionBookApi, gearShifterApi, problemSolverApi, rulesBookApi, type PsLinkedSession } from './api';
import { threadsApi } from '../thinking/api';

type LinkedApi = { linked: (ref: string) => Promise<PsLinkedSession[]> };
/** A tool's chips: where they open, the review step a review chip opens at, and the tool's name. */
type ChipTool = { hash: string; reviewStep: string; name: string; tone: string };

/** One chip per session. A review chip opens its session at the review step. */
function chipsFor(sessions: PsLinkedSession[], tool: ChipTool): HTMLAnchorElement[] {
  return sessions.map((s) => {
    const review = s.role === 'review';
    const chip = el('a', `ps-linkchip ps-linkchip--${tool.tone}`) as HTMLAnchorElement;
    chip.href = `${tool.hash}?id=${encodeURIComponent(s.id)}${review ? `&step=${tool.reviewStep}` : ''}`;
    const dot = el('span', 'ps-linkchip__dot');
    dot.setAttribute('aria-hidden', 'true');
    dot.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    chip.append(dot, document.createTextNode(`${review ? `Review in ${tool.name}` : tool.name}: ${s.title}`));
    return chip;
  });
}

/**
 * Chips on a task or project page for one tool's sessions that link to it. Hidden until at
 * least one session is found; a failed lookup leaves it hidden.
 */
function sessionChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi, tool: ChipTool): HTMLSpanElement {
  const host = el('span', 'ps-linkchips') as HTMLSpanElement;
  host.hidden = true;
  void api.linked(`${ref.kind}:${ref.id}`).then((sessions) => {
    host.append(...chipsFor(sessions, tool));
    host.hidden = host.childElementCount === 0;
  }, () => undefined);
  return host;
}

/** Chips for the Problem Solver sessions that link to a task or project. */
export function problemSolverChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = problemSolverApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/problem-solver', reviewStep: 'improve', name: 'Problem Solver', tone: 'ps' });
}

/** Chips for the Decision Maker decisions that link to a task or project (a record page, a first step, a review). */
export function decisionMakerChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = decisionBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/decision-maker', reviewStep: 'review', name: 'Decision Maker', tone: 'dm' });
}

/** Chips for the Gear Shifter sessions that link to a task or project (an action record page, a next action, a check-back). */
export function gearShifterChips(ref: { kind: 'task' | 'project'; id: string }, api: LinkedApi = gearShifterApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/gear-shifter', reviewStep: 'review', name: 'Gear Shifter', tone: 'gt' });
}

type Ref = { kind: 'task' | 'project'; id: string };

/** Chips for the Wayfinder sessions that link to a task or project. */
export function wayfinderChips(ref: Ref, api: LinkedApi = rulesBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/rules-book', reviewStep: 'review', name: 'Wayfinder', tone: 'rb' });
}

/** Chips for the Change Navigator sessions that link to a task or project. */
export function changeNavigatorChips(ref: Ref, api: LinkedApi = changeBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/change-book', reviewStep: 'review', name: 'Change Navigator', tone: 'ch' });
}

/** Chips for the Team Builder sessions that link to a task or project. */
export function teamBuilderChips(ref: Ref, api: LinkedApi = collaborationBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/collaboration-book', reviewStep: 'review', name: 'Team Builder', tone: 'cb' });
}

/** Chips for the Conversation Guide sessions that link to a task or project. */
export function conversationGuideChips(ref: Ref, api: LinkedApi = communicationBookApi): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/communication-book', reviewStep: 'review', name: 'Conversation Guide', tone: 'cm' });
}

/** Thought Starter keeps a notebook, not sessions, so this stays hidden until it ever links one. */
export const questionBookLinked: LinkedApi = {
  linked: (r) => apiGet<{ sessions: PsLinkedSession[] }>(`/api/question-book?linked=${encodeURIComponent(r)}`).then((x) => x.sessions)
};
export function thoughtStarterChips(ref: Ref, api: LinkedApi = questionBookLinked): HTMLSpanElement {
  return sessionChips(ref, api, { hash: '#/question-book', reviewStep: 'review', name: 'Thought Starter', tone: 'qb' });
}

/** A thread's chip: "Thread: title", linking to the thread view. Hidden for a thread of one session. */
export function threadChip(threadId: string, load: (id: string) => Promise<{ title: string; sessions: { role: string }[] }> = threadsApi.get): Promise<HTMLAnchorElement | null> {
  return load(threadId).then((t) => {
    if (!(t.sessions.length > 1 || t.sessions.some((s) => s.role === 'detour'))) return null;
    const chip = el('a', 'ps-linkchip ps-linkchip--thread') as HTMLAnchorElement;
    chip.href = `#/think/${encodeURIComponent(threadId)}`;
    const dot = el('span', 'ps-linkchip__dot');
    dot.setAttribute('aria-hidden', 'true');
    dot.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
    chip.append(dot, document.createTextNode(`Thread: ${t.title}`));
    return chip;
  }, () => null);
}

/**
 * Every thinking tool's chips for a task or project page, in one row: the eight tools in nav
 * order, then a chip for each listed thread those sessions belong to (once per thread). A tool
 * that cannot be reached leaves its chips out.
 */
export function thinkingChips(ref: Ref, apis: { [tone: string]: LinkedApi } = {}): HTMLSpanElement {
  const host = el('span', 'ps-linkchips') as HTMLSpanElement;
  host.hidden = true;
  const tools: Array<[ChipTool, LinkedApi]> = [
    [{ hash: '#/problem-solver', reviewStep: 'improve', name: 'Problem Solver', tone: 'ps' }, apis.ps ?? problemSolverApi],
    [{ hash: '#/decision-maker', reviewStep: 'review', name: 'Decision Maker', tone: 'dm' }, apis.dm ?? decisionBookApi],
    [{ hash: '#/gear-shifter', reviewStep: 'review', name: 'Gear Shifter', tone: 'gt' }, apis.gt ?? gearShifterApi],
    [{ hash: '#/rules-book', reviewStep: 'review', name: 'Wayfinder', tone: 'rb' }, apis.rb ?? rulesBookApi],
    [{ hash: '#/change-book', reviewStep: 'review', name: 'Change Navigator', tone: 'ch' }, apis.ch ?? changeBookApi],
    [{ hash: '#/collaboration-book', reviewStep: 'review', name: 'Team Builder', tone: 'cb' }, apis.cb ?? collaborationBookApi],
    [{ hash: '#/communication-book', reviewStep: 'review', name: 'Conversation Guide', tone: 'cm' }, apis.cm ?? communicationBookApi],
    [{ hash: '#/question-book', reviewStep: 'review', name: 'Thought Starter', tone: 'qb' }, apis.qb ?? questionBookLinked]
  ];
  const key = `${ref.kind}:${ref.id}`;
  void Promise.all(tools.map(([tool, api]) => api.linked(key).then((rows) => ({ tool, rows }), () => ({ tool, rows: [] as PsLinkedSession[] })))).then(async (results) => {
    host.append(...results.flatMap(({ tool, rows }) => chipsFor(rows, tool)));
    const ids = [...new Set(results.flatMap(({ rows }) => rows.map((r) => r.threadId).filter((id): id is string => Boolean(id))))];
    const chips = (await Promise.all(ids.map((id) => threadChip(id)))).filter((c): c is HTMLAnchorElement => c !== null);
    host.append(...chips);
    host.hidden = host.childElementCount === 0;
  });
  return host;
}
