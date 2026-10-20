import 'katex/dist/katex.min.css';
import { startHubMotion } from '../../design-kit/js/hub-motion.js';
import { NEW_BLOCK_TYPES } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { everyBlockFixture } from '../../fixtures/every-block';

/**
 * Every lesson block type, filled, for the block anatomy browser test and for
 * eyeballing the shared grammar. ?only=a,b limits the list; ?mode=teacher.
 */
const mount = document.getElementById('mount')!;
const params = new URLSearchParams(location.search);
const only = params.get('only')?.split(',');
const mode = params.get('mode') === 'teacher' ? 'teacher' : 'student';

for (const type of NEW_BLOCK_TYPES) {
  if (only && !only.includes(type)) continue;
  const label = document.createElement('p');
  label.className = 'anatomy-page__label';
  label.textContent = type;
  const block = everyBlockFixture(type);
  const rendered = renderBlock(block, mode, { lessonId: 'anatomy' });
  rendered.dataset.anatomyType = type;
  mount.append(label, rendered);
}
startHubMotion(document);
document.body.dataset.ready = 'true';
