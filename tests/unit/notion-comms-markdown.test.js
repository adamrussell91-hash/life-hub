import test from 'node:test';
import assert from 'node:assert/strict';
import { markdownToBlocks } from '../../scripts/lib/notion-comms/markdown-to-blocks.mjs';

test('markdownToBlocks preserves headings and extracts action-item checkboxes safely', () => {
  const result = markdownToBlocks('# Sample\nDate: today\n\n## Action Items\n- [ ] I will send <notes>\n- [x] Sam K. will reply');
  assert.equal(result.blocks[0].content.html, '<p><em>Imported from Notion</em></p>');
  assert.match(result.blocks[1].content.html, /<h2>Action Items<\/h2>/);
  assert.deepEqual(result.todos, [{ text: 'I will send <notes>', checked: false, heading: 'Action Items' }, { text: 'Sam K. will reply', checked: true, heading: 'Action Items' }]);
});
