// packages/decision-book/tools/outside-box.mjs
// Thinking outside the box (lens, bespoke chart): the nine-dot puzzle. Join nine dots in a
// 3×3 square with four straight lines without lifting the pen; it only works once the lines
// leave the square. The person says how they would try it (`attempt`), the chart can show one
// way, and they name the box they had assumed around their own decision (`assumption`).
import { hasSlot, open } from '../../problem-solver/slots.mjs';
import { baseTool, reflected } from '../families/common.mjs';

export const dmOutsideBox = baseTool({
  id: 'dm_outside_box',
  name: 'Thinking outside the box',
  tier: 'lens',
  when: 'The options feel fixed by limits nobody has questioned: test which edges are real.',
  failureModes: ['Treating "think differently" as the answer instead of naming the assumed limit.'],
  steps: [
    { id: 'attempt', title: 'Try the puzzle', prompt: 'Join the nine dots with four straight lines without lifting the pen.' },
    { id: 'assumption', title: 'Name your box', prompt: 'Which limit around this decision have you assumed rather than checked?' }
  ],
  chart: { reflection: 'What changes if that limit is not real' }
}, 'oneoff', {
  attempt: 'How you would join the dots, or where you got stuck',
  assumption: 'A limit you had assumed around the decision'
}, {
  nextSlots(run) {
    if (hasSlot(run, 'reflection')) return [];
    return open(hasSlot(run, 'attempt') ? null : 'attempt', hasSlot(run, 'assumption') ? null : 'assumption', hasSlot(run, 'assumption') ? 'reflection' : null);
  },
  complete(run) {
    return hasSlot(run, 'assumption') && reflected(run, 'yes');
  }
});
