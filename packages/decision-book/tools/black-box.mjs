// packages/decision-book/tools/black-box.mjs
// The black box model (lens, bespoke chart): we see what goes in and what comes out, not the
// working in between. The person lists inputs and outputs, then names what they do not know
// about the inside, and whether they need to.
import { countSlots, hasSlot, nextIndexed, open } from '../../problem-solver/slots.mjs';
import { baseTool, reflected } from '../families/common.mjs';

export const dmBlackBox = baseTool({
  id: 'dm_black_box',
  name: 'The black box model',
  tier: 'lens',
  when: 'A system gives results you can see but not explain: judge it by inputs and outputs, and name what stays hidden.',
  failureModes: ['Inventing a story about the inside instead of saying it is unknown.'],
  steps: [
    { id: 'ends', title: 'What goes in, what comes out', prompt: 'List what you put in and what you see come out.' },
    { id: 'inside', title: 'The hidden part', prompt: 'What happens inside that you cannot see?' }
  ],
  exercise: 'Name one system you rely on without understanding, and one way to check its outputs.',
  pairsWell: ['dm_rumsfeld', 'dm_future'],
  chart: { reflection: 'Whether you need to open the box to decide' }
}, 'oneoff', {
  input: 'Something that goes in',
  output: 'Something that comes out',
  inside: 'What happens inside that you cannot see'
}, {
  nextSlots(run) {
    if (hasSlot(run, 'reflection')) return [];
    const ends = countSlots(run, 'input') >= 1 && countSlots(run, 'output') >= 1;
    return open(nextIndexed(run, 'input', 6), nextIndexed(run, 'output', 6), ends && !hasSlot(run, 'inside') ? 'inside' : null, hasSlot(run, 'inside') ? 'reflection' : null);
  },
  complete(run) {
    return hasSlot(run, 'inside') && reflected(run, 'yes');
  }
});
