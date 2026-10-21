// The decision record chart on a real session: a reason's basis, kept on the session by the
// server, reaches the chart through basisOf and setBasis. The session is walked by the scripted
// coach, as the browser walks will be.
import { describe, expect, it } from 'vitest';
import { createChartForRun } from '../../../../packages/decision-book/render/charts';
import type { RecordView } from '../../../../packages/decision-book/render/record';
import type { DmToolRun } from '../../../../packages/decision-book/render/core';
import { RECORD_ID } from '../../../../packages/decision-book/record-slots.mjs';
import { basisOf } from '../../../../packages/decision-book/record.mjs';
import { scriptedCoach } from '../../../../netlify/functions/_shared/problem-solver/scripted-coach.mjs';
import { acceptSuggestion, applyCoachTurn, createSession, say } from '../../../../netlify/functions/_shared/problem-solver/session.mjs';

let n = 0;
const deps = { now: () => '2026-10-21T10:00:00.000Z', newId: () => `id${(n += 1)}` };
type Session = ReturnType<typeof createSession>;

async function step(session: Session, text?: string): Promise<Session> {
  const next = text ? say(session, text, deps) : session;
  return applyCoachTurn(next, await scriptedCoach(next), deps);
}

describe('decision record basis', () => {
  it('shows the Explore node each reason rests on', async () => {
    let s = await step(createSession({ text: 'Should I take the Sydney job offer?', kind: 'decision' }, deps));
    s = await step(s, 'It is about me and I want to understand what I really want.');
    s = await step(s, 'The offer closes Friday and the rent there is double.');
    s = await step(acceptSuggestion(s, deps));
    for (const answer of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.', 'decide']) s = await step(s, answer);
    s = await step(acceptSuggestion(s, deps));
    s = await step(s, 'I decide faster once the urgent part is named.');
    s = await step(acceptSuggestion(s, deps));
    for (const answer of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.']) s = await step(s, answer);

    const run = s.steps.decide.runs.find((item: { tool: string }) => item.tool === RECORD_ID) as unknown as DmToolRun;
    const view = createChartForRun(run) as unknown as RecordView;
    view.update(run);
    view.setBasis(basisOf(s));
    const reason = run.nodes.find((node) => node.slot === 'reason:1')!;
    expect(view.el.querySelector(`.dm-entry[data-node="${reason.id}"] .dm-entry__meta`)!.textContent).toBe('Rests on The Eisenhower matrix: Reply to the Sydney offer letter, do immediately');
  });
});
