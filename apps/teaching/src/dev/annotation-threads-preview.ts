import { renderAnnotationBlock } from '@/blocks/render';
import { threadFocusFixture } from '../../fixtures/annotation-thread-focus';
import '../styles/app.css';

const mount = document.getElementById('mount');
if (mount) {
  const fixture = structuredClone(threadFocusFixture);
  fixture.content.settings.default_layer_id = 'layer_imagery';
  mount.append(renderAnnotationBlock(fixture, 'student'));
}
