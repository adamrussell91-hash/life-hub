// apps/tasks/src/views/thinking/start.ts
// Starting a thread from the front door: make the thread, make the session in the chosen tool
// (its first message is the situation, so the coach frames from it), join the two, and say
// where to open. Thought Starter keeps a notebook, not sessions, so it opens as it is.
import { createSessionApi } from '../problem-solver/api';
import { threadsApi } from './api';
import { option, toolRoute } from './map';

const APIS: Record<string, ReturnType<typeof createSessionApi>> = {
  'problem-solver': createSessionApi('/api/problem-solver'),
  'decision-book': createSessionApi('/api/decision-book'),
  'get-things-done': createSessionApi('/api/get-things-done'),
  'rules-book': createSessionApi('/api/rules-book'),
  'change-book': createSessionApi('/api/change-book'),
  'collaboration-book': createSessionApi('/api/collaboration-book'),
  'communication-book': createSessionApi('/api/communication-book')
};

/** The session API for an engine tool, or null (Thought Starter and protocols have none). */
export const sessionApiFor = (tool: string): ReturnType<typeof createSessionApi> | null => APIS[tool] ?? null;

/** True when an option can start a thread from the front door (an engine tool or model, or Thought Starter). */
export function canStartHere(optionId: string): boolean {
  const o = option(optionId);
  return Boolean(o && o.kind !== 'protocol' && (APIS[o.tool] || o.tool === 'question-book'));
}

/** The hash to open for a started option. */
export async function startFromFrontDoor(situation: string, optionId: string): Promise<string> {
  const o = option(optionId);
  if (!o || o.kind === 'protocol') throw new Error('That option starts inside a thinking tool.');
  if (o.tool === 'question-book') return o.kind === 'chapter' ? `#/question-book?chapter=${encodeURIComponent(o.id)}` : '#/question-book';
  const api = APIS[o.tool];
  const route = toolRoute(o.tool);
  if (!api || !route) throw new Error('That tool cannot start here.');
  const thread = await threadsApi.create({ situation });
  const session = await api.create({
    text: situation,
    title: thread.title,
    threadId: thread.id,
    ...(o.kind === 'model' && !o.id.startsWith('ps:') ? { startModel: o.id } : {})
  });
  await threadsApi.addSession(thread, { kind: 'tool', tool: o.tool, sessionId: session.id, role: 'home' });
  return `${route}?id=${encodeURIComponent(session.id)}`;
}
